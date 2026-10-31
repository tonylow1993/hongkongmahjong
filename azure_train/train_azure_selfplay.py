"""Teacher-assisted PPO and self-play.

Stages:
1. Behavior cloning from local_action demonstrations.
2. On-policy PPO with a decaying auxiliary teacher loss.

PPO learner actions are always sampled from the neural policy.
Discard probability = P(PASS) * P(discard tile).

Opponents are selected once per seat per hand:
- local teacher
- frozen current policy
- random legal player

Returns use score changes between successive learner decisions.
gamma discounts once per learner decision.

Checkpoints contain model weights only. --resume is a warm start,
not an exact continuation of optimizer, RNG, or schedules.
"""

from __future__ import annotations

import argparse
import os
from multiprocessing import get_context

import numpy as np
import torch
import torch.nn.functional as F
import torch.optim as optim

from env import HKEnv
from local_policy import local_action
from model import HKMahjongNet
from state_encoding import (
    CLAIM_GANG,
    CLAIM_HU,
    CLAIM_PASS,
    N_CHANNELS,
    N_CLAIM,
    N_TILES,
)

KEYS = (
    "planes",
    "dmask",
    "cmask",
    "d_act",
    "c_act",
    "is_discard",
    "discard_phase",
    "teacher_d",
    "teacher_c",
    "teacher_discard",
    "logp",
    "old_value",
    "returns",
)

INTEGER_KEYS = {
    "d_act",
    "c_act",
    "teacher_d",
    "teacher_c",
}

STAT_KEYS = (
    "completed",
    "truncated",
    "wins",
    "deals",
    "draws",
    "score_sum",
    "fan_sum",
    "hu_legal",
    "hu_taken",
    "discard_decisions",
    "discard_matches",
    "claim_decisions",
    "claim_matches",
)


def weights_of(net: HKMahjongNet) -> dict:
    return {
        name: tensor.detach().cpu().clone()
        for name, tensor in net.state_dict().items()
    }


def make_net(weights: dict) -> HKMahjongNet:
    net = HKMahjongNet()
    net.load_state_dict(weights)

    # Rollout and optimization both use the same frozen BatchNorm
    # behavior. eval() does not disable gradients.
    net.eval()
    return net


