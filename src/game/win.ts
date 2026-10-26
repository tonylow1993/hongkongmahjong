import type { Meld, Tile } from './types';
import { countByKey, isHonor, isSuited, sameTile, tileKey } from './tiles';

export interface WinShape {
  pair: Tile[];
  melds: Tile[][]; // each 3 tiles (chow or pong); kongs counted as pong for shape
}

/** 手牌＋叫牌後是否組成標準型（4 面子 + 1 雀頭），不含花 */
export function canWinStandard(hand: Tile[], melds: Meld[], winningTile: Tile): WinShape | null {
  const openMelds = melds.length;
  const needed = 4 - openMelds;
  const tiles = [...hand, winningTile];
  if (tiles.length !== needed * 3 + 2) return null;

  const shapes = findShapes(tiles, needed);
  return shapes[0] ?? null;
}

export function isWinningHand(hand: Tile[], melds: Meld[], winningTile: Tile): boolean {
  if (isThirteenOrphans([...hand, winningTile], melds)) return true;
  if (isSevenPairs([...hand, winningTile], melds)) return true;
  return canWinStandard(hand, melds, winningTile) !== null;
}

/** 七對子（香港常見變體；門清無副露） */
export function isSevenPairs(tiles: Tile[], melds: Meld[]): boolean {
  if (melds.length > 0 || tiles.length !== 14) return false;
  const counts = countByKey(tiles);
  let pairs = 0;
  for (const list of counts.values()) {
    if (list.length === 2) pairs++;
    else return false;
  }
  return pairs === 7;
}

/** 十三幺 */
export function isThirteenOrphans(tiles: Tile[], melds: Meld[]): boolean {
  if (melds.length > 0 || tiles.length !== 14) return false;
  const terminals = new Set([
    'man-1', 'man-9', 'pin-1', 'pin-9', 'sou-1', 'sou-9',
    'wind-1', 'wind-2', 'wind-3', 'wind-4',
    'dragon-1', 'dragon-2', 'dragon-3',
  ]);
  const keys = tiles.map(tileKey);
  const uniq = new Set(keys);
  if (uniq.size !== 13) return false;
  for (const k of uniq) if (!terminals.has(k)) return false;
  // 其中一隻要有對
  const counts = countByKey(tiles);
  let hasPair = false;
  for (const list of counts.values()) {
    if (list.length === 2) hasPair = true;
    else if (list.length !== 1) return false;
  }
  return hasPair;
}

function findShapes(tiles: Tile[], neededMelds: number): WinShape[] {
  const results: WinShape[] = [];
  const counts = toCountMap(tiles);

  for (const key of [...counts.keys()]) {
    if ((counts.get(key) ?? 0) < 2) continue;
    const pairTiles = take(counts, key, 2);
    const melds: Tile[][] = [];
    if (searchMelds(counts, neededMelds, melds)) {
      results.push({ pair: pairTiles, melds: [...melds] });
    }
    putBack(counts, key, 2);
    if (results.length > 0) return results; // 找到一種即可
  }
  return results;
}

function searchMelds(
  counts: Map<string, number>,
  remaining: number,
  out: Tile[][],
): boolean {
  if (remaining === 0) return totalCount(counts) === 0;

  const nextKey = firstNonZero(counts);
  if (!nextKey) return false;

  // 刻子
  if ((counts.get(nextKey) ?? 0) >= 3) {
    const m = take(counts, nextKey, 3);
    out.push(m);
    if (searchMelds(counts, remaining - 1, out)) return true;
    out.pop();
    putBack(counts, nextKey, 3);
  }

  // 順子
  const [suit, valStr] = nextKey.split('-');
  const val = Number(valStr);
  if ((suit === 'man' || suit === 'pin' || suit === 'sou') && val <= 7) {
    const k2 = `${suit}-${val + 1}`;
    const k3 = `${suit}-${val + 2}`;
    if ((counts.get(nextKey) ?? 0) >= 1 && (counts.get(k2) ?? 0) >= 1 && (counts.get(k3) ?? 0) >= 1) {
      const m = [...take(counts, nextKey, 1), ...take(counts, k2, 1), ...take(counts, k3, 1)];
      out.push(m);
      if (searchMelds(counts, remaining - 1, out)) return true;
      out.pop();
      putBack(counts, nextKey, 1);
      putBack(counts, k2, 1);
      putBack(counts, k3, 1);
    }
  }
  return false;
}

