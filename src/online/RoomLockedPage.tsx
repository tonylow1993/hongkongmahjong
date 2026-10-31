import React from 'react';

interface RoomLockedPageProps {
  onRefresh: () => void;
  onSwitchToLocal: () => void;
}

export const RoomLockedPage: React.FC<RoomLockedPageProps> = ({
  onRefresh,
  onSwitchToLocal,
}) => {
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
          maxWidth: '540px',
          background: 'rgba(10, 25, 18, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 152, 0, 0.3)',
          borderRadius: '16px',
          padding: '40px 32px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
        <h1
          style={{
            fontSize: '26px',
            fontWeight: 800,
            margin: '0 0 12px 0',
            letterSpacing: '1px',
            color: '#fff',
          }}
        >
          牌局進行中 · 房間已鎖定
        </h1>
        <p
          style={{
            fontSize: '15px',
            lineHeight: 1.6,
            color: '#ffcc80',
            margin: '0 0 24px 0',
          }}
        >
          目前公共房間已有真人玩家開台對弈中。
          <br />
          為節省伺服器運算與網絡傳輸資源，對局中暫不開放旁觀或中途插入。
        </p>

        <p style={{ fontSize: '13px', color: '#aaa', margin: '0 0 28px 0' }}>
          當房內所有真人玩家離線或該局結束後，房間將自動重置開放。
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onRefresh}
            style={{ padding: '10px 24px', fontWeight: 600 }}
          >
            🔄 重新整理檢查房間
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onSwitchToLocal}
            style={{ padding: '10px 24px', fontWeight: 600 }}
          >
            🎮 切換至單機練習模式
          </button>
        </div>
      </div>
    </div>
  );
};

