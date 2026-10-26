import type { FanDetail, Meld, PlayerState, Tile, Wind, WinInfo } from './types';
import { sameTile, tileKey } from './tiles';
import {
  allMeldsArePongs,
  canWinStandard,
  getHandSuitProfile,
  isSevenPairs,
  isThirteenOrphans,
  type WinShape,
} from './win';

export interface ScoreContext {
  player: PlayerState;
  winningTile: Tile;
  isSelfDraw: boolean;
  prevailingWind: Wind;
  /** 是否由人打出（非自摸） */
  discardedBy?: number | null;
}

/**
 * 香港麻雀常見番種（簡化但可擴充）。
 * 三番起糊由 GameConfig.minFan 控制。
 */
export function calculateFan(ctx: ScoreContext): { fan: number; details: FanDetail[] } {
  const { player, winningTile, isSelfDraw, prevailingWind } = ctx;
  const details: FanDetail[] = [];
  const hand = player.hand;
  const melds = player.melds;

  if (isThirteenOrphans([...hand, winningTile], melds)) {
    details.push({ name: '十三幺', fan: 13 });
    return { fan: sum(details), details };
  }

  if (isSevenPairs([...hand, winningTile], melds)) {
    details.push({ name: '七對子', fan: 4 });
    addCommon(details, player, isSelfDraw, prevailingWind);
    addFlushFans(details, hand, melds, winningTile);
    return { fan: sum(details), details };
  }

  const shape = canWinStandard(hand, melds, winningTile);
  if (!shape) return { fan: 0, details: [] };

  // —— 牌型番 ——
  if (allMeldsArePongs(melds, shape)) {
    details.push({ name: '對對糊', fan: 3 });
  }

  addFlushFans(details, hand, melds, winningTile);
  addHonorFans(details, player, shape, winningTile, prevailingWind);
  addCommon(details, player, isSelfDraw, prevailingWind);

  // 無花
  if (player.flowers.length === 0) {
    details.push({ name: '無花', fan: 1 });
  } else {
    addFlowerFans(details, player);
  }

  return { fan: sum(details), details };
}

function addCommon(
  details: FanDetail[],
  player: PlayerState,
  isSelfDraw: boolean,
  _prevailingWind: Wind,
): void {
  if (isSelfDraw) details.push({ name: '自摸', fan: 1 });
  if (player.melds.length === 0) details.push({ name: '門清', fan: 1 });
}

function addFlushFans(
  details: FanDetail[],
  hand: Tile[],
  melds: Meld[],
  winningTile: Tile,
): void {
  const { suits, hasHonors } = getHandSuitProfile(hand, melds, winningTile);
  if (suits.size === 1 && !hasHonors) {
    details.push({ name: '清一色', fan: 7 });
  } else if (suits.size === 1 && hasHonors) {
    details.push({ name: '混一色', fan: 3 });
  }
}

function addHonorFans(
  details: FanDetail[],
  player: PlayerState,
  shape: WinShape,
  winningTile: Tile,
  prevailingWind: Wind,
): void {
  const allMelds: Tile[][] = [
    ...player.melds.map((m) => m.tiles.slice(0, 3)),
    ...shape.melds,
  ];

  const seatWind = player.seatWind + 1; // tile value 1-4
  const roundWind = prevailingWind + 1;

  let dragonPongs = 0;
  let windPongs = 0;
  const windValues = new Set<number>();

  for (const m of allMelds) {
    if (!sameTile(m[0], m[1]) || !sameTile(m[1], m[2])) continue;
    const t = m[0];
    if (t.suit === 'dragon') {
      dragonPongs++;
      details.push({ name: `箭牌（${['中', '發', '白'][t.value - 1]}）`, fan: 1 });
    }
    if (t.suit === 'wind') {
      windPongs++;
      windValues.add(t.value);
      if (t.value === seatWind) details.push({ name: '門風', fan: 1 });
      if (t.value === roundWind) details.push({ name: '圈風', fan: 1 });
    }
  }

  // 雀頭亦計小三元／小四喜判斷
  const pair = shape.pair[0];
  if (pair.suit === 'dragon') {
    // 小三元：兩組箭刻＋一組箭眼
    if (dragonPongs === 2) details.push({ name: '小三元', fan: 5 });
  }
  if (dragonPongs === 3) details.push({ name: '大三元', fan: 8 });

  if (windPongs === 3 && pair.suit === 'wind') {
    details.push({ name: '小四喜', fan: 5 });
  }
  if (windPongs === 4) details.push({ name: '大四喜', fan: 10 });

  void winningTile;
}

