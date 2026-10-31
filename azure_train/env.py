"""Simplified Hong Kong Mahjong self-play environment.

Implemented:
- Standard four-meld-and-pair winning shapes.
- Minimum 3 faan for HU.
- 二五半 base schedule: 3 fan = 2, 4–6 = 5, 7+ = 10.
- Dealer-related payment is doubled.
- Self-draw is paid by all three opponents.
- No fourth-meld bao payment.

This is still a simplified environment. In particular, it does not
represent every possible individual chow or kong choice.
"""

from __future__ import annotations

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
    build_planes,
    counts_from_tiles,
    tile_index,
)

Tile = tuple[str, int]


def er_wu_ban(fan: int) -> float:
    """香港麻雀標準半辣上基本點數（出銃全付，自摸三家半付，各家平等）：
    - 3番: 8分 (1辣)   -> 自摸收 12分，各家扣 4分
    - 4番: 16分 (2辣)  -> 自摸收 24分，各家扣 8分
    - 5番: 24分 (3辣)  -> 自摸收 36分，各家扣 12分
    - 6番: 32分 (4辣)  -> 自摸收 48分，各家扣 16分
    - 7番: 48分 (6辣)  -> 自摸收 72分，各家扣 24分
    - 8番: 64分 (8辣)  -> 自摸收 96分，各家扣 32分
    - 9番: 96分 (12辣) -> 自摸收 144分，各家扣 48分
    - 10-12番: 128分 (16辣) -> 自摸收 192分，各家扣 64分
    - 13番+: 256分 (32辣)   -> 自摸收 384分，各家扣 128分
    """
    if fan < 3:
        return 0.0
    if fan == 3:
        return 8.0
    if fan == 4:
        return 16.0
    if fan == 5:
        return 24.0
    if fan == 6:
        return 32.0
    if fan == 7:
        return 48.0
    if fan == 8:
        return 64.0
    if fan == 9:
        return 96.0
    if fan < 13:
        return 128.0
    return 256.0


def _new_wall(rng: np.random.Generator) -> list[Tile]:
    tiles: list[Tile] = []

    for suit in ("man", "pin", "sou"):
        for value in range(1, 10):
            tiles.extend((suit, value) for _ in range(4))

    for value in range(1, 5):
        tiles.extend(("wind", value) for _ in range(4))

    for value in range(1, 4):
        tiles.extend(("dragon", value) for _ in range(4))

    for value in range(1, 9):
        tiles.append(("flower", value))

    rng.shuffle(tiles)
    return tiles


