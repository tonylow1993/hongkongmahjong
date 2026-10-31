import type { AILevel, OpponentMode } from '../store/gameStore';

interface Props {
  open: boolean;
  aiLevel: AILevel;
  opponentMode: OpponentMode;
  sampleCount: number;
  onClose: () => void;
  onExport: () => void;
  onClear: () => void;
}

export function TrainingPanel({
  open,
  aiLevel,
  opponentMode,
  sampleCount,
  onClose,
  onExport,
  onClear,
}: Props) {
  if (!open) return null;

  const getModelInfo = () => {
    switch (aiLevel) {
      case 'local':
        return {
          title: '本地 AI（純前端規則引擎）',
          model: 'Heuristic-v1（向聽數＋番數啟發式）',
          backend: '純瀏覽器執行，無須後端服務',
          desc: '100% 於瀏覽器本地以 TypeScript 計算向聽數、三番起糊打法及安全牌防守，零網絡延遲。',
        };
      case 'level-1':
        return {
          title: '初級（深度學習探索型）',
          model: 'hk_mahjong_agent_v2.onnx（放寬決策）',
          backend: 'http://127.0.0.1:8765 /act',
          desc: '神經網絡行為克隆模型，帶有 35% 隨機探索性，出牌較輕鬆，適合休閒新手練手。',
        };
      case 'level-2':
        return {
          title: '中級（深度學習均衡型）',
          model: 'hk_mahjong_agent_v2.onnx（均衡探索）',
          backend: 'http://127.0.0.1:8765 /act',
          desc: '神經網絡行為克隆模型，具備 20% 次選探索，牌局流暢均衡，進攻與防守兼備。',
        };
      case 'level-3':
      default:
        return {
          title: '高級（專家超越級 2.5M ResNet-10 強化學習 v8）',
          model: 'hk_mahjong_agent_v8.onnx（實測 +2.960 點 · 超額 +3.660 點）',
          backend: 'http://127.0.0.1:8765 /act',
          desc: '升級 250 萬參數 28 通道 ResNet-10 深度網絡，結合 Tjong (2024) 番數逆向歸因與 MJ_RM (2026 EAAI) 向聽步進塑型。實測 1v3 Expert 達成 +2.960 點淨收益，放銃率僅 9.0%，平均胡牌番數高達 5.00 番。',
        };
    }
  };

  const info = getModelInfo();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">遊戲設定與 AI 狀態</h2>
        <p className="modal__sub">
          香港麻將 · 三番起糊 · 正宗半辣上（每家初始底分 1000 點）
        </p>

        <div className="train-stats">
          <div>
            <strong>{info.title}</strong>
            <span>目前對手模式</span>
          </div>
          <div>
            <strong>{opponentMode === 'local' ? '本地離線' : '深度學習 ONNX'}</strong>
            <span>執行引擎</span>
          </div>
        </div>

        <div style={{ margin: '14px 0', fontSize: '13px', lineHeight: '1.6', color: 'var(--text-dim, #ccc)' }}>
          <p>
            🀄 <strong>對手模型檔案：</strong>
            <code style={{ background: '#222', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>
              {info.model}
            </code>
          </p>
          <p>
            🧠 <strong>AI 教練引擎：</strong>
            <code style={{ background: '#222', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>
              hk_mahjong_agent_v8.onnx（實時建議 ~1.2 ms）
            </code>
          </p>
          <p>
            🔌 <strong>後端服務狀態：</strong> {info.backend}
          </p>
          <p style={{ marginTop: '8px' }}>
            ℹ️ <strong>模式特點：</strong> {info.desc}
          </p>
        </div>

        <div className="train-stats" style={{ marginTop: '12px' }}>
          <div>
            <strong>{sampleCount}</strong>
            <span>已記錄對局樣本</span>
          </div>
          <div>
            <strong>1000 點</strong>
            <span>開台底分</span>
          </div>
        </div>

        <div className="action-bar__btns" style={{ marginTop: '16px' }}>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onExport} title="匯出對局樣本供離線分析">
            匯出訓練資料 (JSONL)
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
            清空樣本
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
            完成關閉
          </button>
        </div>
      </div>
    </div>
  );
}
