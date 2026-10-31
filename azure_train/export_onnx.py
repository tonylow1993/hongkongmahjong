"""Export checkpoints/hk_mahjong.pt to hk_mahjong_agent.onnx.

Copy the file back to the game repo:

  scp azure-user@<vm>:~/hongkongmahjong/azure_train/hk_mahjong_agent.onnx \\
      ./models/hk_mahjong_agent.onnx

Local play only needs that file plus onnxruntime. PyTorch stays on the VM.
"""

from __future__ import annotations

import argparse

import numpy as np
import onnxruntime as ort
import torch

from model import HKMahjongNet
from state_encoding import N_CHANNELS, N_CLAIM, N_TILES


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ckpt", default="checkpoints/hk_mahjong.pt")
    parser.add_argument("--out", default="hk_mahjong_agent.onnx")
    args = parser.parse_args()
    net = HKMahjongNet()
    net.load_state_dict(torch.load(args.ckpt, map_location="cpu"))
    net.eval()
    planes = torch.zeros(1, N_CHANNELS, 4, 9)
    dmask = torch.ones(1, N_TILES)
    cmask = torch.ones(1, N_CLAIM)
    torch.onnx.export(
        net,
        (planes, dmask, cmask),
        args.out,
        input_names=["planes", "discard_mask", "claim_mask"],
        output_names=["discard_logits", "claim_logits", "expected_value"],
        dynamic_axes={
            "planes": {0: "batch"},
            "discard_mask": {0: "batch"},
            "claim_mask": {0: "batch"},
            "discard_logits": {0: "batch"},
            "claim_logits": {0: "batch"},
            "expected_value": {0: "batch"},
        },
        opset_version=17,
    )
    with torch.no_grad():
        ref = [t.numpy() for t in net(planes, dmask, cmask)]
    sess = ort.InferenceSession(args.out, providers=["CPUExecutionProvider"])
    got = sess.run(None, {"planes": planes.numpy(), "discard_mask": dmask.numpy(), "claim_mask": cmask.numpy()})
    for name, a, b in zip(("discard", "claim", "value"), ref, got, strict=True):
        err = float(np.max(np.abs(a - b)))
        print(f"{name} max abs diff {err:.3e}")
        if err > 1e-4:
            raise SystemExit(f"ONNX mismatch on {name}")
    print("wrote", args.out)


if __name__ == "__main__":
    main()
