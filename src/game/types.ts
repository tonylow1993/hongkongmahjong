/** 香港麻雀核心型別 */

export type Suit = 'man' | 'pin' | 'sou' | 'wind' | 'dragon' | 'flower';

/** 風向：0=東 1=南 2=西 3=北 */
export type Wind = 0 | 1 | 2 | 3;

export interface Tile {
  id: string;
  suit: Suit;
  value: number;
}

export type MeldKind = 'chow' | 'pong' | 'kong' | 'concealedKong';

export interface Meld {
  kind: MeldKind;
  tiles: Tile[];
  /** 從誰家叫牌（自摸／暗槓為 null） */
  from: number | null;
}

export interface PlayerState {
  id: number;
  name: string;
  isHuman: boolean;
  seatWind: Wind;
  hand: Tile[];
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  /** 是否已聽牌（顯示用） */
  isReady: boolean;
  /** 累計辣數（二五半） */
  score: number;
}

export type ClaimKind = 'chow' | 'pong' | 'kong' | 'win' | 'pass';

export interface ClaimOption {
  kind: ClaimKind;
  /** 吃牌時指定三張 */
  tiles?: Tile[];
  /** 預計番數（糊牌時） */
  fan?: number;
  fanDetails?: FanDetail[];
}

export interface FanDetail {
  name: string;
  fan: number;
}

export type Phase =
  | 'idle'
  | 'dealing'
  | 'draw'
  | 'discard'
  | 'claim'
  | 'replaceFlower'
  | 'ended';

export interface WinInfo {
  winner: number;
  loser: number | null; // null = 自摸
  fan: number;
  details: FanDetail[];
  winningTile: Tile;
  isSelfDraw: boolean;
  /** 檔位或稱謂 */
  tier?: string;
  baseLa?: number;
  basePoints?: number;
  /** 本局各家加減分數（點數） */
  scoreDeltas?: number[];
  settlementNotes?: string[];
}

export interface GameConfig {
  /** 三番起糊 */
  minFan: number;
  playerCount: 4;
  includeFlowers: boolean;
}

export interface GameState {
  config: GameConfig;
  wall: Tile[];
  players: PlayerState[];
  dealer: number;
  currentPlayer: number;
  prevailingWind: Wind;
  /** 本圈第幾位莊（1–4），連莊不增加 */
  roundWindCount: number;
  /** 連莊次數（顯示用） */
  dealerStreak: number;
  phase: Phase;
  lastDiscard: Tile | null;
  lastDiscarder: number | null;
  claimOptions: Record<number, ClaimOption[]>;
  pendingClaims: Partial<Record<number, ClaimOption>>;
  winInfo: WinInfo | null;
  message: string;
  turn: number;
  /** 可槓／可糊的自摸狀態 */
  drawnTile: Tile | null;
}

export const WIND_LABELS = ['東', '南', '西', '北'] as const;
export const DRAGON_LABELS = ['中', '發', '白'] as const;
export const FLOWER_LABELS = ['春', '夏', '秋', '冬', '梅', '蘭', '菊', '竹'] as const;

/** 開台每家底分（1000分） */
export const INITIAL_TABLE_SCORE = 1000;

export const DEFAULT_CONFIG: GameConfig = {
  minFan: 3,
  playerCount: 4,
  includeFlowers: true,
};
