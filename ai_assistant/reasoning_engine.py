"""AI Mahjong Coach reasoning engine.

Translates the trained deep neural network's policy into clear, tactical,
and context-specific explanations in Traditional Chinese (Hong Kong Mahjong rules).
"""

from __future__ import annotations

import functools
import numpy as np

from state_encoding import (
    index_to_label,
    is_seat_flower,
    tile_index,
    CLAIM_CHI,
    CLAIM_GANG,
    CLAIM_HU,
    CLAIM_PASS,
    CLAIM_PON,
    _wind,
)

CLAIM_NAMES = ["過", "吃", "碰", "槓", "糊"]
SUIT_NAMES = ["萬", "筒", "索"]
WIND_NAMES = ["東", "南", "西", "北"]
DRAGON_NAMES = ["中", "發", "白"]


# ----------------------------------------------------------------------
# Fast Shanten Calculation (Pareto-optimal suit decomposition)
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

        if i <= 6 and lst[i + 1] and lst[i + 2] and m < 4:
            lst[i] -= 1
            lst[i + 1] -= 1
            lst[i + 2] -= 1
            rec(m + 1, t, p)
            lst[i] += 1
            lst[i + 1] += 1
            lst[i + 2] += 1

        if m + t < 4:
            if lst[i] >= 2:
                lst[i] -= 2
                rec(m, t + 1, p)
                lst[i] += 2

            if i <= 7 and lst[i + 1]:
                lst[i] -= 1
                lst[i + 1] -= 1
                rec(m, t + 1, p)
                lst[i] += 1
                lst[i + 1] += 1

            if i <= 6 and lst[i + 2]:
                lst[i] -= 1
                lst[i + 2] -= 1
                rec(m, t + 1, p)
                lst[i] += 1
                lst[i + 2] += 1

        if p == 0 and lst[i] >= 2:
            lst[i] -= 2
            rec(m, t, 1)
            lst[i] += 2

        lst[i] -= 1
        rec(m, t, p)
        lst[i] += 1

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


def shanten_counts(counts: tuple[int, ...], open_melds: int) -> int:
    s0 = _suit_states(counts[0:9])
    s1 = _suit_states(counts[9:18])
    s2 = _suit_states(counts[18:27])
    hs = _honor_states(counts[27:34])
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


def _calculate_ukeire(
    counts: list[int], open_melds: int, visible: np.ndarray
) -> tuple[int, list[tuple[int, int]], int]:
    """Calculate shanten, effective outs list (tile_idx, rem_count), and total outs."""
    base_sh = shanten_counts(tuple(counts), open_melds)
    outs: list[tuple[int, int]] = []
    total_outs = 0

    target_sh = -1 if base_sh == 0 else (base_sh - 1)

    for i in range(34):
        unseen = max(0, 4 - int(visible[i]))
        if unseen <= 0:
            continue
        c = list(counts)
        c[i] += 1
        sh = shanten_counts(tuple(c), open_melds)
        if (base_sh == 0 and sh == -1) or (base_sh > 0 and sh <= target_sh):
            outs.append((i, unseen))
            total_outs += unseen

    outs.sort(key=lambda x: -x[1])
    return base_sh, outs, total_outs


# ----------------------------------------------------------------------
# 3-Faan Route and Defensive Assessment
# ----------------------------------------------------------------------

