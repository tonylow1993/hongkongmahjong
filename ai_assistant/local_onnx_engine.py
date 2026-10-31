"""Offline ONNX forward pass. No network. Target < 5 ms on CPU."""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from state_encoding import N_CLAIM, N_TILES

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = ROOT / "models" / "hk_mahjong_agent.onnx"
_ENGINES: dict[str, LocalONNXEngine] = {}


def get_engine(level: str | None = None) -> LocalONNXEngine:
    if level in ("level-1", "level-2") and (ROOT / "models" / "hk_mahjong_agent_v2.onnx").exists():
        target = ROOT / "models" / "hk_mahjong_agent_v2.onnx"
    elif level == "level-3" and (ROOT / "models" / "hk_mahjong_agent_v6.onnx").exists():
        target = ROOT / "models" / "hk_mahjong_agent_v6.onnx"
    elif (ROOT / "models" / "hk_mahjong_agent_v6.onnx").exists():
        target = ROOT / "models" / "hk_mahjong_agent_v6.onnx"
    elif (ROOT / "models" / "hk_mahjong_agent_v5.onnx").exists():
        target = ROOT / "models" / "hk_mahjong_agent_v5.onnx"
    else:
        target = DEFAULT_MODEL
    key = str(target)
    if key not in _ENGINES:
        _ENGINES[key] = LocalONNXEngine(target)
    return _ENGINES[key]


class LocalONNXEngine:
    def __init__(self, model_path: Path | None = None):
        self.path = Path(model_path or DEFAULT_MODEL)
        self.session = None
        self.last_ms = 0.0
        if self.path.is_file():
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1
            opts.inter_op_num_threads = 1
            self.session = ort.InferenceSession(
                str(self.path),
                sess_options=opts,
                providers=["CPUExecutionProvider"],
            )

    @property
    def ready(self) -> bool:
        return self.session is not None

    def infer(self, arrays: dict[str, np.ndarray]) -> dict[str, np.ndarray] | None:
        if self.session is None:
            return None
        feeds = {
            "planes": arrays["planes"][None, ...],
            "discard_mask": arrays["discard_mask"][None, ...],
            "claim_mask": arrays["claim_mask"][None, ...],
        }
        start = time.perf_counter()
        discard, claim, value = self.session.run(None, feeds)
        self.last_ms = (time.perf_counter() - start) * 1000
        d_logits = discard[0]
        c_logits = claim[0]
        d_logits = np.where(arrays["discard_mask"] > 0, d_logits, -1e9)
        c_logits = np.where(arrays["claim_mask"] > 0, c_logits, -1e9)
        return {
            "discard_probs": _softmax(d_logits),
            "claim_probs": _softmax(c_logits),
            "expected_value": float(value[0]) * 128.0,
            "latency_ms": self.last_ms,
        }


def _softmax(logits: np.ndarray) -> np.ndarray:
    z = logits - np.max(logits)
    e = np.exp(z)
    s = e.sum()
    if not np.isfinite(s) or s <= 0:
        mask = np.isfinite(logits)
        out = mask.astype(np.float32)
        return out / max(out.sum(), 1)
    return e / s


def top_discards(probs: np.ndarray, mask: np.ndarray, k: int = 3) -> list[int]:
    order = np.argsort(-probs)
    out = []
    for idx in order:
        if mask[idx] <= 0:
            continue
        out.append(int(idx))
        if len(out) >= k:
            break
    return out
