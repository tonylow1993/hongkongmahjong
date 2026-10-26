import type { Tile } from '../game/types';
import { tileLabel } from '../game/tiles';
import { TileFace } from './TileFace';

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
      <TileFace suit={tile.suit} value={tile.value} />
    </button>
  );
}
