interface Props {
  open: boolean;
  sampleCount: number;
  onClose: () => void;
  onExport: () => void;
  onClear: () => void;
}

export function TrainingPanel({
  open,
  sampleCount,
  onClose,
  onExport,
  onClear,
}: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">AI 訓練資料</h2>
        <p className="modal__sub">
          目前啟發式 AI 的每個決策都會記錄成特徵向量，方便日後替換成可訓練模型。
        </p>

        <div className="train-stats">
          <div>
            <strong>{sampleCount}</strong>
            <span>已收集樣本</span>
          </div>
          <div>
            <strong>heuristic-v1</strong>
            <span>現行代理</span>
          </div>
        </div>

        <ol className="train-steps">
          <li>對局時自動寫入 <code>localStorage</code></li>
          <li>匯出 JSONL，可用於監督式學習或行為複製</li>
          <li>
            實作 <code>AIAgent</code> 介面並註冊到 <code>AI_REGISTRY</code>
          </li>
          <li>特徵定義見 <code>src/ai/features.ts</code>，可自由擴充</li>
        </ol>

        <div className="action-bar__btns">
          <button type="button" className="btn btn--primary" onClick={onExport}>
            匯出 JSONL
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClear}>
            清空資料
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