function toCountMap(tiles: Tile[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tiles) m.set(tileKey(t), (m.get(tileKey(t)) ?? 0) + 1);
  return m;
}

function take(counts: Map<string, number>, key: string, n: number): Tile[] {
  counts.set(key, (counts.get(key) ?? 0) - n);
  const [suit, val] = key.split('-');
  return Array.from({ length: n }, () => ({
    id: `tmp-${key}-${Math.random()}`,
    suit: suit as Tile['suit'],
    value: Number(val),
  }));
}

function putBack(counts: Map<string, number>, key: string, n: number): void {
  counts.set(key, (counts.get(key) ?? 0) + n);
}

function firstNonZero(counts: Map<string, number>): string | null {
  for (const [k, v] of counts) if (v > 0) return k;
  return null;
}

function totalCount(counts: Map<string, number>): number {
  let n = 0;
  for (const v of counts.values()) n += v;
  return n;
}

/** 找出可吃的組合 */
export function findChows(hand: Tile[], discarded: Tile): Tile[][] {
  if (!isSuited(discarded)) return [];
  const results: Tile[][] = [];
  const v = discarded.value;
  const suit = discarded.suit;
  const inHand = hand.filter((t) => t.suit === suit);

  const tryCombo = (a: number, b: number) => {
    const ta = inHand.find((t) => t.value === a);
    const tb = inHand.find((t) => t.value === b && t.id !== ta?.id);
    if (ta && tb) results.push([ta, tb, discarded]);
  };

  if (v >= 3) tryCombo(v - 2, v - 1);
  if (v >= 2 && v <= 8) tryCombo(v - 1, v + 1);
  if (v <= 7) tryCombo(v + 1, v + 2);

  // 去重
  const seen = new Set<string>();
  return results.filter((combo) => {
    const key = combo
      .filter((t) => !sameTile(t, discarded))
      .map((t) => t.id)
      .sort()
      .join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function canPong(hand: Tile[], discarded: Tile): boolean {
  return hand.filter((t) => sameTile(t, discarded)).length >= 2;
}

export function canKong(hand: Tile[], discarded: Tile): boolean {
  return hand.filter((t) => sameTile(t, discarded)).length >= 3;
}

export function findConcealedKongs(hand: Tile[]): Tile[][] {
  const counts = countByKey(hand);
  const out: Tile[][] = [];
  for (const list of counts.values()) {
    if (list.length === 4) out.push(list);
  }
  return out;
}

export function findPromotedKongs(hand: Tile[], melds: Meld[]): Tile[][] {
  const out: Tile[][] = [];
  for (const meld of melds) {
    if (meld.kind !== 'pong') continue;
    const match = hand.find((t) => sameTile(t, meld.tiles[0]));
    if (match) out.push([match, ...meld.tiles]);
  }
  return out;
}

export function allMeldsArePongs(melds: Meld[], shape: WinShape | null): boolean {
  if (!shape) return false;
  for (const m of melds) {
    if (m.kind === 'chow') return false;
  }
  for (const m of shape.melds) {
    if (!(sameTile(m[0], m[1]) && sameTile(m[1], m[2]))) return false;
  }
  return true;
}

export function getHandSuitProfile(
  hand: Tile[],
  melds: Meld[],
  winningTile?: Tile,
): { suits: Set<string>; hasHonors: boolean } {
  const all = [
    ...hand,
    ...(winningTile ? [winningTile] : []),
    ...melds.flatMap((m) => m.tiles),
  ];
  const suits = new Set<string>();
  let hasHonors = false;
  for (const t of all) {
    if (isHonor(t)) hasHonors = true;
    else if (isSuited(t)) suits.add(t.suit);
  }
  return { suits, hasHonors };
}
