/* 守塔战线主模式（§39 / §48）：场景入口。
 *
 * 负责：
 *   - 持有本局 run 状态（TowerDefenseState）
 *   - 驱动 波次 / 怪物 / 英雄战斗 / 飞行物 / 特效（各 Manager）
 *   - 输入处理：拖拽合成换位、按钮、选人面板、结算界面、退出确认
 *   - 绘制：委托 TD.UI / TD.DebugPanel
 *
 * 与主魔塔模式零耦合：不读写主模式状态，不读写主模式存档。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});
  const S = TD.RunState;

  function Mode(mapId, opts) {
    this.mapId = mapId;
    this.opts = opts || {};
    this.run = null;
    this.drag = null;          // { zone, index, startX, startY, x, y, active }
    this.exitConfirm = false;
    this.paused = false;
    this.debugOpen = false;
    this.adLoading = false;
    this.shareOpen = false;
    this._shareCard = null;
    this.speedScaled = true;   // 正式 1×/2×；调试面板另提供 4×
  }

  Mode.prototype.enter = function () {
    if (TD.Game && TD.Game.setSpeed) TD.Game.setSpeed(1);
    this.run = TD.State.createRun(this.mapId, this.opts);
    this.drag = null;
    this.exitConfirm = false;
    this.paused = false;
    this.debugOpen = false;
    this.adLoading = false;
    this.shareOpen = false;
    this._shareCard = null;
  };

  Mode.prototype.restart = function () { this.enter(); };

  Mode.prototype.togglePause = function () {
    if (!this.run || TD.State.isOver(this.run)) return this.paused;
    this.paused = !this.paused;
    return this.paused;
  };

  /* ── 每帧更新 ─────────────────────────────────────── */
  Mode.prototype.update = function (dt) {
    const run = this.run;
    if (!run) return;
    const events = (TD.Input && TD.Input.consume) ? TD.Input.consume() : [];
    for (let i = 0; i < events.length; i++) this.handleEvent(events[i]);

    /* Modal confirmation and pause stop all simulation clocks. Input and drawing stay live. */
    if (this.exitConfirm || this.paused) return;

    run.time += dt;
    TD.UI.time = run.time;
    /* 屏幕反馈与演出计时（§51） */
    if (run.shake > 0) run.shake = Math.max(0, run.shake - dt * 1.7);
    if (run.flash && run.flash.ttl > 0) run.flash.ttl = Math.max(0, run.flash.ttl - dt);
    if (run.bossIntro > 0) run.bossIntro = Math.max(0, run.bossIntro - dt);

    if (run.toast) {
      run.toast.ttl -= dt;
      if (run.toast.ttl <= 0) run.toast = null;
    }

    /* 结算时新解锁的成就提示（运营向） */
    if (run.newAchievements && run.newAchievements.length && !run.achievementToasted) {
      run.achievementToasted = true;
      const names = run.newAchievements.map(function (a) { return a.name; }).join('、');
      let money = 0;
      run.newAchievements.forEach(function (a) { money += a.reward || 0; });
      TD.UI.toast(run, '成就解锁：' + names + '（通用货币 +' + money + '）', '#9fe8a8');
      TD.Sfx.evolve();
    }

    if (TD.State.isOver(run)) {
      TD.Effects.update(run, dt);
      return;
    }

    TD.Waves.update(run, dt);
    TD.Enemies.update(run, dt);
    TD.Heroes.updateCombat(run, dt);
    TD.Projectiles.update(run, dt);
    TD.Effects.update(run, dt);
    TD.Heroes.refreshBest(run);
    TD.Tutorial.update(run);
  };

  Mode.prototype.draw = function (ctx) {
    const run = this.run;
    if (!run) return;
    ctx.clearRect(0, 0, TD.LAYOUT.W, TD.LAYOUT.H);
    const shake = (!(TD.lowFx && TD.lowFx()) && run.shake > 0) ? run.shake : 0;
    if (shake > 0) {
      ctx.save();
      const s = shake * 9;
      ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
      TD.UI.draw(ctx, run, this);
      ctx.restore();
    } else {
      TD.UI.draw(ctx, run, this);
    }
    if (run.flash && run.flash.ttl > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(TD.lowFx && TD.lowFx() ? 0.22 : 0.45,
        (run.flash.ttl / (run.flash.ttl0 || 0.5)) * (TD.lowFx && TD.lowFx() ? 0.22 : 0.45));
      ctx.fillStyle = run.flash.color || '#ffffff';
      ctx.fillRect(0, 0, TD.LAYOUT.W, TD.LAYOUT.H);
      ctx.restore();
    }
    TD.Tutorial.draw(ctx, run);
    if (this.debugOpen) TD.DebugPanel.draw(ctx, run, this);
    if (this.shareOpen) this.drawShare(ctx, run);
  };

  /* 分享战绩弹层（运营向）：卡片预览 + 复制文本 / 保存图片 / 关闭 */
  Mode.prototype.drawShare = function (ctx, run) {
    this._shareBtns = [];
    ctx.fillStyle = 'rgba(4,6,10,0.8)';
    ctx.fillRect(0, 0, 720, 1280);
    const c = { x: 60, y: 190, w: 600, h: 720 };
    if (TD.Art) TD.Art.panel(ctx, c, '#82aa83');
    else { TD.U.fillRound(ctx, c.x, c.y, c.w, c.h, 18, '#141b2b'); TD.U.strokeRound(ctx, c.x, c.y, c.w, c.h, 18, '#4f7a5a', 2.5); }
    TD.U.text(ctx, '分享战绩', c.x + c.w / 2, c.y + 44, 28, '#ffffff', 'center', true);
    if (this._shareCard) {
      ctx.drawImage(this._shareCard, c.x + 90, c.y + 76, 420, 420);
    } else {
      TD.U.wrapText(ctx, TD.Share.text(run), c.x + 40, c.y + 120, c.w - 80, 30, 20, '#c8d6ee');
    }
    const self = this;
    const mk = function (id, label, x, w, color) {
      const r = { x: x, y: c.y + c.h - 132, w: w, h: 64 };
      TD.UI.button(ctx, r, label, { color: color, small: true });
      self._shareBtns.push({ id: id, rect: r });
    };
    mk('copy', '复制文本', c.x + 40, 150, '#2f5fae');
    mk('png', '保存图片', c.x + 202, 150, '#2f4a78');
    mk('close', '关闭', c.x + 364, 196, '#3a3f52');
    TD.U.text(ctx, '提示：浏览器支持时也可以长按 / 右键图片保存。',
      c.x + c.w / 2, c.y + c.h - 40, 15, '#6f7f9c', 'center');
  };

  Mode.prototype.handleShareClick = function (ev, run) {
    if (ev.type !== 'down') return;
    const btns = this._shareBtns || [];
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (!TD.U.pointInRect(ev.x, ev.y, b.rect)) continue;
      if (b.id === 'copy') {
        const ok = TD.Share.copyText(run);
        TD.UI.toast(run, ok ? '战绩文本已复制' : '浏览器不允许写剪贴板，可改用「保存图片」',
          ok ? '#9fe8a8' : '#ffb0b0');
      } else if (b.id === 'png') {
        const ok = TD.Share.download(run);
        TD.UI.toast(run, ok ? '战绩卡片已开始下载' : '当前环境不支持保存图片', ok ? '#9fe8a8' : '#ffb0b0');
      } else {
        this.shareOpen = false;
      }
      return;
    }
  };

  /* ── 输入 ─────────────────────────────────────────── */
  Mode.prototype.handleEvent = function (ev) {
    const run = this.run;
    if (!run) return;

    if (this.exitConfirm) { this.handleConfirm(ev, run); return; }
    if (this.shareOpen) { this.handleShareClick(ev, run); return; }
    if (TD.State.isOver(run)) { this.handleResultClick(ev, run); return; }
    if (TD.Tutorial.handleClick(ev)) return;
    if (this.debugOpen) { TD.DebugPanel.handleEvent(this, run, ev); return; }

    if (ev.type === 'down') {
      TD.Sfx.resume();   // 首次点击解锁浏览器音频
      // 顶部按钮
      if (TD.U.pointInRect(ev.x, ev.y, TD.LAYOUT.topBack)) { this.exitConfirm = true; this.drag = null; return; }
      if (TD.U.pointInRect(ev.x, ev.y, TD.LAYOUT.topSpeed)) {
        if (TD.Game) TD.Game.cyclePlaySpeed();
        return;
      }
      if (TD.U.pointInRect(ev.x, ev.y, TD.LAYOUT.topPause)) { this.togglePause(); return; }
      if (TD.U.pointInRect(ev.x, ev.y, TD.LAYOUT.topMute)) {
        const nowMuted = TD.Sfx.toggle();
        TD.Save.setMuted(nowMuted);
        return;
      }
      if (TD.BALANCE.DEV_MODE && TD.U.pointInRect(ev.x, ev.y, TD.LAYOUT.topDebug)) { this.debugOpen = true; return; }

      // 整备横幅 = 提前开始
      if (TD.BALANCE.ALLOW_SKIP_PREPARE
          && (run.state === S.PREPARE || run.state === S.BOSS_PREPARE)
          && TD.U.pointInRect(ev.x, ev.y, TD.UI.hit.skip)) {
        TD.Waves.skipPrepare(run);
        return;
      }

      // 防守成功卡片上的"立即开始 Boss 挑战"（卡片区域整体吞掉点击）
      if (run.state === S.MAIN_CLEAR) {
        const btns = TD.UI.hit.overlayBtns || [];
        for (let i = 0; i < btns.length; i++) {
          if (TD.U.pointInRect(ev.x, ev.y, btns[i].rect)) {
            if (btns[i].id === 'bossNow') run.mainClearTimer = 0.01;
            return;
          }
        }
        if (TD.U.pointInRect(ev.x, ev.y, TD.UI.hit.mainClearCard)) return;
      }

      // 招募 / 广告召唤
      if (TD.U.pointInRect(ev.x, ev.y, TD.LAYOUT.recruitBtn)) { this.doRecruit(); return; }
      if (TD.U.pointInRect(ev.x, ev.y, TD.LAYOUT.adBtn)) { this.doAdSummon(); return; }

      // 英雄信息面板按钮
      if (this.handlePanelClick(ev, run)) return;

      // 点格子：选中并准备拖拽
      const slot = this.pickSlot(ev);
      if (slot) {
        const hero = TD.Heroes.at(run, slot.zone, slot.index);
        if (hero) {
          run.selection = { zone: slot.zone, index: slot.index };
          this.drag = { zone: slot.zone, index: slot.index, startX: ev.x, startY: ev.y, x: ev.x, y: ev.y, active: false };
        } else {
          run.selection = null;
          this.drag = null;
        }
        return;
      }

      // 点空白：取消选择
      run.selection = null;
      this.drag = null;
      return;
    }

    if (ev.type === 'move' && this.drag) {
      this.drag.x = ev.x;
      this.drag.y = ev.y;
      if (!this.drag.active
          && Math.abs(ev.x - this.drag.startX) + Math.abs(ev.y - this.drag.startY) > 12) {
        this.drag.active = true;
      }
      return;
    }

    if (ev.type === 'up' && this.drag) {
      const drag = this.drag;
      this.drag = null;
      if (!drag.active) return;   // 单纯点击 = 选中，不移动
      const to = this.pickSlot({ x: ev.x, y: ev.y });
      if (!to) return;            // 拖到空地 = 取消
      const res = TD.Merge.tryDrop(run, { zone: drag.zone, index: drag.index }, to);
      this.afterDrop(run, res);
    }
  };

  Mode.prototype.handleConfirm = function (ev, run) {
    if (ev.type !== 'down') return;
    const btns = TD.UI.hit.overlayBtns || [];
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (!TD.U.pointInRect(ev.x, ev.y, b.rect)) continue;
      if (b.id === 'resume') { this.exitConfirm = false; return; }
      if (b.id === 'exit') { TD.Game.setScene(new TD.MapSelectScene()); return; }
    }
  };

  Mode.prototype.handleResultClick = function (ev, run) {
    if (ev.type !== 'down') return;
    const btns = TD.UI.hit.overlayBtns || [];
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (!TD.U.pointInRect(ev.x, ev.y, b.rect)) continue;
      if (b.id === 'retry') { this.restart(); return; }
      if (b.id === 'map') { TD.Game.setScene(new TD.MapSelectScene()); return; }
      if (b.id === 'share') {
        this.shareOpen = true;
        this._shareCard = TD.Share.render(run);
        TD.Analytics.track('share_open', { mapId: run.mapId });
        return;
      }
      return;
    }
  };

  Mode.prototype.handlePanelClick = function (ev, run) {
    const btns = TD.UI.hit.panel || [];
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (!TD.U.pointInRect(ev.x, ev.y, b.rect)) continue;

      if (b.id === 'close') { run.selection = null; return true; }

      const sel = run.selection;
      const hero = sel ? TD.Heroes.at(run, sel.zone, sel.index) : null;
      if (!hero) { run.selection = null; return true; }

      if (b.id === 'sell') {
        const refund = TD.ECONOMY.sellHero(run, hero);
        run.selection = null;
        TD.Sfx.coin();
        TD.UI.toast(run, '已出售，+' + refund + ' 金币', '#ffd75e');
        return true;
      }
      if (b.id.indexOf('evo:') === 0) {
        const evoId = b.id.slice(4);
        if (TD.Evolve.evolve(run, hero, evoId)) {
          TD.UI.toast(run, TD.Heroes.label(hero) + ' 完成！', '#ffd75e');
          run.selection = null;
        }
        return true;
      }
    }
    // 面板内部空白：吞掉点击，避免误选
    if (run.selection && TD.U.pointInRect(ev.x, ev.y, TD.LAYOUT.panel)) return true;
    return false;
  };

  /* 收集所有格子命中（战斗格 + 备战格） */
  Mode.prototype.pickSlot = function (p) {
    const run = this.run;
    const half = TD.LAYOUT.slotSize / 2;
    for (let i = 0; i < run.map.combatSlots.length; i++) {
      const s = run.map.combatSlots[i];
      if (Math.abs(p.x - s.x) <= half && Math.abs(p.y - s.y) <= half) return { zone: 'combat', index: i };
    }
    const halfB = TD.LAYOUT.benchSlotSize / 2;
    for (let i = 0; i < TD.LAYOUT.bench.length; i++) {
      const s = TD.LAYOUT.bench[i];
      if (Math.abs(p.x - s.x) <= halfB && Math.abs(p.y - s.y) <= halfB) return { zone: 'bench', index: i };
    }
    return null;
  };

  Mode.prototype.afterDrop = function (run, res) {
    if (!res) return;
    if (res.action === 'merge') {
      TD.UI.toast(run, '合成成功！', '#9fe8a8');
      // 合成后保持选中目标格子，方便连续合成
      return;
    }
    if (res.action === 'invalid') {
      const msg = {
        class: '只能合成相同职业的英雄',
        star: '只能合成相同星级的英雄',
        final: '最终进化英雄不能继续合成',
        max: '4★ 请点击英雄选择最终进化',
        empty: '无效操作',
      };
      if (msg[res.reason]) TD.UI.toast(run, msg[res.reason], '#ffb0b0');
    }
  };

  /* ── 招募 / 广告召唤 ──────────────────────────────── */
  Mode.prototype.doRecruit = function () {
    const run = this.run;
    const res = TD.Recruit.recruit(run);
    if (!res.ok) {
      TD.Sfx.deny();
      if (res.reason === 'capacity') TD.UI.toast(run, '位子满了：请先合成、出售或整理英雄', '#ffb0b0');
      else if (res.reason === 'gold') TD.UI.toast(run, '金币不足（需要 ' + TD.BALANCE.RECRUIT_COST + '）', '#ffb0b0');
      return;
    }
    TD.Sfx.recruit();
    TD.UI.toast(run, '招募到 ' + TD.Heroes.label(res.hero), '#cde3ff');
  };

  Mode.prototype.doAdSummon = function () {
    const run = this.run;
    if (run.adSummonUsed >= TD.BALANCE.AD_SUMMON_LIMIT) {
      TD.UI.toast(run, '本局广告召唤次数已用完', '#ffb0b0');
      return;
    }
    if (TD.Heroes.capacityFull(run)) {
      TD.UI.toast(run, '位子满了：请先合成、出售或整理英雄', '#ffb0b0');
      return;
    }
    if (this.adLoading) return;
    this.adLoading = true;
    const self = this;
    // 统一走带超时与统计的入口；失败/超时不会扣任何东西（§18 的同一原则）
    TD.Ads.requestWithStats('td_summon', function () {
      self.adLoading = false;
      const res = TD.Recruit.adSummon(run);
      if (!res.ok) {
        TD.Sfx.deny();
        if (res.reason === 'limit') TD.UI.toast(run, '本局广告召唤次数已用完', '#ffb0b0');
        else TD.UI.toast(run, '位子满了：请先合成、出售或整理英雄', '#ffb0b0');
      } else {
        TD.Sfx.recruit();
        TD.UI.toast(run, '广告召唤：' + TD.Heroes.label(res.hero), '#ffd75e');
      }
    }, function (err) {
      self.adLoading = false;
      TD.Sfx.deny();
      TD.UI.toast(run, '广告没有加载成功，请稍后再试', '#ffb0b0');
    });
  };

  TD.TowerDefenseMode = Mode;
})();
