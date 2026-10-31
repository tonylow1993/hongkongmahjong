import type { GameState, Tile } from '../game/types';

function pack(tiles: Tile[]) {
  return tiles.map((t) => ({ suit: t.suit, value: t.value }));
}

/** JSON the local model expects. `seat` is the player about to act. */
export function tableSnapshot(state: GameState, seat: number) {
  const self = state.phase === 'discard' ? (state.claimOptions[seat] ?? []) : [];
  const claims = state.phase === 'claim' ? (state.claimOptions[seat] ?? []) : self;
  return {
    seat,
    dealer: state.dealer,
    prevailingWind: state.prevailingWind,
    wall: state.wall.length,
    phase: state.phase === 'claim' ? 'claim' : 'discard',
    lastDiscard: state.lastDiscard
      ? { suit: state.lastDiscard.suit, value: state.lastDiscard.value }
      : null,
    lastDiscarder: state.lastDiscarder,
    claimKinds: claims.map((opt) => opt.kind),
    players: state.players.map((p) => ({
      seatWind: p.seatWind,
      hand: pack(p.hand),
      discards: pack(p.discards),
      melds: p.melds.map((m) => ({ kind: m.kind, tiles: pack(m.tiles) })),
      flowers: pack(p.flowers),
    })),
  };
}

/** Advice for the human seat. */
export function coachSnapshot(state: GameState) {
  return tableSnapshot(state, 0);
}
