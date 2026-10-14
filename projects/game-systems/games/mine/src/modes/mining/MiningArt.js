/* 再挖一层美术层（V0.5 起 / §61 / §82）：
 * 优先使用 assets/mining 正式素材（整格 2 倍显示、最近邻），素材缺失时回退程序化像素绘制。
 * 地板与岩壁复用主项目正式瓦片或其色调变体；角色、资源图标来自本模式独立素材目录。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const P = 2;   // 1 设计像素 = 2 屏幕像素

  const PAL = {
    outline: 'rgba(8,10,16,0.55)',
    dirt: { base: '#6f4726', top: '#82552f', dark: '#4f3117', deep: '#3a2411', light: '#95683f' },
    rock: { base: '#6d7484', top: '#848da0', dark: '#545a6a', deep: '#3c414f', light: '#9aa3b6' },
    hard: { base: '#454d64', top: '#5b6481', dark: '#2f3549', deep: '#20243a', light: '#6f7998' },
    floor: { base: '#1a1f2c', dark: '#111521', light: '#232a3b', line: '#2c3347' },
    fog: '#05070c',
    water: { deep: '#275a77', base: '#3f86a8', light: '#6fc0dd', foam: '#b8e8f7' },
    wood: { base: '#7a4f2c', dark: '#57371c', light: '#a3723f', nail: '#c9b17b' },
    metal: { base: '#9aa4b8', dark: '#5c6474', light: '#dfe7f5' },
    gold: { base: '#d9a92c', dark: '#8f6a14', light: '#ffe27a' },
    copper: { base: '#b56a33', dark: '#7a4520', light: '#e39c5e' },
    silver: { base: '#c9d2e0', dark: '#8b93a6', light: '#ffffff' },
    crystal: { base: '#5cc4ec', dark: '#2f7f9e', light: '#c7f0ff' },
    gem: { base: '#8f6fe0', dark: '#5b3fa8', light: '#d9c8ff' },
  };

  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  function px(ctx, sx, sy, x, y, w, h, color, alpha) {
    if (alpha != null) { ctx.save(); ctx.globalAlpha = alpha; }
    ctx.fillStyle = color;
    ctx.fillRect(sx + x * P, sy + y * P, w * P, h * P);
    if (alpha != null) ctx.restore();
  }

  function pixelLine(ctx, sx, sy, x0, y0, x1, y1, color) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + dx * i / Math.max(1, steps));
      const y = Math.round(y0 + dy * i / Math.max(1, steps));
      px(ctx, sx, sy, x, y, 1, 1, color);
    }
  }

  function edge(ctx, sx, sy) {
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(sx, sy, 64, 2);
    ctx.fillRect(sx, sy + 62, 64, 2);
    ctx.fillRect(sx, sy, 2, 64);
    ctx.fillRect(sx + 62, sy, 2, 64);
  }

  const Art = { P, PAL, px, hash };

  /* ── 地形（§7：1/2/3 体力岩层，外观一眼可辨） ── */
  Art.drawTerrain = function (ctx, cell, sx, sy) {
    const id = cell.terrainType;
    const seed = hash(cell.x, cell.y);
    if (MM.Assets) {
      let variants;
      if (cell.roomId === 'treasure') variants = ['vault-wall'];
      else if (cell.roomId === 'mysteryRoom') variants = ['masonry'];
      else if (id === 'dirt') variants = ['dirt-a', 'dirt-b'];
      else if (id === 'hard') variants = ['hard-a', 'hard-b', 'hard-c'];
      else variants = ['rock-a', 'rock-b'];
      const tile = variants[Math.floor(seed * variants.length)];
      if (MM.Assets.drawTile(ctx, tile, sx, sy, 64)) {
        /* 基于正式墙体瓦片的轻量材质提示，保持32px逻辑像素和硬边。 */
        if (id === 'dirt') {
          for (let i = 0; i < 3; i++) {
            const gx = 5 + Math.floor(hash(cell.x + i * 7, cell.y) * 22);
            const gy = 6 + Math.floor(hash(cell.y + i, cell.x * 3) * 20);
            px(ctx, sx, sy, gx, gy, 1 + (i % 2), 1, i === 1 ? PAL.dirt.light : PAL.dirt.dark, 0.8);
          }
        } else if (id === 'hard') {
          const kx = 8 + Math.floor(seed * 5);
          px(ctx, sx, sy, kx, 5, 1, 5, PAL.hard.deep);
          px(ctx, sx, sy, kx + 1, 10, 1, 5, PAL.hard.deep);
          px(ctx, sx, sy, kx + 2, 15, 2, 1, PAL.hard.deep);
          px(ctx, sx, sy, kx + 4, 16, 1, 6, PAL.hard.deep);
          px(ctx, sx, sy, kx - 1, 5, 1, 3, PAL.hard.light, 0.8);
          px(ctx, sx, sy, kx + 1, 12, 1, 2, PAL.hard.light, 0.8);
        }
        if (cell.roomId === 'treasure') {
          const gx = 8 + Math.floor(seed * 12);
          px(ctx, sx, sy, gx, 6, 1, 5, PAL.gold.dark, 0.9);
          px(ctx, sx, sy, gx + 1, 11, 1, 4, PAL.gold.base, 0.9);
          px(ctx, sx, sy, gx + 2, 15, 2, 1, PAL.gold.base, 0.9);
          px(ctx, sx, sy, gx + 4, 16, 1, 4, PAL.gold.dark, 0.9);
          px(ctx, sx, sy, gx + 1, 9, 1, 2, PAL.gold.light, 0.7);
        }
        return;
      }
    }
    const C = id === 'dirt' ? PAL.dirt : (id === 'rock' ? PAL.rock : PAL.hard);

    ctx.fillStyle = C.base;
    ctx.fillRect(sx, sy, 64, 64);
    /* 顶光 / 底影 / 右侧暗边 */
    px(ctx, sx, sy, 0, 0, 32, 2, C.top);
    px(ctx, sx, sy, 0, 30, 32, 2, C.dark);
    px(ctx, sx, sy, 31, 0, 1, 32, C.dark);

    if (id === 'dirt') {
      /* 颗粒：低对比、均匀铺开 */
      for (let i = 0; i < 16; i++) {
        const gx = 2 + Math.floor(hash(cell.x * 13 + i, cell.y * 7) * 28);
        const gy = 3 + Math.floor(hash(cell.y * 11 + i, cell.x * 5) * 26);
        px(ctx, sx, sy, gx, gy, 1, 1, (i % 2) ? C.dark : C.deep, 0.55);
      }
      /* 土块：间距固定 + 轻微抖动，读起来是"石头"而不是符号 */
      for (let i = 0; i < 3; i++) {
        const gx = 3 + i * 10 + Math.floor(hash(cell.x + i, cell.y + i * 3) * 3);
        const gy = 18 + Math.floor(hash(cell.y + i * 7, cell.x) * 5);
        px(ctx, sx, sy, gx, gy + 1, 4, 2, C.light);
        px(ctx, sx, sy, gx + 1, gy, 2, 1, C.light);
        px(ctx, sx, sy, gx, gy + 3, 4, 1, C.deep);
        px(ctx, sx, sy, gx + 1, gy, 1, 1, 'rgba(255,255,255,0.15)');
      }
    } else if (id === 'rock') {
      /* 大块斑驳：低对比大色块 */
      for (let i = 0; i < 3; i++) {
        const gx = 3 + Math.floor(hash(cell.x * 3 + i, cell.y + i * 5) * 20);
        const gy = 4 + i * 8 + Math.floor(hash(cell.y * 3 + i, cell.x + i) * 5);
        px(ctx, sx, sy, gx, gy, 7, 5, (i % 2 === 0) ? C.light : C.dark, 0.4);
      }
      /* 单条主裂缝 + 一次分叉（斜向，避免"‖"符号感） */
      const kx = 6 + Math.floor(seed * 6);
      px(ctx, sx, sy, kx, 5, 1, 7, C.deep);
      px(ctx, sx, sy, kx + 1, 12, 1, 6, C.deep);
      px(ctx, sx, sy, kx + 2, 18, 1, 5, C.deep);
      px(ctx, sx, sy, kx + 1, 12, 3, 1, C.deep);
      px(ctx, sx, sy, kx + 4, 13, 1, 4, C.deep);
      /* 矿物星点 */
      px(ctx, sx, sy, kx + 9, 8 + (cell.x % 5), 1, 1, C.light, 0.8);
      px(ctx, sx, sy, 5 + (cell.y % 7), 22, 1, 1, C.light, 0.7);
    } else {
      /* 坚硬岩石：斜面高光 + 单条对角主裂纹 + 四角铆钉 */
      px(ctx, sx, sy, 0, 2, 2, 28, C.top);
      px(ctx, sx, sy, 2, 2, 26, 2, C.top);
      px(ctx, sx, sy, 2, 28, 28, 2, C.deep);
      px(ctx, sx, sy, 28, 4, 2, 26, C.deep);
      px(ctx, sx, sy, 7, 5, 1, 6, C.deep);
      px(ctx, sx, sy, 8, 11, 2, 6, C.deep);
      px(ctx, sx, sy, 10, 17, 3, 6, C.deep);
      px(ctx, sx, sy, 20, 7, 1, 6, C.deep, 0.8);
      px(ctx, sx, sy, 21, 13, 1, 5, C.deep, 0.8);
      px(ctx, sx, sy, 6, 6, 2, 2, C.light);
      px(ctx, sx, sy, 24, 6, 2, 2, C.light);
      px(ctx, sx, sy, 6, 24, 2, 2, C.dark);
      px(ctx, sx, sy, 24, 24, 2, 2, C.dark);
    }
    edge(ctx, sx, sy);
  };

  /* ── 已挖开地面（§11：回头路；入口平台为木板） ── */
  Art.drawFloor = function (ctx, cell, sx, sy) {
    const variant = cell.specialType === 'entrance' ? 3 : ((cell.x * 7 + cell.y * 13) % 4);
    if (MM.Assets) {
      const tile = cell.specialType === 'entrance' ? 'floor-d' : ['floor-a', 'floor-b', 'floor-c', 'floor-d'][variant];
      if (MM.Assets.drawTile(ctx, tile, sx, sy, 64)) {
        if (cell.specialType === 'entrance') {
          ctx.fillStyle = 'rgba(100,65,34,0.36)';
          ctx.fillRect(sx, sy, 64, 64);
          for (let row = 0; row < 4; row++) {
            const y = row * 8;
            px(ctx, sx, sy, 0, y, 32, 1, PAL.wood.dark, 0.8);
            const seam = ((cell.x + row) % 3) * 10 + 5;
            px(ctx, sx, sy, seam, y, 1, 8, PAL.wood.dark, 0.8);
            px(ctx, sx, sy, 3 + ((row * 11) % 20), y + 3, 1, 1, PAL.wood.nail);
          }
        }
        return;
      }
    }
    ctx.fillStyle = PAL.floor.base;
    ctx.fillRect(sx, sy, 64, 64);
    px(ctx, sx, sy, 0, 0, 32, 2, PAL.floor.light);
    px(ctx, sx, sy, 0, 30, 32, 2, PAL.floor.dark);

    if (variant === 1) {
      px(ctx, sx, sy, 0, 15, 32, 1, PAL.floor.line);
      px(ctx, sx, sy, 15, 0, 1, 32, PAL.floor.line);
      px(ctx, sx, sy, 16, 16, 3, 1, PAL.floor.light);
    } else if (variant === 2) {
      for (let i = 0; i < 3; i++) {
        const gx = 6 + i * 8, gy = 12 + ((i * 7) % 12);
        px(ctx, sx, sy, gx, gy, 3, 2, PAL.floor.light);
        px(ctx, sx, sy, gx + 1, gy + 2, 3, 1, PAL.floor.dark);
      }
    } else if (variant === 3) {
      for (let r = 0; r < 4; r++) {
        const y = r * 8;
        px(ctx, sx, sy, 0, y, 32, 1, PAL.floor.dark);
        const seam = ((cell.x + cell.y + r) % 3) * 10 + 5;
        px(ctx, sx, sy, seam, y, 1, 8, PAL.floor.dark);
        px(ctx, sx, sy, 3 + ((r * 11) % 20), y + 3, 1, 1, PAL.wood.nail);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        px(ctx, sx, sy, 4 + Math.floor(hash(cell.x + i, cell.y * 3) * 24), 6 + Math.floor(hash(i, cell.y) * 20), 2, 2, PAL.floor.line);
      }
    }
    edge(ctx, sx, sy);
  };

  Art.drawFog = function (ctx, cell, sx, sy) {
    if (MM.Assets) MM.Assets.drawTile(ctx, 'hard-c', sx, sy, 64, 0.44);
    ctx.fillStyle = 'rgba(3,5,10,0.84)';
    ctx.fillRect(sx, sy, 64, 64);
    for (let i = 0; i < 3; i++) {
      const gx = Math.floor(hash(cell.x * 3 + i, cell.y) * 30);
      const gy = Math.floor(hash(cell.y * 5, cell.x + i) * 30);
      px(ctx, sx, sy, gx, gy, 1, 1, 'rgba(70,90,140,0.10)');
    }
  };

  /* ── 矿物（§22：四种价值，一眼可辨；金/水晶带闪） ── */
  Art.drawOre = function (ctx, cell, sx, sy, time) {
    const C = PAL[cell.resourceType];
    if (!C) return;
    const seed = hash(cell.x, cell.y);
    const t = time || 0;
    /* 矿物沿岩层裂缝露出；图标仅用于UI，不再把矿石画成浮在表面的徽章。 */
    const shift = Math.floor(seed * 3) - 1;
    const x = (n) => n + shift;
    px(ctx, sx, sy, x(9), 12, 2, 1, PAL.hard.deep);
    px(ctx, sx, sy, x(11), 13, 2, 1, PAL.hard.deep);
    px(ctx, sx, sy, x(13), 14, 2, 1, PAL.hard.deep);
    px(ctx, sx, sy, x(15), 14, 2, 1, PAL.hard.deep);
    px(ctx, sx, sy, x(17), 15, 2, 1, PAL.hard.deep);
    px(ctx, sx, sy, x(19), 16, 2, 1, PAL.hard.deep);
    px(ctx, sx, sy, x(21), 17, 2, 1, PAL.hard.deep);

    if (cell.resourceType === 'copper') {
      [[10,13],[13,14],[16,14],[19,16],[21,17]].forEach((p, i) => {
        px(ctx, sx, sy, x(p[0]), p[1], i === 2 ? 2 : 1, 1, i % 2 ? C.base : C.dark);
      });
      px(ctx, sx, sy, x(14), 13, 1, 1, C.light);
      px(ctx, sx, sy, x(20), 16, 1, 1, C.base);
    } else if (cell.resourceType === 'silver') {
      [[10,13],[13,14],[16,14],[19,16],[21,17]].forEach((p, i) =>
        px(ctx, sx, sy, x(p[0]), p[1], i === 2 ? 2 : 1, 1, i % 2 ? C.base : C.dark));
      px(ctx, sx, sy, x(12), 13, 1, 1, C.light);
      px(ctx, sx, sy, x(17), 15, 1, 1, C.light);
    } else if (cell.resourceType === 'gold') {
      [[10,13],[13,14],[16,14],[19,16],[21,17]].forEach((p, i) =>
        px(ctx, sx, sy, x(p[0]), p[1], i === 2 ? 2 : 1, 1, i % 2 ? C.base : C.dark));
      px(ctx, sx, sy, x(12), 13, 1, 1, C.light);
      px(ctx, sx, sy, x(17), 15, 1, 1, C.light);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.2 + seed * 8);
      if (pulse > 0.7) px(ctx, sx, sy, x(16), 12, 1, 1, '#fff6cd', pulse);
    } else if (cell.resourceType === 'crystal') {
      px(ctx, sx, sy, x(11), 13, 2, 3, C.dark);
      px(ctx, sx, sy, x(12), 12, 2, 3, C.base);
      px(ctx, sx, sy, x(12), 12, 1, 2, C.light);
      px(ctx, sx, sy, x(15), 14, 2, 4, C.dark);
      px(ctx, sx, sy, x(16), 13, 2, 4, C.base);
      px(ctx, sx, sy, x(16), 13, 1, 2, C.light);
      px(ctx, sx, sy, x(20), 16, 2, 3, C.dark);
      px(ctx, sx, sy, x(21), 15, 2, 3, C.base);
      px(ctx, sx, sy, x(21), 15, 1, 2, C.light);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.4 + seed * 6.3);
      if (pulse > 0.74) px(ctx, sx, sy, x(17), 11, 1, 1, '#e7fbff', pulse);
    }
  };

  /* ── 视觉线索（§31 / §43：水迹 / 木板 / 金光 / 裂纹 / 蓝紫光 / 铁轨 / 木箱 / 苔痕） ── */
  Art.drawClue = function (ctx, cell, sx, sy, time) {
    const cl = cell.clueType;
    const t = time || 0;
    const seed = hash(cell.x, cell.y);
    if (!cl) return;

    if (cl === 'waterStain') {
      for (let i = 0; i < 3; i++) {
        const x = 9 + i * 5 + Math.floor(seed * 2);
        const h = 4 + i * 2;
        px(ctx, sx, sy, x, 5, 1, h, 'rgba(120,190,220,0.55)');
        px(ctx, sx, sy, x, 5 + h, 1, 1, 'rgba(170,225,245,0.8)');
      }
      ctx.fillStyle = 'rgba(90,160,195,0.35)';
      ctx.fillRect(sx + 7 * P, sy + 20 * P, 10 * P, 2 * P);
      ctx.fillRect(sx + 9 * P, sy + 22 * P, 7 * P, 2 * P);
    } else if (cl === 'planks') {
      for (let i = 0; i < 3; i++) {
        const y = 18 + i * 4;
        px(ctx, sx, sy, 4 + (i % 2) * 2, y, 24 - (i % 2) * 4, 3, i % 2 ? PAL.wood.light : PAL.wood.base);
        px(ctx, sx, sy, 4 + (i % 2) * 2, y + 2, 24 - (i % 2) * 4, 1, PAL.wood.dark);
        px(ctx, sx, sy, 7 + (i % 2) * 2, y, 1, 1, PAL.wood.nail);
        px(ctx, sx, sy, 23 - (i % 2) * 4, y, 1, 1, PAL.wood.nail);
      }
    } else if (cl === 'rails') {
      px(ctx, sx, sy, 2, 12, 28, 2, PAL.metal.base);
      px(ctx, sx, sy, 2, 22, 28, 2, PAL.metal.base);
      px(ctx, sx, sy, 2, 13, 28, 1, PAL.metal.dark);
      px(ctx, sx, sy, 2, 23, 28, 1, PAL.metal.dark);
      for (let i = 0; i < 4; i++) {
        px(ctx, sx, sy, 5 + i * 7, 11, 3, 14, PAL.wood.base);
        px(ctx, sx, sy, 5 + i * 7, 11, 1, 14, PAL.wood.dark);
      }
    } else if (cl === 'crates') {
      px(ctx, sx, sy, 5, 18, 11, 9, PAL.wood.base);
      px(ctx, sx, sy, 5, 18, 11, 2, PAL.wood.light);
      px(ctx, sx, sy, 5, 25, 11, 2, PAL.wood.dark);
      px(ctx, sx, sy, 5, 22, 11, 1, PAL.wood.dark);
      px(ctx, sx, sy, 17, 13, 10, 14, PAL.wood.base);
      px(ctx, sx, sy, 17, 13, 10, 2, PAL.wood.light);
      px(ctx, sx, sy, 21, 13, 2, 14, PAL.wood.dark);
      px(ctx, sx, sy, 17, 24, 10, 3, PAL.wood.dark);
    } else if (cl === 'mossStone') {
      px(ctx, sx, sy, 0, 15, 32, 1, 'rgba(70,90,70,0.5)');
      px(ctx, sx, sy, 15, 0, 1, 32, 'rgba(70,90,70,0.5)');
      for (let i = 0; i < 5; i++) {
        px(ctx, sx, sy, 3 + Math.floor(hash(cell.x + i, cell.y) * 26), 4 + Math.floor(hash(i, cell.y * 3) * 24),
          2 + (i % 2), 1, 'rgba(110,165,105,0.75)');
      }
      px(ctx, sx, sy, 12, 20, 8, 1, 'rgba(110,165,105,0.6)');
    } else if (cl === 'copperSeam') {
      /* 铜矿支线：短而分叉的矿脉，和铜矿色阶一致，不暗示有宝箱。 */
      pixelLine(ctx, sx, sy, 6, 6, 14, 13, PAL.hard.deep);
      pixelLine(ctx, sx, sy, 14, 13, 25, 9, PAL.hard.deep);
      pixelLine(ctx, sx, sy, 14, 13, 20, 23, PAL.hard.deep);
      pixelLine(ctx, sx, sy, 7, 5, 15, 12, PAL.copper.base);
      pixelLine(ctx, sx, sy, 15, 12, 24, 8, PAL.copper.base);
      pixelLine(ctx, sx, sy, 15, 12, 19, 21, PAL.copper.base);
      [[8, 7], [11, 10], [15, 12], [19, 11], [17, 16]].forEach((p, i) => {
        px(ctx, sx, sy, p[0], p[1], i === 2 ? 3 : 2, 2, PAL.copper.base);
        px(ctx, sx, sy, p[0], p[1], 1, 1, PAL.copper.light);
      });
      px(ctx, sx, sy, 19, 20, 2, 2, PAL.copper.light);
    } else if (cl === 'goldCache') {
      /* 金矿和遗失补给同在此支线：金色裂隙下露出一截木箱边。 */
      pixelLine(ctx, sx, sy, 7, 5, 15, 12, PAL.gold.dark);
      pixelLine(ctx, sx, sy, 15, 12, 23, 7, PAL.gold.base);
      px(ctx, sx, sy, 14, 11, 3, 2, PAL.gold.light);
      if (Math.sin(t * 3.2 + seed * 7) > 0.15) px(ctx, sx, sy, 20, 5, 2, 2, '#fff6cd');
      px(ctx, sx, sy, 8, 20, 16, 5, PAL.wood.dark);
      px(ctx, sx, sy, 9, 19, 14, 2, PAL.wood.light);
      px(ctx, sx, sy, 10, 22, 12, 2, PAL.wood.base);
      px(ctx, sx, sy, 15, 20, 2, 5, PAL.metal.base);
      px(ctx, sx, sy, 15, 21, 2, 1, PAL.gold.light);
    } else if (cl === 'goldGlow' || cl === 'goldCrack') {
      const strong = cl === 'goldCrack';
      const tw = 0.55 + 0.45 * Math.sin(t * 3.2 + seed * 7);
      const crackColor = strong ? 'rgba(255,183,48,0.95)' : 'rgba(255,215,94,0.75)';
      pixelLine(ctx, sx, sy, 7, 8, 16, 15, crackColor);
      pixelLine(ctx, sx, sy, 16, 15, 12, 25, crackColor);
      if (strong) {
        pixelLine(ctx, sx, sy, 25, 7, 19, 14, crackColor);
      }
      if (tw > 0.45) {
        px(ctx, sx, sy, 18, 10, 1, 1, '#fff6cd');
        px(ctx, sx, sy, 17, 11, 3, 1, PAL.gold.light);
        px(ctx, sx, sy, 18, 12, 1, 1, '#fff6cd');
      }
      px(ctx, sx, sy, 10, 20, 1, 1, 'rgba(255,230,150,0.6)');
      px(ctx, sx, sy, 21, 19, 1, 1, 'rgba(255,230,150,0.5)');
    } else if (cl === 'crystalGlow') {
      const tw = 0.5 + 0.5 * Math.sin(t * 3.4 + seed * 9);
      for (let i = 0; i < 3; i++) {
        const x = 9 + i * 6, y = 8 + ((i * 5) % 10);
        px(ctx, sx, sy, x, y + 2, 1, 3, PAL.crystal.base);
        if (tw > 0.35) {
          px(ctx, sx, sy, x - 1, y + 3, 3, 1, PAL.crystal.light);
        }
      }
      ctx.fillStyle = 'rgba(127,216,255,0.14)';
      ctx.fillRect(sx + 6 * P, sy + 6 * P, 20 * P, 16 * P);
    }
  };

  /* ── 特殊物件 ── */
  /* 浅层木作台：木料、铁件和矿灯都沿用正式素材的窄高光与深描边。 */
  Art.drawWorkbench = function (ctx, cell, sx, sy, excavated, used, active, time) {
    const bob = active && !used ? Math.round(Math.sin((time || 0) * 3 + cell.x * 3 + cell.y) * 1) : 0;
    const y = excavated ? 18 : 16;
    px(ctx, sx, sy, 4, y + 9, 24, 2, 'rgba(0,0,0,0.34)');
    /* 桌腿与横撑 */
    px(ctx, sx, sy, 7, y + 4 + bob, 3, 8, PAL.wood.dark);
    px(ctx, sx, sy, 22, y + 4 + bob, 3, 8, PAL.wood.dark);
    px(ctx, sx, sy, 8, y + 8 + bob, 16, 2, PAL.wood.base);
    /* 厚木桌面：明暗面分层，不使用平滑阴影。 */
    px(ctx, sx, sy, 4, y + 1 + bob, 24, 4, PAL.wood.dark);
    px(ctx, sx, sy, 5, y + bob, 22, 3, PAL.wood.base);
    px(ctx, sx, sy, 6, y + bob, 20, 1, PAL.wood.light);
    px(ctx, sx, sy, 5, y + 3 + bob, 22, 1, PAL.wood.dark);
    /* 铜包角、铁钉 */
    px(ctx, sx, sy, 5, y + bob, 2, 4, PAL.gold.dark);
    px(ctx, sx, sy, 25, y + bob, 2, 4, PAL.gold.dark);
    px(ctx, sx, sy, 8, y + 1 + bob, 1, 1, PAL.metal.light);
    px(ctx, sx, sy, 23, y + 1 + bob, 1, 1, PAL.metal.light);
    /* 桌上摊开的矿样与镐头，两个清晰的小形状。 */
    px(ctx, sx, sy, 11, y - 3 + bob, 4, 2, PAL.copper.dark);
    px(ctx, sx, sy, 12, y - 4 + bob, 3, 2, PAL.copper.base);
    px(ctx, sx, sy, 17, y - 3 + bob, 7, 1, PAL.metal.dark);
    px(ctx, sx, sy, 20, y - 5 + bob, 2, 4, PAL.metal.base);
    px(ctx, sx, sy, 19, y - 5 + bob, 4, 1, PAL.metal.light);
    /* 已制作后灯火熄灭；可交互时以一颗稳定金色灯点提示。 */
    if (!used) {
      px(ctx, sx, sy, 25, y - 5 + bob, 2, 2, active ? PAL.gold.light : PAL.gold.base);
      if (active) px(ctx, sx, sy, 24, y - 7 + bob, 4, 1, 'rgba(255,215,94,0.42)');
    } else {
      px(ctx, sx, sy, 25, y - 5, 2, 2, PAL.metal.dark);
    }
    if (!excavated) {
      px(ctx, sx, sy, 3, y + 12, 26, 2, 'rgba(14,18,26,0.70)');
      px(ctx, sx, sy, 5, y - 1, 22, 1, 'rgba(201,176,106,0.45)');
    }
  };

  /* 废弃矿料仓库：成组木箱带铁箍；选取后显出空箱状态。 */
  Art.drawWarehouse = function (ctx, cell, sx, sy, excavated, choice) {
    const y0 = excavated ? 10 : 8;
    px(ctx, sx, sy, 4, 28, 24, 2, 'rgba(0,0,0,0.36)');
    const crate = (x, y, w, h, open, seed) => {
      px(ctx, sx, sy, x, y + h - 2, w, 2, PAL.wood.dark);
      px(ctx, sx, sy, x, y, w, h, open ? '#4e3926' : PAL.wood.base);
      px(ctx, sx, sy, x + 1, y + 1, w - 2, 2, PAL.wood.light);
      px(ctx, sx, sy, x + 2, y + h - 4, w - 4, 1, PAL.wood.dark);
      px(ctx, sx, sy, x + 3 + seed, y + 3, 2, h - 5, PAL.wood.dark);
      px(ctx, sx, sy, x + w - 5, y + 3, 2, h - 5, PAL.wood.dark);
      px(ctx, sx, sy, x + Math.floor(w / 2) - 1, y + 2, 2, h - 4, PAL.metal.dark);
      px(ctx, sx, sy, x + Math.floor(w / 2) - 1, y + 2, 2, 1, PAL.metal.light);
      if (open) {
        px(ctx, sx, sy, x - 1, y - 3, w + 2, 2, PAL.wood.dark);
        px(ctx, sx, sy, x + 2, y + 3, w - 4, 2, '#202536');
        px(ctx, sx, sy, x + 3, y + 5, w - 6, 1, choice === 'materials' ? PAL.crystal.dark : PAL.gold.dark);
      } else {
        px(ctx, sx, sy, x + 2, y + 3, w - 4, 1, PAL.wood.light);
      }
    };
    crate(5, y0 + 11, 13, 13, !!choice, 0);
    crate(17, y0 + 4, 11, 20, !!choice, 1);
    /* 蓝灰铭牌与用途符号，和矿车站牌使用同一套金属色阶。 */
    px(ctx, sx, sy, 12, y0 + 12, 5, 5, PAL.metal.dark);
    px(ctx, sx, sy, 13, y0 + 13, 3, 3, choice ? PAL.metal.dark : PAL.gold.base);
    if (!choice) px(ctx, sx, sy, 14, y0 + 14, 1, 1, PAL.gold.light);
    if (excavated && !choice) {
      px(ctx, sx, sy, 8, y0 + 1, 16, 1, PAL.metal.dark);
      px(ctx, sx, sy, 9, y0, 14, 1, PAL.metal.light);
    }
  };

  Art.drawSpring = function (ctx, cell, sx, sy, time, excavated) {
    const t = time || 0;
    const w = excavated ? 26 : 18;
    const x0 = 16 - Math.floor(w / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(sx + (x0 - 2) * P, sy + 22 * P, (w + 4) * P, 4 * P);
    ctx.fillStyle = PAL.water.deep;
    ctx.fillRect(sx + (x0 - 1) * P, sy + 18 * P, (w + 2) * P, 6 * P);
    ctx.fillStyle = PAL.water.base;
    ctx.fillRect(sx + x0 * P, sy + 17 * P, w * P, 5 * P);
    ctx.fillStyle = PAL.water.light;
    ctx.fillRect(sx + (x0 + 2) * P, sy + 17 * P, (w - 6) * P, 2 * P);
    /* 涟漪（动画） */
    for (let i = 0; i < 3; i++) {
      const ph = (t * 1.6 + i * 0.37) % 1;
      const rx = x0 + 3 + Math.floor(ph * (w - 8));
      px(ctx, sx, sy, rx, 19 + (i % 2), 2, 1, 'rgba(184,232,247,' + (0.85 - ph * 0.7) + ')');
    }
    px(ctx, sx, sy, x0 + 1, 16, 2, 1, PAL.water.foam);
    /* 泉眼石台 */
    px(ctx, sx, sy, x0 - 1, 24, w + 2, 2, PAL.rock.dark);
    px(ctx, sx, sy, x0, 26, w, 1, PAL.rock.deep);
  };

  Art.drawResonanceStone = function (ctx, cell, sx, sy, time) {
    const pulse = 0.55 + 0.45 * Math.sin((time || 0) * 3.2 + cell.x);
    px(ctx, sx, sy, 8, 25, 16, 3, 'rgba(35,112,150,0.55)');
    px(ctx, sx, sy, 10, 22, 12, 4, PAL.hard.deep);
    px(ctx, sx, sy, 12, 12, 8, 11, '#1e4967');
    px(ctx, sx, sy, 14, 7, 6, 16, cell.resonanceActivated ? PAL.crystal.base : '#4aa7cc');
    px(ctx, sx, sy, 15, 4, 4, 5, cell.resonanceActivated ? PAL.crystal.light : '#a3eaff');
    px(ctx, sx, sy, 15, 9, 2, 10, '#d5f7ff');
    px(ctx, sx, sy, 18, 12, 2, 8, cell.resonanceActivated ? PAL.crystal.dark : '#247394');
    if (!cell.excavated) {
      px(ctx, sx, sy, 7, 8, 2, 2, 'rgba(127,216,255,' + (0.35 + pulse * 0.35) + ')');
      px(ctx, sx, sy, 23, 6, 2, 2, 'rgba(127,216,255,' + (0.35 + pulse * 0.35) + ')');
    }
  };

  Art.drawGateConsole = function (ctx, cell, sx, sy, time) {
    const pulse = 0.5 + 0.5 * Math.sin((time || 0) * 2.6);
    px(ctx, sx, sy, 5, 25, 22, 3, 'rgba(0,0,0,0.32)');
    px(ctx, sx, sy, 9, 9, 14, 17, PAL.wood.dark);
    px(ctx, sx, sy, 11, 7, 10, 18, PAL.wood.base);
    px(ctx, sx, sy, 12, 8, 8, 2, PAL.wood.light);
    px(ctx, sx, sy, 13, 11, 6, 10, '#182236');
    px(ctx, sx, sy, 14, 12, 4, 2, cell.specialGranted ? PAL.gold.base : PAL.gold.light);
    px(ctx, sx, sy, 15, 14, 2, 5, PAL.metal.light);
    px(ctx, sx, sy, 7, 19, 4, 2, PAL.metal.dark);
    px(ctx, sx, sy, 21, 19, 5, 2, PAL.metal.dark);
    if (!cell.excavated) px(ctx, sx, sy, 15, 13, 2, 2, 'rgba(255,215,94,' + (0.45 + pulse * 0.5) + ')');
  };

  Art.drawGateBarrier = function (ctx, cell, sx, sy) {
    px(ctx, sx, sy, 5, 5, 22, 23, '#211d1a');
    px(ctx, sx, sy, 7, 7, 18, 19, '#5a5147');
    px(ctx, sx, sy, 8, 8, 16, 2, PAL.metal.light);
    px(ctx, sx, sy, 8, 24, 16, 2, PAL.metal.dark);
    [10, 15, 20].forEach((x) => {
      px(ctx, sx, sy, x, 9, 2, 14, PAL.metal.base);
      px(ctx, sx, sy, x, 9, 1, 13, PAL.metal.light);
    });
    px(ctx, sx, sy, 12, 14, 8, 5, PAL.gold.dark);
    px(ctx, sx, sy, 14, 15, 4, 3, PAL.gold.light);
  };

  Art.drawChest = function (ctx, cell, sx, sy, opened, kind) {
    const wood = kind === 'mystery' ? PAL.gem : PAL.wood;
    const w = 16, h = 9, x = 8, y = 21 - h;
    px(ctx, sx, sy, x, y + h, w, 1, 'rgba(0,0,0,0.3)');
    px(ctx, sx, sy, x, y, w, h, wood.base);
    px(ctx, sx, sy, x, y, w, 2, kind === 'mystery' ? wood.dark : wood.light);
    px(ctx, sx, sy, x, y + h - 2, w, 2, wood.dark);
    if (kind === 'mystery') {
      px(ctx, sx, sy, x, y, w, 1, PAL.gold.base);
      px(ctx, sx, sy, x, y + h - 1, w, 1, PAL.gold.base);
      px(ctx, sx, sy, x, y, 1, h, PAL.gold.base);
      px(ctx, sx, sy, x + w - 1, y, 1, h, PAL.gold.base);
      px(ctx, sx, sy, x + 7, y + 3, 3, 3, PAL.gem.light);
    } else {
      px(ctx, sx, sy, x + 3, y, 2, h, PAL.metal.base);
      px(ctx, sx, sy, x + w - 5, y, 2, h, PAL.metal.base);
      px(ctx, sx, sy, x + 7, y + 3, 3, 3, PAL.gold.base);
      px(ctx, sx, sy, x + 8, y + 4, 1, 1, PAL.gold.light);
    }
    if (opened) {
      px(ctx, sx, sy, x - 1, y - 3, w + 2, 3, wood.dark);
      px(ctx, sx, sy, x + 2, y - 2, w - 4, 1, 'rgba(0,0,0,0.5)');
    }
  };

  Art.drawRuinCache = function (ctx, cell, sx, sy, opened) {
    const x = 8, y = 13, w = 16, h = 8;
    px(ctx, sx, sy, x, y + h, w, 1, 'rgba(0,0,0,0.3)');
    for (let i = 0; i < 3; i++) {
      px(ctx, sx, sy, x + (i % 2) * 2, y - i * 3, w, 3, i % 2 ? PAL.rock.base : PAL.rock.top);
      px(ctx, sx, sy, x + (i % 2) * 2, y - i * 3 + 2, w, 1, PAL.rock.deep);
    }
    if (opened) {
      px(ctx, sx, sy, x + 3, y - 1, w - 6, 3, '#0d0f16');
      px(ctx, sx, sy, x + 5, y + 1, w - 10, 1, PAL.gold.dark);
    } else {
      px(ctx, sx, sy, x + 5, y + 2, 6, 4, PAL.gold.base);
      px(ctx, sx, sy, x + 6, y + 3, 2, 1, PAL.gold.light);
    }
  };

  Art.drawMinecart = function (ctx, cell, sx, sy, time) {
    /* 铁轨 */
    px(ctx, sx, sy, 1, 22, 30, 2, PAL.metal.base);
    px(ctx, sx, sy, 1, 23, 30, 1, PAL.metal.dark);
    px(ctx, sx, sy, 1, 27, 30, 2, PAL.metal.base);
    px(ctx, sx, sy, 1, 28, 30, 1, PAL.metal.dark);
    for (let i = 0; i < 4; i++) px(ctx, sx, sy, 3 + i * 8, 21, 3, 9, PAL.wood.base);
    /* 矿车 */
    const x = 7, y = 13, w = 18, h = 8;
    px(ctx, sx, sy, x, y + h, w, 1, 'rgba(0,0,0,0.3)');
    px(ctx, sx, sy, x, y, w, h, PAL.wood.base);
    px(ctx, sx, sy, x, y, w, 2, PAL.wood.light);
    px(ctx, sx, sy, x, y + h - 2, w, 2, PAL.wood.dark);
    px(ctx, sx, sy, x + 1, y - 2, w - 2, 2, PAL.metal.base);
    px(ctx, sx, sy, x + w - 5, y + 2, 2, 4, PAL.metal.light);
    /* 车轮 */
    px(ctx, sx, sy, x + 2, y + h, 4, 4, PAL.metal.dark);
    px(ctx, sx, sy, x + w - 6, y + h, 4, 4, PAL.metal.dark);
    px(ctx, sx, sy, x + 3, y + h + 1, 2, 2, PAL.metal.base);
    px(ctx, sx, sy, x + w - 5, y + h + 1, 2, 2, PAL.metal.base);
    /* 车头灯 */
    const on = 0.6 + 0.4 * Math.sin((time || 0) * 4);
    px(ctx, sx, sy, x + w - 3, y + 2, 2, 2, on > 0.8 ? '#fff6cd' : PAL.gold.base);
  };

  /* 矿车站点标记（V0.6 双向连接：从深处可乘车返回；只画在已挖地面之上） */
  Art.drawCartStop = function (ctx, cell, sx, sy) {
    /* 深处站牌：与上层车站共用木/铁材质，双向箭头提示可返程。 */
    px(ctx, sx, sy, 14, 10, 3, 8, PAL.wood.dark);
    px(ctx, sx, sy, 6, 3, 20, 8, PAL.wood.dark);
    px(ctx, sx, sy, 7, 4, 18, 6, PAL.wood.base);
    px(ctx, sx, sy, 7, 3, 18, 1, PAL.metal.light);
    px(ctx, sx, sy, 10, 6, 12, 1, PAL.gold.light);
    px(ctx, sx, sy, 10, 5, 1, 3, PAL.gold.base);
    px(ctx, sx, sy, 21, 5, 1, 3, PAL.gold.base);
    /* 轨道底座 */
    px(ctx, sx, sy, 5, 22, 22, 2, PAL.metal.base);
    px(ctx, sx, sy, 5, 23, 22, 1, PAL.metal.dark);
    for (let i = 0; i < 3; i++) px(ctx, sx, sy, 7 + i * 7, 21, 3, 5, PAL.wood.base);
  };

  Art.drawVaultDoor = function (ctx, cell, sx, sy, time) {
    const t = time || 0;
    px(ctx, sx, sy, 4, 2, 24, 28, PAL.hard.deep);
    px(ctx, sx, sy, 6, 4, 20, 24, '#2b3245');
    px(ctx, sx, sy, 6, 4, 20, 2, '#3d4661');
    px(ctx, sx, sy, 6, 26, 20, 2, '#1c2133');
    ctx.strokeStyle = PAL.gold.base;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 6 * P, sy + 4 * P, 20 * P, 24 * P);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    px(ctx, sx, sy, 15, 6, 2, 20, 'rgba(255,215,94,' + (0.35 + 0.4 * pulse) + ')');
    px(ctx, sx, sy, 14, 15, 4, 3, PAL.gold.light);
    px(ctx, sx, sy, 9, 9, 2, 2, PAL.metal.base);
    px(ctx, sx, sy, 21, 9, 2, 2, PAL.metal.base);
    px(ctx, sx, sy, 9, 21, 2, 2, PAL.metal.base);
    px(ctx, sx, sy, 21, 21, 2, 2, PAL.metal.base);
  };

  Art.drawVaultGold = function (ctx, cell, sx, sy, time) {
    const t = time || 0;
    px(ctx, sx, sy, 3, 3, 26, 26, '#241d0d');
    for (let i = 0; i < 10; i++) {
      const x = 5 + ((i * 7) % 22), y = 24 - ((i * 5) % 16);
      px(ctx, sx, sy, x, y, 3, 2, PAL.gold.base);
      px(ctx, sx, sy, x, y, 1, 1, PAL.gold.light);
      px(ctx, sx, sy, x + 1, y + 2, 2, 1, PAL.gold.dark);
    }
    const tw = 0.5 + 0.5 * Math.sin(t * 3.1 + cell.x);
    if (tw > 0.6) px(ctx, sx, sy, 14 + cell.y % 4, 10, 1, 1, '#fff6cd');
  };

  Art.drawGoldPile = function (ctx, cell, sx, sy, time) {
    Art.drawVaultGold(ctx, cell, sx, sy, time);
  };

  /* 藏宝库入口被挖开后的门洞余辉 */
  Art.drawVaultOpen = function (ctx, cell, sx, sy, time) {
    px(ctx, sx, sy, 4, 4, 24, 26, '#0d0f16');
    const pulse = 0.5 + 0.5 * Math.sin((time || 0) * 2.2);
    px(ctx, sx, sy, 5, 26, 22, 2, 'rgba(255,215,94,' + (0.4 + 0.3 * pulse) + ')');
    px(ctx, sx, sy, 7, 6, 2, 20, 'rgba(255,215,94,0.35)');
    px(ctx, sx, sy, 23, 6, 2, 20, 'rgba(255,215,94,0.35)');
  };

  /* ── 矿工角色（§61 / §62：独立矿工；挥镐 / 行走 / 朝向 / 头灯） ── */
  Art.drawMiner = function (ctx, run, cx, cy, T, time) {
    if (MM.Assets && MM.Assets.isReady('miner')) {
      const moving = !!run.move;
      const digging = !!(run.action && run.action.kind === 'dig');
      const action = digging ? run.action : run.move;
      const riding = moving && run.move.isHop;
      const phase = digging ? MM.U.clamp(action.t / Math.max(0.01, action.dur), 0, 0.999)
        : moving && !riding ? MM.Player.walkPhase(run) : 0;
      const frame = digging || moving && !riding ? Math.floor(phase * 4) : 1;
      const striking = digging && frame === 2;
      const bob = moving ? 0
        : (digging ? Math.round(Math.sin(phase * Math.PI * 2) * 1.5) : 0);
      const footY = cy + T * 0.39 + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(Math.round(cx - T * 0.20), Math.round(footY - 3), Math.round(T * 0.40), 5);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(Math.round(cx - T * 0.13), Math.round(footY + 2), Math.round(T * 0.26), 2);
      MM.Assets.drawMiner(ctx, run.facing, frame,
        Math.round(cx - T / 2), Math.round(cy - T / 2 + bob), T, digging);
      if (MM.Relics && MM.Relics.milestoneUnlocked('minerBadge')) {
        const bx = Math.round(cx + T * 0.12), by = Math.round(cy + T * 0.06 + bob);
        ctx.fillStyle = '#f3c655'; ctx.fillRect(bx - 3, by - 3, 7, 7);
        ctx.fillStyle = '#315b8b'; ctx.fillRect(bx - 1, by - 1, 3, 3);
        ctx.fillStyle = '#fff0a6'; ctx.fillRect(bx - 1, by - 1, 1, 1);
      }
      if (striking) {
        ctx.fillStyle = '#fff6cd';
        ctx.fillRect(Math.round(cx + T * 0.19), Math.round(cy - T * 0.27 + bob), 4, 4);
        ctx.fillRect(Math.round(cx + T * 0.27), Math.round(cy - T * 0.34 + bob), 2, 2);
      }
      return;
    }
    const s = T / 32;
    const pos = MM.Player.renderPos(run);
    const moving = !!run.move;
    const bob = moving ? Math.abs(Math.sin((run.move.t / run.move.dur) * Math.PI)) : 0;
    const facingLeft = run.facing === 'left';
    const facingUp = run.facing === 'up';

    const p = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(cx + (x - 8) * s, cy + (y - 20 + bob) * s, w * s, h * s);
    };

    ctx.save();
    if (facingLeft) {
      ctx.translate(cx, cy);
      ctx.scale(-1, 1);
      ctx.translate(-cx, -cy);
    }

    /* 影子 */
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(Math.round(cx - 6 * s), Math.round(cy + (13 + bob) * s), 12 * s, 2 * s);
    ctx.fillRect(Math.round(cx - 4 * s), Math.round(cy + (15 + bob) * s), 8 * s, 2 * s);

    const step = moving ? (Math.floor((run.move.t / run.move.dur) * 2) === 0 ? -1 : 1) : 0;

    /* 腿 + 靴 */
    p(3, 12 + (step > 0 ? -1 : 0), 3, 6, '#2c3e5c');
    p(8, 12 + (step < 0 ? -1 : 0), 3, 6, '#2c3e5c');
    p(3, 18 + (step > 0 ? -1 : 0), 4, 2, '#1e2a3d');
    p(8, 18 + (step < 0 ? -1 : 0), 4, 2, '#1e2a3d');

    /* 身体 */
    p(3, 6, 10, 7, '#3f6cb0');
    p(3, 6, 10, 2, '#4f7ec6');
    p(3, 12, 10, 1, '#2c3e5c');
    p(7, 12, 2, 2, '#f2c14e');

    /* 背包（朝上时可见） */
    if (facingUp) {
      p(5, 7, 6, 6, '#5a4632');
      p(5, 7, 6, 2, '#6f5842');
    }

    /* 手臂 */
    p(1, 7, 2, 5, '#2f568f');
    p(13, 7, 2, 5, '#2f568f');

    /* 头 */
    p(4, 1, 8, 6, '#f0c8a0');
    if (!facingUp) {
      p(7, 3, 1, 2, '#20242e');
      p(10, 3, 1, 2, '#20242e');
      p(8, 5, 2, 1, '#d9a97f');
    }

    /* 安全帽 + 头灯 */
    p(3, -1, 10, 3, '#f2c14e');
    p(2, 2, 12, 2, '#d9a92c');
    p(9, 0, 2, 2, '#fff3b0');
    const lampOn = run.lampDigsRemaining > 0;
    if (lampOn) {
      ctx.fillStyle = 'rgba(255,243,176,0.5)';
      const lampX = cx + (facingLeft ? -1 : 1) * 4 * s;
      const lampY = cy + (-17 + bob) * s;
      ctx.fillRect(Math.round((lampX - s) / s) * s, Math.round((lampY - s) / s) * s, 2 * s, 2 * s);
    }

    /* 挥镐（§62） */
    let swing = null;
    if (run.action && run.action.kind === 'dig') {
      const t = MM.U.clamp((run.action.t || 0) / run.action.dur, 0, 1);
      swing = MM.U.lerp(-1.15, 0.55, Math.min(1, t * 1.25));
    }
    ctx.save();
    ctx.translate(cx + 6 * s, cy + (-13 + bob) * s);
    ctx.rotate(swing == null ? 0.35 : swing);
    /* 镐柄（扛在肩上 → 挥下） */
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(-1 * s, -6 * s, 2 * s, 16 * s);
    ctx.fillStyle = '#6b4526';
    ctx.fillRect(-1 * s, 7 * s, 2 * s, 4 * s);
    /* 镐头 */
    ctx.fillStyle = PAL.metal.base;
    ctx.fillRect(-7 * s, -9 * s, 14 * s, 3 * s);
    ctx.fillStyle = PAL.metal.light;
    ctx.fillRect(-7 * s, -9 * s, 14 * s, 1 * s);
    ctx.fillStyle = PAL.metal.dark;
    ctx.fillRect(-7 * s, -6 * s, 14 * s, 1 * s);
    ctx.restore();

    /* 命中火花 */
    if (run.action && run.action.kind === 'dig'
      && (run.action.t || 0) / run.action.dur >= 0.5
      && (run.action.t || 0) / run.action.dur < 0.75) {
      ctx.fillStyle = '#fff6cd';
      ctx.fillRect(cx + 7 * s, cy + (-14 + bob) * s, 2 * s, 2 * s);
      ctx.fillRect(cx + 9 * s, cy + (-16 + bob) * s, 1 * s, 1 * s);
    }

    ctx.restore();
  };

  /* 头灯 / 探矿灯环境光 */
  Art.drawPlayerGlow = function (ctx, run, cx, cy, T, time) {
    const lamp = run.lampDigsRemaining > 0;
    const pulse = 0.92 + 0.08 * Math.sin((time || 0) * 5);
    const bands = lamp
      ? [[2.7, 0.022], [2.1, 0.026], [1.5, 0.032], [0.9, 0.04]]
      : [[1.45, 0.012], [0.9, 0.016], [0.48, 0.02]];
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    bands.forEach((band) => {
      const r = Math.round(T * band[0]);
      const tint = MM.Relics && MM.Relics.lampTint ? MM.Relics.lampTint() : '#ffe7aa';
      const rgb = tint === '#91d9ff' ? '145,217,255' : '255,231,170';
      ctx.fillStyle = 'rgba(' + rgb + ',' + (band[1] * pulse) + ')';
      ctx.fillRect(Math.round(cx - r), Math.round(cy - r), r * 2, r * 2);
    });
    ctx.restore();
  };

  MM.Art = Art;
})();
