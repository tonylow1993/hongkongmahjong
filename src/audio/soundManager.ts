/**
 * 香港麻將音效管理器 (Web Audio API 高保真物理合成音效)
 * 針對 Safari/Chrome/iOS/Android 自動解鎖音訊上下文，零網絡延遲、高保真發聲。
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean = false;
  private unlocked: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hk_mahjong_sound_muted');
      this.muted = saved === 'true';
      this.setupGlobalUnlock();
    }
  }

  private setupGlobalUnlock() {
    if (typeof window === 'undefined') return;

    const unlockHandler = () => {
      this.unlock();
      ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach((evt) => {
        window.removeEventListener(evt, unlockHandler, true);
      });
    };

    ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlockHandler, { capture: true, once: false });
    });
  }

  private getAudioContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1.0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    return this.ctx;
  }

  public unlock() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    if (!this.unlocked) {
      try {
        // 播放 1 個 sample 的靜音 buffer 徹底喚醒 Safari / iOS / Chrome Web Audio 管線
        const buffer = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
        this.unlocked = true;
      } catch (e) {
        // ignore
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('hk_mahjong_sound_muted', String(this.muted));
    }

    const ctx = this.getAudioContext();
    if (ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1.0, ctx.currentTime);
    }

    if (!this.muted) {
      this.unlock();
      this.playTileDiscard();
    }
    return this.muted;
  }

  private getDestination(): { ctx: AudioContext; dest: AudioNode } | null {
    if (this.muted) return null;
    const ctx = this.getAudioContext();
    if (!ctx) return null;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    return { ctx, dest: this.masterGain || ctx.destination };
  }

  /**
   * 1. 點選手牌 / 選牌：清脆短促的陶瓷微擊聲
   */
  public playTileSelect() {
    this.unlock();
    const env = this.getDestination();
    if (!env) return;
    const { ctx, dest } = env;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  /**
   * 2. 摸牌聲：真實麻將推牌、抽牌的滑行摩擦質感
   */
  public playTileDraw() {
    this.unlock();
    const env = this.getDestination();
    if (!env) return;
    const { ctx, dest } = env;
    const t = ctx.currentTime;
    const duration = 0.11;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const progress = i / bufferSize;
      const decay = Math.sin(progress * Math.PI);
      data[i] = (Math.random() * 2 - 1) * decay;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.linearRampToValueAtTime(2200, t + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(1000, t + duration);
    filter.Q.setValueAtTime(2.5, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    noise.start(t);
    noise.stop(t + duration);
  }

  /**
   * 3. 出牌打牌聲：厚重、清脆、擲地有聲的拍桌「啪！」陶瓷重音
   * 結合高頻敲擊瞬態 (Transient) + 中頻木質共鳴 (Thump) + 拍桌爆破微雜訊
   */
  public playTileDiscard() {
    this.unlock();
    const env = this.getDestination();
    if (!env) return;
    const { ctx, dest } = env;
    const t = ctx.currentTime;

    // 1. 高頻陶瓷碰撞脆音
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(2200, t);
    osc1.frequency.exponentialRampToValueAtTime(600, t + 0.07);
    gain1.gain.setValueAtTime(0.85, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    osc1.connect(gain1);
    gain1.connect(dest);
    osc1.start(t);
    osc1.stop(t + 0.08);

    // 2. 中低頻麻雀桌實木共振音 (Thump)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(320, t);
    osc2.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    gain2.gain.setValueAtTime(0.8, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc2.connect(gain2);
    gain2.connect(dest);
    osc2.start(t);
    osc2.stop(t + 0.14);

    // 3. 拍桌碰撞爆音雜訊
    const duration = 0.04;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.7, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    noise.connect(nGain);
    nGain.connect(dest);
    noise.start(t);
    noise.stop(t + duration);
  }

  /**
   * 4. 碰牌：雙連擊清脆碰牌「啪！啪！」
   */
  public playPong() {
    this.playTileDiscard();
    setTimeout(() => {
      this.playTileDiscard();
    }, 75);
  }

  /**
   * 5. 吃牌：滑牌接入聲「嚓、啪！」
   */
  public playChow() {
    this.playTileDraw();
    setTimeout(() => {
      this.playTileDiscard();
    }, 60);
  }

  /**
   * 6. 槓牌：震撼三連清脆響「啪！啪！啪！」
   */
  public playKong() {
    this.playTileDiscard();
    setTimeout(() => {
      this.playTileDiscard();
    }, 80);
    setTimeout(() => {
      this.playTileDiscard();
    }, 165);
  }

  /**
   * 7. 補花聲：清亮仙氣的雙鈴聲 (C6 -> E6)
   */
  public playFlower() {
    this.unlock();
    const env = this.getDestination();
    if (!env) return;
    const { ctx, dest } = env;
    const t = ctx.currentTime;
    const notes = [1046.5, 1318.5]; // C6, E6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.09;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, st);

      gain.gain.setValueAtTime(0.55, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.28);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(st);
      osc.stop(st + 0.3);
    });
  }

  /**
   * 8. 食糊聲：勝利慶祝大三和弦 (C5-E5-G5-C6 Fanfare)
   */
  public playWin() {
    this.unlock();
    const env = this.getDestination();
    if (!env) return;
    const { ctx, dest } = env;
    const t = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.09;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);

      gain.gain.setValueAtTime(0.65, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.55);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(st);
      osc.stop(st + 0.6);
    });
  }

  /**
   * 9. 自摸聲：落地重音拍桌 + 勝利大三和弦
   */
  public playZimo() {
    this.playTileDiscard();
    setTimeout(() => {
      this.playWin();
    }, 100);
  }

  /**
   * 10. 開局洗牌聲：密集的牌山推牌與起牌效果
   */
  public playDeal() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.playTileDraw();
      }, i * 80);
    }
  }

  /**
   * 11. 等候玩家操作提示音 (Action Prompt)
   * 輪到自己出牌或出現吃碰槓糊按鈕時，播放清新清脆的兩音提示音 (A5 -> E6)
   */
  public playActionPrompt() {
    this.unlock();
    const env = this.getDestination();
    if (!env) return;
    const { ctx, dest } = env;
    const t = ctx.currentTime;
    const tones = [880, 1318.5]; // A5 -> E6

    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.085;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, st);

      gain.gain.setValueAtTime(0.5, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.28);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(st);
      osc.stop(st + 0.3);
    });
  }

  public playTileClick() {
    this.playTileSelect();
  }
}

export const soundManager = new SoundManager();
