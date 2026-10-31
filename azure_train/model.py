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
        h = F.relu(self.bn1(self.conv1(x)))
        h = self.bn2(self.conv2(h))
        return F.relu(x + h)


class HKMahjongNet(nn.Module):
    """~0.6M parameters. Masks are 1 = legal, 0 = illegal."""

    def __init__(self, blocks: int = 5, channels: int = 64):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(N_CHANNELS, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(inplace=True),
        )
        self.trunk = nn.Sequential(*[ResBlock(channels) for _ in range(blocks)])
        flat = channels * 4 * 9
        self.fc = nn.Sequential(nn.Linear(flat, 128), nn.ReLU(inplace=True))
        self.discard = nn.Linear(128, N_TILES)
        self.claim = nn.Linear(128, N_CLAIM)
        self.value = nn.Linear(128, 1)

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


if __name__ == "__main__":
    net = HKMahjongNet()
    print("parameters", net.param_count())
