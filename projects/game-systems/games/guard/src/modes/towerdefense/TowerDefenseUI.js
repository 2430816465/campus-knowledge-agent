/* 守塔战线界面层：全部用 Canvas 绘制（§31 / §43，与主项目"画布为主"的渲染一致）。
 *
 * 界面分区（竖屏 720×1280）：
 *   顶部：模式名 + 地图名 + 波次
 *   状态：❤ 终点生命 / 🪙 金币 / 💎 通用货币
 *   中部：塔防地图（道路 / 怪物 / 12 部署位 / 英雄 / 特效 / 伤害数字）
 *   下部：4 备战位 → [招募][广告召唤] → 英雄信息面板（出售 / 最终进化）
 *   覆盖层：整备倒计时 / 防守成功 / Boss 结算 / 失败 / 退出确认
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});
  const S = TD.RunState;

  const UI = {
    /* 本帧动态按钮的命中区（输入层用） */
    hit: { skip: null, panel: [], overlayBtns: [], mainClearCard: null },
    time: 0,   // 由 Mode 每帧写入（供像素小人/怪物做待机动画）

    toast(run, text, color) {
      run.toast = { text: text, color: color || '#f2f6ff', ttl: 1.8 };
    },

    /* 通用按钮 */
    _grads: {},
    buttonGrad(ctx, base, rect) {
      const key = base + '|' + Math.round(rect.h);
      if (!this._grads[key]) {
        const g = ctx.createLinearGradient(0, 0, 0, rect.h);
        g.addColorStop(0, TD.U.shade(base, 0.20));
        g.addColorStop(1, TD.U.shade(base, -0.22));
        this._grads[key] = g;
      }
      return this._grads[key];
    },

    button(ctx, rect, label, opt) {
      const o = opt || {};
      const disabled = !!o.disabled;
      const base = disabled ? '#242b3c' : (o.color || '#2f4a78');
      if (TD.Art) TD.Art.buttonFrame(ctx, rect, base, disabled);
      else {
        const g = this.buttonGrad(ctx, base, rect);
        TD.U.fillRound(ctx, rect.x, rect.y, rect.w, rect.h, 12, g);
        TD.U.strokeRound(ctx, rect.x, rect.y, rect.w, rect.h, 12, 'rgba(255,255,255,0.22)', 1.5);
      }

      const lines = String(label).split('\n');
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      if (lines.length === 1) {
        const size = o.small ? 19 : 24;
        TD.U.text(ctx, TD.U.fitText(ctx, lines[0], rect.w - 16, size, true),
          cx, cy, size, disabled ? '#6b7890' : '#f4f8ff', 'center', true);
      } else {
        for (let i = 0; i < lines.length; i++) {
          const size = i === 0 ? 24 : 16;
          const color = disabled ? '#6b7890' : (i === 0 ? '#f4f8ff' : '#b9c9e4');
          TD.U.text(ctx, TD.U.fitText(ctx, lines[i], rect.w - 16, size, i === 0),
            cx, cy + (i - (lines.length - 1) / 2) * 26, size, color, 'center', i === 0);
        }
      }
    },

    draw(ctx, run, mode) {
      const L = TD.LAYOUT;
      if (TD.Art) TD.Art.backdrop(ctx, 'battle');
      else { ctx.fillStyle = '#0f1420'; ctx.fillRect(0, 0, L.W, L.H); }

      this.drawTop(ctx, run, mode);
      this.drawChips(ctx, run);
      this.drawMap(ctx, run, mode);
      this.drawBench(ctx, run);
      this.drawActions(ctx, run, mode);
      this.drawBanners(ctx, run);
      this.drawBossIntro(ctx, run);
      this.drawPanel(ctx, run);
      this.drawHint(ctx, run);
      this.drawToast(ctx, run);

      // 拖拽中的英雄跟随指针
      if (mode && mode.drag && mode.drag.active) {
        const hero = TD.Heroes.at(run, mode.drag.zone, mode.drag.index);
        if (hero) this.heroBlock(ctx, mode.drag.x, mode.drag.y, hero, false, 0.85);
      }

      this.drawOverlays(ctx, run, mode);
    },

    /* ── 顶部 ─────────────────────────────────────────── */
    drawTop(ctx, run, mode) {
      const L = TD.LAYOUT;
      if (TD.Art) TD.Art.panel(ctx, { x: 0, y: 0, w: L.W, h: 96 }, '#c9964c');
      else {
        ctx.fillStyle = 'rgba(7,14,24,0.93)'; ctx.fillRect(0, 0, L.W, 96);
        ctx.fillStyle = 'rgba(117,145,174,0.70)'; ctx.fillRect(0, 94, L.W, 2);
      }

      this.button(ctx, L.topBack, '←', { color: '#2a3550' });
      this.button(ctx, L.topSpeed, '×' + ((TD.Game && TD.Game.speed) || 1), { color: '#2a3550' });
      this.button(ctx, L.topMute, '音', { color: '#2a3550', small: true });
      if (TD.Sfx.isMuted()) {
        ctx.save(); ctx.strokeStyle = '#dca552'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(L.topMute.x + 16, L.topMute.y + 40); ctx.lineTo(L.topMute.x + 40, L.topMute.y + 16); ctx.stroke(); ctx.restore();
      }
      this.button(ctx, L.topPause, mode && mode.paused ? '▶' : 'Ⅱ', {
        color: mode && mode.paused ? '#3f6fd8' : '#2a3550',
      });
      if (TD.BALANCE.DEV_MODE) {
        this.button(ctx, L.topDebug, '', { color: mode && mode.debugOpen ? '#3f6fd8' : '#2a3550' });
        if (!TD.Art || !TD.Art.icon(ctx, 'settings', L.topDebug.x + L.topDebug.w / 2, L.topDebug.y + L.topDebug.h / 2, 23)) {
          TD.U.text(ctx, '设', L.topDebug.x + L.topDebug.w / 2, L.topDebug.y + L.topDebug.h / 2, 18, '#f4f8ff', 'center', true);
        }
      }

      const title = TD.MODE_NAME + ' · ' + run.map.name;
      TD.U.text(ctx, TD.U.fitText(ctx, title, 372, 26, true), 84, 32, 26, '#f2f6ff', 'left', true);

      let waveText = '第 ' + run.wave + ' 波 / ' + run.totalNormalWaves;
      if (run.state === S.BOSS_PREPARE) waveText = 'Boss 挑战准备中';
      if (run.state === S.BOSS_RUNNING) waveText = 'Boss 挑战波';
      if (run.state === S.MAIN_CLEAR) waveText = '第 ' + run.totalNormalWaves + ' 波已清空';
      if (run.state === S.RESULT) waveText = '结算';
      if (run.state === S.FAILED) waveText = '坚持至第 ' + run.wave + ' 波';
      let stateText = waveText;
      if (mode && mode.paused) stateText = '已暂停 · 阵容仍可调整';
      else if (run.state === S.PREPARE || run.state === S.BOSS_PREPARE) {
        stateText = '整备中 ' + Math.max(0, run.prepareTimer).toFixed(1) + 's';
      } else if (run.state === S.WAVE_RUNNING || run.state === S.BOSS_RUNNING) {
        const remain = (run.spawnQueue.length - run.spawnIndex) + run.enemies.length;
        stateText = waveText + ' · 剩余敌人 ' + remain;
      }
      TD.U.text(ctx, TD.U.fitText(ctx, stateText, 372, 20, true), 84, 72, 20,
        mode && mode.paused ? '#9fd6ff' : '#ffd75e', 'left', true);
    },

    /* ── 状态条 ───────────────────────────────────────── */
    drawChips(ctx, run) {
      const L = TD.LAYOUT;
      const hpLow = run.endpointHP <= 6;
      const chips = [
        { r: L.chipHP, icon: 'heart', text: '终点 ' + Math.max(0, run.endpointHP) + '/' + run.endpointHPMax,
          color: hpLow ? '#ff9690' : '#f0e2d2', accent: hpLow ? '#c36c60' : '#7898bd' },
        { r: L.chipGold, icon: 'coin', text: '金币 ' + run.gold, color: '#f1d08a', accent: '#c9964c' },
        { r: L.chipCurrency, icon: 'currency', text: '通用货币 ' + TD.Save.currency(), color: '#b8d9ee', accent: '#7898bd' },
      ];
      for (let i = 0; i < chips.length; i++) {
        const c = chips[i];
        if (TD.Art) TD.Art.panel(ctx, c.r, c.accent);
        else TD.U.fillRound(ctx, c.r.x, c.r.y, c.r.w, c.r.h, 10, '#1d2740');
        if (!TD.Art || !TD.Art.icon(ctx, c.icon, c.r.x + 24, c.r.y + c.r.h / 2, 28)) {
          TD.U.text(ctx, i === 0 ? '♥' : (i === 1 ? '●' : '◆'), c.r.x + 24, c.r.y + c.r.h / 2, 20, c.color, 'center', true);
        }
        TD.U.text(ctx, c.text, c.r.x + 44, c.r.y + c.r.h / 2, 18, c.color, 'left', true);
      }
    },

    /* ── 地图 ─────────────────────────────────────────── */
    /* 地图静态层缓存（§52 移动端优化：路径 / 底板 / 空槽只画一次） */
    _mapLayers: {},
    mapLayer(run) {
      const key = run.mapId + '|' + (TD.Meta && TD.Meta.hasFlag() ? 'flag' : '') + '|' + (TD.Assets ? TD.Assets.state.revision : 0);
      if (this._mapLayers[key]) return this._mapLayers[key];
      if (typeof document === 'undefined' || !document.createElement) return null;
      const cv = document.createElement('canvas');
      cv.width = TD.LAYOUT.W;
      cv.height = TD.LAYOUT.H;
      this.drawMapStatic(cv.getContext('2d'), run);
      this._mapLayers[key] = cv;
      return cv;
    },

    drawMapStatic(ctx, run) {
      const m = run.map;
      const B = m.bounds;
      if (TD.Art) {
        TD.Art.panel(ctx, { x: B.x - 8, y: B.y - 8, w: B.w + 16, h: B.h + 16 }, TD.Art.mapTheme(run.mapId).accent);
        TD.Art.drawMapField(ctx, B, run.mapId);
        TD.Art.drawRoad(ctx, m.path, run.mapId, 50);
      } else {
        TD.U.fillRound(ctx, B.x - 8, B.y - 8, B.w + 16, B.h + 16, 18, '#151c2b');
        TD.U.strokeRound(ctx, B.x - 8, B.y - 8, B.w + 16, B.h + 16, 18, '#2b3550', 2);
        ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        this.tracePath(ctx, m.path); ctx.strokeStyle = '#2a3346'; ctx.lineWidth = 54; ctx.stroke();
        this.tracePath(ctx, m.path); ctx.strokeStyle = '#3c4966'; ctx.lineWidth = 44; ctx.stroke();
        ctx.restore();
      }
      this.drawCastle(ctx, m.path[m.path.length - 1], run.mapId);
    },

    tracePath(ctx, pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    },

    drawMap(ctx, run, mode) {
      const m = run.map;
      const pts = m.path;
      const layer = this.mapLayer(run);
      if (layer) ctx.drawImage(layer, 0, 0);
      else this.drawMapStatic(ctx, run);

      this.drawStart(ctx, pts[0]);
      this.drawBaseHp(ctx, pts[pts.length - 1], run);
      this.drawCoverage(ctx, run);

      /* 拖拽中：空位=蓝色可放，能合成的目标=绿色高亮（§31 / §32 的操作反馈） */
      const drag = mode && mode.drag && mode.drag.active ? mode.drag : null;
      const dragHero = drag ? TD.Heroes.at(run, drag.zone, drag.index) : null;
      const half = TD.LAYOUT.slotSize / 2;
      for (let i = 0; i < m.combatSlots.length; i++) {
        const s = m.combatSlots[i];
        let edge = '#33405c';
        let width = 1.5;
        if (dragHero && !(drag.zone === 'combat' && drag.index === i)) {
          const occupant = run.combat[i];
          if (!occupant) { edge = 'rgba(110,180,255,0.9)'; width = 2.5; }
          else if (TD.Merge.check(dragHero, occupant).ok) { edge = 'rgba(120,240,150,0.95)'; width = 3; }
        }
        if (TD.Art) TD.Art.slot(ctx, { x: s.x - half, y: s.y - half, w: TD.LAYOUT.slotSize, h: TD.LAYOUT.slotSize },
          edge === '#33405c' ? '#63778e' : (edge.indexOf('110,180') >= 0 ? '#7898bd' : '#82aa83'));
        else {
          TD.U.fillRound(ctx, s.x - half, s.y - half, TD.LAYOUT.slotSize, TD.LAYOUT.slotSize, 12, 'rgba(255,255,255,0.035)');
          TD.U.strokeRound(ctx, s.x - half, s.y - half, TD.LAYOUT.slotSize, TD.LAYOUT.slotSize, 12, edge, width);
        }
      }

      this.drawEnemies(ctx, run);

      for (let i = 0; i < run.combat.length; i++) {
        const hero = run.combat[i];
        if (!hero) continue;
        const s = m.combatSlots[i];
        const selected = run.selection && run.selection.zone === 'combat' && run.selection.index === i;
        this.heroBlock(ctx, s.x, s.y, hero, selected);
      }

      this.drawProjectiles(ctx, run);
      TD.Effects.draw(ctx, run);
    },

    drawCoverage(ctx, run) {
      const sel = run.selection;
      if (!sel || sel.zone !== 'combat') return;
      const hero = TD.Heroes.at(run, 'combat', sel.index);
      if (!hero) return;
      const pos = run.map.combatSlots[sel.index];
      const st = TD.Heroes.stats(hero);
      const coverage = TD.MapGeo.coverage(run.map, pos, st.range);
      ctx.save();
      ctx.strokeStyle = 'rgba(174,196,224,0.52)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, st.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(177,205,226,0.78)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (let i = 0; i < coverage.parts.length; i++) {
        const part = coverage.parts[i];
        ctx.beginPath();
        ctx.moveTo(part.a.x, part.a.y);
        ctx.lineTo(part.b.x, part.b.y);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawStart(ctx, p) {
      /* 传送门：呼吸的蓝色漩涡（怪物从这里出现） */
      const t = this.time || 0;
      const portalX = TD.Art && TD.Art.drawPortal(ctx, p, t);
      if (portalX) {
        TD.U.text(ctx, '入口', portalX, p.y + 34, 13, '#e6f6ff', 'center', true);
        return;
      }
      const pulse = Math.sin(t * 5) * 2;
      const centerX = Math.max(30, Math.min(690, p.x + 12));
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#2f5f8f';
      ctx.beginPath();
      ctx.arc(centerX, p.y, 26 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#8fd4ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, p.y, 16 + pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      TD.U.text(ctx, '入口', centerX, p.y + 34, 13, '#e6f6ff', 'center', true);
    },

    /* 终点城堡（静态部分，进缓存层） */
    drawCastle(ctx, p, mapId) {
      const x = p.x, y = p.y;
      const drewGate = TD.Art && TD.Art.drawGate(ctx, p, mapId);
      if (!drewGate) {
        TD.U.fillRound(ctx, x - 30, y - 18, 60, 46, 8, '#39495c');
        TD.U.strokeRound(ctx, x - 30, y - 18, 60, 46, 8, '#c9964c', 2.5);
        TD.U.fillRound(ctx, x - 34, y - 30, 16, 18, 4, '#40556c');
        TD.U.fillRound(ctx, x + 18, y - 30, 16, 18, 4, '#40556c');
        TD.U.fillRound(ctx, x - 10, y + 6, 20, 22, 4, '#17212e');
        TD.U.text(ctx, '终点', x, y - 4, 17, '#f3d49d', 'center', true);
      }
      /* 王城战旗：通用货币解锁的装饰（§34 只做外观） */
      if (TD.Meta && TD.Meta.hasFlag()) {
        ctx.save();
        ctx.strokeStyle = '#e6c86a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y - 34);
        ctx.lineTo(x, y - 74);
        ctx.stroke();
        TD.U.fillRound(ctx, x, y - 74, 36, 22, 3, '#c8a24a');
        TD.U.text(ctx, '守塔', x + 18, y - 63, 13, '#3a2410', 'center', true);
        ctx.restore();
      }
    },

    /* 终点血条（动态部分，每帧画） */
    drawBaseHp(ctx, p, run) {
      const x = p.x, y = p.y;
      /* 血条 */
      const ratio = TD.U.clamp(run.endpointHP / run.endpointHPMax, 0, 1);
      TD.U.fillRound(ctx, x - 31, y + 34, 62, 10, 3, '#090e16');
      TD.U.strokeRound(ctx, x - 31, y + 34, 62, 10, 3, '#8195a8', 1);
      TD.U.fillRound(ctx, x - 29, y + 36, 58 * ratio, 6, 2,
        ratio > 0.5 ? '#9ec27c' : (ratio > 0.22 ? '#d7a456' : '#c36c60'));
      TD.U.text(ctx, Math.max(0, run.endpointHP) + '/' + run.endpointHPMax, x, y - 46, 16,
        ratio <= 0.22 ? '#df8c7c' : '#f1d08a', 'center', true);
    },

    drawEnemies(ctx, run) {
      for (let i = 0; i < run.enemies.length; i++) {
        const e = run.enemies[i];
        if (e.dead || e.gone) continue;
        const s = e.size;

        /* 优先用主项目复用的怪物素材；没有素材时回退色块 */
        const conf = (TD.ASSET_MANIFEST.monsterSprites || {})[e.monsterId];
        const drewSprite = TD.Assets.drawMonster(ctx, e.monsterId, e.x, e.y - s * 0.15, s, {
          direction: e.direction,
          facing: e.facing || 1,
          fly: !!(conf && conf.fly),
          time: this.time || 0,
          walkPhase: e.walkPhase || 0,
          walkDist: e.walkDist || 0,
          motionWeight: e.motionWeight,
          hitT: e.hitT || 0,
          seed: (e.id % 10) * 0.7,
        });
        if (!drewSprite) {
          ctx.save();
          if (e.shape === 'square') {
            TD.U.fillRound(ctx, e.x - s / 2, e.y - s / 2, s, s, 8, e.color);
            TD.U.strokeRound(ctx, e.x - s / 2, e.y - s / 2, s, s, 8,
              e.isBoss ? '#ffd75e' : 'rgba(0,0,0,0.45)', e.isBoss ? 3 : 2);
          } else {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, s / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.stroke();
          }
          if (e.isBoss) TD.U.text(ctx, '👑', e.x, e.y, Math.round(s * 0.62), '#ffd75e', 'center', true);
          ctx.restore();
        }

        /* 减速状态：贴地的冷色像素符号，避免大面积光环与系统字体雪花。 */
        if (e.slowT > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(127,190,220,0.62)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(e.x, e.y + s * 0.20, s * 0.43, Math.max(3, s * 0.11), 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(153,218,239,0.82)';
          const pulse = (Math.floor((this.time || 0) * 8 + e.id) % 2) ? 1 : 0;
          ctx.fillRect(e.x - s * 0.42 - pulse, e.y + s * 0.12, 3, 3);
          ctx.fillRect(e.x + s * 0.34, e.y + s * 0.20 - pulse, 3, 3);
          ctx.restore();
        }

        const barW = e.isBoss ? Math.max(72, s) : Math.max(30, s);
        const ratio = TD.U.clamp(e.hp / e.maxHp, 0, 1);
        const bx = e.x - barW / 2;
        const by = TD.Enemies.headY(e) - 12;
        TD.U.fillRound(ctx, bx - 1, by - 1, barW + 2, 9, 2, '#090e16');
        TD.U.strokeRound(ctx, bx - 1, by - 1, barW + 2, 9, 2, 'rgba(196,210,222,0.68)', 1);
        TD.U.fillRound(ctx, bx + 1, by + 1, Math.max(0, (barW - 2) * ratio), 5, 1.5,
          ratio > 0.5 ? '#94b987' : (ratio > 0.22 ? '#d7a456' : '#c36c60'));

        if (e.isBoss) TD.U.text(ctx, e.name, e.x, by - 18, 20, '#f1d08a', 'center', true);
      }
    },

    drawProjectiles(ctx, run) {
      const list = run.projectiles || [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const target = TD.Enemies.byId(run, p.targetId);
        const angle = Math.atan2(target ? target.y - p.y : 0, target ? target.x - p.x : 1);
        const classId = p.hero && p.hero.classId;
        if (classId === 'archer' && TD.LayeredHeroRig && TD.LayeredHeroRig.ready('archer')) {
          const offset = p.visualOffset || { x: 0, y: 0 };
          const blend = Math.max(0, 1-p.travelled/p.visualDistance);
          const vx=p.x+offset.x*blend, vy=p.y+offset.y*blend;
          TD.LayeredHeroRig.drawArrow(ctx, vx, vy, target ? Math.atan2(target.y-vy,target.x-vx) : angle, 18);
          continue;
        }
        if (classId === 'archer') {
          ctx.save();
          ctx.translate(Math.round(p.x), Math.round(p.y));
          ctx.rotate(angle);
          ctx.fillStyle = '#d8c89f'; ctx.fillRect(-10, -1, 15, 2);
          ctx.fillStyle = '#e5e0d2';
          ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(3, -3); ctx.lineTo(4, 0); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#9a7047'; ctx.fillRect(-10, -3, 3, 2); ctx.fillRect(-10, 1, 3, 2);
          ctx.restore();
        } else {
          ctx.save();
          ctx.translate(Math.round(p.x), Math.round(p.y));
          ctx.rotate(angle);
          ctx.fillStyle = 'rgba(9,14,23,0.8)'; ctx.fillRect(-7, -7, 14, 14);
          if (!TD.Art || !TD.Art.icon(ctx, 'rune', 0, 0, 14)) {
            ctx.fillStyle = '#8f83cb'; ctx.fillRect(-4, -4, 8, 8);
          }
          ctx.fillStyle = 'rgba(178,163,220,0.7)'; ctx.fillRect(-13, -1, 6, 2);
          ctx.restore();
        }
      }
    },

    /* 英雄方块：颜色 + 职业字 + 星级 / 最终标记 */
    heroBlock(ctx, cx, cy, hero, selected, alpha) {
      const st = TD.Heroes.stats(hero);
      const size = TD.LAYOUT.heroSize;
      ctx.save();
      if (alpha != null) ctx.globalAlpha = alpha;

      /* 底座：职业/形态配色的石台，保证同职业一眼可辨 */
      const plate = TD.U.shade(st.color, -0.25);
      TD.U.fillRound(ctx, cx - size / 2 - 2, cy - size / 2 + 8, size + 4, size - 4, 10, 'rgba(9,12,20,0.55)');
      TD.U.fillRound(ctx, cx - size / 2 + 4, cy + size / 2 - 12, size - 8, 10, 5, plate);
      TD.U.strokeRound(ctx, cx - size / 2 - 2, cy - size / 2 + 8, size + 4, size - 4, 10,
        st.isFinal ? '#ffe58a' : 'rgba(255,255,255,0.20)', st.isFinal ? 2.5 : 1);

      /* 像素小人（脚底贴着底座） */
      TD.HeroSprites.draw(ctx, hero, cx, cy + size / 2 - 6, {
        facing: hero.visualFacing || 1,
        animT: hero.animT,
        time: this.time || 0,
        alpha: alpha,
        scale: 0.88,
      });

      if (st.isFinal) TD.U.text(ctx, '最终', cx, cy - size / 2 - 13, 15, '#ffe58a', 'center', true);
      else TD.U.text(ctx, TD.U.stars(hero.star), cx, cy - size / 2 - 12, 16, '#ffd75e', 'center', true);

      if (selected) {
        TD.U.strokeRound(ctx, cx - size / 2 - 6, cy - size / 2 - 6, size + 12, size + 12, 14, '#ffffff', 2.5);
      }
      ctx.restore();
    },

    /* ── 备战区 ───────────────────────────────────────── */
    drawBench(ctx, run) {
      const L = TD.LAYOUT;
      TD.U.text(ctx, '备战区（不攻击 · 可合成 / 出售 / 拖到战斗区）', 360, L.benchLabelY, 19, '#8fa3c4', 'center');

      const half = L.benchSlotSize / 2;
      for (let i = 0; i < L.bench.length; i++) {
        const s = L.bench[i];
        if (TD.Art) TD.Art.slot(ctx, { x: s.x - half, y: s.y - half, w: L.benchSlotSize, h: L.benchSlotSize });
        else {
          TD.U.fillRound(ctx, s.x - half, s.y - half, L.benchSlotSize, L.benchSlotSize, 14, 'rgba(255,255,255,0.035)');
          TD.U.strokeRound(ctx, s.x - half, s.y - half, L.benchSlotSize, L.benchSlotSize, 14, '#33405c', 1.5);
        }
        const hero = run.bench[i];
        if (hero) {
          const selected = run.selection && run.selection.zone === 'bench' && run.selection.index === i;
          this.heroBlock(ctx, s.x, s.y, hero, selected);
        }
      }
    },

    /* ── 操作按钮 ─────────────────────────────────────── */
    drawActions(ctx, run, mode) {
      const L = TD.LAYOUT;
      const full = TD.Heroes.capacityFull(run);

      const canRecruit = !full && run.gold >= TD.BALANCE.RECRUIT_COST;
      this.button(ctx, L.recruitBtn,
        '招募英雄\n' + TD.BALANCE.RECRUIT_COST + ' 金币' + (full ? '（位子已满）' : ''),
        { disabled: !canRecruit, color: '#2f5fae' });

      const left = TD.BALANCE.AD_SUMMON_LIMIT - run.adSummonUsed;
      const canAd = left > 0 && !full && !(mode && mode.adLoading);
      this.button(ctx, L.adBtn,
        (mode && mode.adLoading)
          ? '广告加载中…\n请稍候'
          : '广告召唤 ' + run.adSummonUsed + '/' + TD.BALANCE.AD_SUMMON_LIMIT + '\n'
            + (TD.Ads.isReal() ? '看广告获得随机英雄' : '测试直通：点击直接获得'),
        { disabled: !canAd, color: '#2f4a78' });
    },

    /* ── 整备横幅 ─────────────────────────────────────── */
    /* Boss 登场演出（§51）：红幕下拉 + 大字 + 名字 */
    drawBossIntro(ctx, run) {
      if (!run.bossIntro || run.bossIntro <= 0) return;
      const total = 2.2;
      const t = run.bossIntro;
      const inK = TD.U.clamp((total - t) / 0.28, 0, 1);
      const outK = TD.U.clamp(t / 0.45, 0, 1);
      const a = Math.min(inK, outK);
      const h = 150 * inK;
      ctx.save();
      ctx.globalAlpha = a;
      const banner = { x: 24, y: 330 + (150 - h) / 2, w: 672, h: h };
      if (TD.Art) TD.Art.panel(ctx, banner, '#c36c60');
      else {
        ctx.fillStyle = 'rgba(52,25,29,0.94)'; ctx.fillRect(banner.x, banner.y, banner.w, banner.h);
        ctx.strokeStyle = '#c36c60'; ctx.lineWidth = 2; ctx.strokeRect(banner.x, banner.y, banner.w, banner.h);
      }
      ctx.restore();
      if (inK > 0.6) {
        ctx.save();
        ctx.globalAlpha = a;
        TD.U.text(ctx, '魔塔守卫  登场！', 360, 372, 46, '#f1d08a', 'center', true);
        TD.U.text(ctx, '第 21 波 · Boss 挑战', 360, 422, 22, '#d8b28d', 'center');
        ctx.restore();
      }
    },

    drawBanners(ctx, run) {
      const b = TD.LAYOUT.prepareBanner;
      this.hit.skip = null;

      if (run.state === S.PREPARE || run.state === S.BOSS_PREPARE) {
        const isBoss = run.state === S.BOSS_PREPARE;
        const preview = TD.Waves.preview(run.mapId, isBoss ? 'boss' : run.wave);
        if (TD.Art) TD.Art.panel(ctx, b, isBoss ? '#c36c60' : '#7898bd');
        else { TD.U.fillRound(ctx, b.x, b.y, b.w, b.h, 12, 'rgba(20,26,40,0.92)'); TD.U.strokeRound(ctx, b.x, b.y, b.w, b.h, 12, '#3a4a6e', 2); }
        const title = (preview && preview.title) || (isBoss ? 'Boss 挑战' : '第 ' + run.wave + ' 波');
        const headline = title + ' · ' + Math.max(0, run.prepareTimer).toFixed(1) + 's 后开始';
        const roster = preview ? preview.byType.map(function (e) {
          const hp = e.minHp === e.maxHp ? String(e.minHp) : e.minHp + '–' + e.maxHp;
          return e.name + '×' + e.count + '（HP' + hp + ' · 速' + e.maxSpeed + '）';
        }).join('  ') : '波次数据不可用';
        const tags = preview && preview.tags.length ? '  [' + preview.tags.join('、') + ']' : '';
        const threat = TD.U.fitText(ctx, roster + tags, b.w - 20, 14, false);
        TD.U.text(ctx, TD.U.fitText(ctx, headline, b.w - 20, 18, true),
          b.x + b.w / 2, b.y + 20, 18, '#e8eef8', 'center', true);
        TD.U.text(ctx, threat, b.x + b.w / 2, b.y + 45, 14, '#c8d6ee', 'center');
        TD.U.text(ctx, TD.BALANCE.ALLOW_SKIP_PREPARE ? '点击这里提前开始 ▶' : '',
          b.x + b.w / 2, b.y + 68, 14, '#8fb8dd', 'center');
        if (TD.BALANCE.ALLOW_SKIP_PREPARE) this.hit.skip = b;
        return;
      }

      if (run.state === S.WAVE_CLEAR) {
        if (TD.Art) TD.Art.panel(ctx, b, '#82aa83');
        else { TD.U.fillRound(ctx, b.x, b.y, b.w, b.h, 12, 'rgba(28,48,34,0.92)'); TD.U.strokeRound(ctx, b.x, b.y, b.w, b.h, 12, '#4f7a5a', 2); }
        TD.U.text(ctx, '第 ' + run.wave + ' 波清空！', b.x + b.w / 2, b.y + b.h / 2, 22, '#9fe8a8', 'center', true);
      }
    },

    /* ── 英雄信息面板（§31 / §58-⑫） ─────────────────── */
    drawPanel(ctx, run) {
      this.hit.panel = [];
      if (!run.selection) return;

      const sel = run.selection;
      const hero = TD.Heroes.at(run, sel.zone, sel.index);
      if (!hero) { run.selection = null; return; }

      const P = TD.LAYOUT.panel;
      const st = TD.Heroes.stats(hero);
      const def = TD.HERO_BY_ID[hero.classId];

      if (TD.Art) TD.Art.panel(ctx, P, '#7898bd');
      else { TD.U.fillRound(ctx, P.x, P.y, P.w, P.h, 16, 'rgba(18,24,38,0.97)'); TD.U.strokeRound(ctx, P.x, P.y, P.w, P.h, 16, '#3a4a6e', 2); }

      this.heroBlock(ctx, P.x + 58, P.y + 58, hero, false);

      TD.U.text(ctx, st.name, P.x + 108, P.y + 34, 24, '#ffffff', 'left', true);
      TD.U.text(ctx,
        '攻击 ' + TD.U.fmt(st.atk) + '　攻速 ' + (1 / st.interval).toFixed(2) + ' 次/秒　范围 ' + Math.round(st.range),
        P.x + 108, P.y + 64, 19, '#c8d6ee');
      TD.U.text(ctx, def.desc, P.x + 108, P.y + 90, 17, '#8fa3c4');
      const coverageText = sel.zone === 'combat'
        ? '覆盖道路 ' + Math.round(TD.MapGeo.coverage(run.map, run.map.combatSlots[sel.index], st.range).length) + ' px'
        : '备战位英雄不参与攻击';
      TD.U.text(ctx, coverageText, P.x + 108, P.y + 114, 16, '#aebfda');

      if (TD.Evolve.canEvolve(hero)) {
        TD.U.text(ctx, '可选择最终进化（二选一）：', P.x + 24, P.y + 132, 19, '#ffd75e', 'left', true);
      } else if (hero.evolved) {
        TD.U.text(ctx, '最终形态：不能继续合成、不能再次进化', P.x + 24, P.y + 132, 17, '#9fb4d8');
      }

      const rowY = P.y + 158;
      const refund = TD.ECONOMY.sellRefund(hero);
      const sellRect = { x: P.x + 24, y: rowY, w: 166, h: 60 };
      this.button(ctx, sellRect, '出售 +' + refund + ' 金币', { color: '#7a3b3b', small: true });
      this.hit.panel.push({ id: 'sell', rect: sellRect });

      const closeRect = { x: P.x + P.w - 62, y: P.y + 12, w: 46, h: 46 };
      this.button(ctx, closeRect, '✕', { color: '#2a3550' });
      this.hit.panel.push({ id: 'close', rect: closeRect });

      if (TD.Evolve.canEvolve(hero)) {
        const opts = TD.Evolve.options(hero);
        const w = 216;
        for (let i = 0; i < opts.length; i++) {
          const r = { x: P.x + 208 + i * (w + 18), y: rowY, w: w, h: 60 };
          this.button(ctx, r, opts[i].name + '\n' + opts[i].desc, { color: opts[i].color, small: true });
          this.hit.panel.push({ id: 'evo:' + opts[i].id, rect: r });
        }
      }

      TD.U.text(ctx, '本局累计伤害 ' + Math.round(hero.totalDamage || 0), P.x + P.w - 24, P.y + 132, 17, '#8fa3c4', 'right');
    },

    /* ── 提示 & 飘窗 ──────────────────────────────────── */
    drawHint(ctx, run) {
      if (run.selection) return;
      TD.U.text(ctx, '点击英雄看属性 · 拖拽到相同职业相同星级上合成 · 拖到空位换位',
        360, TD.LAYOUT.hintY, 17, '#5d6b86', 'center');
    },

    drawToast(ctx, run) {
      if (!run.toast) return;
      const b = TD.LAYOUT.toast;
      ctx.save();
      ctx.globalAlpha = Math.min(1, run.toast.ttl / 0.4);
      if (TD.Art) TD.Art.panel(ctx, b, '#c9964c');
      else { TD.U.fillRound(ctx, b.x, b.y, b.w, b.h, 12, 'rgba(10,14,22,0.92)'); TD.U.strokeRound(ctx, b.x, b.y, b.w, b.h, 12, '#3a4a6e', 1.5); }
      TD.U.text(ctx, run.toast.text, b.x + b.w / 2, b.y + b.h / 2, 19, run.toast.color, 'center', true);
      ctx.restore();
    },

    /* ── 覆盖层：退出确认 / 防守成功 / 结算 ───────────── */
    drawOverlays(ctx, run, mode) {
      this.hit.overlayBtns = [];
      this.hit.mainClearCard = null;

      if (mode && mode.exitConfirm) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, 720, 1280);
        const c = { x: 110, y: 440, w: 500, h: 280 };
        if (TD.Art) TD.Art.panel(ctx, c, '#c36c60');
        else { TD.U.fillRound(ctx, c.x, c.y, c.w, c.h, 18, '#141b2b'); TD.U.strokeRound(ctx, c.x, c.y, c.w, c.h, 18, '#3a4a6e', 2); }
        TD.U.text(ctx, '退出本局？', c.x + c.w / 2, c.y + 64, 30, '#ffffff', 'center', true);
        TD.U.text(ctx, '本局进度将丢失，是否退出？', c.x + c.w / 2, c.y + 116, 20, '#c8d6ee', 'center');
        const resume = { x: c.x + 40, y: c.y + 178, w: 190, h: 64 };
        const exit = { x: c.x + c.w - 230, y: c.y + 178, w: 190, h: 64 };
        this.button(ctx, resume, '继续游戏', { color: '#2f5fae' });
        this.button(ctx, exit, '退出', { color: '#7a3b3b' });
        this.hit.overlayBtns.push({ id: 'resume', rect: resume }, { id: 'exit', rect: exit });
        return;
      }

      if (run.state === S.MAIN_CLEAR) {
        const c = { x: 90, y: 240, w: 540, h: 330 };
        this.hit.mainClearCard = c;
        if (TD.Art) TD.Art.panel(ctx, c, '#82aa83');
        else { TD.U.fillRound(ctx, c.x, c.y, c.w, c.h, 18, 'rgba(16,22,34,0.96)'); TD.U.strokeRound(ctx, c.x, c.y, c.w, c.h, 18, '#4f7a5a', 2.5); }
        TD.U.text(ctx, '防守成功！', c.x + c.w / 2, c.y + 60, 40, '#9fe8a8', 'center', true);
        TD.U.text(ctx, TD.U.stars(run.mainStars || TD.Rewards.starsFor(run.endpointHP, run.endpointHPMax)),
          c.x + c.w / 2, c.y + 124, 40, '#ffd75e', 'center', true);
        TD.U.text(ctx, '终点生命 ' + run.endpointHP + ' / ' + run.endpointHPMax + '（记录已保存）',
          c.x + c.w / 2, c.y + 174, 20, '#c8d6ee', 'center');
        TD.U.text(ctx, '额外 Boss 挑战将在 ' + Math.max(0, run.mainClearTimer).toFixed(0) + ' 秒后开始',
          c.x + c.w / 2, c.y + 212, 19, '#9fb4d8', 'center');
        const btn = { x: c.x + c.w / 2 - 130, y: c.y + 246, w: 260, h: 58 };
        this.button(ctx, btn, '立即开始 Boss 挑战', { color: '#2f4a78' });
        this.hit.overlayBtns.push({ id: 'bossNow', rect: btn });
        return;
      }

      if (run.state === S.RESULT || run.state === S.FAILED) {
        const r = run.result || {};
        const failed = run.state === S.FAILED;
        ctx.fillStyle = 'rgba(4,6,10,0.72)';
        ctx.fillRect(0, 0, 720, 1280);

        const c = { x: 60, y: 300, w: 600, h: 600 };
        if (TD.Art) TD.Art.panel(ctx, c, failed ? '#c36c60' : '#82aa83');
        else { TD.U.fillRound(ctx, c.x, c.y, c.w, c.h, 20, '#141b2b'); TD.U.strokeRound(ctx, c.x, c.y, c.w, c.h, 20, failed ? '#7a3b3b' : '#4f7a5a', 2.5); }

        if (failed) {
          TD.U.text(ctx, '防线失守', c.x + c.w / 2, c.y + 80, 44, '#ff8d8d', 'center', true);
          TD.U.text(ctx, '坚持至：第 ' + (r.reachedWave || run.wave) + ' 波', c.x + c.w / 2, c.y + 184, 26, '#e8eef8', 'center');
          TD.U.text(ctx, '击杀：' + (r.kills || 0), c.x + c.w / 2, c.y + 234, 24, '#c8d6ee', 'center');
          TD.U.text(ctx, '最高英雄：' + (r.bestHero || '—'), c.x + c.w / 2, c.y + 280, 24, '#c8d6ee', 'center');
          TD.U.text(ctx, '本次不发放 Boss 奖励', c.x + c.w / 2, c.y + 336, 19, '#8fa3c4', 'center');
        } else {
          TD.U.text(ctx, '防守成功', c.x + c.w / 2, c.y + 66, 40, '#9fe8a8', 'center', true);
          TD.U.text(ctx, TD.U.stars(r.stars || 0), c.x + c.w / 2, c.y + 126, 38, '#ffd75e', 'center', true);
          TD.U.text(ctx, '终点生命 ' + (r.endpointHP || 0) + ' / ' + (r.endpointHPMax || 20),
            c.x + c.w / 2, c.y + 170, 21, '#c8d6ee', 'center');

          if (run.bossChallenge === TD.BossChallenge.SUCCESS) {
            TD.U.text(ctx, 'Boss 挑战成功！', c.x + c.w / 2, c.y + 240, 30, '#ffd75e', 'center', true);
            TD.U.text(ctx, '通用货币 +' + (r.currencyGained || 0) + (r.bossFirst ? '（首杀奖励）' : '（重复击杀）'),
              c.x + c.w / 2, c.y + 284, 21, '#9fd6ff', 'center');
            if (r.allBossBonus) {
              TD.U.text(ctx, '全图 Boss 首杀达成！额外 +' + r.allBossBonus + ' 通用货币',
                c.x + c.w / 2, c.y + 314, 19, '#ffd75e', 'center', true);
            }
          } else {
            TD.U.text(ctx, 'Boss 逃脱', c.x + c.w / 2, c.y + 240, 30, '#b9c9e4', 'center', true);
            TD.U.text(ctx, '本次额外奖励未获得（不影响防守胜利）', c.x + c.w / 2, c.y + 284, 20, '#8fa3c4', 'center');
          }

          const rec = TD.Save.mapRecord(run.mapId);
          TD.U.text(ctx,
            '地图记录：' + TD.U.stars(rec.bestStars) + '　最佳生命 ' + rec.bestEndpointHP
            + '　Boss首杀 ' + (rec.bossFirstClear ? '✓' : '—') + '　Boss击杀 ' + rec.bossKillCount,
            c.x + c.w / 2, c.y + 342, 19, '#8fa3c4', 'center');
        }

        const retry = { x: c.x + 40, y: c.y + 430, w: 168, h: 72 };
        const share = { x: c.x + 218, y: c.y + 430, w: 168, h: 72 };
        const back = { x: c.x + 396, y: c.y + 430, w: 168, h: 72 };
        this.button(ctx, retry, '重新挑战', { color: '#2f5fae', small: true });
        this.button(ctx, share, '分享战绩', { color: '#3a5f3f', small: true });
        this.button(ctx, back, '返回地图', { color: '#3a3f52', small: true });
        this.hit.overlayBtns.push({ id: 'retry', rect: retry }, { id: 'share', rect: share },
          { id: 'map', rect: back });
      }
    },
  };

  TD.UI = UI;
})();
