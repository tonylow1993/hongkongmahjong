import { isSuited, sameTile } from '../game/tiles';
import type { ClaimOption, GameState, Tile } from '../game/types';
import { shanten } from './policy';
import type { AIAgent } from './types';
import { LEARNED_WEIGHTS } from './learned-weights';

/**
 * 線性決策模型。
 * 每個合法動作有一條特徵，分數 = 權重 · 特徵，取得分最高者。
 * 權重由 src/ai/train.ts 對啟發式自對局、以淨辣為目標更新。
 */
export class LearnedAI implements AIAgent {
  readonly id = 'learned-v1';
  readonly name = '對局模型';
  discardW: number[];
  claimW: number[];

  constructor(weights: { discard: number[]; claim: number[] } = LEARNED_WEIGHTS) {
    this.discardW = weights.discard.slice();
    this.claimW = weights.claim.slice();
  }

  chooseDiscard(state: GameState, playerId: number, legal: Tile[]): Tile {
    let best = legal[0];
    let bestScore = -Infinity;
    for (const tile of legal) {
      const score = dot(this.discardW, discardFeatures(state, playerId, tile));
      if (score > bestScore) {
        bestScore = score;
        best = tile;
      }
    }
    return best;
  }

  chooseClaim(state: GameState, playerId: number, options: ClaimOption[]): ClaimOption {
    let best = options[0];
    let bestScore = -Infinity;
    for (const opt of options) {
      const score = dot(this.claimW, claimFeatures(state, playerId, opt));
      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }
    return best;
  }

  chooseSelfAction(
    state: GameState,
    playerId: number,
    options: ClaimOption[],
  ): ClaimOption | null {
    const win = options.find((o) => o.kind === 'win');
    if (win) return win;
    const kong = options.find((o) => o.kind === 'kong');
    if (!kong) return null;
    const score = dot(this.claimW, claimFeatures(state, playerId, kong));
    const pass = dot(this.claimW, claimFeatures(state, playerId, { kind: 'pass' }));
    return score > pass ? kong : null;
  }
}

export const DISCARD_FEATURE_NAMES = [
  'bias',
  'shantenAfter',
  'shantenDelta',
  'copies',
  'danger',
  'guestWind',
  'fanHonor',
  'terminal',
  'middle',
  'suitShare',
  'hasPair',
  'seen',
  'late',
  'threat',
  'wall',
] as const;

export const CLAIM_FEATURE_NAMES = [
  'bias',
  'win',
  'pong',
  'chow',
  'kong',
  'pass',
  'fan',
  'shantenGain',
] as const;

export function discardFeatures(state: GameState, playerId: number, tile: Tile): number[] {
  const player = state.players[playerId];
  const open = player.melds.length;
  const before = shanten(player.hand, open);
  const after = shanten(
    player.hand.filter((t) => t.id !== tile.id),
    open,
  );
  const copies = player.hand.filter((t) => sameTile(t, tile)).length;
  let seen = 0;
  for (const p of state.players) {
    seen += p.discards.filter((t) => sameTile(t, tile)).length;
    for (const m of p.melds) seen += m.tiles.filter((t) => sameTile(t, tile)).length;
  }
  const seat = player.seatWind + 1;
  const round = state.prevailingWind + 1;
  const fanHonor =
    tile.suit === 'dragon' || (tile.suit === 'wind' && (tile.value === seat || tile.value === round));
  const guest = tile.suit === 'wind' && !fanHonor;
  const suitN = player.hand.filter((t) => t.suit === tile.suit).length;
  const discards = state.players.reduce((n, p) => n + p.discards.length, 0);
  let threat = 0;
  for (const p of state.players) {
    if (p.id !== playerId && p.melds.length >= 3) threat = 2;
    else if (p.id !== playerId && p.melds.length === 2) threat = Math.max(threat, 1);
  }

  return [
    1,
    after / 8,
    (after - before) / 4,
    copies / 4,
    seen / 4,
    guest ? 1 : 0,
    fanHonor ? 1 : 0,
    isSuited(tile) && (tile.value === 1 || tile.value === 9) ? 1 : 0,
    isSuited(tile) && tile.value >= 3 && tile.value <= 7 ? 1 : 0,
    suitN / Math.max(1, player.hand.length),
    copies >= 2 ? 1 : 0,
    seen / 4,
    discards >= 36 ? 1 : 0,
    threat / 2,
    state.wall.length / 80,
  ];
}

export function claimFeatures(state: GameState, playerId: number, opt: ClaimOption): number[] {
  const player = state.players[playerId];
  let gain = 0;
  if (opt.kind !== 'pass' && opt.kind !== 'win' && opt.tiles) {
    const removed = opt.tiles.filter((t) => player.hand.some((h) => h.id === t.id));
    const next = player.hand.filter((h) => !removed.some((t) => t.id === h.id));
    const before = shanten(player.hand, player.melds.length);
    const after = shanten(next, player.melds.length + (opt.kind === 'kong' ? 1 : 1));
    gain = (before - after) / 4;
  }
  return [
    1,
    opt.kind === 'win' ? 1 : 0,
    opt.kind === 'pong' ? 1 : 0,
    opt.kind === 'chow' ? 1 : 0,
    opt.kind === 'kong' ? 1 : 0,
    opt.kind === 'pass' ? 1 : 0,
    (opt.fan ?? 0) / 8,
    gain,
  ];
}

function dot(w: number[], x: number[]): number {
  let s = 0;
  const n = Math.min(w.length, x.length);
  for (let i = 0; i < n; i++) s += w[i] * x[i];
  return s;
}
