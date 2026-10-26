import type { PlayerState } from '../game/types';
import { WIND_LABELS } from '../game/types';

interface Props {
  player: PlayerState;
  side: 'top' | 'bottom' | 'left' | 'right';
  isDealer: boolean;
  isCurrent: boolean;
}

export function PlayerHud({ player, side, isDealer, isCurrent }: Props) {
  return (
    <div
      className={[
        'phud',
        `phud--${side}`,
        isCurrent ? 'phud--turn' : '',
        isDealer ? 'phud--dealer' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="phud__avatar" aria-hidden>
        {player.isHuman ? '你' : player.name.charAt(0)}
      </div>
      <div className="phud__info">
        <span className="phud__name">
          {player.name}
          {isDealer && <em>莊</em>}
        </span>
        <span className="phud__meta">
          <span className="phud__wind">{WIND_LABELS[player.seatWind]}</span>
          <span className="phud__coin" aria-hidden>🪙</span>
          <span className="phud__score">{player.score}</span>
        </span>
      </div>
      {isCurrent && <span className="phud__arrow" aria-label="出牌中">▶</span>}
    </div>
  );
}
