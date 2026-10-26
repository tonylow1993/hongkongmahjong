import type { WinInfo } from './types';

/** 二五半三檔 */
export type LaTier = '二' | '五' | '半';

export interface SettlementLine {
  playerId: number;
  delta: number;
  note: string;
}

export interface SettlementResult {
  tier: LaTier;
  /** 檔位對應辣數：二=2、五=5、半=10 */
  baseLa: number;
  lines: SettlementLine[];
  /** 各家淨加減（含莊加倍後） */
  deltas: number[];
}

/**
 * 香港常見「二五半」計辣：
 * - 3番 → 二（2辣）
 * - 4–6番 → 五（5辣）
 * - 7番及以上 → 半（10辣）
 *
 * 莊家相關輸贏 ×2；出銃由放銃者付，自摸其餘三家各付。
 */
export function fanToTier(fan: number): { tier: LaTier; baseLa: number } {
  if (fan >= 7) return { tier: '半', baseLa: 10 };
  if (fan >= 4) return { tier: '五', baseLa: 5 };
  return { tier: '二', baseLa: 2 };
}

export function settleErWuBan(
  win: WinInfo,
  dealer: number,
): SettlementResult {
  const { tier, baseLa } = fanToTier(win.fan);
  const deltas = [0, 0, 0, 0];
  const lines: SettlementLine[] = [];

  if (win.isSelfDraw) {
    for (let i = 0; i < 4; i++) {
      if (i === win.winner) continue;
      const mult = win.winner === dealer || i === dealer ? 2 : 1;
      const pay = baseLa * mult;
      deltas[i] -= pay;
      deltas[win.winner] += pay;
      const parts = [`${tier}（${baseLa}辣）`];
      if (mult === 2) parts.push('莊×2');
      lines.push({
        playerId: i,
        delta: -pay,
        note: `自摸付${parts.join(' ')}`,
      });
    }
  } else {
    const loser = win.loser!;
    const mult = win.winner === dealer || loser === dealer ? 2 : 1;
    const pay = baseLa * mult;
    deltas[loser] -= pay;
    deltas[win.winner] += pay;
    const parts = [`${tier}（${baseLa}辣）`];
    if (mult === 2) parts.push('莊×2');
    lines.push({
      playerId: loser,
      delta: -pay,
      note: `出銃付${parts.join(' ')}`,
    });
  }

  return { tier, baseLa, lines, deltas };
}

export function formatLa(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}
