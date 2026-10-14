/* 音效层（V0.5 / §82）：WebAudio 程序化合成，零素材文件、零依赖。
 * 浏览器首次点击后初始化 AudioContext（自动播放策略）；无 AudioContext 时全部安全降级。
 * 音效开关持久化在 forgotten-tower.mining.sound.v1，与游戏数值完全无关。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const KEY = 'forgotten-tower.mining.sound.v1';
  let ac = null;
  let master = null;
  let enabled = true;
  const lastAt = {};

  try {
    const raw = localStorage.getItem(KEY);
    if (raw === '0') enabled = false;
  } catch (e) { /* 本地存储不可用时保持默认开 */ }

  function ensure() {
    if (ac) return ac;
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    } catch (e) {
      ac = null;
    }
    return ac;
  }

  /* 单音：可做滑音 */
  function tone(freq, dur, type, vol, glideTo, delay) {
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((vol || 0.1), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /* 噪声：碎石 / 爆炸 / 水声 */
  function noise(dur, vol, filterFreq, type, delay) {
    const t0 = ac.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq || 800;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const ORE_PITCH = { copper: 523, silver: 659, gold: 784, crystal: 988 };

  const players = {
    click() { tone(620, 0.06, 'square', 0.05, 880); },
    deny() { tone(220, 0.14, 'sawtooth', 0.08, 150); },
    swing() { noise(0.09, 0.10, 2400, 'highpass'); },
    dig() { noise(0.07, 0.20, 900); tone(180, 0.09, 'sine', 0.12, 110); },
    break() { noise(0.20, 0.24, 600); tone(130, 0.16, 'sine', 0.14, 70); },
    ore(tier) {
      const base = [523, 659, 784, 988][tier] || 659;
      tone(base, 0.14, 'triangle', 0.11);
      tone(base * 1.5, 0.18, 'triangle', 0.07, null, 0.05);
      if (tier >= 2) tone(base * 4, 0.22, 'sine', 0.03, null, 0.07);
    },
    bomb() {
      noise(0.05, 0.10, 3000, 'highpass');
      noise(0.55, 0.5, 260);
      tone(70, 0.5, 'sine', 0.35, 32);
    },
    spring() {
      noise(0.35, 0.16, 1500, 'bandpass');
      tone(420, 0.3, 'sine', 0.10, 900, 0.03);
    },
    chest() {
      [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, null, i * 0.07));
    },
    roomFound() { tone(880, 0.22, 'sine', 0.08); tone(1174, 0.3, 'sine', 0.05, null, 0.08); },
    cart() {
      noise(0.7, 0.22, 500);
      tone(880, 0.3, 'square', 0.05, 1240, 0.05);
    },
    vaultBreak() {
      noise(0.5, 0.42, 420);
      tone(90, 0.5, 'sine', 0.3, 45);
      tone(1200, 0.12, 'square', 0.05, 300, 0.05);
    },
    rays() { tone(1046, 0.5, 'sine', 0.06, 1568); noise(0.5, 0.10, 2500, 'highpass'); },
    treasure() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.10, null, i * 0.10));
      tone(261, 0.9, 'sine', 0.12);
      noise(0.8, 0.10, 3200, 'highpass', 0.1);
    },
    record() { tone(784, 0.14, 'triangle', 0.10); tone(1046, 0.24, 'triangle', 0.10, null, 0.12); },
  };

  MM.Audio = {
    get enabled() { return enabled; },

    init() { ensure(); },

    setEnabled(v) {
      enabled = !!v;
      try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) {}
      if (enabled && ensure()) players.click();   // 无 AudioContext 环境（如无头测试）静默跳过
    },

    toggle() { this.setEnabled(!enabled); return enabled; },

    /* 调试 / QA 用：音频上下文状态（不参与任何游戏逻辑） */
    contextState() { return ac ? ac.state : 'none'; },

    /* 播放；无环境 / 关闭 / 连发过密时安全忽略 */
    play(name, arg) {
      if (!enabled) return;
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
      const t = ac.currentTime;
      if (lastAt[name] && t - lastAt[name] < 0.04) return;
      lastAt[name] = t;
      const fn = players[name];
      if (fn) fn(arg);
    },
  };
})();
