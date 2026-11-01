import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { ActionBar } from './ui/ActionBar';
import { CoachOverlay } from './ui/CoachOverlay';
import { MahjongTable } from './ui/MahjongTable';
import { TrainingPanel } from './ui/TrainingPanel';
import { WinModal } from './ui/WinModal';
import { onlineClient } from './online/onlineClient';
import { LobbyLanding } from './online/LobbyLanding';
import { RoomLockedPage } from './online/RoomLockedPage';
import { soundManager } from './audio/soundManager';
import type { ClaimOption, Tile } from './game/types';
import { sameTile } from './game/tiles';
import type { RoomState } from '../server/types';
import './App.css';
import './ref-layout.css';

/**
 * 計算吃碰槓等動作時，手牌及桌面上相關候選牌的 ID 集合
 */
function getRelevantTileIds(
  opt: ClaimOption | null,
  hand: Tile[],
  discardedTile?: Tile | null,
): Set<string> {
  const ids = new Set<string>();
  if (!opt || !opt.tiles || opt.tiles.length === 0) return ids;

  // 1. 如果桌上剛打出的牌是此操作的一部分（吃、碰、明槓、食糊），包含桌上這張牌
  if (discardedTile && opt.tiles.some((t) => t.id === discardedTile.id || sameTile(t, discardedTile))) {
    ids.add(discardedTile.id);
  }

  // 2. 扣除桌上這張牌，計算需要從手牌中使用的牌組
  const neededFromHand = [...opt.tiles];
  if (discardedTile) {
    const discardIdx = neededFromHand.findIndex(
      (t) => t.id === discardedTile.id || sameTile(t, discardedTile),
    );
    if (discardIdx >= 0) {
      neededFromHand.splice(discardIdx, 1);
    }
  }

  // 3. 在手牌中匹配出這些牌（按花色與點數匹配）
  for (const h of hand) {
    const matchIdx = neededFromHand.findIndex(
      (t) => t.id === h.id || sameTile(t, h),
    );
    if (matchIdx >= 0) {
      ids.add(h.id);
      neededFromHand.splice(matchIdx, 1);
    }
  }

  return ids;
}

