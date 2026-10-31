"""Warm up only the value head of an existing Mahjong checkpoint.

The policy heads and shared CNN trunk remain frozen.

- Training and validation use separate game-seed ranges.
- Evaluates closed-form L2 ridge regression candidates with shrinkage
  as well as gradient-descent epochs.
- The zero-valued head is included as a validation candidate.
- The selected checkpoint contains the original policy and a
  zero-initialized or trained value head.
- This does not perform PPO.
"""

from __future__ import annotations

import argparse
import os

import numpy as np
import torch
import torch.nn.functional as F

from model import HKMahjongNet
from train_azure_selfplay import collect, weights_of


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
    temporary = path + ".tmp"
    torch.save(weights_of(net), temporary)
    os.replace(temporary, path)


def collect_batch(
    net: HKMahjongNet,
    seed: int,
    games: int,
    score_scale: float,
    max_steps: int,
    local_prob: float,
    self_prob: float,
) -> tuple[dict, dict]:
    """Collect on-policy learner trajectories with completed returns."""
    batch, stats = collect(
        weights=weights_of(net),
        seed=seed,
        first_game=0,
        games=games,
        gamma=1.0,
        score_scale=score_scale,
        max_steps=max_steps,
        local_prob=local_prob,
        self_prob=self_prob,
        demonstrations=False,
    )

    if len(batch["returns"]) == 0:
        raise RuntimeError(
            f"No completed learner trajectories for seed={seed}."
        )

    return batch, stats


