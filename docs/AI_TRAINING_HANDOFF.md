# Mahjong AI Training Handoff

## Purpose

This document summarizes the Mahjong AI training methods, checkpoints,
evaluation results, and remaining work. Use it as context before changing
the training system or recommending another experiment.

**Important:** Checkpoint filenames are conventions, not proof of how a
file was created. Verify the actual files and logs before relying on them.

---

## Current recommendation

Keep **`checkpoints/hk_expert_bc_v2.pt`** as the primary active candidate.

It was trained on the accelerated Pareto-optimal 3-faan tactical expert policy with defensive folding and CosineAnnealing learning rate scheduling.
- **500-game held-out evaluation** (`2500000000–2500000499`):
  - Local baseline AI: win = 18.4%, deal-in = 11.0%, score = -0.198
  - Expert teacher: win = 27.2%, deal-in = 6.8%, score = +1.166
  - CNN greedy (`hk_expert_bc_v2`): win = 21.8%, deal-in = 10.0%, score = **+0.218** (beats local AI by +0.416 / hand)
- **20-session local table simulation** (`compare-ai.ts`, ~380 hands):
  - Trained Model: **+8.1 辣／四圈** (win 20%, deal-in 11%)
  - Local Table AI: **-2.7 辣／座位／四圈**
  - Result: `訓練模型較好` (Clear +10.8 辣 advantage over local table AI)

Exported to ONNX as `models/hk_mahjong_agent.onnx` and deployed.
Do not overwrite this checkpoint when running experiments.

---

## Models and policies

### Local teacher: `local_policy.py`

The teacher approximates the TypeScript `LearnedAI` in
`src/ai/model.ts`.

It is **not a CNN**. It uses:

- A linear score over hand-designed discard features.
- A linear score over claim features.
- Explicit shanten calculations.
- A rule to take legal HU immediately.

The Python teacher is not guaranteed to match the TypeScript AI exactly.
For example, the Python environment selects a single chow decomposition.

#### Important past bug

The claim-feature flags were originally in Python action-ID order, while
the TypeScript weights expected:

```text
win, pong, chow, kong, pass
```

The corrected `local_policy.py` explicitly maps each action to that
feature order. Verify that correction is present before training.

A quick check:

```text
python -c "from env import HKEnv; from local_policy import _claim_score; from state_encoding import CLAIM_PASS; e=HKEnv(0); e.reset(); print('PASS score:', round(_claim_score(e, 0, CLAIM_PASS), 4))"
```

Expected:

```text
PASS score: -0.3758
```

### Trained model: `model.py`

`HKMahjongNet` is a PyTorch CNN with residual blocks, approximately
679,000 parameters, and three outputs:

1. Discard-policy logits.
2. Claim-policy logits.
3. Value prediction.

It uses 16 input planes from `state_encoding.py`. The current observations
do not explicitly identify the latest discarded tile, even though the
teacher uses `env.last` for claim decisions.

The trained model is **not XGBoost**.

---

## Training methods used

### 1. Behavior cloning

Behavior cloning trains the CNN to imitate actions selected by the local
teacher.

`evaluate_imitation.py` can:

- Generate games played by the teacher.
- Train the CNN using teacher actions.
- Measure imitation on a separate fixed set of teacher-generated states.
- Save the checkpoint with the best validation teacher NLL.
- Evaluate the selected checkpoint against local opponents.

The value head is **not trained by this behavior-cloning process**.
Because cloning updates shared CNN features, the value prediction can
become badly miscalibrated even if the policy improves.

### 2. PPO

`train_azure_selfplay.py` performs teacher-assisted PPO:

- One learner seat samples actions from the CNN.
- Opponents are selected per seat and hand from:
  - Local teacher.
  - Frozen snapshot of the current network.
  - Random legal policy.
- PPO uses observed score changes and a value prediction to estimate
  advantages.
- A teacher-imitation loss continues during PPO and can decay over time.
- The script records only the learner seat's PPO decisions.
- The joint probability of discarding is:

```text
P(discard tile) = P(PASS in claim head) × P(tile in discard head)
```

The learner's PPO actions must be sampled from the distribution whose
log-probabilities are recorded. Do not silently force HU or substitute
heuristic discards without changing the probability accounting.

PPO can degrade an existing policy. Keep the original checkpoint and
compare on held-out games.

### 3. Value-head warm-up

`warmup_value_head.py`:

- Loads an existing checkpoint.
- Freezes the shared CNN trunk and policy heads.
- Sets the value head to zero.
- Trains only the value head on observed game returns.
- Selects a head using separate validation games.
- Saves a new checkpoint.

In the recorded run, **epoch 0—the zero head—was selected** because no
trained candidate beat it on validation.

---

## Checkpoints

Paths below are relative to the `azure_train` directory.

| Checkpoint | Intended use |
|---|---|
| `checkpoints/hk_teacher_ppo.pt` | Default teacher-assisted BC + PPO output, if that default path was used. May have been trained before the teacher fix. |
| `checkpoints/teacher_ppo_smoke.pt` or similarly named smoke checkpoint | Short integration test only; do not assume it is strong. Exact filename depends on the command used. |
| `checkpoints/hk_teacher_fixed.pt` | Latest weights from a fresh run using the corrected teacher, if created with the suggested command. |
| `checkpoints/hk_teacher_fixed.pt.best.pt` | Best stochastic evaluation score during that run on its fixed evaluation seeds. It may be from an earlier update. |
| `checkpoints/hk_imitation_improved.pt` | Checkpoint after additional behavior cloning from a prior model. |
| `checkpoints/hk_imitation_v2.pt` | Longer behavior-cloning checkpoint. **Current recommended baseline.** |
| `checkpoints/hk_ppo_from_v2.pt` | Latest PPO weights warm-started from `hk_imitation_v2.pt`, if produced by the suggested command. |
| `checkpoints/hk_ppo_from_v2.pt.best.pt` | Best fixed-seed stochastic evaluation checkpoint from that PPO run. |
| `checkpoints/hk_value_warmed.pt` | Same non-value weights as `hk_imitation_v2.pt`, with a zero-valued head selected by warm-up validation. |
| `checkpoints/hk_ppo_warmed.pt` | Latest PPO checkpoint starting from the zero-value-head checkpoint. |
| `checkpoints/hk_ppo_warmed.pt.best.pt` | Best fixed-seed stochastic evaluation checkpoint from the warmed PPO run. |

### Latest versus best

- `*.pt`: latest saved weights from that run.
- `*.pt.best.pt`: best score observed on that run's **fixed stochastic
  evaluation seeds**.

The best checkpoint:

- Is not necessarily the best greedy policy.
- Can be worse than the starting checkpoint.
- May benefit from luck on repeatedly used evaluation seeds.

Evaluate it on unused seeds before deciding it is better.

### Resume is a warm start

`--resume` restores **model weights only**. It does not restore:

- Optimizer state.
- RNG state.
- Update number.
- Teacher-loss schedule.

Therefore, a resumed run is not an exact continuation. Use a new `--out`
path to preserve the starting checkpoint.

---

## Recorded results

### Longer imitation training

`hk_imitation_v2.pt` achieved the following on its imitation-validation
set:

| Metric | Result |
|---|---:|
| Teacher NLL | 0.5195 |
| Greedy discard-tile match | 79.9% |
| Expected stochastic joint discard match | 72.6% |

This validation set was used for checkpoint selection; use a different
set for a final imitation assessment.

On game seeds `2200000000–2200000499`:

| Policy | Win rate | Avg. score/hand |
|---|---:|---:|
| Local teacher | 17.2% | +0.042 |
| CNN stochastic | 13.6% | −0.374 |
| CNN greedy | 17.8% | +0.168 |

This was encouraging but did not prove the CNN was stronger than the
teacher.

### PPO from the imitation checkpoint

On game seeds `2300000000–2300000499`:

