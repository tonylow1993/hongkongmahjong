import { writeFileSync } from 'node:fs';
import { HeuristicAI } from '../src/ai/heuristic';
import { LEARNED_WEIGHTS } from '../src/ai/learned-weights';
import { LearnedAI } from '../src/ai/model';
import { playFourRounds } from '../src/ai/simulate';

const gens = Number(process.env.GENS ?? 6);
const pop = Number(process.env.POP ?? 4);
const games = Number(process.env.GAMES ?? 4);

function evaluate(discard: number[], claim: number[], n: number): number {
  const learner = new LearnedAI({ discard, claim });
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const seat = i % 4;
    const agents = [0, 1, 2, 3].map((id) =>
      id === seat ? learner : new HeuristicAI(false),
    );
    sum += playFourRounds(agents).deltas[seat];
  }
  return sum / n;
}

function mutate(w: number[], scale: number): number[] {
  return w.map((v) => v + (Math.random() * 2 - 1) * scale);
}

let eliteD = LEARNED_WEIGHTS.discard.slice();
let eliteC = LEARNED_WEIGHTS.claim.slice();
let best = evaluate(eliteD, eliteC, games);
console.log(`train 四圈 gens=${gens} pop=${pop} sessions=${games}`);
console.log(`start mean la / 四圈 ${best.toFixed(2)}`);
const t0 = Date.now();

for (let g = 0; g < gens; g++) {
  const scale = 0.35 * (1 - g / (gens + 2));
  const cands: { d: number[]; c: number[] }[] = [];
  while (cands.length < pop) {
    cands.push({ d: mutate(eliteD, scale), c: mutate(eliteC, scale * 0.6) });
  }
  let genBest = best;
  let genD = eliteD;
  let genC = eliteC;
  for (const c of cands) {
    const fit = evaluate(c.d, c.c, games);
    if (fit > genBest) {
      genBest = fit;
      genD = c.d;
      genC = c.c;
    }
  }
  eliteD = genD;
  eliteC = genC;
  best = genBest;
  console.log(`gen ${g + 1}/${gens}  四圈淨辣 ${best.toFixed(2)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

const holdout = evaluate(eliteD, eliteC, 8);
const prior = evaluate(LEARNED_WEIGHTS.discard, LEARNED_WEIGHTS.claim, 8);
const useTrained = holdout > prior;
const outD = useTrained ? eliteD : LEARNED_WEIGHTS.discard;
const outC = useTrained ? eliteC : LEARNED_WEIGHTS.claim;
const outFit = useTrained ? holdout : prior;

const body = `/** 模擬對局學到的線性權重。分數愈高愈傾向選該動作。 */
export const LEARNED_WEIGHTS = {
  /** 對啟發式打四圈的平均淨辣 */
  fitness: ${Number(outFit.toFixed(3))},
  games: ${gens * pop * games + games + 16},
  discard: ${JSON.stringify(outD.map((n) => Number(n.toFixed(4))))},
  claim: ${JSON.stringify(outC.map((n) => Number(n.toFixed(4))))},
};
`;

writeFileSync(new URL('../src/ai/learned-weights.ts', import.meta.url), body);
console.log(`prior 四圈 ${prior.toFixed(2)}  trained 四圈 ${holdout.toFixed(2)}  kept ${useTrained ? 'trained' : 'prior'}`);
console.log('wrote src/ai/learned-weights.ts');
