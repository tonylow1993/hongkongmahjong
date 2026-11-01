/**
 * 香港麻將音效管理器 (Web Audio API 合成音效)
 * 無需外部音訊檔案，零延遲、零依賴，模擬逼真的麻將碰擊、打牌、摸牌、吃碰槓及食糊聲效。
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private volume: number = 0.65;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hk_mahjong_sound_muted');
      this.muted = saved === 'true';
    }
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
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
    if (!this.muted) {
      this.initCtx();
      this.playTileClick();
    }
    return this.muted;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  /**
   * 1. 點選手牌 / 按鈕：清脆極短的陶瓷輕敲聲 (2.2kHz)
   */
  public playTileSelect() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.035);

    gain.gain.setValueAtTime(this.volume * 0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.04);
  }

  /**
   * 2. 摸牌聲：平滑的洗牌/滑牌摩擦質感 (帶通濾波白噪音)
   */
  public playTileDraw() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const duration = 0.07;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, t);
    filter.Q.setValueAtTime(3.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.25, t);
    gain.gain.linearRampToValueAtTime(this.volume * 0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + duration);
  }

  /**
   * 3. 出牌打牌聲：厚重清脆、擲地有聲的「啪！」一聲 (衝擊瞬態 + 雙共鳴腔)
   */
  public playTileDiscard() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 高頻瓷器碰撞衝擊 (Click transient)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(2600, t);
    osc1.frequency.exponentialRampToValueAtTime(600, t + 0.04);
    gain1.gain.setValueAtTime(this.volume * 0.85, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.05);

    // 中低頻桌面木質共鳴 (Thump resonance)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(450, t);
    osc2.frequency.exponentialRampToValueAtTime(160, t + 0.07);
    gain2.gain.setValueAtTime(this.volume * 0.65, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.08);

    // 拍桌爆化微噪音
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.025);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(this.volume * 0.5, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    noise.connect(nGain);
    nGain.connect(this.ctx.destination);
    noise.start(t);
    noise.stop(t + 0.03);
  }

  /**
   * 4. 碰牌：清脆有力的兩塊牌連續撞擊聲「啪啪！」
   */
  public playPong() {
    if (this.muted) return;
    this.playTileDiscard();
    setTimeout(() => {
      this.playTileDiscard();
    }, 65);
  }

  /**
   * 5. 吃牌：順滑雙擊聲
   */
  public playChow() {
    if (this.muted) return;
    this.playTileDraw();
    setTimeout(() => {
      this.playTileDiscard();
    }, 50);
  }

  /**
   * 6. 槓牌：震撼的三響清脆碰撞「啪啪啪！」
   */
  public playKong() {
    if (this.muted) return;
    this.playTileDiscard();
    setTimeout(() => {
      this.playTileDiscard();
    }, 70);
    setTimeout(() => {
      this.playTileDiscard();
    }, 145);
  }

  /**
   * 7. 補花聲：清雅靈動的雙鈴仙氣音效 (雙重鈴音)
   */
  public playFlower() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [1046.5, 1318.5]; // C6, E6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const st = t + idx * 0.07;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(this.volume * 0.45, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(st);
      osc.stop(st + 0.23);
    });
  }

  /**
   * 8. 食糊勝利歡慶聲：歡快的大三和弦琶音 (C-E-G-C Fanfare)
   */
  public playWin() {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    chord.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const st = t + idx * 0.08;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(this.volume * 0.6, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(st);
      osc.stop(st + 0.5);
    });
  }

  /**
   * 9. 自摸！更有氣勢的重音大響 + 勝利大三和弦 (自摸天下響)
   */
  public playZimo() {
    if (this.muted) return;
    this.playTileDiscard(); // 先一記重重拍下自摸牌
    setTimeout(() => {
      this.playWin();
    }, 90);
  }

  /**
   * 10. 開局洗牌聲：密集的牌山推牌與起牌效果
   */
  public playDeal() {
    if (this.muted) return;
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.playTileDraw();
      }, i * 75);
    }
  }

  public playTileClick() {
    this.playTileSelect();
  }
}

export const soundManager = new SoundManager();
