/* 魔塔 50 层 · 图形层
 * 全部用 Canvas 现画，不依赖任何图片素材 —— 这样整个游戏就是几个 .js 文件，
 * 双击 index.html 就能玩，也不会牵扯到任何原版美术的版权。
 */
(function () {
  const MT = (window.MT = window.MT || {});
  const HERO_WALK = new Image();
  HERO_WALK.src = '美术/hero/勇者四向行走帧-八帧版.png';
  const HERO_BATTLE = new Image();
  HERO_BATTLE.src = 'assets/art/hero/battle-isolated.png';
  let heroReady = false;
  let heroBattleReady = false;
  let heroBattleCanvas = null;
  function hasArt(id) {
    return !!(MT.Art && MT.Art.manifest && MT.Art.manifest.assets[id] &&
      !(MT.Art.failures && MT.Art.failures.has(id)));
  }
  function drawArtOnly(ctx, id, x, y, w, h, frame) {
    if (!hasArt(id)) return false;
    return MT.Art.draw(ctx, id, x, y, w, h, frame);
  }
  HERO_WALK.onload = () => { heroReady = true; };
  HERO_BATTLE.onload = () => {
    // The extracted battle sheet has a one-pixel pale matte fringe. Remove
    // only neutral bright pixels touching transparent space; interior whites
    // (blade fills and armor highlights) stay intact behind their outlines.
    try {
      const canvas = document.createElement('canvas');
      canvas.width = HERO_BATTLE.naturalWidth;
      canvas.height = HERO_BATTLE.naturalHeight;
      const battleCtx = canvas.getContext('2d', { willReadFrequently: true });
      battleCtx.drawImage(HERO_BATTLE, 0, 0);
      const image = battleCtx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = image.data;
      const alpha = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = pixels[p];
      const trim = [];
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = y * canvas.width + x, p = i * 4;
        if (!alpha[i]) continue;
        const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        if (r < 190 || g < 190 || b < 190 || Math.max(r, g, b) - Math.min(r, g, b) >= 30) continue;
        if ((x > 0 && !alpha[i - 1]) || (x + 1 < canvas.width && !alpha[i + 1]) ||
            (y > 0 && !alpha[i - canvas.width]) || (y + 1 < canvas.height && !alpha[i + canvas.width])) trim.push(p);
      }
      for (const p of trim) pixels[p + 3] = 0;
      battleCtx.putImageData(image, 0, 0);
      heroBattleCanvas = canvas;
    } catch (_) {
      heroBattleCanvas = HERO_BATTLE;
    }
    heroBattleReady = true;
  };
  let heroDirection = 0;
  let heroMoving = false;
  let heroStepStart = 0;
  let heroMotionChangedAt = 0;
  let towerFloor = 1;
  function setTowerFloor(floor) { towerFloor = Number(floor) || 1; }
  function terrainTint(ctx, x, y, s, wall) {
    // 同一套砖的轻量色温变化：不改变格子、碰撞或存档数据。
    const tint = towerFloor >= 46 ? (wall ? 'rgba(89,54,111,.22)' : 'rgba(67,31,91,.20)')
      : towerFloor >= 40 ? (wall ? 'rgba(43,82,116,.18)' : 'rgba(28,66,105,.18)')
      : towerFloor >= 30 ? (wall ? 'rgba(63,52,104,.17)' : 'rgba(57,43,102,.16)')
      : towerFloor >= 15 ? (wall ? 'rgba(38,88,102,.14)' : 'rgba(25,76,95,.14)') : null;
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(x, y, s, s); }
  }
  function setHeroMotion(direction, moving) {
    if (direction) heroDirection = ({ down: 0, left: 1, right: 2, up: 3 }[direction] ?? heroDirection);
    const now = performance.now();
    if (moving && !heroMoving && now - heroMotionChangedAt > 80) heroStepStart = now;
    if (!!moving !== heroMoving) heroMotionChangedAt = now;
    heroMoving = !!moving;
  }

  const WALL_TOP = '#3b3f52';
  const WALL_BODY = '#1c2230';
  const WALL_EDGE = '#5c6884';
  const FLOOR_A = '#191d2b';
  const FLOOR_B = '#1f2434';

  function rr(ctx, x, y, w, h, r) {
    const k = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + w - k, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + k);
    ctx.lineTo(x + w, y + h - k);
    ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
    ctx.lineTo(x + k, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - k);
    ctx.lineTo(x, y + k);
    ctx.quadraticCurveTo(x, y, x + k, y);
    ctx.closePath();
  }

  function circle(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
  }

  /* ── 地形 ─────────────────────────────────────────────────── */
  function drawWall(ctx, x, y, s) {
    if (drawArtOnly(ctx, 'tile.wall', x, y, s, s, 0)) {
      terrainTint(ctx, x, y, s, true);
      return;
    }
    // 错缝石砖：砖缝用深色打底，砖块交错排布，顶部一条高光
    const bh = s / 4, bw = s / 2;
    ctx.fillStyle = WALL_BODY;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = WALL_TOP;
    for (let r = 0; r < 4; r++) {
      const off = (r % 2) ? -bw / 2 : 0;
      for (let c = -1; c < 3; c++) {
        const raw = x + off + c * bw;
        const bx = Math.max(x, raw), bwid = Math.min(x + s, raw + bw - 1) - bx;
        if (bwid > 0.5) ctx.fillRect(bx, y + r * bh + 0.5, bwid, bh - 1);
      }
    }
    ctx.fillStyle = WALL_EDGE;
    ctx.fillRect(x, y, s, Math.max(1, s * 0.06));
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(x, y + s - Math.max(1, s * 0.07), s, Math.max(1, s * 0.07));
  }

  function drawFloor(ctx, x, y, s, alt) {
    if (drawArtOnly(ctx, 'tile.floor', x, y, s, s, 0)) {
      terrainTint(ctx, x, y, s, false);
      return;
    }
    ctx.fillStyle = alt ? FLOOR_A : FLOOR_B;
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }

  /** 落石地：看起来随时会塌的石板，裂缝里有碎屑 */
  function drawRock(ctx, x, y, s) {
    if (MT.Art && MT.Art.previewTile(ctx, 'environment.rock', x, y, s, s, 0)) return;
    if (drawArtOnly(ctx, 'environment.rock', x, y, s, s, 0)) return;
    ctx.fillStyle = '#4a4640';
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#5d5850';
    ctx.fillRect(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88);
    ctx.strokeStyle = 'rgba(20,18,16,0.85)';
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.16, y + s * 0.22);
    ctx.lineTo(x + s * 0.5, y + s * 0.44);
    ctx.lineTo(x + s * 0.3, y + s * 0.74);
    ctx.moveTo(x + s * 0.5, y + s * 0.44);
    ctx.lineTo(x + s * 0.86, y + s * 0.32);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,200,120,0.35)';
    ctx.fillRect(x + s * 0.62, y + s * 0.66, s * 0.16, s * 0.1);
  }

  /** 守卫之锁：墙上嵌着会自行合拢的石板，中央一枚守卫的印记 */
  function drawGuardWall(ctx, x, y, s) {
    if (MT.Art && MT.Art.previewTile(ctx, 'mechanism.guardwall', x, y, s, s, 4)) return;
    if (drawArtOnly(ctx, 'mechanism.guardwall', x, y, s, s, 4)) return;
    drawWall(ctx, x, y, s);
    ctx.strokeStyle = '#6ad0e0';
    ctx.lineWidth = Math.max(1.4, s * 0.07);
    ctx.beginPath();
    ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.5, y + s * 0.26);
    ctx.lineTo(x + s * 0.5, y + s * 0.74);
    ctx.moveTo(x + s * 0.3, y + s * 0.5);
    ctx.lineTo(x + s * 0.7, y + s * 0.5);
    ctx.stroke();
  }

  /** 道具封印门：一扇没有锁孔的门，门心上刻着道具的轮廓 */
  function drawGate(ctx, x, y, s) {
    if (MT.Art && MT.Art.previewTile(ctx, 'mechanism.gate', x, y, s, s, 5)) return;
    if (drawArtOnly(ctx, 'mechanism.gate', x, y, s, s, 5)) return;
    drawFloor(ctx, x, y, s, false);
    ctx.fillStyle = '#3d3560';
    rr(ctx, x + s * 0.08, y + s * 0.04, s * 0.84, s * 0.92, s * 0.1);
    ctx.fill();
    ctx.fillStyle = '#6f5fb8';
    rr(ctx, x + s * 0.15, y + s * 0.1, s * 0.7, s * 0.8, s * 0.08);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,220,255,0.85)';
    ctx.lineWidth = Math.max(1.2, s * 0.055);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.5, y + s * 0.24);
    ctx.lineTo(x + s * 0.5, y + s * 0.7);
    ctx.moveTo(x + s * 0.36, y + s * 0.36);
    ctx.lineTo(x + s * 0.64, y + s * 0.36);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x + s * 0.5, y + s * 0.78, s * 0.08, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawLava(ctx, x, y, s, t) {
    if (MT.Art && MT.Art.previewTile(ctx, 'environment.lava', x, y, s, s, 1)) return;
    if (drawArtOnly(ctx, 'environment.lava', x, y, s, s, 1)) return;
    ctx.fillStyle = '#3a1410';
    ctx.fillRect(x, y, s, s);
    const grd = ctx.createLinearGradient(x, y, x, y + s);
    grd.addColorStop(0, '#ff8a2a');
    grd.addColorStop(0.5, '#d43a12');
    grd.addColorStop(1, '#7a1d08');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.34);
    for (let i = 0; i <= 4; i++) {
      const px = x + (s * i) / 4;
      ctx.lineTo(px, y + s * (0.3 + Math.sin(t / 420 + i) * 0.06));
    }
    ctx.lineTo(x + s, y + s);
    ctx.lineTo(x, y + s);
    ctx.closePath();
    ctx.fill();
  }

  function drawStairs(ctx, x, y, s, dir) {
    if (MT.Art && MT.Art.previewTile(ctx, dir > 0 ? 'stairs.up' : 'stairs.down', x, y, s, s, dir > 0 ? 0 : 1)) return;
    drawFloor(ctx, x, y, s, false);
    if (drawArtOnly(ctx, dir > 0 ? 'stairs.up' : 'stairs.down', x, y, s, s, dir > 0 ? 0 : 1)) return;
    // 阴影先画在台阶下方，强化“向上/向下”的空间方向。
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x + s * .18, y + s * .77, s * .64, s * .1);
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const w = s * (0.72 - i * 0.13);
      const sh = s * 0.15;
      const sy = dir > 0 ? y + s * 0.78 - i * sh : y + s * 0.22 + i * sh;
      ctx.fillStyle = i % 2 ? '#8d94ad' : '#aeb6cd';
      ctx.fillRect(x + (s - w) / 2, sy, w, sh * 0.92);
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(x + (s - w) / 2, sy, w, Math.max(1, s * .025));
    }
    ctx.fillStyle = dir > 0 ? '#9ff0a8' : '#f0c49a';
    ctx.beginPath();
    const cx = x + s / 2;
    if (dir > 0) {
      ctx.moveTo(cx, y + s * 0.06);
      ctx.lineTo(cx - s * 0.14, y + s * 0.26);
      ctx.lineTo(cx + s * 0.14, y + s * 0.26);
    } else {
      ctx.moveTo(cx, y + s * 0.94);
      ctx.lineTo(cx - s * 0.14, y + s * 0.74);
      ctx.lineTo(cx + s * 0.14, y + s * 0.74);
    }
    ctx.closePath();
    ctx.fill();
    if (MT.Art) MT.Art.draw(ctx, dir > 0 ? 'stairs.up' : 'stairs.down', x, y, s, s, dir > 0 ? 0 : 1);
  }

  function drawPortal(ctx, x, y, s, t) {
    if (MT.Art && MT.Art.previewTile(ctx, 'teleporter', x, y, s, s, Math.floor((t || 0) / 250) % 2 + 2)) return;
    drawFloor(ctx, x, y, s, true);
    if (drawArtOnly(ctx, 'teleporter', x, y, s, s, Math.floor((t || 0) / 250) % 2 + 2)) return;
    const cx = x + s / 2, cy = y + s / 2;
    const pulse = 0.82 + Math.sin(t / 300) * 0.12;
    const grd = ctx.createRadialGradient(cx, cy, s * 0.04, cx, cy, s * 0.46 * pulse);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.35, '#8be8ff');
    grd.addColorStop(1, 'rgba(60,120,255,0)');
    ctx.fillStyle = grd;
    circle(ctx, cx, cy, s * 0.46 * pulse);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,240,255,0.75)';
    ctx.lineWidth = Math.max(1, s * 0.045);
    for (let i = 0; i < 2; i++) {
      const r = s * (0.16 + i * 0.14) * pulse;
      ctx.beginPath();
      ctx.arc(cx, cy, r, t / 300 + i, t / 300 + i + 4.2);
      ctx.stroke();
    }
    if (MT.Art) MT.Art.draw(ctx, 'teleporter', x, y, s, s, Math.floor((t || 0) / 250) % 2 + 2);
  }

  /* ── 门 / 钥匙 / 道具 ─────────────────────────────────────── */
  const DOOR_COLORS = {
    yellow: ['#c9a227', '#7d6512'],
    blue: ['#3f6fd8', '#1d3a7d'],
    red: ['#c0392b', '#701c14'],
    flower: ['#b45ad8', '#5e1d78']
  };

  function drawDoor(ctx, x, y, s, color, direction) {
    const doorId = 'door.' + (color === 'flower' ? 'flower' : color);
    const colorRow = color === 'yellow' ? 0 : color === 'blue' ? 1 : color === 'red' ? 2 : 3;
    const dir = Math.max(0, Math.min(3, direction || 0));
    const orientation = (dir === 0 || dir === 3) ? 0 : 1;
    const doorFrame = colorRow * 2 + orientation;
    if (MT.Art && MT.Art.previewTile(ctx, doorId, x, y, s, s, doorFrame)) return;
    drawFloor(ctx, x, y, s, false);
    if (drawArtOnly(ctx, doorId, x, y, s, s, doorFrame)) return;
    const c = DOOR_COLORS[color] || DOOR_COLORS.yellow;
    ctx.fillStyle = c[1];
    rr(ctx, x + s * 0.1, y + s * 0.06, s * 0.8, s * 0.88, s * 0.1);
    ctx.fill();
    ctx.fillStyle = c[0];
    rr(ctx, x + s * 0.16, y + s * 0.12, s * 0.68, s * 0.76, s * 0.08);
    ctx.fill();
    // 门板竖向高光与底部阴影，颜色不再只是整块换色。
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(x + s * .2, y + s * .15, s * .06, s * .62);
    ctx.fillStyle = 'rgba(0,0,0,.24)';
    ctx.fillRect(x + s * .2, y + s * .78, s * .6, s * .06);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.04);
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + s * 0.16, y + s * (0.12 + i * 0.25));
      ctx.lineTo(x + s * 0.84, y + s * (0.12 + i * 0.25));
      ctx.stroke();
    }
    ctx.fillStyle = '#ffe9a8';
    circle(ctx, x + s * 0.72, y + s * 0.52, s * 0.055);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    circle(ctx, x + s * .705, y + s * .505, s * .018);
    ctx.fill();
    if (MT.Art) {
      const doorId = 'door.' + (color === 'flower' ? 'flower' : color === 'blue' ? 'blue' : color === 'red' ? 'red' : 'yellow');
      const doorFrame = doorId === 'door.yellow' ? 0 : doorId === 'door.blue' ? 1 : doorId === 'door.red' ? 2 : 3;
      MT.Art.draw(ctx, doorId, x, y, s, s, doorFrame);
    }
  }

  function drawKey(ctx, x, y, s, tint) {
    const keyId = tint === '#e8c73a' ? 'key.yellow' : tint === '#4a7fe8' ? 'key.blue' : tint === '#d8483a' ? 'key.red' : 'key.master';
    const keyFrame = keyId === 'key.yellow' ? 0 : keyId === 'key.blue' ? 1 : keyId === 'key.red' ? 2 : 3;
    if (MT.Art && MT.Art.previewTile(ctx, keyId, x, y, s, s, keyFrame)) return;
    if (hasArt(keyId)) {
      const drawn = drawArtOnly(ctx, keyId, x, y, s, s, keyFrame);
      if (drawn) return;
    }
    const cx = x + s * 0.4, cy = y + s * 0.36, r = s * 0.14;
    ctx.strokeStyle = tint;
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.lineCap = 'round';
    circle(ctx, cx, cy, r);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + r);
    ctx.lineTo(cx, y + s * 0.84);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, y + s * 0.68);
    ctx.lineTo(cx + s * 0.16, y + s * 0.68);
    ctx.moveTo(cx, y + s * 0.8);
    ctx.lineTo(cx + s * 0.14, y + s * 0.8);
    ctx.stroke();
  }

  function drawGem(ctx, x, y, s, tint) {
    if (MT.Art && MT.Art.previewTile(ctx, 'item.gem', x, y, s, s, 0)) return;
    if (drawArtOnly(ctx, 'item.gem', x, y, s, s, 0)) return;
    const cx = x + s / 2;
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(cx, y + s * 0.2);
    ctx.lineTo(x + s * 0.8, y + s * 0.46);
    ctx.lineTo(cx, y + s * 0.84);
    ctx.lineTo(x + s * 0.2, y + s * 0.46);
    ctx.closePath();
    ctx.fill();
    if (MT.Art) MT.Art.draw(ctx, 'item.gem', x, y, s, s, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(cx, y + s * 0.2);
    ctx.lineTo(x + s * 0.8, y + s * 0.46);
    ctx.lineTo(cx, y + s * 0.52);
    ctx.closePath();
    ctx.fill();
  }

  function drawPotion(ctx, x, y, s, tint) {
    if (MT.Art && MT.Art.previewTile(ctx, 'item.potion', x, y, s, s, 1)) return;
    if (drawArtOnly(ctx, 'item.potion', x, y, s, s, 1)) return;
    ctx.fillStyle = '#8b93a8';
    ctx.fillRect(x + s * 0.42, y + s * 0.14, s * 0.16, s * 0.14);
    ctx.fillStyle = tint;
    rr(ctx, x + s * 0.26, y + s * 0.28, s * 0.48, s * 0.56, s * 0.16);
    ctx.fill();
    if (MT.Art) MT.Art.draw(ctx, 'item.potion', x, y, s, s, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x + s * 0.34, y + s * 0.38, s * 0.08, s * 0.26);
  }

  function drawCoin(ctx, x, y, s, tint) {
    if (MT.Art && MT.Art.previewTile(ctx, 'item.coin', x, y, s, s, 2)) return;
    if (drawArtOnly(ctx, 'item.coin', x, y, s, s, 2)) return;
    const cx = x + s / 2, cy = y + s / 2;
    ctx.fillStyle = tint;
    circle(ctx, cx, cy, s * 0.3);
    ctx.fill();
    if (MT.Art) MT.Art.draw(ctx, 'item.coin', x, y, s, s, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = 'bold ' + Math.floor(s * 0.34) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', cx, cy + s * 0.02);
  }

  function drawSword(ctx, x, y, s, tint) {
    if (MT.Art && MT.Art.previewTile(ctx, 'item.sword', x, y, s, s, 3)) return;
    if (drawArtOnly(ctx, 'item.sword', x, y, s, s, 3)) return;
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = tint;
    ctx.fillRect(-s * 0.05, -s * 0.38, s * 0.1, s * 0.56);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.46);
    ctx.lineTo(s * 0.08, -s * 0.3);
    ctx.lineTo(-s * 0.08, -s * 0.3);
    ctx.closePath();
    ctx.fill();
    if (MT.Art) MT.Art.draw(ctx, 'item.sword', x, y, s, s, 3);
    ctx.fillStyle = '#7a5a30';
    ctx.fillRect(-s * 0.2, s * 0.16, s * 0.4, s * 0.07);
    ctx.fillRect(-s * 0.05, s * 0.16, s * 0.1, s * 0.2);
    ctx.restore();
  }

  function drawShield(ctx, x, y, s, tint) {
    if (MT.Art && MT.Art.previewTile(ctx, 'item.shield', x, y, s, s, 4)) return;
    if (drawArtOnly(ctx, 'item.shield', x, y, s, s, 4)) return;
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.5, y + s * 0.14);
    ctx.lineTo(x + s * 0.82, y + s * 0.28);
    ctx.lineTo(x + s * 0.78, y + s * 0.62);
    ctx.lineTo(x + s * 0.5, y + s * 0.86);
    ctx.lineTo(x + s * 0.22, y + s * 0.62);
    ctx.lineTo(x + s * 0.18, y + s * 0.28);
    ctx.closePath();
    ctx.fill();
    if (MT.Art) MT.Art.draw(ctx, 'item.shield', x, y, s, s, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.stroke();
  }

  function drawCross(ctx, x, y, s, tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(x + s * 0.42, y + s * 0.14, s * 0.16, s * 0.72);
    ctx.fillRect(x + s * 0.18, y + s * 0.34, s * 0.64, s * 0.16);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + s * 0.42, y + s * 0.14, s * 0.06, s * 0.72);
  }

  function drawHolyWater(ctx, x, y, s, tint) {
    ctx.fillStyle = '#dfe6f2';
    ctx.fillRect(x + s * 0.44, y + s * 0.1, s * 0.12, s * 0.12);
    ctx.fillStyle = tint;
    rr(ctx, x + s * 0.3, y + s * 0.2, s * 0.4, s * 0.62, s * 0.14);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    circle(ctx, x + s * 0.42, y + s * 0.4, s * 0.05);
    ctx.fill();
    ctx.fillStyle = '#fff7c8';
    ctx.font = Math.floor(s * 0.3) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('✦', x + s * 0.66, y + s * 0.34);
  }

  function drawTool(ctx, x, y, s, tint) {
    if (MT.Art && MT.Art.previewTile(ctx, 'item.artifact', x, y, s, s, 5)) return;
    if (drawArtOnly(ctx, 'item.artifact', x, y, s, s, 5)) return;
    ctx.fillStyle = tint;
    rr(ctx, x + s * 0.24, y + s * 0.36, s * 0.52, s * 0.42, s * 0.1);
    ctx.fill();
    if (MT.Art) MT.Art.draw(ctx, 'item.artifact', x, y, s, s, 5);
    ctx.fillStyle = '#5a4a34';
    ctx.fillRect(x + s * 0.4, y + s * 0.2, s * 0.2, s * 0.18);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.34, y + s * 0.66);
    ctx.lineTo(x + s * 0.66, y + s * 0.66);
    ctx.stroke();
  }

  /* ── 人物 ─────────────────────────────────────────────────── */
  function drawHeroFallback(ctx, x, y, s) {
    const cx = x + s / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, y + s * 0.86, s * 0.28, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    // 披风
    ctx.fillStyle = '#8f2f3a';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.26, y + s * 0.44);
    ctx.lineTo(cx + s * 0.26, y + s * 0.44);
    ctx.lineTo(cx + s * 0.3, y + s * 0.86);
    ctx.lineTo(cx - s * 0.3, y + s * 0.86);
    ctx.closePath();
    ctx.fill();
    // 身体
    ctx.fillStyle = '#dfe6f2';
    rr(ctx, cx - s * 0.16, y + s * 0.42, s * 0.32, s * 0.42, s * 0.08);
    ctx.fill();
    // 头盔
    ctx.fillStyle = '#c9d2e2';
    rr(ctx, cx - s * 0.18, y + s * 0.16, s * 0.36, s * 0.3, s * 0.12);
    ctx.fill();
    ctx.fillStyle = '#3b4256';
    ctx.fillRect(cx - s * 0.12, y + s * 0.32, s * 0.24, s * 0.06);
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.06, y + s * 0.1);
    ctx.lineTo(cx + s * 0.06, y + s * 0.1);
    ctx.lineTo(cx, y + s * 0.02);
    ctx.closePath();
    ctx.fill();
    // 剑
    ctx.fillStyle = '#eef2f8';
    ctx.fillRect(cx + s * 0.2, y + s * 0.28, s * 0.06, s * 0.5);
  }

  function drawHero(ctx, x, y, s, facing) {
    const dir = facing === undefined ? heroDirection : facing;
    if (!heroReady) return drawHeroFallback(ctx, x, y, s);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const sw = HERO_WALK.naturalWidth / 8, sh = HERO_WALK.naturalHeight / 4;
    // 待机与行走共用同一张图、同一格尺寸和锚点；正面选双脚落地帧。
    const frame = heroMoving && facing === undefined
      ? Math.floor((performance.now() - heroStepStart) / 45) % 8
      : (dir === 0 ? 6 : 0);
    ctx.drawImage(HERO_WALK, frame * sw, dir * sh, sw, sh, x, y, s, s);
    ctx.restore();
  }

  // 独立抠出的 8×2 共 16 帧，完整播放挥剑与收势；怪物回合停在末帧。
  function drawHeroBattle(ctx, x, y, s, progress, attacking) {
    if (!heroBattleReady) return drawHero(ctx, x, y, s, 2);
    const battleImage = heroBattleCanvas || HERO_BATTLE;
    const fw = battleImage.width / 8;
    const fh = battleImage.height / 2;
    const f = attacking ? Math.min(15, Math.floor(Math.max(0, Math.min(.999, progress)) * 16)) : 15;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(battleImage, (f % 8) * fw, Math.floor(f / 8) * fh, fw, fh,
      x - s * 0.1, y - s * 0.08, s * 1.2, s * 1.11);
    ctx.restore();
    return true;
  }

  const NPC_COLORS = {
    fairy: '#f0a6d8', thief: '#8f9bb3', elder: '#cfc7a8',
    merchant: '#b08a5a', shop: '#e0c04a', princess: '#f5e0ef'
  };

  function drawNpc(ctx, x, y, s, who) {
    const npcId = 'npc.' + who;
    const npcFrame = { fairy: 0, thief: 1, elder: 2, merchant: 3, shop: 4, princess: 5 }[who] || 0;
    if (MT.Art && MT.Art.previewTile(ctx, npcId, x, y, s, s, npcFrame)) return;
    if (drawArtOnly(ctx, npcId, x, y, s, s, npcFrame)) return;
    const cx = x + s / 2;
    const c = NPC_COLORS[who] || '#c9c9c9';
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, y + s * 0.85, s * 0.24, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(cx, y + s * 0.22);
    ctx.lineTo(cx + s * 0.26, y + s * 0.84);
    ctx.lineTo(cx - s * 0.26, y + s * 0.84);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2d9bd';
    circle(ctx, cx, y + s * 0.24, s * 0.13);
    ctx.fill();
    if (who === 'shop') {
      ctx.fillStyle = '#ffe98a';
      ctx.font = Math.floor(s * 0.26) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('$', cx, y + s * 0.62);
    }
    if (who === 'princess') {
      ctx.fillStyle = '#ffe98a';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18, y + s * 0.16);
      ctx.lineTo(cx, y + s * 0.04);
      ctx.lineTo(cx + s * 0.18, y + s * 0.16);
      ctx.closePath();
      ctx.fill();
    }
    if (MT.Art) {
      const ids = { fairy: 0, thief: 1, elder: 2, merchant: 3, shop: 4, princess: 5 };
      const frame = ids[who];
      if (frame !== undefined) MT.Art.draw(ctx, 'npc.' + who, x, y, s, s, frame);
    }
  }

  /* ── 符文石 / 石碑 ────────────────────────────────────────── */
  // 符文石：一块刻着字的方石。点亮时字会发光，熄灭时字是灰的。
  function drawRune(ctx, x, y, s, glyph, lit) {
    if (drawArtOnly(ctx, 'mechanism.rune', x, y, s, s, 2)) {
      ctx.save();
      if (!lit) { ctx.fillStyle = 'rgba(4,8,20,.32)'; ctx.fillRect(x, y, s, s); }
      ctx.font = 'bold ' + Math.floor(s * .37) + 'px "Songti SC",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = lit ? '#ffe69b' : '#c7c9dc';
      ctx.shadowColor = '#090e24'; ctx.shadowBlur = Math.max(2, s * .1);
      ctx.fillText(glyph || '?', x + s * .5, y + s * .51);
      ctx.restore();
      return;
    }
    const cx = x + s / 2, cy = y + s / 2;
    const glow = lit ? '#ffd76a' : '#6a7290';
    ctx.save();
    ctx.fillStyle = lit ? 'rgba(255,215,106,0.16)' : 'rgba(0,0,0,0.25)';
    rr(ctx, x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88, s * 0.14);
    ctx.fill();
    ctx.fillStyle = lit ? '#3a3524' : '#232a3c';
    rr(ctx, x + s * 0.13, y + s * 0.13, s * 0.74, s * 0.74, s * 0.1);
    ctx.fill();
    ctx.strokeStyle = glow;
    ctx.lineWidth = Math.max(1, s * (lit ? 0.05 : 0.03));
    rr(ctx, x + s * 0.13, y + s * 0.13, s * 0.74, s * 0.74, s * 0.1);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.floor(s * 0.52) + 'px "Songti SC","STSong",system-ui,serif';
    if (lit) { ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = s * 0.34; }
    ctx.fillStyle = glow;
    ctx.fillText(glyph || '?', cx, cy + s * 0.02);
    ctx.restore();
  }

  // 石碑：一块立着的残碑，上面有几行刻痕
  function drawStele(ctx, x, y, s) {
    if (MT.Art && MT.Art.previewTile(ctx, 'npc.stele', x, y, s, s, 3)) return;
    if (drawArtOnly(ctx, 'npc.stele', x, y, s, s, 3)) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x + s / 2, y + s * 0.88, s * 0.28, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8e8a7c';
    rr(ctx, x + s * 0.24, y + s * 0.14, s * 0.52, s * 0.7, s * 0.08);
    ctx.fill();
    ctx.fillStyle = '#6f6b5e';
    rr(ctx, x + s * 0.24, y + s * 0.14, s * 0.52, s * 0.12, s * 0.06);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,36,28,0.75)';
    ctx.lineWidth = Math.max(1, s * 0.03);
    for (let i = 0; i < 4; i++) {
      const ly = y + s * (0.32 + i * 0.13);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.32, ly);
      ctx.lineTo(x + s * (0.68 - (i % 2) * 0.1), ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── 怪物 ─────────────────────────────────────────────────── */
  function drawGear(ctx, x, y, s, gear) {
    for (const g of gear || []) {
      if (g === 'sword') {
        ctx.fillStyle = '#e6ecf6';
        ctx.fillRect(x + s * 0.72, y + s * 0.3, s * 0.07, s * 0.44);
      } else if (g === 'shield') {
        drawShield(ctx, x + s * 0.05, y + s * 0.34, s * 0.42, '#b9c3d6');
      } else if (g === 'crown') {
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.moveTo(x + s * 0.3, y + s * 0.2);
        ctx.lineTo(x + s * 0.4, y + s * 0.08);
        ctx.lineTo(x + s * 0.5, y + s * 0.2);
        ctx.lineTo(x + s * 0.6, y + s * 0.08);
        ctx.lineTo(x + s * 0.7, y + s * 0.2);
        ctx.lineTo(x + s * 0.66, y + s * 0.28);
        ctx.lineTo(x + s * 0.34, y + s * 0.28);
        ctx.closePath();
        ctx.fill();
      } else if (g === 'cape') {
        ctx.fillStyle = 'rgba(120,20,40,0.85)';
        ctx.beginPath();
        ctx.moveTo(x + s * 0.2, y + s * 0.4);
        ctx.lineTo(x + s * 0.8, y + s * 0.4);
        ctx.lineTo(x + s * 0.86, y + s * 0.86);
        ctx.lineTo(x + s * 0.14, y + s * 0.86);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function eyes(ctx, cx, cy, r, color) {
    ctx.fillStyle = color || '#ff5a5a';
    circle(ctx, cx - r * 1.6, cy, r);
    ctx.fill();
    circle(ctx, cx + r * 1.6, cy, r);
    ctx.fill();
  }

  function drawMonsterShape(ctx, shape, x, y, s, color, dark) {
    const cx = x + s / 2, cy = y + s / 2;
    switch (shape) {
      case 'slime':
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.36, y + s * 0.84);
        ctx.quadraticCurveTo(cx - s * 0.44, y + s * 0.2, cx, y + s * 0.18);
        ctx.quadraticCurveTo(cx + s * 0.44, y + s * 0.2, cx + s * 0.36, y + s * 0.84);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.32, y + s * 0.8);
        ctx.quadraticCurveTo(cx - s * 0.38, y + s * 0.26, cx, y + s * 0.24);
        ctx.quadraticCurveTo(cx + s * 0.38, y + s * 0.26, cx + s * 0.32, y + s * 0.8);
        ctx.closePath();
        ctx.fill();
        eyes(ctx, cx, y + s * 0.52, s * 0.055);
        break;
      case 'bat':
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.46, y + s * 0.4);
        ctx.lineTo(cx - s * 0.1, y + s * 0.5);
        ctx.lineTo(cx - s * 0.46, y + s * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.46, y + s * 0.4);
        ctx.lineTo(cx + s * 0.1, y + s * 0.5);
        ctx.lineTo(cx + s * 0.46, y + s * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        circle(ctx, cx, y + s * 0.52, s * 0.2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.16, y + s * 0.36);
        ctx.lineTo(cx - s * 0.06, y + s * 0.18);
        ctx.lineTo(cx + s * 0.02, y + s * 0.36);
        ctx.moveTo(cx + s * 0.16, y + s * 0.36);
        ctx.lineTo(cx + s * 0.06, y + s * 0.18);
        ctx.lineTo(cx - s * 0.02, y + s * 0.36);
        ctx.fill();
        eyes(ctx, cx, y + s * 0.52, s * 0.045);
        break;
      case 'bone':
        ctx.fillStyle = color;
        rr(ctx, cx - s * 0.24, y + s * 0.16, s * 0.48, s * 0.34, s * 0.14);
        ctx.fill();
        ctx.fillStyle = dark;
        circle(ctx, cx - s * 0.1, y + s * 0.3, s * 0.06);
        ctx.fill();
        circle(ctx, cx + s * 0.1, y + s * 0.3, s * 0.06);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillRect(cx - s * 0.05, y + s * 0.5, s * 0.1, s * 0.3);
        for (let i = 0; i < 3; i++) {
          const ry = y + s * (0.54 + i * 0.1);
          ctx.fillRect(cx - s * 0.2, ry, s * 0.4, s * 0.05);
        }
        break;
      case 'hood':
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(cx, y + s * 0.1);
        ctx.quadraticCurveTo(cx + s * 0.38, y + s * 0.3, cx + s * 0.3, y + s * 0.86);
        ctx.lineTo(cx - s * 0.3, y + s * 0.86);
        ctx.quadraticCurveTo(cx - s * 0.38, y + s * 0.3, cx, y + s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx, y + s * 0.2);
        ctx.quadraticCurveTo(cx + s * 0.26, y + s * 0.36, cx + s * 0.2, y + s * 0.7);
        ctx.lineTo(cx - s * 0.2, y + s * 0.7);
        ctx.quadraticCurveTo(cx - s * 0.26, y + s * 0.36, cx, y + s * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#120c1a';
        ctx.beginPath();
        ctx.ellipse(cx, y + s * 0.44, s * 0.16, s * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        eyes(ctx, cx, y + s * 0.44, s * 0.045, '#ffe08a');
        break;
      case 'cube':
        ctx.fillStyle = dark;
        rr(ctx, cx - s * 0.32, y + s * 0.24, s * 0.64, s * 0.56, s * 0.1);
        ctx.fill();
        ctx.fillStyle = color;
        rr(ctx, cx - s * 0.28, y + s * 0.28, s * 0.56, s * 0.48, s * 0.08);
        ctx.fill();
        ctx.fillStyle = '#101420';
        ctx.fillRect(cx - s * 0.22, y + s * 0.42, s * 0.44, s * 0.07);
        eyes(ctx, cx, y + s * 0.46, s * 0.04, '#9ff0ff');
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(cx - s * 0.28, y + s * 0.3, s * 0.56, s * 0.05);
        break;
      case 'knight':
        ctx.fillStyle = dark;
        rr(ctx, cx - s * 0.26, y + s * 0.4, s * 0.52, s * 0.42, s * 0.1);
        ctx.fill();
        ctx.fillStyle = color;
        rr(ctx, cx - s * 0.22, y + s * 0.16, s * 0.44, s * 0.34, s * 0.12);
        ctx.fill();
        ctx.fillStyle = '#0d1018';
        ctx.fillRect(cx - s * 0.18, y + s * 0.3, s * 0.36, s * 0.07);
        ctx.fillStyle = dark;
        ctx.fillRect(cx - s * 0.2, y + s * 0.56, s * 0.4, s * 0.06);
        break;
      case 'brute':
        ctx.fillStyle = dark;
        rr(ctx, cx - s * 0.32, y + s * 0.36, s * 0.64, s * 0.48, s * 0.12);
        ctx.fill();
        ctx.fillStyle = color;
        rr(ctx, cx - s * 0.24, y + s * 0.4, s * 0.48, s * 0.4, s * 0.1);
        ctx.fill();
        ctx.fillStyle = color;
        circle(ctx, cx, y + s * 0.26, s * 0.17);
        ctx.fill();
        eyes(ctx, cx, y + s * 0.26, s * 0.04);
        break;
      case 'wraith':
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(cx, y + s * 0.1);
        ctx.quadraticCurveTo(cx + s * 0.42, y + s * 0.34, cx + s * 0.32, y + s * 0.8);
        ctx.quadraticCurveTo(cx + s * 0.16, y + s * 0.68, cx, y + s * 0.86);
        ctx.quadraticCurveTo(cx - s * 0.16, y + s * 0.68, cx - s * 0.32, y + s * 0.8);
        ctx.quadraticCurveTo(cx - s * 0.42, y + s * 0.34, cx, y + s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        circle(ctx, cx, y + s * 0.38, s * 0.16);
        ctx.fill();
        eyes(ctx, cx, y + s * 0.38, s * 0.045, '#ff9a9a');
        break;
      case 'tentacle':
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(cx, y + s * 0.34, s * 0.34, s * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(cx, y + s * 0.32, s * 0.3, s * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        eyes(ctx, cx, y + s * 0.3, s * 0.05, '#101018');
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI + 0.2;
          const tx = cx + Math.cos(a) * s * 0.3;
          const ty = y + s * 0.5 + Math.sin(a) * s * 0.06;
          ctx.strokeStyle = i % 2 ? color : dark;
          ctx.lineWidth = s * 0.08;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.quadraticCurveTo(tx + Math.cos(a) * s * 0.1, ty + s * 0.28,
            tx + Math.cos(a) * s * 0.24, ty + s * 0.4);
          ctx.stroke();
        }
        break;
      case 'dragon':
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.42, y + s * 0.72);
        ctx.quadraticCurveTo(cx - s * 0.5, y + s * 0.24, cx - s * 0.06, y + s * 0.16);
        ctx.lineTo(cx + s * 0.18, y + s * 0.3);
        ctx.quadraticCurveTo(cx + s * 0.46, y + s * 0.5, cx + s * 0.34, y + s * 0.78);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.34, y + s * 0.68);
        ctx.quadraticCurveTo(cx - s * 0.4, y + s * 0.3, cx - s * 0.04, y + s * 0.24);
        ctx.lineTo(cx + s * 0.14, y + s * 0.36);
        ctx.quadraticCurveTo(cx + s * 0.36, y + s * 0.52, cx + s * 0.26, y + s * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffe08a';
        circle(ctx, cx - s * 0.12, y + s * 0.42, s * 0.05);
        ctx.fill();
        ctx.fillStyle = '#f5f0dd';
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.36, y + s * 0.24);
        ctx.lineTo(cx - s * 0.24, y + s * 0.02);
        ctx.lineTo(cx - s * 0.14, y + s * 0.24);
        ctx.closePath();
        ctx.fill();
        break;
      default:
        ctx.fillStyle = color;
        ctx.fillRect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56);
    }
  }

  function drawMonster(ctx, ch, x, y, s) {
    const id = 'monster.' + ch + '.idle';
    const now = performance.now();
    const batRow = { '3': 0, A: 1, S: 2 }[ch];
    const frame = batRow !== undefined ? batRow * 4 + Math.floor(now / 190) % 4
      : ch === '!' ? Math.floor(now / 190) % 8 : MT.Art ? MT.Art.frame(id, 'idle', now) : 0;
    if (MT.Art && MT.Art.previewTile(ctx, id, x, y, s, s, frame)) return;
    const m = MT.MONSTERS[ch];
    if (!m) return;
    // 新资源存在时只绘制一次；加载失败后才回退到旧 Canvas，避免两套图重叠。
    const assetReady = MT.Art && MT.Art.manifest && MT.Art.manifest.assets[id] &&
      !(MT.Art.failures && MT.Art.failures.has(id));
    // 图片只有在本帧已经同步画出时才结束；首次加载期间继续画旧版占位，
    // 避免怪物所在格短暂变成空地。
    if (assetReady) {
      ctx.save();
      if (s <= 80) {
        if (!['1', '2', '9', '3', 'A', 'S', '!'].includes(ch)) {
          const phase = ch.charCodeAt(0) * .31;
          ctx.translate(Math.sin(now / 420 + phase) * .85, Math.sin(now / 570 + phase) * .65);
        }
      }
      const drawn = MT.Art.draw(ctx, id, x, y, s, s, frame);
      ctx.restore();
      if (drawn) return;
    }
    drawMonsterShape(ctx, m.art[0], x, y, s, m.art[1], m.art[2]);
    drawGear(ctx, x, y, s, m.gear);
  }

  /* ── 入口 ─────────────────────────────────────────────────── */
  MT.Sprites = {
    drawWall, drawFloor, drawLava, drawStairs, drawPortal,
    drawRock, drawGuardWall, drawGate,
    drawDoor, drawKey, drawGem, drawPotion, drawCoin, drawSword, drawShield,
    drawCross, drawHolyWater, drawTool, drawHero, drawHeroBattle, drawNpc, drawMonster, setHeroMotion,
    drawMonsterShape, drawRune, drawStele, setTowerFloor, rr
  };
})();
