/* 魔塔 50 层 · 音效
 * 用 WebAudio 现场合成，不加载任何音频文件。
 */
(function () {
  const MT = (window.MT = window.MT || {});
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    return ctx;
  }

  function tone(freq, dur, type, gain, when) {
    const a = ac();
    if (!a || muted) return;
    const t0 = a.currentTime + (when || 0);
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain == null ? 0.06 : gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sweep(f1, f2, dur, type, gain) {
    const a = ac();
    if (!a || muted) return;
    const t0 = a.currentTime;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type || 'sawtooth';
    osc.frequency.setValueAtTime(f1, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + dur);
    g.gain.setValueAtTime(gain == null ? 0.07 : gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  MT.Sfx = {
    setMuted(v) { muted = !!v; },
    isMuted() { return muted; },
    resume() { const a = ac(); if (a && a.state === 'suspended') a.resume(); },
    step() { tone(180, 0.05, 'triangle', 0.025); },
    bump() { tone(90, 0.07, 'square', 0.03); },
    pickup() { tone(880, 0.07, 'triangle', 0.05); tone(1320, 0.09, 'triangle', 0.04, 0.06); },
    coin() { tone(1046, 0.06, 'square', 0.04); tone(1568, 0.1, 'square', 0.035, 0.05); },
    door() { sweep(420, 160, 0.22, 'sawtooth', 0.05); },
    hit() { sweep(320, 90, 0.12, 'square', 0.07); tone(140, 0.1, 'sawtooth', 0.05, 0.05); },
    hurt() { tone(160, 0.14, 'sawtooth', 0.06); },
    levelup() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.05, i * 0.07)); },
    secret() { tone(300, 0.1, 'sine', 0.05); tone(600, 0.16, 'sine', 0.04, 0.08); },
    stairs() { sweep(300, 700, 0.18, 'sine', 0.045); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, i * 0.16)); },
    die() { [440, 349, 262, 196].forEach((f, i) => tone(f, 0.32, 'sawtooth', 0.06, i * 0.18)); }
  };
})();
