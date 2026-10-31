"""Information-Set Monte Carlo Search / Lookahead Policy Adaptation for HK Mahjong.

Combines the neural network's prior probabilities with 1-ply tactical search:
1. Candidate pruning: Considers top-K candidate discards suggested by neural net / legal mask.
2. Defense Evaluation:
   - Genbutsu (現物): absolute safe against opponent.
   - Suji (筋牌): semi-safe based on opponent discards.
   - Live/Dead honor tiles: honor tile danger calculation.
   - Opponent threat estimation based on opponent meld count, dora/fan exposure, and wall progress.
3. Hand Advancement (進章期望值):
   - Ukeire (進章枚數) and after-discard shanten.
4. Composite Expected Value (PIMC):
   EV(action) = P_advance * Advance_Reward - P_deal_in * Deal_In_Penalty
"""

from __future__ import annotations

import functools
import numpy as np

N_TILES = 34

# ----------------------------------------------------------------------
# Fast Shanten & Ukeire Utilities
# ----------------------------------------------------------------------

@functools.lru_cache(maxsize=65536)
def _suit_states(c: tuple[int, ...]) -> tuple[tuple[int, int, int], ...]:
    lst = list(c)
    best_t: dict[tuple[int, int], int] = {}
    memo: set[tuple[tuple[int, ...], int, int, int]] = set()

    def rec(m: int, t: int, p: int) -> None:
        key = (tuple(lst), m, t, p)
        if key in memo:
            return
        memo.add(key)

        k = (m, p)
        if t > best_t.get(k, -1):
            best_t[k] = t

        i = 0
        while i < 9 and lst[i] == 0:
            i += 1
        if i == 9:
            return

        if lst[i] >= 3 and m < 4:
            lst[i] -= 3
            rec(m + 1, t, p)
            lst[i] += 3

        if i <= 6 and lst[i] >= 1 and lst[i + 1] >= 1 and lst[i + 2] >= 1 and m < 4:
            lst[i] -= 1
            lst[i + 1] -= 1
            lst[i + 2] -= 1
            rec(m + 1, t, p)
            lst[i] += 1
            lst[i + 1] += 1
            lst[i + 2] += 1

        if lst[i] >= 2 and p == 0:
            lst[i] -= 2
            rec(m, t, 1)
            lst[i] += 2

        if i <= 7 and lst[i] >= 1 and lst[i + 1] >= 1 and m + t < 4:
            lst[i] -= 1
            lst[i + 1] -= 1
            rec(m, t + 1, p)
            lst[i] += 1
            lst[i + 1] += 1

        if i <= 6 and lst[i] >= 1 and lst[i + 2] >= 1 and m + t < 4:
            lst[i] -= 1
            lst[i + 2] -= 1
            rec(m, t + 1, p)
            lst[i] += 1
            lst[i + 2] += 1

        v = lst[i]
        lst[i] = 0
        rec(m, t, p)
        lst[i] = v

    rec(0, 0, 0)
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


def calc_shanten(counts: tuple[int, ...], open_melds: int) -> int:
    s0 = _suit_states(counts[0:9])
    s1 = _suit_states(counts[9:18])
    s2 = _suit_states(counts[18:27])
    hs = _honor_states(counts[27:34])
    return _combine_shanten(s0, s1, s2, hs, open_melds)


def calc_ukeire(hand_counts: list[int], open_melds: int, visible: np.ndarray) -> tuple[int, int]:
    """Returns (shanten, total_effective_outs)."""
    base_sh = calc_shanten(tuple(hand_counts), open_melds)
    if base_sh <= -1:
        return -1, 0
    target_sh = -1 if base_sh == 0 else base_sh - 1
    total_outs = 0

    for i in range(N_TILES):
        unseen = max(0, 4 - int(visible[i]))
        if unseen <= 0:
            continue
        c = list(hand_counts)
        c[i] += 1
        sh = calc_shanten(tuple(c), open_melds)
        if sh <= target_sh:
            total_outs += unseen
    return base_sh, total_outs


# ----------------------------------------------------------------------
# Opponent Danger Assessment (Suji / Genbutsu / Threat)
# ----------------------------------------------------------------------