class HKEnv:
    def __init__(self, seed: int = 0):
        self.rng = np.random.default_rng(seed)

        self.wall: list[Tile] = []
        self.hands: list[list[Tile]] = []
        self.discards: list[list[Tile]] = []
        self.melds: list[list[list[Tile]]] = []
        self.flowers: list[list[int]] = []
        self.closed_kongs = [0, 0, 0, 0]

        self.dealer = 0
        self.round_wind = 0
        self.seat_wind = [0, 1, 2, 3]
        self.current = 0
        self.phase = "discard"
        self.kong_draw = False

        self.last: Tile | None = None
        self.last_from: int | None = None
        self.scores = np.zeros(4, dtype=np.float32)
        self.done = False
        self.pending: dict[int, list[int]] = {}
        self.answers: dict[int, int] = {}
        self.winner: int | None = None
        self.loser: int | None = None
        self.win_fan = 0

    def reset(self) -> None:
        self.wall = _new_wall(self.rng)
        self.hands = [[] for _ in range(4)]
        self.discards = [[] for _ in range(4)]
        self.melds = [[] for _ in range(4)]
        self.flowers = [[] for _ in range(4)]
        self.closed_kongs = [0, 0, 0, 0]

        self.dealer = int(self.rng.integers(0, 4))
        self.round_wind = int(self.rng.integers(0, 4))
        self.seat_wind = [(i - self.dealer) % 4 for i in range(4)]
        self.current = self.dealer
        self.phase = "discard"
        self.kong_draw = False

        self.scores[:] = 0
        self.done = False
        self.last = None
        self.last_from = None
        self.pending = {}
        self.answers = {}
        self.winner = None
        self.loser = None
        self.win_fan = 0

        for _ in range(13):
            for pid in range(4):
                if not self._draw_into(pid, replace=False):
                    return

        self._draw_into(self.dealer, replace=False)

    def _draw_into(self, pid: int, replace: bool) -> bool:
        # Ordinary and replacement draws use the same wall in this model.
        while self.wall:
            tile = self.wall.pop()
            if tile[0] == "flower":
                self.flowers[pid].append(tile[1])
                continue
            self.hands[pid].append(tile)
            return True

        self.done = True
        return False

    def observe(self, pid: int) -> dict[str, np.ndarray]:
        def rel(other: int) -> int:
            return (other - pid) % 4

        disc = [np.zeros(N_TILES, np.float32) for _ in range(4)]
        meld = [np.zeros(N_TILES, np.float32) for _ in range(4)]
        visible = np.zeros(N_TILES, np.float32)

        for other in range(4):
            d = counts_from_tiles(self.discards[other])
            m = counts_from_tiles(
                [tile for group in self.melds[other] for tile in group]
            )
            disc[rel(other)] = d
            meld[rel(other)] = m
            visible += d + m

        hand = counts_from_tiles(self.hands[pid])
        visible += hand

        planes = build_planes(
            hand,
            disc,
            meld,
            visible,
            self.flowers[pid],
            self.seat_wind[pid],
            self.round_wind,
            len(self.wall),
            pid == self.dealer,
        )

        dmask = np.zeros(N_TILES, np.float32)
        cmask = np.zeros(N_CLAIM, np.float32)

        if self.phase == "discard" and self.current == pid and not self.done:
            for suit, value in self.hands[pid]:
                dmask[tile_index(suit, value)] = 1

            cmask[CLAIM_PASS] = 1

            if self._can_hu(pid, None, tsumo=True):
                cmask[CLAIM_HU] = 1

            if self._can_closed_kong(pid):
                cmask[CLAIM_GANG] = 1

        elif self.phase == "claim" and pid in self.pending and not self.done:
            for kind in self.pending[pid]:
                cmask[kind] = 1

        return {
            "planes": np.asarray(planes, dtype=np.float32),
            "discard_mask": dmask,
            "claim_mask": cmask,
        }

    def current_actor(self) -> int | None:
        if self.done:
            return None
        if self.phase == "discard":
            return self.current
        if self.pending:
            return min(self.pending)
        return None

    def step_self(self, pid: int, kind: int) -> None:
        if self.done or self.phase != "discard" or pid != self.current:
            raise ValueError("Invalid actor or phase for a self action.")

        if kind == CLAIM_HU and self._can_hu(pid, None, tsumo=True):
            self._pay(pid, None, tsumo=True)
            self.done = True
            return

        if kind == CLAIM_GANG and self._can_closed_kong(pid):
            candidates = [
                tile
                for tile, count in Counter(self.hands[pid]).items()
                if count == 4
            ]
            tile = min(candidates, key=lambda t: tile_index(*t))

            self._pull(pid, tile, 4)
            self.melds[pid].append([tile] * 4)
            self.closed_kongs[pid] += 1
            self.last = None
            self.last_from = None
            self.kong_draw = True
            self._draw_into(pid, replace=True)
            return

        raise ValueError(f"Illegal self action: {kind}")

    def step_discard(self, pid: int, tile_idx: int) -> None:
        if self.done or self.phase != "discard" or pid != self.current:
            raise ValueError("Invalid actor or phase for discard.")

        tile = self._take_from_hand(pid, tile_idx)
        if tile is None:
            raise ValueError(f"Tile {tile_idx} is not in player {pid}'s hand.")

        self.kong_draw = False
        self.discards[pid].append(tile)
        self.last = tile
        self.last_from = pid
        self.pending = {}
        self.answers = {}

        for other in range(4):
            if other == pid:
                continue

            kinds = []

            if self._can_hu(other, tile, tsumo=False):
                kinds.append(CLAIM_HU)

            if len(self.melds[other]) < 4:
                if self._count(other, tile) >= 3:
                    kinds.append(CLAIM_GANG)

                if self._count(other, tile) >= 2:
                    kinds.append(CLAIM_PON)

                if other == (pid + 1) % 4 and self._can_chi(other, tile):
                    kinds.append(CLAIM_CHI)

            if kinds:
                kinds.append(CLAIM_PASS)
                self.pending[other] = kinds

        if self.pending:
            self.phase = "claim"
        else:
            self._advance_draw(pid)

    def step_claim(self, pid: int, kind: int) -> None:
        if self.done or self.phase != "claim" or pid not in self.pending:
            raise ValueError("Invalid actor or phase for claim.")

        if kind not in self.pending[pid]:
            raise ValueError(f"Illegal claim action: {kind}")

        self.answers[pid] = kind
        del self.pending[pid]

        if not self.pending:
            self._resolve_claims()

    def _resolve_claims(self) -> None:
        if self.last is None or self.last_from is None:
            raise RuntimeError("Claim resolution without a discarded tile.")

        tile = self.last
        discarder = self.last_from
        ranked = []

        for pid, kind in self.answers.items():
            if kind == CLAIM_PASS:
                continue

            priority = (
                3 if kind == CLAIM_HU
                else 1 if kind == CLAIM_CHI
                else 2
            )
            distance = (pid - discarder) % 4
            ranked.append((priority, -distance, pid, kind))

        self.answers = {}

        if not ranked:
            self._advance_draw(discarder)
            return

        _, _, pid, kind = max(ranked)

        if kind == CLAIM_HU:
            self._pay(
                pid,
                discarder,
                tsumo=False,
                winning_tile=tile,
            )
            self.done = True
            return

        if not self.discards[discarder] or self.discards[discarder][-1] != tile:
            raise RuntimeError("Discard history is inconsistent.")

        self.discards[discarder].pop()

        if kind == CLAIM_PON:
            self._pull(pid, tile, 2)
            self.melds[pid].append([tile] * 3)
            self.kong_draw = False

        elif kind == CLAIM_GANG:
            self._pull(pid, tile, 3)
            self.melds[pid].append([tile] * 4)
            self.kong_draw = True

        elif kind == CLAIM_CHI:
            combo = self._chi_tiles(pid, tile)
            if len(combo) != 2:
                raise RuntimeError("Claimed chi is no longer legal.")

            for extra in combo:
                self._pull(pid, extra, 1)

            self.melds[pid].append([*combo, tile])
            self.kong_draw = False

        else:
            raise RuntimeError(f"Unexpected claim kind: {kind}")

        self.last = None
        self.last_from = None
        self.current = pid
        self.phase = "discard"

        if kind == CLAIM_GANG:
            self._draw_into(pid, replace=True)

    def _advance_draw(self, discarder: int) -> None:
        next_pid = (discarder + 1) % 4
        self.last = None
        self.last_from = None
        self.current = next_pid
        self.phase = "discard"
        self.kong_draw = False
        self._draw_into(next_pid, replace=False)

    def _pay(
        self,
        winner: int,
        loser: int | None,
        tsumo: bool,
        winning_tile: Tile | None = None,
    ) -> None:
        tiles = list(self.hands[winner])

        if not tsumo:
            if loser is None or winning_tile is None:
                raise ValueError("Discard win requires loser and winning tile.")
            tiles.append(winning_tile)

        if not _is_win(tiles, len(self.melds[winner])):
            raise ValueError("Attempted settlement of a non-winning hand.")

        fan = self.fan_of(winner, tsumo, tiles=tiles)
        if fan < 3:
            raise ValueError("Attempted settlement below 3 faan.")

        self.winner = winner
        self.loser = None if tsumo else loser
        self.win_fan = fan
        base = er_wu_ban(fan)

        if tsumo:
            pay_each = base / 2.0
            for other in range(4):
                if other == winner:
                    continue

                self.scores[other] -= pay_each
                self.scores[winner] += pay_each

        else:
            assert loser is not None
            self.scores[loser] -= base
            self.scores[winner] += base

    def fan_of(
        self,
        pid: int,
        tsumo: bool,
        tiles: list[Tile] | None = None,
    ) -> int:
        hand = self.hands[pid] if tiles is None else tiles
        melds = self.melds[pid]

        if _is_thirteen_orphans(hand, melds):
            return 13

        fan = 0

        # Preserve the supplied website convention: a declared closed
        # kong is counted as a meld for this 門清 check.
        if not melds:
            fan += 1

        if tsumo:
            fan += 1

        if tsumo and self.kong_draw:
            fan += 1

        fl_vals = set(self.flowers[pid])
        if not fl_vals:
            fan += 1
        elif len(fl_vals) == 8:
            fan += 8  # 八仙過海
        else:
            if {1, 2, 3, 4}.issubset(fl_vals):
                fan += 2  # 一台花（四季）
            if {5, 6, 7, 8}.issubset(fl_vals):
                fan += 2  # 一台花（四君子）
            fan += sum(
                (value - 1) % 4 == self.seat_wind[pid]
                for value in self.flowers[pid]
            )

        all_tiles = list(hand) + [
            tile for group in melds for tile in group
        ]
        suits = {
            suit
            for suit, _ in all_tiles
            if suit in ("man", "pin", "sou")
        }
        honors = any(
            suit in ("wind", "dragon")
            for suit, _ in all_tiles
        )

        is_all_pungs = all(
            len(group) >= 3 and len(set(group)) == 1
            for group in melds
        )
        if is_all_pungs:
            counts = list(Counter(hand).values())
            if all(count in (2, 3) for count in counts) and counts.count(2) == 1:
                pass
            else:
                is_all_pungs = False
        else:
            is_all_pungs = False

        if all(suit in ("wind", "dragon") for suit, _ in all_tiles):
            return int(fan + 10)  # 字一色

        all_terminals = all(
            suit in ("man", "pin", "sou") and value in (1, 9)
            for suit, value in all_tiles
        )
        if all_terminals and is_all_pungs:
            return int(fan + 10)  # 清么九

        all_terminals_or_honors = all(
            suit in ("wind", "dragon") or (suit in ("man", "pin", "sou") and value in (1, 9))
            for suit, value in all_tiles
        )
        if all_terminals_or_honors and is_all_pungs and honors and suits:
            fan += 4  # 混么九
        elif is_all_pungs:
            fan += 3
        elif _is_pinghu(hand, melds):
            fan += 1

        if len(suits) == 1:
            fan += 3 if honors else 7

        dragon_pungs = 0
        dragon_pairs = 0

        for value in (1, 2, 3):
            dragon_tile = ("dragon", value)
            in_meld = any(
                len(group) >= 3 and group[0] == dragon_tile
                for group in melds
            )
            count = hand.count(dragon_tile)

            if in_meld or count >= 3:
                dragon_pungs += 1
            elif count == 2:
                dragon_pairs += 1

        if dragon_pungs == 3:
            fan += 8  # 大三元
        elif dragon_pungs == 2 and dragon_pairs == 1:
            fan += 5  # 小三元
        else:
            fan += dragon_pungs

        wind_pungs = 0
        wind_pairs = 0
        for w in (1, 2, 3, 4):
            w_tile = ("wind", w)
            in_meld = any(
                len(group) >= 3 and group[0] == w_tile
                for group in melds
            )
            count = hand.count(w_tile)
            if in_meld or count >= 3:
                wind_pungs += 1
            elif count == 2:
                wind_pairs += 1

        if wind_pungs == 4:
            fan += 10  # 大四喜
        elif wind_pungs == 3 and wind_pairs == 1:
            fan += 5  # 小四喜
            for w in (1, 2, 3, 4):
                w_tile = ("wind", w)
                if any(len(g) >= 3 and g[0] == w_tile for g in melds) or hand.count(w_tile) >= 3:
                    if w == self.seat_wind[pid] + 1:
                        fan += 1
                    if w == self.round_wind + 1:
                        fan += 1
        else:
            for w in (1, 2, 3, 4):
                w_tile = ("wind", w)
                has_pung = any(len(g) >= 3 and g[0] == w_tile for g in melds) or hand.count(w_tile) >= 3
                if has_pung:
                    if w == self.seat_wind[pid] + 1:
                        fan += 1
                    if w == self.round_wind + 1:
                        fan += 1

        return int(fan)

    def _can_hu(
        self,
        pid: int,
        tile: Tile | None,
        tsumo: bool,
    ) -> bool:
        tiles = list(self.hands[pid])

        if not tsumo:
            if tile is None:
                return False
            tiles.append(tile)

        is_win_shape = _is_win(tiles, len(self.melds[pid])) or _is_thirteen_orphans(tiles, self.melds[pid])
        return (
            is_win_shape
            and self.fan_of(pid, tsumo, tiles=tiles) >= 3
        )

    def _can_closed_kong(self, pid: int) -> bool:
        return (
            len(self.melds[pid]) < 4
            and any(
                count == 4
                for count in Counter(self.hands[pid]).values()
            )
        )

    def _can_chi(self, pid: int, tile: Tile) -> bool:
        return bool(self._chi_tiles(pid, tile))

    def _chi_tiles(self, pid: int, tile: Tile) -> list[Tile]:
        suit, value = tile

        if suit not in ("man", "pin", "sou"):
            return []

        hand = self.hands[pid]
        options = []

        for a, b in (
            (value - 2, value - 1),
            (value - 1, value + 1),
            (value + 1, value + 2),
        ):
            if (
                1 <= a <= 9
                and 1 <= b <= 9
                and (suit, a) in hand
                and (suit, b) in hand
            ):
                options.append([(suit, a), (suit, b)])

        if not options:
            return []

        options.sort(
            key=lambda pair: (
                abs(pair[0][1] - value) + abs(pair[1][1] - value),
                pair[0][1],
            )
        )
        return options[0]

    def _count(self, pid: int, tile: Tile) -> int:
        return self.hands[pid].count(tile)

    def _take_from_hand(self, pid: int, tile_idx: int) -> Tile | None:
        for index, tile in enumerate(self.hands[pid]):
            if tile_index(*tile) == tile_idx:
                return self.hands[pid].pop(index)
        return None

    def _pull(self, pid: int, tile: Tile, n: int) -> None:
        if self.hands[pid].count(tile) < n:
            raise ValueError(
                f"Player {pid} does not have {n} copies of {tile}."
            )

        for _ in range(n):
            self.hands[pid].remove(tile)


