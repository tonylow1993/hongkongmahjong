import { estimateHandPotential } from '../game/scoring';
import { isHonor, sameTile, tileKey } from '../game/tiles';
import type { ClaimOption, GameState, Tile } from '../game/types';
import { featuresForDiscard, extractFeatures } from './features';
import { trainingLogger } from './logger';
import { RandomAI } from './random';
import type { AIAgent } from './types';

/**
 * 規則式啟發式 AI（初版）。
 * - 優先保留對子／刻子／同花色
 * - 危險牌（場上已多）較早丟
 * - 叫牌：糊 > 槓 > 碰 > 吃（視潛力）
 *
 * 所有決策都會寫入 trainingLogger，方便日後監督／強化訓練。
 */
export class HeuristicAI implements AIAgent {
  readonly id = 'heuristic-v1';
  readonly name = '啟發式 AI';

  chooseDiscard(state: GameState, playerId: number, legal: Tile[]): Tile {
    let best = legal[0];
    let bestScore = -Infinity;
    const labels = legal.map((t) => tileKey(t));

    legal.forEach((tile, index) => {
      const score = this.scoreDiscard(state, playerId, tile);
      if (score > bestScore) {
        bestScore = score;
        best = tile;
      }

      const feat = featuresForDiscard(state, playerId, tile);
      // 只在最後選定時記一筆（避免爆量）；此處先算，下面統一 log
      void feat;
      void index;
    });

    const chosen = legal.findIndex((t) => t.id === best.id);
    const feat = featuresForDiscard(state, playerId, best);
    trainingLogger.log({
      timestamp: Date.now(),
      agentId: this.id,
      playerId,
      phase: 'discard',
      features: feat.values,
      featureNames: feat.names,
      actionIndex: chosen,
      actionLabel: tileKey(best),
      legalActionLabels: labels,
      meta: { score: bestScore },
    });

    return best;
  }

  chooseClaim(state: GameState, playerId: number, options: ClaimOption[]): ClaimOption {
    const ranked = [...options].sort(
      (a, b) => this.claimScore(state, playerId, b) - this.claimScore(state, playerId, a),
    );
    const best = ranked[0];
    const labels = options.map((o) => o.kind + (o.fan ? `:${o.fan}` : ''));
    const feat = extractFeatures(state, playerId, state.lastDiscard ?? undefined);

    trainingLogger.log({
      timestamp: Date.now(),
      agentId: this.id,
      playerId,
      phase: 'claim',
      features: feat.values,
      featureNames: feat.names,
      actionIndex: options.indexOf(best),
      actionLabel: labels[options.indexOf(best)] ?? best.kind,
      legalActionLabels: labels,
    });

    return best;
  }

  chooseSelfAction(
    state: GameState,
    playerId: number,
    options: ClaimOption[],
  ): ClaimOption | null {
    if (options.length === 0) return null;
    // 能糊就糊；能槓則在牌牆還多時槓
    const win = options.find((o) => o.kind === 'win');
    if (win) {
      this.logSelf(state, playerId, options, win);
      return win;
    }
    const kong = options.find((o) => o.kind === 'kong');
    if (kong && state.wall.length > 20) {
      this.logSelf(state, playerId, options, kong);
      return kong;
    }
    return null;
  }

  private logSelf(
    state: GameState,
    playerId: number,
    options: ClaimOption[],
    chosen: ClaimOption,
  ): void {
    const labels = options.map((o) => o.kind);
    const feat = extractFeatures(state, playerId);
    trainingLogger.log({
      timestamp: Date.now(),
      agentId: this.id,
      playerId,
      phase: 'self',
      features: feat.values,
      featureNames: feat.names,
      actionIndex: options.indexOf(chosen),
      actionLabel: chosen.kind,
      legalActionLabels: labels,
    });
  }

  private scoreDiscard(state: GameState, playerId: number, tile: Tile): number {
    const p = state.players[playerId];
    const hand = p.hand.filter((t) => t.id !== tile.id);
    const counts = new Map<string, number>();
    for (const t of hand) {
      const k = tileKey(t);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const key = tileKey(tile);
    const remaining = (counts.get(key) ?? 0) + 1; // 含自己這張前

    // 高分 = 更適合丟
    let score = 0;

    // 單張孤張優先丟
    const inHand = p.hand.filter((t) => sameTile(t, tile)).length;
    if (inHand === 1) score += 30;
    if (inHand === 2) score -= 40; // 留對
    if (inHand >= 3) score -= 80; // 留刻

    // 字牌無對較早丟
    if (isHonor(tile) && inHand === 1) score += 25;

    // 場上已出現多張 → 較安全也較沒用
    let seen = 0;
    for (const pl of state.players) {
      seen += pl.discards.filter((t) => sameTile(t, tile)).length;
    }
    score += seen * 8;

    // 花色集中：丟少數花色
    const suits = { man: 0, pin: 0, sou: 0 };
    for (const t of hand) {
      if (t.suit in suits) suits[t.suit as 'man' | 'pin' | 'sou']++;
    }
    if (tile.suit === 'man' || tile.suit === 'pin' || tile.suit === 'sou') {
      const mine = suits[tile.suit];
      const max = Math.max(suits.man, suits.pin, suits.sou);
      if (mine < max - 2) score += 15;
      if (mine === max) score -= 10;
    }

    // 模擬丟牌後潛力
    const simulated = {
      ...p,
      hand,
    };
    score -= estimateHandPotential(simulated) * 0.3;

    void remaining;
    return score;
  }

  private claimScore(state: GameState, playerId: number, opt: ClaimOption): number {
    if (opt.kind === 'pass') return 0;
    if (opt.kind === 'win') return 1000 + (opt.fan ?? 0) * 10;
    if (opt.kind === 'kong') return 50;
    if (opt.kind === 'pong') {
      // 碰字牌較有價值
      const t = state.lastDiscard;
      if (t && isHonor(t)) return 45;
      return 30;
    }
    if (opt.kind === 'chow') {
      // 吃會破門清，潛力高才吃
      const pot = estimateHandPotential(state.players[playerId]);
      return pot > 25 ? 15 : 5;
    }
    return 0;
  }
}

/** 之後可註冊更多代理：例如 NeuralAI */
export const AI_REGISTRY: Record<string, () => AIAgent> = {
  'heuristic-v1': () => new HeuristicAI(),
  'random-v1': () => new RandomAI(),
};

export function createAI(id = 'heuristic-v1'): AIAgent {
  const factory = AI_REGISTRY[id] ?? AI_REGISTRY['heuristic-v1'];
  return factory();
}