def _analyze_faan_path(
    hand_counts: list[int],
    flowers: list[int],
    seat_wind: int,
    round_wind: int,
    melds: list[dict],
) -> tuple[list[str], int, bool]:
    """Analyzes guaranteed and potential faan, returning descriptions and estimated faan."""
    faan_items = []
    base_faan = 0

    # 1. Flowers
    seat_flowers = [f for f in flowers if is_seat_flower(f, seat_wind)]
    if seat_flowers:
        faan_items.append(f"正花 {len(seat_flowers)} 番")
        base_faan += len(seat_flowers)
    elif not flowers:
        faan_items.append("無花 1 番")
        base_faan += 1

    # 2. Concealed hand (門清)
    if not melds:
        faan_items.append("門清 1 番（門清+自摸+平胡可起糊）")
        base_faan += 1

    # 3. Dragons (中發白)
    for d_idx, d_name in enumerate(DRAGON_NAMES):
        idx = 31 + d_idx
        if hand_counts[idx] >= 3:
            faan_items.append(f"番子【{d_name}】刻子 1 番")
            base_faan += 1
        elif hand_counts[idx] == 2:
            faan_items.append(f"番子【{d_name}】對子（碰出即有 1 番）")

    # 4. Seat Wind & Prevailing Wind (位風 & 圈風)
    s_idx = 27 + seat_wind
    if hand_counts[s_idx] >= 3:
        faan_items.append(f"門風【{WIND_NAMES[seat_wind]}】刻子 1 番")
        base_faan += 1
    elif hand_counts[s_idx] == 2:
        faan_items.append(f"門風【{WIND_NAMES[seat_wind]}】對子（碰出即有 1 番）")

    r_idx = 27 + round_wind
    if round_wind != seat_wind:
        if hand_counts[r_idx] >= 3:
            faan_items.append(f"圈風【{WIND_NAMES[round_wind]}】刻子 1 番")
            base_faan += 1
        elif hand_counts[r_idx] == 2:
            faan_items.append(f"圈風【{WIND_NAMES[round_wind]}】對子（碰出即有 1 番）")

    # 5. Suit flush potential (混一色 / 清一色)
    suit_counts = [sum(hand_counts[s * 9 : (s + 1) * 9]) for s in range(3)]
    honor_count = sum(hand_counts[27:34])
    for s_idx, s_name in enumerate(SUIT_NAMES):
        if suit_counts[s_idx] >= 8 and honor_count >= 1:
            faan_items.append(f"手牌偏向【{s_name}子】，混一色 3 番路徑清晰")
            break
        elif suit_counts[s_idx] >= 10 and honor_count == 0:
            faan_items.append(f"手牌純【{s_name}子】，清一色 7 番機會！")
            break

    # 6. All Pungs potential (對對糊 - 3番)
    pairs = sum(1 for c in hand_counts if c >= 2)
    if pairs >= 4 or (pairs >= 3 and len(melds) >= 1):
        faan_items.append("對子/刻子偏多，可走對對糊 3 番路徑")

    has_three_faan = base_faan >= 3 or any("3 番" in item or "7 番" in item for item in faan_items)
    return faan_items, base_faan, has_three_faan


def _tile_safety_note(idx: int, visible: np.ndarray, hand_copies: int) -> str:
    outside = int(visible[idx] - hand_copies)
    if outside >= 4:
        return "完壁（四張全現，出牌絕無放銃風險）"
    if outside >= 3:
        return "薄壁熟張（外見 3 張，僅餘最多 1 張，安全性極高）"
    if outside >= 2 and (idx >= 27 or idx % 9 in (0, 8)):
        return "熟張字牌/么九（安全度佳）"
    if outside == 0:
        if idx < 27 and 3 <= (idx % 9) <= 5:
            return "⚠️ 生張中張（四至六中間張，牌池全生，放銃風險最高）"
        return "生張（牌池未見，需留意對手叫口）"
    return f"半熟牌（牌池外見 {outside} 張）"


def _threat_summary(snap: dict, my_seat: int) -> tuple[int, list[str]]:
    players = snap.get("players") or []
    warnings = []
    max_threat = 0

    for q, p in enumerate(players):
        if q == my_seat:
            continue
        melds = p.get("melds") or []
        m_count = len(melds)
        rel_names = {1: "下家", 2: "對家", 3: "上家"}
        rel = (q - my_seat) % 4
        rel_label = rel_names.get(rel, f"玩家{q}")

        if m_count >= 3:
            warnings.append(f"⚠️ {rel_label}已三副露（大叫口，極可能已聽牌）")
            max_threat = max(max_threat, 3)
        elif m_count == 2:
            warnings.append(f"{rel_label}已二副露（已有做牌雛形）")
            max_threat = max(max_threat, 2)

    return max_threat, warnings


# ----------------------------------------------------------------------
# Main Entry Point: advise()
# ----------------------------------------------------------------------