THIRTEEN_ORPHANS_TILES = {
    ("man", 1), ("man", 9),
    ("pin", 1), ("pin", 9),
    ("sou", 1), ("sou", 9),
    ("wind", 1), ("wind", 2), ("wind", 3), ("wind", 4),
    ("dragon", 1), ("dragon", 2), ("dragon", 3),
}


def _is_thirteen_orphans(hand: list[Tile], melds: list[list[Tile]]) -> bool:
    if melds:
        return False
    if len(hand) != 14:
        return False
    counts = Counter(hand)
    if not THIRTEEN_ORPHANS_TILES.issubset(counts.keys()):
        return False
    return any(counts[t] == 2 for t in THIRTEEN_ORPHANS_TILES)


def _is_pinghu(hand: list[Tile], melds: list[list[Tile]]) -> bool:
    """Four sequences and a pair, under the supplied scoring convention."""
    for group in melds:
        if len(set(group)) == 1:
            return False

    need = 4 - len(melds)
    counts = counts_from_tiles(hand).astype(np.int8)

    def search(c: np.ndarray, n: int, pair_chosen: bool) -> bool:
        if n == 0:
            if pair_chosen:
                return int(c.sum()) == 0

            nonzero = np.flatnonzero(c)
            return len(nonzero) == 1 and int(c[nonzero[0]]) == 2

        nonzero = np.flatnonzero(c)
        if len(nonzero) == 0:
            return False

        idx = int(nonzero[0])

        if not pair_chosen and c[idx] >= 2:
            c[idx] -= 2
            won = search(c, n, True)
            c[idx] += 2
            if won:
                return True

        if (
            idx < 27
            and idx % 9 <= 6
            and c[idx + 1] > 0
            and c[idx + 2] > 0
        ):
            c[idx:idx + 3] -= 1
            won = search(c, n - 1, pair_chosen)
            c[idx:idx + 3] += 1
            if won:
                return True

        return False

    return search(counts, need, False)


