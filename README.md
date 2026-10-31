# 香港麻雀 · 三番起糊

人機對戰香港麻雀網站。規則採 **三番起糊**，介面全為 **繁體中文**。

## 開始

```bash
npm install
npm run dev
```

## 功能

- 四人局（你 + 三位電腦）
- 吃／碰／槓／糊、補花
- 香港常見番種（對對糊、混一色、清一色、門清、自摸、花牌、字牌等）
- 起糊門檻：3 番

## 離線戰術教練與自對弈訓練

自對弈在 Azure CPU 上訓練，匯出 `models/hk_mahjong_agent.onnx` 後在本機推論。
- 完整命令與操作速查：見 [docs/COMMANDS.md](docs/COMMANDS.md)。
- 訓練移交與深度診斷報告：見 [docs/AI_TRAINING_HANDOFF.md](docs/AI_TRAINING_HANDOFF.md)。
- 原訓練技術筆記：見 [azure_train/TRAINING.md](azure_train/TRAINING.md)。

本機每次對局開兩個終端：
1. 網頁前端：`npm run dev`（http://localhost:5173）
2. AI 教練後端：`npm run coach:serve`（http://127.0.0.1:8765）

牌面右上角可選 **本地 AI** 或 **訓練模型**。**AI 戰術教練** 仍然只給你自己的建議。

## 專案目錄結構

| 目錄 | 說明 |
|---|---|
| `docs/` | 專案操作手冊（`COMMANDS.md`）與模型訓練進展總結報告 |
| `azure_train/` | 雲端訓練核心（神經網絡、3 番專家策略、PPO 自對弈與 ONNX 匯出） |
| `azure_train/scripts/` | 雲端訓練輔助腳本（`start_training.sh`、`smoke_test.sh`） |
| `ai_assistant/` | 本地教練推論服務（輕量化，僅依賴 `onnxruntime`，無需 PyTorch） |
| `models/` | 訓練好並投入使用的 ONNX 模型（`hk_mahjong_agent.onnx`） |
| `scripts/` | 本地評測與基準工具（如 `compare-ai.ts`） |
| `src/` | 前端 React + TypeScript 麻雀遊戲本體 |

## AI 與訓練擴充

現行代理是規則啟發式（`heuristic-v1`），但架構已預留訓練空間：

| 模組 | 用途 |
|------|------|
| `src/ai/types.ts` | `AIAgent` 介面 — 換腦只需實作此介面 |
| `src/ai/features.ts` | 固定長度特徵向量 |
| `src/ai/logger.ts` | 對局決策寫入 localStorage，可匯出 JSONL |
| `src/ai/heuristic.ts` | `AI_REGISTRY` — 註冊新代理 |

畫面上「AI 訓練」可匯出樣本，之後可用於行為複製或強化學習。

```ts
// 註冊自訂模型示例
AI_REGISTRY['my-model'] = () => new MyNeuralAI(weights);
```

## 技術

Vite · React · TypeScript · Zustand
