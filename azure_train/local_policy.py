"""Approximation of the table's learned-v1 player plus 3-faan expert scoring.

The discard and claim weights follow src/ai/model.ts.
Shanten follows src/ai/policy.ts:
- complete hand: -1
- tenpai: 0

Differences remain because the Python environment represents claim
categories rather than every individual chow or kong option.
"""

from __future__ import annotations

import functools
import sys
from collections import Counter

import numpy as np

from state_encoding import (
    CLAIM_CHI,
    CLAIM_GANG,
    CLAIM_HU,
    CLAIM_PASS,
    CLAIM_PON,
    N_CLAIM,
    N_TILES,
    tile_index,
)

sys.setrecursionlimit(10000)

Tile = tuple[str, int]

DISCARD_W = np.array(
    [
        0.2853,
        -1.4527,
        -1.7393,
        -1.2753,
        0.6501,
        1.742,
        -0.6975,
        0.3922,
        -0.1162,
        -0.8997,
        -1.097,
        0.5997,
        0.0267,
        0.2799,
        -0.1394,
    ],
    dtype=np.float64,
)

CLAIM_W = np.array(
    [
        -0.1924,
        6.179,
        0.3993,
        -0.2324,
        0.1108,
        -0.1834,
        0.5564,
        1.8096,
    ],
    dtype=np.float64,
)


