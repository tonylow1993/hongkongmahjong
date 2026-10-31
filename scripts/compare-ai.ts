/**
 * One 訓練模型 seat against three 本地 AI seats, on the live 二五半 table.
 * The trained seat rotates, so dealer position does not decide the result.
 *
 *   npx tsx scripts/compare-ai.ts --sessions 4
 *
 * Needs the same Python that can import onnxruntime and numpy.
 *   PYTHON=.venv/bin/python npx tsx scripts/compare-ai.ts
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { LearnedAI } from '../src/ai/model';
import { claimFromAct, selfFromAct, tileFromAct, type ModelAct } from '../src/ai/trainedClient';
import type { AIAgent } from '../src/ai/types';
import {
  createNewGame,
  discardTile,
  getLegalDiscards,
  selfAction,
  startNextRound,
  submitClaim,
} from '../src/game/engine';
import type { ClaimOption, GameState, Tile } from '../src/game/types';
import { WIND_LABELS } from '../src/game/types';
import { tableSnapshot } from '../src/ui/coachSnapshot';

const ROOT = path.resolve(import.meta.dirname, '..');

class OnnxWorker {
  private proc: ChildProcessWithoutNullStreams;
  private waiters: ((line: string) => void)[] = [];

  constructor(python: string) {
    this.proc = spawn(python, [path.join(ROOT, 'scripts/onnx_worker.py')], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    this.proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        console.error(
          `找不到 Python：${python}\n` +
            '請先建立虛擬環境並安裝依賴：\n' +
            '  python3 -m venv .venv\n' +
            '  source .venv/bin/activate\n' +
            '  pip install -r ai_assistant/requirements.txt\n' +
            '然後執行：npm run compare:ai -- --sessions 4\n' +
            '（不必再設 PYTHON=，腳本會自動用 .venv/bin/python）',
        );
      }
      throw err;
    });
    const lines = readline.createInterface({ input: this.proc.stdout });
    lines.on('line', (line) => {
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
    });
  }

  act(state: GameState, seat: number): Promise<ModelAct> {
    this.proc.stdin.write(JSON.stringify(tableSnapshot(state, seat)) + '\n');
    return new Promise((resolve, reject) => {
      this.waiters.push((line) => {
        const act = JSON.parse(line) as ModelAct & { error?: string };
        if (act.error) reject(new Error(act.error));
        else resolve(act);
      });
    });
  }

  close(): void {
    this.proc.stdin.end();
  }
}

class TrainedAI implements AIAgent {
  readonly id = 'trained-onnx';
  readonly name = '訓練模型';

  constructor(private worker: OnnxWorker) {}

  chooseDiscard(): Tile {
    throw new Error('use chooseDiscardAsync');
  }
  chooseClaim(): ClaimOption {
    throw new Error('use chooseClaimAsync');
  }
  chooseSelfAction(): ClaimOption | null {
    return null;
  }

  async chooseDiscardAsync(state: GameState, playerId: number, legal: Tile[]): Promise<Tile> {
    const act = await this.worker.act(state, playerId);
    if (act.kind !== 'discard') return legal[0];
    return tileFromAct(legal, act);
  }

  async chooseClaimAsync(state: GameState, playerId: number, options: ClaimOption[]): Promise<ClaimOption> {
    return claimFromAct(options, await this.worker.act(state, playerId), state.lastDiscard);
  }

  async chooseSelfActionAsync(
    state: GameState,
    playerId: number,
    options: ClaimOption[],
  ): Promise<ClaimOption | null> {
    if (options.length === 0) return null;
    return selfFromAct(options, await this.worker.act(state, playerId));
  }
}

function pythonBin(): string {
  const candidates: string[] = [];
  if (process.env.PYTHON) {
    candidates.push(path.resolve(ROOT, process.env.PYTHON));
    candidates.push(process.env.PYTHON);
  }
  candidates.push(
    path.join(ROOT, '.venv', 'bin', 'python'),
    path.join(ROOT, 'ai_assistant', '.venv', 'bin', 'python'),
  );
  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return 'python3';
}

function ensureOnnxModel(): void {
  const model = path.join(ROOT, 'models', 'hk_mahjong_agent.onnx');
  if (!fs.existsSync(model)) {
    throw new Error(`找不到 ${model}。請先 export 並放到 models/ 目錄。`);
  }
}

function sessionCount(): number {
  const i = process.argv.indexOf('--sessions');
  const n = i >= 0 ? Number(process.argv[i + 1]) : 4;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4;
}

function fourRoundsDone(state: GameState): boolean {
  const dealerWon = state.winInfo != null && state.winInfo.winner === state.dealer;
  return !dealerWon && state.prevailingWind === 3 && state.roundWindCount === 4;
}

interface Tally {
  la: number;
  hands: number;
  wins: number;
  deals: number;
  draws: number;
}

async function playHandAsync(state: GameState, agents: Array<LearnedAI | TrainedAI>): Promise<GameState> {
  let steps = 0;
  while (state.phase !== 'ended' && state.phase !== 'idle' && steps < 500) {
    steps++;
    if (state.phase === 'discard') {
      const pid = state.currentPlayer;
      const agent = agents[pid];
      const opts = state.claimOptions[pid] ?? [];
      const self = agent instanceof TrainedAI
        ? await agent.chooseSelfActionAsync(state, pid, opts)
        : agent.chooseSelfAction(state, pid, opts);
      if (self) {
        state = selfAction(state, self);
        continue;
      }
      const legal = getLegalDiscards(state, pid);
      if (legal.length === 0) break;
      const tile = agent instanceof TrainedAI
        ? await agent.chooseDiscardAsync(state, pid, legal)
        : agent.chooseDiscard(state, pid, legal);
      state = discardTile(state, tile.id);
      continue;
    }
    if (state.phase === 'claim') {
      const ids = Object.keys(state.claimOptions).map(Number);
      const id = ids.find((seat) => state.pendingClaims[seat] === undefined);
      if (id === undefined) break;
      const opts = state.claimOptions[id] ?? [];
      const agent = agents[id];
      const choice = opts.length === 0
        ? { kind: 'pass' as const }
        : agent instanceof TrainedAI
          ? await agent.chooseClaimAsync(state, id, opts)
          : agent.chooseClaim(state, id, opts);
      state = submitClaim(state, id, choice);
      continue;
    }
    break;
  }
  return state;
}

async function playSession(agents: Array<LearnedAI | TrainedAI>, trainedSeat: number): Promise<Tally> {
  let state = createNewGame();
  const tally: Tally = { la: 0, hands: 0, wins: 0, deals: 0, draws: 0 };
  while (tally.hands < 80) {
    const before = state.players[trainedSeat].score;
    state = await playHandAsync(state, agents);
    tally.hands++;
    tally.la += state.players[trainedSeat].score - before;
    const info = state.winInfo;
    if (!info) tally.draws++;
    else if (info.winner === trainedSeat) tally.wins++;
    else if (info.loser === trainedSeat) tally.deals++;
    if (fourRoundsDone(state)) break;
    state = startNextRound(state);
  }
  return tally;
}

async function main(): Promise<void> {
  ensureOnnxModel();
  const sessions = sessionCount();
  const python = pythonBin();
  const worker = new OnnxWorker(python);
  const trained = new TrainedAI(worker);
  const local = new LearnedAI();
  const total: Tally = { la: 0, hands: 0, wins: 0, deals: 0, draws: 0 };

  console.log(`本地 AI（牌桌 learned-v1）對 訓練模型（models/hk_mahjong_agent.onnx）`);
  console.log(`${sessions} 場四圈，訓練模型輪流坐東南西北。分數為正宗半辣上點數。`);
  console.log(`python: ${python}`);

  try {
    for (let i = 0; i < sessions; i++) {
      const seat = i % 4;
      const agents = [0, 1, 2, 3].map((id) => (id === seat ? trained : local));
      const started = Date.now();
      const tally = await playSession(agents, seat);
      total.la += tally.la;
      total.hands += tally.hands;
      total.wins += tally.wins;
      total.deals += tally.deals;
      total.draws += tally.draws;
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `第 ${i + 1} 場  訓練模型坐${WIND_LABELS[seat]}  ${tally.la >= 0 ? '+' : ''}${tally.la} 辣  ` +
          `食糊 ${tally.wins}  放銃 ${tally.deals}  流局 ${tally.draws}  共 ${tally.hands} 局  ${secs}s`,
      );
    }
  } finally {
    worker.close();
  }

  const perSession = total.la / sessions;
  const localPerSeat = -total.la / sessions / 3;
  console.log('');
  console.log(
    `訓練模型  平均 ${perSession >= 0 ? '+' : ''}${perSession.toFixed(1)} 辣／四圈  ` +
      `食糊 ${pct(total.wins, total.hands)}  放銃 ${pct(total.deals, total.hands)}  流局 ${pct(total.draws, total.hands)}`,
  );
  console.log(`本地 AI    平均 ${localPerSeat >= 0 ? '+' : ''}${localPerSeat.toFixed(1)} 辣／座位／四圈`);
  if (total.la > 0) console.log('結果：訓練模型較好。');
  else if (total.la < 0) console.log('結果：本地 AI 較好。');
  else console.log('結果：兩方辣數相同。');
}

function pct(n: number, d: number): string {
  return `${d === 0 ? 0 : Math.round((n / d) * 100)}%`;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
