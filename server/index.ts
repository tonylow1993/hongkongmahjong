import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server, Socket } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  createNewGame,
  discardTile,
  getLegalDiscards,
  passAllClaims,
  redealRound,
  selfAction,
  startNextRound,
  submitClaim,
} from '../src/game/engine';
import { createAI, type AIAgent } from '../src/ai';
import { askModel, claimFromAct, modelReady, selfFromAct, tileFromAct } from '../src/ai/trainedClient';
import type { ClaimOption, GameState } from '../src/game/types';
import type {
  ClientToServerEvents,
  RoomPlayer,
  RoomState,
  ServerToClientEvents,
} from './types';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DIST_DIR = path.resolve(__dirname, '../dist');

// Simple static file handler for production SPA
function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  let reqPath = req.url?.split('?')[0] || '/';
  if (reqPath === '/') reqPath = '/index.html';
  let filePath = path.join(DIST_DIR, reqPath);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const mimeMap: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.png': 'image/png',
  };

  const contentType = mimeMap[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: '*' },
});

// Single global room
const singleRoom: RoomState = {
  roomId: 'hk-mahjong-room-1',
  players: [null, null, null, null],
  gameStarted: false,
  gameState: null,
};

// AI Engine instance for filling empty seats
const fallbackAI: AIAgent = createAI('learned-v1');
let aiThinking = false;

function broadcastRoom() {
  for (const socket of io.sockets.sockets.values()) {
    const seat = singleRoom.players.findIndex(
      (p) => p && p.socketId === socket.id,
    );
    const isHost = seat !== -1 && singleRoom.players[seat]?.isHost === true;
    socket.emit('roomState', {
      room: singleRoom,
      yourSeat: seat === -1 ? null : seat,
      isHost,
    });
  }
}

function maskGameStateForSeat(
  state: GameState,
  targetSeat: number | null,
): GameState {
  if (state.phase === 'ended') {
    // 遊戲結算時，公佈所有人手牌
    return state;
  }

  // 深拷貝手牌資訊，只保留 targetSeat 的牌；其他家手牌替換為隱藏牌（保留張數，但隱藏花色與數值）
  const maskedPlayers = state.players.map((p, idx) => {
    if (targetSeat !== null && idx === targetSeat) {
      return p;
    }
    // 對手手牌遮蔽
    const hiddenHand = p.hand.map((t, tidx) => ({
      id: `hidden-${idx}-${tidx}`,
      suit: 'man' as const, // 假花色，前端 showHand=false 不會顯示具體牌面
      value: 1,
    }));
    return {
      ...p,
      hand: hiddenHand,
    };
  });

  // 遮蔽摸牌：如果當前摸牌者不是自己，隱藏 drawnTile
  const maskedDrawnTile =
    targetSeat !== null && state.currentPlayer === targetSeat
      ? state.drawnTile
      : null;

  // 遮蔽叫牌選項：只發送給屬於自己的 claimOptions（Record<number, ClaimOption[]>）
  const maskedClaimOptions: Record<number, ClaimOption[]> = {};
  if (
    targetSeat !== null &&
    state.claimOptions &&
    state.claimOptions[targetSeat]
  ) {
    maskedClaimOptions[targetSeat] = state.claimOptions[targetSeat];
  }

  return {
    ...state,
    players: maskedPlayers,
    drawnTile: maskedDrawnTile,
    claimOptions: maskedClaimOptions,
  };
}

function broadcastGameState() {
  if (!singleRoom.gameState || !singleRoom.gameStarted) return;

  for (const socket of io.sockets.sockets.values()) {
    const seat = singleRoom.players.findIndex(
      (p) => p && p.socketId === socket.id,
    );
    // 未入座的旁觀訪客不發送遊戲牌局更新，節省服務器運算與網絡傳輸資源
    if (seat === -1) {
      continue;
    }
    const clientState = maskGameStateForSeat(
      singleRoom.gameState,
      seat,
    );
    socket.emit('gameStateUpdate', clientState);
  }
}

