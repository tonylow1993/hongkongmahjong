import type { ClaimOption, GameState, Tile } from '../game/types';
import { tableSnapshot } from '../ui/coachSnapshot';

const ROOT = 'http://127.0.0.1:8765';

export type ModelKind = 'discard' | 'pass' | 'chow' | 'pong' | 'kong' | 'win';

export interface ModelAct {
  kind: ModelKind;
  suit?: string;
  value?: number;
}

export async function modelReady(): Promise<boolean> {
  try {
    const res = await fetch(`${ROOT}/status`);
    if (!res.ok) return false;
    const body = (await res.json()) as { ready?: boolean };
    return body.ready === true;
  } catch {
    return false;
  }
}

export async function askModel(state: GameState, seat: number, level?: string): Promise<ModelAct> {
  const snap = tableSnapshot(state, seat);
  if (level) {
    (snap as Record<string, unknown>).level = level;
  }
  const res = await fetch(`${ROOT}/act`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snap),
  });
  if (!res.ok) throw new Error('trained-model');
  return (await res.json()) as ModelAct;
}

export function tileFromAct(legal: Tile[], act: ModelAct): Tile {
  const hit = legal.find((t) => t.suit === act.suit && t.value === act.value);
  return hit ?? legal[0];
}

export function claimFromAct(
  options: ClaimOption[],
  act: ModelAct,
  called: Tile | null,
): ClaimOption {
  if (act.kind === 'chow') {
    const chows = options.filter((opt) => opt.kind === 'chow');
    if (chows.length > 0) return bestChow(chows, called);
  }
  return (
    options.find((opt) => opt.kind === act.kind) ??
    options.find((opt) => opt.kind === 'pass') ??
    options[0]
  );
}

export function selfFromAct(options: ClaimOption[], act: ModelAct): ClaimOption | null {
  if (act.kind !== 'win' && act.kind !== 'kong') return null;
  return options.find((opt) => opt.kind === act.kind) ?? null;
}

function bestChow(chows: ClaimOption[], called: Tile | null): ClaimOption {
  if (!called || chows.length === 1) return chows[0];
  const score = (opt: ClaimOption) => {
    const vals = (opt.tiles ?? []).map((t) => t.value).sort((a, b) => a - b);
    const middle = vals[1] === called.value ? 3 : 0;
    const edge = vals[0] === 1 || vals[2] === 9 ? -1 : 0;
    return middle + edge;
  };
  return [...chows].sort((a, b) => score(b) - score(a))[0];
}
