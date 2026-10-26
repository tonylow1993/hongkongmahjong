import type { GameState } from '../game/types';
import { formatLa } from '../game/settlement';
import { tileLabel } from '../game/tiles';
import { TileView } from './TileView';

interface Props {
  state: GameState;
  onNextRound: () => void;
  onResetTable: () => void;
}

export function WinModal({ state, onNextRound, onResetTable }: Props) {
  if (state.phase !== 'ended') return null;
  const info = state.winInfo;

  return (
    <div className="modal-backdrop">
      <div className="modal modal--wide">
        {info ? (
          <>
            <h2 className="modal__title">
              {info.isSelfDraw ? '自摸' : '糊牌'}！
            </h2>
            <p className="modal__sub">
              {state.players[info.winner].name}
              {info.isSelfDraw
                ? '自摸'
                : `食胡（${state.players[info.loser!]?.name ?? ''}出銃）`}
              {info.winner === state.dealer ? ' · 莊家' : ''}
            </p>
            <div className="modal__tile">
              <TileView tile={info.winningTile} />
              <span>{tileLabel(info.winningTile)}</span>
            </div>
            <p className="modal__fan">
              {info.fan} 番
              {info.tier != null && (
                <span className="modal__tier">
                  {' '}
                  · 二五半「{info.tier}」（{info.baseLa}辣）
                </span>
              )}
            </p>
            <ul className="modal__details">
              {info.details.map((d, i) => (
                <li key={i}>
                  {d.name}
                  <span>{d.fan}番</span>
                </li>
              ))}
            </ul>
            {info.scoreDeltas && (
              <div className="modal__settle">
                <h3>本局加減（辣）</h3>
                <ul>
                  {state.players.map((p, i) => {
                    const d = info.scoreDeltas![i];
                    return (
                      <li key={p.id}>
                        <span>
                          {p.name}
                          {i === state.dealer ? '（莊）' : ''}
                        </span>
                        <span className={d > 0 ? 'score--pos' : d < 0 ? 'score--neg' : ''}>
                          {formatLa(d)}
                          <em> → {p.score}</em>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="modal__title">流局</h2>
            <p className="modal__sub">牌牆已空，本局打和 · 過莊</p>
            <div className="modal__settle">
              <h3>目前分數（辣）</h3>
              <ul>
                {state.players.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    <span>{p.score}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        <div className="action-bar__btns" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn--primary" onClick={onNextRound}>
            下一局
          </button>
          <button type="button" className="btn btn--ghost" onClick={onResetTable}>
            重新開台
          </button>
        </div>
      </div>
    </div>
  );
}
