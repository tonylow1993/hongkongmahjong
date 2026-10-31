"""Turn a live table snapshot into the same planes the Azure net was trained on."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np

_AZURE = Path(__file__).resolve().parents[1] / "azure_train" / "state_encoding.py"
_spec = importlib.util.spec_from_file_location("azure_state_encoding", _AZURE)
if _spec is None or _spec.loader is None:
    raise ImportError(f"missing {_AZURE}")
_enc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_enc)

N_CHANNELS = _enc.N_CHANNELS
N_CLAIM = _enc.N_CLAIM
N_TILES = _enc.N_TILES
CLAIM_PASS = _enc.CLAIM_PASS
CLAIM_CHI = _enc.CLAIM_CHI
CLAIM_PON = _enc.CLAIM_PON
CLAIM_GANG = _enc.CLAIM_GANG
CLAIM_HU = _enc.CLAIM_HU
build_planes = _enc.build_planes
counts_from_tiles = _enc.counts_from_tiles
index_to_label = _enc.index_to_label
flower_label = _enc.flower_label
is_seat_flower = _enc.is_seat_flower
tile_index = _enc.tile_index

__all__ = [
    "N_CHANNELS",
    "N_CLAIM",
    "N_TILES",
    "index_to_label",
    "is_seat_flower",
    "snapshot_to_arrays",
    "tile_index",
]


def _wind(raw: object) -> int:
    if isinstance(raw, int):
        return raw % 4
    if isinstance(raw, str):
        if raw.isdigit():
            return int(raw) % 4
        m = {"east": 0, "south": 1, "west": 2, "north": 3}
        if raw.lower() in m:
            return m[raw.lower()]
    return 0


def _tiles(raw: list[dict] | None) -> list[tuple[str, int]]:
    if not raw:
        return []
    return [(t["suit"], int(t["value"])) for t in raw]


def snapshot_to_arrays(snap: dict) -> dict[str, np.ndarray]:
    """snap is the JSON sent by the React table. seat is the player asking for advice."""
    seat = int(snap["seat"])
    players = snap["players"]
    me = players[seat]

    def rel(other: int) -> int:
        return (other - seat) % 4

    disc = [np.zeros(N_TILES, np.float32) for _ in range(4)]
    meld = [np.zeros(N_TILES, np.float32) for _ in range(4)]
    visible = np.zeros(N_TILES, np.float32)
    for q, p in enumerate(players):
        d = counts_from_tiles(_tiles(p.get("discards")))
        groups = []
        for m in p.get("melds") or []:
            groups.extend(_tiles(m.get("tiles")))
        mc = counts_from_tiles(groups)
        disc[rel(q)] = d
        meld[rel(q)] = mc
        visible += d + mc
    hand_tiles = _tiles(me.get("hand"))
    hand = counts_from_tiles(hand_tiles)
    visible += hand
    flowers = [int(f["value"]) for f in (me.get("flowers") or [])]
    planes = build_planes(
        hand,
        disc,
        meld,
        visible,
        flowers,
        _wind(me.get("seatWind")),
        _wind(snap.get("prevailingWind")),
        int(snap.get("wall") or 0),
        int(snap.get("dealer")) == seat,
    )
    dmask = np.zeros(N_TILES, np.float32)
    for suit, value in hand_tiles:
        dmask[tile_index(suit, value)] = 1
    cmask = np.zeros(N_CLAIM, np.float32)
    cmask[0] = 1
    for kind in snap.get("claimKinds") or []:
        idx = {"pass": 0, "chow": 1, "pong": 2, "kong": 3, "win": 4}.get(kind)
        if idx is not None:
            cmask[idx] = 1
    return {
        "planes": planes.astype(np.float32),
        "discard_mask": dmask,
        "claim_mask": cmask,
        "hand": hand,
        "visible": visible,
    }
