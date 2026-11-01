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
import type { RoomState } from '../server/types';
import './App.css';
import './ref-layout.css';

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
      return;
    }

    // 3. 摸牌聲 (drawnTile 摸入)
    if (state.drawnTile && state.drawnTile.id !== prev.drawnTile?.id) {
      soundManager.playTileDraw();
      return;
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
      return;
    }

    // 5. 補花聲
    const prevFlowerCount = prev.players.reduce((sum: number, p: any) => sum + p.flowers.length, 0);
    const currFlowerCount = state.players.reduce((sum: number, p: any) => sum + p.flowers.length, 0);
    if (currFlowerCount > prevFlowerCount) {
      soundManager.playFlower();
      return;
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

  const handleDiscard = () => {
    if (!selectedId) return;
    if (isOnline) {
      onlineClient.discard(selectedId);
    } else {
      discardLocal(selectedId);
    }
    setSelectedId(null);
  };

  const handleClaim = (opt: any) => {
    if (isOnline) {
      onlineClient.claim(opt);
    } else {
      claimLocal(opt);
    }
    setSelectedId(null);
  };

  const handleSelfAction = (opt: any) => {
    if (isOnline) {
      onlineClient.selfAction(opt);
    } else {
      doSelfActionLocal(opt);
    }
    setSelectedId(null);
  };

  const handleNextRound = () => {
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
