import type { GameState } from '../game/types';
import { ExposedCorner } from './ExposedCorner';
import { PlayerHud } from './PlayerHud';
import { SeatRail } from './SeatRail';
import { TableCenter } from './TableCenter';

interface Props {
  state: GameState;
  selectedId: string | null;
  onSelectTile: (id: string) => void;
  canInteract: boolean;
}

export function MahjongTable({
  state,
  selectedId,
  onSelectTile,
  canInteract,
}: Props) {
  const isEnded = state.phase === 'ended';
  const humanTurn = state.phase === 'discard' && state.currentPlayer === 0;
  const humanDrawn = humanTurn && state.drawnTile ? state.drawnTile : null;

  return (
    <div className="mj-table">
      {([0, 1, 2, 3] as const).map((id) => (
        <ExposedCorner key={id} player={state.players[id]} seat={id} />
      ))}

      <div className="mj-table__top">
        <PlayerHud
          player={state.players[2]}
          side="top"
          isDealer={state.dealer === 2}
          isCurrent={state.currentPlayer === 2}
        />
        <SeatRail player={state.players[2]} side="top" showHand={isEnded} />
      </div>

      <div className="mj-table__mid">
        <div className="mj-table__wing mj-table__wing--left">
          <PlayerHud
            player={state.players[3]}
            side="left"
            isDealer={state.dealer === 3}
            isCurrent={state.currentPlayer === 3}
          />
          <SeatRail player={state.players[3]} side="left" showHand={isEnded} />
        </div>

        <TableCenter state={state} />

        <div className="mj-table__wing mj-table__wing--right">
          <PlayerHud
            player={state.players[1]}
            side="right"
            isDealer={state.dealer === 1}
            isCurrent={state.currentPlayer === 1}
          />
          <SeatRail player={state.players[1]} side="right" showHand={isEnded} />
        </div>
      </div>

      <div className="mj-table__bottom">
        <PlayerHud
          player={state.players[0]}
          side="bottom"
          isDealer={state.dealer === 0}
          isCurrent={state.currentPlayer === 0}
        />
        <SeatRail
          player={state.players[0]}
          side="bottom"
          showHand={true}
          drawnTile={humanDrawn}
          selectedId={selectedId}
          onSelectTile={onSelectTile}
          canInteract={canInteract}
        />
      </div>
    </div>
  );
}