const AI_ACTION_DELAY_MS = 1500;

async function triggerAITurn() {
  if (!singleRoom.gameState || !singleRoom.gameStarted || aiThinking) return;
  const state = singleRoom.gameState;
  if (state.phase === 'ended') return;

  const activeSeat = state.currentPlayer;
  const activePlayer = singleRoom.players[activeSeat];

  // 1. Self turn (Discard or SelfAction like Kong/Win/Zimo)
  if (state.phase === 'discard') {
    if (!activePlayer || !activePlayer.isAI) return; // Wait for human player

    aiThinking = true;
    try {
      const selfOpts = state.claimOptions[activeSeat] ?? [];
      const hasModel = await modelReady();

      if (hasModel) {
        try {
          const act = await askModel(state, activeSeat, 'level-3');
          if (act) {
            const selfOpt = selfFromAct(selfOpts, act);
            if (selfOpt) {
              singleRoom.gameState = selfAction(state, selfOpt);
              broadcastGameState();
              aiThinking = false;
              setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
              return;
            }
            const tile = tileFromAct(state.players[activeSeat].hand, act);
            if (tile) {
              singleRoom.gameState = discardTile(state, tile.id);
              broadcastGameState();
              aiThinking = false;
              setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
              return;
            }
          }
        } catch (e) {
          console.warn('[AI] Model error, fallback to rule engine:', e);
        }
      }

      // Rule-based fallback
      const selfWin = selfOpts.find((o) => o.kind === 'win');
      if (selfWin) {
        singleRoom.gameState = selfAction(state, selfWin);
        broadcastGameState();
        aiThinking = false;
        setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
        return;
      }
      const selfKong = selfOpts.find((o) => o.kind === 'kong');
      if (selfKong) {
        singleRoom.gameState = selfAction(state, selfKong);
        broadcastGameState();
        aiThinking = false;
        setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
        return;
      }

      const legal = getLegalDiscards(state, activeSeat);
      const chosenTile = fallbackAI.chooseDiscard(state, activeSeat, legal);
      const discardId = chosenTile ? chosenTile.id : (legal[0]?.id || state.players[activeSeat].hand[0]?.id);
      singleRoom.gameState = discardTile(state, discardId);
      broadcastGameState();
    } finally {
      aiThinking = false;
    }
    setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
    return;
  }

  // 2. Claim Phase (Chi, Pong, Gang, Hu from discard)
  if (state.phase === 'claim') {
    // Check if any human player still has pending claim options
    let waitingForHuman = false;
    for (const seatStr of Object.keys(state.claimOptions)) {
      const s = Number(seatStr);
      const p = singleRoom.players[s];
      if (p && !p.isAI && state.pendingClaims[s] === undefined) {
        waitingForHuman = true;
        break;
      }
    }

    if (waitingForHuman) {
      // Do not auto-step while humans are deciding (No time limit)
      return;
    }

    // All active claimers are AI; resolve claims
    aiThinking = true;
    try {
      const hasModel = await modelReady();

      for (const seatStr of Object.keys(state.claimOptions)) {
        const s = Number(seatStr);
        const p = singleRoom.players[s];
        if (state.pendingClaims[s] !== undefined) continue;
        if (!p || !p.isAI) continue;

        const opts = state.claimOptions[s];
        if (!opts || opts.length === 0) {
          singleRoom.gameState = submitClaim(singleRoom.gameState!, s, { kind: 'pass' });
          continue;
        }

        let chosenOpt: ClaimOption | null = null;
        if (hasModel) {
          try {
            const act = await askModel(singleRoom.gameState!, s, 'level-3');
            if (act) chosenOpt = claimFromAct(opts, act);
          } catch (e) {
            // fallback
          }
        }
        if (!chosenOpt) {
          chosenOpt = fallbackAI.chooseClaim(singleRoom.gameState!, s, opts);
        }

        singleRoom.gameState = submitClaim(
          singleRoom.gameState!,
          s,
          chosenOpt || { kind: 'pass' },
        );
      }

      broadcastGameState();
    } finally {
      aiThinking = false;
    }
    setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
  }
}