def _index_to_tile(idx: int) -> Tile:
    if not 0 <= idx < 34:
        raise ValueError(f"Invalid tile index: {idx}")
    if idx < 27:
        return ("man", "pin", "sou")[idx // 9], idx % 9 + 1
    if idx < 31:
        return "wind", idx - 26
    return "dragon", idx - 30


_INDEX_TO_TILE: tuple[Tile, ...] = tuple(_index_to_tile(i) for i in range(34))


@functools.lru_cache(maxsize=65536)
def _suit_states(c: tuple[int, ...]) -> tuple[tuple[int, int, int], ...]:
    lst = list(c)
    best_t: dict[tuple[int, int], int] = {}

    def rec(i: int, m: int, t: int, p: int) -> None:
        k = (m, p)
        if t > best_t.get(k, -1):
            best_t[k] = t

        while i < 9 and lst[i] == 0:
            i += 1
        if i == 9:
            return

        if lst[i] >= 3 and m < 4:
            lst[i] -= 3
            rec(i, m + 1, t, p)
            lst[i] += 3

        if i <= 6 and lst[i + 1] and lst[i + 2] and m < 4:
            lst[i] -= 1
            lst[i + 1] -= 1
            lst[i + 2] -= 1
            rec(i, m + 1, t, p)
            lst[i] += 1
            lst[i + 1] += 1
            lst[i + 2] += 1

        if m + t < 4:
            if lst[i] >= 2:
                lst[i] -= 2
                rec(i, m, t + 1, p)
                lst[i] += 2

            if i <= 7 and lst[i + 1]:
                lst[i] -= 1
                lst[i + 1] -= 1
                rec(i, m, t + 1, p)
                lst[i] += 1
                lst[i + 1] += 1

            if i <= 6 and lst[i + 2]:
                lst[i] -= 1
                lst[i + 2] -= 1
                rec(i, m, t + 1, p)
                lst[i] += 1
                lst[i + 2] += 1

        if p == 0 and lst[i] >= 2:
            lst[i] -= 2
            rec(i, m, t, 1)
            lst[i] += 2

        rec(i + 1, m, t, p)

    rec(0, 0, 0, 0)
    return tuple((m, t, p) for (m, p), t in best_t.items())


@functools.lru_cache(maxsize=65536)
def _honor_states(c: tuple[int, ...]) -> tuple[tuple[int, int, int], ...]:
    hm = sum(1 for x in c if x >= 3)
    hp = sum(1 for x in c if x == 2)
    h_states = []
    for use_m in range(hm + 1):
        rem = hp + (hm - use_m)
        h_states.append((use_m, rem, 0))
        if rem >= 1:
            h_states.append((use_m, rem - 1, 1))
    return tuple(h_states)


@functools.lru_cache(maxsize=65536)
def _combine_shanten(
    s0: tuple[tuple[int, int, int], ...],
    s1: tuple[tuple[int, int, int], ...],
    s2: tuple[tuple[int, int, int], ...],
    hs: tuple[tuple[int, int, int], ...],
    open_melds: int,
) -> int:
    best = 8

    for m0, t0, p0 in s0:
        for m1, t1, p1 in s1:
            if p0 + p1 > 1:
                continue
            for m2, t2, p2 in s2:
                if p0 + p1 + p2 > 1:
                    continue
                for mh, th, ph in hs:
                    p = p0 + p1 + p2 + ph
                    if p > 1:
                        continue
                    groups = min(4, open_melds + m0 + m1 + m2 + mh)
                    use_t = min(t0 + t1 + t2 + th, 4 - groups)
                    sh = 8 - 2 * groups - use_t - p
                    if sh < best:
                        best = sh
    return best


@functools.lru_cache(maxsize=131072)
def shanten_counts(counts: tuple[int, ...], open_melds: int) -> int:
    return _combine_shanten(
        _suit_states(counts[0:9]),
        _suit_states(counts[9:18]),
        _suit_states(counts[18:27]),
        _honor_states(counts[27:34]),
        open_melds,
    )


def shanten_tiles(tiles: list[Tile], open_melds: int) -> int:
    counts = [0] * 34
    for tile in tiles:
        counts[tile_index(*tile)] += 1
    return shanten_counts(tuple(counts), open_melds)


def _seen(env, tile: Tile) -> int:
    count = 0
    for pid in range(4):
        count += env.discards[pid].count(tile)
        for group in env.melds[pid]:
            count += group.count(tile)
    return count


def _threat(env, pid: int) -> int:
    threat = 0
    for other in range(4):
        if other == pid:
            continue
        opened = len(env.melds[other])
        if opened >= 3:
            return 2
        if opened == 2:
            threat = max(threat, 1)
    return threat


def _discard_score(env, pid: int, idx: int, before: int) -> float:
    tile = _index_to_tile(idx)
    hand = env.hands[pid]
    copies = hand.count(tile)

    after_hand = list(hand)
    after_hand.remove(tile)
    after = shanten_tiles(after_hand, len(env.melds[pid]))

    seen = _seen(env, tile)
    seat = env.seat_wind[pid] + 1
    round_wind = env.round_wind + 1

    fan_honor = tile[0] == "dragon" or (
        tile[0] == "wind" and tile[1] in (seat, round_wind)
    )
    guest = tile[0] == "wind" and not fan_honor
    suit_n = sum(1 for t in hand if t[0] == tile[0])
    discards = sum(len(river) for river in env.discards)

    features = np.array(
        [
            1,
            after / 8,
            (after - before) / 4,
            copies / 4,
            seen / 4,
            1 if guest else 0,
            1 if fan_honor else 0,
            1 if tile[0] in ("man", "pin", "sou") and tile[1] in (1, 9) else 0,
            1 if tile[0] in ("man", "pin", "sou") and 3 <= tile[1] <= 7 else 0,
            suit_n / max(1, len(hand)),
            1 if copies >= 2 else 0,
            seen / 4,
            1 if discards >= 36 else 0,
            _threat(env, pid) / 2,
            len(env.wall) / 80,
        ],
        dtype=np.float64,
    )
    return float(features @ DISCARD_W)


def _claim_score(env, pid: int, kind: int) -> float:
    # Matches CLAIM_FEATURE_NAMES in src/ai/model.ts:
    # win, pong, chow, kong, pass.
    flags = [
        int(kind == CLAIM_HU),
        int(kind == CLAIM_PON),
        int(kind == CLAIM_CHI),
        int(kind == CLAIM_GANG),
        int(kind == CLAIM_PASS),
    ]

    fan = 0.0
    gain = 0.0

    if kind == CLAIM_HU:
        tiles = list(env.hands[pid])
        tsumo = env.phase == "discard"
        if not tsumo and env.last is not None:
            tiles.append(env.last)
        fan = env.fan_of(pid, tsumo, tiles=tiles)

    elif kind != CLAIM_PASS:
        hand = list(env.hands[pid])
        opened = len(env.melds[pid])
        before = shanten_tiles(hand, opened)

        if kind == CLAIM_GANG and env.phase == "discard":
            # Use the same deterministic tile choice as env.step_self().
            tile = min(
                (t for t, n in Counter(hand).items() if n == 4),
                key=lambda t: tile_index(*t),
            )
            for _ in range(4):
                hand.remove(tile)

        elif kind == CLAIM_GANG and env.last is not None:
            for _ in range(3):
                hand.remove(env.last)

        elif kind == CLAIM_PON and env.last is not None:
            for _ in range(2):
                hand.remove(env.last)

        elif kind == CLAIM_CHI and env.last is not None:
            for extra in env._chi_tiles(pid, env.last):
                hand.remove(extra)

        gain = (before - shanten_tiles(hand, opened + 1)) / 4

    features = np.array(
        [1, *flags, fan / 8, gain],
        dtype=np.float64,
    )
    return float(features @ CLAIM_W)


def local_action(env, pid: int, obs: dict[str, np.ndarray]) -> tuple[int, bool]:
    """Return (choice, is_discard) without modifying the environment."""
    if obs["claim_mask"][CLAIM_HU] > 0:
        return CLAIM_HU, False

    if env.phase == "discard":
        if obs["claim_mask"][CLAIM_GANG] > 0:
            return CLAIM_GANG, False

        legal = np.flatnonzero(obs["discard_mask"] > 0)
        if len(legal) == 0:
            raise RuntimeError("Teacher has no legal discard.")

        before = shanten_tiles(env.hands[pid], len(env.melds[pid]))
        best = max(
            legal,
            key=lambda idx: (
                _discard_score(env, pid, int(idx), before),
                -int(idx),
            ),
        )
        return int(best), True

    legal = np.flatnonzero(obs["claim_mask"] > 0)
    if len(legal) == 0:
        raise RuntimeError("Teacher has no legal claim.")

    best = max(
        legal,
        key=lambda kind: (_claim_score(env, pid, int(kind)), -int(kind)),
    )
    return int(best), False


def evaluate_action_scores(
    env,
    pid: int,
    obs: dict[str, np.ndarray],
) -> tuple[np.ndarray, np.ndarray, int, bool]:
    """Compute tactical action scores (d_scores, c_scores, best_choice, is_discard).

    Incorporates 3-faan path gating on claims, exact shanten preservation,
    ukeire (tile acceptance), 3-faan tenpai validity, and connectivity.
    """
    d_scores = np.full(N_TILES, -1e9, dtype=np.float32)
    c_scores = np.full(N_CLAIM, -1e9, dtype=np.float32)

    hand = env.hands[pid]
    melds = env.melds[pid]
    seat = env.seat_wind[pid] + 1
    rw = env.round_wind + 1
    hc = Counter(hand)

    all_tiles = list(hand) + [t for grp in melds for t in grp]
    suit_counts = {
        s: sum(1 for t in all_tiles if t[0] == s)
        for s in ("man", "pin", "sou")
    }
    dom_suit = max(suit_counts, key=suit_counts.get)
    dom_n = suit_counts[dom_suit]
    meld_suits = {
        t[0]
        for grp in melds
        for t in grp
        if t[0] in ("man", "pin", "sou")
    }
    honor_count = sum(1 for t in all_tiles if t[0] in ("wind", "dragon"))
    # 香港牌三番起糊核心：混一色（3番）
    # 當同一花色牌數 >= 5 且主花色 + 字牌 >= 7 時，極力主打混一色
    can_flush = (
        len(meld_suits) == 0
        or (len(meld_suits) == 1 and dom_suit in meld_suits)
    ) and (
        dom_n >= 6
        or (dom_n >= 4 and honor_count >= 3)
        or (dom_n + honor_count >= 7 and dom_n >= 4)
    )
    has_chow_meld = any(len(set(grp)) > 1 for grp in melds)
    pairs_in_hand = sum(1 for c in hc.values() if c >= 2)
    pung_melds = sum(1 for grp in melds if len(set(grp)) == 1)

    flower_fan = (
        1
        if not env.flowers[pid]
        else sum(
            1
            for v in env.flowers[pid]
            if (v - 1) % 4 == env.seat_wind[pid]
        )
    )
    honor_fan = 0
    for grp in melds:
        if len(grp) >= 3 and len(set(grp)) == 1:
            t = grp[0]
            if t[0] == "dragon":
                honor_fan += 1
            elif t[0] == "wind":
                if t[1] == seat:
                    honor_fan += 1
                if t[1] == rw:
                    honor_fan += 1
    for t, c in hc.items():
        if c >= 3:
            if t[0] == "dragon":
                honor_fan += 1
            elif t[0] == "wind":
                if t[1] == seat:
                    honor_fan += 1
                if t[1] == rw:
                    honor_fan += 1

    # 香港麻將最優戰略起手比率（Optimized Archetype Ratios）：
    # 1. 混一色/清一色 (38% Target): 5張主花+2字牌 或 6張主花，早定主門扣字牌
    # 2. 對對糊 (22% Target): >=4對子，或 >=3對子且帶有番子刻/對支援時果斷碰牌加速
    # 3. 門清平自 (40% Target): 嚴格門清守護，無確定番種時嚴禁隨意開門廢除門清
    honor_pairs = sum(
        1
        for t, c in hc.items()
        if c >= 2 and (t[0] == "dragon" or (t[0] == "wind" and t[1] in (seat, rw)))
    )
    can_all_pungs = (not has_chow_meld) and (
        (pairs_in_hand + pung_melds >= 4)
        or (pairs_in_hand + pung_melds >= 3 and (honor_fan >= 1 or honor_pairs >= 1))
    )

    if obs["claim_mask"][CLAIM_HU] > 0:
        c_scores[CLAIM_HU] = 10.0

    if env.phase == "claim":
        if obs["claim_mask"][CLAIM_PASS] > 0:
            c_scores[CLAIM_PASS] = 0.0
        last = env.last
        if last is not None:
            before = shanten_tiles(hand, len(melds))
            for kind in (CLAIM_GANG, CLAIM_PON, CLAIM_CHI):
                if obs["claim_mask"][kind] <= 0:
                    continue
                nh = list(hand)
                if kind == CLAIM_GANG:
                    for _ in range(3):
                        nh.remove(last)
                elif kind == CLAIM_PON:
                    for _ in range(2):
                        nh.remove(last)
                else:
                    for ex in env._chi_tiles(pid, last):
                        nh.remove(ex)
                after = shanten_tiles(nh, len(melds) + 1)
                step = before - after
                is_fan_tile = last[0] == "dragon" or (
                    last[0] == "wind" and last[1] in (seat, rw)
                )
                add_fan = (
                    (
                        2
                        if (
                            last[0] == "wind"
                            and last[1] == seat
                            and last[1] == rw
                        )
                        else 1
                    )
                    if (is_fan_tile and kind != CLAIM_CHI)
                    else 0
                )
                new_g_fan = flower_fan + honor_fan + add_fan
                flush_ok = can_flush and (
                    last[0] in (dom_suit, "wind", "dragon")
                )
                pung_ok = (kind != CLAIM_CHI) and can_all_pungs
                fan_ok = (
                    new_g_fan >= 3
                    or (new_g_fan >= 2 and after <= 1)
                    or (is_fan_tile and new_g_fan >= 2)
                )
                gang_ok = (kind == CLAIM_GANG) and (
                    not can_flush or last[0] in (dom_suit, "wind", "dragon")
                )
                if (flush_ok or pung_ok or fan_ok or gang_ok) and (
                    step > 0 or (is_fan_tile and step == 0) or gang_ok
                ):
                    c_scores[kind] = float(
                        step * 1.5
                        + (0.8 if is_fan_tile else 0.0)
                        + (0.6 if kind == CLAIM_GANG else (0.3 if kind == CLAIM_PON else 0.0))
                    )
                else:
                    # 門清平自嚴格保護：非番種推進副露給予嚴厲阻遏，避免因減 1 向聽而破門清淪為起不糊的廢牌
                    c_scores[kind] = float(-2.8 + 0.2 * step)
        best_c = int(np.argmax(c_scores))
        return d_scores, c_scores, best_c, False

    if obs["claim_mask"][CLAIM_PASS] > 0:
        c_scores[CLAIM_PASS] = 0.0
    if obs["claim_mask"][CLAIM_GANG] > 0:
        c_scores[CLAIM_GANG] = 2.0

    legal = np.flatnonzero(obs["discard_mask"] > 0)
    if len(legal) == 0:
        best_c = int(np.argmax(c_scores))
        return d_scores, c_scores, best_c, False

    open_melds = len(melds)
    hand_counts = [0] * 34
    for t in hand:
        hand_counts[tile_index(*t)] += 1

    before = shanten_counts(tuple(hand_counts), open_melds)
    vis_counts = list(hand_counts)
    for p in range(4):
        for t in env.discards[p]:
            vis_counts[tile_index(*t)] += 1
        for g in env.melds[p]:
            for t in g:
                vis_counts[tile_index(*t)] += 1

    after_sh_map: dict[int, int] = {}
    for idx in legal:
        idx_i = int(idx)
        hand_counts[idx_i] -= 1
        after_sh_map[idx_i] = shanten_counts(tuple(hand_counts), open_melds)
        hand_counts[idx_i] += 1
    min_after = min(after_sh_map.values())

    threat = _threat(env, pid)
    total_discards = sum(len(r) for r in env.discards)
    hand_len = max(1, len(hand))
    wall_len = len(env.wall)
    hand_suit_counts = {
        s: sum(1 for t in hand if t[0] == s)
        for s in ("man", "pin", "sou", "wind", "dragon")
    }
    defend_mode = (threat >= 2 and before >= 1) or (
        total_discards >= 32 and threat >= 1 and before >= 2
    )

    candidate_draws: list[tuple[int, int, int]] = []
    for t_idx in range(27):
        left = 4 - vis_counts[t_idx]
        if left <= 0:
            continue
        suit_id = t_idx // 9
        base = suit_id * 9
        lo = base if t_idx - 2 < base else t_idx - 2
        hi = base + 9 if t_idx + 3 > base + 9 else t_idx + 3
        for k in range(lo, hi):
            if hand_counts[k] > 0:
                candidate_draws.append((t_idx, left, suit_id))
                break
    for t_idx in range(27, 34):
        left = 4 - vis_counts[t_idx]
        if left > 0 and hand_counts[t_idx] > 0:
            candidate_draws.append((t_idx, left, 3))

    for idx in legal:
        idx_i = int(idx)
        t = _INDEX_TO_TILE[idx_i]
        after_sh = after_sh_map[idx_i]
        copies = hand_counts[idx_i]
        seen_outside = vis_counts[idx_i] - copies
        fan_honor = t[0] == "dragon" or (
            t[0] == "wind" and t[1] in (seat, rw)
        )
        guest = t[0] == "wind" and not fan_honor
        suit_n = hand_suit_counts[t[0]]
        is_suited = t[0] in ("man", "pin", "sou")
        is_term = is_suited and t[1] in (1, 9)
        is_mid = is_suited and 3 <= t[1] <= 7

        sc = (
            0.2853
            - 1.4527 * (after_sh / 8.0)
            - 1.7393 * ((after_sh - before) / 4.0)
            - 1.2753 * (copies / 4.0)
            + (0.6501 + 0.5997) * (seen_outside / 4.0)
            + (1.742 if guest else 0.0)
            - (0.6975 if fan_honor else 0.0)
            + (0.3922 if is_term else 0.0)
            - (0.1162 if is_mid else 0.0)
            - 0.8997 * (suit_n / hand_len)
            - (1.097 if copies >= 2 else 0.0)
            + (0.0267 if total_discards >= 36 else 0.0)
            + 0.2799 * (threat / 2.0)
            - 0.1394 * (wall_len / 80.0)
        )

        if after_sh > min_after:
            sc -= 1.5 * (after_sh - min_after)
        if after_sh <= min_after + 1:
            hand_counts[idx_i] -= 1
            s0_13 = _suit_states(tuple(hand_counts[0:9]))
            s1_13 = _suit_states(tuple(hand_counts[9:18]))
            s2_13 = _suit_states(tuple(hand_counts[18:27]))
            hs_13 = _honor_states(tuple(hand_counts[27:34]))
            outs = 0
            fan_outs = 0
            after_hand = None
            for t_idx, left, suit_id in candidate_draws:
                if hand_counts[t_idx] >= 4:
                    continue
                if suit_id == 3:
                    if hand_counts[t_idx] == 0:
                        continue
                    hand_counts[t_idx] += 1
                    sh = _combine_shanten(
                        s0_13, s1_13, s2_13,
                        _honor_states(tuple(hand_counts[27:34])),
                        open_melds,
                    )
                    hand_counts[t_idx] -= 1
                elif suit_id == 0:
                    hand_counts[t_idx] += 1
                    sh = _combine_shanten(
                        _suit_states(tuple(hand_counts[0:9])),
                        s1_13, s2_13, hs_13, open_melds,
                    )
                    hand_counts[t_idx] -= 1
                elif suit_id == 1:
                    hand_counts[t_idx] += 1
                    sh = _combine_shanten(
                        s0_13,
                        _suit_states(tuple(hand_counts[9:18])),
                        s2_13, hs_13, open_melds,
                    )
                    hand_counts[t_idx] -= 1
                else:
                    hand_counts[t_idx] += 1
                    sh = _combine_shanten(
                        s0_13, s1_13,
                        _suit_states(tuple(hand_counts[18:27])),
                        hs_13, open_melds,
                    )
                    hand_counts[t_idx] -= 1
                if sh < after_sh:
                    outs += left
                    if after_sh == 0:
                        if after_hand is None:
                            after_hand = list(hand)
                            after_hand.remove(t)
                        win_t = _INDEX_TO_TILE[t_idx]
                        tiles = [*after_hand, win_t]
                        if env.fan_of(pid, False, tiles=tiles) >= 3:
                            fan_outs += left * 2
                        elif env.fan_of(pid, True, tiles=tiles) >= 3:
                            fan_outs += left
            hand_counts[idx_i] += 1
            sc += outs * 0.03
            if after_sh == 0:
                if fan_outs == 0:
                    sc -= 2.0
                else:
                    sc += fan_outs * 0.12

        if is_suited:
            v = t[1]
            adj1 = hc[(t[0], v - 1)] + hc[(t[0], v + 1)]
            adj2 = hc[(t[0], v - 2)] + hc[(t[0], v + 2)]
            if adj1 > 0:
                sc -= 0.20
            elif adj2 > 0:
                sc -= 0.08
            else:
                sc += 0.18
            if can_flush:
                if t[0] == dom_suit:
                    sc -= 0.65
                else:
                    sc += 0.85
        elif can_flush:
            # Honor tiles under can_flush (混一色)
            if hc[t] >= 2 or fan_honor:
                sc -= 0.50
        if can_all_pungs and hc[t] == 1:
            sc += 0.25

        if defend_mode:
            if seen_outside >= 3:
                sc += 0.80
            elif seen_outside >= 2 and (not is_suited or is_term):
                sc += 0.45
            elif seen_outside == 0 and is_mid:
                sc -= 0.60

        d_scores[idx_i] = float(sc)

    best_c = int(np.argmax(c_scores))
    if best_c != CLAIM_PASS and c_scores[best_c] > 0:
        return d_scores, c_scores, best_c, False
    best_d = int(np.argmax(d_scores))
    return d_scores, c_scores, best_d, True
