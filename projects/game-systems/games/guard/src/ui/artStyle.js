/* 《遗忘之塔》塔防共用美术层。
 * 只从正式主游戏读取纹理、图标和建筑；Canvas 只负责排版与地图色调映射。
 * 缺图时保留轻量绘制回退，不影响玩法、地图坐标或存档。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const COLORS = {
    gold: '#dca552', blue: '#7898bd', green: '#82aa83', red: '#c36c60', violet: '#9e83c4',
  };
  const MAPS = {
    map01: { tint: 'rgba(49,77,112,0.19)', accent: COLORS.gold, gate: 1 },
    map02: { tint: 'rgba(45,83,55,0.24)', accent: COLORS.green, gate: 1 },
    map03: { tint: 'rgba(133,69,38,0.25)', accent: '#d18b58', gate: 1 },
    map04: { tint: 'rgba(58,79,101,0.23)', accent: '#9db3c7', gate: 1 },
    map05: { tint: 'rgba(65,47,91,0.30)', accent: COLORS.violet, gate: 2 },
  };
  const textureCanvases = {};
  let texturePatterns = new WeakMap();
  let textureRevision = -1;

  function shared(id) {
    return TD.Assets && TD.Assets.shared ? TD.Assets.shared(id) : null;
  }

  function texture(ctx, id, size) {
    const img = shared(id);
    if (!img || typeof document === 'undefined') return null;
    const revision = TD.Assets.state.revision;
    if (textureRevision !== revision) {
      Object.keys(textureCanvases).forEach(function (key) { delete textureCanvases[key]; });
      texturePatterns = new WeakMap();
      textureRevision = revision;
    }
    const key = id + ':' + size;
    if (!textureCanvases[key]) {
      const cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(img, 0, 0, img.width, img.height, 0, 0, size, size);
      textureCanvases[key] = cv;
    }
    let patterns = texturePatterns.get(ctx);
    if (!patterns) { patterns = {}; texturePatterns.set(ctx, patterns); }
    if (!patterns[key]) patterns[key] = ctx.createPattern(textureCanvases[key], 'repeat');
    return patterns[key];
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  const Art = {
    colors: COLORS,
    mapTheme(mapId) { return MAPS[mapId] || MAPS.map01; },

    backdrop(ctx, mode) {
      rect(ctx, 0, 0, 720, 1280, '#08111f');
      const wall = texture(ctx, 'tile.wall', 96);
      if (wall) {
        ctx.save();
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, 720, 1280);
        ctx.restore();
      }
      rect(ctx, 0, 0, 720, 1280, 'rgba(5,10,19,0.84)');

      const scene = shared('ui.backdrop');
      const top = ctx.createLinearGradient(0, 0, 720, 0);
      top.addColorStop(0, 'rgba(16,31,50,0.88)');
      top.addColorStop(0.5, 'rgba(7,14,25,0.90)');
      top.addColorStop(1, 'rgba(16,31,50,0.88)');
      rect(ctx, 0, 0, 720, 1280, top);
      /* 下方保留主游戏的火把场景，地图战斗区仍以石砖为主，确保单位清楚。 */
      if (scene) {
        const y = mode === 'battle' ? 748 : 620;
        const h = 660;
        const scale = Math.max(720 / scene.width, h / scene.height);
        const sw = 720 / scale;
        const sh = h / scale;
        const sx = (scene.width - sw) / 2;
        const sy = Math.max(0, scene.height - sh);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(scene, sx, sy, sw, sh, 0, y, 720, h);
        const shade = ctx.createLinearGradient(0, y, 0, 1280);
        shade.addColorStop(0, 'rgba(5,10,19,0.20)');
        shade.addColorStop(0.24, 'rgba(5,10,19,0.52)');
        shade.addColorStop(1, 'rgba(5,10,19,0.70)');
        rect(ctx, 0, y, 720, h, shade);
        ctx.restore();
      }
      /* 顶部细金属压边沿用《再上一层》蓝钢与暖金组合。 */
      rect(ctx, 0, 0, 720, 2, 'rgba(201,150,76,0.75)');
      rect(ctx, 0, 3, 720, 1, 'rgba(127,157,190,0.50)');
    },

    panel(ctx, r, accent) {
      const a = accent || COLORS.blue;
      ctx.save();
      rect(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, '#050a12');
      rect(ctx, r.x, r.y, r.w, r.h, '#0b1422');
      const pattern = texture(ctx, 'tile.floor', 64);
      if (pattern) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = pattern;
        ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
        ctx.restore();
      }
      rect(ctx, r.x + 3, r.y + 3, r.w - 6, Math.min(4, r.h - 6), 'rgba(194,215,235,0.13)');
      ctx.strokeStyle = '#627b98';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.strokeStyle = a;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 5.5, r.y + 5.5, r.w - 11, r.h - 11);
      rect(ctx, r.x + 8, r.y + 8, Math.min(30, r.w - 16), 2, a);
      rect(ctx, r.x + r.w - 10, r.y + 8, 2, 2, '#e5bd78');
      rect(ctx, r.x + 8, r.y + r.h - 10, 2, 2, '#e5bd78');
      ctx.restore();
    },

    buttonFrame(ctx, r, color, disabled) {
      const base = disabled ? '#26303e' : (color || '#314e73');
      ctx.save();
      rect(ctx, r.x - 1, r.y + 2, r.w + 2, r.h, '#050a12');
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, TD.U.shade(base, 0.15));
      g.addColorStop(0.16, TD.U.shade(base, 0.05));
      g.addColorStop(1, TD.U.shade(base, -0.30));
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      rect(ctx, r.x + 3, r.y + 3, r.w - 6, 2, disabled ? '#4a5664' : 'rgba(228,238,247,0.36)');
      ctx.strokeStyle = disabled ? '#596575' : '#829ab2';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.strokeStyle = disabled ? '#303a47' : '#c9964c';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 4.5, r.y + 4.5, r.w - 9, r.h - 9);
      ctx.restore();
    },

    slot(ctx, r, active) {
      const accent = typeof active === 'string' ? active : (active ? COLORS.gold : '#63778e');
      this.panel(ctx, r, accent);
      rect(ctx, r.x + 10, r.y + r.h - 11, r.w - 20, 2, 'rgba(7,12,20,0.65)');
    },

    icon(ctx, id, x, y, size) {
      let img = null, sx = 0, sy = 0, sw = 0, sh = 0;
      if (id === 'heart' || id === 'coin' || id === 'attack' || id === 'shield' || id === 'stairs') {
        img = shared('ui.hud');
        const cell = 443;
        const index = { heart: 0, coin: 1, attack: 2, shield: 3, stairs: 4 }[id];
        sx = index === 4 ? 0 : index * cell;
        sy = index === 4 ? cell : 0;
        sw = sh = cell;
      } else if (id === 'currency' || id === 'potion' || id === 'coinSmall' || id === 'sword' || id === 'crest' || id === 'rune') {
        img = shared('item.basic');
        const index = { currency: 0, potion: 1, coinSmall: 2, sword: 3, crest: 4, rune: 5 }[id];
        sx = (index % 3) * 128; sy = Math.floor(index / 3) * 128; sw = sh = 128;
      } else if (id === 'book' || id === 'skull' || id === 'statue' || id === 'restart' || id === 'settings') {
        img = shared('ui.nav');
        const index = { book: 3, skull: 1, statue: 2, restart: 4, settings: 5 }[id];
        sx = (index % 2) * 512; sy = Math.floor(index / 2) * 512; sw = sh = 512;
      }
      if (!img) return false;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      ctx.restore();
      return true;
    },

    drawMapField(ctx, bounds, mapId) {
      const theme = this.mapTheme(mapId);
      const wall = texture(ctx, 'tile.wall', 64);
      rect(ctx, bounds.x, bounds.y, bounds.w, bounds.h, '#111b29');
      if (wall) {
        ctx.fillStyle = wall;
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      }
      rect(ctx, bounds.x, bounds.y, bounds.w, bounds.h, theme.tint);
      ctx.strokeStyle = '#070c14'; ctx.lineWidth = 8;
      ctx.strokeRect(bounds.x + 1, bounds.y + 1, bounds.w - 2, bounds.h - 2);
      ctx.strokeStyle = '#8394a5'; ctx.lineWidth = 2;
      ctx.strokeRect(bounds.x + 4, bounds.y + 4, bounds.w - 8, bounds.h - 8);
      ctx.strokeStyle = 'rgba(211,174,112,0.68)'; ctx.lineWidth = 1;
      ctx.strokeRect(bounds.x + 7, bounds.y + 7, bounds.w - 14, bounds.h - 14);
    },

    drawRoad(ctx, pts, mapId, lineWidth) {
      const theme = this.mapTheme(mapId);
      const w = lineWidth || 52;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      this.tracePath(ctx, pts);
      ctx.strokeStyle = '#070b12'; ctx.lineWidth = w + 9; ctx.stroke();
      this.tracePath(ctx, pts);
      const floor = texture(ctx, 'tile.floor', 64);
      ctx.strokeStyle = floor || '#505e6e'; ctx.lineWidth = w; ctx.stroke();
      this.tracePath(ctx, pts);
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = theme.tint; ctx.lineWidth = w - 3; ctx.stroke();
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = '#d5d9df'; ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 10]); ctx.stroke();
      ctx.restore();
    },

    tracePath(ctx, pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    },

    drawPortal(ctx, p, time) {
      const img = shared('tile.portal');
      if (!img) return false;
      const pulse = 1 + Math.sin((time || 0) * 3.5) * 0.035;
      const size = 60 * pulse;
      const centerX = Math.max(size / 2 + 2, Math.min(718 - size / 2, p.x + 10));
      ctx.save(); ctx.imageSmoothingEnabled = false;
      const cellW = img.width / 2;
      const cellH = img.height / 2;
      ctx.drawImage(img, 0, cellH, cellW, cellH, centerX - size / 2, p.y - size / 2, size, size);
      ctx.restore();
      return centerX;
    },

    drawGate(ctx, p, mapId) {
      const img = shared('tile.environment');
      if (!img) return false;
      const col = this.mapTheme(mapId).gate;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, col * 128, 128, 128, 128, p.x - 38, p.y - 38, 76, 76);
      ctx.restore();
      return true;
    },

    drawMapThumb(ctx, map, r) {
      const theme = this.mapTheme(map.id);
      this.panel(ctx, r, theme.accent);
      const wall = texture(ctx, 'tile.wall', 32);
      if (wall) { ctx.fillStyle = wall; ctx.fillRect(r.x + 7, r.y + 7, r.w - 14, r.h - 14); }
      rect(ctx, r.x + 7, r.y + 7, r.w - 14, r.h - 14, theme.tint);
      const B = map.bounds;
      const pts = map.path.map(function (p) {
        return { x: r.x + 8 + (p.x - B.x) * (r.w - 16) / B.w,
          y: r.y + 8 + (p.y - B.y) * (r.h - 16) / B.h };
      });
      this.tracePath(ctx, pts);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = '#080d16'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = '#aeb8c2'; ctx.lineWidth = 3; ctx.stroke();
    },
  };

  TD.Art = Art;
})();
