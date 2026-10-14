/* 守塔战线 · 音效（阶段四 / §51）
 *
 * 与《再上一层》主项目同一套做法：WebAudio 现场合成，不加载任何音频文件。
 * 浏览器自动播放策略：第一次点击/触摸后才真正出声（Mode 会在首次输入时 resume）。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  let ctx = null;
  let muted = false;
  const lastAt = {};   // 同名音效限流，避免连打糊成一团

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { ctx = new C(); } catch (e) { return null; }
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
    g.gain.linearRampToValueAtTime(gain == null ? 0.05 : gain, t0 + 0.008);
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
    g.gain.setValueAtTime(gain == null ? 0.06 : gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function once(name, ms) {
    const now = Date.now();
    if (lastAt[name] && now - lastAt[name] < (ms || 60)) return false;
    lastAt[name] = now;
    return true;
  }

  TD.Sfx = {
    setMuted(v) { muted = !!v; },
    isMuted() { return muted; },
    toggle() { muted = !muted; return muted; },
    /* 首次用户输入后调用，解锁浏览器音频 */
    resume() {
      const a = ac();
      if (a && a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    },

    click() { if (once('click')) tone(660, 0.05, 'triangle', 0.035); },
    deny() { if (once('deny')) tone(180, 0.12, 'square', 0.05); },
    recruit() { if (once('recruit', 90)) { tone(523, 0.07, 'triangle', 0.05); tone(784, 0.09, 'triangle', 0.04, 0.06); } },
    coin() { if (once('coin', 70)) { tone(1046, 0.05, 'square', 0.035); tone(1568, 0.08, 'square', 0.03, 0.04); } },
    merge() { if (once('merge', 120)) { [523, 659, 880].forEach(function (f, i) { tone(f, 0.1, 'triangle', 0.05, i * 0.055); }); } },
    evolve() {
      if (!once('evolve', 400)) return;
      [392, 523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.055, i * 0.09); });
      sweep(220, 1200, 0.5, 'sine', 0.03);
    },
    hit() { if (once('hit', 55)) { sweep(420, 120, 0.07, 'square', 0.035); } },
    death() { if (once('death', 70)) tone(140, 0.1, 'sawtooth', 0.04); },
    leak() { if (once('leak', 100)) { sweep(300, 70, 0.3, 'sawtooth', 0.07); tone(90, 0.18, 'square', 0.05, 0.05); } },
    wave() { if (once('wave', 300)) { tone(392, 0.12, 'triangle', 0.05); tone(523, 0.16, 'triangle', 0.05, 0.1); } },
    boss() {
      if (!once('boss', 500)) return;
      sweep(120, 40, 0.9, 'sawtooth', 0.08);
      tone(110, 0.5, 'square', 0.05, 0.15);
      tone(74, 0.7, 'square', 0.06, 0.4);
    },
    win() { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.24, 'triangle', 0.055, i * 0.14); }); },
    lose() { [440, 349, 262, 196].forEach(function (f, i) { tone(f, 0.3, 'sawtooth', 0.055, i * 0.16); }); },
  };
})();
