import React, { useMemo } from 'react';

interface TileWallProps {
  /** 剩餘牌數 (state.wall.length) */
  remainingTiles: number;
  /** 視角方向: top, bottom, left, right */
  side: 'top' | 'bottom' | 'left' | 'right';
  /** 該邊的最大墩數 (每墩2張) */
  maxStacks?: number;
}

/**
 * 固定牌山配置：
 * Top: 14 墩 (28 張)
 * Right: 9 墩 (18 張)
 * Bottom: 14 墩 (28 張)
 * Left: 9 墩 (18 張)
 * 總容量 = 28 + 18 + 28 + 18 = 92 張。
 * (開局發牌 53 張後，牌山最多剩 91 張，因此 92 張能恆定容納全場牌山且墩數絕不抖動)
 */
const WALL_SPECS = {
  top: { stacks: 14, capacity: 28, isReverse: false },
  right: { stacks: 9, capacity: 18, isReverse: false },
  bottom: { stacks: 14, capacity: 28, isReverse: true },
  left: { stacks: 9, capacity: 18, isReverse: true },
} as const;

/**
 * 計算四邊牌山各自剩餘牌數：
 * 順序摸牌：嚴格「摸完一山先摸下一山」
 * 摸牌順序：Top (0) -> Right (1) -> Bottom (2) -> Left (3)
 * 當前一山完全摸空 (剩 0 張) 後，才會開始摸下一山！其他山在摸到前保持 100% 滿載。
 */
function getTilesForSide(side: 'top' | 'bottom' | 'left' | 'right', remainingTiles: number): number {
  const R = Math.max(0, remainingTiles);

  // 牌尾在 Left (最後摸)
  const leftTiles = Math.min(WALL_SPECS.left.capacity, R);
  const remAfterLeft = Math.max(0, R - leftTiles);

  // 倒數第二摸在 Bottom
  const bottomTiles = Math.min(WALL_SPECS.bottom.capacity, remAfterLeft);
  const remAfterBottom = Math.max(0, remAfterLeft - bottomTiles);

  // 倒數第三摸在 Right
  const rightTiles = Math.min(WALL_SPECS.right.capacity, remAfterBottom);
  const remAfterRight = Math.max(0, remAfterBottom - rightTiles);

  // 最先摸的是 Top (牌頭)
  const topTiles = Math.min(WALL_SPECS.top.capacity, remAfterRight);

  if (side === 'top') return topTiles;
  if (side === 'right') return rightTiles;
  if (side === 'bottom') return bottomTiles;
  return leftTiles;
}

/**
 * 香港麻將牌疊 / 牌山組件
 * 緊貼玩家邊界，摸完一山先摸下一山，絕不遮擋中央牌海。
 */
export const TileWall: React.FC<TileWallProps> = ({
  remainingTiles,
  side,
}) => {
  const isVertical = side === 'left' || side === 'right';
  const spec = WALL_SPECS[side];

  const stacks = useMemo(() => {
    // 該山當前剩餘牌數
    const sideRemaining = getTilesForSide(side, remainingTiles);
    // 該山已被摸出的牌數
    const sideDrawn = spec.capacity - sideRemaining;

    const list: number[] = [];
    for (let i = 0; i < spec.stacks; i++) {
      // 順著摸牌方向：
      // Top (左到右): i=0 先摸
      // Right (上到下): i=0 先摸
      // Bottom (右到左): i=spec.stacks-1 先摸，順著往左
      // Left (下到上): i=spec.stacks-1 先摸，順著往上
      const drawStep = spec.isReverse ? spec.stacks - 1 - i : i;

      if (sideDrawn >= (drawStep + 1) * 2) {
        list.push(0); // 該墩兩張均已摸完
      } else if (sideDrawn === drawStep * 2 + 1) {
        list.push(1); // 上層已摸走，剩底層一張
      } else {
        list.push(2); // 兩張均在
      }
    }

    return list;
  }, [remainingTiles, side, spec]);

  return (
    <div
      className={`tile-wall tile-wall--${side} ${isVertical ? 'tile-wall--vert' : 'tile-wall--horiz'}`}
      aria-label={`${side} 牌山`}
    >
      {stacks.map((height, idx) => (
        <div
          key={idx}
          className={`tile-stack tile-stack--h${height} ${isVertical ? 'tile-stack--vert' : 'tile-stack--horiz'}`}
        >
          {height >= 1 && (
            <div className="tile-stack__layer tile-stack__layer--bottom">
              <span className="tile-stack__face" />
              <span className="tile-stack__back" />
            </div>
          )}
          {height >= 2 && (
            <div className="tile-stack__layer tile-stack__layer--top">
              <span className="tile-stack__face" />
              <span className="tile-stack__back" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
