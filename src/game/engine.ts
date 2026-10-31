import { checkWinEligible, evaluateWin } from './scoring';
import { settleErWuBan } from './settlement';
import { createWall, isFlower, sameTile, shuffle, sortTiles } from './tiles';
import type {
  ClaimOption,
  GameConfig,
  GameState,
  Meld,
  PlayerState,
  Tile,
  Wind,
  WinInfo,
} from './types';
import { DEFAULT_CONFIG, INITIAL_TABLE_SCORE, WIND_LABELS } from './types';
import {
  canKong,
  canPong,
  findChows,
  findConcealedKongs,
  findPromotedKongs,
} from './win';

const PLAYER_NAMES = ['你', '下家', '對家', '上家'];

export interface TableSession {
  scores: number[];
  dealer: number;
  prevailingWind: Wind;
  roundWindCount: number;
  dealerStreak: number;
}

export function createFreshSession(): TableSession {
  // 開局隨機起莊（0:你、1:下家、2:對家、3:上家）
  const randomDealer = Math.floor(Math.random() * 4);
  return {
    scores: [INITIAL_TABLE_SCORE, INITIAL_TABLE_SCORE, INITIAL_TABLE_SCORE, INITIAL_TABLE_SCORE],
    dealer: randomDealer,
    prevailingWind: 0,
    roundWindCount: 1,
    dealerStreak: 0,
  };
}

/** 開台（隨機擲骰起莊，分數設為底分 1000） */
export function createNewGame(config: Partial<GameConfig> = {}): GameState {
  return dealRound(config, createFreshSession());
}

/** 下一局：保留分數，按連莊／過莊、轉圈風 */
export function startNextRound(prev: GameState): GameState {
  const session = advanceSession(prev);
  return dealRound(prev.config, session);
}

/** 中途重發：保留分數／莊／圈風，不計本局 */
export function redealRound(prev: GameState): GameState {
  return dealRound(prev.config, {
    scores: prev.players.map((p) => p.score),
    dealer: prev.dealer,
    prevailingWind: prev.prevailingWind,
    roundWindCount: prev.roundWindCount,
    dealerStreak: prev.dealerStreak,
  });
}

function advanceSession(prev: GameState): TableSession {
  const scores = prev.players.map((p) => p.score);
  let { dealer, prevailingWind, roundWindCount, dealerStreak } = prev;

  const win = prev.winInfo;
  const dealerWon = win != null && win.winner === dealer;
  // 流局：港式常見過莊；莊家贏則連莊
  if (dealerWon) {
    dealerStreak += 1;
  } else {
    dealer = (dealer + 1) % 4;
    dealerStreak = 0;
    roundWindCount += 1;
    if (roundWindCount > 4) {
      roundWindCount = 1;
      prevailingWind = ((prevailingWind + 1) % 4) as Wind;
    }
  }

  return { scores, dealer, prevailingWind, roundWindCount, dealerStreak };
}

function dealRound(config: Partial<GameConfig>, session: TableSession): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...config };
  const wall = shuffle(createWall(cfg.includeFlowers));
  const { dealer, prevailingWind, roundWindCount, dealerStreak, scores } = session;

  const players: PlayerState[] = Array.from({ length: 4 }, (_, i) => ({
    id: i,
    name: PLAYER_NAMES[i],
    isHuman: i === 0,
    seatWind: ((i - dealer + 4) % 4) as Wind,
    hand: [],
    melds: [],
    flowers: [],
    discards: [],
    isReady: false,
    score: scores[i] ?? 0,
  }));

  for (let r = 0; r < 13; r++) {
    for (let p = 0; p < 4; p++) {
      players[p].hand.push(wall.pop()!);
    }
  }
  players[dealer].hand.push(wall.pop()!);
  for (const p of players) p.hand = sortTiles(p.hand);

  const streakNote = dealerStreak > 0 ? ` · 連莊${dealerStreak}` : '';
  const state: GameState = {
    config: cfg,
    wall,
    players,
    dealer,
    currentPlayer: dealer,
    prevailingWind,
    roundWindCount,
    dealerStreak,
    phase: 'replaceFlower',
    lastDiscard: null,
    lastDiscarder: null,
    claimOptions: {},
    pendingClaims: {},
    winInfo: null,
    message: `圈風${WIND_LABELS[prevailingWind]} · ${players[dealer].name}做莊${streakNote} · 三番起糊 · 半辣上`,
    turn: 0,
    drawnTile: null,
  };

  return resolveInitialFlowers(state);
}