function addFlowerFans(details: FanDetail[], player: PlayerState): void {
  const seat = player.seatWind; // 0-3 → 花 1-4 春夏秋冬 / 5-8 梅蘭菊竹
  let n = 0;
  for (const f of player.flowers) {
    // 正花：春/梅=東, 夏/蘭=南, 秋/菊=西, 冬/竹=北
    const season = ((f.value - 1) % 4);
    if (season === seat) n += 1;
  }
  // 每朵花至少 1 番（簡化：所有花各 1，正花已含）
  if (player.flowers.length > 0) {
    details.push({ name: `花牌 ×${player.flowers.length}`, fan: player.flowers.length });
  }
  // 避免正花重複加——上面已用總數簡化
  void n;
}

function sum(details: FanDetail[]): number {
  return details.reduce((s, d) => s + d.fan, 0);
}

export function evaluateWin(
  ctx: ScoreContext,
  minFan: number,
): WinInfo | null {
  const { fan, details } = calculateFan(ctx);
  if (fan < minFan) return null;
  return {
    winner: ctx.player.id,
    loser: ctx.isSelfDraw ? null : (ctx.discardedBy ?? null),
    fan,
    details,
    winningTile: ctx.winningTile,
    isSelfDraw: ctx.isSelfDraw,
  };
}

/** 檢查摸牌／打牌後是否達到起糊番數 */
export function checkWinEligible(
  player: PlayerState,
  tile: Tile,
  isSelfDraw: boolean,
  prevailingWind: Wind,
  minFan: number,
  discardedBy: number | null = null,
): { fan: number; details: FanDetail[] } | null {
  // 暫時把 tile 當贏牌（手牌尚未含此張時要傳入手牌不含）
  const handWithout = player.hand.filter((t) => t.id !== tile.id);
  const hasInHand = player.hand.some((t) => t.id === tile.id);
  const hand = hasInHand ? handWithout : player.hand;

  if (!canWinStandard(hand, player.melds, tile) &&
      !isSevenPairs([...hand, tile], player.melds) &&
      !isThirteenOrphans([...hand, tile], player.melds)) {
    return null;
  }

  const { fan, details } = calculateFan({
    player: { ...player, hand },
    winningTile: tile,
    isSelfDraw,
    prevailingWind,
    discardedBy,
  });
  if (fan < minFan) return null;
  return { fan, details };
}

export function estimateHandPotential(player: PlayerState): number {
  // AI 用粗略潛力：混一色進度、對子數、刻子數
  const all = [...player.hand, ...player.melds.flatMap((m) => m.tiles)];
  const suited = all.filter((t) => t.suit === 'man' || t.suit === 'pin' || t.suit === 'sou');
  const bySuit = { man: 0, pin: 0, sou: 0 };
  for (const t of suited) bySuit[t.suit as 'man' | 'pin' | 'sou']++;
  const maxSuit = Math.max(bySuit.man, bySuit.pin, bySuit.sou);
  const counts = new Map<string, number>();
  for (const t of player.hand) {
    const k = tileKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let pairs = 0;
  let pungs = 0;
  for (const c of counts.values()) {
    if (c >= 2) pairs++;
    if (c >= 3) pungs++;
  }
  return maxSuit * 2 + pairs * 3 + pungs * 5 + player.melds.length * 4 + player.flowers.length;
}
