import type { GameState, Tile } from '../game/types';
import { WIND_LABELS } from '../game/types';
import { TileView } from './TileView';
import { TileWall } from './TileWall';

interface Props {
  state: GameState;
  mySeat?: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function riverPlan(count: number, side: 'top' | 'bottom' | 'left' | 'right') {
  const vertical = side === 'left' || side === 'right';
  if (count <= 12) {
    return { rowSize: vertical ? 4 : 6, density: '' };
  }
  if (count <= 20) {
    return { rowSize: vertical ? 5 : 8, density: 'river--dense' };
  }
  if (count <= 28) {
    return { rowSize: vertical ? 6 : 10, density: 'river--denser' };
  }
  return { rowSize: vertical ? 7 : 12, density: 'river--compact' };
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
  const { rowSize, density } = riverPlan(tiles.length, side);
  const rows = chunk(tiles, rowSize);

  return (
    <div className={`river river--${side} ${density} ${active ? 'river--active' : ''}`}>
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

/** 參考手遊：中央灰框 + 四邊河牌（依據 mySeat 旋轉視角） */
export function TableCenter({ state, mySeat = 0 }: Props) {
  const wind = WIND_LABELS[state.prevailingWind];
  const bottomSeat = mySeat;
  const rightSeat = (mySeat + 1) % 4;
  const topSeat = (mySeat + 2) % 4;
  const leftSeat = (mySeat + 3) % 4;

  const pBottom = state.players[bottomSeat];
  const pRight = state.players[rightSeat];
  const pTop = state.players[topSeat];
  const pLeft = state.players[leftSeat];
  const lastId = state.lastDiscard?.id ?? null;

  const rim = [
    { side: 'top' as const, label: WIND_LABELS[pTop.seatWind], cls: 'rim--n' },
    { side: 'right' as const, label: WIND_LABELS[pRight.seatWind], cls: 'rim--e' },
    { side: 'bottom' as const, label: WIND_LABELS[pBottom.seatWind], cls: 'rim--s' },
    { side: 'left' as const, label: WIND_LABELS[pLeft.seatWind], cls: 'rim--w' },
  ];

  return (
    <div className="arena">
      {/* 牌山 / 牌疊：四周立體牌山，每摸一張少一張，絕不遮擋任何牌 */}
      <TileWall remainingTiles={state.wall.length} side="top" maxStacks={14} />
      <TileWall remainingTiles={state.wall.length} side="left" maxStacks={10} />
      <TileWall remainingTiles={state.wall.length} side="right" maxStacks={10} />
      <TileWall remainingTiles={state.wall.length} side="bottom" maxStacks={14} />

      <River
        tiles={pTop.discards}
        side="top"
        active={state.currentPlayer === topSeat}
        lastId={state.lastDiscarder === topSeat ? lastId : null}
      />
      <River
        tiles={pLeft.discards}
        side="left"
        active={state.currentPlayer === leftSeat}
        lastId={state.lastDiscarder === leftSeat ? lastId : null}
      />
      <River
        tiles={pRight.discards}
        side="right"
        active={state.currentPlayer === rightSeat}
        lastId={state.lastDiscarder === rightSeat ? lastId : null}
      />
      <River
        tiles={pBottom.discards}
        side="bottom"
        active={state.currentPlayer === bottomSeat}
        lastId={state.lastDiscarder === bottomSeat ? lastId : null}
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