def advise(snap: dict, arrays: dict, model: dict | None) -> dict:
    seat = int(snap["seat"])
    me = snap["players"][seat]
    hand = [(t["suit"], int(t["value"])) for t in me.get("hand") or []]
    flowers = [int(f["value"]) for f in me.get("flowers") or []]
    melds = me.get("melds") or []
    seat_wind = _wind(me.get("seatWind"))
    round_wind = _wind(snap.get("prevailingWind"))
    visible = arrays["visible"]
    claim_mask = arrays["claim_mask"]
    discard_mask = arrays["discard_mask"]
    phase = snap.get("phase")

    # Hand counts (0..33)
    hand_counts = [0] * 34
    for s, v in hand:
        if s != "flower":
            hand_counts[tile_index(s, v)] += 1

    faan_items, base_faan, has_three_faan = _analyze_faan_path(
        hand_counts, flowers, seat_wind, round_wind, melds
    )
    max_threat, threat_warnings = _threat_summary(snap, seat)

    # ------------------------------------------------------------------
    # 1. Claim Phase: 吃 / 碰 / 槓 / 過 / 糊
    # ------------------------------------------------------------------
    if phase == "claim" or (claim_mask.any() and claim_mask[0] == 0):
        # Legal HU must be taken immediately
        if claim_mask.shape[0] > CLAIM_HU and claim_mask[CLAIM_HU] > 0:
            chosen_kind = CLAIM_HU
        elif model is not None:
            masked_claims = np.where(claim_mask > 0, model["claim_probs"], -1.0)
            chosen_kind = int(np.argmax(masked_claims))
        else:
            chosen_kind = int(np.argmax(claim_mask))

        return _build_claim_advice(
            chosen_kind, model, snap, hand_counts, faan_items, has_three_faan, max_threat
        )

    # ------------------------------------------------------------------
    # 2. Discard Phase: Check for self-drawn HU (自摸) first
    # ------------------------------------------------------------------
    if claim_mask.shape[0] > CLAIM_HU and claim_mask[CLAIM_HU] > 0:
        return {
            "recommended_action": "食糊（自摸）",
            "confidence": 1.0,
            "expected_value": "+10.0 點",
            "alternative_moves": [],
            "reason_zh_hk": (
                "🎯【勝利食糊】手牌已完成食糊牌型，且達到香港麻雀三番起糊門檻！"
                "立即宣布自摸食糊，贏取全桌番數！"
            ),
            "latency_ms": None if model is None else round(float(model["latency_ms"]), 2),
        }

    # ------------------------------------------------------------------
    # 3. Discard Decision
    # ------------------------------------------------------------------
    legal_tiles = [i for i in range(34) if discard_mask[i] > 0]
    if not legal_tiles:
        legal_tiles = [0]

    if model is not None:
        masked_discards = np.where(discard_mask > 0, model["discard_probs"], -1.0)
        sorted_indices = np.argsort(-masked_discards)
        best_idx = int(sorted_indices[0])
        second_idx = int(sorted_indices[1]) if len(sorted_indices) > 1 and masked_discards[sorted_indices[1]] >= 0 else None
        conf = float(model["discard_probs"][best_idx])
        ev = float(model["expected_value"])
    else:
        best_idx = legal_tiles[0]
        second_idx = legal_tiles[1] if len(legal_tiles) > 1 else None
        conf = 0.5
        ev = 0.0

    # Calculate ukeire for best choice
    counts_after = list(hand_counts)
    counts_after[best_idx] -= 1
    sh_after, outs, total_outs = _calculate_ukeire(counts_after, len(melds), visible)

    # Calculate ukeire for second choice (for comparison)
    alt_moves = []
    if second_idx is not None:
        c_alt = list(hand_counts)
        c_alt[second_idx] -= 1
        sh_alt, outs_alt, total_alt = _calculate_ukeire(c_alt, len(melds), visible)
        alt_safety = _tile_safety_note(second_idx, visible, hand_counts[second_idx])
        alt_reason = f"有效進張 {total_alt} 張（{alt_safety}）"
        alt_moves.append({
            "action": f"打 {index_to_label(second_idx)}",
            "reason": alt_reason,
        })

    # Build rich tactical reasoning explanation
    reason = _compose_discard_reason(
        best_idx=best_idx,
        hand_counts=hand_counts,
        sh_after=sh_after,
        outs=outs,
        total_outs=total_outs,
        faan_items=faan_items,
        visible=visible,
        max_threat=max_threat,
        threat_warnings=threat_warnings,
        alt_idx=second_idx,
    )

    return {
        "recommended_action": f"打 {index_to_label(best_idx)}",
        "confidence": round(conf, 2),
        "expected_value": f"{ev:+.1f} 點",
        "alternative_moves": alt_moves,
        "reason_zh_hk": reason,
        "latency_ms": None if model is None else round(float(model["latency_ms"]), 2),
    }


# ----------------------------------------------------------------------
# Detailed Explanation Formatters
# ----------------------------------------------------------------------

