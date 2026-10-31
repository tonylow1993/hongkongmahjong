"""Pick one legal action from the ONNX policy for a single seat."""

from __future__ import annotations

import numpy as np

from local_onnx_engine import LocalONNXEngine
from state_encoding import snapshot_to_arrays

CLAIM_NAMES = ("pass", "chow", "pong", "kong", "win")


def index_to_tile(idx: int) -> tuple[str, int]:
    if idx < 27:
        return ("man", "pin", "sou")[idx // 9], idx % 9 + 1
    if idx < 31:
        return "wind", idx - 27 + 1
    return "dragon", idx - 31 + 1


def choose_act(engine: LocalONNXEngine, snap: dict) -> dict | None:
    if not engine.ready:
        return None
    arrays = snapshot_to_arrays(snap)
    model = engine.infer(arrays)
    if model is None:
        return None
    claim_mask = arrays["claim_mask"]
    discard_mask = arrays["discard_mask"]
    level = snap.get("level", "level-3")

    # 可以糊就糊，與本地 AI 和訓練取樣一致。
    if claim_mask.shape[0] > 4 and claim_mask[4] > 0:
        return {"kind": "win"}

    # 自摸出牌回合：若有暗槓或加槓，果斷槓牌換取補牌與槓上開花機會
    if snap.get("phase") == "discard" and claim_mask.shape[0] > 3 and claim_mask[3] > 0:
        return {"kind": "kong"}

    masked_claim = np.where(claim_mask > 0, model["claim_probs"], -1.0)
    if level == "level-1":
        # 初級模式：更隨機探索，35% 幾率嘗試次選，適合休閒對弈
        legal_indices = [i for i in range(len(claim_mask)) if claim_mask[i] > 0]
        if len(legal_indices) > 1 and np.random.rand() < 0.35:
            claim_kind = int(np.random.choice(legal_indices))
        else:
            claim_kind = int(np.argmax(masked_claim))
    elif level == "level-2":
        # 中級模式：對叫牌略帶探索性 (20%)
        legal_indices = [i for i in range(len(claim_mask)) if claim_mask[i] > 0]
        if len(legal_indices) > 1 and np.random.rand() < 0.2:
            claim_kind = int(np.random.choice(legal_indices))
        else:
            claim_kind = int(np.argmax(masked_claim))
    else:
        # 高級模式：全貪婪專家策略
        claim_kind = int(np.argmax(masked_claim))

    # 他家打牌叫牌時：若能槓牌（明槓），槓牌優先於單純碰牌
    if claim_mask.shape[0] > 3 and claim_mask[3] > 0 and claim_kind == 2:
        claim_kind = 3

    if snap.get("phase") == "claim" or (claim_kind != 0 and claim_mask[claim_kind] > 0):
        return {"kind": CLAIM_NAMES[claim_kind]}

    masked = np.where(discard_mask > 0, model["discard_probs"], -1.0)
    if level == "level-1":
        # 初級模式：60% 首選，30% 次選，10% 第三選
        order = np.argsort(-masked)
        valid = [i for i in order if masked[i] >= 0]
        r = np.random.rand()
        if len(valid) >= 3 and r < 0.10:
            idx = int(valid[2])
        elif len(valid) >= 2 and r < 0.40:
            idx = int(valid[1])
        else:
            idx = int(valid[0]) if valid else int(np.argmax(masked))
    elif level == "level-2":
        # 中級模式：78% 首選，22% 次選
        order = np.argsort(-masked)
        valid = [i for i in order if masked[i] >= 0]
        if len(valid) >= 2 and np.random.rand() < 0.22:
            idx = int(valid[1])
        else:
            idx = int(valid[0]) if valid else int(np.argmax(masked))
    else:
        # 高級模式：全貪婪專家最佳出牌
        idx = int(np.argmax(masked))

    suit, value = index_to_tile(idx)
    return {"kind": "discard", "suit": suit, "value": int(value)}
