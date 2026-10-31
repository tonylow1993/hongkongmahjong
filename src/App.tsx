import { useMemo, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { ActionBar } from './ui/ActionBar';
import { CoachOverlay } from './ui/CoachOverlay';
import { MahjongTable } from './ui/MahjongTable';
import { TrainingPanel } from './ui/TrainingPanel';
import { WinModal } from './ui/WinModal';
import './App.css';
import './ref-layout.css';

export default function App() {
  const state = useGameStore((s) => s.state);
  const aiThinking = useGameStore((s) => s.aiThinking);
  const showTraining = useGameStore((s) => s.showTraining);
  const sampleCount = useGameStore((s) => s.sampleCount);
  const newGame = useGameStore((s) => s.newGame);
  const nextRound = useGameStore((s) => s.nextRound);
  const discard = useGameStore((s) => s.discard);
  const claim = useGameStore((s) => s.claim);
  const doSelfAction = useGameStore((s) => s.doSelfAction);
  const setShowTraining = useGameStore((s) => s.setShowTraining);
  const exportTraining = useGameStore((s) => s.exportTraining);
  const clearTraining = useGameStore((s) => s.clearTraining);
  const aiLevel = useGameStore((s) => s.aiLevel);
  const opponentMode = useGameStore((s) => s.opponentMode);
  const setAILevel = useGameStore((s) => s.setAILevel);
  const modeError = useGameStore((s) => s.modeError);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coachOn, setCoachOn] = useState(false);

  const canInteract =
    state.phase === 'discard' && state.currentPlayer === 0 && !aiThinking;

  const selfOptions = useMemo(
    () => (state.currentPlayer === 0 ? state.claimOptions[0] ?? [] : []),
    [state],
  );

  const humanClaims =
    state.phase === 'claim' && state.claimOptions[0]
      ? state.claimOptions[0]
      : null;

  const handleDiscard = () => {
    if (!selectedId) return;
    discard(selectedId);
    setSelectedId(null);
  };

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
            className={`btn btn--sm ${coachOn ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setCoachOn((on) => !on)}
          >
            AI 戰術教練
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowTraining(true)}>
            設定
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={newGame}>
            開台
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={nextRound}>
            新局
          </button>
        </div>
      </header>

      <main className="table-wrap">
        <MahjongTable
          state={state}
          selectedId={selectedId}
          onSelectTile={setSelectedId}
          canInteract={canInteract}
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
          doSelfAction(opt);
          setSelectedId(null);
        }}
        onClaim={(opt) => {
          claim(opt);
          setSelectedId(null);
        }}
        message={state.message}
        aiThinking={aiThinking}
      />

      <footer className="game-hud game-hud--bottom">
        <span>香港麻將 · 三番起糊</span>
        <span className="game-hud__hint">
          {modeError ?? '點選手牌後按「出牌」'}
          {` · 電腦對手：${
            aiLevel === 'local'
              ? '本地 AI（純規則）'
              : aiLevel === 'level-1'
                ? '初級（神經網絡探索型）'
                : aiLevel === 'level-2'
                  ? '中級（神經網絡 v2）'
                  : '高級（專家 AI v4）'
          }`}
        </span>
      </footer>

      <CoachOverlay
        open={coachOn}
        state={state}
        canAsk={canInteract || humanClaims != null}
      />
      <WinModal state={state} onNextRound={nextRound} onResetTable={newGame} />
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