function applySettlement(state: GameState, info: WinInfo): GameState {
  const settled = settleErWuBan(info, state.dealer);
  const enriched: WinInfo = {
    ...info,
    tier: settled.tier,
    baseLa: settled.baseLa,
    basePoints: settled.basePoints,
    scoreDeltas: settled.deltas,
    settlementNotes: settled.lines.map(
      (l) => `${state.players[l.playerId].name}${l.note}${l.delta > 0 ? `+${l.delta}` : l.delta}`,
    ),
  };
  for (let i = 0; i < 4; i++) {
    state.players[i].score += settled.deltas[i];
  }
  state.winInfo = enriched;
  state.message = `${state.players[info.winner].name}${info.isSelfDraw ? '自摸' : '食糊'}！${info.fan}番 · ${settled.tier}`;
  return state;
}

function drawNonFlower(state: GameState, player: PlayerState): Tile | null {
  while (state.wall.length > 0) {
    const t = state.wall.pop()!;
    if (isFlower(t)) {
      player.flowers.push(t);
      continue;
    }
    return t;
  }
  return null;
}

function resolveInitialFlowers(state: GameState): GameState {
  let s = { ...state, players: state.players.map(clonePlayer) };
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of s.players) {
      const flowers = p.hand.filter(isFlower);
      if (flowers.length === 0) continue;
      changed = true;
      p.hand = p.hand.filter((t) => !isFlower(t));
      p.flowers.push(...flowers);
      for (let i = 0; i < flowers.length; i++) {
        const draw = drawNonFlower(s, p);
        if (draw) p.hand.push(draw);
      }
      p.hand = sortTiles(p.hand);
    }
  }
  s.phase = 'discard';
  s.drawnTile = s.players[s.dealer].hand[s.players[s.dealer].hand.length - 1] ?? null;
  s.message = '請出牌';
  s = refreshSelfActions(s);
  return s;
}

function clonePlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    hand: [...p.hand],
    melds: p.melds.map((m) => ({ ...m, tiles: [...m.tiles] })),
    flowers: [...p.flowers],
    discards: [...p.discards],
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    wall: [...state.wall],
    players: state.players.map(clonePlayer),
    claimOptions: { ...state.claimOptions },
    pendingClaims: { ...state.pendingClaims },
    winInfo: state.winInfo ? { ...state.winInfo, details: [...state.winInfo.details] } : null,
  };
}

function refreshSelfActions(state: GameState): GameState {
  const s = cloneState(state);
  const p = s.players[s.currentPlayer];
  const opts: ClaimOption[] = [];

  // 暗槓／加槓
  for (const kong of findConcealedKongs(p.hand)) {
    opts.push({ kind: 'kong', tiles: kong });
  }
  for (const kong of findPromotedKongs(p.hand, p.melds)) {
    opts.push({ kind: 'kong', tiles: kong });
  }

  // 自摸
  if (s.drawnTile) {
    const win = checkWinEligible(
      p,
      s.drawnTile,
      true,
      s.prevailingWind,
      s.config.minFan,
    );
    if (win) {
      opts.push({ kind: 'win', fan: win.fan, fanDetails: win.details, tiles: [s.drawnTile] });
    }
  }

  s.claimOptions = { [s.currentPlayer]: opts };
  return s;
}