io.on('connection', (socket: Socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // 如果房間中已經沒有任何活躍連線的真人玩家，自動重置房間為等待大堂
  const hasActiveHuman = singleRoom.players.some(
    (p) => p && !p.isAI && p.connected && !p.name.includes('(離線代打)'),
  );
  if (!hasActiveHuman && singleRoom.gameStarted) {
    console.log('[Room] No active human players. Resetting room state.');
    singleRoom.gameStarted = false;
    singleRoom.gameState = null;
    singleRoom.players = [null, null, null, null];
  }

  // Send initial room state
  broadcastRoom();

  socket.on('identify', ({ token }: { token: string }) => {
    if (!token) return;
    const seat = singleRoom.players.findIndex((p) => p && p.token === token);
    if (seat !== -1 && singleRoom.players[seat]) {
      const p = singleRoom.players[seat]!;
      p.socketId = socket.id;
      p.connected = true;
      p.isAI = false;
      if (p.name.includes(' (離線代打)')) {
        p.name = p.name.replace(' (離線代打)', '');
      }
      if (singleRoom.gameState) {
        singleRoom.gameState.players[seat].isHuman = true;
        singleRoom.gameState.players[seat].name = p.name;
      }
      console.log(`[Room] Player ${p.name} re-identified to seat ${seat} via token`);
      broadcastRoom();
      if (singleRoom.gameState) {
        const clientState = maskGameStateForSeat(singleRoom.gameState, seat);
        socket.emit('gameStateUpdate', clientState);
      }
    }
  });

  socket.on('join', ({ name, token }: { name: string; token?: string }) => {
    // 檢查是否已在房間中（Token 優先或 SocketId 重連判定）
    let existingSeat = -1;
    if (token) {
      existingSeat = singleRoom.players.findIndex((p) => p && p.token === token);
    }
    if (existingSeat === -1) {
      existingSeat = singleRoom.players.findIndex((p) => p && p.socketId === socket.id);
    }

    if (existingSeat !== -1 && singleRoom.players[existingSeat]) {
      const p = singleRoom.players[existingSeat]!;
      p.socketId = socket.id;
      if (token) p.token = token;
      p.connected = true;
      p.isAI = false;
      p.name = name.trim() || p.name;
      if (p.name.includes(' (離線代打)')) {
        p.name = p.name.replace(' (離線代打)', '');
      }
      if (singleRoom.gameState) {
        singleRoom.gameState.players[existingSeat].isHuman = true;
        singleRoom.gameState.players[existingSeat].name = p.name;
      }
      broadcastRoom();
      if (singleRoom.gameState) {
        const clientState = maskGameStateForSeat(singleRoom.gameState, existingSeat);
        socket.emit('gameStateUpdate', clientState);
      }
      return;
    }

    // 若遊戲已經開始（In-Game），外部訪客不得加入或旁觀以節省資源
    if (singleRoom.gameStarted) {
      socket.emit('error', '牌局已開始，房間已鎖定！暫不開放中途加入或旁觀。');
      return;
    }

    // Find first empty seat
    const emptySeat = singleRoom.players.findIndex((p) => p === null);
    if (emptySeat === -1) {
      socket.emit('error', '房間已滿 4 人，無法加入！');
      return;
    }

    const isFirstPlayer = singleRoom.players.every((p) => p === null);
    singleRoom.players[emptySeat] = {
      socketId: socket.id,
      token,
      name: name.trim() || `玩家 ${emptySeat + 1}`,
      seat: emptySeat,
      isHost: isFirstPlayer,
      isAI: false,
      connected: true,
    };

    console.log(`[Room] Player ${name} joined seat ${emptySeat} (Host: ${isFirstPlayer})`);
    broadcastRoom();
    if (singleRoom.gameState) {
      const clientState = maskGameStateForSeat(singleRoom.gameState, emptySeat);
      socket.emit('gameStateUpdate', clientState);
    }
  });

  socket.on('restartGame', () => {
    // 找出發起重開的 socket
    let seat = singleRoom.players.findIndex(
      (p) => p && p.socketId === socket.id,
    );

    // 如果發起者尚未入座，自動將其分配至第一個可用座位（優先 Seat 0 房主）
    if (seat === -1) {
      seat = singleRoom.players.findIndex(
        (p) => !p || p.isAI || !p.connected || p.name.includes('(離線代打)'),
      );
      if (seat === -1) seat = 0;

      singleRoom.players[seat] = {
        socketId: socket.id,
        name: `玩家 ${seat + 1}`,
        seat,
        isHost: true,
        isAI: false,
        connected: true,
      };
    } else {
      singleRoom.players[seat]!.isAI = false;
      singleRoom.players[seat]!.connected = true;
      if (singleRoom.players[seat]!.name.includes('(離線代打)')) {
        singleRoom.players[seat]!.name = singleRoom.players[seat]!.name.replace('(離線代打)', '').trim();
      }
    }

    const pName = singleRoom.players[seat]?.name || `玩家 ${seat + 1}`;
    console.log(`[Room] Game restarted by ${pName} (Seat ${seat})`);

    // 保留目前真正連線中的真人玩家，其餘所有座位（斷線或 AI）重置為專家 AI
    for (let s = 0; s < 4; s++) {
      if (s === seat) continue;
      const p = singleRoom.players[s];
      const isOtherRealHuman = p && !p.isAI && p.connected && !p.name.includes('(離線代打)');
      if (!isOtherRealHuman) {
        singleRoom.players[s] = {
          socketId: `ai-seat-${s}`,
          name: `專家 AI (v8 冠軍)`,
          seat: s,
          isHost: false,
          isAI: true,
          connected: true,
        };
      }
    }

    // 確保有且僅有一位房主
    if (!singleRoom.players.some((p) => p && p.isHost && !p.isAI)) {
      if (singleRoom.players[seat]) singleRoom.players[seat]!.isHost = true;
    }

    singleRoom.gameStarted = true;
    singleRoom.gameState = createNewGame();
    // Synchronize names into GameState
    for (let s = 0; s < 4; s++) {
      if (singleRoom.players[s]) {
        singleRoom.gameState.players[s].name = singleRoom.players[s]!.name;
        singleRoom.gameState.players[s].isHuman = !singleRoom.players[s]!.isAI;
      }
    }

    broadcastRoom();
    broadcastGameState();
    setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
  });

  socket.on('startGame', () => {
    const seat = singleRoom.players.findIndex(
      (p) => p && p.socketId === socket.id,
    );
    if (seat === -1 || !singleRoom.players[seat]?.isHost) {
      socket.emit('error', '只有房主（第一個進入的玩家）可以開台！');
      return;
    }

    // Fill remaining seats with AI
    for (let s = 0; s < 4; s++) {
      if (singleRoom.players[s] === null) {
        singleRoom.players[s] = {
          socketId: `ai-seat-${s}`,
          name: `專家 AI (v8 冠軍)`,
          seat: s,
          isHost: false,
          isAI: true,
          connected: true,
        };
      }
    }

    singleRoom.gameStarted = true;
    singleRoom.gameState = createNewGame();
    // Synchronize names into GameState
    for (let s = 0; s < 4; s++) {
      if (singleRoom.players[s]) {
        singleRoom.gameState.players[s].name = singleRoom.players[s]!.name;
        singleRoom.gameState.players[s].isHuman = !singleRoom.players[s]!.isAI;
      }
    }

    console.log('[Room] Game started by host!');
    broadcastRoom();
    broadcastGameState();
    setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
  });

  socket.on('nextRound', () => {
    let seat = singleRoom.players.findIndex(
      (p) => p && p.socketId === socket.id,
    );
    if (!singleRoom.gameState) return;

    console.log(`[Room] Next round triggered by seat ${seat}`);
    singleRoom.gameState =
      singleRoom.gameState.phase === 'ended'
        ? startNextRound(singleRoom.gameState)
        : redealRound(singleRoom.gameState);

    // Reapply player names
    for (let s = 0; s < 4; s++) {
      if (singleRoom.players[s]) {
        singleRoom.gameState.players[s].name = singleRoom.players[s]!.name;
        singleRoom.gameState.players[s].isHuman = !singleRoom.players[s]!.isAI;
      }
    }

    broadcastGameState();
    setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
  });

  socket.on('discard', (tileId: string) => {
    if (!singleRoom.gameState) return;
    const seat = singleRoom.players.findIndex(
      (p) => p && p.socketId === socket.id,
    );
    if (seat === -1 || singleRoom.gameState.currentPlayer !== seat) return;

    try {
      singleRoom.gameState = discardTile(singleRoom.gameState, tileId);
      broadcastGameState();
      setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
    } catch (err: any) {
      socket.emit('error', err.message);
    }
  });

  socket.on('selfAction', (option: ClaimOption) => {
    if (!singleRoom.gameState) return;
    const seat = singleRoom.players.findIndex(
      (p) => p && p.socketId === socket.id,
    );
    if (seat === -1 || singleRoom.gameState.currentPlayer !== seat) return;

    try {
      singleRoom.gameState = selfAction(singleRoom.gameState, option);
      broadcastGameState();
      setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
    } catch (err: any) {
      socket.emit('error', err.message);
    }
  });

  socket.on('claim', (option: ClaimOption) => {
    if (!singleRoom.gameState) return;
    const seat = singleRoom.players.findIndex(
      (p) => p && p.socketId === socket.id,
    );
    if (seat === -1) return;

    try {
      singleRoom.gameState = submitClaim(singleRoom.gameState, seat, option);
      broadcastGameState();
      setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
    } catch (err: any) {
      socket.emit('error', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    const seat = singleRoom.players.findIndex(
      (p) => p && p.socketId === socket.id,
    );
    if (seat !== -1) {
      if (!singleRoom.gameStarted) {
        // In lobby: remove player and shift host if needed
        const wasHost = singleRoom.players[seat]?.isHost;
        singleRoom.players[seat] = null;
        if (wasHost) {
          const nextPlayer = singleRoom.players.find((p) => p !== null);
          if (nextPlayer) nextPlayer.isHost = true;
        }
      } else {
        // In game: mark disconnected or convert to AI
        if (singleRoom.players[seat]) {
          singleRoom.players[seat]!.connected = false;
          singleRoom.players[seat]!.isAI = true;
          if (!singleRoom.players[seat]!.name.includes('(離線代打)')) {
            singleRoom.players[seat]!.name += ' (離線代打)';
          }
          if (singleRoom.gameState) {
            singleRoom.gameState.players[seat].isHuman = false;
            singleRoom.gameState.players[seat].name = singleRoom.players[seat]!.name;
          }
        }
      }

      // 若所有連線中的真人玩家都已斷線，立即終止牌局，停止 AI 運算並重置為等待大堂
      const hasActiveHuman = singleRoom.players.some(
        (p) => p && p.connected && !p.isAI && !p.name.includes('(離線代打)'),
      );

      if (!hasActiveHuman && singleRoom.gameStarted) {
        console.log('[Room] All real players lost connection! Terminating game immediately.');
        singleRoom.gameStarted = false;
        singleRoom.gameState = null;
        singleRoom.players = [null, null, null, null];
        aiThinking = false;
      }

      broadcastRoom();
      if (singleRoom.gameStarted) {
        setTimeout(() => void triggerAITurn(), AI_ACTION_DELAY_MS);
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`🀄 香港麻將在線對弈伺服器啟動於 http://0.0.0.0:${PORT}`);
  console.log(`=========================================`);
});
