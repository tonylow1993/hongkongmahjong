"""Fresh-seed evaluation and teacher-imitation training.

Evaluation:
- Local teacher vs three local opponents.
- Expert teacher vs three local opponents.
- Stochastic network vs three local opponents.
- Greedy network vs three local opponents.

Imitation:
- Generates fixed teacher-played validation states (expert by default).
- Reports discard agreement on those exact states.
- Optionally performs behavior-cloning updates on separate seeds.
- Selects a new checkpoint using validation negative log-likelihood.

The final game evaluation uses seeds separate from both BC training
and imitation validation.
"""

from __future__ import annotations

import argparse
import math
import os

import numpy as np
import torch
import torch.nn.functional as F

from env import HKEnv
from local_policy import _claim_score, evaluate_action_scores, local_action
from model import HKMahjongNet
from state_encoding import CLAIM_HU, CLAIM_PASS
from train_azure_selfplay import step_actor, validate_action


def copy_obs(env: HKEnv, pid: int) -> dict[str, np.ndarray]:
    return {
        key: np.asarray(value, dtype=np.float32).copy()
        for key, value in env.observe(pid).items()
    }


def teacher_action(
    env: HKEnv,
    pid: int,
    obs: dict[str, np.ndarray],
    mode: str = "expert",
) -> tuple[int, bool]:
    if mode == "expert":
        _, _, choice, discard = evaluate_action_scores(env, pid, obs)
    else:
        choice, discard = local_action(env, pid, obs)
    choice = int(choice)
    discard = bool(discard)
    validate_action(obs, env.phase, choice, discard)
    return choice, discard


def load_net(path: str) -> HKMahjongNet:
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Checkpoint not found: {path}")

    net = HKMahjongNet()
    state = torch.load(path, map_location="cpu", weights_only=True)
    net.load_state_dict(state)
    net.eval()
    return net


