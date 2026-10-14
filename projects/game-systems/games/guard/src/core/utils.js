/* 通用小工具：数学 / 随机 / Canvas 绘制辅助。零依赖。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const U = {
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
    rand(n) { return Math.random() * (n == null ? 1 : n); },
    randInt(n) { return Math.floor(Math.random() * n); },
    pick(list) { return list[Math.floor(Math.random() * list.length)]; },

    /* 可播种随机（mulberry32）：同一 seed 得到完全相同的序列。
     * 玩法随机（招募 / 广告星级）走 run.rng；画面抖动等纯视觉随机仍用 Math.random。 */
    mulberry32(seed) {
      let a = (seed >>> 0) || 1;
      return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    /* 权重随机：返回被选中的下标（rnd 可传入 run.rng 以便复现） */
    weightedIndex(weights, rnd) {
      const draw = rnd || Math.random;
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let r = draw() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    },

    uid() {
      U._n = (U._n || 0) + 1;
      return U._n;
    },

    roundRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r || 0, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.arcTo(x + w, y, x + w, y + rr, rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
      ctx.lineTo(x + rr, y + h);
      ctx.arcTo(x, y + h, x, y + h - rr, rr);
      ctx.lineTo(x, y + rr);
      ctx.arcTo(x, y, x + rr, y, rr);
      ctx.closePath();
    },

    fillRound(ctx, x, y, w, h, r, color) {
      U.roundRect(ctx, x, y, w, h, r);
      ctx.fillStyle = color;
      ctx.fill();
    },

    strokeRound(ctx, x, y, w, h, r, color, width) {
      U.roundRect(ctx, x, y, w, h, r);
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 1;
      ctx.stroke();
    },

    pointInRect(x, y, rect) {
      return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    },

    text(ctx, str, x, y, size, color, align, bold) {
      ctx.save();
      ctx.fillStyle = color || '#e8eef8';
      ctx.font = (bold ? 'bold ' : '') + size + 'px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(str, x, y);
      ctx.restore();
    },

    /* 按最大宽度截断文本（超出加省略号），保证长文案不会压出容器 */
    fitText(ctx, str, maxWidth, size, bold) {
      ctx.save();
      ctx.font = (bold ? 'bold ' : '') + size + 'px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
      let text = String(str);
      if (ctx.measureText(text).width <= maxWidth) { ctx.restore(); return text; }
      while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) {
        text = text.slice(0, -1);
      }
      ctx.restore();
      return text + '…';
    },

    /* 按宽度自动换行绘制（新手引导等的长文案用） */
    wrapText(ctx, str, x, y, maxWidth, lineHeight, size, color, bold) {
      ctx.save();
      ctx.font = (bold ? 'bold ' : '') + size + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillStyle = color || '#e8eef8';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let line = '';
      let ly = y;
      for (let i = 0; i < str.length; i++) {
        const test = line + str[i];
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, ly);
          line = str[i];
          ly += lineHeight;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, x, ly);
      ctx.restore();
      return ly;
    },

    stars(n) {
      let s = '';
      for (let i = 0; i < n; i++) s += '★';
      return s;
    },

    /* 颜色明暗：amt > 0 变亮、< 0 变暗（用于像素小人调色板推演） */
    shade(hex, amt) {
      const n = parseInt(String(hex).replace('#', ''), 16);
      let r = (n >> 16) & 255;
      let g = (n >> 8) & 255;
      let b = n & 255;
      if (amt >= 0) {
        r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
      } else {
        r *= (1 + amt); g *= (1 + amt); b *= (1 + amt);
      }
      const to = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
      return '#' + to(r) + to(g) + to(b);
    },

    fmt(v) { return String(Math.round(v * 10) / 10); },
  };

  TD.U = U;
})();
