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
 * 香港麻將牌疊 / 牌山組件
 * 模擬真實麻將桌四周的立體牌山，雙層堆疊（每墩2張）。
 * 順時針沿四周牌山順序摸牌（Top -> Right -> Bottom -> Left）：
 * 每摸一張牌，精確減少當前牌頭的一張牌，絕不會「每疊摸一下」，完全符合實體打牌體驗。
 */
export const TileWall: React.FC<TileWallProps> = ({
  remainingTiles,
  side,
}) => {
  const isVertical = side === 'left' || side === 'right';

  const stacks = useMemo(() => {
    // 基準牌山墩數分配：
    // 標準開局扣除手牌後約 84 張牌，分配至四邊：
    // Top: 12 墩 (24張)
    // Right: 9 墩 (18張)
    // Bottom: 12 墩 (24張)
    // Left: 9 墩 (18張)
    // 總計 42 墩 = 84 張。
    // 若剩餘牌數超過 84，則動態為 Top 與 Bottom 增加墩數（上限至 14 墩）。
    const extraTiles = Math.max(0, remainingTiles - 84);
    const extraStacks = Math.ceil(extraTiles / 2);
    const topExtra = Math.ceil(extraStacks / 2);
    const bottomExtra = Math.floor(extraStacks / 2);

    const config = {
      top: { stacks: Math.min(14, 12 + topExtra), isReverse: false },
      right: { stacks: 9, isReverse: false },
      bottom: { stacks: Math.min(14, 12 + bottomExtra), isReverse: true },
      left: { stacks: 9, isReverse: true },
    };

    const cTop = config.top.stacks * 2;
    const cRight = config.right.stacks * 2;
    const cBottom = config.bottom.stacks * 2;
    const cLeft = config.left.stacks * 2;
    const totalCapacity = cTop + cRight + cBottom + cLeft;

    // 全局已摸出的牌數 D (隨 remainingTiles 減少而增加)
    const totalDrawn = Math.max(0, totalCapacity - remainingTiles);

    // 順時針順序: Top (0) -> Right (1) -> Bottom (2) -> Left (3)
    let startIdx = 0;
    let sideCapacity = 0;
    let isReverse = false;
    let stackCount = 0;

    if (side === 'top') {
      startIdx = 0;
      sideCapacity = cTop;
      isReverse = config.top.isReverse;
      stackCount = config.top.stacks;
    } else if (side === 'right') {
      startIdx = cTop;
      sideCapacity = cRight;
      isReverse = config.right.isReverse;
      stackCount = config.right.stacks;
    } else if (side === 'bottom') {
      startIdx = cTop + cRight;
      sideCapacity = cBottom;
      isReverse = config.bottom.isReverse;
      stackCount = config.bottom.stacks;
    } else {
      startIdx = cTop + cRight + cBottom;
      sideCapacity = cLeft;
      isReverse = config.left.isReverse;
      stackCount = config.left.stacks;
    }

    // 當前這條邊已摸掉的牌數
    const drawnFromSide = Math.max(0, Math.min(sideCapacity, totalDrawn - startIdx));

    // 計算這條邊上每一墩的高度 (2: 雙層滿, 1: 單層, 0: 已摸空)
    const list: number[] = [];
    for (let i = 0; i < stackCount; i++) {
      // 順著摸牌方向：
      // Top (左到右): i=0 先摸
      // Right (上到下): i=0 先摸
      // Bottom (右到左): i=stackCount-1 先摸，順著往左
      // Left (下到上): i=stackCount-1 先摸，順著往上
      const drawStep = isReverse ? stackCount - 1 - i : i;

      if (drawnFromSide >= (drawStep + 1) * 2) {
        list.push(0);
      } else if (drawnFromSide === drawStep * 2 + 1) {
        list.push(1);
      } else {
        list.push(2);
      }
    }

    return list;
  }, [remainingTiles, side]);

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