def _is_win(tiles: list[Tile], open_melds: int) -> bool:
    if not 0 <= open_melds <= 4:
        return False

    need = 4 - open_melds

    if len(tiles) != 3 * need + 2:
        return False

    counts = counts_from_tiles(tiles).astype(np.int8, copy=True)

    if np.any(counts < 0) or np.any(counts > 4):
        return False

    return _search(counts, need, False)


def _search(counts: np.ndarray, need: int, pair: bool) -> bool:
    if need < 0:
        return False

    if need == 0:
        if pair:
            return int(counts.sum()) == 0
        return int(counts.sum()) == 2 and bool(np.any(counts == 2))

    nonzero = np.flatnonzero(counts)
    if len(nonzero) == 0:
        return False

    index = int(nonzero[0])

    if not pair and counts[index] >= 2:
        counts[index] -= 2
        won = _search(counts, need, True)
        counts[index] += 2
        if won:
            return True

    if counts[index] >= 3:
        counts[index] -= 3
        won = _search(counts, need - 1, pair)
        counts[index] += 3
        if won:
            return True

    if (
        index < 27
        and index % 9 <= 6
        and counts[index + 1] > 0
        and counts[index + 2] > 0
    ):
        counts[index:index + 3] -= 1
        won = _search(counts, need - 1, pair)
        counts[index:index + 3] += 1
        if won:
            return True

    return False


