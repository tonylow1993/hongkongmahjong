import { isHonor, isSeatFlower, isSuited, sameTile, tileKey } from '../game/tiles';
import type { ClaimOption, GameState, PlayerState, Suit, Tile, Wind } from '../game/types';

/**
 * 三番起糊決策：先定合法番型，再比向聽與進張，
 * 無番不開門；終盤或他家聽牌信號則改走安全牌。
 */

type NumSuit = 'man' | 'pin' | 'sou';
type Path = 'mixed' | 'pung' | 'concealed' | 'honor' | 'fold';
type Phase = 'early' | 'mid' | 'late';

const NUM_SUITS: NumSuit[] = ['man', 'pin', 'sou'];

export function scoreDiscardCandidate(state: GameState, playerId: number, tile: Tile): number {
  const player = state.players[playerId];
  const phase = phaseOf(state);
  const path = choosePath(state, playerId);
  const open = player.melds.length;
  const before = shanten(player.hand, open);
  const afterHand = player.hand.filter((t) => t.id !== tile.id);
  const after = shanten(afterHand, open);
  const threat = tableThreat(state, playerId);
  const outs = before <= 1 ? ukeire(player.hand, open, state) : 0;
  const folding = shouldFold(path, before, outs, threat, phase, fanFloor(state, playerId, path));

  if (folding) return safetyScore(state, playerId, tile) * 12 - (after - before) * 8;

  let score = (before - after) * 55;

  const copies = player.hand.filter((t) => sameTile(t, tile)).length;
  if (copies >= 3) score -= 90;
  else if (copies === 2) score -= 48;

  const target = targetSuit(player);
  const fanHonor = isFanHonor(tile, player, state.prevailingWind);
  const guest = tile.suit === 'wind' && !fanHonor;

  if (guest && copies === 1) score += 70;
  if (tile.suit === 'dragon' && copies === 1 && path !== 'honor' && path !== 'mixed') score += 18;
  if (fanHonor && copies === 1 && (path === 'honor' || path === 'mixed')) score -= 35;
  if (fanHonor && copies >= 2) score -= 70;

  if (isSuited(tile)) {
    const suit = tile.suit as NumSuit;
    const n = suitCount(player, suit);
    if (path === 'mixed' || path === 'concealed') {
      if (suit === target) score -= 28;
      else score += 22 + Math.max(0, 4 - n) * 4;
    }
    if (path === 'pung' && copies === 1) score += 16;
    if (isTerminal(tile) && copies === 1 && !connected(player.hand, tile)) score += 24;
    else if ((tile.value === 2 || tile.value === 8) && copies === 1 && !connected(player.hand, tile)) {
      score += 14;
    }
    if (inCompound(player.hand, tile)) score -= 36;
    if (isRyanmenPart(player.hand, tile)) score -= 18;
  }

  const upper = state.players[(playerId + 3) % 4];
  const dumped = dumpedSuit(upper);
  if (dumped && tile.suit === dumped && (path === 'mixed' || path === 'concealed')) score -= 16;

  const lowerHot = state.players[(playerId + 1) % 4].melds.length > 0 || phase === 'early';
  if (lowerHot && isLiveMiddle(state, tile) && phase !== 'late') score -= 20;

  score += tableVisible(state, tile) * 4;
  return score;
}

