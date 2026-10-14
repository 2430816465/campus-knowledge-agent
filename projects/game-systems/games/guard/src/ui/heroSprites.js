/* 守塔战线 · 像素英雄（程序化绘制，阶段四 / §51）
 *
 * 不依赖任何图片：用 Canvas 画 16×20 逻辑像素的小人。
 *  - 6 种职业各有自己的武器 / 头盔 / 配色（剑 / 弓 / 法杖 / 双短刀 / 盾剑 / 长枪）
 *  - 12 种最终形态在职业骨架上换配色 + 武器强化 + 光环 + 徽记
 *  - 支持待机（轻微起伏）与攻击（突刺 / 拉弓 / 举杖）两种姿态，可水平翻转
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const SKIN = '#e8b98c';
  const SKIN_D = '#c99368';
  const STEEL = '#e6ecf6';
  const STEEL_D = '#9aa4b8';
  const WOOD = '#8a6a3a';
  const WOOD_D = '#5f4a28';
  const EYE = '#2b2b3a';
  const GOLD = '#e6c86a';

  function pen(ctx, p, ox, oy) {
    return function px(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(ox + x * p), Math.round(oy + y * p), Math.round(w * p), Math.round(h * p));
    };
  }

  /* 通用身体：腿 / 躯干 / 手臂 / 头 */
  function body(px, pal) {
    px(4, 14, 3, 4, pal.dark);      // 左腿
    px(9, 14, 3, 4, pal.dark);      // 右腿
    px(4, 18, 3, 1, pal.darkest);   // 鞋
    px(9, 18, 3, 1, pal.darkest);
    px(4, 8, 8, 6, pal.main);       // 躯干
    px(4, 7, 8, 1, pal.light);      // 肩线
    px(4, 12, 8, 1, pal.darkest);   // 腰带
    px(2, 9, 2, 5, pal.main);       // 左臂
    px(2, 13, 2, 1, SKIN);
    px(12, 9, 2, 5, pal.main);      // 右臂
    px(12, 13, 2, 1, SKIN);
    px(5, 2, 6, 6, SKIN);           // 头
    px(5, 5, 6, 1, SKIN_D);         // 下巴阴影
  }

  /* 6 职业的装备与武器 */
  function gear(px, pal, cls) {
    if (cls === 'swordsman') {
      px(5, 0, 6, 2, pal.light);      // 头盔
      px(4, 2, 8, 1, pal.dark);
      px(3, 9, 1, 6, pal.dark);       // 披风
      px(13, 2, 2, 9, STEEL);         // 剑
      px(13, 1, 2, 1, '#ffffff');
      px(12, 11, 4, 1, GOLD);
      px(13, 12, 2, 2, WOOD_D);
      px(6, 4, 1, 1, EYE); px(9, 4, 1, 1, EYE);
    } else if (cls === 'archer') {
      px(5, 0, 6, 2, pal.dark);       // 兜帽
      px(4, 2, 8, 1, pal.main);
      px(9, -1, 3, 1, GOLD);          // 羽饰
      px(1, 5, 1, 10, WOOD);          // 弓
      px(2, 4, 1, 2, WOOD_D);
      px(2, 14, 1, 2, WOOD_D);
      px(2, 6, 1, 8, '#cfd6e0');      // 弓弦
      px(12, 10, 3, 6, WOOD_D);       // 箭袋
      px(13, 8, 1, 3, STEEL);
      px(6, 4, 1, 1, EYE); px(9, 4, 1, 1, EYE);
    } else if (cls === 'mage') {
      px(4, -1, 8, 1, pal.darkest);   // 尖帽
      px(5, 0, 6, 1, pal.darkest);
      px(4, 1, 8, 1, pal.main);
      px(3, 2, 10, 1, pal.light);
      px(3, 8, 10, 8, pal.main);      // 长袍
      px(3, 15, 10, 1, pal.light);
      px(14, 3, 1, 13, WOOD);         // 法杖
      px(13, 0, 3, 3, pal.glow);      // 法球
      px(6, 4, 1, 1, EYE); px(9, 4, 1, 1, EYE);
    } else if (cls === 'rogue') {
      px(4, 0, 8, 4, pal.dark);       // 兜帽
      px(4, 4, 8, 1, pal.darkest);
      px(5, 5, 6, 1, '#b03a3a');      // 面巾
      px(12, 10, 1, 4, STEEL);        // 右手短刀
      px(11, 14, 3, 1, WOOD_D);
      px(3, 10, 1, 4, STEEL);         // 左手短刀
      px(2, 14, 3, 1, WOOD_D);
      px(6, 4, 1, 1, '#ffd75e'); px(9, 4, 1, 1, '#ffd75e');
    } else if (cls === 'knight') {
      px(5, 0, 6, 3, STEEL_D);        // 头盔
      px(4, 2, 8, 1, pal.main);
      px(7, -2, 2, 2, '#c85a5a');     // 盔缨
      px(6, 3, 4, 1, '#5a6478');      // 面甲缝
      px(1, 9, 4, 7, pal.dark);       // 大盾
      px(2, 11, 2, 3, pal.light);
      px(13, 3, 2, 8, STEEL);         // 剑
      px(12, 11, 4, 1, GOLD);
      px(13, 12, 2, 2, WOOD_D);
      px(6, 3, 1, 1, '#ffd75e'); px(9, 3, 1, 1, '#ffd75e');
    } else {
      /* spearman 枪兵 */
      px(5, 0, 6, 2, pal.light);      // 头盔
      px(4, 2, 8, 1, pal.main);
      px(13, -4, 1, 23, WOOD);        // 长枪
      px(12, -6, 3, 2, STEEL);
      px(13, 0, 1, 2, pal.darkest);   // 握把
      px(6, 4, 1, 1, EYE); px(9, 4, 1, 1, EYE);
    }
  }

  /* 最终形态的额外装饰（光环 + 徽记 + 武器染色） */
  function formExtras(ctx, px, pal, hero, time, p, ox, oy) {
    const id = hero.evolved;
    if (!id) return;
    /* 光环 */
    ctx.save();
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = pal.main;
    ctx.beginPath();
    ctx.arc(ox + 8 * p, oy + 10 * p, 11.5 * p, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    /* 徽记（头顶飘浮的小符号） */
    const fl = Math.sin(time * 4) * 1.5;
    const cx = ox + 8 * p;
    const cy = oy + (-2 + fl * 0.4) * p;
    if (id === 'berserker') { px(13, 1, 2, 3, '#ff5a3a'); }
    else if (id === 'swordmaster') { px(13, 0, 2, 2, '#cfe6ff'); }
    else if (id === 'sharpshooter') { px(2, 3, 1, 2, GOLD); }
    else if (id === 'stormranger') { px(4, 6, 1, 1, '#bff5ee'); px(11, 6, 1, 1, '#bff5ee'); }
    else if (id === 'firesage') { px(12, -1, 4, 2, '#ff8a3d'); px(14, -2, 2, 1, '#ffd75e'); }
    else if (id === 'frostsage') { px(13, 1, 3, 1, '#dff6ff'); px(14, 0, 1, 3, '#dff6ff'); }
    else if (id === 'assassin') { px(12, 9, 1, 1, '#ff5a5a'); px(3, 9, 1, 1, '#ff5a5a'); }
    else if (id === 'shadowdancer') { px(5, 6, 2, 1, '#e0c8ff'); px(9, 6, 2, 1, '#e0c8ff'); }
    else if (id === 'judgeknight') { px(12, 4, 4, 1, GOLD); px(13, 3, 2, 1, GOLD); }
    else if (id === 'paladin') { px(6, -3, 4, 1, '#fff6d6'); px(5, -4, 6, 1, '#fff6d6'); }
    else if (id === 'dragonlance') { px(12, -8, 3, 2, '#ff8a3d'); }
    else if (id === 'royallancer') { px(11, -7, 4, 3, GOLD); px(9, -6, 2, 2, '#b03a3a'); }
    /* 装备染色（用形态色给武器加高光） */
    px(13, 3, 1, 6, pal.glow);
  }

  const HeroSprites = {
    grid: { w: 16, h: 20 },

    /* hero: 英雄数据；cx,cy：脚底中心；opts: { facing, animT, time, alpha, scale } */
    draw(ctx, hero, cx, cy, opts) {
      if (TD.HeroRig) return TD.HeroRig.draw(ctx, hero, cx, cy, opts);
      const st = TD.Heroes.stats(hero);
      const o = opts || {};
      const scale = o.scale || 1;
      const p = 3 * scale;
      const time = o.time || 0;
      const facing = o.facing === -1 ? -1 : 1;
      const atk = o.animT != null && o.animT < 0.22;
      const t = atk ? Math.max(0, o.animT) / 0.22 : 0;
      const lunge = atk ? Math.round(Math.sin((1 - t) * Math.PI) * 2) : 0;   // 攻击时向面朝方向突刺

      const pal = {
        main: TD.Meta ? TD.Meta.skinColor(hero.classId, st.color) : st.color,
        dark: '',
        darkest: '',
        light: '',
        glow: '',
      };
      pal.dark = TD.U.shade(pal.main, -0.35);
      pal.darkest = TD.U.shade(pal.main, -0.58);
      pal.light = TD.U.shade(pal.main, 0.28);
      pal.glow = st.isFinal ? TD.U.shade(st.color, 0.35) : STEEL;

      ctx.save();
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.translate(cx, cy);
      ctx.scale(facing, 1);
      const ox = (-8 + lunge) * p;
      const oy = -19 * p + (atk ? 0 : Math.sin(time * 5 + (hero.uid % 5)) * 0.5 * p);
      const px = pen(ctx, p, ox, oy);

      /* 影子 */
      ctx.save();
      ctx.globalAlpha = (o.alpha != null ? o.alpha : 1) * 0.28;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(ox + 8 * p, oy + 19.6 * p, 6.5 * p, 1.8 * p, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      formExtras(ctx, px, pal, hero, time, p, ox, oy);
      body(px, pal);
      gear(px, pal, hero.classId);

      ctx.restore();
    },
  };

  TD.HeroSprites = HeroSprites;
})();
