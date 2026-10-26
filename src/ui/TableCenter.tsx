import type { GameState, Tile } from '../game/types';
import { WIND_LABELS } from '../game/types';
import { TileView } from './TileView';

const ROW_SIZE = 6;

interface Props {
  state: GameState;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function River({
  tiles,
  side,
  active,
  lastId,
}: {
  tiles: Tile[];
  side: 'top' | 'bottom' | 'left' | 'right';
  active: boolean;
  lastId: string | null;
}) {
  const rows = chunk(tiles, side === 'left' || side === 'right' ? 4 : ROW_SIZE);

  return (
    <div className={`river river--${side} ${active ? 'river--active' : ''}`}>
      {rows.map((row, ri) => (
        <div key={ri} className="river__row">
          {row.map((t) => (
            <TileView
              key={t.id}
              tile={t}
              river
              highlight={t.id === lastId}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** 參考手遊：中央灰框 + 四邊河牌 */
export function TableCenter({ state }: Props) {
  const wind = WIND_LABELS[state.prevailingWind];
  const p0 = state.players[0];
  const p1 = state.players[1];
  const p2 = state.players[2];
  const p3 = state.players[3];
  const lastId = state.lastDiscard?.id ?? null;

  const rim = [
    { side: 'top' as const, label: WIND_LABELS[p2.seatWind], cls: 'rim--n' },
    { side: 'right' as const, label: WIND_LABELS[p1.seatWind], cls: 'rim--e' },
    { side: 'bottom' as const, label: WIND_LABELS[p0.seatWind], cls: 'rim--s' },
    { side: 'left' as const, label: WIND_LABELS[p3.seatWind], cls: 'rim--w' },
  ];

  return (
    <div className="arena">
      <River
        tiles={p2.discards}
        side="top"
        active={state.currentPlayer === 2}
        lastId={state.lastDiscarder === 2 ? lastId : null}
      />
      <River
        tiles={p3.discards}
        side="left"
        active={state.currentPlayer === 3}
        lastId={state.lastDiscarder === 3 ? lastId : null}
      />
      <River
        tiles={p1.discards}
        side="right"
        active={state.currentPlayer === 1}
        lastId={state.lastDiscarder === 1 ? lastId : null}
      />
      <River
        tiles={p0.discards}
        side="bottom"
        active={state.currentPlayer === 0}
        lastId={state.lastDiscarder === 0 ? lastId : null}
      />

      <div className="console">
        {rim.map((r) => (
          <span key={r.side} className={`console__rim ${r.cls}`} title={`${r.label}家`}>
            {r.label}
          </span>
        ))}
        <div className="console__core">
          <p className="console__round">
            <span className="console__wind">{wind}</span>
            <span className="console__num">{state.roundWindCount}</span>
          </p>
          <p className="console__wall">{state.wall.length}</p>
          <p className="console__hint">三番 · 二五半</p>
        </div>
      </div>
    </div>
  );
}
