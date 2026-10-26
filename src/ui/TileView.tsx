import type { Tile } from '../game/types';
import { tileLabel } from '../game/tiles';

export type TileOrient = 'horiz' | 'vert-left' | 'vert-right' | 'flip';

interface Props {
  tile: Tile;
  selected?: boolean;
  highlight?: boolean;
  faceDown?: boolean;
  small?: boolean;
  tiny?: boolean;
  /** 對家／上家／下家手牌尺寸 */
  opp?: boolean;
  /** 上／下家直立背牌（不旋轉） */
  stand?: boolean;
  /** 河牌 */
  river?: boolean;
  /** 副露（橫放） */
  meld?: boolean;
  orient?: TileOrient;
  disabled?: boolean;
  onClick?: () => void;
  lift?: boolean;
}

export function TileView({
  tile,
  selected,
  highlight,
  faceDown,
  small,
  tiny,
  opp,
  stand,
  river,
  meld,
  orient = 'horiz',
  disabled,
  onClick,
  lift,
}: Props) {
  const label = tileLabel(tile);
  const colorClass = tileColor(tile);

  const sizeClass = tiny
    ? 'mj-tile--tiny'
    : river
      ? 'mj-tile--river'
      : meld
        ? 'mj-tile--meld'
        : small
          ? 'mj-tile--small'
          : stand
            ? 'mj-tile--stand'
            : opp
              ? 'mj-tile--opp'
              : '';

  if (faceDown) {
    return (
      <div
        className={`mj-tile mj-tile--back ${sizeClass} mj-tile--${orient}`}
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      className={[
        'mj-tile',
        colorClass,
        sizeClass,
        `mj-tile--${orient}`,
        selected ? 'mj-tile--selected' : '',
        highlight ? 'mj-tile--highlight' : '',
        lift ? 'mj-tile--lift' : '',
        disabled ? 'mj-tile--disabled' : '',
        onClick ? 'mj-tile--clickable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={disabled ? undefined : onClick}
      disabled={disabled || !onClick}
      aria-label={label}
    >
      <span className="mj-tile__label">{label}</span>
    </button>
  );
}

function tileColor(tile: Tile): string {
  if (tile.suit === 'dragon') {
    if (tile.value === 1) return 'mj-tile--red'; // 中
    if (tile.value === 2) return 'mj-tile--green'; // 發
    return 'mj-tile--blue'; // 白
  }
  if (tile.suit === 'wind') return 'mj-tile--wind';
  if (tile.suit === 'flower') return 'mj-tile--flower';
  if (tile.suit === 'man') return 'mj-tile--man';
  if (tile.suit === 'sou') return 'mj-tile--sou';
  return 'mj-tile--pin';
}