def head_stats(
    logits: torch.Tensor,
    mask: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    legal = mask > 0
    logp = F.log_softmax(
        logits.masked_fill(~legal, -1e9),
        dim=-1,
    )
    prob = logp.exp().masked_fill(~legal, 0.0)
    safe_logp = logp.masked_fill(~legal, 0.0)
    entropy = -(prob * safe_logp).sum(-1)
    return logp, entropy


def action_terms(
    dl: torch.Tensor,
    cl: torch.Tensor,
    dm: torch.Tensor,
    cm: torch.Tensor,
    da: torch.Tensor,
    ca: torch.Tensor,
    discard: torch.Tensor,
    discard_phase: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    ld, hd = head_stats(dl, dm)
    lc, hc = head_stats(cl, cm)

    # Discard rows have ca = CLAIM_PASS.
    logp = lc.gather(1, ca[:, None]).squeeze(1)
    logp = logp + discard * ld.gather(1, da[:, None]).squeeze(1)

    # Full hierarchical action entropy:
    # H(claim) + P(PASS) * H(discard) during discard phase.
    entropy = hc + discard_phase * lc[:, CLAIM_PASS].exp() * hd
    return logp, entropy


def validate_action(
    obs: dict,
    phase: str,
    choice: int,
    discard: bool,
) -> None:
    if discard:
        valid = (
            phase == "discard"
            and 0 <= choice < N_TILES
            and obs["discard_mask"][choice] > 0
            and obs["claim_mask"][CLAIM_PASS] > 0
        )
    else:
        valid = (
            0 <= choice < N_CLAIM
            and obs["claim_mask"][choice] > 0
            and not (phase == "discard" and choice == CLAIM_PASS)
        )

    if not valid:
        raise RuntimeError(
            f"Illegal action: phase={phase}, choice={choice}, "
            f"discard={discard}"
        )


@torch.no_grad()
def sample_action(
    net: HKMahjongNet,
    obs: dict,
    phase: str,
) -> tuple[int, bool, float, float]:
    planes = torch.from_numpy(obs["planes"]).unsqueeze(0)
    dm = torch.from_numpy(obs["discard_mask"]).unsqueeze(0)
    cm = torch.from_numpy(obs["claim_mask"]).unsqueeze(0)

    if not bool((cm > 0).any()):
        raise RuntimeError("Actor has no legal claim/PASS action.")

    dl, cl, value = net(planes, dm, cm)
    ld, _ = head_stats(dl, dm)
    lc, _ = head_stats(cl, cm)

    claim = int(torch.multinomial(lc[0].exp(), 1).item())

    if phase == "discard" and claim == CLAIM_PASS:
        if not bool((dm > 0).any()):
            raise RuntimeError("PASS selected without a legal discard.")

        choice = int(torch.multinomial(ld[0].exp(), 1).item())
        discard = True
        logp = lc[0, CLAIM_PASS] + ld[0, choice]
    else:
        choice = claim
        discard = False
        logp = lc[0, choice]

    validate_action(obs, phase, choice, discard)
    return choice, discard, float(logp.item()), float(value.item())


@torch.no_grad()
def greedy_action(
    net: HKMahjongNet,
    obs: dict,
    phase: str,
) -> tuple[int, bool]:
    planes = torch.from_numpy(obs["planes"]).unsqueeze(0)
    dm = torch.from_numpy(obs["discard_mask"]).unsqueeze(0)
    cm = torch.from_numpy(obs["claim_mask"]).unsqueeze(0)

    if not bool((cm > 0).any()):
        raise RuntimeError("Actor has no legal claim/PASS action.")

    dl, cl, _ = net(planes, dm, cm)
    ld, _ = head_stats(dl, dm)
    lc, _ = head_stats(cl, cm)

    if phase == "discard":
        if not bool((dm > 0).any()):
            raise RuntimeError("No legal discard.")
        best_tile = int(torch.argmax(ld[0]).item())
        best_logp = float((lc[0, CLAIM_PASS] + ld[0, best_tile]).item())
        choice = best_tile
        discard = True

        for kind in (CLAIM_HU, CLAIM_GANG):
            if cm[0, kind] > 0 and float(lc[0, kind].item()) > best_logp:
                best_logp = float(lc[0, kind].item())
                choice = kind
                discard = False
    else:
        choice = int(torch.argmax(lc[0]).item())
        discard = False

    validate_action(obs, phase, choice, discard)
    return choice, discard


def teacher_action(
    env: HKEnv,
    pid: int,
    obs: dict,
    mode: str = "expert",
) -> tuple[int, bool]:
    if mode == "expert":
        from local_policy import evaluate_action_scores
        _, _, choice, discard = evaluate_action_scores(env, pid, obs)
    else:
        choice, discard = local_action(env, pid, obs)
    choice = int(choice)
    discard = bool(discard)
    validate_action(obs, env.phase, choice, discard)
    return choice, discard


def random_action(
    obs: dict,
    phase: str,
    rng: np.random.Generator,
) -> tuple[int, bool]:
    # Opponents may use hard-coded rules; their actions are not used
    # as learner PPO samples.
    if obs["claim_mask"][CLAIM_HU] > 0:
        return CLAIM_HU, False

    mask = (
        obs["discard_mask"]
        if phase == "discard"
        else obs["claim_mask"]
    )
    legal = np.flatnonzero(mask > 0)

    if not len(legal):
        raise RuntimeError("Random opponent has no legal action.")

    return int(rng.choice(legal)), phase == "discard"


def step_actor(
    env: HKEnv,
    pid: int,
    choice: int,
    discard: bool,
) -> None:
    if env.phase == "discard":
        if discard:
            env.step_discard(pid, choice)
        else:
            env.step_self(pid, choice)
    else:
        if discard:
            raise RuntimeError("Discard during claim phase.")
        env.step_claim(pid, choice)


def empty_stats() -> dict:
    return {key: 0.0 for key in STAT_KEYS}


def record_result(stats: dict, env: HKEnv, learner: int) -> None:
    stats["completed"] += 1
    stats["score_sum"] += float(env.scores[learner])

    if env.winner is None:
        stats["draws"] += 1
    elif env.winner == learner:
        stats["wins"] += 1
        stats["fan_sum"] += float(env.win_fan)
    elif env.loser == learner:
        stats["deals"] += 1


def record_decision(
    stats: dict,
    obs: dict,
    phase: str,
    choice: int,
    discard: bool,
    teacher: int,
    teacher_discard: bool,
) -> None:
    """Count legal HU opportunities and agreement with the teacher."""
    if obs["claim_mask"][CLAIM_HU] > 0:
        stats["hu_legal"] += 1
        if not discard and choice == CLAIM_HU:
            stats["hu_taken"] += 1

    matched = choice == teacher and discard == teacher_discard

    if phase == "discard":
        # Includes self-HU and self-kong decisions.
        stats["discard_decisions"] += 1
        stats["discard_matches"] += int(matched)
    else:
        stats["claim_decisions"] += 1
        stats["claim_matches"] += int(matched)


def pack(data: dict[str, list]) -> dict[str, np.ndarray]:
    shapes = {
        "planes": (N_CHANNELS, 4, 9),
        "dmask": (N_TILES,),
        "cmask": (N_CLAIM,),
    }

    result = {}

    for key in KEYS:
        if key in shapes:
            result[key] = (
                np.stack(data[key]).astype(np.float32, copy=False)
                if data[key]
                else np.empty((0, *shapes[key]), np.float32)
            )
        else:
            dtype = np.int64 if key in INTEGER_KEYS else np.float32
            result[key] = np.asarray(data[key], dtype=dtype)

    return result


def collect(
    weights: dict,
    seed: int,
    first_game: int,
    games: int,
    gamma: float,
    score_scale: float,
    max_steps: int,
    local_prob: float,
    self_prob: float,
    demonstrations: bool,
) -> tuple[dict, dict]:
    torch.set_num_threads(1)
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    net = make_net(weights)

    data = {key: [] for key in KEYS}
    stats = empty_stats()

    for g in range(games):
        env = HKEnv(seed + g)
        env.reset()
        learner = (first_game + g) % 4

        # Opponent identity remains fixed for the duration of a hand.
        opponents = rng.choice(
            ["local", "self", "random"],
            size=4,
            p=[
                local_prob,
                self_prob,
                max(0.0, 1.0 - local_prob - self_prob),
            ],
        )

        if demonstrations:
            opponents[:] = "local"

        trajectory = []

        for _ in range(max_steps):
            if env.done:
                break

            pid = env.current_actor()
            if pid is None:
                raise RuntimeError("Nonterminal environment has no actor.")

            obs = {
                key: np.asarray(value, dtype=np.float32).copy()
                for key, value in env.observe(pid).items()
            }

            if pid == learner:
                phase = env.phase

                # Teacher labels are computed without executing them.
                teacher, teacher_discard = teacher_action(
                    env, pid, obs, mode="expert"
                )

                if demonstrations:
                    # Demonstration rows are used only for BC.
                    choice, discard = teacher, teacher_discard
                    logp, value = 0.0, 0.0
                else:
                    # PPO actions come from the neural policy itself.
                    choice, discard, logp, value = sample_action(
                        net, obs, phase
                    )

                record_decision(
                    stats,
                    obs,
                    phase,
                    choice,
                    discard,
                    teacher,
                    teacher_discard,
                )

                trajectory.append(
                    {
                        "planes": obs["planes"],
                        "dmask": obs["discard_mask"],
                        "cmask": obs["claim_mask"],
                        "d_act": choice if discard else 0,
                        "c_act": CLAIM_PASS if discard else choice,
                        "is_discard": float(discard),
                        "discard_phase": float(phase == "discard"),
                        "teacher_d": teacher if teacher_discard else 0,
                        "teacher_c": (
                            CLAIM_PASS if teacher_discard else teacher
                        ),
                        "teacher_discard": float(teacher_discard),
                        "logp": logp,
                        "old_value": value,
                        "score_before": float(env.scores[pid]),
                    }
                )

            elif opponents[pid] == "local":
                choice, discard = teacher_action(
                    env, pid, obs, mode="expert"
                )

            elif opponents[pid] == "self":
                choice, discard, _, _ = sample_action(net, obs, env.phase)

            else:
                choice, discard = random_action(obs, env.phase, rng)

            step_actor(env, pid, choice, discard)

        if not env.done:
            stats["truncated"] += 1
            # Exclude incomplete Monte Carlo returns from training.
            continue

        record_result(stats, env, learner)

        next_score = float(env.scores[learner])
        return_to_go = 0.0

        for row in reversed(trajectory):
            reward = (
                next_score - row["score_before"]
            ) / score_scale
            return_to_go = reward + gamma * return_to_go
            next_score = row["score_before"]
            row["returns"] = return_to_go

            for key in KEYS:
                data[key].append(row[key])

    return pack(data), stats


def merge_parts(parts: list) -> tuple[dict | None, dict]:
    stats = empty_stats()
    usable = []

    for batch, result in parts:
        for key in STAT_KEYS:
            stats[key] += result[key]

        if len(batch["returns"]):
            usable.append(batch)

    if not usable:
        return None, stats

    merged = {
        key: np.concatenate([batch[key] for batch in usable])
        for key in KEYS
    }
    return merged, stats


def forward_batch(
    net: HKMahjongNet,
    tensors: dict,
    index: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    dm = tensors["dmask"][index]
    cm = tensors["cmask"][index]
    phase = tensors["discard_phase"][index]

    dl, cl, value = net(
        tensors["planes"][index],
        dm,
        cm,
    )

    logp, entropy = action_terms(
        dl,
        cl,
        dm,
        cm,
        tensors["d_act"][index],
        tensors["c_act"][index],
        tensors["is_discard"][index],
        phase,
    )

    teacher_logp, _ = action_terms(
        dl,
        cl,
        dm,
        cm,
        tensors["teacher_d"][index],
        tensors["teacher_c"][index],
        tensors["teacher_discard"][index],
        phase,
    )

    return logp, entropy, value, teacher_logp


def update_model(
    net: HKMahjongNet,
    opt: optim.Optimizer,
    batch: dict,
    epochs: int,
    minibatch: int,
    clip: float,
    entropy_coef: float,
    bc_coef: float,
    target_kl: float,
    demonstrations: bool,
) -> dict:
    net.eval()
    tensors = {
        key: torch.from_numpy(value)
        for key, value in batch.items()
    }

    n = len(tensors["returns"])
    if not n:
        raise ValueError("Empty training batch.")

    metrics = {
        "loss": 0.0,
        "policy": 0.0,
        "value": 0.0,
        "bc": 0.0,
        "entropy": 0.0,
        "kl": 0.0,
        "clipfrac": 0.0,
    }

    ratio_error = 0.0

    if not demonstrations:
        with torch.no_grad():
            for start in range(0, n, minibatch):
                index = torch.arange(start, min(start + minibatch, n))
                logp, _, value, _ = forward_batch(net, tensors, index)

                ratio = (logp - tensors["logp"][index]).exp()

                if not bool(torch.isfinite(ratio).all()):
                    raise RuntimeError("Non-finite PPO ratios.")

                ratio_error = max(
                    ratio_error,
                    float((ratio - 1).abs().max().item()),
                )

                if not torch.allclose(
                    value,
                    tensors["old_value"][index],
                    atol=1e-4,
                    rtol=1e-4,
                ):
                    raise RuntimeError("Rollout/learner value mismatch.")

        if ratio_error > 1e-4:
            raise RuntimeError(
                f"Rollout/learner probability mismatch: {ratio_error:.6g}"
            )

    advantage = tensors["returns"] - tensors["old_value"]
    advantage = (
        (advantage - advantage.mean())
        / advantage.std(unbiased=False).clamp_min(1e-6)
    )

    seen = 0
    stopped = False
    stop_kl = 0.0

    for _ in range(epochs):
        order = torch.randperm(n)

        for start in range(0, n, minibatch):
            index = order[start:start + minibatch]

            logp, entropy, value, teacher_logp = forward_batch(
                net,
                tensors,
                index,
            )
            bc_loss = -teacher_logp.mean()

            if demonstrations:
                policy_loss = logp.new_zeros(())
                value_loss = logp.new_zeros(())
                kl = logp.new_zeros(())
                clipfrac = logp.new_zeros(())

                # No PPO update or value loss on demonstration rows.
                loss = bc_loss

            else:
                log_ratio = logp - tensors["logp"][index]
                ratio = log_ratio.exp()
                kl = ((ratio - 1) - log_ratio).mean()

                if not bool(torch.isfinite(kl)):
                    raise RuntimeError("Non-finite PPO KL.")

                if (
                    target_kl > 0
                    and float(kl.detach().item()) > 1.5 * target_kl
                ):
                    stopped = True
                    stop_kl = float(kl.detach().item())
                    break

                adv = advantage[index]
                policy_loss = -torch.minimum(
                    ratio * adv,
                    ratio.clamp(1 - clip, 1 + clip) * adv,
                ).mean()

                value_loss = F.mse_loss(
                    value,
                    tensors["returns"][index],
                )
                clipfrac = (
                    (ratio - 1).abs() > clip
                ).float().mean()

                loss = (
                    policy_loss
                    + 0.5 * value_loss
                    - entropy_coef * entropy.mean()
                    + bc_coef * bc_loss
                )

            if not bool(torch.isfinite(loss)):
                raise RuntimeError("Non-finite training loss.")

            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                net.parameters(),
                1.0,
                error_if_nonfinite=True,
            )
            opt.step()

            size = len(index)
            values = {
                "loss": loss,
                "policy": policy_loss,
                "value": value_loss,
                "bc": bc_loss,
                "entropy": entropy.mean(),
                "kl": kl,
                "clipfrac": clipfrac,
            }

            for key, item in values.items():
                metrics[key] += float(item.detach().item()) * size

            seen += size

        if stopped:
            break

    for key in metrics:
        metrics[key] /= max(seen, 1)

    metrics["ratio_error"] = ratio_error
    metrics["return_std"] = float(
        tensors["returns"].std(unbiased=False).item()
    )
    metrics["early_stop"] = float(stopped)
    metrics["stop_kl"] = stop_kl
    return metrics


def evaluate(
    weights: dict,
    games: int,
    seed: int,
    max_steps: int,
    learner_mode: str = "neural",
    opponent_mode: str = "expert",
) -> dict:
    """Evaluate one learner seat against three opponents.

    learner_mode is 'neural', 'local', or 'expert'.
    opponent_mode is 'expert' or 'local'.
    """
    stats = empty_stats()

    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(seed)
        net = make_net(weights)

        for g in range(games):
            learner = g % 4
            env = HKEnv(seed + g)
            env.reset()

            for _ in range(max_steps):
                if env.done:
                    break

                pid = env.current_actor()
                if pid is None:
                    raise RuntimeError("Nonterminal environment has no actor.")

                obs = {
                    key: np.asarray(value, dtype=np.float32)
                    for key, value in env.observe(pid).items()
                }

                if pid == learner:
                    teacher, teacher_discard = teacher_action(
                        env, pid, obs, mode="expert"
                    )

                    if learner_mode == "local":
                        choice, discard = teacher_action(
                            env, pid, obs, mode="local"
                        )
                    elif learner_mode == "expert":
                        choice, discard = teacher, teacher_discard
                    else:
                        choice, discard = greedy_action(
                            net,
                            obs,
                            env.phase,
                        )

                    record_decision(
                        stats,
                        obs,
                        env.phase,
                        choice,
                        discard,
                        teacher,
                        teacher_discard,
                    )
                else:
                    choice, discard = teacher_action(
                        env, pid, obs, mode=opponent_mode
                    )

                step_actor(env, pid, choice, discard)

            if env.done:
                record_result(stats, env, learner)
            else:
                stats["truncated"] += 1

    return stats


def result_text(stats: dict) -> str:
    n = max(stats["completed"], 1)
    wins = max(stats["wins"], 1)

    def percent(numerator: str, denominator: str) -> str:
        total = stats[denominator]
        if total == 0:
            return "n/a"
        return f"{stats[numerator] / total:.1%}"

    return (
        f"hands={int(stats['completed'])} "
        f"truncated={int(stats['truncated'])} "
        f"win={stats['wins'] / n:.1%} "
        f"deal_in={stats['deals'] / n:.1%} "
        f"draw={stats['draws'] / n:.1%} "
        f"score={stats['score_sum'] / n:.3f} "
        f"faan={stats['fan_sum'] / wins:.2f} "
        f"hu_legal={int(stats['hu_legal'])} "
        f"hu_taken={int(stats['hu_taken'])} "
        f"discard_phase_teacher_match="
        f"{percent('discard_matches', 'discard_decisions')} "
        f"claim_teacher_match="
        f"{percent('claim_matches', 'claim_decisions')}"
    )


def save_weights(net: HKMahjongNet, path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    temporary = path + ".tmp"
    torch.save(weights_of(net), temporary)
    os.replace(temporary, path)


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--games", type=int, default=6)
    parser.add_argument("--updates", type=int, default=300)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--minibatch", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--clip", type=float, default=0.2)
    parser.add_argument("--entropy", type=float, default=0.01)
    parser.add_argument("--gamma", type=float, default=1.0)
    parser.add_argument("--score-scale", type=float, default=20.0)
    parser.add_argument("--max-steps", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--target-kl", type=float, default=0.02)

    parser.add_argument("--bc-updates", type=int, default=20)
    parser.add_argument("--bc-start", type=float, default=0.2)
    parser.add_argument("--bc-end", type=float, default=0.02)
    parser.add_argument("--local-prob", type=float, default=0.5)
    parser.add_argument("--self-prob", type=float, default=0.4)

    parser.add_argument("--eval-every", type=int, default=20)
    parser.add_argument("--eval-games", type=int, default=100)
    parser.add_argument(
        "--out",
        default="checkpoints/hk_teacher_ppo.pt",
    )
    parser.add_argument(
        "--resume",
        default=None,
        help="Warm-start model weights only; optimizer/schedules restart.",
    )

    args = parser.parse_args()

    for name in (
        "workers",
        "games",
        "updates",
        "epochs",
        "minibatch",
        "max_steps",
        "eval_every",
        "eval_games",
    ):
        if getattr(args, name) < 1:
            parser.error(f"--{name.replace('_', '-')} must be positive.")

    if args.bc_updates < 0 or args.seed < 0:
        parser.error("bc-updates and seed must be nonnegative.")

    if not 0 <= args.gamma <= 1 or not 0 < args.clip < 1:
        parser.error("Require gamma in [0,1] and clip in (0,1).")

    if not args.lr > 0 or not args.score_scale > 0:
        parser.error("lr and score-scale must be positive.")

    if any(
        not np.isfinite(getattr(args, name))
        for name in (
            "lr",
            "score_scale",
            "entropy",
            "bc_start",
            "bc_end",
            "target_kl",
            "local_prob",
            "self_prob",
        )
    ):
        parser.error("Numeric parameters must be finite.")

    if min(
        args.entropy,
        args.bc_start,
        args.bc_end,
        args.target_kl,
    ) < 0:
        parser.error("Loss coefficients and target-kl must be nonnegative.")

    if (
        min(args.local_prob, args.self_prob) < 0
        or args.local_prob + args.self_prob > 1
    ):
        parser.error(
            "Opponent probabilities must be >= 0 and sum to <= 1."
        )

    torch.set_num_threads(1)
    torch.manual_seed(args.seed)

    net = HKMahjongNet()

    if args.resume:
        if not os.path.isfile(args.resume):
            parser.error(f"Checkpoint not found: {args.resume}")

        state = torch.load(
            args.resume,
            map_location="cpu",
            weights_only=True,
        )
        net.load_state_dict(state)
        print(
            f"Warm-started weights from {args.resume}",
            flush=True,
        )

    net.eval()
    opt = optim.Adam(net.parameters(), lr=args.lr)
    eval_seed = args.seed + 1_000_000_000

    print(
        f"params={net.param_count()} "
        f"opponents: local={args.local_prob:.0%}, "
        f"self={args.self_prob:.0%}, "
        f"random={1 - args.local_prob - args.self_prob:.0%}",
        flush=True,
    )

    baseline = evaluate(
        weights_of(net),
        args.eval_games,
        eval_seed,
        args.max_steps,
        learner_mode="local",
    )
    print(
        "local vs local baseline: " + result_text(baseline),
        flush=True,
    )

    expert_bl = evaluate(
        weights_of(net),
        args.eval_games,
        eval_seed,
        args.max_steps,
        learner_mode="expert",
        opponent_mode="expert",
    )
    print(
        "expert vs expert baseline: " + result_text(expert_bl),
        flush=True,
    )

    initial = evaluate(
        weights_of(net),
        args.eval_games,
        eval_seed,
        args.max_steps,
        learner_mode="neural",
        opponent_mode="expert",
    )
    print(
        "initial network vs expert: " + result_text(initial),
        flush=True,
    )

    ctx = get_context("spawn")
    best_score = -float("inf")
    global_game = 0

    with ctx.Pool(args.workers) as pool:
        for demonstrations, count in (
            (True, args.bc_updates),
            (False, args.updates),
        ):
            # Start PPO with a fresh optimizer after BC.
            if not demonstrations:
                opt = optim.Adam(net.parameters(), lr=args.lr)

            for update in range(count):
                current_weights = weights_of(net)
                jobs = []

                for worker in range(args.workers):
                    first_game = global_game + worker * args.games

                    jobs.append(
                        (
                            current_weights,
                            args.seed + first_game,
                            first_game,
                            args.games,
                            args.gamma,
                            args.score_scale,
                            args.max_steps,
                            args.local_prob,
                            args.self_prob,
                            demonstrations,
                        )
                    )

                global_game += args.workers * args.games
                batch, stats = merge_parts(pool.starmap(collect, jobs))
                stage = "BC" if demonstrations else "PPO"

                if batch is None:
                    print(
                        f"{stage} {update + 1}/{count}: no usable samples; "
                        + result_text(stats),
                        flush=True,
                    )
                    continue

                progress = update / max(count - 1, 1)
                bc_coef = (
                    args.bc_start
                    + progress * (args.bc_end - args.bc_start)
                )

                metrics = update_model(
                    net,
                    opt,
                    batch,
                    epochs=args.epochs,
                    minibatch=args.minibatch,
                    clip=args.clip,
                    entropy_coef=args.entropy,
                    bc_coef=bc_coef,
                    target_kl=args.target_kl,
                    demonstrations=demonstrations,
                )

                print(
                    f"{stage} {update + 1}/{count} "
                    f"loss={metrics['loss']:.4f} "
                    f"policy={metrics['policy']:.4f} "
                    f"value={metrics['value']:.4f} "
                    f"teacher_nll={metrics['bc']:.4f} "
                    f"bc_coef={1.0 if demonstrations else bc_coef:.3f} "
                    f"entropy={metrics['entropy']:.3f} "
                    f"kl={metrics['kl']:.5f} "
                    f"clipfrac={metrics['clipfrac']:.1%} "
                    f"ratio_err={metrics['ratio_error']:.2e} "
                    f"return_std={metrics['return_std']:.4f} "
                    f"early_stop={int(metrics['early_stop'])} "
                    f"stop_kl={metrics['stop_kl']:.5f} "
                    f"steps={len(batch['returns'])} "
                    + result_text(stats),
                    flush=True,
                )

                save_weights(net, args.out)

                if (
                    (update + 1) % args.eval_every == 0
                    or update + 1 == count
                ):
                    result = evaluate(
                        weights_of(net),
                        args.eval_games,
                        eval_seed,
                        args.max_steps,
                        learner_mode="neural",
                        opponent_mode="expert",
                    )
                    print(
                        f"{stage} evaluation vs expert: "
                        + result_text(result),
                        flush=True,
                    )

                    # Compare only fully completed evaluation batches.
                    if (
                        result["completed"] == args.eval_games
                        and result["truncated"] == 0
                    ):
                        score = (
                            result["score_sum"] / result["completed"]
                        )

                        if score > best_score:
                            best_score = score
                            save_weights(net, args.out + ".best.pt")
                            win_rate = result["wins"] / max(result["completed"], 1)
                            deal_rate = result["deals"] / max(result["completed"], 1)
                            marker = " ⭐ EXCEEDED EXPERT BOT! ⭐" if (score > 0.0 and win_rate >= 0.25) else ""
                            print(
                                f"Saved best evaluation score={score:.3f} win={win_rate:.1%} deals={deal_rate:.1%}{marker}",
                                flush=True,
                            )


if __name__ == "__main__":
    main()