def eval_tile_danger(
    tile_idx: int,
    opp_discards: list[np.ndarray],
    opp_melds: list[int],
    visible: np.ndarray,
    wall_left: int,
) -> float:
    """Returns estimated deal-in penalty danger (0.0 to 1.0) for a candidate tile."""
    danger_sum = 0.0
    wall_urgency = max(0.0, 1.0 - wall_left / 100.0)  # Later in the game -> danger escalates

    for opp_idx in range(1, 4):
        melds_count = opp_melds[opp_idx]
        disc = opp_discards[opp_idx]

        # Base threat of this opponent (melds, late game)
        # 1 meld: mild, 2 melds: alert, 3+ melds: high danger of tenpai
        threat = 0.15 + 0.25 * melds_count + 0.35 * wall_urgency
        threat = min(1.0, threat)

        # 1. Genbutsu (現物): absolute safe
        if disc[tile_idx] > 0:
            continue

        tile_risk = 0.5  # Neutral unseen tile base risk

        # 2. Honor tiles (字牌 27..33)
        if tile_idx >= 27:
            seen = int(visible[tile_idx])
            if seen >= 3:
                tile_risk = 0.05  # Hell single wait / near impossible
            elif seen == 2:
                tile_risk = 0.25
            else:
                tile_risk = 0.65  # Raw honor tile (生張字牌)
        else:
            # 3. Suji (筋牌) logic for numbered tiles
            suit = tile_idx // 9
            val = tile_idx % 9  # 0..8
            base = suit * 9
            is_suji = False

            if val in (0, 6) and disc[base + 3] > 0:  # 1 or 7 with 4 discarded
                is_suji = True
            elif val in (1, 7) and disc[base + 4] > 0:  # 2 or 8 with 5 discarded
                is_suji = True
            elif val in (2, 8) and disc[base + 5] > 0:  # 3 or 9 with 6 discarded
                is_suji = True
            elif val == 3 and disc[base + 0] > 0 and disc[base + 6] > 0:  # 4 with 1+7 discarded (Double suji)
                is_suji = True
            elif val == 4 and disc[base + 1] > 0 and disc[base + 7] > 0:  # 5 with 2+8 discarded (Double suji)
                is_suji = True
            elif val == 5 and disc[base + 2] > 0 and disc[base + 8] > 0:  # 6 with 3+9 discarded (Double suji)
                is_suji = True

            if is_suji:
                tile_risk = 0.15  # Suji is relatively safe
            elif val in (0, 8):  # Terminal tiles 1 or 9
                tile_risk = 0.35
            elif val in (1, 7):  # 2 or 8
                tile_risk = 0.55
            else:  # Dangerous central tiles 3, 4, 5, 6, 7
                tile_risk = 0.85

        danger_sum += threat * tile_risk

    return min(1.0, danger_sum / 2.5)


# ----------------------------------------------------------------------
# PIMC Lookahead Selector
# ----------------------------------------------------------------------

def search_best_discard(
    snap: dict,
    neural_discard_probs: np.ndarray,
    legal_mask: np.ndarray,
    top_k: int = 5,
) -> int:
    """Combines neural prior with 1-ply PIMC search to pick the optimal discard."""
    players = snap.get("players") or []
    me_seat = int(snap.get("seat", 0))

    # Reconstruct counts
    hand_counts = np.zeros(N_TILES, dtype=int)
    visible = np.zeros(N_TILES, dtype=int)
    opp_discards = [np.zeros(N_TILES, dtype=int) for _ in range(4)]
    opp_melds = [0, 0, 0, 0]

    def rel(q: int) -> int:
        return (q - me_seat) % 4

    for q, p in enumerate(players):
        r = rel(q)
        opp_melds[r] = len(p.get("melds") or [])
        for d in p.get("discards") or []:
            if d.get("suit") != "flower":
                idx = _tile_index(d["suit"], d["value"])
                if idx is not None:
                    opp_discards[r][idx] += 1
                    visible[idx] += 1
        for m in p.get("melds") or []:
            for t in m.get("tiles") or []:
                if t.get("suit") != "flower":
                    idx = _tile_index(t["suit"], t["value"])
                    if idx is not None:
                        visible[idx] += 1

    me = players[me_seat] if me_seat < len(players) else {}
    for t in me.get("hand") or []:
        if t.get("suit") != "flower":
            idx = _tile_index(t["suit"], t["value"])
            if idx is not None:
                hand_counts[idx] += 1
                visible[idx] += 1

    wall_left = int(snap.get("wall") or 70)
    open_melds = opp_melds[0]

    # Find candidates from neural network top predictions
    masked_probs = np.where(legal_mask > 0, neural_discard_probs, -1.0)
    sorted_candidates = [idx for idx in np.argsort(-masked_probs) if masked_probs[idx] >= 0]
    candidates = sorted_candidates[:top_k]

    if not candidates:
        return int(np.argmax(masked_probs))

    if len(candidates) == 1:
        return candidates[0]

    best_idx = candidates[0]
    best_ev = -float("inf")

    # Current hand shanten
    base_sh = calc_shanten(tuple(hand_counts), open_melds)

    for cand in candidates:
        prior_p = float(neural_discard_probs[cand])

        # Hand after discard
        h_after = list(hand_counts)
        h_after[cand] -= 1
        sh_after, outs = calc_ukeire(h_after, open_melds, visible)

        # Defense danger
        danger = eval_tile_danger(cand, opp_discards, opp_melds, visible, wall_left)

        # Tactical EV formulation:
        # Prior bonus + ukeire efficiency bonus - defensive danger penalty
        sh_penalty = (sh_after - base_sh) * 2.5  # Penalize breaking tenpai / stepping back in shanten
        outs_value = np.log1p(outs) * 0.45
        danger_penalty = danger * (2.8 if wall_left < 30 else 1.8)

        ev = prior_p + outs_value - sh_penalty - danger_penalty

        if ev > best_ev:
            best_ev = ev
            best_idx = cand

    return best_idx


def _tile_index(suit: str, val: int) -> int | None:
    if suit == "man" and 1 <= val <= 9:
        return val - 1
    if suit == "pin" and 1 <= val <= 9:
        return 9 + val - 1
    if suit == "sou" and 1 <= val <= 9:
        return 18 + val - 1
    if suit == "wind" and 1 <= val <= 4:
        return 27 + val - 1
    if suit == "dragon" and 1 <= val <= 3:
        return 31 + val - 1
    return None

