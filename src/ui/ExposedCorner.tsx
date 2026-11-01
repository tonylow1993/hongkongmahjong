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

  const tile = (
    id: string,
    t: Parameters<typeof TileView>[0]['tile'],
    faceDown = false,
    isSideways = false,
  ) => {
    // 依據玩家座位決定橫放時的旋轉角度：
    let tileOrient: TileOrient = orient;
    if (isSideways) {
      if (orient === 'horiz') tileOrient = 'vert-right'; // 自己(下)：向右轉90度橫放
      else if (orient === 'flip') tileOrient = 'vert-left'; // 對家(上)：轉向枱心橫放
      else if (orient === 'vert-left') tileOrient = 'flip'; // 右家
      else if (orient === 'vert-right') tileOrient = 'horiz'; // 左家
    }

    return (
      <span
        key={id}
        className={turned || isSideways ? 'exposed__slot exposed__slot--turn' : 'exposed__slot'}
      >
        <TileView
          tile={t}
          meld
          orient={tileOrient}
          faceDown={faceDown}
          flowerSeat={player.seatWind}
        />
      </span>
    );
  };

  const meldBlocks = player.melds.map((m, i) => {
    // 判斷受進牌（吃碰槓的牌）打橫顯示：
    // 在麻將標準規則中，依據供牌者方位決定哪一張打橫：
    // rel: 3 (上家/左) -> 最左側牌打橫 (index 0)
    // rel: 2 (對家/上) -> 中間牌打橫 (index 1)
    // rel: 1 (下家/右) -> 最右側牌打橫 (index 2 / 3)
    const rel = m.from !== null ? (m.from - player.id + 4) % 4 : null;
    let sidewaysIndex = 0;
    if (m.kind === 'chow') {
      sidewaysIndex = 0; // 吃牌來自上家，最左側牌打橫
    } else if (m.kind === 'pong') {
      sidewaysIndex = rel === 2 ? 1 : rel === 1 ? 2 : 0;
    } else if (m.kind === 'kong') {
      sidewaysIndex = rel === 2 ? 1 : rel === 1 ? 3 : 0;
    }

    const isConcealed = m.kind === 'concealedKong';

    return (
      <div key={i} className="meld">
        {m.tiles
          .slice(0, isConcealed ? 4 : m.tiles.length)
          .map((t, j) => {
            const faceDown = isConcealed && (j === 0 || j === 3);
            const isSideways = !isConcealed && j === sidewaysIndex;
            return tile(t.id + j, t, faceDown, isSideways);
          })}
      </div>
    );
  });

  const flowersRow =
    player.flowers.length > 0 ? (
      <div className="exposed__flowers">
        {player.flowers.map((t) => tile(t.id, t))}
      </div>
    ) : null;

  // 自己用 column-reverse：DOM 先 melds 後花，花在最上層
  const stackTopFirst = seat === 1 || seat === 2 || seat === 3;

  return (
    <aside className={`exposed exposed--seat-${seat}`}>
      <div className="exposed__spin">
        {stackTopFirst && flowersRow}
        <div className="exposed__melds">{meldBlocks}</div>
        {!stackTopFirst && flowersRow}
      </div>
    </aside>
  );
}