| Policy | Stochastic win | Stochastic score | Greedy win | Greedy score |
|---|---:|---:|---:|---:|
| `hk_imitation_v2.pt` | 12.4% | −0.914 | 17.2% | −0.098 |
| `hk_ppo_from_v2.pt.best.pt` | 9.2% | −1.296 | 15.2% | −0.722 |

The tested PPO checkpoint did not show an improvement on this evaluation.

### Value-head diagnosis

On the reported 100-hand diagnostic:

| Checkpoint | Value MSE | Always-zero MSE |
|---|---:|---:|
| `hk_imitation_v2.pt` | 25.81424 | 0.04858 |
| `hk_ppo_from_v2.pt.best.pt` | 0.08970 | 0.06284 |

The imitation checkpoint's value head was badly miscalibrated:

```text
prediction_mean=4.5847
return_mean=-0.0485
```

The warmed checkpoint selected a zero head. On 200 held-out hands:

```text
value_mse=0.09357
always_zero_mse=0.09357
```

This confirms it predicts zero, not that it learned a useful value
function.

### PPO from the warmed checkpoint

On game seeds `2400000000–2400000499`:

| Policy | Stochastic win | Stochastic score | Greedy win | Greedy score |
|---|---:|---:|---:|---:|
| `hk_imitation_v2.pt` | 16.2% | −0.434 | 17.2% | +0.322 |
| `hk_ppo_warmed.pt.best.pt` | 12.6% | −0.304 | 15.0% | −0.388 |

The PPO checkpoint had a slightly better stochastic score in this
sample, but lower win rates and greedy score. These results do not
establish a clear PPO improvement.

### Pareto Expert & Defensive Behavior Cloning (`hk_expert_bc_v2.pt`)

To overcome the dead-tenpai and sub-3-faan open hand flaws of earlier teachers, we built the Pareto-optimal 3-faan tactical expert policy (`--teacher-mode expert`):
- Decomposed suit-level recursive shanten with `@functools.lru_cache` (speedup from 75ms to 2.5ms per hand).
- Explicit 3-faan path gating (never chow/pong without reachability to 3 faan).
- Out-count (ukeire) maximization and dead-tenpai penalization.
- Defensive folding against multi-meld threats (reducing dangerous tile discard probabilities).

Trained with 200 BC updates (7,000 games of expert play) and `CosineAnnealingLR`:
- Imitation validation teacher NLL: **0.4615** (improved from 0.5743)
- Greedy joint match: **83.1%** (improved from 78.0%)
- Expected joint match: **75.4%** (improved from 69.8%)

On 500 fresh game seeds `2500000000–2500000499`:

| Policy | Win rate | Deal-in | Draw rate | Avg. score / hand |
|---|---:|---:|---:|---:|
| Baseline local table AI | 18.4% | 11.0% | 27.4% | −0.198 |
| Defensive Expert Teacher | 27.2% | 6.8% | 23.6% | +1.166 |
| Stochastic CNN (`hk_expert_bc_v2`) | 14.0% | 9.6% | 31.8% | −0.434 |
| **Greedy CNN (`hk_expert_bc_v2`)** | **21.8%** | **10.0%** | 25.2% | **+0.218** |

**Local Table Simulation Benchmark** (`npm run compare:ai:long`, 20 sessions / ~380 hands):
- **Trained Neural Model**: **+8.1 辣／四圈** (Win: 20%, Deal-in: 11%, Draw: 32%)
- **Local Table AI**: **-2.7 辣／座位／四圈**
- Verdict: **訓練模型較好** (+10.8 辣 advantage over baseline rule-based table AI).

---

## Metric definitions

### Game evaluation

- **`win`**: fraction of completed hands won by the learner.
- **`deal_in`**: fraction where the learner discarded another player's
  winning tile.
- **`draw`**: fraction of completed hands with no winner.
- **`score`**: average net game points per completed hand.
- **`score_se`**: estimated standard error of that policy's average score.
  It is not directly the standard error of a policy-to-policy difference.
