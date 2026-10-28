import type { Suit, Tile, Wind } from './types';
import { DRAGON_LABELS, FLOWER_LABELS, WIND_LABELS } from './types';

let tileSeq = 0;

export function createTile(suit: Suit, value: number): Tile {
  tileSeq += 1;
  return { id: `${suit}-${value}-${tileSeq}`, suit, value };
}

export function resetTileSeq(): void {
  tileSeq = 0;
}

/** 建立完整 144 張牌牆（含花牌） */
export function createWall(includeFlowers = true): Tile[] {
  resetTileSeq();
  const wall: Tile[] = [];

  for (const suit of ['man', 'pin', 'sou'] as Suit[]) {
    for (let v = 1; v <= 9; v++) {
      for (let c = 0; c < 4; c++) wall.push(createTile(suit, v));
    }
  }
  for (let v = 1; v <= 4; v++) {
    for (let c = 0; c < 4; c++) wall.push(createTile('wind', v));
  }
  for (let v = 1; v <= 3; v++) {
    for (let c = 0; c < 4; c++) wall.push(createTile('dragon', v));
  }
  if (includeFlowers) {
    for (let v = 1; v <= 8; v++) wall.push(createTile('flower', v));
  }
  return wall;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isFlower(t: Tile): boolean {
  return t.suit === 'flower';
}

/** 正花：春／梅＝東，夏／蘭＝南，秋／菊＝西，冬／竹＝北 */
export function isSeatFlower(tile: Tile, seatWind: Wind): boolean {
  if (!isFlower(tile)) return false;
  return (tile.value - 1) % 4 === seatWind;
}

export function isHonor(t: Tile): boolean {
  return t.suit === 'wind' || t.suit === 'dragon';
}

export function isSuited(t: Tile): boolean {
  return t.suit === 'man' || t.suit === 'pin' || t.suit === 'sou';
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value;
}

export function tileKey(t: Tile): string {
  return `${t.suit}-${t.value}`;
}

export function tileLabel(t: Tile): string {
  switch (t.suit) {
    case 'man':
      return `${'一二三四五六七八九'[t.value - 1]}萬`;
    case 'pin':
      return `${'一二三四五六七八九'[t.value - 1]}筒`;
    case 'sou':
      return `${'一二三四五六七八九'[t.value - 1]}索`;
    case 'wind':
      return WIND_LABELS[t.value - 1];
    case 'dragon':
      return DRAGON_LABELS[t.value - 1];
    case 'flower':
      return FLOWER_LABELS[t.value - 1];
    default:
      return '?';
  }
}

/** 排序鍵：花 → 萬筒索 → 風 → 龍 */
export function sortTiles(tiles: Tile[]): Tile[] {
  const suitOrder: Record<Suit, number> = {
    man: 0,
    pin: 1,
    sou: 2,
    wind: 3,
    dragon: 4,
    flower: 5,
  };
  return [...tiles].sort((a, b) => {
    const s = suitOrder[a.suit] - suitOrder[b.suit];
    if (s !== 0) return s;
    return a.value - b.value;
  });
}

export function countByKey(tiles: Tile[]): Map<string, Tile[]> {
  const m = new Map<string, Tile[]>();
  for (const t of tiles) {
    const k = tileKey(t);
    const list = m.get(k) ?? [];
    list.push(t);
    m.set(k, list);
  }
  return m;
}
