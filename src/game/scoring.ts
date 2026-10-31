import type { FanDetail, Meld, PlayerState, Tile, Wind, WinInfo } from './types';
import { FLOWER_LABELS, WIND_LABELS } from './types';
import { isSeatFlower, sameTile, tileKey } from './tiles';
import {
  allMeldsArePongs,
  canWinStandard,
  getHandSuitProfile,
  isPingHu,
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

  const shape = canWinStandard(hand, melds, winningTile);
  if (!shape) return { fan: 0, details: [] };

  // —— 牌型番 ——
  const allTiles: Tile[] = [
    ...hand,
    winningTile,
    ...melds.flatMap((m) => m.tiles),
  ];
  const allHonors = allTiles.every((t) => t.suit === 'wind' || t.suit === 'dragon');
  const allMeldsPongs = allMeldsArePongs(melds, shape);

  if (allHonors) {
    details.push({ name: '字一色', fan: 10 });
    addCommon(details, player, isSelfDraw, prevailingWind);
    if (player.flowers.length === 0) details.push({ name: '無花', fan: 1 });
    else addFlowerFans(details, player);
    return { fan: sum(details), details };
  }

  const allTerminals = allTiles.every(
    (t) => (t.suit === 'man' || t.suit === 'pin' || t.suit === 'sou') && (t.value === 1 || t.value === 9),
  );
  if (allTerminals && allMeldsPongs) {
    details.push({ name: '清么九', fan: 10 });
    addCommon(details, player, isSelfDraw, prevailingWind);
    if (player.flowers.length === 0) details.push({ name: '無花', fan: 1 });
    else addFlowerFans(details, player);
    return { fan: sum(details), details };
  }

  const allTerminalsOrHonors = allTiles.every(
    (t) =>
      t.suit === 'wind' ||
      t.suit === 'dragon' ||
      ((t.suit === 'man' || t.suit === 'pin' || t.suit === 'sou') && (t.value === 1 || t.value === 9)),
  );
  if (allTerminalsOrHonors && allMeldsPongs) {
    details.push({ name: '混么九', fan: 4 });
  } else if (allMeldsPongs) {
    details.push({ name: '對對糊', fan: 3 });
  } else if (isPingHu(hand, melds, winningTile)) {
    details.push({ name: '平胡', fan: 1 });
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
  // 暗槓不算副露（不露牌），保留門前清。只有吃、碰、明槓才破門清。
  const hasOpenMelds = player.melds.some((m) => m.kind !== 'concealedKong');
  if (!hasOpenMelds) details.push({ name: '門清', fan: 1 });
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
  const dragonNames: string[] = [];
  let seatWindPong = false;
  let roundWindPong = false;

  for (const m of allMelds) {
    if (!sameTile(m[0], m[1]) || !sameTile(m[1], m[2])) continue;
    const t = m[0];
    if (t.suit === 'dragon') {
      dragonPongs++;
      dragonNames.push(['中', '發', '白'][t.value - 1]);
    }
    if (t.suit === 'wind') {
      windPongs++;
      if (t.value === seatWind) seatWindPong = true;
      if (t.value === roundWind) roundWindPong = true;
    }
  }

  const pair = shape.pair[0];

  // 箭牌：大三元(8番) / 小三元(5番) / 單刻(1番)
  if (dragonPongs === 3) {
    details.push({ name: '大三元', fan: 8 });
  } else if (dragonPongs === 2 && pair.suit === 'dragon') {
    details.push({ name: '小三元', fan: 5 });
  } else {
    for (const name of dragonNames) {
      details.push({ name: `箭牌（${name}）`, fan: 1 });
    }
  }

  // 風牌：大四喜(10番) / 小四喜(5番) / 門風(1番) / 圈風(1番)
  if (windPongs === 4) {
    details.push({ name: '大四喜', fan: 10 });
  } else if (windPongs === 3 && pair.suit === 'wind') {
    details.push({ name: '小四喜', fan: 5 });
    if (seatWindPong) details.push({ name: `位風（${WIND_LABELS[seatWind - 1]}）`, fan: 1 });
    if (roundWindPong) details.push({ name: `圈風（${WIND_LABELS[roundWind - 1]}）`, fan: 1 });
  } else {
    if (seatWindPong) details.push({ name: `位風（${WIND_LABELS[seatWind - 1]}）`, fan: 1 });
    if (roundWindPong) details.push({ name: `圈風（${WIND_LABELS[roundWind - 1]}）`, fan: 1 });
  }

  void winningTile;
}

function addFlowerFans(details: FanDetail[], player: PlayerState): void {
  const flowerVals = new Set(player.flowers.map((f) => f.value));
  if (flowerVals.size === 8) {
    details.push({ name: '八仙過海（八花齊）', fan: 8 });
    return;
  }
  const hasSeasonSet = [1, 2, 3, 4].every((v) => flowerVals.has(v));
  const hasPlantSet = [5, 6, 7, 8].every((v) => flowerVals.has(v));
  if (hasSeasonSet) {
    details.push({ name: '一台花（春夏秋冬）', fan: 2 });
  }
  if (hasPlantSet) {
    details.push({ name: '一台花（梅蘭菊竹）', fan: 2 });
  }

  const own = player.flowers.filter((f) => isSeatFlower(f, player.seatWind));
  for (const f of own) {
    details.push({ name: `正花（${FLOWER_LABELS[f.value - 1]}）`, fan: 1 });
  }
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
  return maxSuit * 2 + pairs * 3 + pungs * 5 + player.melds.length * 4 +
    player.flowers.filter((f) => isSeatFlower(f, player.seatWind)).length;
}
