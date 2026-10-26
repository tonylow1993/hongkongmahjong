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
