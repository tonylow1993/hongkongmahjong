import React, { useState } from 'react';
import type { RoomState } from '../../server/types';

interface LobbyOverlayProps {
  room: RoomState;
  yourSeat: number | null;
  isHost: boolean;
  onJoin: (name: string) => void;
  onStartGame: () => void;
}

export const LobbyOverlay: React.FC<LobbyOverlayProps> = ({
  room,
  yourSeat,
  isHost,
  onJoin,
  onStartGame,
}) => {
  const [name, setName] = useState(
    typeof window !== 'undefined'
      ? localStorage.getItem('hk_player_name') || ''
      : '',
  );

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem('hk_player_name', name.trim());
    }
    onJoin(name.trim());
  };

  const currentHumanCount = room.players.filter((p) => p && !p.isAI).length;

  return (
    <div className="modal-backdrop">
      <div className="modal modal--wide" style={{ maxWidth: '540px', textAlign: 'center' }}>
        <h2 className="modal__title">🀄 香港麻將 · 線上對弈大堂</h2>
        <p className="modal__sub">單一公共房間 · 最多 4 位真人 · 開台時不足人數自動補入最新 v8 專家 AI</p>

        <div style={{ margin: '20px 0', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {[0, 1, 2, 3].map((seat) => {
            const p = room.players[seat];
            const isMe = yourSeat === seat;
            return (
              <div
                key={seat}
                style={{
                  background: isMe ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: isMe ? '1px solid #4caf50' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '12px', color: '#888' }}>
                  座位 {seat + 1} {p?.isHost ? '👑 房主' : ''}
                </span>
                <strong style={{ fontSize: '15px', color: p ? '#fff' : '#666' }}>
                  {p ? p.name : '（等待玩家加入...）'}
                </strong>
                {p && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: p.isHost ? '#ff9800' : isMe ? '#4caf50' : '#555',
                      color: '#000',
                      fontWeight: 600,
                    }}
                  >
                    {isMe ? '你' : p.isHost ? '房主' : '已就座'}
                  </span>
                )}
                {!p && (
                  <span style={{ fontSize: '11px', color: '#777' }}>
                    開台後將為：專家 AI
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {yourSeat === null ? (
          <form onSubmit={handleJoin} style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <input
              type="text"
              placeholder="輸入你的暱稱..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #444',
                background: '#111',
                color: '#fff',
                fontSize: '14px',
                width: '180px',
              }}
              maxLength={12}
              required
            />
            <button type="submit" className="btn btn--primary">
              入座
            </button>
          </form>
        ) : (
          <div style={{ marginTop: '16px' }}>
            {isHost ? (
              <div>
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  onClick={onStartGame}
                  style={{ padding: '10px 32px', fontSize: '16px' }}
                >
                  開始對局（{currentHumanCount}/4 位真人 · 其餘 AI 補位）
                </button>
                <p style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>
                  你是房主，任何時候按「開始對局」，未滿座位將自動由最新 v8 專家 AI 補齊。
                </p>
              </div>
            ) : (
              <p style={{ color: '#aaa', fontSize: '13px' }}>
                已入座！等待房主開始對局...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

