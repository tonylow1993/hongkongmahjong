import type { PlayerState, Tile } from '../game/types';
import { TileView } from './TileView';
import type { SeatSide } from './types';

interface Props {
  player: PlayerState;
  side: SeatSide;
  showHand: boolean;
  drawnTile?: Tile | null;
  selectedId?: string | null;
  onSelectTile?: (id: string) => void;
  canInteract?: boolean;
}

export function SeatRail({
  player,
  side,
  showHand,
  drawnTile,
  selectedId,
  onSelectTile,
  canInteract,
}: Props) {
  const handTiles =
    showHand && drawnTile
      ? player.hand.filter((t) => t.id !== drawnTile.id)
      : player.hand;

  const drawnInHand =
    showHand && drawnTile && player.hand.some((t) => t.id === drawnTile.id);

  return (
    <div className={`seat seat--${side}`}>
      <div className={`seat__hand seat__hand--${side}`}>
        {showHand ? (
          <>
            {handTiles.map((t) => (
              <TileView
                key={t.id}
                tile={t}
                selected={selectedId === t.id}
                lift={selectedId === t.id}
                onClick={canInteract ? () => onSelectTile?.(t.id) : undefined}
              />
            ))}
            {drawnInHand && drawnTile && (
              <>
                <div className="seat__drawn-gap" aria-hidden />
                <TileView
                  key={drawnTile.id}
                  tile={drawnTile}
                  selected={selectedId === drawnTile.id}
                  lift={selectedId === drawnTile.id}
                  onClick={canInteract ? () => onSelectTile?.(drawnTile.id) : undefined}
                />
              </>
            )}
          </>
        ) : (
          player.hand.map((t) => (
            <TileView key={t.id} tile={t} faceDown opp />
          ))
        )}
      </div>
    </div>
  );
}