export default function App() {
  const localState = useGameStore((s) => s.state);
  const aiThinking = useGameStore((s) => s.aiThinking);
  const showTraining = useGameStore((s) => s.showTraining);
  const sampleCount = useGameStore((s) => s.sampleCount);
  const newGame = useGameStore((s) => s.newGame);
  const nextRoundLocal = useGameStore((s) => s.nextRound);
  const discardLocal = useGameStore((s) => s.discard);
  const claimLocal = useGameStore((s) => s.claim);
  const doSelfActionLocal = useGameStore((s) => s.doSelfAction);
  const setShowTraining = useGameStore((s) => s.setShowTraining);
  const exportTraining = useGameStore((s) => s.exportTraining);
  const clearTraining = useGameStore((s) => s.clearTraining);
  const aiLevel = useGameStore((s) => s.aiLevel);
  const opponentMode = useGameStore((s) => s.opponentMode);
  const setAILevel = useGameStore((s) => s.setAILevel);
  const modeError = useGameStore((s) => s.modeError);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coachOn, setCoachOn] = useState(false);
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());
  const prevStateRef = useRef<any>(null);

  // Online Multiplayer State
  const [isOnline, setIsOnline] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [yourSeat, setYourSeat] = useState<number | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [onlineGameState, setOnlineGameState] = useState<any | null>(null);

  useEffect(() => {
    // If running on hosted remote server or URL has ?online=1, default to online
    const shouldOnline =
      typeof window !== 'undefined' &&
      (window.location.search.includes('online=1') ||
        window.location.port === '3000' ||
        window.location.hostname !== 'localhost');

    if (shouldOnline) {
      setIsOnline(true);
      onlineClient.connect();
    }

    const unsubRoom = onlineClient.onRoomState((data) => {
      setRoom(data.room);
      setYourSeat(data.yourSeat);
      setIsHost(data.isHost);
    });

    const unsubGame = onlineClient.onGameState((state) => {
      setOnlineGameState(state);
    });

    const unsubErr = onlineClient.onError((msg) => {
      alert(msg);
    });

    return () => {
      unsubRoom();
      unsubGame();
      unsubErr();
    };
  }, []);

  const state = isOnline && onlineGameState ? onlineGameState : localState;
  const activeSeat = isOnline && yourSeat !== null ? yourSeat : 0;

  useEffect(() => {
    if (!state) return;
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    if (!prev) return;

    // 1. 食糊 / 自摸聲
    if (state.phase === 'ended' && prev.phase !== 'ended') {
      if (state.winInfo?.isSelfDraw) {
        soundManager.playZimo();
      } else if (state.winInfo) {
        soundManager.playWin();
      }
      return;
    }

    // 2. 出牌聲 (lastDiscard 變更)
    if (state.lastDiscard && state.lastDiscard.id !== prev.lastDiscard?.id) {
      soundManager.playTileDiscard();
    }

    // 3. 摸牌聲 (drawnTile 摸入)
    else if (state.drawnTile && state.drawnTile.id !== prev.drawnTile?.id) {
      soundManager.playTileDraw();
    }

    // 4. 副露聲 (吃碰槓數量變更)
    const prevMeldCount = prev.players.reduce((sum: number, p: any) => sum + p.melds.length, 0);
    const currMeldCount = state.players.reduce((sum: number, p: any) => sum + p.melds.length, 0);
    if (currMeldCount > prevMeldCount) {
      let latestKind = 'pong';
      for (const p of state.players) {
        if (p.melds.length > 0) {
          const m = p.melds[p.melds.length - 1];
          latestKind = m.kind;
        }
      }
      if (latestKind === 'chow') {
        soundManager.playChow();
      } else if (latestKind === 'kong' || latestKind === 'concealedKong') {
        soundManager.playKong();
      } else {
        soundManager.playPong();
      }
    }

    // 5. 補花聲
    const prevFlowerCount = prev.players.reduce((sum: number, p: any) => sum + p.flowers.length, 0);
    const currFlowerCount = state.players.reduce((sum: number, p: any) => sum + p.flowers.length, 0);
    if (currFlowerCount > prevFlowerCount) {
      soundManager.playFlower();
    }

    // 6. 等候玩家操作提示音 (輪到自己出牌，或出現吃碰槓糊按鈕)
    const isWaitingUserAction = (s: typeof state, seat: number): boolean => {
      if (!s || s.phase === 'ended') return false;
      if (s.phase === 'claim' && (s.claimOptions[seat]?.length ?? 0) > 0) return true;
      if (s.phase === 'discard' && s.currentPlayer === seat) return true;
      return false;
    };

    const wasWaiting = isWaitingUserAction(prev, activeSeat);
    const isWaiting = isWaitingUserAction(state, activeSeat);
    if (isWaiting && !wasWaiting) {
      setTimeout(() => {
        soundManager.playActionPrompt();
      }, 160);
    }
  }, [state]);

  const toggleOnline = () => {
    if (!isOnline) {
      setIsOnline(true);
      onlineClient.connect();
    } else {
      setIsOnline(false);
      onlineClient.disconnect();
      setRoom(null);
      setYourSeat(null);
    }
  };

  const canInteract =
    state.phase === 'discard' &&
    state.currentPlayer === activeSeat &&
    (isOnline ? true : !aiThinking);

  const selfOptions = useMemo(
    () =>
      state.currentPlayer === activeSeat
        ? state.claimOptions[activeSeat] ?? []
        : [],
    [state, activeSeat],
  );

  const humanClaims =
    state.phase === 'claim' && state.claimOptions[activeSeat]
      ? state.claimOptions[activeSeat]
      : null;

  // 懸停吃碰槓動作按鈕時，高亮手牌及桌面上的相關牌
  const [hoveredOption, setHoveredOption] = useState<ClaimOption | null>(null);

  const actionTargetIds = useMemo(() => {
    if (!hoveredOption || !state) return new Set<string>();
    const myPlayer = state.players[activeSeat];
    const hand = myPlayer ? myPlayer.hand : [];
    const discarded = state.lastDiscard;
    return getRelevantTileIds(hoveredOption, hand, discarded);
  }, [hoveredOption, state, activeSeat]);

  useEffect(() => {
    setHoveredOption(null);
  }, [state?.phase, state?.turn, state?.currentPlayer]);

  const handleDiscard = () => {
    if (!selectedId) return;
    soundManager.playTileDiscard();
    if (isOnline) {
      onlineClient.discard(selectedId);
    } else {
      discardLocal(selectedId);
    }
    setSelectedId(null);
  };

  const handleClaim = (opt: any) => {
    if (opt.kind === 'pong') soundManager.playPong();
    else if (opt.kind === 'chow') soundManager.playChow();
    else if (opt.kind === 'kong') soundManager.playKong();
    else if (opt.kind === 'win') soundManager.playWin();
    else soundManager.playTileClick();

    if (isOnline) {
      onlineClient.claim(opt);
    } else {
      claimLocal(opt);
    }
    setSelectedId(null);
  };

  const handleSelfAction = (opt: any) => {
    if (opt.kind === 'win') soundManager.playZimo();
    else if (opt.kind === 'kong') soundManager.playKong();
    else soundManager.playTileClick();

    if (isOnline) {
      onlineClient.selfAction(opt);
    } else {
      doSelfActionLocal(opt);
    }
    setSelectedId(null);
  };

  const handleNextRound = () => {
    soundManager.playDeal();
    if (isOnline) {
      onlineClient.nextRound();
    } else {
      nextRoundLocal();
    }
  };

  const handleNewGame = () => {
    if (isOnline) {
      onlineClient.startGame();
    } else {
      newGame();
    }
  };

  // 1. Online: When game has NOT started yet, show dedicated Lobby Landing Page
  // (Zero hands or tiles are rendered at all until host starts the game)
  if (isOnline && (!room || !room.gameStarted)) {
    return (
      <LobbyLanding
        room={room}
        yourSeat={yourSeat}
        isHost={isHost}
        onJoin={(name) => onlineClient.join(name)}
        onStartGame={() => onlineClient.startGame()}
        onSwitchToLocal={() => setIsOnline(false)}
      />
    );
  }

  // 2. Online: When game IS started, non-seated visitors cannot view or play to reduce resource
  if (isOnline && room && room.gameStarted && yourSeat === null) {
    return (
      <RoomLockedPage
        onRefresh={() => window.location.reload()}
        onSwitchToLocal={() => setIsOnline(false)}
      />
    );
  }

  return (
    <div className="app app--ref">
      <header className="game-hud game-hud--top">
        <span className="game-hud__meta">起糊 3 番 · 半辣上</span>
        <div className="game-hud__actions">
          <div className="ai-level-group" role="group" aria-label="AI對手等級">
            <span className="ai-level-group__label">AI對手：</span>
            <button
              type="button"
              className={`btn btn--sm ${aiLevel === 'local' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setAILevel('local')}
              title="本地 AI：純前端 TypeScript 啟發式規則引擎，離線即玩、無網絡延遲"
            >
              本地 AI
            </button>
            <button
              type="button"
              className={`btn btn--sm ${aiLevel === 'level-1' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setAILevel('level-1')}
              title="初級：神經網絡（輕鬆探索模式）"
            >
              初級
            </button>
            <button
              type="button"
              className={`btn btn--sm ${aiLevel === 'level-2' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setAILevel('level-2')}
              title="中級：神經網絡（均衡探索對弈）"
            >
              中級
            </button>
            <button
              type="button"
              className={`btn btn--sm ${aiLevel === 'level-3' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setAILevel('level-3')}
              title="高級：專家神經網絡（嚴密三番防守算路）"
            >
              高級
            </button>
          </div>
          <button
            type="button"
            className={`btn btn--sm ${isMuted ? 'btn--ghost' : 'btn--accent'}`}
            onClick={() => setIsMuted(soundManager.toggleMute())}
            title={isMuted ? '點擊開啟麻將音效' : '點擊靜音'}
          >
            {isMuted ? '🔇 靜音' : '🔊 音效'}
          </button>
          <button
            type="button"
            className={`btn btn--sm ${isOnline ? 'btn--primary' : 'btn--ghost'}`}
            onClick={toggleOnline}
            title={isOnline ? '切換為單機模式' : '切換為線上多人對弈模式'}
          >
            {isOnline ? '🌐 線上連線中' : '🎮 單機模式'}
          </button>
          <button
            type="button"
            className={`btn btn--sm ${coachOn ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setCoachOn((on) => !on)}
          >
            AI 戰術教練
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowTraining(true)}>
            設定
          </button>
          {isOnline ? (
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => {
                if (window.confirm('確定要重新開台嗎？所有玩家分數將重置為底分 1000 點！')) {
                  onlineClient.restartGame();
                }
              }}
              title="真人玩家均可重開新對局"
            >
              🔄 重新開台
            </button>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleNewGame}>
              開台
            </button>
          )}
          <button type="button" className="btn btn--primary btn--sm" onClick={handleNextRound}>
            新局
          </button>
        </div>
      </header>

      <main className="table-wrap">
        <MahjongTable
          state={state}
          selectedId={selectedId}
          onSelectTile={(id) => {
            setSelectedId(id);
            soundManager.playTileSelect();
          }}
          canInteract={canInteract}
          mySeat={activeSeat}
          actionTargetIds={actionTargetIds}
        />
      </main>

      <ActionBar
        selfOptions={selfOptions}
        claimOptions={humanClaims}
        phase={state.phase}
        canDiscard={canInteract}
        selectedId={selectedId}
        onDiscard={handleDiscard}
        onSelfAction={(opt) => {
          handleSelfAction(opt);
          setSelectedId(null);
        }}
        onClaim={(opt) => {
          handleClaim(opt);
          setSelectedId(null);
        }}
        onHoverOption={setHoveredOption}
        message={state.message}
        aiThinking={aiThinking}
      />

      <footer className="game-hud game-hud--bottom">
        <span>香港麻將 · 三番起糊</span>
        <span className="game-hud__hint">
          {isOnline
            ? `🌐 線上公共房間 · 座位 ${activeSeat + 1}（${isHost ? '👑 房主' : '玩家'}）· 無超時限制`
            : modeError ?? '點選手牌後按「出牌」'}
        </span>
      </footer>

      <CoachOverlay
        open={coachOn}
        state={state}
        canAsk={canInteract || humanClaims != null}
      />
      <WinModal state={state} onNextRound={handleNextRound} onResetTable={handleNewGame} />
      <TrainingPanel
        open={showTraining}
        aiLevel={aiLevel}
        opponentMode={opponentMode}
        sampleCount={sampleCount}
        onClose={() => setShowTraining(false)}
        onExport={exportTraining}
        onClear={clearTraining}
      />
    </div>
  );
}
