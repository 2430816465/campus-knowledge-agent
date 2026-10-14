/* 特效层（设计规格 §62 / §63 / §64）：
 * 碎石 / 矿物浮字 / 爆破冲击环 / 屏幕轻震 / 全屏闪光。
 * 全部是纯视觉，逻辑层只负责"发出事件"，这里只负责"好看"。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  function Effects() {
    this.items = [];
    this.shakeT = 0;
    this.shakeDur = 0.4;
    this.shakeMag = 0;
    this.flashT = 0;
    this.flashDur = 1;
    this.flashColor = '#ffd75e';
  }

  Effects.prototype.clear = function () {
    this.items.length = 0;
    this.shakeT = 0;
    this.flashT = 0;
  };

  /* 矿物 / 数值浮字（§63） */
  Effects.prototype.floatText = function (wx, wy, text, color, size) {
    this.items.push({ type: 'text', x: wx, y: wy, text, color: color || '#fff', size: size || 22, t: 0, dur: 0.95 });
  };

  /* 像素碎石 */
  Effects.prototype.burst = function (wx, wy, color, n, speed) {
    const count = n || 8;
    const sp = speed || 70;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = sp * (0.4 + Math.random() * 0.9);
      this.items.push({
        type: 'p', x: wx, y: wy,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        g: 260, t: 0, dur: 0.45 + Math.random() * 0.3,
        size: 2 + Math.floor(Math.random() * 3),
        color: color || '#b9c4d6',
      });
    }
  };

  Effects.prototype.dust = function (wx, wy) {
    for (let i = 0; i < 3; i++) {
      this.items.push({
        type: 'puff',
        x: wx + (Math.random() * 2 - 1) * 10,
        y: wy + (Math.random() * 2 - 1) * 6,
        r: 3 + Math.random() * 3, maxR: 10 + Math.random() * 8,
        t: 0, dur: 0.5 + Math.random() * 0.25,
        color: '196,184,158',
      });
    }
    this.burst(wx, wy + 12, 'rgba(160,150,130,0.8)', 3, 30);
  };

  /* 金色火花（矿物收获 / 区域点亮演出，§63） */
  Effects.prototype.spark = function (wx, wy, color) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 80;
      this.items.push({
        type: 'spark', x: wx, y: wy,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50,
        g: 180, t: 0, dur: 0.4 + Math.random() * 0.3,
        color: color || '#ffe9a0',
      });
    }
  };

  /* 爆破 / 泉水冲击环（§64） */
  Effects.prototype.ring = function (wx, wy, color) {
    this.items.push({ type: 'ring', x: wx, y: wy, r: 4, maxR: 58, color: color || '#ffb830', t: 0, dur: 0.45 });
  };

  /* 被挖格的闪白（§62） */
  Effects.prototype.tileFlash = function (cx, cy, color) {
    this.items.push({ type: 'tile', cx, cy, color: color || 'rgba(255,255,255,0.85)', t: 0, dur: 0.28 });
  };

  Effects.prototype.shake = function (mag) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = this.shakeDur;
  };

  Effects.prototype.flash = function (color, dur) {
    this.flashColor = color || '#ffd75e';
    this.flashT = dur || 0.5;
    this.flashDur = dur || 0.5;
  };

  Effects.prototype.update = function (dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.type === 'p' || it.type === 'spark') {
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.vy += it.g * dt;
      }
      if (it.t >= it.dur) this.items.splice(i, 1);
    }
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
  };

  Effects.prototype.shakeOffset = function () {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const k = this.shakeT / this.shakeDur;
    return { x: (Math.random() * 2 - 1) * this.shakeMag * k, y: (Math.random() * 2 - 1) * this.shakeMag * k };
  };

  /* toScreen(wx, wy) → {x,y}：由场景提供（世界像素 → 屏幕像素，含镜头与震动） */
  Effects.prototype.draw = function (ctx, toScreen) {
    const TILE = MM.UI && MM.UI.LAYOUT ? MM.UI.LAYOUT.TILE : 64;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const p = toScreen(it.x, it.y);
      const k = MM.U.clamp(it.t / it.dur, 0, 1);
      if (it.type === 'text') {
        ctx.save();
        ctx.globalAlpha = 1 - k * k;
        MM.U.text(ctx, it.text, p.x + 1.5, p.y - 26 * k + 1.5, it.size, 'rgba(0,0,0,0.6)', 'center', true);
        MM.U.text(ctx, it.text, p.x, p.y - 26 * k, it.size, it.color, 'center', true);
        ctx.restore();
      } else if (it.type === 'p') {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = it.color;
        const pixel = Math.max(2, Math.round(TILE / 32));
        const size = Math.max(pixel, Math.round(it.size / pixel) * pixel);
        ctx.fillRect(Math.round(p.x / pixel) * pixel - size / 2,
          Math.round(p.y / pixel) * pixel - size / 2, size, size);
        ctx.restore();
      } else if (it.type === 'puff') {
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.45;
        ctx.fillStyle = 'rgba(' + it.color + ',0.85)';
        const pixel = Math.max(2, Math.round(TILE / 32));
        const radius = Math.max(1, Math.ceil((it.r + (it.maxR - it.r) * k) / pixel));
        const px = Math.round(p.x / pixel) * pixel;
        const py = Math.round(p.y / pixel) * pixel;
        const seed = Math.round(it.x + it.y);
        for (let gy = -radius; gy <= radius; gy++) {
          for (let gx = -radius; gx <= radius; gx++) {
            const distance = Math.abs(gx) + Math.abs(gy);
            const edgeNoise = ((gx * 7 + gy * 11 + seed) & 3) === 0 ? 1 : 0;
            if (distance > radius + edgeNoise) continue;
            ctx.fillRect(px + gx * pixel, py + gy * pixel, pixel, pixel);
          }
        }
        ctx.restore();
      } else if (it.type === 'spark') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = it.color;
        const sx2 = Math.round(p.x), sy2 = Math.round(p.y);
        ctx.fillRect(sx2 - 1, sy2 - 1, 2, 2);
        ctx.fillRect(sx2 - 3, sy2, 6, 1);
        ctx.fillRect(sx2, sy2 - 3, 1, 6);
        ctx.restore();
      } else if (it.type === 'ring') {
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = it.color;
        const pixel = Math.max(4, Math.round(TILE / 16));
        const radius = it.r + (it.maxR - it.r) * k;
        const samples = Math.max(16, Math.round((Math.PI * 2 * radius) / (pixel * 2)));
        for (let sample = 0; sample < samples; sample++) {
          const angle = (sample / samples) * Math.PI * 2;
          const x = Math.round((p.x + Math.cos(angle) * radius) / pixel) * pixel;
          const y = Math.round((p.y + Math.sin(angle) * radius) / pixel) * pixel;
          ctx.fillRect(x, y, pixel, pixel);
        }
        ctx.restore();
      } else if (it.type === 'tile') {
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.75;
        ctx.fillStyle = it.color;
        const s = toScreen(it.cx * TILE, it.cy * TILE);
        ctx.fillRect(Math.round(s.x), Math.round(s.y), TILE, TILE);
        ctx.restore();
      }
    }
  };

  Effects.prototype.drawFlash = function (ctx, w, h) {
    if (this.flashT <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.55 * (this.flashT / this.flashDur);
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  MM.Effects = Effects;
})();
