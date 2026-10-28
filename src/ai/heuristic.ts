import type { ClaimOption, GameState, Tile } from '../game/types';
import { tileKey } from '../game/tiles';
import { featuresForDiscard, extractFeatures } from './features';
import { trainingLogger } from './logger';
import { LearnedAI } from './model';
import { allowSelfKong, scoreClaim, scoreDiscardCandidate } from './policy';
import { RandomAI } from './random';
import type { AIAgent } from './types';

/**
 * 三番起糊啟發式：
 * 先定番型路徑（混一色／對對糊／門清平胡／番子搭橋），
 * 無番不開門；終盤或他家聽牌信號改打安全牌。
 * 決策寫入 trainingLogger，供之後監督訓練。
 */
export class HeuristicAI implements AIAgent {
  readonly id = 'heuristic-v1';
  readonly name = '啟發式 AI';
  private readonly logDecisions: boolean;

  constructor(logDecisions = true) {
    this.logDecisions = logDecisions;
  }

  chooseDiscard(state: GameState, playerId: number, legal: Tile[]): Tile {
    let best = legal[0];
    let bestScore = -Infinity;
    const labels = legal.map((t) => tileKey(t));

    legal.forEach((tile, index) => {
      const score = scoreDiscardCandidate(state, playerId, tile);
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
    if (this.logDecisions) trainingLogger.log({
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
      (a, b) => scoreClaim(state, playerId, b) - scoreClaim(state, playerId, a),
    );
    const best = ranked[0];
    const labels = options.map((o) => o.kind + (o.fan ? `:${o.fan}` : ''));
    const feat = extractFeatures(state, playerId, state.lastDiscard ?? undefined);

    if (this.logDecisions) trainingLogger.log({
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
    if (kong && allowSelfKong(state, playerId)) {
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
    if (this.logDecisions) trainingLogger.log({
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

}

/** 之後可註冊更多代理：例如 NeuralAI */
export const AI_REGISTRY: Record<string, () => AIAgent> = {
  'heuristic-v1': () => new HeuristicAI(),
  'learned-v1': () => new LearnedAI(),
  'random-v1': () => new RandomAI(),
};

export function createAI(id = 'learned-v1'): AIAgent {
  const factory = AI_REGISTRY[id] ?? AI_REGISTRY['heuristic-v1'];
  return factory();
}
