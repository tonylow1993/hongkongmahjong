import type { GameState } from '../src/game/types';

export interface RoomPlayer {
  socketId: string;
  token?: string;
  name: string;
  seat: number; // 0, 1, 2, 3
  isHost: boolean;
  isAI: boolean;
  connected: boolean;
}

export interface RoomState {
  roomId: string;
  players: (RoomPlayer | null)[];
  gameStarted: boolean;
  gameState: GameState | null;
}

// Server -> Client events
export interface ServerToClientEvents {
  roomState: (data: {
    room: RoomState;
    yourSeat: number | null;
    isHost: boolean;
  }) => void;
  gameStateUpdate: (state: GameState) => void;
  chatMessage: (msg: { from: string; text: string; time: string }) => void;
  error: (msg: string) => void;
}

// Client -> Server events
export interface ClientToServerEvents {
  identify: (data: { token: string }) => void;
  join: (data: { name: string; token?: string }) => void;
  startGame: () => void;
  nextRound: () => void;
  restartGame: () => void;
  discard: (tileId: string) => void;
  claim: (option: any) => void;
  selfAction: (option: any) => void;
}

