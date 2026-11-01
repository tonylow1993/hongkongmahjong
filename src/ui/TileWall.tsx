import React, { useMemo } from 'react';

interface TileWallProps {
  /** 剩餘牌數 (state.wall.length，從 ~84 張遞減至 0) */
  remainingTiles: number;
  /** 視角方向: top, bottom, left, right */
  side: 'top' | 'bottom' | 'left' | 'right';
  /** 該邊的最大墩數 (每墩2張) */
  maxStacks?: number;
}

/**
 * 香港麻將牌疊 / 牌山組件
 * 模擬真實麻將桌四周的立體牌山，雙層堆疊（每墩2張）。
 * 每摸一張牌，牌山上的牌便精確減少一張，且絕不遮擋手牌、副露、花牌或牌海。
 */
export const TileWall: React.FC<TileWallProps> = ({
  remainingTiles,
  side,
  maxStacks = 12,
}) => {
  const isVertical = side === 'left' || side === 'right';

  // 將全場剩餘牌數均勻或順時針映射到四家牌山
  // 四家牌山最大容量為 4 * maxStacks * 2 (例如 4 * 12 * 2 = 96 張)
  const sideTileCount = useMemo(() => {
    // 基準分配：每邊分配 remainingTiles / 4，餘數順次補入
    const base = Math.floor(remainingTiles / 4);
    const rem = remainingTiles % 4;
    const sideIdx = side === 'bottom' ? 0 : side === 'right' ? 1 : side === 'top' ? 2 : 3;
    const count = base + (sideIdx < rem ? 1 : 0);
    return Math.min(count, maxStacks * 2);
  }, [remainingTiles, side, maxStacks]);

  // 計算每墩的牌數：由牌尾往牌頭摸牌
  const stacks = useMemo(() => {
    const list: number[] = []; // 2: 雙層滿, 1: 單層(只剩一張), 0: 已摸空
    let tilesLeft = sideTileCount;

    for (let i = 0; i < maxStacks; i++) {
      if (tilesLeft >= 2) {
        list.push(2);
        tilesLeft -= 2;
      } else if (tilesLeft === 1) {
        list.push(1);
        tilesLeft -= 1;
      } else {
        list.push(0);
      }
    }
    return list;
  }, [sideTileCount, maxStacks]);

  return (
    <div
      className={`tile-wall tile-wall--${side} ${isVertical ? 'tile-wall--vert' : 'tile-wall--horiz'}`}
      aria-label={`${side} 牌山剩餘 ${sideTileCount} 張`}
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