export function scoreClaim(state: GameState, playerId: number, opt: ClaimOption): number {
  if (opt.kind === 'pass') return 0;
  if (opt.kind === 'win') return 1000 + (opt.fan ?? 0) * 10;

  const player = state.players[playerId];
  const path = choosePath(state, playerId);
  const phase = phaseOf(state);
  const threat = tableThreat(state, playerId);
  const discard = state.lastDiscard;
  if (!discard || !opt.tiles) return -1;

  if (path === 'fold' || (threat >= 2 && shanten(player.hand, player.melds.length) >= 1)) return -30;
  if (path === 'concealed' && opt.kind !== 'kong') return -40;

  const removed = opt.tiles.filter((t) => player.hand.some((h) => h.id === t.id));
  const nextHand = player.hand.filter((h) => !removed.some((t) => t.id === h.id));
  const before = shanten(player.hand, player.melds.length);
  const after = shanten(nextHand, player.melds.length + 1);
  const step = before - after;

  if (opt.kind === 'kong') {
    if (path === 'concealed') return -20;
    return step >= 0 && state.wall.length > 8 ? 42 : -5;
  }

  const fanTile = isFanHonor(discard, player, state.prevailingWind);
  const target = targetSuit(player);
  const locksFan =
    fanTile ||
    path === 'pung' ||
    (path === 'mixed' && discard.suit === target) ||
    (path === 'honor' && (fanTile || ownFlowerCount(player) > 0 || hasFanMeld(player, state.prevailingWind)));

  if (!locksFan) return -25;
  if (step < 1 && before > 1) return -15;
  if (before >= 3) return -20;
  if (phase === 'late' && after > 0) return -10;
  if (opt.kind === 'chow' && after > 1) return -8;

  let score = 10 + step * 28;
  if (opt.kind === 'pong' && fanTile) score += 30;
  if (opt.kind === 'pong' && path === 'pung') score += 18;
  if (opt.kind === 'chow') score -= 6;
  return score;
}

export function allowSelfKong(state: GameState, playerId: number): boolean {
  const path = choosePath(state, playerId);
  if (path === 'fold') return false;
  return state.wall.length > 8;
}

function choosePath(state: GameState, playerId: number): Path {
  const player = state.players[playerId];
  const phase = phaseOf(state);
  const threat = tableThreat(state, playerId);
  const openChow = player.melds.some((m) => m.kind === 'chow');
  const open = player.melds.length;
  const sh = shanten(player.hand, open);
  if (threat >= 2 && sh >= 1 && phase !== 'early') return 'fold';

  const target = targetSuit(player);
  const targetN = suitCount(player, target);
  const fanPairs = fanPairCount(player, state.prevailingWind);
  const pairN = pairCount(player.hand);
  const suitPairs = pairCount(player.hand.filter((t) => t.suit === target));
  const shape = suitShape(player.hand, target);
  const upperKeepsTarget = dumpedSuit(state.players[(playerId + 3) % 4]) !== target;

  if (!openChow && (pairN >= 4 || suitPairs >= 3 || player.melds.filter((m) => m.kind !== 'chow').length >= 2 && pairN >= 2)) {
    return 'pung';
  }
  if (targetN >= 6 && (fanPairs > 0 || ownFlowerCount(player) > 0 || !upperKeepsTarget || shape.ryanmen > 0)) {
    return 'mixed';
  }
  if (fanPairs > 0 || ownFlowerCount(player) > 0) return 'honor';
  if (open === 0) return 'concealed';
  if (targetN >= 7) return 'mixed';
  return phase === 'late' && sh >= 2 ? 'fold' : 'honor';
}

function shouldFold(
  path: Path,
  sh: number,
  outs: number,
  threat: number,
  phase: Phase,
  fan: number,
): boolean {
  if (path === 'fold') return true;
  if (threat === 0 && phase !== 'late') return false;
  const pushing = sh <= 0 && fan >= 4 && outs >= 4;
  if (pushing) return false;
  return threat >= 1 || (phase === 'late' && sh >= 1);
}

function fanFloor(state: GameState, playerId: number, path: Path): number {
  const player = state.players[playerId];
  let fan = ownFlowerCount(player);
  if (path === 'mixed') fan += 3;
  if (path === 'pung') fan += 3;
  if (path === 'concealed' && player.melds.length === 0) fan += 2;
  for (const m of player.melds) {
    const t = m.tiles[0];
    if (m.kind === 'chow' || !t) continue;
    if (t.suit === 'dragon') fan += 1;
    if (t.suit === 'wind') {
      if (t.value === player.seatWind + 1) fan += 1;
      if (t.value === state.prevailingWind + 1) fan += 1;
    }
  }
  return fan;
}

