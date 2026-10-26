import type { TrainingLogger, TrainingSample } from './types';

const STORAGE_KEY = 'hk-mahjong-training-log';

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 記憶體＋ localStorage 訓練日誌。
 * 之後可改寫成送往後端／下載 JSONL 供離線訓練。
 */
export class MemoryTrainingLogger implements TrainingLogger {
  private samples: TrainingSample[] = [];
  private persist: boolean;

  constructor(persist = true) {
    this.persist = persist;
    if (persist) {
      try {
        const raw = storage()?.getItem(STORAGE_KEY);
        if (raw) this.samples = JSON.parse(raw) as TrainingSample[];
      } catch {
        this.samples = [];
      }
    }
  }

  log(sample: TrainingSample): void {
    this.samples.push(sample);
    if (this.persist) {
      try {
        // 只保留最近 5000 筆以免爆容量
        if (this.samples.length > 5000) {
          this.samples = this.samples.slice(-5000);
        }
        storage()?.setItem(STORAGE_KEY, JSON.stringify(this.samples));
      } catch {
        /* quota / non-browser */
      }
    }
  }

  flush(): TrainingSample[] {
    return [...this.samples];
  }

  clear(): void {
    this.samples = [];
    try {
      storage()?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  size(): number {
    return this.samples.length;
  }
}

export function downloadTrainingData(samples: TrainingSample[], filename = 'mahjong-training.jsonl'): void {
  const lines = samples.map((s) => JSON.stringify(s)).join('\n');
  const blob = new Blob([lines], { type: 'application/jsonl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 全域單例，方便引擎／UI 共用 */
export const trainingLogger = new MemoryTrainingLogger(true);
