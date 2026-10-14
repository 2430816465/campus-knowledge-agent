/* 特效与飘字：斩击 / 命中 / 死亡 / 漏怪 / 合成闪光 / 最终进化 / 伤害数字。
 * 全部是短命对象 + 数量上限（§43）；V0.1 不追求华丽，先把"反馈"跑通（§47）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const Effects = {
    add(run, fx) {
      /* 低配模式（移动端优化）：砍掉纯装饰类特效，保留攻击/合成/进化的关键反馈 */
      if (TD.lowFx && TD.lowFx()
        && (fx.type === 'puff' || fx.type === 'spark' || fx.type === 'death' || fx.type === 'burst')) return;
      if (run.effects.length >= TD.BALANCE.MAX_EFFECTS) run.effects.shift();
      fx.ttl0 = fx.ttl;
      run.effects.push(fx);
    },

    slash(run, x1, y1, x2, y2, color, width) {
      this.add(run, { type: 'slash', x1: x1, y1: y1, x2: x2, y2: y2, color: color, width: width || 5, ttl: 0.13 });
    },
    /* 法师 AOE 命中：扩散的魔法环（§42：视觉和伤害判定分开） */
    aoeBurst(run, x, y, radius, color) {
      this.add(run, { type: 'aoe', x: x, y: y, radius: radius || 60, color: color, ttl: 0.32 });
    },
    puffFx(run, x, y, color) { this.add(run, { type: 'puff', x: x, y: y, color: color, ttl: 0.16 }); },
    mergeBurst(run, x, y, fromX, fromY, star) {
      this.add(run, { type: 'merge', x: x, y: y, fromX: fromX, fromY: fromY, star: star || 2, ttl: 0.55 });
    },
    evolveFx(run, x, y, name, color) { this.add(run, { type: 'evolve', x: x, y: y, name: name, color: color, ttl: 1.1 }); },
    hitSpark(run, x, y, color) { this.add(run, { type: 'spark', x: x, y: y, color: color, ttl: 0.16 }); },
    deathFx(run, x, y, color, size, monsterId) {
      const palette = { grunt: '#e2ddc6', hound: '#a66be0', elite: '#a7c9ed', boss: '#a64551' };
      this.add(run, { type: 'death', x: x, y: y, color: palette[monsterId] || color || '#b9c0ca',
        size: size || 30, ttl: 0.34 });
    },
    leakFx(run, x, y) {
      this.add(run, { type: 'leak', x: x, y: y, ttl: 0.45 });
      this.damageText(run, x, y - 20, '-1 ♥', '#ff7a7a');
    },
    bossEscape(run, x, y) {
      this.add(run, { type: 'leak', x: x, y: y, ttl: 0.6 });
    },

    damageText(run, x, y, text, color) {
      if (TD.lowFx && TD.lowFx() && text !== '-1 ♥') return;
      if (run.texts.length >= TD.BALANCE.MAX_DAMAGE_TEXTS) return;
      run.texts.push({ x: x, y: y, text: text, color: color || '#ffd75e', ttl: 0.7, vy: -42 });
    },

    update(run, dt) {
      const fx = run.effects;
      for (let i = fx.length - 1; i >= 0; i--) {
        fx[i].ttl -= dt;
        if (fx[i].ttl <= 0) fx.splice(i, 1);
      }
      const tx = run.texts;
      for (let i = tx.length - 1; i >= 0; i--) {
        tx[i].ttl -= dt;
        tx[i].y += tx[i].vy * dt;
        if (tx[i].ttl <= 0) tx.splice(i, 1);
      }
    },

    draw(ctx, run) {
      const list = run.effects;
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const k = Math.max(0, f.ttl / f.ttl0);   // 1 → 0
        const grow = 1 - k;

        if (f.type === 'slash') {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.strokeStyle = f.color || '#ffffff';
          ctx.lineWidth = f.width || 5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(f.x1, f.y1);
          ctx.lineTo(f.x2, f.y2);
          ctx.stroke();
          ctx.restore();
        } else if (f.type === 'aoe') {
          const r = (f.radius || 60) * (0.45 + grow * 0.55);
          ctx.save();
          ctx.globalAlpha = 0.055 * k;
          ctx.fillStyle = f.color || '#ffffff';
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.58 * k;
          ctx.strokeStyle = f.color || '#ffffff';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        } else if (f.type === 'puff') {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.fillStyle = f.color || '#ffffff';
          ctx.beginPath();
          ctx.arc(f.x, f.y, 4 + grow * 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (f.type === 'death') {
          ctx.save();
          const count = 7;
          ctx.globalAlpha = k * 0.92;
          ctx.fillStyle = f.color || '#b9c0ca';
          for (let p = 0; p < count; p++) {
            const a = p * 2.399 + (f.x + f.y) * 0.017;
            const d = (3 + p % 3 * 2) + grow * (f.size || 30) * (0.22 + (p % 2) * 0.08);
            const px = f.x + Math.cos(a) * d;
            const py = f.y - 5 + Math.sin(a) * d - grow * grow * 9;
            const side = 2 + p % 2;
            ctx.fillRect(Math.round(px), Math.round(py), side, side);
          }
          ctx.restore();
        } else if (f.type === 'merge') {
          ctx.save();
          /* 合成动画（§33）：被吃掉的英雄滑向目标 → 白光 → 星星爆开 → 星数弹出 */
          if (f.fromX != null) {
            const kk0 = Math.min(1, grow * 2.4);
            const tx = TD.U.lerp(f.fromX, f.x, kk0);
            const ty = TD.U.lerp(f.fromY, f.y, kk0);
            ctx.globalAlpha = Math.max(0, 1 - grow * 1.7);
            TD.U.fillRound(ctx, tx - 13, ty - 13, 26, 26, 7, '#ffffff');
            TD.U.strokeRound(ctx, tx - 13, ty - 13, 26, 26, 7, '#ffe58a', 2);
          }
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.strokeStyle = '#ffe58a';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 18 + grow * 40, 0, Math.PI * 2);
          ctx.stroke();
          for (let s2 = 0; s2 < 6; s2++) {
            const ang = s2 * Math.PI / 3 + grow * 1.4;
            const rr = 12 + grow * 36;
            TD.U.text(ctx, '★', f.x + Math.cos(ang) * rr, f.y + Math.sin(ang) * rr, 16, '#ffe58a', 'center', true);
          }
          ctx.restore();
          TD.U.text(ctx, TD.U.stars(f.star || 2), f.x, f.y - 42 - grow * 16, 22, '#ffffff', 'center', true);
        } else if (f.type === 'evolve') {
          const col = f.color || '#ffd75e';
          ctx.save();
          /* 屏幕局部暗下（§33） */
          ctx.globalAlpha = 0.20 * Math.min(1, k * 1.6);
          ctx.fillStyle = '#05070c';
          ctx.beginPath();
          ctx.arc(f.x, f.y, 130, 0, Math.PI * 2);
          ctx.fill();
          /* 像素光柱 */
          const beamW = 9 + Math.sin(grow * Math.PI) * 4;
          const gg = ctx.createLinearGradient(0, f.y - 140, 0, f.y + 60);
          gg.addColorStop(0, 'rgba(255,255,255,0)');
          gg.addColorStop(0.5, col);
          gg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = 0.30 * Math.min(1, k * 2);
          ctx.fillStyle = gg;
          ctx.fillRect(f.x - beamW / 2, f.y - 140, beamW, 200);
          /* 扩散光环 + 星屑 */
          ctx.globalAlpha = Math.min(0.72, k * 1.0);
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 26 + grow * 54, 0, Math.PI * 2);
          ctx.stroke();
          for (let s2 = 0; s2 < 6; s2++) {
            const ang = s2 * Math.PI / 3 - grow * 2;
            const rr = 30 + grow * 42 + (s2 % 2) * 9;
            ctx.globalAlpha = k * 0.72;
            ctx.fillStyle = col;
            ctx.fillRect(Math.round(f.x + Math.cos(ang) * rr), Math.round(f.y + Math.sin(ang) * rr), 3, 3);
          }
          ctx.restore();
          TD.U.text(ctx, f.name, f.x, f.y - 86, 32, col, 'center', true);
          TD.U.text(ctx, '最终进化！', f.x, f.y - 56, 19, '#ffe1e1', 'center', true);
        } else if (f.type === 'spark') {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.strokeStyle = f.color || '#ffffff';
          ctx.lineWidth = 3;
          for (let s2 = 0; s2 < 4; s2++) {
            const ang = s2 * Math.PI / 2 + 0.7 + grow * 1.5;
            const r1 = 3 + grow * 4;
            const r2 = 10 + grow * 12;
            ctx.beginPath();
            ctx.moveTo(f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1);
            ctx.lineTo(f.x + Math.cos(ang) * r2, f.y + Math.sin(ang) * r2);
            ctx.stroke();
          }
          ctx.restore();
        } else if (f.type === 'leak') {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.strokeStyle = '#ff5c5c';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 16 + grow * 30, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (f.type === 'burst') {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.strokeStyle = f.color || '#ffffff';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 10 + grow * 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      const texts = run.texts;
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i];
        const a = Math.min(1, t.ttl / 0.3);
        ctx.save();
        ctx.globalAlpha = a;
        const size = t.size || 22;
        ctx.font = 'bold ' + size + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color || '#ffd75e';
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      }
    },
  };

  TD.Effects = Effects;
})();