/** 人類／AI 出牌 */
export function discardTile(state: GameState, tileId: string): GameState {
  if (state.phase !== 'discard') return state;
  const s = cloneState(state);
  const p = s.players[s.currentPlayer];
  const idx = p.hand.findIndex((t) => t.id === tileId);
  if (idx < 0) return state;

  const [tile] = p.hand.splice(idx, 1);
  p.hand = sortTiles(p.hand);
  p.discards.push(tile);
  s.lastDiscard = tile;
  s.lastDiscarder = s.currentPlayer;
  s.drawnTile = null;
  s.turn += 1;

  // 收集他家叫牌
  const claims: Record<number, ClaimOption[]> = {};
  for (const other of s.players) {
    if (other.id === s.currentPlayer) continue;
    const opts: ClaimOption[] = [];

    const win = checkWinEligible(
      other,
      tile,
      false,
      s.prevailingWind,
      s.config.minFan,
      s.currentPlayer,
    );
    if (win) opts.push({ kind: 'win', fan: win.fan, fanDetails: win.details, tiles: [tile] });

    if (canKong(other.hand, tile)) {
      const tiles = other.hand.filter((t) => sameTile(t, tile)).slice(0, 3);
      opts.push({ kind: 'kong', tiles: [...tiles, tile] });
    }
    if (canPong(other.hand, tile)) {
      const tiles = other.hand.filter((t) => sameTile(t, tile)).slice(0, 2);
      opts.push({ kind: 'pong', tiles: [...tiles, tile] });
    }

    // 只能吃上家（出牌者的下家）
    const next = (s.currentPlayer + 1) % 4;
    if (other.id === next) {
      for (const chow of findChows(other.hand, tile)) {
        opts.push({ kind: 'chow', tiles: chow });
      }
    }

    if (opts.length > 0) {
      opts.push({ kind: 'pass' });
      claims[other.id] = opts;
    }
  }

  if (Object.keys(claims).length > 0) {
    s.phase = 'claim';
    s.claimOptions = claims;
    s.pendingClaims = {};
    s.message = '等待叫牌……';
    return s;
  }

  return advanceDraw(s);
}

/** 提交叫牌選擇 */
export function submitClaim(
  state: GameState,
  playerId: number,
  option: ClaimOption,
): GameState {
  if (state.phase !== 'claim') return state;
  const s = cloneState(state);
  s.pendingClaims[playerId] = option;

  const waiting = Object.keys(s.claimOptions).map(Number);
  const allIn = waiting.every((id) => s.pendingClaims[id] !== undefined);
  if (!allIn) return s;

  return resolveClaims(s);
}

function claimPriority(kind: ClaimOption['kind']): number {
  switch (kind) {
    case 'win':
      return 3;
    case 'kong':
    case 'pong':
      return 2;
    case 'chow':
      return 1;
    default:
      return 0;
  }
}

function resolveClaims(state: GameState): GameState {
  const s = cloneState(state);
  const entries = Object.entries(s.pendingClaims)
    .map(([id, opt]) => ({ id: Number(id), opt: opt! }))
    .filter((e) => e.opt.kind !== 'pass');

  if (entries.length === 0) {
    s.claimOptions = {};
    s.pendingClaims = {};
    return advanceDraw(s);
  }

  entries.sort((a, b) => claimPriority(b.opt.kind) - claimPriority(a.opt.kind));
  const winner = entries[0];
  const tile = s.lastDiscard!;
  const discarder = s.lastDiscarder!;
  const p = s.players[winner.id];

  // 從棄牌區移除
  const dp = s.players[discarder];
  dp.discards = dp.discards.filter((t) => t.id !== tile.id);

  if (winner.opt.kind === 'win') {
    const info = evaluateWin(
      {
        player: p,
        winningTile: tile,
        isSelfDraw: false,
        prevailingWind: s.prevailingWind,
        discardedBy: discarder,
      },
      s.config.minFan,
    );
    s.phase = 'ended';
    s.claimOptions = {};
    if (info) {
      return applySettlement(s, info);
    }
    s.winInfo = null;
    s.message = '番數不足';
    return s;
  }

  // 從手牌移除用於叫牌的牌
  const used = (winner.opt.tiles ?? []).filter((t) => t.id !== tile.id);
  for (const u of used) {
    const i = p.hand.findIndex((t) => t.id === u.id);
    if (i >= 0) p.hand.splice(i, 1);
  }
  p.hand = sortTiles(p.hand);

  const meld: Meld = {
    kind: winner.opt.kind === 'kong' ? 'kong' : winner.opt.kind === 'pong' ? 'pong' : 'chow',
    tiles: winner.opt.tiles ?? [...used, tile],
    from: discarder,
  };
  p.melds.push(meld);

  s.currentPlayer = winner.id;
  s.lastDiscard = null;
  s.lastDiscarder = null;
  s.claimOptions = {};
  s.pendingClaims = {};

  if (meld.kind === 'kong') {
    s.message = `${p.name}槓！補牌`;
    return drawForPlayer(s, winner.id, true);
  }

  s.phase = 'discard';
  s.message = `${p.name}${meld.kind === 'pong' ? '碰' : '吃'}牌，請出牌`;
  s.drawnTile = null;
  return refreshSelfActions(s);
}

