import { create } from 'zustand';
import { createAI, downloadTrainingData, trainingLogger, type AIAgent } from '../ai';
import { askModel, claimFromAct, modelReady, selfFromAct, tileFromAct } from '../ai/trainedClient';
import {
  createNewGame,
  discardTile,
  getLegalDiscards,
  passAllClaims,
  redealRound,
  selfAction,
  startNextRound,
  submitClaim,
} from '../game/engine';
import { sortTiles } from '../game/tiles';
import type { ClaimOption, GameState } from '../game/types';

export type OpponentMode = 'local' | 'trained';
export type AILevel = 'local' | 'level-1' | 'level-2' | 'level-3';

interface GameStore {
  state: GameState;
  ai: AIAgent;
  aiLevel: AILevel;
  opponentMode: OpponentMode;
  modeError: string | null;
  aiThinking: boolean;
  showTraining: boolean;
  sampleCount: number;

  setAILevel: (level: AILevel) => void;
  setOpponentMode: (mode: OpponentMode) => void;
  newGame: () => void;
  nextRound: () => void;
  discard: (tileId: string) => void;
  claim: (option: ClaimOption) => void;
  doSelfAction: (option: ClaimOption) => void;
  setShowTraining: (v: boolean) => void;
  exportTraining: () => void;
  clearTraining: () => void;
  sortHand: () => void;
  tickAI: () => void;
}

function refreshCount(): number {
  return trainingLogger.size();
}

const INITIAL_LEVEL: AILevel =
  typeof window !== 'undefined'
    ? ((localStorage.getItem('hk_ai_level') as AILevel | null) ?? 'level-3')
    : 'level-3';

export const useGameStore = create<GameStore>((set, get) => ({
  state: createNewGame(),
  ai: createAI('learned-v1'),
  aiLevel: INITIAL_LEVEL,
  opponentMode: INITIAL_LEVEL === 'local' ? 'local' : 'trained',
  modeError: null,
  aiThinking: false,
  showTraining: false,
  sampleCount: refreshCount(),

  setAILevel: (level) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hk_ai_level', level);
    }
    if (level === 'local') {
      set({ aiLevel: 'local', opponentMode: 'local', modeError: null });
      queueMicrotask(() => get().tickAI());
      return;
    }
    void modelReady().then((ok) => {
      if (!ok) {
        set({
          aiLevel: level,
          opponentMode: 'local',
          modeError: 'AI 服務未連線（已由本地 AI 代打）。先執行 npm run coach:serve',
        });
        return;
      }
      set({ aiLevel: level, opponentMode: 'trained', modeError: null });
      queueMicrotask(() => get().tickAI());
    });
  },

  setOpponentMode: (mode) => {
    const level: AILevel = mode === 'local' ? 'local' : 'level-3';
    get().setAILevel(level);
  },

  newGame: () => {
    set({ state: createNewGame(), aiThinking: false, sampleCount: refreshCount() });
    queueMicrotask(() => get().tickAI());
  },

  nextRound: () => {
    const { state } = get();
    set({
      state: state.phase === 'ended' ? startNextRound(state) : redealRound(state),
      aiThinking: false,
      sampleCount: refreshCount(),
    });
    queueMicrotask(() => get().tickAI());
  },

  discard: (tileId: string) => {
    const { state } = get();
    if (!state.players[state.currentPlayer].isHuman) return;
    if (state.phase !== 'discard') return;
    const next = discardTile(state, tileId);
    set({ state: next, sampleCount: refreshCount() });
    queueMicrotask(() => get().tickAI());
  },

  claim: (option: ClaimOption) => {
    const { state } = get();
    if (state.phase !== 'claim') return;
    const humanId = 0;
    if (!state.claimOptions[humanId]) return;
    let next = submitClaim(state, humanId, option);
    void (async () => {
      if (get().opponentMode === 'trained') next = await resolveTrainedClaims(next);
      else next = resolveAIClaims(next, get().ai);
      set({ state: next, sampleCount: refreshCount() });
      queueMicrotask(() => get().tickAI());
    })();
  },

  doSelfAction: (option: ClaimOption) => {
    const { state } = get();
    if (!state.players[state.currentPlayer].isHuman) return;
    const next = selfAction(state, option);
    set({ state: next, sampleCount: refreshCount() });
    queueMicrotask(() => get().tickAI());
  },

  setShowTraining: (v) => set({ showTraining: v }),

  exportTraining: () => {
    downloadTrainingData(trainingLogger.flush());
  },

  clearTraining: () => {
    trainingLogger.clear();
    set({ sampleCount: 0 });
  },

  sortHand: () => {
    const { state } = get();
    const players = state.players.map((p) => ({
      ...p,
      hand: sortTiles([...p.hand]),
      melds: p.melds.map((m) => ({ ...m, tiles: [...m.tiles] })),
      flowers: [...p.flowers],
      discards: [...p.discards],
    }));
    set({ state: { ...state, players } });
  },

  tickAI: () => {
    if (ticking) {
      tickAgain = true;
      return;
    }
    ticking = true;
    const run = async () => {
      let guard = 0;
      while (guard++ < 40) {
        const { state, ai } = get();
        if (state.phase === 'ended' || state.phase === 'idle') break;

        if (state.phase === 'claim') {
          const pendingIds = Object.keys(state.claimOptions).map(Number);
          const needAI = pendingIds.filter(
            (id) => !state.players[id].isHuman && state.pendingClaims[id] === undefined,
          );
          if (needAI.length === 0) {
            // 等人類；若人類也沒有選項則不該進到這裡
            const humanNeeds = pendingIds.some(
              (id) => state.players[id].isHuman && state.pendingClaims[id] === undefined,
            );
            if (!humanNeeds) {
              const next = resolveAIClaims(state, ai);
              set({ state: next });
              continue;
            }
            break;
          }
          set({ aiThinking: true });
          await sleep(350);
          let next = get().state;
          if (get().opponentMode === 'trained') next = await resolveTrainedClaims(next);
          else next = resolveAIClaims(next, get().ai);
          set({ state: next, aiThinking: false, sampleCount: refreshCount() });
          continue;
        }

        if (state.phase === 'discard') {
          const pid = state.currentPlayer;
          if (state.players[pid].isHuman) {
            // 人類可自摸／槓
            break;
          }
          set({ aiThinking: true });
          await sleep(450);

          let next = get().state;
          const opts = next.claimOptions[pid] ?? [];
          const trained = get().opponentMode === 'trained';
          let acted = false;
          if (trained) {
            try {
              const act = await askModel(next, pid, get().aiLevel);
              const self = selfFromAct(opts, act);
              if (self) {
                next = selfAction(next, self);
                acted = true;
              } else if (act.kind === 'discard') {
                const legal = getLegalDiscards(next, pid);
                if (legal.length === 0) break;
                next = discardTile(next, tileFromAct(legal, act).id);
                acted = true;
              }
              set({ modeError: null });
            } catch {
              set({ modeError: '訓練模型這一步沒有回應，已改由本地 AI 代打。' });
            }
          }
          if (!acted) {
            const self = get().ai.chooseSelfAction(next, pid, opts);
            if (self) {
              next = selfAction(next, self);
            } else {
              const legal = getLegalDiscards(next, pid);
              if (legal.length === 0) break;
              const tile = get().ai.chooseDiscard(next, pid, legal);
              next = discardTile(next, tile.id);
            }
          }
          set({ state: next, aiThinking: false, sampleCount: refreshCount() });
          continue;
        }

        break;
      }
      set({ aiThinking: false });
    };
    void run().finally(() => {
      ticking = false;
      if (tickAgain) {
        tickAgain = false;
        get().tickAI();
      }
    });
  },
}));