def _compose_discard_reason(
    best_idx: int,
    hand_counts: list[int],
    sh_after: int,
    outs: list[tuple[int, int]],
    total_outs: int,
    faan_items: list[str],
    visible: np.ndarray,
    max_threat: int,
    threat_warnings: list[str],
    alt_idx: int | None,
) -> str:
    sh_names = {0: "聽牌（叫糊中）", 1: "一向聽", 2: "二向聽", 3: "三向聽"}
    sh_status = sh_names.get(sh_after, f"{sh_after} 向聽")
    tile_name = index_to_label(best_idx)
    copies = hand_counts[best_idx]

    # Section 1: Intent & Shanten
    if sh_after == 0:
        win_tiles = "、".join([f"【{index_to_label(i)}】({cnt}張)" for i, cnt in outs[:4]])
        if not win_tiles:
            win_tiles = "牌池全現（無剩餘牌）"
        ukeire_text = f"打出【{tile_name}】後直入【聽牌】，叫糊：{win_tiles}，勝率最大化。"
    elif outs:
        top_outs = "、".join([f"【{index_to_label(i)}】({cnt}張)" for i, cnt in outs[:3]])
        ukeire_text = f"打出【{tile_name}】維持【{sh_status}】，最優有效進張共 {total_outs} 張（首要進張：{top_outs}）。"
    else:
        ukeire_text = f"打出【{tile_name}】（手牌 {copies} 張），整理孤張搭子，維持手牌結構。"

    # Section 2: 3-Faan Route
    faan_text = "、".join(faan_items) if faan_items else "番數偏緊，需維持門清或爭取自摸/正花"

    # Section 3: Safety & Wall Theory
    safety_note = _tile_safety_note(best_idx, visible, copies)
    safety_text = f"【{tile_name}】{safety_note}"
    if threat_warnings:
        safety_text += "。" + "；".join(threat_warnings)

    return (
        f"🎯【牌效向聽】{ukeire_text}\n"
        f"🌟【起糊規劃】{faan_text}。\n"
        f"🛡️【安全防守】{safety_text}。"
    )


def _build_claim_advice(
    kind: int,
    model: dict | None,
    snap: dict,
    hand_counts: list[int],
    faan_items: list[str],
    has_three_faan: bool,
    max_threat: int,
) -> dict:
    conf = float(model["claim_probs"][kind]) if model is not None else 0.8
    ev = float(model["expected_value"]) if model is not None else 0.0
    last_tile = snap.get("lastDiscard")
    tile_label = ""
    if last_tile:
        tile_label = f"【{index_to_label(tile_index(last_tile['suit'], int(last_tile['value'])))}】"

    if kind == CLAIM_HU:
        rec = "食糊"
        reason = (
            f"🎯【出銃食糊】對手打出 {tile_label}！手牌已滿三番起糊門檻，立即開牌食糊贏取本局！"
        )
    elif kind == CLAIM_PON:
        rec = f"碰 {tile_label}".strip()
        reason = (
            f"🎯【碰牌成刻】對手打出 {tile_label}，碰牌可加速手牌進度成刻。"
            f"【起糊確認】：{'手牌番數充裕，具備三番起糊路徑' if has_three_faan else '注意開門後需確保番子或正花以滿足三番'}。"
        )
    elif kind == CLAIM_CHI:
        rec = f"吃 {tile_label}".strip()
        reason = (
            f"🎯【吃牌進張】上家打出 {tile_label}，吃牌直入高牌效順子搭子。"
            f"【起糊確認】：{'手牌已具備三番路徑，開門無礙起糊' if has_three_faan else '開門吃牌會拆掉門清，務必確認仍有自摸/花牌/番子湊足三番'}。"
        )
    elif kind == CLAIM_GANG:
        rec = f"槓 {tile_label}".strip()
        reason = f"🎯【開槓補牌】槓下 {tile_label}，摸取槓尾補牌增強番數與自摸機會。"
    else:  # CLAIM_PASS
        rec = "過牌"
        if not has_three_faan:
            reason = (
                f"🛡️【三番起糊防守】手牌番數不足 3 番。若此時吃/碰開門將失去門清番數（1番），"
                f"會陷入無法起糊的『死聽』！AI 戰術教練建議過牌，保留門清等待自摸或更佳起糊進張。"
            )
        elif max_threat >= 2:
            reason = (
                f"🛡️【控牌防守】桌上對手已有副露威脅，此時吃/碰暴露手牌無助於防守，過牌維持手牌彈性更為穩健。"
            )
        else:
            reason = "🎯【維持門清牌效】此牌非關鍵進張，吃碰並不能優化向聽，過牌保留門清平胡機會更佳。"

    return {
        "recommended_action": rec,
        "confidence": round(conf, 2),
        "expected_value": f"{ev:+.1f} 點",
        "alternative_moves": [{"action": "過牌", "reason": "保留門清或防守"} if kind != CLAIM_PASS else {"action": "吃/碰", "reason": "進攻加速"}],
        "reason_zh_hk": reason,
        "latency_ms": None if model is None else round(float(model["latency_ms"]), 2),
    }