- **`hu_legal`**: count of learner decisions where HU was legal.
- **`hu_taken`**: count where the learner selected HU.
- **`truncated`**: games stopped by the step guard; excluded from completed
  game rates and Monte Carlo training returns.

### Imitation

- **`teacher_nll`**: negative log-probability assigned to teacher actions.
  Lower means closer imitation, not necessarily stronger game play.
- **`greedy_tile_match`**: when the teacher discards, fraction where the
  network's highest-probability discard tile matches.
- **`greedy_joint_match`**: fraction where the network's highest-probability
  complete action matches the teacher's discard, including the PASS choice.
- **`sampled_joint_match`**: agreement from one stochastic sample per state.
- **`expected_joint_match`**: average probability assigned to the teacher's
  complete discard action.

### PPO

- **`entropy`**: how spread out the policy's action probabilities are.
  A lower value is not automatically better.
- **`value`**: value-prediction MSE on the PPO batch.
- **`policy`**: PPO policy-loss metric; not a direct measure of playing
  strength.
- **`ratio_err`**: pre-update mismatch between recorded and recomputed
  action probabilities; should be close to zero.
- **`kl`**, **`clipfrac`**, **`early_stop`**: diagnostics for policy
  update size.
- **`return_std`**: spread of normalized return targets in the batch.
- **`discard_phase_teacher_match`**: agreement on learner own-turn
  decisions, including self-HU and self-kong.
- **`claim_teacher_match`**: agreement on claim-phase decisions.

---

## Evaluation procedure

Use `evaluate_imitation.py` to evaluate:

1. Local teacher against three local opponents.
2. Stochastic CNN against three local opponents.
3. Greedy CNN against three local opponents.

Use the same fresh seed range when comparing checkpoints, but note that
different actions make the resulting games diverge.

Example: evaluate the current imitation checkpoint on a new range:

```text
python -u evaluate_imitation.py --checkpoint checkpoints/hk_imitation_v2.pt --validation-games 100 --validation-seed 1500400000 --eval-games 1000 --eval-seed 2500000000
```

Evaluate a candidate using the same ranges:

```text
python -u evaluate_imitation.py --checkpoint checkpoints/hk_ppo_warmed.pt.best.pt --validation-games 100 --validation-seed 1500400000 --eval-games 1000 --eval-seed 2500000000
```

These are new ranges relative to the experiments documented here.
Check the user's full logs before assuming they have never been used.

Do not repeatedly tune against the final test range. Use separate:

- Training seeds.
- Validation and checkpoint-selection seeds.
- Final held-out game seeds.

---

## Known limitations and priorities

1. **Value learning:** The imitation checkpoint's value head was badly
   miscalibrated. The warmed checkpoint uses a zero head, not a proven
   predictive value function. PPO can still alter shared policy features.
2. **Checkpoint selection:** The PPO script selects by stochastic score
   on a fixed evaluation set and does not include the starting checkpoint
   as a guaranteed candidate.
3. **Observation mismatch:** The CNN lacks an explicit latest-discard plane.
   Any input change must also update deployment encoding and checkpoint
   compatibility.
4. **Action and rules parity:** Python automatically selects some chow and
   kong choices. Verify scoring, settlement, observations, and actions
   against the live TypeScript game before claiming deployment parity.
5. **Opponent diversity:** Current self-play uses the current network
   snapshot, not a pool of older policies.
6. **Statistical uncertainty:** A single 100- or 500-hand evaluation does
   not prove a small performance difference. Compare on additional unused
   games and report uncertainty.
7. **No guaranteed improvement:** Higher teacher agreement or lower value
   loss alone does not guarantee better game performance.

---

## Working conventions

- The user prefers **complete replacement files**, not partial diffs,
  when requesting code changes.
- Provide commands that can be pasted directly into Terminal; do not
  require a `.sh` file.
- Clearly state when code has not been run or tested.
- Do not claim access to the user's Azure VM or checkpoints unless a tool
  actually provides it.