let ticking = false;
let tickAgain = false;

const TRAINED_OFFLINE = '訓練模型這一步沒有回應，已改由本地 AI 代打。';

async function resolveTrainedClaims(state: GameState): Promise<GameState> {
  let s = state;
  if (s.phase !== 'claim') return s;
  const local = useGameStore.getState().ai;
  const level = useGameStore.getState().aiLevel;

  for (const idStr of Object.keys(s.claimOptions)) {
    const id = Number(idStr);
    if (s.pendingClaims[id] !== undefined) continue;
    if (s.players[id].isHuman) continue;
    const opts = s.claimOptions[id] ?? [];
    if (opts.length === 0) {
      s = submitClaim(s, id, { kind: 'pass' });
      continue;
    }
    try {
      const act = await askModel(s, id, level);
      s = submitClaim(s, id, claimFromAct(opts, act, s.lastDiscard));
      useGameStore.setState({ modeError: null });
    } catch {
      s = submitClaim(s, id, local.chooseClaim(s, id, opts));
      useGameStore.setState({ modeError: TRAINED_OFFLINE });
    }
  }

  const waiting = Object.keys(s.claimOptions).map(Number);
  const humanPending = waiting.some(
    (id) => s.players[id].isHuman && s.pendingClaims[id] === undefined,
  );
  if (!humanPending && s.phase === 'claim') s = passAllClaims(s);
  return s;
}

function resolveAIClaims(state: GameState, ai: AIAgent): GameState {
  let s = state;
  if (s.phase !== 'claim') return s;

  for (const idStr of Object.keys(s.claimOptions)) {
    const id = Number(idStr);
    if (s.pendingClaims[id] !== undefined) continue;
    if (s.players[id].isHuman) continue;
    const opts = s.claimOptions[id] ?? [];
    if (opts.length === 0) {
      s = submitClaim(s, id, { kind: 'pass' });
    } else {
      const choice = ai.chooseClaim(s, id, opts);
      s = submitClaim(s, id, choice);
    }
  }

  // 若只剩人類未選，維持；若全部完成 submitClaim 已 resolve
  const waiting = Object.keys(s.claimOptions).map(Number);
  const humanPending = waiting.some(
    (id) => s.players[id].isHuman && s.pendingClaims[id] === undefined,
  );
  if (!humanPending && s.phase === 'claim') {
    // 強制過（理論上不應到這）
    s = passAllClaims(s);
  }
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 啟動後若莊家是 AI 會自動；人類是莊則等操作
if (typeof window !== 'undefined') {
  setTimeout(() => useGameStore.getState().tickAI(), 100);
}
