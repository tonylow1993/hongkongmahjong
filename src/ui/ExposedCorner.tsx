import type { PlayerState } from '../game/types';
import { TileView, type TileOrient } from './TileView';

interface Props {
  player: PlayerState;
  /** 座位 0下 1右 2上 3左 */
  seat: 0 | 1 | 2 | 3;
}

/** 字朝向各家：下家朝左、對家倒置、上家朝右、自己正放 */
const ORIENT: Record<0 | 1 | 2 | 3, TileOrient> = {
  0: 'horiz',
  1: 'vert-left',
  2: 'flip',
  3: 'vert-right',
};

/** 花／吃碰槓：貼各家右手邊，字面向該家，且留在桌內 */
export function ExposedCorner({ player, seat }: Props) {
  if (player.melds.length === 0 && player.flowers.length === 0) return null;

  const orient = ORIENT[seat];
  const turned = orient === 'vert-left' || orient === 'vert-right';

  const tile = (id: string, t: Parameters<typeof TileView>[0]['tile'], faceDown = false) => (
    <span key={id} className={turned ? 'exposed__slot exposed__slot--turn' : 'exposed__slot'}>
      <TileView tile={t} meld orient={orient} faceDown={faceDown} />
    </span>
  );

  return (
    <aside className={`exposed exposed--seat-${seat}`}>
      <div className="exposed__spin">
        {player.flowers.map((t) => tile(t.id, t))}
        {player.melds.map((m, i) => (
          <div key={i} className="meld">
            {m.tiles
              .slice(0, m.kind === 'concealedKong' ? 4 : m.tiles.length)
              .map((t, j) =>
                tile(
                  t.id + j,
                  t,
                  m.kind === 'concealedKong' && j < 3,
                ),
              )}
          </div>
        ))}
      </div>
    </aside>
  );
}
