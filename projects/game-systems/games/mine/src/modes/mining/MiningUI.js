/* 界面层（设计规格 §17 / §28 / §58～§63 / §82）：
 *   - 顶部：地下矿坑 / 深度 X/45m / 体力（分段条）/ 探索价值；
 *   - 中央：纵向滚动矿坑地图 + 右侧深度尺（§17）；地形/矿物/线索由 MiningArt 绘制；
 *   - 底部：炸药 / 强化矿镐 / 探矿灯工具条 + 音效 / 调试 +「返回入口（免费移动）」+「结束探索（基础价值结算）」；
 *   - 图层：地图 → 角色与光 → 特效 → UI → 演出/弹窗 → 结算面板。
 * 所有点击热区写入 mode.hit，供场景的 update() 判定。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const LAYOUT = {
    W: 720, H: 1280,
    HUD_H: 292,
    MAP_X: 72, MAP_TOP: 300, MAP_BOTTOM: 1060,
    TILE: 64,
    HINT_Y: 1092, TOOL_Y: 1120, TOOL_H: 62,
    BTN_Y: 1192, BTN_H: 76,
    FOOTER_Y: 1112, FOOTER_H: 156,
  };

  function setViewportHeight(height) {
    const h = Math.max(1280, Math.round(height || 1280));
    LAYOUT.H = h;
    LAYOUT.BTN_H = 76;
    LAYOUT.BTN_Y = h - 88;
    LAYOUT.TOOL_H = 62;
    LAYOUT.TOOL_Y = LAYOUT.BTN_Y - 72;
    LAYOUT.HINT_Y = LAYOUT.TOOL_Y - 28;
    LAYOUT.MAP_BOTTOM = Math.max(LAYOUT.MAP_TOP + 560, LAYOUT.HINT_Y - 32);
    LAYOUT.FOOTER_Y = LAYOUT.TOOL_Y - 8;
    LAYOUT.FOOTER_H = h - LAYOUT.FOOTER_Y - 12;
  }

  const THEME = {
    canvas: '#0a0d14', panel: '#131a29', panelRaised: '#1a2435',
    border: '#2b3a58', borderLight: '#52647f', text: '#e8eef8', muted: '#8fa3c4',
    gold: '#ffd75e', blue: '#9fd0ff', green: '#9fe08a', warning: '#ff9a6b',
  };

  function bevelPath(ctx, x, y, w, h, c) {
    const k = Math.max(4, Math.min(c || 9, Math.floor(Math.min(w, h) / 3)));
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + w - k, y);
    ctx.lineTo(x + w - k / 2, y + 3);
    ctx.lineTo(x + w - 3, y + k / 2);
    ctx.lineTo(x + w, y + k);
    ctx.lineTo(x + w, y + h - k);
    ctx.lineTo(x + w - 3, y + h - k / 2);
    ctx.lineTo(x + w - k / 2, y + h - 3);
    ctx.lineTo(x + w - k, y + h);
    ctx.lineTo(x + k, y + h);
    ctx.lineTo(x + k / 2, y + h - 3);
    ctx.lineTo(x + 3, y + h - k / 2);
    ctx.lineTo(x, y + h - k);
    ctx.lineTo(x, y + k);
    ctx.lineTo(x + 3, y + k / 2);
    ctx.lineTo(x + k / 2, y + 3);
    ctx.closePath();
  }

  function pixelRivet(ctx, x, y, color) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(x, y, 8, 8);
    ctx.fillStyle = color || '#d39a47';
    ctx.fillRect(x + 1, y + 1, 6, 2);
    ctx.fillRect(x + 1, y + 1, 2, 6);
    ctx.fillStyle = 'rgba(255,232,172,0.85)';
    ctx.fillRect(x + 2, y + 2, 2, 1);
    ctx.fillStyle = 'rgba(7,11,18,0.75)';
    ctx.fillRect(x + 5, y + 5, 2, 2);
  }

  function cornerPlate(ctx, x, y, size, color, flipX, flipY) {
    ctx.save();
    ctx.translate(x + (flipX ? size : 0), y + (flipY ? size : 0));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(size, 0); ctx.lineTo(size, 4);
    ctx.lineTo(8, 4); ctx.lineTo(4, 8); ctx.lineTo(4, size); ctx.lineTo(0, size); ctx.closePath();
    ctx.fillStyle = '#111a28'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = color || '#bd8d4b'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,238,196,0.72)'; ctx.fillRect(6, 6, 3, 2);
    ctx.fillStyle = 'rgba(5,9,15,0.85)'; ctx.fillRect(8, 8, 2, 2);
    ctx.restore();
  }

  const skin = window.CampSkin;
  function drawPanel(ctx, rect, opt) {
    if(UI.recordOverlay){const a=UI.overlayBounds;if(!a)UI.overlayBounds={...rect};else{const x=Math.min(a.x,rect.x),y=Math.min(a.y,rect.y);UI.overlayBounds={x,y,w:Math.max(a.x+a.w,rect.x+rect.w)-x,h:Math.max(a.y+a.h,rect.y+rect.h)-y};}}
    ctx.save();
    const {x,y,w,h}=rect;
    if(window.WoodUI?.paint(ctx,'panel',rect)){ctx.restore();return;}
    const g=ctx.createLinearGradient(0,y,0,y+h);
    g.addColorStop(0,skin.paper);g.addColorStop(1,skin.paper);
    MM.U.fillRound(ctx,x,y+1,w,h,16,skin.line);
    MM.U.fillRound(ctx,x,y,w,h-3,16,g);
    MM.U.strokeRound(ctx,x,y,w,h-3,16,skin.line,2);
    ctx.restore();
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = MM.U.clamp(Math.round(((n >> 16) & 255) * k), 0, 255);
    const g = MM.U.clamp(Math.round(((n >> 8) & 255) * k), 0, 255);
    const b = MM.U.clamp(Math.round((n & 255) * k), 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function button(ctx, rect, label, opt) {
    const o=opt||{},disabled=!!o.disabled;
    const {x,y,w,h}=rect;
    const fill=disabled?'#dfd6c1':o.armed?'#d7e2bb':skin.wood;
    ctx.save();
    const painted=window.WoodUI?.paint(ctx,o.armed||o.primary?'primary':'secondary',rect,{disabled});
    if(!painted){
    MM.U.fillRound(ctx,x,y+1,w,h-4,14,skin.line);
    MM.U.fillRound(ctx,x,y,w,h-4,14,fill);
    MM.U.strokeRound(ctx,x,y,w,h-4,14,o.armed?skin.green:skin.line,o.armed?4:2);
    }
    const lines=String(label).split('\n');
    const iconSize=o.icon?Math.min(o.iconSize||38,h-14):0;
    if(o.icon&&MM.Assets)MM.Assets.drawIcon(ctx,o.icon,x+10,y+(h-iconSize)/2,iconSize,disabled?.5:1);
    const tx=o.icon?x+iconSize+20:x+w/2,align=o.icon?'left':'center',space=o.icon?w-iconSize-30:w-18;
    lines.forEach((line,i)=>{
      const size=MM.U.fitSize(ctx,line,space,lines.length===1?(o.small?25:28):25,true);
      MM.U.text(ctx,line,tx,y+h/2+(i-(lines.length-1)/2)*25,size,disabled?skin.muted:skin.ink,align,i===0);
    });ctx.restore();
  }

  function speaker(ctx, rect, enabled) {
    /* 以喇叭和声波/静音符号的整体边界对齐按钮中心。 */
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const x = Math.round(cx - 15), y = Math.round(cy - 16);
    ctx.save();
    ctx.fillStyle = '#5c3b21';
    ctx.fillRect(x + 1, y + 10, 7, 13);
    ctx.fillRect(x + 8, y + 6, 5, 21);
    ctx.fillRect(x + 13, y + 2, 6, 29);
    if (enabled) {
      ctx.strokeStyle = '#815a32';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 22, y + 8); ctx.lineTo(x + 27, y + 13);
      ctx.lineTo(x + 27, y + 20); ctx.lineTo(x + 22, y + 25);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#a84832';
      ctx.fillRect(x + 22, y + 8, 3, 18);
      ctx.fillRect(x + 19, y + 12, 10, 3);
      ctx.fillRect(x + 19, y + 21, 10, 3);
    }
    ctx.restore();
  }

  function gear(ctx, rect) {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    ctx.save();
    ctx.fillStyle = '#5c3b21';
    ctx.fillRect(cx - 5, cy - 21, 10, 7);
    ctx.fillRect(cx - 5, cy + 14, 10, 7);
    ctx.fillRect(cx - 21, cy - 5, 7, 10);
    ctx.fillRect(cx + 14, cy - 5, 7, 10);
    ctx.fillRect(cx - 15, cy - 15, 8, 7);
    ctx.fillRect(cx + 7, cy - 15, 8, 7);
    ctx.fillRect(cx - 15, cy + 8, 8, 7);
    ctx.fillRect(cx + 7, cy + 8, 8, 7);
    ctx.fillStyle = '#a47b50';
    ctx.fillRect(cx - 12, cy - 12, 24, 24);
    ctx.fillStyle = '#f7e8ce';
    ctx.fillRect(cx - 6, cy - 6, 12, 12);
    ctx.fillStyle = '#5c3b21';
    ctx.fillRect(cx - 3, cy - 3, 6, 6);
    ctx.restore();
  }

  function drawMinecartIcon(ctx, x, y, s) {
    const k = s / 48;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(k, k);
    ctx.fillStyle = '#0a0e16';
    ctx.fillRect(4, 11, 42, 26);
    ctx.fillStyle = '#8997aa';
    ctx.fillRect(7, 9, 36, 22);
    ctx.fillStyle = '#c9d2e0';
    ctx.fillRect(10, 12, 28, 3);
    ctx.fillRect(10, 15, 4, 12);
    ctx.fillRect(34, 15, 4, 12);
    ctx.fillStyle = '#3e485b';
    ctx.fillRect(14, 19, 20, 9);
    ctx.fillRect(8, 33, 34, 4);
    ctx.fillStyle = '#111827';
    ctx.fillRect(10, 36, 10, 10);
    ctx.fillRect(32, 36, 10, 10);
    ctx.fillStyle = '#d4a84e';
    ctx.fillRect(12, 38, 6, 6);
    ctx.fillRect(34, 38, 6, 6);
    ctx.fillStyle = '#f2d078';
    ctx.fillRect(14, 39, 2, 2);
    ctx.fillRect(36, 39, 2, 2);
    ctx.restore();
  }

  function actionButton(ctx, rect, title, subtitle, color, icon) {
    button(ctx, rect, '', { color, border: '#c19a57', rivet: '#d39a47' });
    const centerY = rect.y + rect.h / 2;
    if (icon === 'cart') drawMinecartIcon(ctx, rect.x + 20, centerY - 29, 58);
    else if (MM.Assets) MM.Assets.drawIcon(ctx, 2, rect.x + 20, centerY - 29, 58);
    const tx = rect.x + 92;
    MM.U.text(ctx, title, tx, centerY - 14, 27, skin.ink, 'left', true);
    MM.U.text(ctx, subtitle, tx, centerY + 22,
      MM.U.fitSize(ctx, subtitle, rect.w - 104, 25, false), skin.muted, 'left');
  }

  function hudShort(ctx, text, width, size) {
    ctx.save();ctx.font = 'bold ' + size + 'px "Microsoft YaHei",sans-serif';
    let value=String(text);if(ctx.measureText(value).width>width){while(value.length && ctx.measureText(value+'…').width>width)value=value.slice(0,-1);value+='…';}
    ctx.restore();return value;
  }
  const UI = { LAYOUT, THEME, button, drawPanel, setViewportHeight };

  /* ══════════════════════ 地图 ══════════════════════ */
  UI.drawMap = function (ctx, mode) {
    const map = mode.map, run = mode.run, T = LAYOUT.TILE;
    const viewH = LAYOUT.MAP_BOTTOM - LAYOUT.MAP_TOP;
    const first = Math.max(0, Math.floor(mode.camY / T) - 1);
    const last = Math.min(map.h - 1, Math.floor((mode.camY + viewH) / T) + 1);

    /* 地图两侧用正式石墙瓦片交错铺设，避免单格重复形成生硬的直条。 */
    ctx.save();
    ctx.fillStyle = '#080d16';
    ctx.fillRect(0, LAYOUT.MAP_TOP, LAYOUT.W, viewH);
    if (MM.Assets) {
      const leftWall = ['rock-a', 'hard-c', 'rock-b', 'hard-a', 'hard-b'];
      const rightWall = ['hard-b', 'rock-b', 'hard-c', 'rock-a', 'hard-a'];
      for (let y = LAYOUT.MAP_TOP - (LAYOUT.MAP_TOP % T); y < LAYOUT.MAP_BOTTOM; y += T) {
        const row = Math.floor((y - LAYOUT.MAP_TOP) / T);
        MM.Assets.drawTile(ctx, leftWall[((row % leftWall.length) + leftWall.length) % leftWall.length], 0, y, T, 0.92);
        MM.Assets.drawTile(ctx, rightWall[((row % rightWall.length) + rightWall.length) % rightWall.length], 656, y, T, 0.92);
      }
    }
    /* 外缘压暗，内缘保留原墙面的蓝灰高光，让侧墙和矿道分层。 */
    ctx.fillStyle = 'rgba(3,7,13,0.20)';
    ctx.fillRect(0, LAYOUT.MAP_TOP, 64, viewH);
    ctx.fillRect(656, LAYOUT.MAP_TOP, 64, viewH);
    ctx.fillStyle = 'rgba(3,7,13,0.48)';
    ctx.fillRect(0, LAYOUT.MAP_TOP, 5, viewH);
    ctx.fillRect(715, LAYOUT.MAP_TOP, 5, viewH);

    /* 左右侧做成同一套钢石收边；右侧深度尺嵌入墙面，不盖成突兀的纯色块。 */
    ctx.fillStyle = '#05080e';
    ctx.fillRect(64, LAYOUT.MAP_TOP, 8, viewH);
    ctx.fillRect(648, LAYOUT.MAP_TOP, 8, viewH);
    ctx.fillStyle = '#25384f';
    ctx.fillRect(65, LAYOUT.MAP_TOP, 2, viewH);
    ctx.fillRect(649, LAYOUT.MAP_TOP, 2, viewH);
    ctx.fillStyle = '#a67a42';
    ctx.fillRect(69, LAYOUT.MAP_TOP, 2, viewH);
    ctx.fillRect(653, LAYOUT.MAP_TOP, 2, viewH);
    ctx.fillStyle = 'rgba(237,196,125,0.62)';
    ctx.fillRect(70, LAYOUT.MAP_TOP, 1, viewH);
    ctx.fillRect(654, LAYOUT.MAP_TOP, 1, viewH);
    for (let y = LAYOUT.MAP_TOP + 8; y < LAYOUT.MAP_BOTTOM - 8; y += T * 5) {
      pixelRivet(ctx, 64, y, '#c59049');
      pixelRivet(ctx, 648, y, '#c59049');
    }
    drawPanel(ctx, { x: 660, y: LAYOUT.MAP_TOP + 5, w: 56, h: viewH - 10 }, {
      fill: '#0b1423', border: '#506781', accent: '#c59049', lineWidth: 1.5,
    });
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(LAYOUT.MAP_X, LAYOUT.MAP_TOP, map.w * T, viewH);
    ctx.clip();

    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(LAYOUT.MAP_X, LAYOUT.MAP_TOP, map.w * T, viewH);

    for (let y = first; y <= last; y++) {
      for (let x = 0; x < map.w; x++) {
        const cell = map.get(x, y);
        const s = mode.worldToScreen(x * T, y * T);
        UI.drawCell(ctx, mode, cell, Math.round(s.x), Math.round(s.y));
      }
    }

    /* 炸药瞄准范围提示 */
    if (mode.armedTool === 'bomb') {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,122,107,0.85)';
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          const cell = map.get(x, y);
          if (!cell.revealed) continue;
          if (MM.U.manhattan(run.playerX, run.playerY, x, y) > MM.BALANCE.TOOL.BOMB_RANGE) continue;
          const s = mode.worldToScreen(x * T, y * T);
          ctx.strokeRect(Math.round(s.x) + 3, Math.round(s.y) + 3, T - 6, T - 6);
        }
      }
      const aim = mode.hoverCell && map.get(mode.hoverCell.x, mode.hoverCell.y);
      if (aim && aim.revealed
          && MM.U.manhattan(run.playerX, run.playerY, aim.x, aim.y) <= MM.BALANCE.TOOL.BOMB_RANGE) {
        const blast = MM.Tools.blastCells(map, aim.x, aim.y, run);
        ctx.setLineDash([]);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#ffe27a';
        blast.filter((cell) => !cell.excavated).forEach((cell) => {
          const s = mode.worldToScreen(cell.x * T, cell.y * T);
          ctx.strokeRect(Math.round(s.x) + 5, Math.round(s.y) + 5, T - 10, T - 10);
        });
      }
      ctx.restore();
    }

    /* V0.7.1：矿车弹窗打开时，高亮"如果自己挖过去"会被跳过的矿物格 */
    if (mode.cartPreview && mode.cartPreview.length && !mode.armedTool) {
      ctx.save();
      ctx.setLineDash([7, 4]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,215,94,0.92)';
      mode.cartPreview.forEach((p) => {
        const s = mode.worldToScreen(p.x * T, p.y * T);
        ctx.strokeRect(Math.round(s.x) + 2, Math.round(s.y) + 2, T - 4, T - 4);
      });
      ctx.restore();
    }

    /* 悬停高亮 */
    if (mode.hoverCell) {
      const cell = map.get(mode.hoverCell.x, mode.hoverCell.y);
      if (cell && cell.revealed) {
        const s = mode.worldToScreen(cell.x * T, cell.y * T);
        ctx.save();
        ctx.strokeStyle = '#ffd75e';
        ctx.lineWidth = 3;
        ctx.strokeRect(Math.round(s.x) + 2, Math.round(s.y) + 2, T - 4, T - 4);
        ctx.restore();
      }
    }

    /* 炸药放置动画（§64） */
    if (run.action && run.action.kind === 'bomb') {
      const s = mode.worldToScreen(run.action.x * T, run.action.y * T);
      const blink = Math.floor(run.action.t * 12) % 2 === 0;
      ctx.save();
      ctx.globalAlpha = blink ? 0.95 : 0.45;
      const drawn = MM.Assets && MM.Assets.drawIcon(ctx, 7, s.x + 16, s.y + 16, 32);
      if (!drawn) {
        const cx = Math.round(s.x + T / 2), cy = Math.round(s.y + T / 2);
        ctx.fillStyle = '#4a211f';
        ctx.fillRect(cx - 7, cy - 6, 14, 14);
        ctx.fillStyle = '#963b30';
        ctx.fillRect(cx - 6, cy - 6, 12, 10);
        ctx.fillStyle = '#d58a49';
        ctx.fillRect(cx - 3, cy - 8, 3, 3);
        ctx.fillStyle = '#ffd75e';
        ctx.fillRect(cx, cy - 11, 3, 3);
      }
      ctx.restore();
    }

    /* 调试：最低成本路径（§77） */
    if (mode.panel && mode.panel.showPath) UI.drawDebugPath(ctx, mode);
    /* P2 调试：岔路 / 线索（入口成本与可能收益） */
    if (mode.panel && mode.panel.showBranches) UI.drawBranches(ctx, mode);

    /* 角色与头灯环境光（§61 / §82） */
    mode.hit.cartBadge = null;
    const pos = MM.Player.renderPos(run);
    const ps = mode.worldToScreen((pos.x + 0.5) * T, (pos.y + 0.5) * T);
    MM.Art.drawPlayerGlow(ctx, run, ps.x, ps.y, T, mode.time);
    MM.Art.drawMiner(ctx, run, ps.x, ps.y, T, mode.time);

    /* 到站后矿工会挡住站牌；在角色上方保留可点击返程提示。 */
    const underPlayer = map.get(run.playerX, run.playerY);
    if (run.state === MM.State.S.EXPLORING && !mode.modal && underPlayer && underPlayer.excavated
        && (underPlayer.specialType === 'cartStop' || underPlayer.specialType === 'minecart')) {
      const label = underPlayer.specialType === 'cartStop' ? '点击返程' : '点击乘车';
      const bx = MM.U.clamp(Math.round(ps.x - 49), LAYOUT.MAP_X + 2, LAYOUT.MAP_X + map.w * T - 100);
      const by = Math.max(LAYOUT.MAP_TOP + 4, Math.round(ps.y - 60));
      MM.U.fillRound(ctx, bx, by, 98, 24, 4, 'rgba(16,22,35,0.94)');
      MM.U.strokeRound(ctx, bx, by, 98, 24, 4, '#d9a92c', 2);
      MM.U.text(ctx, label, bx + 49, by + 12, 14, '#ffe27a', 'center', true);
      mode.hit.cartBadge = { x: bx, y: by, w: 98, h: 24 };
    }

    /* 特效 */
    mode.effects.draw(ctx, function (wx, wy) { return mode.worldToScreen(wx, wy); });

    ctx.restore();
  };

  /* 单格绘制：迷雾 / 已挖地面 / 岩层 / 矿物 / 线索 / 特殊物件（美术层 MiningArt） */
  UI.drawCell = function (ctx, mode, cell, sx, sy) {
    const showAll = mode.panel && mode.panel.showAll;
    const revealed = cell.revealed || showAll;
    const art = MM.Art;
    const t = mode.time || 0;

    if (!revealed) {
      art.drawFog(ctx, cell, sx, sy);
      return;
    }

    if (cell.excavated) {
      art.drawFloor(ctx, cell, sx, sy);
      if (cell.specialType === 'spring') art.drawSpring(ctx, cell, sx, sy, t, true);
      else if (cell.specialType === 'resonanceStone') art.drawResonanceStone(ctx, cell, sx, sy, t);
      else if (cell.specialType === 'gateConsole') art.drawGateConsole(ctx, cell, sx, sy, t);
      else if (cell.specialType === 'chest' || cell.specialType === 'lostChest') art.drawChest(ctx, cell, sx, sy, true, 'wood');
      else if (cell.specialType === 'mysteryChest') art.drawChest(ctx, cell, sx, sy, true, 'mystery');
      else if (cell.specialType === 'ruinCache') art.drawRuinCache(ctx, cell, sx, sy, true);
      else if (cell.specialType === 'minecart') art.drawMinecart(ctx, cell, sx, sy, t);
      else if (cell.specialType === 'cartStop') art.drawCartStop(ctx, cell, sx, sy);
      else if (cell.specialType === 'vaultEntrance') art.drawVaultOpen(ctx, cell, sx, sy, t);
      else if (cell.specialType === 'vault') art.drawVaultGold(ctx, cell, sx, sy, t);
      else if (cell.specialType === 'workbench') art.drawWorkbench(ctx, cell, sx, sy, true,
        (mode.run.upgrades || []).length > 0,
        MM.U.manhattan(mode.run.playerX, mode.run.playerY, cell.x, cell.y) <= 1, t);
      else if (cell.specialType === 'warehouseChoice') art.drawWarehouse(ctx, cell, sx, sy, true,
        (mode.run.roomChoices || {}).warehouse || null);
      return;
    }

    art.drawTerrain(ctx, cell, sx, sy);
    if (cell.resourceType) art.drawOre(ctx, cell, sx, sy, t);
    if (cell.specialType === 'spring') art.drawSpring(ctx, cell, sx, sy, t, false);
    else if (cell.specialType === 'resonanceStone') art.drawResonanceStone(ctx, cell, sx, sy, t);
    else if (cell.specialType === 'gateConsole') art.drawGateConsole(ctx, cell, sx, sy, t);
    else if (cell.specialType === 'gateBarrier' && !cell.gateOpen) art.drawGateBarrier(ctx, cell, sx, sy);
    if (cell.specialType === 'chest' || cell.specialType === 'lostChest') art.drawChest(ctx, cell, sx, sy, false, 'wood');
    if (cell.specialType === 'mysteryChest') art.drawChest(ctx, cell, sx, sy, false, 'mystery');
    if (cell.specialType === 'ruinCache') art.drawRuinCache(ctx, cell, sx, sy, false);
    if (cell.specialType === 'minecart') art.drawMinecart(ctx, cell, sx, sy, t);
    if (cell.specialType === 'vaultEntrance') art.drawVaultDoor(ctx, cell, sx, sy, t);
    if (cell.specialType === 'vault') art.drawVaultGold(ctx, cell, sx, sy, t);
    if (cell.clueType) art.drawClue(ctx, cell, sx, sy, t);
    if (cell.specialType === 'workbench') art.drawWorkbench(ctx, cell, sx, sy, false,
      (mode.run.upgrades || []).length > 0, false, t);
    else if (cell.specialType === 'warehouseChoice') art.drawWarehouse(ctx, cell, sx, sy, false,
      (mode.run.roomChoices || {}).warehouse || null);

    /* 只在相邻未挖岩格标体力成本；远处矿格保留价值提示。
     * 这样仍能比较收益，又避免视野内每格都盖上标签。 */
    const cost = cell.digCost != null ? cell.digCost : 0;
    const hasOre = !!cell.resourceType;
    const adjacent = MM.U.manhattan(mode.run.playerX, mode.run.playerY, cell.x, cell.y) === 1;
    if (!adjacent && !hasOre) return;
    const tagY = sy + 43;
    if (adjacent) {
      MM.U.fillRound(ctx, sx + 3, tagY, hasOre ? 29 : 58, 18, 3, 'rgba(7,10,17,0.88)');
      const costText = '耗' + cost;
      const cSize = MM.U.fitSize(ctx, costText, hasOre ? 25 : 53, 11, true);
      MM.U.text(ctx, costText, sx + (hasOre ? 17 : 32), tagY + 9, cSize,
        cost >= 3 ? '#ffb3a0' : '#c9d6ec', 'center', true);
    }
    if (hasOre) {
      const def = MM.RESOURCES[cell.resourceType];
      const vx = adjacent ? sx + 32 : sx + 3;
      const vw = adjacent ? 29 : 58;
      MM.U.fillRound(ctx, vx, tagY, vw, 18, 3, 'rgba(7,10,17,0.88)');
      const vSize = MM.U.fitSize(ctx, '+' + def.value, vw - 4, 12, true);
      MM.U.text(ctx, '+' + def.value, vx + vw / 2, tagY + 9, vSize, def.color, 'center', true);
    }
  };

  /* 调试：最低成本路径 + 隐藏主矿道（§77，正式发布隐藏） */
  /* P2 调试：岔路（入口成本 / 可能收益）+ 房间线索（主矿道可见性） */
  UI.drawBranches = function (ctx, mode) {
    const map = mode.map, T = LAYOUT.TILE;
    (map.branches || []).forEach((b, i) => {
      const color = b.tier === 'low' ? '#7fe08a' : '#ffd75e';
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      (b.cells || []).forEach((p) => {
        const s = mode.worldToScreen(p.x * T, p.y * T);
        ctx.strokeRect(Math.round(s.x) + 2, Math.round(s.y) + 2, T - 4, T - 4);
      });
      const j = mode.worldToScreen((b.junction.x + 0.5) * T, (b.junction.y + 0.5) * T);
      const c0 = b.cells && b.cells[0]
        ? mode.worldToScreen((b.cells[0].x + 0.5) * T, (b.cells[0].y + 0.5) * T) : j;
      ctx.beginPath();
      ctx.moveTo(j.x, j.y);
      ctx.lineTo(c0.x, c0.y);
      ctx.stroke();
      ctx.restore();

      const label = (b.tier === 'low' ? '岔路·低收益' : '岔路·高收益')
        + ' 入口≈' + b.approxCost + '体力 → '
        + (b.tier === 'low' ? '铜矿(约' + b.approxValue + ')'
          : '金矿+补给箱(约' + b.approxValue + '，含工具)');
      MM.U.text(ctx, label, j.x + 14, j.y - 16, 14, color, 'left', true);
    });

    /* 房间线索：圆点标记（已在视野内 = 玩家走到主矿道就能看到） */
    ctx.save();
    ctx.strokeStyle = '#9fd0ff';
    ctx.lineWidth = 2.5;
    (map.plan && map.plan.rooms ? map.plan.rooms : []).forEach((id) => {
      const room = map.rooms[id];
      const clue = room && room.clue;
      const cell = clue ? map.get(clue.x, clue.y) : null;
      if (!cell || !cell.clueType) return;
      const s = mode.worldToScreen((cell.x + 0.5) * T, (cell.y + 0.5) * T);
      ctx.beginPath();
      ctx.arc(s.x, s.y, T * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      MM.U.text(ctx, '线索：' + ((MM.CLUE_STYLES[cell.clueType] || {}).name || cell.clueType),
        s.x, s.y - T * 0.42, 13, '#9fd0ff', 'center', true);
    });
    ctx.restore();
  };

  UI.drawDebugPath = function (ctx, mode) {
    const map = mode.map, T = LAYOUT.TILE;
    const an = MM.Pathfinder.analyze(map, map.entrance);

    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    map.mainRoutePath.forEach((c, i) => {
      const s = mode.worldToScreen((c.x + 0.5) * T, (c.y + 0.5) * T);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.restore();

    const path = an.pathTo(map.vault.x, map.vault.y);
    if (path) {
      ctx.save();
      ctx.strokeStyle = 'rgba(80,240,220,0.95)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      const s0 = mode.worldToScreen((map.entrance.x + 0.5) * T, (map.entrance.y + 0.5) * T);
      ctx.moveTo(s0.x, s0.y);
      path.forEach((c) => {
        const s = mode.worldToScreen((c.x + 0.5) * T, (c.y + 0.5) * T);
        ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      ctx.restore();

      const specV = MM.specValidatorOf(map);
      const midRow = MM.U.clamp(Math.round(specV.MID_DEPTH_METERS), 1, Math.max(1, map.h - 2));
      const s1 = mode.worldToScreen(LAYOUT.MAP_X + 8, LAYOUT.MAP_TOP + 16);
      MM.U.text(ctx,
        '理论最低成本：' + midRow + 'm=' + an.minRow[midRow] + ' · 藏宝库=' + an.cost(map.vault.x, map.vault.y),
        s1.x, s1.y, 15, '#50f0dc', 'left', true);
    }
  };

  /* ══════════════════════ 顶部 HUD ══════════════════════ */
  UI.drawTop = function (ctx, mode) {
    const run = mode.run, map = mode.map;
    const g = ctx.createLinearGradient(0, 0, 0, LAYOUT.HUD_H);
    g.addColorStop(0, '#0b1425');
    g.addColorStop(0.56, '#111a2a');
    g.addColorStop(1, '#090f19');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.HUD_H);
    if (MM.Assets) {
      ctx.save();
      ctx.globalAlpha = 0.23;
      for (let y = 0; y < LAYOUT.HUD_H; y += 64) {
        MM.Assets.drawTile(ctx, y % 128 ? 'rock-a' : 'rock-b', 0, y, 64);
        MM.Assets.drawTile(ctx, y % 128 ? 'rock-b' : 'rock-a', 656, y, 64);
      }
      ctx.restore();
    }
    const logo = { x: 14, y: 7, w: 692, h: 64 };
    drawPanel(ctx, logo, { fill: '#0b1729', border: '#48627f', accent: '#c98b3f', lineWidth: 2 });
    if (MM.Assets) MM.Assets.drawIcon(ctx, 8, 27, 15, 48);
    MM.U.text(ctx, '再挖一层', 83, 40, 32, '#594a26', 'left', true);
    if (MM.Relics && MM.Relics.milestoneUnlocked('keeperTitle')) {
      const titleRect = { x: 220, y: 18, w: 150, h: 42 };
      drawPanel(ctx, titleRect, { fill: '#302746', border: '#a68ad1', accent: '#d7bdff', lineWidth: 1.2 });
      MM.U.text(ctx, '矿脉守藏人', titleRect.x + titleRect.w / 2, titleRect.y + 25, 22, '#4d4954', 'center', true);
    }
    const spec = (map && map.spec) || MM.mapSpec();
    const depthLabel = spec.DEPTH_LABEL || (map.h - 1);
    /* Seed 与尺寸留在调试面板，正式 HUD 只保留探索信息。 */

    mode.hit.sound = { x: 530, y: 5, w: 82, h: 68 };
    mode.hit.settings = { x: 620, y: 5, w: 82, h: 68 };
    button(ctx, mode.hit.sound, '', { color: MM.Audio && MM.Audio.enabled ? '#253e55' : '#303342', border: '#7891ad' });
    speaker(ctx, mode.hit.sound, MM.Audio ? MM.Audio.enabled : false);
    button(ctx, mode.hit.settings, '', { color: mode.settingsOpen ? '#58462e' : '#25344a', border: '#b28c53' });
    gear(ctx, mode.hit.settings);

    /* 局内至多装备两种改造；图标可点开查看效果与有限触发次数。 */
    mode.hit.upgradeSlots = [];
    (run.upgrades || []).slice(0, MM.UPGRADE_SLOT_LIMIT).forEach((id, index) => {
      const x = 382 + index * 58;
      const rect = { x, y: 14, w: 48, h: 48, upgradeId: id };
      const used = (run.stats || {}).drillUses || 0;
      const counters = { hardRockDrill: used, recoveryKit: (run.stats || {}).recoveryPicks || 0,
        afterglowWick: (run.stats || {}).afterglowRooms || 0 };
      const limit = (MM.UPGRADE_USE_LIMITS || {})[id];
      const remaining = limit ? Math.max(0, limit - (counters[id] || 0)) : null;
      mode.hit.upgradeSlots.push(rect);
      drawPanel(ctx, rect, { fill: '#17263a', border: remaining === 0 ? '#586176' : '#6380a0',
        accent: remaining === 0 ? '#737d8f' : '#d5a653', lineWidth: 1.2 });
      if (MM.Assets) MM.Assets.drawUpgradeIcon(ctx, id, x + 7, rect.y + 5, 34, remaining === 0 ? 0.48 : 1);
      if (remaining != null) {
        MM.U.fillRound(ctx, x + 25, rect.y + 25, 23, 23, 4, '#08111d');
        MM.U.text(ctx, String(remaining), x + 36.5, rect.y + 36.5, 23, remaining ? '#fff0b0' : '#c4cfda', 'center', true);
      }
    });

    /* 三张状态牌：深度、体力、探索价值。 */
    const stats = [
      { x: 16, w: 218, accent: '#8da8c4' },
      { x: 250, w: 218, accent: '#d25c50' },
      { x: 484, w: 220, accent: '#d6a83c' },
    ];
    stats.forEach((r) => drawPanel(ctx, { x: r.x, y: 78, w: r.w, h: 64 }, {
      fill: '#101b2c', border: '#526985', accent: r.accent, lineWidth: 2,
    }));
    MM.U.text(ctx, '深度', 31, 96, 24, '#424c57', 'left', true);
    if (MM.Assets) MM.Assets.drawIcon(ctx, 4, 28, 101, 28);
    MM.U.text(ctx, run.currentDepth + ' / ' + depthLabel + 'm', 62, 125, 27, '#4a4b4c', 'left', true);

    const ratio = run.maxStamina ? run.stamina / run.maxStamina : 0;
    const sColor = ratio > 0.5 ? '#28753c' : (ratio > 0.25 ? '#94611c' : '#af3c2f');
    MM.U.text(ctx, '体力', 266, 96, 24, '#424c57', 'left', true);
    if (MM.Assets) MM.Assets.drawIcon(ctx, 1, 263, 101, 28);
    MM.U.text(ctx, run.stamina + ' / ' + run.maxStamina, 296, 125, 27, sColor, 'left', true);
    if (MM.Assets) MM.Assets.drawIcon(ctx, 2, 500, 99, 36);
    MM.U.text(ctx, '价值', 542, 96, 24, '#424c57', 'left', true);
    MM.U.text(ctx, String(run.baseValue), 542, 125, 27, '#594b20', 'left', true);

    /* 本局矿料条 */
    const materials = run.materials || {};
    drawPanel(ctx, { x: 16, y: 150, w: 688, h: 50 }, {
      fill: '#0e1a2b', border: '#3f5875', accent: '#d19748', lineWidth: 1.5,
    });
    const mats = [
      [3, '铜', materials.copper || 0, '#d68147'],
      [4, '银', materials.silver || 0, '#d9e1ed'],
      [5, '金', materials.gold || 0, '#ffd04f'],
      [6, '水晶', materials.crystal || 0, '#d79aff'],
    ];
    mats.forEach((m, i) => {
      const x = 30 + i * 168;
      if (MM.Assets) MM.Assets.drawIcon(ctx, m[0], x, 158, 34);
      MM.U.text(ctx, m[1] + ' ' + m[2], x + 39, 176, 25, '#303b45', 'left', true);
    });

    /* 主目标 + 当前补给进度，始终随本局实际数据变化。 */
    const st = MM.Progress.status(run);
    const reachedVault = !!run.treasureReached;
    drawPanel(ctx, { x: 16, y: 208, w: 688, h: 80 }, {
      fill: '#101b2c', border: '#7c633d', accent: '#ffd15c', lineWidth: 2,
    });
    MM.U.text(ctx, (reachedVault ? '已抵达 ' : '目标 ') + depthLabel + 'm 藏宝库', 33, 225, 26, '#303b45', 'left', true);
    const supply = st.tier ? '补给 ' + st.mineValue + '/' + st.tier.need + ' · ' + MM.Progress.rewardShort(st.tier) : '本局补给已全部领取';
    MM.U.text(ctx, hudShort(ctx, supply, 648, 25), 33, 251, 25, '#304c36', 'left', true);
    const found = MM.Progress.discoveriesText(run, 3);
    let current = found ? '已发现：' + found : '已发现：周围岩块与矿脉';
    let targetColor = '#434c57';
    if (run.relicTarget) {
      const relic = (MM.RELICS || []).find((r) => r.id === run.relicTarget);
      const source = (MM.RELIC_SOURCES || {})[run.relicTarget];
      const room = source && MM.ROOMS[source.roomId];
      const foundTarget = (run.relicsFound || []).indexOf(run.relicTarget) >= 0;
      if (relic) {
        current = '遗物目标：' + relic.name + (foundTarget ? ' · 已发现' : (room ? ' · 线索：' + room.name : ''));
        targetColor = foundTarget ? '#3a5232' : '#75438e';
      }
    } else {
      const tracked = (mode.save && mode.save.records().expedition || {}).trackedGoal;
      const goal = MM.Expedition && MM.Expedition.goal(tracked);
      if (goal) {
        current = '手册目标：' + goal.name + ' · ' + goal.desc;
        targetColor = '#3b5874';
      } else if (run.style && MM.Style) {
      const sp = MM.Style.progress(run, map);
      if (sp) current = '风格·' + run.style.name + ' ' + (run.style.done ? '✓ 完成' : (sp.failed ? '已失效' : sp.text));
      }
    }
    MM.U.text(ctx, hudShort(ctx, current, 648, 25), 33, 278, 25,
      targetColor === '#434c57' && run.style && run.style.done ? '#3a5232' : targetColor, 'left', true);
  };

  /* ══════════════════════ 深度尺（§17） ══════════════════════ */
  UI.drawRuler = function (ctx, mode) {
    const map = mode.map, run = mode.run;
    const x = 688;
    const snap = (value) => Math.round(value / 2) * 2;
    const top = snap(LAYOUT.MAP_TOP + 12), bottom = snap(LAYOUT.MAP_BOTTOM - 14);
    const maxD = (map.spec && map.spec.DEPTH_LABEL) || (map.h - 1);

    ctx.save();
    ctx.fillStyle = 'rgba(143,163,196,0.35)';
    ctx.fillRect(x, top, 2, bottom - top);

    for (let d = 0; d <= maxD; d += 5) {
      const yy = snap(top + (d / maxD) * (bottom - top));
      ctx.fillStyle = 'rgba(143,163,196,0.55)';
      ctx.fillRect(x - 6, yy, 8, 2);
      MM.U.text(ctx, String(d), x, yy, 24, '#674a2c', 'center');
    }
    const cy = snap(top + (run.currentDepth / maxD) * (bottom - top));
    ctx.fillStyle = '#ffd75e';
    ctx.fillRect(x - 8, cy - 4, 4, 2);
    ctx.fillRect(x - 12, cy - 2, 8, 4);
    ctx.fillRect(x - 8, cy + 2, 4, 2);
    ctx.restore();
  };

  /* ══════════════════════ 底部 UI（§28 / §59 / §82） ══════════════════════ */
  UI.drawBottom = function (ctx, mode) {
    const run = mode.run;
    const S = MM.State.S;
    const interactive = run.state === S.EXPLORING;

    drawPanel(ctx, { x: 12, y: LAYOUT.FOOTER_Y, w: 696, h: LAYOUT.FOOTER_H }, {
      fill: '#0a111d', border: '#354864', accent: '#bd8540', lineWidth: 1.5,
    });

    /* 工具条 */
    const y = LAYOUT.TOOL_Y;
    mode.hit.bomb = null; mode.hit.powerPick = null; mode.hit.lamp = null;
    MM.TOOL_ORDER.forEach((id, i) => {
      const rect = { x: 16 + i * 234, y: y, w: i === 2 ? 220 : 216, h: LAYOUT.TOOL_H };
      mode.hit[id] = rect;
      const def = MM.TOOLS[id];
      const count = run.tools[id] || 0;
      const armed = mode.armedTool === id;
      const disabled = count <= 0 || !interactive;
      const color = id === 'bomb' ? '#6e3a2c' : (id === 'powerPick' ? '#46532f' : '#2f5668');
      button(ctx, rect, def.name + '\n× ' + count, {
        disabled, color, armed, border: armed ? '#ffe27a' : '#92a7c2', icon: def.icon, iconSize: 46,
      });
    });

    /* 开发调试入口移入设置弹窗，不占用手机端主要操作区。 */
    mode.hit.debug = null;

    /* 主按钮：返回入口（V0.6：不再是撤离方式，只是一个免费移动功能） */
    const atEntrance = MM.Move.atEntrance(run, mode.map);
    const mainRect = { x: 16, y: LAYOUT.BTN_Y, w: 334, h: LAYOUT.BTN_H };
    mode.hit.main = mainRect;
    const mainCenterY = mainRect.y + mainRect.h / 2;
    if (atEntrance) {
      button(ctx, mainRect, '', { color: '#2f4a78', disabled: true, border: '#66758f' });
      drawMinecartIcon(ctx, mainRect.x + 20, mainCenterY - 29, 58);
      MM.U.text(ctx, '已在入口', mainRect.x + 92, mainCenterY - 14, 27, '#454b53', 'left', true);
      MM.U.text(ctx, '可结束结算', mainRect.x + 92, mainCenterY + 22, 25, '#454b57', 'left');
    } else {
      actionButton(ctx, mainRect, '返回入口', '免费移动', '#284d7d', 'cart');
      if (!interactive) {
        ctx.fillStyle = 'rgba(9,13,21,0.35)';
        ctx.fillRect(mainRect.x + 4, mainRect.y + 4, mainRect.w - 8, mainRect.h - 8);
      }
    }

    const endRect = { x: 370, y: LAYOUT.BTN_Y, w: 334, h: LAYOUT.BTN_H };
    mode.hit.end = endRect;
    const endLabel = mode.endConfirmT > 0
      ? ['确认结束', '按基础价值结算']
      : ['结束探索', '当前价值结算'];
    actionButton(ctx, endRect, endLabel[0], endLabel[1], mode.endConfirmT > 0 ? '#8c3b3b' : '#765522', 'coin');

    /* 一处承载常驻操作提示或最近反馈，避免多层消息条挤占矿图。 */
    let message = null;
    if (Array.isArray(mode.messages)) {
      for (let i = mode.messages.length - 1; i >= 0; i--) {
        if (mode.messages[i] && mode.messages[i].left > 0) { message = mode.messages[i]; break; }
      }
    }
    const hint = mode.tutorial && mode.tutorial.guided ? '' : (message ? message.text : mode.hintText());
    if (hint) {
      MM.U.fillRound(ctx, 24, LAYOUT.HINT_Y - 24, 672, 48, 7, 'rgba(9,14,23,0.92)');
      MM.U.strokeRound(ctx, 24, LAYOUT.HINT_Y - 24, 672, 48, 7, 'rgba(197,215,237,0.14)', 1);
      MM.U.text(ctx, hudShort(ctx, hint, 646, 25), 360, LAYOUT.HINT_Y, 25, '#e8eef8', 'center');
    }
  };

  UI.drawSettings = function (ctx, mode) {
    ctx.fillStyle = 'rgba(2,5,10,0.72)';
    ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);
    const rect = { x: 70, y: 340, w: 580, h: 590 };
    drawPanel(ctx, rect, { fill: '#111b2b', border: '#8a7043', accent: '#ffd15c', lineWidth: 3 });
    MM.U.text(ctx, '设置', 360, 408, 34, '#594a26', 'center', true);
    MM.U.text(ctx, '音效', 112, 490, 25, '#494b4c', 'left', true);
    MM.U.text(ctx, '挖掘、矿车、发现提示', 112, 524, 24, '#444b55', 'left');
    mode.hit.settingsSound = { x: 450, y: 464, w: 146, h: 76 };
    button(ctx, mode.hit.settingsSound, MM.Audio && MM.Audio.enabled ? '音效：开' : '音效：关', {
      color: MM.Audio && MM.Audio.enabled ? '#315e50' : '#3c4353', border: '#91a5bf',
    });
    MM.U.fillRound(ctx, 102, 590, 516, 1, 1, 'rgba(255,255,255,0.15)');
    MM.U.text(ctx, '操作说明', 112, 622, 25, '#3b4d5f', 'left', true);
    ['点击相邻岩块挖掘。','点击已挖道路可免费移动。','工具数量显示在图标旁。','结束探索按当前价值结算。'].forEach((text,i)=>MM.U.text(ctx,text,112,654+i*31,24,'#303b45','left'));
    if (MM.BALANCE.DEV_MODE) {
      mode.hit.settingsDebug = { x: 190, y: 770, w: 340, h: 58 };
      button(ctx, mode.hit.settingsDebug, '打开调试面板', { color: '#4b3b67', border: '#a28bc4' });
    }
    mode.hit.settingsClose = { x: 190, y: 844, w: 340, h: 68 };
    button(ctx, mode.hit.settingsClose, '返回矿坑', { color: '#2e4e77', border: '#95abc5' });
  };

  /* ══════════════════════ 提示 / 横幅 ══════════════════════ */
  UI.drawBanners = function (ctx, mode) {
    const b = mode.banner;
    if (b) {
      const alpha = Math.min(1, b.t / 0.15) * Math.min(1, (b.dur - b.t) / 0.25);
      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const cy = LAYOUT.MAP_TOP + 190;
        MM.U.fillRound(ctx, 70, cy - 62, 580, 124, 14, 'rgba(8,11,18,0.9)');
        MM.U.strokeRound(ctx, 70, cy - 62, 580, 124, 14, b.color || '#ffd75e', 2.5);
        MM.U.strokeRound(ctx, 76, cy - 56, 568, 112, 11, 'rgba(255,215,94,0.25)', 1);
        MM.U.text(ctx, b.title, 360, cy - 14, 34, b.color || '#ffd75e', 'center', true);
        if (b.sub) MM.U.text(ctx, b.sub, 360, cy + 28, 19, '#e8eef8', 'center');
        ctx.restore();
      }
    }
  };

  /* 藏宝库发现演出氛围（§44 / §81）：金色光线 + 区域点亮光晕 */
  UI.drawTreasureOverlay = function (ctx, mode) {
    const seq = mode.treasureSeq;
    const v = mode.map.vault;
    if (!seq || !v) return;
    const S = MM.BALANCE.TREASURE_SEQ;
    const t = seq.t;
    const T = LAYOUT.TILE;
    const p0 = mode.worldToScreen((v.x + 0.5) * T, (v.y + 0.5) * T);

    const pulse = 0.5 + 0.5 * Math.sin(t * 6.0);
    const lit = MM.U.clamp((t - S.LIGHT) / Math.max(0.01, S.REVEAL - S.LIGHT), 0, 1);
    const fade = 1 - MM.U.clamp((t - S.REVEAL)
      / Math.max(0.01, MM.BALANCE.ANIM.TREASURE_TIME - S.REVEAL), 0, 1) * 0.55;
    const beamPixel = Math.max(4, Math.round(T / 16));
    const lightPixel = Math.max(16, Math.round(T / 4));
    const baseX = Math.floor(p0.x / lightPixel) * lightPixel;
    const baseY = Math.floor(p0.y / lightPixel) * lightPixel;

    /* 用定宽像素块画阶梯光束，避免柔焦渐变破坏正式像素素材的硬边。 */
    if (t > S.SHAKE) {
      const beamStrength = MM.U.clamp((t - S.SHAKE)
        / Math.max(0.01, S.LIGHT - S.SHAKE), 0, 1) * fade;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const angle = -Math.PI / 2 + (i - 3) * 0.22;
        const length = 210 + (i % 3) * 60;
        const steps = Math.ceil(length / beamPixel);
        for (let step = 1; step <= steps; step++) {
          const distance = (step / steps) * length;
          const x = Math.round((p0.x + Math.cos(angle) * distance) / beamPixel) * beamPixel;
          const y = Math.round((p0.y + Math.sin(angle) * distance) / beamPixel) * beamPixel;
          const alpha = (0.20 * beamStrength) * (1 - step / (steps + 2) * 0.7);
          ctx.fillStyle = 'rgba(255,215,94,' + alpha + ')';
          ctx.fillRect(x, y, beamPixel, beamPixel);
        }
      }
      ctx.restore();
    }

    /* 限量阶梯色阶的菱形照明，边界和强度都落在像素格上。 */
    const maxSteps = Math.ceil(560 / lightPixel);
    const lightStrength = (0.10 + 0.16 * lit + 0.05 * pulse) * fade;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let gy = -maxSteps; gy <= maxSteps; gy++) {
      for (let gx = -maxSteps; gx <= maxSteps; gx++) {
        const distance = Math.abs(gx) + Math.abs(gy);
        if (distance > maxSteps) continue;
        const band = distance / maxSteps;
        const level = band < 0.2 ? 0.24 : (band < 0.45 ? 0.15 : (band < 0.72 ? 0.08 : 0.035));
        const x = baseX + gx * lightPixel;
        const y = baseY + gy * lightPixel;
        if (x + lightPixel <= 0 || x >= LAYOUT.W || y + lightPixel <= 0 || y >= LAYOUT.H) continue;
        ctx.fillStyle = 'rgba(255,215,94,' + (lightStrength * level) + ')';
        ctx.fillRect(x, y, lightPixel, lightPixel);
      }
    }
    ctx.restore();
  };

  UI.drawEntering = function (ctx, mode) {
    const a = MM.U.clamp(mode.fadeIn, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);
    MM.U.text(ctx, '进入地下矿坑……', 360, 560, 30, '#c9d6ec', 'center', true);
    MM.U.text(ctx, 'Seed ' + mode.run.seed, 360, 606, 18, '#6f7f9c', 'center');
    ctx.restore();
  };

  /* ══════════════════════ 结算面板（§53 / §54 / §55 / §81） ══════════════════════ */
  UI.openReport = function(mode) {
    const s=mode.run.summary;
    const dialog=document.createElement('dialog');dialog.className='mine-report dialog';
    const heading=document.createElement('h2');heading.textContent='本次探索手记';dialog.append(heading);
    const lines=[['矿物',s.resourceRows.map(r=>r.name+' ×'+r.count).join('、')||'尚未发现'],['隐藏区域',s.rooms.map(id=>(MM.ROOMS[id]||{}).name||id).join('、')||'尚未发现'],['补给成果',s.supplyText],['改造',(s.upgrades||[]).map(id=>(MM.UPGRADES[id]||{}).name||id).join('、')||'未制作'],['探索风格',s.styleText||'自由探索'],['下次挑战',s.challenge?.text||'继续寻找更深的矿脉'],['挑战种子',s.seed]];
    for(const [label,value] of lines){const row=document.createElement('p'),b=document.createElement('b');b.textContent=label+'：';row.append(b,document.createTextNode(String(value||'无')));dialog.append(row)}
    const close=document.createElement('button');close.className='m-btn';close.textContent='返回结算';close.onclick=()=>dialog.close();dialog.append(close);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();close.focus();
  };
  UI.drawSettlement = function (ctx, mode) {
    const s = mode.run.summary;
    const save = MM.Save;
    const rec = save.records();
    const archive = rec.archive || { rooms: [], minerals: [], maxDepth: 0, runs: 0 };

    ctx.fillStyle = 'rgba(5,7,12,0.88)';
    ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);

    const px0 = 56, ph = Math.min(1480, LAYOUT.H - 64), py = Math.round((LAYOUT.H - ph) / 2), pw = 608;
    drawPanel(ctx, { x: px0, y: py, w: pw, h: ph }, { accent: '#d9b85e', border: '#4c4b46' });

    MM.U.text(ctx, '本次矿坑探索', 360, py + 44, 30, '#494b4d', 'center', true);
    MM.U.text(ctx, s.tutorialRun ? '教学局 · 不计入普通纪录与 Seed 榜' : 'Seed ' + s.seed,
      360, py + 74, 14, s.tutorialRun ? '#3b4d5f' : '#424b5d', 'center');
    /* 分隔装饰 */
    ctx.strokeStyle = 'rgba(255,215,94,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px0 + 90, py + 94);
    ctx.lineTo(360 - 14, py + 94);
    ctx.moveTo(360 + 14, py + 94);
    ctx.lineTo(px0 + pw - 90, py + 94);
    ctx.stroke();
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.moveTo(360, py + 88);
    ctx.lineTo(366, py + 94);
    ctx.lineTo(360, py + 100);
    ctx.lineTo(354, py + 94);
    ctx.closePath();
    ctx.fill();

    let y = py + 122;
    const line = (label, value, color, big) => {
      MM.U.text(ctx, label, px0 + 36, y, big ? 21 : 17, '#424b5b', 'left');
      MM.U.text(ctx, value, px0 + pw - 36, y, big ? 24 : 18, color || '#494b4e', 'right', true);
      y += big ? 40 : 32;
    };

    line('最深深度', s.maxDepth + 'm');
    line('挖掘 / 挥镐', s.excavated + ' 格 / ' + s.digActions + ' 次');
    const mineralText = (s.resourceRows || []).map((r) => r.name + ' ×' + r.count).join(' · ') || '无';
    MM.U.text(ctx, '本局矿物：' + mineralText, 360, y,
      MM.U.fitSize(ctx, '本局矿物：' + mineralText, pw - 72, 17, true), '#484b4e', 'center', true);
    y += 28;
    const roomText = '隐藏区域 ' + s.roomCount + ' 处'
      + (s.rooms.length ? '（' + s.rooms.map((id) => (MM.ROOMS[id] || {}).name || id).join('、') + '）' : '')
      + ' · 宝箱 ' + s.chests;
    MM.U.text(ctx, roomText, 360, y,
      MM.U.fitSize(ctx, roomText, pw - 72, 16, false), '#464b53', 'center');
    y += 28;

    y += 4;
    ctx.strokeStyle = '#2b3a58';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px0 + 30, y);
    ctx.lineTo(px0 + pw - 30, y);
    ctx.stroke();
    y += 30;

    /* V0.7：价值拆分 —— "挖出来的矿物"与"宝箱 / 藏宝库等直接价值"分开显示 */
    line('矿物价值（采矿进度 ' + s.mineValue + '）', '+' + s.mineValue, '#dfe7f2');
    line('其他价值（宝箱 / 藏宝库）', '+' + s.otherValue, '#dfe7f2');
    line('基础探索价值', String(s.baseValue), '#e8eef8', true);
    const kindLabel = s.kind === 'treasure'
      ? '藏宝库 · 主动结算（基础价值）'
      : '结束探索 · 基础价值结算';
    line(kindLabel, '', '#9fe08a');
    line('最终价值', String(s.finalValue), '#ffd75e', true);

    /* V0.7：本局补给成果（三档领取情况） */
    y += 4;
    const supplyLine = '本局补给成果：' + s.supplyText;
    const supSize = MM.U.fitSize(ctx, supplyLine, pw - 80, 15, true);
    MM.U.text(ctx, supplyLine, 360, y, supSize, '#3a5232', 'center', true);
    y += 28;

    const upgradeNames = (s.upgrades || []).map((id) => (MM.UPGRADES[id] || {}).name || id);
    const materials = s.materials || {};
    const craftingLine = '本局改造：' + (upgradeNames.length ? upgradeNames.join('、') : '未制作')
      + ' · 剩余矿料 铜' + (materials.copper || 0) + ' 银' + (materials.silver || 0)
      + ' 金' + (materials.gold || 0) + ' 晶' + (materials.crystal || 0);
    MM.U.text(ctx, craftingLine, 360, y,
      MM.U.fitSize(ctx, craftingLine, pw - 80, 14, true), '#3b4d5f', 'center', true);
    y += 24;

    const contribution = s.upgradeContributions || {};
    const contributionText = (s.upgrades || []).map((id) => {
      const name = (MM.UPGRADES[id] || {}).name || id;
      const value = {
        chainPick: '额外采矿格 ' + (contribution.chainPickOreCells || 0),
        directionalBomb: '单次最多开岩 ' + (contribution.directionalMaxWalls || 0) + ' 格',
        prospectingLens: '获得方向线索 ' + (contribution.prospectingHints || 0) + ' 次',
        hardRockDrill: '实际节省 ' + (contribution.hardRockDrillStaminaSaved || 0) + ' 体力',
        recoveryKit: '获得强化矿镐 ' + (contribution.recoveryPicksGranted || 0) + ' 把',
        afterglowWick: '触发 ' + (contribution.afterglowRooms || 0) + ' 房 · 恢复 ' + (contribution.afterglowStaminaRestored || 0) + ' 体力',
      }[id];
      return name + '：' + (value || '未统计效果');
    });
    if (contributionText.length) {
      const text = '实际改造贡献：' + contributionText.join('；');
      MM.U.text(ctx, text, 360, y, MM.U.fitSize(ctx, text, pw - 80, 13, false), '#454b53', 'center');
      y += 20;
    }

    /* V0.8.3：本局路线回顾——把"取舍的后果"在结算里讲清楚 */
    if (s.route) {
      const r = s.route;
      const hi = r.branches.filter((b) => b.tier === 'high').length;
      const lo = r.branches.length - hi;
      const branchText = r.branches.length
        ? '岔路 ' + hi + ' 高收益 / ' + lo + ' 低收益'
        : '未进入岔路（直下）';
      const skipText = r.cartRides
        ? '矿车 ' + r.cartRides + ' 次（跳过 ' + r.skippedCount + ' 格矿物 · 约 ' + r.skippedValue + ' 价值）'
        : '矿车未乘坐';
      const routeLine = '路线：' + branchText + ' · 泉水 ' + (r.springFound ? '已发现' : '未发现')
        + ' · ' + skipText + ' · 炸药 ' + r.bombs + ' / 矿镐 ' + r.picks + ' / 探矿灯 ' + r.lamps;
      MM.U.text(ctx, routeLine, 360, y, MM.U.fitSize(ctx, routeLine, pw - 80, 14, false), '#424b5b', 'center');
      y += 26;
    }

    /* V0.7.1：本局探索风格（若有） */
    if (s.styleText) {
      y += 4;
      const styleLine = '探索风格：' + s.styleText;
      MM.U.text(ctx, styleLine, 360, y, MM.U.fitSize(ctx, styleLine, pw - 80, 15, true),
        s.styleDone ? '#3b4d5f' : '#424b5b', 'center', true);
      y += 26;
    }

    if (s.treasureReached) {
      y += 6;
      const treasureCardH = s.sealedEnding ? 88 : 74;
      MM.U.fillRound(ctx, px0 + 30, y - 18, pw - 60, treasureCardH, 10, 'rgba(255,215,94,0.10)');
      MM.U.strokeRound(ctx, px0 + 30, y - 18, pw - 60, treasureCardH, 10, 'rgba(255,215,94,0.35)', 1.5);
      MM.U.text(ctx, '魔王军地下藏宝库 ✓', px0 + 46, y, 20, '#594b20', 'left', true);
      MM.U.text(ctx,
        s.firstTreasure ? '首次发现奖励：通用货币 +' + s.currencyGranted
          : '重复抵达奖励：通用货币 +' + s.currencyGranted,
        px0 + pw - 46, y, 16, '#494b4e', 'right');
      if (s.sealedEnding) {
        const memorial = s.sealedMemorialGranted
          ? '终局纪念物已获得：' + (s.sealedMemorial || '封存者铭牌')
          : '终局纪念物已陈列：' + (s.sealedMemorial || '封存者铭牌');
        MM.U.text(ctx, memorial, 360, y + 25, 14, '#544a33', 'center', true);
        MM.U.text(ctx, s.sealedEndingText || '', 360, y + 46,
          MM.U.fitSize(ctx, s.sealedEndingText || '', pw - 84, 13, false), '#464b53', 'center');
        /* 留出藏宝库卡片的完整高度，再开始绘制成就行，避免文字压住卡片下边框。 */
        y += treasureCardH - 18 + 12;
      } else {
        y += treasureCardH - 18 + 12;
      }
    }

    /* 本局亮点（§81） */
    const badges = [];
    if (s.treasureReached && s.firstTreasure) badges.push('首次抵达藏宝库');
    if (s.bestDepthImproved) badges.push('新纪录：最深 ' + s.maxDepth + 'm');
    if (s.bestValueImproved) badges.push('最高单局价值');
    if (s.mysteryFound) badges.push('发现神秘石室');
    if (badges.length) {
      y += 6;
      const fit = (line2) => MM.U.fitSize(ctx, line2, pw - 80, 17, true);
      const line1 = badges.slice(0, 2).join(' · ');
      const line2 = badges.slice(2).join(' · ');
      MM.U.text(ctx, line1, 360, y, fit(line1), '#594b20', 'center', true);
      y += 26;
      if (line2) {
        MM.U.text(ctx, line2, 360, y, fit(line2), '#594b20', 'center', true);
        y += 26;
      }
    }

    /* V0.7：探索档案新发现 + 下一局可选挑战 */
    const newBits = [];
    (s.newRooms || []).forEach((id) => newBits.push('新隐藏区域「' + ((MM.ROOMS[id] || {}).name || id) + '」'));
    (s.newMinerals || []).forEach((id) => newBits.push('新矿物「' + ((MM.RESOURCES[id] || {}).name || id) + '」'));
    (s.newStyles || []).forEach((id) => {
      const d = MM.Style ? MM.Style.def(id) : null;
      newBits.push('风格徽章「' + ((d && d.name) || id) + '」');
    });
    (s.newRelics || []).forEach((id) => {
      const d = MM.Relics ? MM.Relics.def(id) : null;
      newBits.push('遗物「' + ((d && d.name) || id) + '」');
    });
    if (newBits.length) {
      y += 8;
      const relicsFound = s.newRelics || [];
      const maxChars = relicsFound.length ? 27 : 31;
      const newBitLines = [];
      let current = '档案新发现：';
      newBits.forEach((bit) => {
        const separator = current === '档案新发现：' ? '' : ' · ';
        if (current !== '档案新发现：' && current.length + separator.length + bit.length > maxChars) {
          newBitLines.push(current);
          current = bit;
        } else {
          current += separator + bit;
        }
      });
      if (current) newBitLines.push(current);
      if (relicsFound.length && MM.Assets) {
        const relicIndex = (MM.RELICS || []).findIndex((r) => r.id === relicsFound[0]);
        if (relicIndex >= 0) MM.Assets.drawRelicIcon(ctx, relicIndex + 1, px0 + 34, y - 18, 36, false, 1);
      }
      newBitLines.forEach((t, i) => {
        const lineY = y + i * 20;
        if (relicsFound.length) {
          MM.U.text(ctx, t, px0 + 82, lineY, MM.U.fitSize(ctx, t, pw - 118, 14, true), '#594b20', 'left', true);
        } else {
          MM.U.text(ctx, t, 360, lineY, MM.U.fitSize(ctx, t, pw - 80, 14, true), '#594b20', 'center', true);
        }
      });
      y += newBitLines.length * 20 + 6;
    }
    if (s.challenge) {
      const t = '下一局可选挑战：' + s.challenge.text;
      y += 4;
      MM.U.text(ctx, t, 360, y, MM.U.fitSize(ctx, t, pw - 80, 16, false), '#3b4d5f', 'center');
      y += 28;
    }

    /* 底部记录区固定分行，Seed 按钮单独占行，不与档案统计共用高度。 */
    y = Math.max(y + 18, py + ph - 410);
    MM.U.text(ctx,
      '新规则纪录：最深 ' + rec.bestDepth + 'm · 最高价值 ' + rec.bestValue
      + ' · 累计挖掘 ' + rec.totalDigs,
      360, y, 15, '#424b5b', 'center');
    MM.U.text(ctx,
      '旧规则 v2（V0.6–V0.8）：最深 ' + rec.previous.bestDepth + 'm · 最高价值 ' + rec.previous.bestValue,
      360, y + 24, 14, '#424b5d', 'center');
    MM.U.text(ctx,
      '早期规则 v1（V0.1–V0.5）：最深 ' + rec.legacy.bestDepth + 'm · 最高价值 ' + rec.legacy.bestValue,
      360, y + 42, 13, '#596982', 'center');
    MM.U.text(ctx,
      '探索档案：隐藏区域 ' + archive.rooms.length + '/' + MM.ROOM_ORDER.length
      + ' · 矿物 ' + archive.minerals.length + '/' + MM.RESOURCE_ORDER.length
      + ' · 风格 ' + ((archive.styles || []).length) + '/' + ((MM.BALANCE.STYLES || []).length)
      + ' · 遗物 ' + ((archive.relics || []).length) + '/' + ((MM.RELICS || []).length)
      + ' · 已探索 ' + archive.runs + ' 局 · 通用货币 ' + save.currency(),
      360, y + 66, 13, '#424b5b', 'center');

    /* V0.7.1：同 Seed 挑战——本机最佳 + 复制挑战串 */
    const seedBest = s.seedBest;
    const seedLine = s.tutorialRun
      ? '教学局：本局不计入普通纪录与 Seed 榜'
      : seedBest
      ? '本 Seed 第 ' + seedBest.runs + ' 局 · 本机最佳：最深 ' + seedBest.bestDepth + 'm / 价值 '
        + seedBest.bestValue + (s.seedImproved ? '（本局刷新）' : '')
      : '本 Seed 首次挑战（可复制给朋友同图对比）';
    MM.U.text(ctx, seedLine, px0 + 36, py + ph - 292,
      MM.U.fitSize(ctx, seedLine, 352, 14, true), s.seedImproved ? '#594b20' : '#424b5b', 'left', true);
    mode.hit.copySeed = { x: px0 + pw - 190, y: py + ph - 311, w: 160, h: 38 };
    button(ctx, mode.hit.copySeed, '复制挑战 Seed', { color: '#2f4a78', small: true });

    /* P4：试玩记录导出（本地 JSON；导出前可填写"为何走这条支路"备注） */
    mode.hit.exportRun = { x: px0 + 30, y: py + ph - 236, w: pw - 60, h: 58 };
    button(ctx, mode.hit.exportRun, '查看探索手记', { color: '#3d4a68', small: true });
    if (mode.exportMsgT > 0 && mode.exportMsg) {
      MM.U.text(ctx, mode.exportMsg, 360, py + ph - 164, 15, '#3a5232', 'center');
    }

    mode.hit.retry = { x: px0 + 30, y: py + ph - 130, w: 262, h: 88 };
    mode.hit.back = { x: px0 + pw - 292, y: py + ph - 130, w: 262, h: 88 };
    button(ctx, mode.hit.retry, '再挖一次', { color: '#2f6f4f' });
    button(ctx, mode.hit.back, '返回标题', { color: '#3a3f52' });
  };

  /* 矿车抉择弹窗（§36；V0.6 双向：前往深处 / 返回车站） */
  /* 采矿补给三选一（V0.7）：
   * 选项说明"现在能做什么"，并标出现有数量 → 玩家按当前体力和路线自己判断。 */
  UI.drawSupplyModal = function (ctx, mode) {
    const m = mode.modal || {};
    const run = mode.run;
    const tier = MM.Progress.tiers(run).filter((t) => t.id === m.tierId)[0];
    if (!tier) return;
    const choices = tier.choices || [];
    const st = MM.Progress.status(run);

    ctx.fillStyle = 'rgba(4,6,10,0.78)';
    ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);

    const px0 = 60, py = 280, pw = 600, ph = 600;
    drawPanel(ctx, { x: px0, y: py, w: pw, h: ph }, { accent: '#9fe08a', border: '#496b4d' });

    MM.U.text(ctx, '采矿补给 · ' + tier.name, 360, py + 56, 30, '#3a5232', 'center', true);
    MM.U.text(ctx, '本局采矿进度 ' + st.mineValue + ' / ' + tier.need + ' · 达标奖励',
      360, py + 100, 18, '#494b4e', 'center');
    MM.U.text(ctx, '选择一项立即生效（本档只发一次）：', 360, py + 134, 16, '#424b5b', 'center');

    mode.hit.supplyChoices = [];
    const cardH = 104, gap = 14, y0 = py + 158;
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      const rect = { x: px0 + 34, y: y0 + i * (cardH + gap), w: pw - 68, h: cardH };
      mode.hit.supplyChoices.push(rect);
      drawPanel(ctx, rect, { fill: '#1b2436', border: '#3f5a86', accent: '#9fe08a', radius: 12, lineWidth: 1.5 });
      const gain = c.gain || {};
      const icon = gain.stamina ? 1 : (gain.bomb ? 7 : (gain.powerPick ? 8 : 9));
      if (MM.Assets) MM.Assets.drawIcon(ctx, icon, rect.x + 16, rect.y + 22, 56);
      MM.U.text(ctx, c.label, rect.x + 86, rect.y + 34, 24, '#4b4b4b', 'left', true);
      const now = UI.supplyNowText(run, c.gain || {});
      if (now) {
        const ns = MM.U.fitSize(ctx, now, 280, 17, true);
        MM.U.text(ctx, now, rect.x + rect.w - 20, rect.y + 34, ns, '#3b4d5f', 'right');
      }
      const ds = MM.U.fitSize(ctx, c.detail || '', rect.w - 112, 17, false);
      MM.U.text(ctx, c.detail || '', rect.x + 86, rect.y + 72, ds, '#454b55', 'left');
    }

    const tipY = y0 + choices.length * (cardH + gap) + 6;
    MM.U.text(ctx, '提示：体力用于继续深入；炸药 / 矿镐留给硬岩或深层更划算',
      360, tipY, 15, '#424b5b', 'center');
  };

  /* 选项旁边的"现有 → 变化"提示，帮助判断哪一个不浪费 */
  UI.supplyNowText = function (run, gain) {
    if (gain.stamina) {
      const before = run.stamina;
      const after = Math.min(run.maxStamina, before + gain.stamina);
      return '体力 ' + before + ' → ' + after + '（+' + (after - before) + '）';
    }
    if (gain.bomb) return '炸药 ' + (run.tools.bomb || 0) + ' → ' + ((run.tools.bomb || 0) + gain.bomb);
    if (gain.powerPick) return '矿镐 ' + (run.tools.powerPick || 0) + ' → ' + ((run.tools.powerPick || 0) + gain.powerPick);
    if (gain.lamp) return '探矿灯 ' + (run.tools.lamp || 0) + ' → ' + ((run.tools.lamp || 0) + gain.lamp);
    return '';
  };

  UI.drawWorkbenchModal = function (ctx, mode) {
    const run = mode.run;
    ctx.fillStyle = 'rgba(4,6,10,0.80)';
    ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);
    const px = 24, py = Math.max(24, Math.round((LAYOUT.H - 1072) / 2)), pw = 672, ph = 1072;
    drawPanel(ctx, { x: px, y: py, w: pw, h: ph }, { accent: '#d9a92c', border: '#69572e' });
    MM.U.text(ctx, '矿道工作台', 360, py + 48, 32, '#554b28', 'center', true);
    MM.U.text(ctx, '改造会消耗本局矿料，不影响采矿进度与探索价值', 360, py + 82, 18, '#464b53', 'center');
    MM.U.fillRound(ctx, px + 28, py + 102, pw - 56, 44, 8, 'rgba(159,208,255,0.08)');
    MM.U.text(ctx, '改造槽 ' + (run.upgrades || []).length + ' / ' + MM.UPGRADE_SLOT_LIMIT,
      px + 52, py + 124, 18, '#3b4d5f', 'left', true);
    const materialX = [px + 274, px + 370, px + 458, px + 548];
    const materialData = [
      [3, '铜', run.materials.copper || 0], [4, '银', run.materials.silver || 0],
      [5, '金', run.materials.gold || 0], [6, '晶', run.materials.crystal || 0],
    ];
    materialData.forEach((m, i) => {
      if (MM.Assets) MM.Assets.drawIcon(ctx, m[0], materialX[i] - 22, py + 110, 28);
      MM.U.text(ctx, String(m[2]), materialX[i] + 10, py + 124, 19, '#494b4e', 'left', true);
    });

    const recipes = MM.CRAFTING_RECIPES || [];
    const pageSize = 2;
    const pageCount = Math.max(1, Math.ceil(recipes.length / pageSize));
    const page = Math.min(pageCount - 1, Math.max(0, mode.workbenchPage || 0));
    const start = page * pageSize;
    const prevRect = { x: px + 18, y: py + 150, w: 132, h: 82 };
    const nextRect = { x: px + pw - 150, y: py + 150, w: 132, h: 82 };
    mode.hit.workbenchPrev = prevRect;
    mode.hit.workbenchNext = nextRect;
    button(ctx, prevRect, '‹ 上一页', { color: '#2e4a6c', disabled: page === 0, small: true });
    button(ctx, nextRect, '下一页 ›', { color: '#2e4a6c', disabled: page >= pageCount - 1, small: true });
    const firstShown = recipes.length ? start + 1 : 0;
    const lastShown = Math.min(recipes.length, start + pageSize);
    MM.U.text(ctx, '配方 ' + firstShown + '–' + lastShown + ' / ' + recipes.length,
      360, py + 192, 18, '#464b53', 'center', true);

    mode.hit.workbenchCraft = [];
    mode.hit.workbenchTrack = [];
    const list = { x: px + 16, y: py + 234, w: pw - 32, h: 620 };
    const rowH = 300, gap = 12;
    ctx.save();
    ctx.beginPath(); ctx.rect(list.x, list.y, list.w, list.h); ctx.clip();
    for (let slot = 0; slot < pageSize; slot++) {
      const index = start + slot;
      const recipe = recipes[index];
      if (!recipe) continue;
      const y = list.y + slot * (rowH + gap);
      const row = { x: list.x, y, w: list.w, h: rowH };
      const preview = MM.Crafting.preview(run, recipe.id);
      const owned = MM.Upgrades.has(run, recipe.upgradeId);
      drawPanel(ctx, row, {
        fill: '#1a2435',
        border: owned ? '#4c725a' : '#354865',
        accent: owned ? '#9fe08a' : '#9fd0ff',
        lineWidth: 1.5, radius: 10,
      });
      if (MM.Assets) MM.Assets.drawUpgradeIcon(ctx, recipe.upgradeId, row.x + 18, row.y + 16, 56);
      MM.U.text(ctx, recipe.name, row.x + 92, row.y + 38, 26, '#494b4d', 'left', true);
      const desc = MM.U.fitSize(ctx, recipe.desc, row.w - 122, 18, false);
      MM.U.text(ctx, recipe.desc, row.x + 92, row.y + 72, desc, '#454b55', 'left');
      const costText = '配方：' + preview.costs.map((c) => c.name + ' ' + c.have + '/' + c.need).join(' · ');
      MM.U.text(ctx, costText, row.x + 18, row.y + 120,
        MM.U.fitSize(ctx, costText, row.w - 36, 19, true), '#484b4e', 'left', true);
      const reason = preview.ok ? '材料足够，可以制作'
        : preview.reason === 'owned' ? '本局已制作'
          : preview.reason === 'slots' ? '改造槽已满'
            : preview.reason === 'locked' ? '尚未解锁'
              : '材料不足；追踪后可在仓库优先拆取所缺矿料';
      MM.U.text(ctx, reason, row.x + 18, row.y + 158, 17,
        preview.ok ? '#3a5232' : '#424b5b', 'left');

      const craftRect = { x: row.x + 12, y: row.y + 194, w: 298, h: 82 };
      const trackRect = { x: row.x + 318, y: row.y + 194, w: 298, h: 82 };
      mode.hit.workbenchCraft[index] = craftRect;
      mode.hit.workbenchTrack[index] = trackRect;
      button(ctx, craftRect, owned ? '已制作' : '制作改造', {
        color: '#2f6f4f', disabled: !preview.ok, small: true,
      });
      button(ctx, trackRect, run.trackedRecipe === recipe.id ? '已追踪' : '追踪配方', {
        color: '#2f4a78', disabled: owned, small: true,
      });
    }
    ctx.restore();

    const slotNames = (run.upgrades || []).map((id) => (MM.UPGRADES[id] || {}).name || id);
    const equipped = slotNames.length ? '已装备：' + slotNames.join('、') : '尚未装备改造';
    MM.U.text(ctx, equipped, 360, py + 884,
      MM.U.fitSize(ctx, equipped, pw - 60, 18, true), '#464b53', 'center');
    mode.hit.workbenchClose = { x: px + 176, y: py + 928, w: pw - 352, h: 86 };
    button(ctx, mode.hit.workbenchClose, '返回矿道', { color: '#3a3f52' });
  };

  UI.drawWarehouseChoiceModal = function (ctx, mode) {
    const m = mode.modal || {};
    ctx.fillStyle = 'rgba(4,6,10,0.80)';
    ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);
    const px = 48, py = 286, pw = 624, ph = 704;
    drawPanel(ctx, { x: px, y: py, w: pw, h: ph }, { accent: '#9fd0ff', border: '#3e607b' });
    MM.U.text(ctx, '废弃矿料仓库', 360, py + 56, 30, '#484b4e', 'center', true);
    MM.U.text(ctx, '只能带走一类物资；选择会记录在本局路线中', 360, py + 96, 16, '#424b5b', 'center');

    const supplies = { x: px + 28, y: py + 144, w: pw - 56, h: 210 };
    mode.hit.warehouseSupplies = supplies;
    drawPanel(ctx, supplies, { fill: '#202b3d', border: '#64734a', accent: '#9fe08a', radius: 12, lineWidth: 1.5 });
    if (MM.Assets) {
      MM.Assets.drawIcon(ctx, 7, supplies.x + 18, supplies.y + 18, 48);
      MM.Assets.drawIcon(ctx, 8, supplies.x + 48, supplies.y + 36, 42);
    }
    MM.U.text(ctx, '工具补给', supplies.x + 106, supplies.y + 43, 26, '#3a5232', 'left', true);
    MM.U.text(ctx, '获得随机工具，并增加 15–20 点其他探索价值。',
      supplies.x + 106, supplies.y + 91, MM.U.fitSize(ctx, '获得随机工具，并增加 15–20 点其他探索价值。', supplies.w - 132, 17, false), '#484b4e', 'left');
    MM.U.text(ctx, '适合当前更需要继续挖掘能力时选择。', supplies.x + 106, supplies.y + 126, 16, '#424b5b', 'left');
    button(ctx, { x: supplies.x + 160, y: supplies.y + 151, w: supplies.w - 320, h: 48 }, '带走工具补给', { color: '#2f6f4f' });

    const materials = { x: px + 28, y: py + 382, w: pw - 56, h: 252 };
    mode.hit.warehouseMaterials = materials;
    drawPanel(ctx, materials, { fill: '#202b3d', border: '#46617e', accent: '#9fd0ff', radius: 12, lineWidth: 1.5 });
    if (MM.Assets) {
      MM.Assets.drawIcon(ctx, 3, materials.x + 17, materials.y + 18, 44);
      MM.Assets.drawIcon(ctx, 4, materials.x + 46, materials.y + 42, 42);
    }
    MM.U.text(ctx, '拆取制作矿料', materials.x + 106, materials.y + 43, 26, '#3b4d5f', 'left', true);
    const salvageText = MM.Crafting.materialText(m.salvage || {});
    MM.U.text(ctx, salvageText || '铜 +1、银 +1', materials.x + 106, materials.y + 94,
      MM.U.fitSize(ctx, salvageText || '铜 +1、银 +1', materials.w - 132, 21, true), '#494b4e', 'left', true);
    const tracked = MM.Crafting.recipe(mode.run.trackedRecipe);
    const detail = tracked ? '优先补足追踪配方「' + tracked.name + '」，不增加探索价值。'
      : '没有追踪配方时，默认拆取铜 +1、银 +1；不增加探索价值。';
    MM.U.text(ctx, detail, materials.x + 24, materials.y + 128,
      MM.U.fitSize(ctx, detail, materials.w - 132, 17, false), '#424b5b', 'left');
    button(ctx, { x: materials.x + 160, y: materials.y + 184, w: materials.w - 320, h: 52 }, '带走矿料', { color: '#2f4a78' });
  };

  UI.drawSpringChoiceModal = function (ctx, mode) {
    const m = mode.modal || {};
    ctx.fillStyle = 'rgba(4,6,10,0.80)'; ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);
    const rect = { x: 62, y: 408, w: 596, h: 448 };
    drawPanel(ctx, rect, { accent: '#7fd8ff', border: '#3e718b' });
    if (MM.Assets) MM.Assets.drawIcon(ctx, 9, 318, rect.y + 28, 72);
    MM.U.text(ctx, '发现地下泉', 360, rect.y + 126, 30, '#374f58', 'center', true);
    const heal = Math.max(0, Math.floor(m.heal || 0));
    MM.U.text(ctx, '饮用可恢复 ' + heal + ' 体力，实际恢复量受体力上限影响。', 360, rect.y + 174,
      MM.U.fitSize(ctx, '饮用可恢复 ' + heal + ' 体力，实际恢复量受体力上限影响。', 520, 18, false), '#474b50', 'center');
    MM.U.text(ctx, '也可以先保留，之后回到泉边再使用一次。', 360, rect.y + 212, 17, '#424b5b', 'center');
    mode.hit.springNow = { x: rect.x + 32, y: rect.y + 278, w: 250, h: 82 };
    mode.hit.springLater = { x: rect.x + 314, y: rect.y + 278, w: 250, h: 82 };
    button(ctx, mode.hit.springNow, '现在饮用', { color: '#2f6f85' });
    button(ctx, mode.hit.springLater, '留到之后', { color: '#2f4a78' });
  };

  UI.drawGateChoiceModal = function (ctx, mode) {
    const gate = mode.map.gate || {};
    const copper = Math.max(0, (mode.run.materials || {}).copper || 0);
    ctx.fillStyle = 'rgba(4,6,10,0.82)'; ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);
    const rect = { x: 48, y: 362, w: 624, h: 556 };
    drawPanel(ctx, rect, { accent: '#ffd15c', border: '#80653a' });
    MM.U.text(ctx, '机巧闸门控制台', 360, rect.y + 58, 29, '#594b20', 'center', true);
    MM.U.text(ctx, '选择一种处理方式；闸门不会阻止主路线通关。', 360, rect.y + 99, 16, '#454b53', 'center');
    const repair = { x: rect.x + 28, y: rect.y + 142, w: rect.w - 56, h: 126 };
    drawPanel(ctx, repair, { fill: '#17352d', border: '#5d9468', accent: '#9fe08a', radius: 10, lineWidth: 1.5 });
    MM.U.text(ctx, '修复闸门 · 铜 ×2（持有 ' + copper + '）', repair.x + 20, repair.y + 38, 20, '#3a5232', 'left', true);
    MM.U.text(ctx, '打开预设侧路；不会生成额外矿料或免费奖励。', repair.x + 20, repair.y + 75,
      MM.U.fitSize(ctx, '打开预设侧路；不会生成额外矿料或免费奖励。', repair.w - 40, 16, false), '#474b50', 'left');
    mode.hit.gateRepair = { x: repair.x + 68, y: repair.y + 88, w: repair.w - 136, h: 30 };
    button(ctx, mode.hit.gateRepair, copper >= 2 ? '支付铜料，打开侧路' : '铜料不足', { color: '#2f6f4f', small: true, disabled: copper < 2 });
    const dismantle = { x: rect.x + 28, y: rect.y + 286, w: rect.w - 56, h: 112 };
    drawPanel(ctx, dismantle, { fill: '#202b3d', border: '#64748a', accent: '#9fd0ff', radius: 10, lineWidth: 1.5 });
    MM.U.text(ctx, '拆解控制台 · 银料 +1', dismantle.x + 20, dismantle.y + 38, 20, '#464b53', 'left', true);
    MM.U.text(ctx, '闸门保持关闭；主路线仍可继续前进。', dismantle.x + 20, dismantle.y + 72, 16, '#424b5b', 'left');
    mode.hit.gateDismantle = { x: dismantle.x + 68, y: dismantle.y + 75, w: dismantle.w - 136, h: 28 };
    button(ctx, mode.hit.gateDismantle, '拆下零件并结束选择', { color: '#34475f', small: true });
    mode.hit.gateClose = { x: rect.x + 172, y: rect.y + 428, w: 280, h: 60 };
    button(ctx, mode.hit.gateClose, '暂不处理', { color: '#3a3f52' });
    if (gate.resolved) MM.U.text(ctx, '该控制台已经处理。', 360, rect.y + rect.h - 20, 14, '#424b5b', 'center');
  };

  UI.drawTreasureChoiceModal = function (ctx, mode) {
    const p = (mode.modal && mode.modal.preview) || (mode.treasureSeq && mode.treasureSeq.preview) || {};
    const amount = Math.max(0, Number(p.amount) || 0);
    ctx.fillStyle = 'rgba(4,6,10,0.84)'; ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);
    const rect = { x: 52, y: 396, w: 616, h: 488 };
    drawPanel(ctx, rect, { accent: '#ffd75e', border: '#9b7338', lineWidth: 2.5 });
    if (MM.Assets) MM.Assets.drawIcon(ctx, 2, 322, rect.y + 24, 76);
    MM.U.text(ctx, '抵达矿坑藏宝库', 360, rect.y + 134, 31, '#594b20', 'center', true);
    MM.U.text(ctx, '已达成目标 · 本次奖励 ' + (p.first ? '首次' : '重复') + '抵达 +' + amount + ' 通用货币',
      360, rect.y + 182, MM.U.fitSize(ctx, '已达成目标 · 本次奖励 ' + (p.first ? '首次' : '重复') + '抵达 +' + amount + ' 通用货币', 540, 18, false), '#544a30', 'center', true);
    MM.U.text(ctx, '结算会结束本局并保存进度；继续探索不会再次发放藏宝库奖励。', 360, rect.y + 230,
      MM.U.fitSize(ctx, '结算会结束本局并保存进度；继续探索不会再次发放藏宝库奖励。', 540, 16, false), '#464b53', 'center');
    MM.U.text(ctx, '继续探索不恢复体力，也不重置工具或矿物。', 360, rect.y + 266, 16, '#424b5b', 'center');
    mode.hit.treasureSettle = { x: rect.x + 28, y: rect.y + 330, w: rect.w - 56, h: 60 };
    mode.hit.treasureContinue = { x: rect.x + 28, y: rect.y + 404, w: rect.w - 56, h: 52 };
    button(ctx, mode.hit.treasureSettle, '结算并结束探索', { color: '#80602b' });
    button(ctx, mode.hit.treasureContinue, '继续向下探索', { color: '#2f4a78', small: true });
  };

  UI.drawUpgradeInfoModal = function (ctx, mode) {
    const id = mode.modal && mode.modal.upgradeId;
    const upgrade = MM.UPGRADES[id];
    if (!upgrade) { mode.modal = null; return; }
    ctx.fillStyle = 'rgba(4,6,10,0.78)'; ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);
    const rect = { x: 70, y: 440, w: 580, h: 400 };
    drawPanel(ctx, rect, { fill: '#152338', border: '#526985', accent: '#d5a653', lineWidth: 2 });
    if (MM.Assets) MM.Assets.drawUpgradeIcon(ctx, id, rect.x + rect.w / 2 - 38, rect.y + 26, 76);
    MM.U.text(ctx, upgrade.name, 360, rect.y + 138, 29, '#554b28', 'center', true);
    const desc = upgrade.desc || '';
    MM.U.text(ctx, desc, 360, rect.y + 194, MM.U.fitSize(ctx, desc, 500, 19, false), '#484b4e', 'center');
    const stats = mode.run.stats || {};
    const remainingById = { hardRockDrill: Math.max(0, (MM.UPGRADE_USE_LIMITS.hardRockDrill || 6) - (stats.drillUses || 0)),
      recoveryKit: Math.max(0, (MM.UPGRADE_USE_LIMITS.recoveryKit || 2) - (stats.recoveryPicks || 0)),
      afterglowWick: Math.max(0, (MM.UPGRADE_USE_LIMITS.afterglowWick || 3) - (stats.afterglowRooms || 0)) };
    const limited = Object.prototype.hasOwnProperty.call(remainingById, id);
    const uses = limited ? '剩余触发：' + remainingById[id] + ' / ' + MM.UPGRADE_USE_LIMITS[id]
      : '本局装备中 · 效果持续至本局结束';
    MM.U.text(ctx, uses, 360, rect.y + 250, 18, limited && !remainingById[id] ? '#424b5b' : '#3a5232', 'center', true);
    mode.hit.upgradeClose = { x: rect.x + 180, y: rect.y + 304, w: 220, h: 60 };
    button(ctx, mode.hit.upgradeClose, '返回矿道', { color: '#2f4a78' });
  };

  UI.drawCartModal = function (ctx, mode) {
    const m = mode.modal || {};
    const to = m.to || (mode.map.plan && mode.map.plan.minecartDest);
    const back = m.dir === 'back';
    ctx.fillStyle = 'rgba(4,6,10,0.72)';
    ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);

    const px0 = 70, py = 360, pw = 580, ph = 480;
    drawPanel(ctx, { x: px0, y: py, w: pw, h: ph }, { accent: '#d9b85e', border: '#69572e' });
    MM.U.text(ctx, back ? '返回矿车站' : '废弃矿车站', 360, py + 58, 30, '#594b20', 'center', true);
    MM.U.text(ctx, back ? '矿车停在旧巷道尽头，可以乘车回到上层车站。' : '一辆仍可使用的旧矿车停在轨道上，通向更深处。',
      360, py + 116, 19, '#494b4e', 'center');
    MM.U.text(ctx, '乘坐：免费移动，不消耗体力', 360, py + 162, 19, '#3a5232', 'center');
    /* V0.7.1：把跳过的代价变成看得见的数字（当前地图状态下沿最短路径的未挖矿物） */
    const skip = m.skip || { count: 0, value: 0 };
    const costText = skip.count
      ? '代价：跳过沿途 ' + skip.count + ' 格矿物（约 ' + skip.value + ' 价值；跨过的岩块保持未挖）'
      : '这条轨道沿途已经没有未挖的矿物（跨过的岩块保持未挖）';
    const cs = MM.U.fitSize(ctx, costText, pw - 60, 19, false);
    MM.U.text(ctx, costText, 360, py + 198, cs, skip.count ? '#6f432e' : '#424b5b', 'center');
    if (to) MM.U.text(ctx, '目的地：约 ' + to.y + 'm ' + (back ? '处的旧车站' : '深处的旧巷道'), 360, py + 242, 17, '#424b5b', 'center');

    mode.hit.cartRide = { x: px0 + 44, y: py + ph - 132, w: 236, h: 88 };
    mode.hit.cartSkip = { x: px0 + pw - 280, y: py + ph - 132, w: 236, h: 88 };
    button(ctx, mode.hit.cartRide, '乘坐矿车', { color: '#2f6f4f' });
    button(ctx, mode.hit.cartSkip, '暂不乘坐', { color: '#3a3f52' });
  };

  /* 新手教程插画：只组合项目现有矿工、地形和工具图标，沿用正式素材色阶。 */
  function drawTutorialIllustration(ctx, page, x, y, w, h, mode) {
    MM.U.fillRound(ctx, x, y, w, h, 10, '#0b101a');
    MM.U.strokeRound(ctx, x, y, w, h, 10, '#34425f', 1.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, w - 4, h - 4);
    ctx.clip();

    /* 背景墙砖压暗处理，保证上层图标与说明清楚。 */
    if (MM.Assets) {
      ctx.globalAlpha = 0.48;
      for (let yy = y + 6; yy < y + h; yy += 58) {
        for (let xx = x + 4; xx < x + w; xx += 58) {
          const key = ((Math.floor((xx - x) / 58) + Math.floor((yy - y) / 58)) % 2)
            ? 'rock-a' : 'rock-b';
          MM.Assets.drawTile(ctx, key, xx, yy, 58);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(8,12,20,0.43)';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

    if (page === 0) {
      if (MM.Assets) {
        MM.Assets.drawTile(ctx, 'rock-a', x + 62, y + 25, 62);
        MM.Assets.drawMiner(ctx, 'down', 1, x + 54, y + 82, 78, false);
        MM.Assets.drawTile(ctx, 'vault-wall', x + 62, y + 192, 62);
        /* 图标帧：2 = 金币（藏宝库奖励；3~6 才是铜/银/金/水晶） */
        MM.Assets.drawIcon(ctx, 2, x + 80, y + 201, 26);
      }
      ctx.fillStyle = '#ffd75e';
      ctx.fillRect(x + 91, y + 155, 3, 20);
      ctx.fillRect(x + 83, y + 166, 19, 3);
      ctx.fillRect(x + 83, y + 166, 3, 8);
      ctx.fillRect(x + 99, y + 166, 3, 8);
      MM.U.text(ctx, '入口', x + w / 2, y + 18, 14, '#464b53', 'center', true);
      MM.U.text(ctx, '最深处', x + w / 2, y + h - 20, 14, '#524b36', 'center', true);
    } else if (page === 1) {
      const keys = ['dirt-a', 'rock-a', 'hard-a'];
      const costs = ['耗 1', '耗 2', '耗 3'];
      for (let i = 0; i < keys.length; i++) {
        const tx = x + 18 + i * 54;
        if (MM.Assets) MM.Assets.drawTile(ctx, keys[i], tx, y + 45, 52);
        MM.U.fillRound(ctx, tx - 2, y + 103, 56, 27, 4, 'rgba(7,10,17,0.92)');
        MM.U.text(ctx, costs[i], tx + 26, y + 116, 15, i === 2 ? '#62453d' : '#494b4e', 'center', true);
      }
      if (MM.Assets) {
        MM.Assets.drawMiner(ctx, 'down', Math.floor((mode.time * 5) % 4), x + 57, y + 151, 74, true);
        MM.Assets.drawIcon(ctx, 8, x + 74, y + 235, 34);
      }
      MM.U.text(ctx, '相邻岩块', x + w / 2, y + 27, 14, '#464b53', 'center', true);
      MM.U.text(ctx, '点选后挖通道路', x + w / 2, y + h - 18, 13, '#464b53', 'center');
    } else {
      if (MM.Assets) {
        /* 图标图集帧（1~9）：1 红心、2 金币、3 铜、4 银、5 金、6 水晶、7 炸药、8 镐、9 灯。
         * V0.8.4 修正：此前误用 2~5（金币/铜/银/金）标注铜/银/金/水晶，现改为 3~6。 */
        const iconFrames = [3, 4, 5, 6];
        const values = ['5', '10', '20', '35'];
        for (let i = 0; i < iconFrames.length; i++) {
          const ix = x + 24 + (i % 2) * 76;
          const iy = y + 42 + Math.floor(i / 2) * 70;
          MM.Assets.drawIcon(ctx, iconFrames[i], ix, iy, 38);
          MM.U.text(ctx, values[i], ix + 50, iy + 20, 17,
            ['#6a4525', '#484b4e', '#594b20', '#2f515f'][i], 'left', true);
        }
        MM.Assets.drawIcon(ctx, 7, x + 24, y + 205, 32);
        MM.Assets.drawIcon(ctx, 8, x + 80, y + 205, 32);
        MM.Assets.drawIcon(ctx, 9, x + 136, y + 205, 32);
      }
      MM.U.fillRound(ctx, x + 22, y + 169, w - 44, 10, 5, '#151b29');
      MM.U.fillRound(ctx, x + 24, y + 171, Math.round((w - 48) * 0.55), 6, 3, '#64b981');
      MM.U.text(ctx, '矿物推进补给', x + w / 2, y + h - 18, 14, '#3a5232', 'center', true);
    }
    ctx.restore();
  }

  UI.drawTutorial = function (ctx, mode) {
    const t = mode.tutorial;
    const pages = [
      {
        title: '目标在矿坑最深处',
        lines: ['沿着矿道向下探索，找到最底部的藏宝库。', '抵达后可结算，也可继续探索。', '随时结束，带走已经取得的价值。'],
      },
      {
        title: '看清成本，再决定挖哪里',
        lines: ['点击相邻、未挖开的岩块来开路。', '“耗 1 / 2 / 3”是这块岩石消耗的体力；', '“+5 / +10 …”是矿物价值。', '已挖开的道路可以免费移动。'],
      },
      {
        title: '矿物有两种本局用途',
        lines: ['挖出矿物会增加采矿进度，也会留下可用矿料。', '进度能换工具补给；矿料能在工作台制作局内改造。', '教学开场不计入普通纪录或 Seed 榜。'],
      },
    ];
    const page = MM.U.clamp(t.page | 0, 0, pages.length - 1);
    const p = pages[page];
    const pw = 624, ph = 660, px = 48, py = Math.max(40, (LAYOUT.H - ph) / 2);

    ctx.fillStyle = 'rgba(4,6,10,0.76)';
    ctx.fillRect(0, 0, LAYOUT.W, LAYOUT.H);
    drawPanel(ctx, { x: px, y: py, w: pw, h: ph }, { accent: '#9fd0ff', border: '#3c4c6e' });

    if (MM.Assets) {
      MM.Assets.drawIcon(ctx, 8, px + 24, py + 22, 30);
    }
    MM.U.text(ctx, '矿工手记', px + 66, py + 39, 24, '#494b4d', 'left', true);
    MM.U.text(ctx, (page + 1) + ' / ' + pages.length, px + pw - 28, py + 39, 15, '#424b5b', 'right');
    ctx.fillStyle = 'rgba(255,215,94,0.35)';
    ctx.fillRect(px + 24, py + 70, pw - 48, 2);

    const artX = px + 24, artY = py + 94, artW = 160, artH = 210;
    drawTutorialIllustration(ctx, page, artX, artY, artW, artH, mode);
    const tx = px + 210;
    MM.U.text(ctx, p.title, tx, py + 155,
      MM.U.fitSize(ctx, p.title, pw - 234, 27, true), '#253932', 'left', true);
    MM.U.text(ctx, ['向下探索 · 带回收获','挖掘耗体力 · 走路免费','积累矿物 · 制作工具'][page], tx, py + 205, 23, '#45574e', 'left');
    // Wrap the copy at a readable size instead of shrinking an entire sentence.
    let lineY = py + 346;
    for (const paragraph of p.lines) {
      let line = '';
      for (const letter of paragraph) {
        if (MM.U.fitSize(ctx, line + letter, pw - 48, 24, false) < 24) {
          MM.U.text(ctx, line, px + 24, lineY, 24, '#253932', 'left');
          lineY += 36; line = '';
        }
        line += letter;
      }
      if (line) { MM.U.text(ctx, line, px + 24, lineY, 24, '#253932', 'left'); lineY += 38; }
    }

    const nextLabel = page < pages.length - 1 ? '下一步' : '开始挖掘';
    mode.hit.tutorialNext = { x: px + pw - 232, y: py + ph - 100, w: 204, h: 82 };
    mode.hit.tutorialSkip = { x: px + 24, y: py + ph - 100, w: 176, h: 82 };
    button(ctx, mode.hit.tutorialSkip, '跳过教程', { color: '#3a3f52', small: true });
    button(ctx, mode.hit.tutorialNext, nextLabel, { color: page === pages.length - 1 ? '#2f6f4f' : '#2f5fae' });
  };

  UI.drawTutorialGuide = function (ctx, mode) {
    const t = mode.tutorial;
    if (!t || !t.guided || mode.modal) return;
    const cells = MM.Tutorial.targets(t, mode.map, mode.run);
    cells.forEach((cell) => {
      const s = mode.worldToScreen(cell.x * LAYOUT.TILE, cell.y * LAYOUT.TILE);
      const pulse = 2 + Math.round((0.5 + 0.5 * Math.sin(mode.time * 4)) * 2);
      ctx.save();
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = pulse;
      ctx.strokeRect(Math.round(s.x) + 3, Math.round(s.y) + 3,
        LAYOUT.TILE - 6, LAYOUT.TILE - 6);
      ctx.fillStyle = '#ffe27a';
      ctx.fillRect(Math.round(s.x + LAYOUT.TILE / 2 - 2), Math.round(s.y - 10), 4, 7);
      ctx.fillRect(Math.round(s.x + LAYOUT.TILE / 2 - 5), Math.round(s.y - 7), 10, 3);
      ctx.restore();
    });

    const guideY = Math.max(LAYOUT.MAP_TOP + 12, LAYOUT.MAP_BOTTOM - 62);
    MM.U.fillRound(ctx, 16, guideY, LAYOUT.W - 32, 40, 7, 'rgba(13,18,30,0.96)');
    MM.U.strokeRound(ctx, 16, guideY, LAYOUT.W - 32, 40, 7, 'rgba(255,215,94,0.58)', 1.5);
    const tip = MM.Tutorial.guideText(t, mode.map, mode.run);
    MM.U.text(ctx, tip, 32, guideY + 20, MM.U.fitSize(ctx, tip, 496, 15, true), '#ffe9a8', 'left', true);
    if (t.step === 'tool') {
      ['bomb', 'powerPick', 'lamp'].forEach((id) => {
        const rect = mode.hit[id];
        if (!rect || !mode.run.tools[id]) return;
        ctx.save();
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = '#ffe27a';
        ctx.lineWidth = 3;
        ctx.strokeRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6);
        ctx.restore();
      });
    }
    mode.hit.tutorialSkipGuide = { x: 546, y: guideY - 4, w: 158, h: 48 };
    button(ctx, mode.hit.tutorialSkipGuide, '跳过引导', { color: '#3a3f52', small: true, border: '#8293ac' });
  };


  /* Landscape uses the same input actions, with readable CSS-sized labels beside the mine. */
  UI.drawLandscapeHUD = function(ctx, mode, width, height, hit) {
    const run=mode.run, gap=8, inner=width-16, depth=(mode.map.spec||{}).DEPTH_LABEL||mode.map.h-1;
    const label=(text,x,y,size=13,color='#e7edf5',align='left')=>{ctx.font='bold '+size+'px "Microsoft YaHei",sans-serif';ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(text,x,y);};
    const block=(x,y,w,h,color='#213446')=>{MM.U.fillRound(ctx,x,y,w,h,7,color);MM.U.strokeRound(ctx,x,y,w,h,7,'#617b90',1);};
    const action=(key,text,x,y,w,h,sub)=>{const disabled=['bomb','powerPick','lamp'].includes(key)&&(!(run.tools[key]>0)||run.state!==MM.State.S.EXPLORING);block(x,y,w,h,disabled?'#29313c':mode.armedTool===key?'#496442':'#274254');label(text,x+w/2,y+h/2-(sub?7:0),13,'#f2f5ee','center');if(sub)label(sub,x+w/2,y+h/2+11,12,'#c5d9df','center');hit.push({x,y,w,h,target:key});};
    ctx.fillStyle='#112231';ctx.fillRect(0,0,width,height);ctx.fillStyle='#7492a4';ctx.fillRect(width-2,0,2,height);
    label('再挖一层',10,22,17);
    action('sound',MM.Audio.enabled?'♪':'静音',width-76,5,32,34);action('settings','设置',width-40,5,32,34);
    const statW=(inner-12)/3;
    [['深度',run.currentDepth+'/'+depth],['体力',run.stamina+'/'+run.maxStamina],['价值',run.baseValue]].forEach((v,i)=>{const x=8+i*(statW+6);block(x,46,statW,48);label(v[0],x+statW/2,59,12,'#d2e0e5','center');label(String(v[1]),x+statW/2,81,16,'#fff1bc','center');});
    const mats=run.materials||{};[['铜',mats.copper||0],['银',mats.silver||0],['金',mats.gold||0],['晶',mats.crystal||0]].forEach((v,i)=>label(v[0]+' '+v[1],8+i*inner/4,110,13));
    const upgrades=mode.hit.upgradeSlots||[];
    label(hudShort(ctx,(run.treasureReached?'已抵达 ':'目标 ')+depth+'m 藏宝库',inner-(upgrades.length?70:0),14),10,134,14,'#ffe4a8');
    upgrades.forEach((slot,i)=>{const x=width-72+i*32;block(x,121,28,28);MM.Assets.drawUpgradeIcon(ctx,slot.upgradeId,x+3,124,22);hit.push({x,y:121,w:28,h:28,source:slot});});
    const st=MM.Progress.status(run);label(hudShort(ctx,st.tier?'补给 '+st.mineValue+'/'+st.tier.need+' · '+MM.Progress.rewardShort(st.tier):'补给已领完',inner,13),10,156,13,'#bde3bd');
    if(height>=360){label('本局发现',10,184,13,'#b7cad8');label(hudShort(ctx,MM.Progress.discoveriesText(run,2)||'沿矿道寻找房间与矿脉',inner,12),10,204,12,'#d3e1eb');}
    const toolsY=height-140,toolW=(inner-12)/3;
    [['bomb','炸药'],['powerPick','强化镐'],['lamp','探矿灯']].forEach((item,i)=>action(item[0],item[1],8+i*(toolW+6),toolsY,toolW,44,'× '+(run.tools[item[0]]||0)));
    action('main',MM.Move.atEntrance(run,mode.map)?'已在入口':'返回入口',8,height-88,(inner-6)/2,44,'免费移动');
    action('end',mode.endConfirmT>0?'确认结束':'结束探索',14+(inner-6)/2,height-88,(inner-6)/2,44,'当前价值结算');
    const latest=(mode.messages||[]).filter(m=>m.left>0).slice(-1)[0];
    let hint=latest?latest.text:mode.armedTool==='bomb'?'点击岩块爆破；再点炸药取消':'点击岩块挖掘 · 已挖道路免费走';
    if(run.relicTarget){const relic=(MM.RELICS||[]).find(r=>r.id===run.relicTarget);if(relic)hint='遗物目标：'+relic.name;}
    else if(run.style&&MM.Style){const prog=MM.Style.progress(run,mode.map);if(prog)hint=run.style.name+'：'+(run.style.done?'已完成':prog.text);}
    let lines=[''];ctx.font='bold 12px "Microsoft YaHei",sans-serif';for(const char of hint){const last=lines.length-1;if(ctx.measureText(lines[last]+char).width>inner){if(lines.length===2){lines[last]=lines[last].slice(0,-1)+'…';break;}lines.push(char);}else lines[last]+=char;}
    lines.forEach((line,i)=>label(line,10,height-29+i*15,12,'#d3e1eb'));
  };

  ['drawSettings','drawTutorial','drawSettlement','drawSupplyModal','drawWorkbenchModal','drawWarehouseChoiceModal','drawSpringChoiceModal','drawGateChoiceModal','drawTreasureChoiceModal','drawUpgradeInfoModal','drawCartModal'].forEach(name=>{
    const paint=UI[name];UI[name]=function(...args){UI.overlayBounds=null;UI.recordOverlay=true;try{return paint.apply(UI,args);}finally{UI.recordOverlay=false;}};
  });
  MM.UI = UI;
})();
