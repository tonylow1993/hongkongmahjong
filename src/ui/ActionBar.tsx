import type { ClaimOption } from '../game/types';
import { tileLabel } from '../game/tiles';

interface Props {
  selfOptions: ClaimOption[];
  claimOptions: ClaimOption[] | null;
  phase: string;
  canDiscard: boolean;
  selectedId: string | null;
  onDiscard: () => void;
  onSelfAction: (opt: ClaimOption) => void;
  onClaim: (opt: ClaimOption) => void;
  message: string;
  aiThinking: boolean;
}

const KIND_LABEL: Record<string, string> = {
  win: '糊',
  kong: '槓',
  pong: '碰',
  chow: '吃',
  pass: '過',
};

export function ActionBar({
  selfOptions,
  claimOptions,
  phase,
  canDiscard,
  selectedId,
  onDiscard,
  onSelfAction,
  onClaim,
  message,
  aiThinking,
}: Props) {
  return (
    <div className="action-bar">
      <p className="action-bar__msg">
        {aiThinking ? '電腦思考中……' : message}
      </p>

      <div className="action-bar__btns">
        {phase === 'discard' && canDiscard && (
          <>
            {selfOptions.map((opt, i) => (
              <button
                key={i}
                type="button"
                className={`btn btn--accent ${opt.kind === 'win' ? 'btn--win' : ''}`}
                onClick={() => onSelfAction(opt)}
              >
                {KIND_LABEL[opt.kind]}
                {opt.fan != null ? `（${opt.fan}番）` : ''}
              </button>
            ))}
            <button
              type="button"
              className="btn btn--primary"
              disabled={!selectedId}
              onClick={onDiscard}
            >
              出牌
            </button>
          </>
        )}

        {phase === 'claim' && claimOptions && (
          <>
            {claimOptions.map((opt, i) => (
              <button
                key={i}
                type="button"
                className={`btn ${opt.kind === 'win' ? 'btn--win' : opt.kind === 'pass' ? 'btn--ghost' : 'btn--accent'}`}
                onClick={() => onClaim(opt)}
                title={opt.tiles?.map(tileLabel).join(' ')}
              >
                {KIND_LABEL[opt.kind]}
                {opt.fan != null ? `（${opt.fan}番）` : ''}
                {opt.kind === 'chow' && opt.tiles
                  ? ` ${opt.tiles.map(tileLabel).join('')}`
                  : ''}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
