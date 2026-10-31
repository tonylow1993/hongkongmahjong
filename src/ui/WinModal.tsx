import { useState } from 'react';
import type { GameState } from '../game/types';
import { formatLa } from '../game/settlement';
import { sortTiles, tileLabel } from '../game/tiles';
import { TileView } from './TileView';

interface Props {
  state: GameState;
  onNextRound: () => void;
  onResetTable: () => void;
}

export function WinModal({ state, onNextRound, onResetTable }: Props) {
  const [minimized, setMinimized] = useState(false);

  if (state.phase !== 'ended') {
    return null;
  }

  const info = state.winInfo;
  const winnerPlayer = info ? state.players[info.winner] : null;

  // Sorted hand tiles excluding winning tile if self-drawn
  const winningHandTiles = winnerPlayer
    ? sortTiles(
        info?.isSelfDraw
          ? winnerPlayer.hand.filter((t) => t.id !== info.winningTile.id)
          : winnerPlayer.hand,
      )
    : [];

  if (minimized) {
    return (
      <div className="ended-floating-banner">
        <span className="ended-floating-banner__title">
          {info && winnerPlayer
            ? `🀄 ${winnerPlayer.name} ${info.isSelfDraw ? '自摸' : '食糊'}！(${info.fan}番)`
            : '🀄 本局打和流局'}
        </span>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => setMinimized(false)}
        >
          查看食糊牌型
        </button>
        <button
          type="button"
          className="btn btn--sm btn--primary"
          onClick={() => {
            setMinimized(false);
            onNextRound();
          }}
        >
          下一局 ▶
        </button>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal modal--wide modal--win-display">
        {info && winnerPlayer ? (
          <>
            <h2 className="modal__title">
              {info.isSelfDraw ? '🎉 自摸食糊！' : '🎉 食糊胡牌！'}
            </h2>
            <p className="modal__sub">
              <strong>{winnerPlayer.name}</strong>
              {info.isSelfDraw
                ? ' 自摸'
                : ` 食糊（${state.players[info.loser!]?.name ?? ''} 出銃）`}
              {info.winner === state.dealer ? ' · 莊家' : ''}
            </p>

            {/* 完整食糊牌型展示 */}
            <div className="modal__full-hand">
              <span className="modal__full-hand-title">食糊牌型（共 14 張）：</span>
              <div className="modal__hand-tiles-wrap">
                {/* 副露組 */}
                {winnerPlayer.melds.map((m, mi) => (
                  <div key={mi} className="modal__meld-group">
                    <div className="modal__meld-tiles">
                      {m.tiles.map((t, ti) => (
                        <TileView key={ti} tile={t} />
                      ))}
                    </div>
                    <span className="modal__meld-tag">
                      {m.kind === 'chow' ? '吃' : m.kind === 'pong' ? '碰' : '槓'}
                    </span>
                  </div>
                ))}

                {/* 門清手牌組 */}
                <div className="modal__concealed-group">
                  {winningHandTiles.map((t) => (
                    <TileView key={t.id} tile={t} />
                  ))}
                </div>

                {/* 食糊張 / 自摸張 */}
                <div className="modal__winning-tile-group">
                  <div className="modal__winning-tile-box">
                    <TileView tile={info.winningTile} />
                  </div>
                  <span className="modal__win-tag">
                    {info.isSelfDraw ? '自摸' : '食糊'}
                  </span>
                </div>
              </div>

              {/* 花牌展示 */}
              {winnerPlayer.flowers.length > 0 && (
                <div className="modal__flower-row">
                  <span className="modal__flower-label">花牌：</span>
                  <div className="modal__flower-tiles">
                    {winnerPlayer.flowers.map((f) => (
                      <div key={f.id} className="modal__flower-item">
                        <TileView tile={f} />
                        <small>{tileLabel(f)}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal__fan-row">
              <span className="modal__fan-num">{info.fan} 番</span>
              {info.tier != null && (
                <span className="modal__tier">
                  半辣上「{info.tier}」
                </span>
              )}
            </div>

            <ul className="modal__details">
              {info.details.map((d, i) => (
                <li key={i}>
                  <span>{d.name}</span>
                  <strong className="modal__detail-fan">{d.fan} 番</strong>
                </li>
              ))}
            </ul>

            {info.scoreDeltas && (
              <div className="modal__settle">
                <h3>本局加減分（點數）</h3>
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

        <div className="action-bar__btns modal__footer-btns">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setMinimized(true)}
            title="暫時收起彈窗，仔細查看牌桌上所有玩家的牌"
          >
            🔍 查看牌面
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onNextRound}
          >
            下一局 ▶
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onResetTable}
          >
            重新開台
          </button>
        </div>
      </div>
    </div>
  );
}