function advanceDraw(state: GameState): GameState {
  const next = (state.lastDiscarder! + 1) % 4;
  return drawForPlayer(state, next, false);
}

function drawForPlayer(state: GameState, playerId: number, afterKong: boolean): GameState {
  let s = cloneState(state);
  if (s.wall.length === 0) {
    s.phase = 'ended';
    s.message = '流局';
    s.winInfo = null;
    return s;
  }

  const p = s.players[playerId];
  s.currentPlayer = playerId;

  const flowersBefore = p.flowers.length;
  const drawn = drawNonFlower(s, p);

  if (!drawn) {
    s.phase = 'ended';
    s.message = '流局';
    return s;
  }

  p.hand.push(drawn);
  p.hand = sortTiles(p.hand);
  s.drawnTile = drawn;
  s.phase = 'discard';
  const flowered = p.flowers.length > flowersBefore;
  s.message = afterKong
    ? `${p.name}槓後補牌，請出牌`
    : flowered
      ? `${p.name}補花後摸牌，請出牌`
      : `${p.name}摸牌，請出牌`;
  s = refreshSelfActions(s);
  return s;
}

/** 自摸／暗槓／加槓（自己回合） */
export function selfAction(state: GameState, option: ClaimOption): GameState {
  if (state.phase !== 'discard') return state;
  const s = cloneState(state);
  const p = s.players[s.currentPlayer];

  if (option.kind === 'win' && s.drawnTile) {
    const info = evaluateWin(
      {
        player: { ...p, hand: p.hand.filter((t) => t.id !== s.drawnTile!.id) },
        winningTile: s.drawnTile,
        isSelfDraw: true,
        prevailingWind: s.prevailingWind,
      },
      s.config.minFan,
    );
    s.phase = 'ended';
    if (info) {
      return applySettlement(s, info);
    }
    s.winInfo = null;
    s.message = '番數不足，無法自摸';
    return s;
  }

  if (option.kind === 'kong' && option.tiles) {
    const tiles = option.tiles;
    const isConcealed = tiles.every((t) => p.hand.some((h) => h.id === t.id));
    if (isConcealed && tiles.length === 4) {
      for (const t of tiles) {
        const i = p.hand.findIndex((h) => h.id === t.id);
        if (i >= 0) p.hand.splice(i, 1);
      }
      p.melds.push({ kind: 'concealedKong', tiles, from: null });
    } else {
      // 加槓
      const match = tiles[0];
      const hi = p.hand.findIndex((h) => sameTile(h, match));
      if (hi >= 0) p.hand.splice(hi, 1);
      const mi = p.melds.findIndex(
        (m) => m.kind === 'pong' && sameTile(m.tiles[0], match),
      );
      if (mi >= 0) {
        p.melds[mi] = {
          kind: 'kong',
          tiles: [...p.melds[mi].tiles, p.melds[mi].tiles[0]],
          from: p.melds[mi].from,
        };
      }
    }
    p.hand = sortTiles(p.hand);
    s.message = `${p.name}槓！`;
    return drawForPlayer(s, s.currentPlayer, true);
  }

  return s;
}

export function passAllClaims(state: GameState): GameState {
  if (state.phase !== 'claim') return state;
  const s = cloneState(state);
  for (const id of Object.keys(s.claimOptions)) {
    s.pendingClaims[Number(id)] = { kind: 'pass' };
  }
  return resolveClaims(s);
}

/** 供 AI／UI 讀取的精簡視圖 */
export function getLegalDiscards(state: GameState, playerId: number): Tile[] {
  if (state.phase !== 'discard' || state.currentPlayer !== playerId) return [];
  return [...state.players[playerId].hand];
}

