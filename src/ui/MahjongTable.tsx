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
  mySeat?: number; // 預設為 0
}

export function MahjongTable({
  state,
  selectedId,
  onSelectTile,
  canInteract,
  mySeat = 0,
}: Props) {
  const isEnded = state.phase === 'ended';
  const humanTurn = state.phase === 'discard' && state.currentPlayer === mySeat;
  const humanDrawn = humanTurn && state.drawnTile ? state.drawnTile : null;

  // 視角旋轉：以 mySeat 為 bottom (主視角 0 度)，其餘依序為 right (+1), top (+2), left (+3)
  const bottomSeat = mySeat;
  const rightSeat = (mySeat + 1) % 4;
  const topSeat = (mySeat + 2) % 4;
  const leftSeat = (mySeat + 3) % 4;

  return (
    <div className="mj-table">
      {/* 副露與花牌區域（以 mySeat 為主視角旋轉：0=下自己, 1=右下家, 2=上對家, 3=左上家） */}
      <ExposedCorner player={state.players[bottomSeat]} seat={0} />
      <ExposedCorner player={state.players[rightSeat]} seat={1} />
      <ExposedCorner player={state.players[topSeat]} seat={2} />
      <ExposedCorner player={state.players[leftSeat]} seat={3} />

      <div className="mj-table__top">
        <PlayerHud
          player={state.players[topSeat]}
          side="top"
          isDealer={state.dealer === topSeat}
          isCurrent={state.currentPlayer === topSeat}
        />
        <SeatRail player={state.players[topSeat]} side="top" showHand={isEnded} />
      </div>

      <div className="mj-table__mid">
        <div className="mj-table__wing mj-table__wing--left">
          <PlayerHud
            player={state.players[leftSeat]}
            side="left"
            isDealer={state.dealer === leftSeat}
            isCurrent={state.currentPlayer === leftSeat}
          />
          <SeatRail player={state.players[leftSeat]} side="left" showHand={isEnded} />
        </div>

        <TableCenter state={state} mySeat={mySeat} />

        <div className="mj-table__wing mj-table__wing--right">
          <PlayerHud
            player={state.players[rightSeat]}
            side="right"
            isDealer={state.dealer === rightSeat}
            isCurrent={state.currentPlayer === rightSeat}
          />
          <SeatRail player={state.players[rightSeat]} side="right" showHand={isEnded} />
        </div>
      </div>

      <div className="mj-table__bottom">
        <PlayerHud
          player={state.players[bottomSeat]}
          side="bottom"
          isDealer={state.dealer === bottomSeat}
          isCurrent={state.currentPlayer === bottomSeat}
        />
        <SeatRail
          player={state.players[bottomSeat]}
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
