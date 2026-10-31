import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomState, ServerToClientEvents } from '../../server/types';
import type { ClaimOption, GameState } from '../game/types';

function getPlayerToken(): string {
  if (typeof window === 'undefined') return '';
  let token = localStorage.getItem('hk_player_token');
  if (!token) {
    token =
      'tok_' +
      Math.random().toString(36).substring(2) +
      Date.now().toString(36);
    localStorage.setItem('hk_player_token', token);
  }
  return token;
}

class OnlineClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private roomStateListeners: ((data: { room: RoomState; yourSeat: number | null; isHost: boolean }) => void)[] = [];
  private gameStateListeners: ((state: GameState) => void)[] = [];
  private errorListeners: ((msg: string) => void)[] = [];

  connect(url?: string) {
    if (this.socket) return;
    const serverUrl = url || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
    this.socket = io(serverUrl, { transports: ['websocket', 'polling'] });

    this.socket.on('connect', () => {
      const token = getPlayerToken();
      if (token) {
        this.socket?.emit('identify', { token });
      }
    });

    this.socket.on('roomState', (data) => {
      this.roomStateListeners.forEach((fn) => fn(data));
    });

    this.socket.on('gameStateUpdate', (state) => {
      this.gameStateListeners.forEach((fn) => fn(state));
    });

    this.socket.on('error', (msg) => {
      this.errorListeners.forEach((fn) => fn(msg));
    });
  }

  join(name: string) {
    this.socket?.emit('join', { name, token: getPlayerToken() });
  }

  startGame() {
    this.socket?.emit('startGame');
  }

  nextRound() {
    this.socket?.emit('nextRound');
  }

  restartGame() {
    this.socket?.emit('restartGame');
  }

  discard(tileId: string) {
    this.socket?.emit('discard', tileId);
  }

  claim(opt: ClaimOption) {
    this.socket?.emit('claim', opt);
  }

  selfAction(opt: ClaimOption) {
    this.socket?.emit('selfAction', opt);
  }

  onRoomState(fn: (data: { room: RoomState; yourSeat: number | null; isHost: boolean }) => void) {
    this.roomStateListeners.push(fn);
    return () => {
      this.roomStateListeners = this.roomStateListeners.filter((l) => l !== fn);
    };
  }

  onGameState(fn: (state: GameState) => void) {
    this.gameStateListeners.push(fn);
    return () => {
      this.gameStateListeners = this.gameStateListeners.filter((l) => l !== fn);
    };
  }

  onError(fn: (msg: string) => void) {
    this.errorListeners.push(fn);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== fn);
    };
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const onlineClient = new OnlineClient();