def save_net(net: HKMahjongNet, path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    state = {
        key: value.detach().cpu().clone()
        for key, value in net.state_dict().items()
    }
    temporary = path + ".tmp"
    torch.save(state, temporary)
    os.replace(temporary, path)


def masked_log_probs(
    logits: torch.Tensor,
    mask: torch.Tensor,
) -> torch.Tensor:
    return F.log_softmax(logits.masked_fill(mask <= 0, -1e9), dim=-1)


@torch.no_grad()
def network_action(
    net: HKMahjongNet,
    obs: dict[str, np.ndarray],
    phase: str,
    mode: str,
    generator: torch.Generator,
) -> tuple[int, bool]:
    """Select an action without changing the environment.

    Greedy selection compares the full joint probabilities:
      self action: P(claim)
      discard tile: P(PASS) * P(tile)
    """
    planes = torch.from_numpy(obs["planes"]).unsqueeze(0)
    dmask = torch.from_numpy(obs["discard_mask"]).unsqueeze(0)
    cmask = torch.from_numpy(obs["claim_mask"]).unsqueeze(0)

    if not bool((cmask > 0).any()):
        raise RuntimeError("Actor has no legal claim/PASS action.")

    dl, cl, _ = net(planes, dmask, cmask)
    ld = masked_log_probs(dl, dmask)
    lc = masked_log_probs(cl, cmask)

    if mode == "stochastic":
        claim = int(
            torch.multinomial(
                lc[0].exp(),
                1,
                generator=generator,
            ).item()
        )

        if phase == "discard" and claim == CLAIM_PASS:
            if not bool((dmask > 0).any()):
                raise RuntimeError("PASS selected without a legal discard.")
            choice = int(
                torch.multinomial(
                    ld[0].exp(),
                    1,
                    generator=generator,
                ).item()
            )
            discard = True
        else:
            choice = claim
            discard = False

    elif mode == "greedy":
        if phase == "discard":
            if not bool((dmask > 0).any()):
                raise RuntimeError("No legal discard.")

            # Best complete discard action.
            best_tile = int(torch.argmax(ld[0]).item())
            best_logp = float(
                (lc[0, CLAIM_PASS] + ld[0, best_tile]).item()
            )
            choice = best_tile
            discard = True

            # Compare against each legal self action.
            for claim in np.flatnonzero(obs["claim_mask"] > 0):
                claim = int(claim)
                if claim == CLAIM_PASS:
                    continue
                candidate_logp = float(lc[0, claim].item())
                if candidate_logp > best_logp:
                    best_logp = candidate_logp
                    choice = claim
                    discard = False
        else:
            choice = int(torch.argmax(lc[0]).item())
            discard = False

    else:
        raise ValueError(f"Unknown network mode: {mode}")

    validate_action(obs, phase, choice, discard)
    return choice, discard


def generate_teacher_states(
    seed: int,
    games: int,
    max_steps: int,
    teacher_mode: str = "expert",
) -> tuple[list[dict], int]:
    """Collect teacher actions from all four seats.

    Only completed games are included. Each row represents one
    teacher decision in a state reached by teacher play.
    """
    rows: list[dict] = []
    truncated = 0

    for game in range(games):
        env = HKEnv(seed + game)
        env.reset()
        hand_rows = []

        for _ in range(max_steps):
            if env.done:
                break

            pid = env.current_actor()
            if pid is None:
                raise RuntimeError("Nonterminal environment has no actor.")

            obs = copy_obs(env, pid)
            phase = env.phase
            choice, discard = teacher_action(env, pid, obs, mode=teacher_mode)

            hand_rows.append(
                {
                    "planes": obs["planes"],
                    "dmask": obs["discard_mask"],
                    "cmask": obs["claim_mask"],
                    "phase": phase,
                    "choice": choice,
                    "discard": discard,
                }
            )

            step_actor(env, pid, choice, discard)

        if env.done:
            rows.extend(hand_rows)
        else:
            truncated += 1

    return rows, truncated


def rows_to_tensors(rows: list[dict]) -> dict[str, torch.Tensor]:
    if not rows:
        raise ValueError("No completed teacher states were collected.")

    return {
        "planes": torch.from_numpy(
            np.stack([row["planes"] for row in rows]).astype(np.float32)
        ),
        "dmask": torch.from_numpy(
            np.stack([row["dmask"] for row in rows]).astype(np.float32)
        ),
        "cmask": torch.from_numpy(
            np.stack([row["cmask"] for row in rows]).astype(np.float32)
        ),
        "discard": torch.tensor(
            [row["discard"] for row in rows],
            dtype=torch.bool,
        ),
        "discard_phase": torch.tensor(
            [row["phase"] == "discard" for row in rows],
            dtype=torch.bool,
        ),
        "d_act": torch.tensor(
            [row["choice"] if row["discard"] else 0 for row in rows],
            dtype=torch.long,
        ),
        "c_act": torch.tensor(
            [
                CLAIM_PASS if row["discard"] else row["choice"]
                for row in rows
            ],
            dtype=torch.long,
        ),
    }


def teacher_logp(
    net: HKMahjongNet,
    batch: dict[str, torch.Tensor],
    index: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    dm = batch["dmask"][index]
    cm = batch["cmask"][index]
    dl, cl, _ = net(batch["planes"][index], dm, cm)

    ld = masked_log_probs(dl, dm)
    lc = masked_log_probs(cl, cm)

    selected_claim = lc.gather(
        1, batch["c_act"][index, None]
    ).squeeze(1)
    selected_tile = ld.gather(
        1, batch["d_act"][index, None]
    ).squeeze(1)

    joint = selected_claim + batch["discard"][index].float() * selected_tile
    return joint, ld, lc


@torch.no_grad()
def imitation_metrics(
    net: HKMahjongNet,
    batch: dict[str, torch.Tensor],
    minibatch: int,
    sample_seed: int,
) -> dict[str, float]:
    """Measure predictions on the same fixed teacher-generated states."""
    net.eval()
    n = len(batch["c_act"])
    generator = torch.Generator(device="cpu")
    generator.manual_seed(sample_seed)

    nll_sum = 0.0
    discard_count = 0
    conditional_correct = 0
    joint_greedy_correct = 0
    sampled_correct = 0
    expected_match_sum = 0.0

    for start in range(0, n, minibatch):
        idx = torch.arange(start, min(start + minibatch, n))
        joint, ld, lc = teacher_logp(net, batch, idx)
        nll_sum += float((-joint).sum().item())

        teacher_discard = batch["discard"][idx]
        if not bool(teacher_discard.any()):
            continue

        sub_idx = idx[teacher_discard]
        ld_sub = ld[teacher_discard]
        lc_sub = lc[teacher_discard]
        target = batch["d_act"][sub_idx]
        cmask = batch["cmask"][sub_idx]

        count = len(sub_idx)
        discard_count += count

        best_tile = ld_sub.argmax(dim=1)
        conditional_correct += int((best_tile == target).sum().item())

        discard_logp = (
            lc_sub[:, CLAIM_PASS]
            + ld_sub.gather(1, best_tile[:, None]).squeeze(1)
        )
        self_logp = lc_sub.masked_fill(cmask <= 0, -1e9).clone()
        self_logp[:, CLAIM_PASS] = -1e9
        best_self_logp = self_logp.max(dim=1).values
        chooses_discard = discard_logp >= best_self_logp

        joint_greedy_correct += int(
            (chooses_discard & (best_tile == target)).sum().item()
        )

        target_logp = (
            lc_sub[:, CLAIM_PASS]
            + ld_sub.gather(1, target[:, None]).squeeze(1)
        )
        expected_match_sum += float(target_logp.exp().sum().item())

        sampled_claim = torch.multinomial(
            lc_sub.exp(),
            1,
            generator=generator,
        ).squeeze(1)
        sampled_tile = torch.multinomial(
            ld_sub.exp(),
            1,
            generator=generator,
        ).squeeze(1)

        sampled_correct += int(
            (
                (sampled_claim == CLAIM_PASS)
                & (sampled_tile == target)
            ).sum().item()
        )

    denominator = max(discard_count, 1)
    return {
        "states": float(n),
        "discard_states": float(discard_count),
        "teacher_nll": nll_sum / n,
        "greedy_tile_match": conditional_correct / denominator,
        "greedy_joint_match": joint_greedy_correct / denominator,
        "sampled_joint_match": sampled_correct / denominator,
        "expected_joint_match": expected_match_sum / denominator,
    }


def print_imitation(label: str, metrics: dict[str, float]) -> None:
    print(
        f"{label}: "
        f"states={int(metrics['states'])} "
        f"discard_states={int(metrics['discard_states'])} "
        f"teacher_nll={metrics['teacher_nll']:.4f} "
        f"greedy_tile_match={metrics['greedy_tile_match']:.1%} "
        f"greedy_joint_match={metrics['greedy_joint_match']:.1%} "
        f"sampled_joint_match={metrics['sampled_joint_match']:.1%} "
        f"expected_joint_match={metrics['expected_joint_match']:.1%}",
        flush=True,
    )


def train_bc_batch(
    net: HKMahjongNet,
    opt: torch.optim.Optimizer,
    batch: dict[str, torch.Tensor],
    epochs: int,
    minibatch: int,
) -> float:
    """Supervised learning on teacher actions, including claims."""
    net.eval()
    n = len(batch["c_act"])
    total_loss = 0.0
    total_examples = 0

    for _ in range(epochs):
        order = torch.randperm(n)

        for start in range(0, n, minibatch):
            idx = order[start:start + minibatch]
            joint, _, _ = teacher_logp(net, batch, idx)
            loss = -joint.mean()

            if not bool(torch.isfinite(loss)):
                raise RuntimeError("Non-finite behavior-cloning loss.")

            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                net.parameters(),
                1.0,
                error_if_nonfinite=True,
            )
            opt.step()

            total_loss += float(loss.detach().item()) * len(idx)
            total_examples += len(idx)

    return total_loss / max(total_examples, 1)


def evaluate_games(
    net: HKMahjongNet,
    mode: str,
    seed: int,
    games: int,
    max_steps: int,
    sample_seed: int,
    opponent_mode: str = "expert",
) -> dict:
    """Evaluate one seat against three opponents.

    mode is 'local', 'expert', 'stochastic', or 'greedy'.
    opponent_mode is 'expert' or 'local'.
    """
    generator = torch.Generator(device="cpu")
    generator.manual_seed(sample_seed)

    completed = 0
    truncated = 0
    wins = 0
    deals = 0
    draws = 0
    hu_legal = 0
    hu_taken = 0
    scores: list[float] = []

    for game in range(games):
        env = HKEnv(seed + game)
        env.reset()
        learner = game % 4

        hand_hu_legal = 0
        hand_hu_taken = 0

        for _ in range(max_steps):
            if env.done:
                break

            pid = env.current_actor()
            if pid is None:
                raise RuntimeError("Nonterminal environment has no actor.")

            obs = copy_obs(env, pid)

            if pid == learner:
                if mode in ("stochastic", "greedy"):
                    choice, discard = network_action(
                        net,
                        obs,
                        env.phase,
                        mode,
                        generator,
                    )
                elif mode == "expert":
                    choice, discard = teacher_action(
                        env, pid, obs, mode="expert"
                    )
                else:
                    choice, discard = teacher_action(
                        env, pid, obs, mode="local"
                    )
            else:
                choice, discard = teacher_action(
                    env, pid, obs, mode=opponent_mode
                )

            if pid == learner and obs["claim_mask"][CLAIM_HU] > 0:
                hand_hu_legal += 1
                if not discard and choice == CLAIM_HU:
                    hand_hu_taken += 1

            step_actor(env, pid, choice, discard)

        if not env.done:
            truncated += 1
            continue

        completed += 1
        hu_legal += hand_hu_legal
        hu_taken += hand_hu_taken
        scores.append(float(env.scores[learner]))

        if env.winner is None:
            draws += 1
        elif env.winner == learner:
            wins += 1
        elif env.loser == learner:
            deals += 1

    n = max(completed, 1)
    mean_score = float(np.mean(scores)) if scores else 0.0
    score_se = (
        float(np.std(scores, ddof=1) / math.sqrt(completed))
        if completed > 1
        else float("nan")
    )

    return {
        "mode": mode,
        "completed": completed,
        "truncated": truncated,
        "wins": wins,
        "win_rate": wins / n,
        "deals": deals,
        "deal_rate": deals / n,
        "draw_rate": draws / n,
        "mean_score": mean_score,
        "score_se": score_se,
        "hu_legal": hu_legal,
        "hu_taken": hu_taken,
    }


def print_evaluation(result: dict) -> None:
    print(
        f"fresh evaluation {result['mode']}: "
        f"hands={result['completed']} "
        f"truncated={result['truncated']} "
        f"wins={result['wins']} "
        f"win={result['win_rate']:.1%} "
        f"deal_in={result['deal_rate']:.1%} "
        f"draw={result['draw_rate']:.1%} "
        f"score={result['mean_score']:.3f} "
        f"score_se={result['score_se']:.3f} "
        f"hu_legal={result['hu_legal']} "
        f"hu_taken={result['hu_taken']}",
        flush=True,
    )


def check_teacher_fix() -> None:
    """Fail early if the old claim-feature ordering is still installed."""
    env = HKEnv(0)
    env.reset()
    pass_score = _claim_score(env, 0, CLAIM_PASS)

    if abs(pass_score - (-0.3758)) > 1e-6:
        raise RuntimeError(
            "local_policy.py appears to have the old claim-feature "
            f"ordering: PASS score={pass_score:.4f}, expected -0.3758. "
            "Replace local_policy.py with the corrected version first."
        )


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--checkpoint",
        required=True,
        help="Existing model weights to evaluate or improve.",
    )
    parser.add_argument(
        "--out",
        default="checkpoints/hk_imitation_expert.pt",
        help="New checkpoint path used only when --bc-updates > 0.",
    )

    parser.add_argument("--eval-games", type=int, default=200)
    parser.add_argument("--eval-seed", type=int, default=2_000_000_000)
    parser.add_argument("--validation-games", type=int, default=40)
    parser.add_argument("--validation-seed", type=int, default=1_500_000_000)

    parser.add_argument("--teacher-mode", default="expert", choices=["expert", "local"])
    parser.add_argument("--opponent-mode", default="expert", choices=["expert", "local"])
    parser.add_argument("--bc-updates", type=int, default=0)
    parser.add_argument("--bc-games", type=int, default=20)
    parser.add_argument("--bc-seed", type=int, default=1_000_000_000)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--minibatch", type=int, default=256)
    parser.add_argument("--lr", type=float, default=0.0001)
    parser.add_argument("--max-steps", type=int, default=1000)
    parser.add_argument("--sample-seed", type=int, default=777)

    args = parser.parse_args()

    for name in (
        "eval_games",
        "validation_games",
        "bc_games",
        "epochs",
        "minibatch",
        "max_steps",
    ):
        if getattr(args, name) < 1:
            parser.error(f"--{name.replace('_', '-')} must be positive.")

    if args.bc_updates < 0:
        parser.error("--bc-updates must be nonnegative.")

    if args.lr <= 0 or not math.isfinite(args.lr):
        parser.error("--lr must be finite and positive.")

    for name in ("eval_seed", "validation_seed", "bc_seed", "sample_seed"):
        if getattr(args, name) < 0:
            parser.error(f"--{name.replace('_', '-')} must be nonnegative.")

    ranges = [
        (
            "validation",
            args.validation_seed,
            args.validation_seed + args.validation_games,
        ),
        (
            "evaluation",
            args.eval_seed,
            args.eval_seed + args.eval_games,
        ),
    ]

    if args.bc_updates:
        ranges.append(
            (
                "BC training",
                args.bc_seed,
                args.bc_seed + args.bc_updates * args.bc_games,
            )
        )

    for i, (name_a, start_a, end_a) in enumerate(ranges):
        for name_b, start_b, end_b in ranges[i + 1:]:
            if max(start_a, start_b) < min(end_a, end_b):
                parser.error(
                    f"{name_a} and {name_b} seed ranges overlap."
                )

    if (
        args.bc_updates
        and os.path.abspath(args.checkpoint) == os.path.abspath(args.out)
    ):
        parser.error("--out must differ from --checkpoint.")

    torch.set_num_threads(1)
    torch.manual_seed(args.sample_seed)

    check_teacher_fix()
    net = load_net(args.checkpoint)

    print(
        f"Loaded checkpoint: {args.checkpoint} (teacher-mode: {args.teacher_mode})",
        flush=True,
    )
    print(
        "Collecting fixed teacher validation states...",
        flush=True,
    )

    validation_rows, validation_truncated = generate_teacher_states(
        args.validation_seed,
        args.validation_games,
        args.max_steps,
        teacher_mode=args.teacher_mode,
    )
    validation = rows_to_tensors(validation_rows)

    print(
        f"validation_games={args.validation_games} "
        f"truncated={validation_truncated}",
        flush=True,
    )

    before = imitation_metrics(
        net,
        validation,
        args.minibatch,
        args.sample_seed,
    )
    print_imitation("initial imitation validation", before)

    if args.bc_updates:
        opt = torch.optim.Adam(net.parameters(), lr=args.lr)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            opt, T_max=args.bc_updates, eta_min=args.lr * 0.1
        )

        best_nll = before["teacher_nll"]
        save_net(net, args.out)

        for update in range(args.bc_updates):
            start_seed = args.bc_seed + update * args.bc_games
            train_rows, truncated = generate_teacher_states(
                start_seed,
                args.bc_games,
                args.max_steps,
                teacher_mode=args.teacher_mode,
            )
            train_batch = rows_to_tensors(train_rows)

            loss = train_bc_batch(
                net,
                opt,
                train_batch,
                args.epochs,
                args.minibatch,
            )
            scheduler.step()

            metrics = imitation_metrics(
                net,
                validation,
                args.minibatch,
                args.sample_seed,
            )

            print(
                f"BC {update + 1}/{args.bc_updates}: "
                f"train_states={len(train_rows)} "
                f"truncated={truncated} "
                f"train_nll={loss:.4f}",
                flush=True,
            )
            print_imitation("  validation", metrics)

            if metrics["teacher_nll"] < best_nll:
                best_nll = metrics["teacher_nll"]
                save_net(net, args.out)
                print(
                    f"  saved best validation checkpoint: {args.out}",
                    flush=True,
                )

        net = load_net(args.out)
        print(
            f"Selected checkpoint: {args.out}",
            flush=True,
        )
        final_metrics = imitation_metrics(
            net,
            validation,
            args.minibatch,
            args.sample_seed,
        )
        print_imitation("selected imitation validation", final_metrics)

    print(
        f"Evaluating on fresh game seeds "
        f"{args.eval_seed}–{args.eval_seed + args.eval_games - 1}...",
        flush=True,
    )

    for mode in ("local", "expert", "stochastic", "greedy"):
        result = evaluate_games(
            net,
            mode,
            args.eval_seed,
            args.eval_games,
            args.max_steps,
            args.sample_seed,
            opponent_mode=args.opponent_mode,
        )
        print_evaluation(result)


if __name__ == "__main__":
    main()
