/* 通用小工具：数学 / 随机 / Canvas 绘制辅助。零依赖。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const U = {
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    manhattan(x1, y1, x2, y2) { return Math.abs(x2 - x1) + Math.abs(y2 - y1); },
    rand(n) { return Math.random() * (n == null ? 1 : n); },
    randInt(n) { return Math.floor(Math.random() * n); },
    pick(list) { return list[Math.floor(Math.random() * list.length)]; },

    /* 权重随机：返回被选中的下标 */
    weightedIndex(weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let r = Math.random() * total;
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

    /* 文本自适应：返回不超过 maxW 的可用字号（不改变字符串） */
    fitSize(ctx, str, maxW, size, bold) {
      let s = size;
      ctx.save();
      while (s > 9) {
        ctx.font = (bold ? 'bold ' : '') + s + 'px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
        if (ctx.measureText(str).width <= maxW) break;
        s -= 1;
      }
      ctx.restore();
      return s;
    },

    fmt(v) { return String(Math.round(v * 10) / 10); },

    /* 确定性 32 位字符串散列（FNV-1a），用于 Seed → RNG 起点 */
    hashSeed(str) {
      const s = String(str);
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      return h >>> 0;
    },
  };

  MM.U = U;
})();
