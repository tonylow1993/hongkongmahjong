import { useEffect, useState } from 'react';
import type { GameState } from '../game/types';
import { coachSnapshot } from './coachSnapshot';

const ADVISE_URL = 'http://127.0.0.1:8765/advise';

interface Advice {
  recommended_action: string;
  confidence: number;
  expected_value: string;
  alternative_moves: { action: string; reason: string }[];
  reason_zh_hk: string;
  latency_ms?: number | null;
}

interface Props {
  open: boolean;
  state: GameState;
  canAsk: boolean;
}

export function CoachOverlay({ open, state, canAsk }: Props) {
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !canAsk) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(ADVISE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coachSnapshot(state)),
        signal: ctrl.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json() as Promise<Advice>;
        })
        .then((body) => {
          setAdvice(body);
          setError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError('教練未啟動。在專案目錄執行 python ai_assistant/serve.py');
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, canAsk, state]);

  if (!open) return null;

  return (
    <aside className="coach">
      <h2>AI 戰術教練</h2>
      {!canAsk && <p className="coach__wait">輪到你出牌或叫牌時會給建議。</p>}
      {error && <p className="coach__err">{error}</p>}
      {advice && canAsk && (
        <>
          <p className="coach__action">{advice.recommended_action}</p>
          <p className="coach__meta">
            信心 {Math.round(advice.confidence * 100)}% · 期望 {advice.expected_value}
            {advice.latency_ms != null ? ` · ${advice.latency_ms} ms` : ''}
          </p>
          {advice.alternative_moves[0] && (
            <p className="coach__alt">
              次選 {advice.alternative_moves[0].action}：{advice.alternative_moves[0].reason}
            </p>
          )}
          <p className="coach__reason">{advice.reason_zh_hk}</p>
        </>
      )}
    </aside>
  );
}
