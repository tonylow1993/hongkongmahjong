import { estimateHandPotential } from '../game/scoring';
import { tileKey } from '../game/tiles';
import type { GameState, Tile } from '../game/types';

export const FEATURE_NAMES = [
  'handSize',
  'meldCount',
  'flowerCount',
  'wallLeft',
  'seatWind',
  'prevailingWind',
  'isDealer',
  'potential',
  'pairCount',
  'pongCount',
  'isolatedCount',
  'suitMan',
  'suitPin',
  'suitSou',
  'honorCount',
  'discardDanger', // 粗略：場上同牌已出數
] as const;

/**
 * 將局面壓縮成固定長度數值向量，方便日後訓練模型。
 * 可隨時擴充特徵而不影響 AIAgent 介面。
 */
export function extractFeatures(
  state: GameState,
  playerId: number,
  candidate?: Tile,
): { values: number[]; names: string[] } {
  const p = state.players[playerId];
  const hand = p.hand;
  const counts = new Map<string, number>();
  for (const t of hand) {
    const k = tileKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  let pairs = 0;
  let pongs = 0;
  let isolated = 0;
  for (const c of counts.values()) {
    if (c >= 3) pongs++;
    else if (c === 2) pairs++;
    else if (c === 1) isolated++;
  }

  const suitMan = hand.filter((t) => t.suit === 'man').length;
  const suitPin = hand.filter((t) => t.suit === 'pin').length;
  const suitSou = hand.filter((t) => t.suit === 'sou').length;
  const honorCount = hand.filter((t) => t.suit === 'wind' || t.suit === 'dragon').length;

  let discardDanger = 0;
  if (candidate) {
    const k = tileKey(candidate);
    for (const pl of state.players) {
      discardDanger += pl.discards.filter((t) => tileKey(t) === k).length;
      for (const m of pl.melds) {
        discardDanger += m.tiles.filter((t) => tileKey(t) === k).length;
      }
    }
  }

  const values = [
    hand.length,
    p.melds.length,
    p.flowers.length,
    state.wall.length,
    p.seatWind,
    state.prevailingWind,
    state.dealer === playerId ? 1 : 0,
    estimateHandPotential(p),
    pairs,
    pongs,
    isolated,
    suitMan,
    suitPin,
    suitSou,
    honorCount,
    discardDanger,
  ];

  return { values, names: [...FEATURE_NAMES] };
}

/** 為每張可出牌產生「出這張後」的特徵（含該牌危險度） */
export function featuresForDiscard(
  state: GameState,
  playerId: number,
  tile: Tile,
): { values: number[]; names: string[] } {
  return extractFeatures(state, playerId, tile);
}
