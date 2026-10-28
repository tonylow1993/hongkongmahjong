import {
  createNewGame,
  discardTile,
  getLegalDiscards,
  selfAction,
  startNextRound,
  submitClaim,
} from '../game/engine';
import { INITIAL_TABLE_SCORE, type GameState } from '../game/types';
import type { AIAgent } from './types';

export interface SimResult {
  deltas: number[];
  winner: number | null;
  selfDraw: boolean;
  steps: number;
  hands: number;
}

/** 打完目前這一局，直到糊牌或流局。 */
export function playHand(state: GameState, agents: AIAgent[], maxSteps = 500): GameState {
  let steps = 0;
  while (state.phase !== 'ended' && state.phase !== 'idle' && steps < maxSteps) {
    steps++;
    if (state.phase === 'discard') {
      const pid = state.currentPlayer;
      const opts = state.claimOptions[pid] ?? [];
      const self = agents[pid].chooseSelfAction(state, pid, opts);
      if (self) {
        state = selfAction(state, self);
        continue;
      }
      const legal = getLegalDiscards(state, pid);
      if (legal.length === 0) break;
      const tile = agents[pid].chooseDiscard(state, pid, legal);
      state = discardTile(state, tile.id);
      continue;
    }

    if (state.phase === 'claim') {
      const ids = Object.keys(state.claimOptions).map(Number);
      let progressed = false;
      for (const id of ids) {
        if (state.pendingClaims[id] !== undefined) continue;
        const opts = state.claimOptions[id] ?? [];
        const choice = opts.length ? agents[id].chooseClaim(state, id, opts) : { kind: 'pass' as const };
        state = submitClaim(state, id, choice);
        progressed = true;
        break;
      }
      if (!progressed) break;
      continue;
    }

    break;
  }
  return state;
}

/** 四名代理打完一局。回傳相對開台分的淨辣。 */
export function playGame(agents: AIAgent[], maxSteps = 500): SimResult {
  const state = playHand(createNewGame(), agents, maxSteps);
  return {
    deltas: state.players.map((p) => p.score - INITIAL_TABLE_SCORE),
    winner: state.winInfo?.winner ?? null,
    selfDraw: state.winInfo?.isSelfDraw ?? false,
    steps: 0,
    hands: 1,
  };
}

/**
 * 打四圈（東南西北，每圈四莊；連莊加打，莊家輸或流局才過莊）。
 * 回傳整場相對開台分的淨辣。
 */
export function playFourRounds(agents: AIAgent[], maxHands = 80): SimResult {
  let state = createNewGame();
  let hands = 0;
  while (hands < maxHands) {
    state = playHand(state, agents);
    hands++;
    if (fourRoundsDone(state)) break;
    state = startNextRound(state);
  }
  return {
    deltas: state.players.map((p) => p.score - INITIAL_TABLE_SCORE),
    winner: state.winInfo?.winner ?? null,
    selfDraw: state.winInfo?.isSelfDraw ?? false,
    steps: 0,
    hands,
  };
}

/** 北風最後一莊已過莊（或流局），四圈結束。連莊則繼續。 */
function fourRoundsDone(state: GameState): boolean {
  const dealerWon = state.winInfo != null && state.winInfo.winner === state.dealer;
  return !dealerWon && state.prevailingWind === 3 && state.roundWindCount === 4;
}
