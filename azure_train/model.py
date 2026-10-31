"""Small residual net: discard policy, claim policy, and expected points."""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from state_encoding import N_CHANNELS, N_CLAIM, N_TILES


class ResBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = F.leaky_relu(self.bn1(self.conv1(x)), negative_slope=0.2)
        h = self.bn2(self.conv2(h))
        return F.leaky_relu(x + h, negative_slope=0.2)


class HKMahjongNet(nn.Module):
    """Deep residual net with ~2.5M parameters (blocks=10, channels=128). Masks are 1 = legal, 0 = illegal."""

    def __init__(self, blocks: int = 10, channels: int = 128):
        super().__init__()
        self.blocks = blocks
        self.channels = channels
        self.stem = nn.Sequential(
            nn.Conv2d(N_CHANNELS, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.LeakyReLU(0.2, inplace=True),
        )
        self.trunk = nn.Sequential(*[ResBlock(channels) for _ in range(blocks)])
        flat = channels * 4 * 9
        self.fc = nn.Sequential(
            nn.Linear(flat, 256),
            nn.LeakyReLU(0.2, inplace=True),
        )
        self.discard = nn.Linear(256, N_TILES)
        self.claim = nn.Linear(256, N_CLAIM)
        self.value = nn.Linear(256, 1)

    def forward(
        self,
        planes: torch.Tensor,
        discard_mask: torch.Tensor,
        claim_mask: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        h = self.trunk(self.stem(planes))
        h = self.fc(h.flatten(1))
        discard_logits = self.discard(h).masked_fill(discard_mask <= 0, -1e9)
        claim_logits = self.claim(h).masked_fill(claim_mask <= 0, -1e9)
        value = self.value(h).squeeze(-1)
        return discard_logits, claim_logits, value

    def param_count(self) -> int:
        return sum(p.numel() for p in self.parameters())

    @torch.no_grad()
    def load_or_upgrade_state_dict(self, state: dict) -> bool:
        """Load matching v8 state_dict or perform exact Net2Net function-preserving upgrade from v7."""
        if state["stem.0.weight"].shape == self.stem[0].weight.shape:
            self.load_state_dict(state)
            return False

        # Exact Net2Net Function-Preserving Transfer from v7 (16ch, 5 blocks, 64ch, 128 fc)
        c_old = state["stem.0.weight"].shape[0]
        in_old = state["stem.0.weight"].shape[1]
        fc_old = state["fc.0.weight"].shape[0]
        flat_old = state["fc.0.weight"].shape[1]

        self.stem[0].weight[:c_old, :in_old].copy_(state["stem.0.weight"])
        self.stem[0].weight[:c_old, in_old:].zero_()
        self.stem[0].weight[c_old:].mul_(0.2)
        self.stem[1].weight[:c_old].copy_(state["stem.1.weight"])
        self.stem[1].bias[:c_old].copy_(state["stem.1.bias"])
        self.stem[1].running_mean[:c_old].copy_(state["stem.1.running_mean"])
        self.stem[1].running_var[:c_old].copy_(state["stem.1.running_var"])

        old_blocks = sum(1 for k in state if k.startswith("trunk.") and k.endswith(".conv1.weight"))
        for i in range(old_blocks):
            blk = self.trunk[i]
            p = f"trunk.{i}."
            blk.conv1.weight[:c_old, :c_old].copy_(state[p + "conv1.weight"])
            blk.conv1.weight[:c_old, c_old:].zero_()
            blk.conv1.weight[c_old:].mul_(0.2)
            blk.bn1.weight[:c_old].copy_(state[p + "bn1.weight"])
            blk.bn1.bias[:c_old].copy_(state[p + "bn1.bias"])
            blk.bn1.running_mean[:c_old].copy_(state[p + "bn1.running_mean"])
            blk.bn1.running_var[:c_old].copy_(state[p + "bn1.running_var"])

            blk.conv2.weight[:c_old, :c_old].copy_(state[p + "conv2.weight"])
            blk.conv2.weight[:c_old, c_old:].zero_()
            blk.conv2.weight[c_old:].mul_(0.2)
            blk.bn2.weight[:c_old].copy_(state[p + "bn2.weight"])
            blk.bn2.bias[:c_old].copy_(state[p + "bn2.bias"])
            blk.bn2.running_mean[:c_old].copy_(state[p + "bn2.running_mean"])
            blk.bn2.running_var[:c_old].copy_(state[p + "bn2.running_var"])

        for i in range(old_blocks, self.blocks):
            blk = self.trunk[i]
            blk.conv1.weight.mul_(0.2)
            blk.conv2.weight[:c_old].zero_()
            blk.conv2.weight[c_old:].mul_(0.2)
            blk.bn2.bias[:c_old].zero_()

        self.fc[0].weight[:fc_old, :flat_old].copy_(state["fc.0.weight"])
        self.fc[0].weight[:fc_old, flat_old:].zero_()
        self.fc[0].weight[fc_old:].mul_(0.2)
        self.fc[0].bias[:fc_old].copy_(state["fc.0.bias"])
        self.fc[0].bias[fc_old:].zero_()

        for name in ("discard", "claim", "value"):
            head = getattr(self, name)
            head.weight[:, :fc_old].copy_(state[f"{name}.weight"])
            head.weight[:, fc_old:].zero_()
            head.bias.copy_(state[f"{name}.bias"])

        return True


if __name__ == "__main__":
    net = HKMahjongNet()
    print("parameters", net.param_count())
