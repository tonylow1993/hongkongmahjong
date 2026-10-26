import { useMemo, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { ActionBar } from './ui/ActionBar';
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

  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        <span className="game-hud__meta">起糊 3 番 · 二五半</span>
        <div className="game-hud__actions">
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
        <span>香港麻將</span>
        <span className="game-hud__hint">點選手牌後按「出牌」</span>
      </footer>

      <WinModal state={state} onNextRound={nextRound} onResetTable={newGame} />
      <TrainingPanel
        open={showTraining}
        sampleCount={sampleCount}
        onClose={() => setShowTraining(false)}
        onExport={exportTraining}
        onClear={clearTraining}
      />
    </div>
  );
}