function phaseOf(state: GameState): Phase {
  const n = state.players.reduce((s, p) => s + p.discards.length, 0);
  if (n < 16) return 'early';
  if (n < 36) return 'mid';
  return 'late';
}

/** 他家聽牌信號：多次副露、某門完全不打、或突然只打熟張 */
function tableThreat(state: GameState, playerId: number): number {
  let level = 0;
  for (const p of state.players) {
    if (p.id === playerId) continue;
    if (p.melds.length >= 3) level = Math.max(level, 2);
    else if (p.melds.length === 2) level = Math.max(level, 1);
    const suited = { man: 0, pin: 0, sou: 0 };
    let honors = 0;
    for (const t of p.discards) {
      if (t.suit === 'man' || t.suit === 'pin' || t.suit === 'sou') suited[t.suit]++;
      else honors++;
    }
    const dumped = Math.max(suited.man, suited.pin, suited.sou);
    const missing = NUM_SUITS.filter((s) => suited[s] === 0).length;
    if (p.discards.length >= 8 && missing >= 2 && dumped >= 5) level = Math.max(level, 2);
    const recent = p.discards.slice(-4);
    if (p.discards.length >= 8 && recent.length === 4 && recent.every((t) => isHonor(t) || isTerminal(t))) {
      level = Math.max(level, 1);
    }
    void honors;
  }
  return level;
}

function safetyScore(state: GameState, playerId: number, tile: Tile): number {
  const upper = state.players[(playerId + 3) % 4];
  const last = upper.discards[upper.discards.length - 1];
  if (last && sameTile(last, tile)) return 100;

  const shown = tableVisible(state, tile);
  if (shown >= 3) return 96;
  if (isHonor(tile) && shown >= 2) return 88;
  if (isSuited(tile) && kabeSafe(state, playerId, tile)) return 80;
  if (isTerminal(tile) || isHonor(tile)) return 55;
  if (tile.value === 2 || tile.value === 8) return 30;
  return 8 - shown;
}

function kabeSafe(state: GameState, playerId: number, tile: Tile): boolean {
  if (!isSuited(tile)) return false;
  const own = state.players[playerId].hand;
  const vis = (value: number) =>
    countVisible(state, { suit: tile.suit, value }, own);
  if (tile.value <= 3 && vis(tile.value + 2) >= 4) return true;
  if (tile.value >= 7 && vis(tile.value - 2) >= 4) return true;
  return false;
}

function isLiveMiddle(state: GameState, tile: Tile): boolean {
  return isSuited(tile) && tile.value >= 3 && tile.value <= 7 && tableVisible(state, tile) === 0;
}

function tableVisible(state: GameState, tile: Tile): number {
  let n = 0;
  for (const p of state.players) {
    n += p.discards.filter((t) => sameTile(t, tile)).length;
    for (const m of p.melds) n += m.tiles.filter((t) => sameTile(t, tile)).length;
  }
  return n;
}

function countVisible(state: GameState, sample: { suit: Suit; value: number }, own: Tile[]): number {
  let n = own.filter((t) => t.suit === sample.suit && t.value === sample.value).length;
  for (const p of state.players) {
    n += p.discards.filter((t) => t.suit === sample.suit && t.value === sample.value).length;
    for (const m of p.melds) {
      n += m.tiles.filter((t) => t.suit === sample.suit && t.value === sample.value).length;
    }
  }
  return n;
}

function targetSuit(player: PlayerState): NumSuit {
  let best: NumSuit = 'man';
  let n = -1;
  for (const s of NUM_SUITS) {
    const c = suitCount(player, s);
    if (c > n) {
      n = c;
      best = s;
    }
  }
  return best;
}

