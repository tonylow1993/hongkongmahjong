import type { ClaimOption, GameState, Tile } from '../game/types';

/**
 * 可替換的 AI 介面。
 * 之後可換成神經網路／強化學習代理，只要實作此介面即可。
 */
export interface AIAgent {
  readonly id: string;
  readonly name: string;
  /** 選擇出哪張牌 */
  chooseDiscard(state: GameState, playerId: number, legal: Tile[]): Tile;
  /** 選擇叫牌（碰／吃／槓／糊／過） */
  chooseClaim(state: GameState, playerId: number, options: ClaimOption[]): ClaimOption;
  /** 自己回合的槓／自摸 */
  chooseSelfAction(
    state: GameState,
    playerId: number,
    options: ClaimOption[],
  ): ClaimOption | null;
}

/** 訓練樣本：狀態特徵 → 動作 → 可選獎勵 */
export interface TrainingSample {
  timestamp: number;
  agentId: string;
  playerId: number;
  phase: 'discard' | 'claim' | 'self';
  features: number[];
  featureNames: string[];
  actionIndex: number;
  actionLabel: string;
  legalActionLabels: string[];
  reward?: number;
  meta?: Record<string, unknown>;
}

export interface TrainingLogger {
  log(sample: TrainingSample): void;
  flush(): TrainingSample[];
  clear(): void;
  size(): number;
}
