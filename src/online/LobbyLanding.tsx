import React, { useState } from 'react';
import type { RoomState } from '../../server/types';

interface LobbyLandingProps {
  room: RoomState | null;
  yourSeat: number | null;
  isHost: boolean;
  onJoin: (name: string) => void;
  onStartGame: () => void;
  onSwitchToLocal: () => void;
}

const SEAT_WINDS = ['東', '南', '西', '北'];

export const LobbyLanding: React.FC<LobbyLandingProps> = ({
  room,
  yourSeat,
  isHost,
  onJoin,
  onStartGame,
  onSwitchToLocal,
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

  const players = room?.players ?? [null, null, null, null];
  const currentHumanCount = players.filter((p) => p && !p.isAI).length;

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: 'radial-gradient(ellipse at center, #134026 0%, #081a10 100%)',
        color: '#f0f0f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          background: 'rgba(10, 25, 18, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(76, 175, 80, 0.3)',
          borderRadius: '16px',
          padding: '36px 28px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>🀄</div>
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 800,
            margin: '0 0 8px 0',
            letterSpacing: '2px',
            color: '#fff',
          }}
        >
          香港麻將 · 線上對弈大堂
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: '#81c784',
            margin: '0 0 24px 0',
            fontWeight: 500,
          }}
        >
          起糊 3 番 · 半辣上 · 最多 4 位真人 · 不足人數開台時由最新 v8 專家 AI 補位
        </p>

        {/* 4 Seats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '14px',
            margin: '24px 0 28px 0',
          }}
        >
          {[0, 1, 2, 3].map((seat) => {
            const p = players[seat];
            const isMe = yourSeat === seat;
            return (
              <div
                key={seat}
                style={{
                  background: isMe
                    ? 'rgba(76, 175, 80, 0.2)'
                    : p
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(0, 0, 0, 0.25)',
                  border: isMe
                    ? '2px solid #4caf50'
                    : p
                    ? '1px solid rgba(255, 255, 255, 0.2)'
                    : '1px dashed rgba(255, 255, 255, 0.15)',
                  borderRadius: '12px',
                  padding: '16px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: '#aaa',
                  }}
                >
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    {SEAT_WINDS[seat]}位
                  </span>
                  <span>座位 {seat + 1}</span>
                  {p?.isHost && (
                    <span
                      style={{
                        background: '#ff9800',
                        color: '#000',
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}
                    >
                      👑 房主
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: p ? '#fff' : '#666',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '180px',
                  }}
                >
                  {p ? p.name : '（等待玩家加入...）'}
                </div>

                <div>
                  {p ? (
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: isMe ? '#4caf50' : '#2e7d32',
                        color: '#fff',
                        fontWeight: 600,
                      }}
                    >
                      {isMe ? '✓ 你已入座' : '已就座'}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#777',
                      }}
                    >
                      開台後補入：專家 AI
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Controls */}
        <div style={{ marginTop: '16px' }}>
          {yourSeat === null ? (
            <div>
              <form
                onSubmit={handleJoin}
                style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  type="text"
                  placeholder="輸入你的暱稱..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #444',
                    background: '#141e17',
                    color: '#fff',
                    fontSize: '15px',
                    width: '200px',
                    outline: 'none',
                  }}
                  maxLength={12}
                  required
                />
                <button
                  type="submit"
                  className="btn btn--primary"
                  style={{
                    padding: '10px 24px',
                    fontSize: '15px',
                    fontWeight: 700,
                    borderRadius: '8px',
                  }}
                >
                  立即入座
                </button>
              </form>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
                輸入暱稱並點擊入座後，首位進入的玩家即為房主。
              </p>
            </div>
          ) : (
            <div>
              {isHost ? (
                <div>
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    onClick={onStartGame}
                    style={{
                      padding: '12px 40px',
                      fontSize: '17px',
                      fontWeight: 700,
                      borderRadius: '8px',
                      boxShadow: '0 4px 14px rgba(76, 175, 80, 0.4)',
                    }}
                  >
                    🚀 開始對局（{currentHumanCount}/4 位真人 · 其餘 AI 補位）
                  </button>
                  <p style={{ fontSize: '13px', color: '#a5d6a7', marginTop: '10px' }}>
                    你是房主，隨時點擊「開始對局」即可開牌；不足 4 人的座位將由 v8 專家神經網絡 AI 自動接管。
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '15px', color: '#fff', fontWeight: 600 }}>
                    ✓ 已成功就座！等待房主開始對局...
                  </p>
                  <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#aaa' }}>
                    房主點擊開台後，系統將自動進入牌桌並發牌。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom utility actions */}
        <div
          style={{
            marginTop: '32px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '13px',
            color: '#888',
          }}
        >
          <span>🌐 線上公共房間</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onSwitchToLocal}
            style={{ fontSize: '12px' }}
          >
            🎮 切換至單機練習模式
          </button>
        </div>
      </div>
    </div>
  );
};