function suitCount(player: PlayerState, suit: NumSuit): number {
  const hand = player.hand.filter((t) => t.suit === suit).length;
  const meld = player.melds.flatMap((m) => m.tiles).filter((t) => t.suit === suit).length;
  return hand + meld;
}

function fanPairCount(player: PlayerState, wind: Wind): number {
  const counts = new Map<string, number>();
  for (const t of player.hand) {
    if (!isFanHonor(t, player, wind)) continue;
    const k = tileKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let n = 0;
  for (const c of counts.values()) if (c >= 2) n++;
  return n;
}

function pairCount(tiles: Tile[]): number {
  const counts = new Map<string, number>();
  for (const t of tiles) counts.set(tileKey(t), (counts.get(tileKey(t)) ?? 0) + 1);
  let n = 0;
  for (const c of counts.values()) if (c >= 2) n++;
  return n;
}

function hasFanMeld(player: PlayerState, wind: Wind): boolean {
  return player.melds.some((m) => m.kind !== 'chow' && isFanHonor(m.tiles[0], player, wind));
}

function ownFlowerCount(player: PlayerState): number {
  return player.flowers.filter((f) => isSeatFlower(f, player.seatWind)).length;
}

function isFanHonor(tile: Tile, player: PlayerState, wind: Wind): boolean {
  if (tile.suit === 'dragon') return true;
  if (tile.suit !== 'wind') return false;
  return tile.value === player.seatWind + 1 || tile.value === wind + 1;
}

function isTerminal(tile: Tile): boolean {
  return isSuited(tile) && (tile.value === 1 || tile.value === 9);
}

function connected(hand: Tile[], tile: Tile): boolean {
  if (!isSuited(tile)) return false;
  return hand.some(
    (t) => t.suit === tile.suit && t.id !== tile.id && Math.abs(t.value - tile.value) <= 2,
  );
}

function inCompound(hand: Tile[], tile: Tile): boolean {
  if (!isSuited(tile)) return false;
  const has = (v: number) => hand.some((t) => t.suit === tile.suit && t.value === v);
  for (let start = tile.value - 3; start <= tile.value; start++) {
    if (start < 1 || start > 6) continue;
    if ([0, 1, 2, 3].every((d) => has(start + d))) return true;
  }
  return false;
}

function isRyanmenPart(hand: Tile[], tile: Tile): boolean {
  if (!isSuited(tile) || tile.value < 2 || tile.value > 8) return false;
  const has = (v: number) => hand.some((t) => t.id !== tile.id && t.suit === tile.suit && t.value === v);
  return (has(tile.value - 1) && tile.value < 8) || (has(tile.value + 1) && tile.value > 2);
}

function suitShape(hand: Tile[], suit: NumSuit): { ryanmen: number } {
  const vals = hand.filter((t) => t.suit === suit).map((t) => t.value);
  const has = (v: number) => vals.includes(v);
  let ryanmen = 0;
  for (let v = 2; v <= 7; v++) {
    if (has(v) && has(v + 1)) ryanmen++;
  }
  return { ryanmen };
}

function dumpedSuit(player: PlayerState): NumSuit | null {
  const c = { man: 0, pin: 0, sou: 0 };
  for (const t of player.discards) {
    if (t.suit === 'man' || t.suit === 'pin' || t.suit === 'sou') c[t.suit]++;
  }
  const best = NUM_SUITS.reduce((a, b) => (c[b] > c[a] ? b : a));
  if (c[best] >= 3 && c[best] >= player.discards.length * 0.55) return best;
  return null;
}

/** 標準型向聽。完成形為 -1，聽牌為 0。 */
const shantenCache = new Map<string, number>();

export function shanten(tiles: Tile[], openMelds: number): number {
  const key =
    tiles
      .map((t) => tileKey(t))
      .sort()
      .join(',') + `|${openMelds}`;
  const cached = shantenCache.get(key);
  if (cached !== undefined) return cached;
  if (shantenCache.size > 4000) shantenCache.clear();

  const c = new Array<number>(34).fill(0);
  for (const t of tiles) {
    const i = tileIndex(t);
    if (i >= 0) c[i]++;
  }
  const memo = new Map<string, number>();

  const search = (m: number, t: number, p: number): number => {
    const key = `${c.join('')}|${m}${t}${p}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    const groups = m + openMelds;
    const useT = Math.min(t, Math.max(0, 4 - groups));
    let best = 8 - 2 * groups - useT - (p ? 1 : 0);

    let i = 0;
    while (i < 34 && c[i] === 0) i++;
    if (i === 34 || best <= -1) {
      memo.set(key, best);
      return best;
    }

    if (c[i] >= 3 && groups < 4) {
      c[i] -= 3;
      best = Math.min(best, search(m + 1, t, p));
      c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0 && groups < 4) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      best = Math.min(best, search(m + 1, t, p));
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
    if (groups + t < 4) {
      if (c[i] >= 2) {
        c[i] -= 2;
        best = Math.min(best, search(m, t + 1, p));
        c[i] += 2;
      }
      if (i < 27 && i % 9 <= 7 && c[i + 1] > 0) {
        c[i]--;
        c[i + 1]--;
        best = Math.min(best, search(m, t + 1, p));
        c[i]++;
        c[i + 1]++;
      }
      if (i < 27 && i % 9 <= 6 && c[i + 2] > 0) {
        c[i]--;
        c[i + 2]--;
        best = Math.min(best, search(m, t + 1, p));
        c[i]++;
        c[i + 2]++;
      }
    }
    if (p === 0 && c[i] >= 2) {
      c[i] -= 2;
      best = Math.min(best, search(m, t, 1));
      c[i] += 2;
    }
    c[i]--;
    best = Math.min(best, search(m, t, p));
    c[i]++;

    memo.set(key, best);
    return best;
  };

  const result = search(0, 0, 0);
  shantenCache.set(key, result);
  return result;
}

const ukeireCache = new Map<string, number>();

function ukeire(hand: Tile[], openMelds: number, state: GameState): number {
  const key = hand.map((t) => t.id).sort().join(',') + `|${openMelds}|${state.turn}`;
  const cached = ukeireCache.get(key);
  if (cached !== undefined) return cached;
  if (ukeireCache.size > 200) ukeireCache.clear();
  const base = shanten(hand, openMelds);
  let outs = 0;
  const sample: Tile = { id: 'uke', suit: 'man', value: 1 };
  for (let i = 0; i < 34; i++) {
    const tile = tileFromIndex(i, sample);
    const vis =
      hand.filter((t) => sameTile(t, tile)).length + tableVisible(state, tile);
    const left = 4 - Math.min(4, vis);
    if (left <= 0) continue;
    if (shanten([...hand, tile], openMelds) < base) outs += left;
  }
  ukeireCache.set(key, outs);
  return outs;
}

function tileIndex(t: Tile): number {
  if (t.suit === 'man') return t.value - 1;
  if (t.suit === 'pin') return 9 + t.value - 1;
  if (t.suit === 'sou') return 18 + t.value - 1;
  if (t.suit === 'wind') return 27 + t.value - 1;
  if (t.suit === 'dragon') return 31 + t.value - 1;
  return -1;
}

function tileFromIndex(i: number, sample: Tile): Tile {
  if (i < 27) {
    const suit = NUM_SUITS[Math.floor(i / 9)];
    return { ...sample, id: `uke-${i}`, suit, value: (i % 9) + 1 };
  }
  if (i < 31) return { ...sample, id: `uke-${i}`, suit: 'wind', value: i - 26 };
  return { ...sample, id: `uke-${i}`, suit: 'dragon', value: i - 30 };
}
