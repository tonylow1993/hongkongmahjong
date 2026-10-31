import type { WinInfo } from './types';

export interface SettlementLine {
  playerId: number;
  delta: number;
  note: string;
}

export interface SettlementResult {
  tier: string;
  /** 辣數（以三番起糊 1 辣為基點） */
  baseLa: number;
  /** 基本點數（以 3番=8分 為基點） */
  basePoints: number;
  lines: SettlementLine[];
  /** 各家淨加減點數（含莊家加倍） */
  deltas: number[];
}

/**
 * 香港麻雀正宗「半辣上」標準計分規律：
 * - 0–2 番：未滿三番不得起糊（0 分 / 0 辣）
 * - 3 番：8 分（1 辣）
 * - 4 番：16 分（2 辣 · 比3番翻倍）
 * - 5 番：24 分（3 辣 · 半辣上遞增）
 * - 6 番：32 分（4 辣 · 比4番翻倍）
 * - 7 番：48 分（6 辣 · 半辣上遞增）
 * - 8 番：64 分（8 辣 · 例牌滿胡）
 * - 9 番：96 分（12 辣 · 半辣上遞增）
 * - 10 番：128 分（16 辣 · 頂閘爆棚）
 * - 13 番：256 分（32 辣 · 十三么等例牌極品）
 *
 * 結算規則（出銃全付，自摸三家半付，各家平等）：
 * - 出銃：放銃者一人全付底分（如 6 番付 32 分），贏家實收底分（+32 分），其餘兩家 0 分。
 * - 自摸：其餘三家各付底分之半數（底分 / 2，如 6 番各付 16 分），贏家實收底分 × 1.5（如 6 番實收 48 分 = 16 × 3）。
 */
export function fanToHalfLa(fan: number): { basePoints: number; baseLa: number; label: string } {
  if (fan < 3) return { basePoints: 0, baseLa: 0, label: '不足三番' };
  switch (fan) {
    case 3:
      return { basePoints: 8, baseLa: 1, label: '3番（8分 · 1辣）' };
    case 4:
      return { basePoints: 16, baseLa: 2, label: '4番（16分 · 2辣）' };
    case 5:
      return { basePoints: 24, baseLa: 3, label: '5番（24分 · 3辣）' };
    case 6:
      return { basePoints: 32, baseLa: 4, label: '6番（32分 · 4辣）' };
    case 7:
      return { basePoints: 48, baseLa: 6, label: '7番（48分 · 6辣）' };
    case 8:
      return { basePoints: 64, baseLa: 8, label: '8番（64分 · 8辣 · 滿胡）' };
    case 9:
      return { basePoints: 96, baseLa: 12, label: '9番（96分 · 12辣）' };
    case 10:
    case 11:
    case 12:
      return { basePoints: 128, baseLa: 16, label: `${fan}番（128分 · 16辣 · 頂閘）` };
    default:
      // 13番及以上
      return { basePoints: 256, baseLa: 32, label: `${fan}番（256分 · 32辣 · 例牌）` };
  }
}

export function fanToTier(fan: number): { tier: string; baseLa: number; basePoints: number } {
  const { basePoints, baseLa, label } = fanToHalfLa(fan);
  return { tier: label, baseLa, basePoints };
}

export function settleErWuBan(
  win: WinInfo,
  _dealer: number,
): SettlementResult {
  const { basePoints, baseLa, label } = fanToHalfLa(win.fan);
  const deltas = [0, 0, 0, 0];
  const lines: SettlementLine[] = [];

  if (win.isSelfDraw) {
    // 自摸：其餘三家各扣 basePoints / 2，贏家實收 basePoints * 1.5
    const payEach = basePoints / 2;
    for (let i = 0; i < 4; i++) {
      if (i === win.winner) continue;
      deltas[i] -= payEach;
      deltas[win.winner] += payEach;
      lines.push({
        playerId: i,
        delta: -payEach,
        note: `自摸付 ${payEach}分（${baseLa * 0.5}辣）`,
      });
    }
  } else {
    // 出銃：放銃者一人全付 basePoints，贏家實收 basePoints
    const loser = win.loser!;
    deltas[loser] -= basePoints;
    deltas[win.winner] += basePoints;
    lines.push({
      playerId: loser,
      delta: -basePoints,
      note: `出銃付 ${basePoints}分（${baseLa}辣）`,
    });
  }

  return { tier: label, baseLa, basePoints, lines, deltas };
}

export function formatLa(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}
