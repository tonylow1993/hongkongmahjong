import type { ClaimOption, Tile } from '../game/types';
import { tileLabel } from '../game/tiles';
import { TileFace } from './TileFace';

interface Props {
  selfOptions: ClaimOption[];
  claimOptions: ClaimOption[] | null;
  phase: string;
  canDiscard: boolean;
  selectedId: string | null;
  onDiscard: () => void;
  onSelfAction: (opt: ClaimOption) => void;
  onClaim: (opt: ClaimOption) => void;
  onHoverOption?: (opt: ClaimOption | null) => void;
  message: string;
  aiThinking: boolean;
}

const ACTION_CONFIG: Record<string, { label: string; icon: string }> = {
  win: { label: '食糊', icon: '🏆' },
  kong: { label: '槓', icon: '💥' },
  pong: { label: '碰', icon: '👥' },
  chow: { label: '吃', icon: '🥢' },
  pass: { label: '過', icon: '⏭️' },
};

/**
 * 吃碰槓動作候選牌：正向顯示的迷你牌面
 */
function ActionTileMini({ tile }: { tile: Tile }) {
  return (
    <span className="action-tile-mini" title={tileLabel(tile)}>
      <span className="action-tile-mini__inner">
        <TileFace suit={tile.suit} value={tile.value} />
      </span>
    </span>
  );
}

export function ActionBar({
  selfOptions,
  claimOptions,
  phase,
  canDiscard,
  selectedId,
  onDiscard,
  onSelfAction,
  onClaim,
  onHoverOption,
  message,
  aiThinking,
}: Props) {
  return (
    <div className="action-bar">
      <p className="action-bar__msg">
        {aiThinking ? '電腦思考中……' : message}
      </p>

      <div className="action-bar__btns">
        {/* 自摸、暗槓 / 加槓 及 出牌按鈕 */}
        {phase === 'discard' && canDiscard && (
          <>
            {selfOptions.map((opt, i) => {
              const isWin = opt.kind === 'win';
              const isKong = opt.kind === 'kong';
              const icon = isWin ? '👑' : isKong ? '⚡' : '💥';
              const label = isWin ? '自摸' : isKong ? '暗槓' : '加槓';

              return (
                <button
                  key={i}
                  type="button"
                  className={`btn btn--accent ${isWin ? 'btn--win' : ''} action-btn`}
                  onClick={() => onSelfAction(opt)}
                  onMouseEnter={() => onHoverOption?.(opt)}
                  onMouseLeave={() => onHoverOption?.(null)}
                >
                  <span className="action-btn__icon">{icon}</span>
                  <span className="action-btn__label">{label}</span>
                  {opt.fan != null && <span className="action-btn__fan">（{opt.fan}番）</span>}
                  {opt.tiles && opt.tiles.length > 0 && (
                    <span className="action-btn__tiles" aria-label="吃碰槓牌組">
                      {opt.tiles.map((t, tidx) => (
                        <ActionTileMini key={t.id + tidx} tile={t} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              className="btn btn--primary action-btn"
              disabled={!selectedId}
              onClick={onDiscard}
            >
              <span className="action-btn__icon">📤</span>
              <span className="action-btn__label">出牌</span>
            </button>
          </>
        )}

        {/* 叫牌階段：吃、碰、槓、糊、過 */}
        {phase === 'claim' && claimOptions && (
          <>
            {claimOptions.map((opt, i) => {
              const cfg = ACTION_CONFIG[opt.kind] ?? { label: opt.kind, icon: '🀄' };
              const isWin = opt.kind === 'win';
              const isPass = opt.kind === 'pass';

              return (
                <button
                  key={i}
                  type="button"
                  className={`btn ${
                    isWin ? 'btn--win' : isPass ? 'btn--ghost' : 'btn--accent'
                  } action-btn`}
                  onClick={() => onClaim(opt)}
                  onMouseEnter={() => onHoverOption?.(opt)}
                  onMouseLeave={() => onHoverOption?.(null)}
                  title={opt.tiles?.map(tileLabel).join(' ')}
                >
                  <span className="action-btn__icon">{cfg.icon}</span>
                  <span className="action-btn__label">{cfg.label}</span>
                  {opt.fan != null && <span className="action-btn__fan">（{opt.fan}番）</span>}

                  {/* 吃碰槓候選牌 打橫顯示 */}
                  {opt.tiles && opt.tiles.length > 0 && (
                    <span className="action-btn__tiles" aria-label="吃碰槓候選牌">
                      {opt.tiles.map((t, tidx) => (
                        <ActionTileMini key={t.id + tidx} tile={t} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
