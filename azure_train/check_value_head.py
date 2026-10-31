"""Diagnose value predictions in an existing Mahjong checkpoint.

This file does not train or modify the checkpoint.

It collects completed hands against three local-policy opponents and
compares the value head with the Monte Carlo return used by PPO.

Example:
  python check_value_head.py \
    --checkpoint checkpoints/hk_imitation_v2.pt \
    --games 100
"""

from __future__ import annotations

import argparse
import os

import numpy as np
import torch

from model import HKMahjongNet
from train_azure_selfplay import collect, weights_of


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--games", type=int, default=100)
    parser.add_argument("--seed", type=int, default=1800000000)
    parser.add_argument("--max-steps", type=int, default=1000)
    parser.add_argument("--score-scale", type=float, default=20.0)

    args = parser.parse_args()

    if args.games < 1:
        parser.error("--games must be positive.")
    if args.seed < 0:
        parser.error("--seed must be nonnegative.")
    if args.max_steps < 1:
        parser.error("--max-steps must be positive.")
    if not np.isfinite(args.score_scale) or args.score_scale <= 0:
        parser.error("--score-scale must be finite and positive.")
    if not os.path.isfile(args.checkpoint):
        parser.error(f"Checkpoint not found: {args.checkpoint}")

    torch.set_num_threads(1)

    net = HKMahjongNet()
    state = torch.load(
        args.checkpoint,
        map_location="cpu",
        weights_only=True,
    )
    net.load_state_dict(state)
    net.eval()

    # With gamma=1, each decision gets the learner's eventual
    # score change divided by score_scale.
    batch, stats = collect(
        weights=weights_of(net),
        seed=args.seed,
        first_game=0,
        games=args.games,
        gamma=1.0,
        score_scale=args.score_scale,
        max_steps=args.max_steps,
        local_prob=1.0,
        self_prob=0.0,
        demonstrations=False,
    )

    predictions = batch["old_value"].astype(np.float64)
    returns = batch["returns"].astype(np.float64)

    if len(returns) == 0:
        raise RuntimeError(
            "No completed learner trajectories were collected."
        )

    errors = predictions - returns
    value_mse = float(np.mean(errors ** 2))
    zero_mse = float(np.mean(returns ** 2))

    prediction_std = float(np.std(predictions))
    return_std = float(np.std(returns))

    if prediction_std > 1e-12 and return_std > 1e-12:
        correlation = float(np.corrcoef(predictions, returns)[0, 1])
        correlation_text = f"{correlation:.3f}"
    else:
        correlation_text = "n/a"

    completed = int(stats["completed"])
    wins = int(stats["wins"])
    draws = int(stats["draws"])
    truncated = int(stats["truncated"])

    print(f"checkpoint={args.checkpoint}")
    print(
        f"completed_hands={completed} truncated={truncated} "
        f"wins={wins} draws={draws} decisions={len(returns)}"
    )
    print(
        f"prediction_mean={np.mean(predictions):.4f} "
        f"prediction_std={prediction_std:.4f}"
    )
    print(
        f"return_mean={np.mean(returns):.4f} "
        f"return_std={return_std:.4f}"
    )
    print(f"value_mse={value_mse:.5f}")
    print(f"always_zero_mse={zero_mse:.5f}")
    print(f"value_return_correlation={correlation_text}")
    print(
        "Note: metrics are decision-weighted; decisions from the same "
        "hand are correlated. This is a diagnostic, not a significance test."
    )


if __name__ == "__main__":
    main()