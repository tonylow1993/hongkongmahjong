import { tileKey } from '../game/tiles';
import type { ClaimOption, GameState, Tile } from '../game/types';
import { extractFeatures } from './features';
import { trainingLogger } from './logger';
import type { AIAgent } from './types';

/** 隨機代理：作為訓練基線／測試用 */
export class RandomAI implements AIAgent {
  readonly id = 'random-v1';
  readonly name = '隨機 AI';

  chooseDiscard(_state: GameState, playerId: number, legal: Tile[]): Tile {
    const tile = legal[Math.floor(Math.random() * legal.length)]!;
    const feat = extractFeatures(_state, playerId, tile);
    trainingLogger.log({
      timestamp: Date.now(),
      agentId: this.id,
      playerId,
      phase: 'discard',
      features: feat.values,
      featureNames: feat.names,
      actionIndex: legal.findIndex((t) => t.id === tile.id),
      actionLabel: tileKey(tile),
      legalActionLabels: legal.map(tileKey),
    });
    return tile;
  }

  chooseClaim(state: GameState, playerId: number, options: ClaimOption[]): ClaimOption {
    // 能糊一定糊，其餘隨機
    const win = options.find((o) => o.kind === 'win');
    const chosen = win ?? options[Math.floor(Math.random() * options.length)]!;
    const feat = extractFeatures(state, playerId);
    trainingLogger.log({
      timestamp: Date.now(),
      agentId: this.id,
      playerId,
      phase: 'claim',
      features: feat.values,
      featureNames: feat.names,
      actionIndex: options.indexOf(chosen),
      actionLabel: chosen.kind,
      legalActionLabels: options.map((o) => o.kind),
    });
    return chosen;
  }

  chooseSelfAction(
    state: GameState,
    playerId: number,
    options: ClaimOption[],
  ): ClaimOption | null {
    const win = options.find((o) => o.kind === 'win');
    if (win) return win;
    if (options.length && Math.random() < 0.3) return options[0]!;
    void state;
    void playerId;
    return null;
  }
}