@torch.no_grad()
def extract_features(
    net: HKMahjongNet,
    batch: dict,
    minibatch: int,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Cache frozen shared features and observed normalized returns."""
    net.eval()

    planes = torch.from_numpy(batch["planes"])
    returns = torch.from_numpy(batch["returns"]).float()

    feature_parts = []

    for start in range(0, len(returns), minibatch):
        x = planes[start:start + minibatch]
        h = net.trunk(net.stem(x))
        h = net.fc(h.flatten(1))
        feature_parts.append(h.detach())

    features = torch.cat(feature_parts, dim=0)

    if not bool(torch.isfinite(features).all()):
        raise RuntimeError("Non-finite shared features.")
    if not bool(torch.isfinite(returns).all()):
        raise RuntimeError("Non-finite returns.")

    return features, returns


@torch.no_grad()
def metrics(
    net: HKMahjongNet,
    features: torch.Tensor,
    returns: torch.Tensor,
) -> dict[str, float]:
    predictions = net.value(features).squeeze(-1)
    mse = F.mse_loss(predictions, returns)
    zero_mse = returns.square().mean()

    return {
        "mse": float(mse.item()),
        "zero_mse": float(zero_mse.item()),
        "prediction_mean": float(predictions.mean().item()),
        "prediction_std": float(predictions.std(unbiased=False).item()),
        "return_mean": float(returns.mean().item()),
        "return_std": float(returns.std(unbiased=False).item()),
    }


def print_metrics(label: str, values: dict[str, float]) -> None:
    print(
        f"{label}: "
        f"mse={values['mse']:.6f} "
        f"zero_mse={values['zero_mse']:.6f} "
        f"prediction_mean={values['prediction_mean']:.4f} "
        f"prediction_std={values['prediction_std']:.4f} "
        f"return_mean={values['return_mean']:.4f} "
        f"return_std={values['return_std']:.4f}",
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()

    parser.add_argument("--checkpoint", required=True)
    parser.add_argument(
        "--out",
        default="checkpoints/hk_value_warmed.pt",
    )
    parser.add_argument("--train-games", type=int, default=300)
    parser.add_argument("--validation-games", type=int, default=100)
    parser.add_argument("--train-seed", type=int, default=1810000000)
    parser.add_argument("--validation-seed", type=int, default=1820000000)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--minibatch", type=int, default=256)
    parser.add_argument("--lr", type=float, default=0.0001)
    parser.add_argument("--score-scale", type=float, default=20.0)
    parser.add_argument("--max-steps", type=int, default=1000)

    # Match the proposed PPO opponent mixture by default.
    parser.add_argument("--local-prob", type=float, default=0.5)
    parser.add_argument("--self-prob", type=float, default=0.4)

    parser.add_argument("--optimizer-seed", type=int, default=1234)
    args = parser.parse_args()

    for name in (
        "train_games",
        "validation_games",
        "epochs",
        "minibatch",
        "max_steps",
    ):
        if getattr(args, name) < 1:
            parser.error(f"--{name.replace('_', '-')} must be positive.")

    for name in ("train_seed", "validation_seed", "optimizer_seed"):
        if getattr(args, name) < 0:
            parser.error(f"--{name.replace('_', '-')} must be nonnegative.")

    if not np.isfinite(args.lr) or args.lr <= 0:
        parser.error("--lr must be finite and positive.")

    if not np.isfinite(args.score_scale) or args.score_scale <= 0:
        parser.error("--score-scale must be finite and positive.")

    if (
        not np.isfinite(args.local_prob)
        or not np.isfinite(args.self_prob)
        or args.local_prob < 0
        or args.self_prob < 0
        or args.local_prob + args.self_prob > 1
    ):
        parser.error(
            "Opponent probabilities must be finite, nonnegative "
            "and sum to at most 1."
        )

    train_end = args.train_seed + args.train_games
    validation_end = args.validation_seed + args.validation_games

    if max(args.train_seed, args.validation_seed) < min(
        train_end, validation_end
    ):
        parser.error("Training and validation game-seed ranges overlap.")

    if os.path.realpath(args.checkpoint) == os.path.realpath(args.out):
        parser.error("--out must be different from --checkpoint.")

    torch.set_num_threads(1)
    net = load_net(args.checkpoint)
    original_state = weights_of(net)

    print(
        f"Loaded {args.checkpoint}; collecting training games...",
        flush=True,
    )

    train_batch, train_stats = collect_batch(
        net,
        args.train_seed,
        args.train_games,
        args.score_scale,
        args.max_steps,
        args.local_prob,
        args.self_prob,
    )

    print("Collecting separate validation games...", flush=True)

    validation_batch, validation_stats = collect_batch(
        net,
        args.validation_seed,
        args.validation_games,
        args.score_scale,
        args.max_steps,
        args.local_prob,
        args.self_prob,
    )

    print(
        f"train: completed={int(train_stats['completed'])} "
        f"truncated={int(train_stats['truncated'])} "
        f"decisions={len(train_batch['returns'])}",
        flush=True,
    )
    print(
        f"validation: completed={int(validation_stats['completed'])} "
        f"truncated={int(validation_stats['truncated'])} "
        f"decisions={len(validation_batch['returns'])}",
        flush=True,
    )

    if train_stats["truncated"] or validation_stats["truncated"]:
        print(
            "WARNING: truncated games were excluded; inspect max-steps.",
            flush=True,
        )

    train_features, train_returns = extract_features(
        net, train_batch, args.minibatch
    )
    validation_features, validation_returns = extract_features(
        net, validation_batch, args.minibatch
    )

    print_metrics(
        "original validation",
        metrics(net, validation_features, validation_returns),
    )

    # Freeze everything, then enable only the final value layer.
    for parameter in net.parameters():
        parameter.requires_grad_(False)
    for parameter in net.value.parameters():
        parameter.requires_grad_(True)

    with torch.no_grad():
        net.value.weight.zero_()
        if net.value.bias is not None:
            net.value.bias.zero_()

    initial = metrics(net, validation_features, validation_returns)
    print_metrics("zero-head validation", initial)

    best_mse = initial["mse"]
    best_weight = net.value.weight.detach().clone()
    best_bias = (
        net.value.bias.detach().clone()
        if net.value.bias is not None
        else None
    )
    best_epoch = 0

    # Evaluate L2-regularized Ridge Regression candidates first.
    with torch.no_grad():
        x_tr = train_features.double()
        y_tr = train_returns.double()
        x_mean = x_tr.mean(dim=0, keepdim=True)
        y_mean = y_tr.mean()
        xc = x_tr - x_mean
        yc = y_tr - y_mean
        cov = xc.T @ xc
        rhs = xc.T @ yc
        eye = torch.eye(cov.shape[0], dtype=torch.float64)

        for l2 in (
            50.0,
            200.0,
            500.0,
            1000.0,
            2500.0,
            5000.0,
            10000.0,
            25000.0,
            50000.0,
        ):
            w_raw = torch.linalg.solve(cov + l2 * eye, rhs)
            b_raw = y_mean - (x_mean.squeeze(0) @ w_raw)
            for shrink in (0.2, 0.4, 0.6, 0.8, 1.0):
                net.value.weight.copy_((w_raw * shrink).float().unsqueeze(0))
                if net.value.bias is not None:
                    net.value.bias.copy_((b_raw * shrink).float().view(1))
                val = metrics(net, validation_features, validation_returns)
                if val["mse"] < best_mse:
                    best_mse = val["mse"]
                    best_weight = net.value.weight.detach().clone()
                    best_bias = (
                        net.value.bias.detach().clone()
                        if net.value.bias is not None
                        else None
                    )
                    best_epoch = -int(l2)

        net.value.weight.copy_(best_weight)
        if net.value.bias is not None and best_bias is not None:
            net.value.bias.copy_(best_bias)

    optimizer = torch.optim.Adam(
        net.value.parameters(), lr=args.lr, weight_decay=1e-2
    )
    generator = torch.Generator(device="cpu")
    generator.manual_seed(args.optimizer_seed)

    for epoch in range(1, args.epochs + 1):
        order = torch.randperm(len(train_returns), generator=generator)
        total_loss = 0.0
        examples = 0

        for start in range(0, len(order), args.minibatch):
            index = order[start:start + args.minibatch]
            predictions = net.value(train_features[index]).squeeze(-1)
            loss = F.mse_loss(predictions, train_returns[index])

            if not bool(torch.isfinite(loss)):
                raise RuntimeError(
                    "Non-finite value loss. Try a lower --lr."
                )

            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                net.value.parameters(),
                1.0,
                error_if_nonfinite=True,
            )
            optimizer.step()

            total_loss += float(loss.detach().item()) * len(index)
            examples += len(index)

        validation = metrics(
            net, validation_features, validation_returns
        )
        print(
            f"epoch={epoch}/{args.epochs} "
            f"train_mse={total_loss / examples:.6f} "
            f"validation_mse={validation['mse']:.6f}",
            flush=True,
        )

        if validation["mse"] < best_mse:
            best_mse = validation["mse"]
            best_weight = net.value.weight.detach().clone()
            best_bias = (
                net.value.bias.detach().clone()
                if net.value.bias is not None
                else None
            )
            best_epoch = epoch

    with torch.no_grad():
        net.value.weight.copy_(best_weight)
        if net.value.bias is not None and best_bias is not None:
            net.value.bias.copy_(best_bias)

    # Verify the trunk, policy heads, and BatchNorm buffers were not
    # changed. Only value.* is allowed to differ.
    current_state = weights_of(net)

    for name, original in original_state.items():
        if name.startswith("value."):
            continue
        if not torch.equal(original, current_state[name]):
            raise RuntimeError(f"Non-value parameter changed: {name}")

    print_metrics(
        "selected validation",
        metrics(net, validation_features, validation_returns),
    )
    print(
        f"selected_epoch={best_epoch} "
        f"(0 means the zero head remained best, <0 means ridge l2)",
        flush=True,
    )

    save_net(net, args.out)
    print(
        f"Saved {args.out}; non-value weights are unchanged.",
        flush=True,
    )


if __name__ == "__main__":
    main()