def _regression_checks() -> None:
    env = HKEnv(0)
    env.reset()
    env.flowers[0] = []
    env.melds[0] = []
    env.closed_kongs[0] = 0

    # Big three dragons.
    env.hands[0] = (
        [("dragon", 1)] * 3
        + [("dragon", 2)] * 3
        + [("dragon", 3)] * 3
        + [("man", 1), ("man", 2), ("man", 3)]
        + [("pin", 9)] * 2
    )
    assert env.fan_of(0, tsumo=False) >= 8

    # Small three dragons.
    env.hands[0] = (
        [("dragon", 1)] * 3
        + [("dragon", 2)] * 3
        + [("dragon", 3)] * 2
        + [("man", 1), ("man", 2), ("man", 3)]
        + [("pin", 1), ("pin", 2), ("pin", 3)]
    )
    assert env.fan_of(0, tsumo=False) == 7

    # Four sequences with an honor pair.
    env.kong_draw = False
    env.seat_wind[0] = 0
    env.melds[0] = []
    env.hands[0] = (
        [("man", 1), ("man", 2), ("man", 3)]
        + [("man", 4), ("man", 5), ("man", 6)]
        + [("pin", 1), ("pin", 2), ("pin", 3)]
        + [("sou", 7), ("sou", 8), ("sou", 9)]
        + [("wind", 3), ("wind", 3)]
    )
    env.flowers[0] = [2]
    assert env.fan_of(0, tsumo=True) == 3

    env.dealer = 0
    env.scores[:] = 0
    env._pay(0, None, tsumo=True)
    assert list(env.scores) == [12.0, -4.0, -4.0, -4.0]

    # Thirteen Orphans.
    orphans = list(THIRTEEN_ORPHANS_TILES) + [("man", 1)]
    assert _is_thirteen_orphans(orphans, [])
    env.hands[0] = list(orphans)
    assert env.fan_of(0, tsumo=False) == 13

    # Four copies of each sequence tile do not imply all pungs.
    env.hands[0] = (
        [("man", 1)] * 4
        + [("man", 2)] * 4
        + [("man", 3)] * 4
        + [("man", 4)] * 2
    )
    env.flowers[0] = []
    env.melds[0] = []
    env.kong_draw = False
    assert _is_win(env.hands[0], 0)
    assert env.fan_of(0, tsumo=False) == 10

    assert _is_win([("dragon", 3)] * 2, 4)
    assert not _is_win([("dragon", 2), ("dragon", 3)], 4)

    print("All environment regression checks passed.")


if __name__ == "__main__":
    _regression_checks()