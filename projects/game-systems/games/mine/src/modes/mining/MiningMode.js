/* 地下矿坑 · 场景主控（设计规格 §58～§60 / §69 / §73）：
 *
 * 状态机（§69）：ENTERING → EXPLORING ⇄ MOVING / DIGGING / ROOM_DISCOVERY
 *                → TREASURE_DISCOVERY → RESULT
 *
 * 输入（点击）分派：
 *   工具条 → 炸药（瞄准）/ 强化矿镐（立即）/ 探矿灯（立即）
 *   地图内 → 相邻岩块 = 挖掘；已挖格 = 自动寻路移动；远处岩块 = 只显示成本提示
 *   底部   → 返回入口（V0.6：只是免费移动，不再是撤离方式）；结束探索（二次确认，基础价值结算）
 *
 * 场景接口与主项目一致：enter() / update(dt) / draw(ctx)，无第三方依赖。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});
  const S = MM.State.S;

  function MiningMode(seed, mapId, options) {
    this.speedScaled = false;
    this.mapId = mapId || 'oldMine';
    const initialMine = MM.MINES && MM.MINES[this.mapId];
    this.seed = initialMine && initialMine.fixedSeed ? initialMine.fixedSeed : (seed != null ? String(seed) : MM.newSeed());
    this.options = Object.assign({}, options || {});
    this.resumeRequested = !!this.options.resume;
    this.autosaveDirty = false;
    this.tutorialForced = !!(options && options.tutorial);
    this.styleId = (options && options.style) || null;   // V0.7.1：探索风格（可选个人目标）
    this.hit = {};
    this.messages = [];
    this.banner = null;
    this.hoverCell = null;
    this.modal = null;
    this.settingsOpen = false;
    this.cartApproach = null;
    this.workbenchApproach = null;
    this.workbenchPage = 0;
    this.gateApproach = null;
    this.springApproach = null;
    this.treasureSeq = null;
    this.armedTool = null;
    this.endConfirmT = 0;
    this.treasureTimer = 0;
    this.roomTimer = 0;
    this.enterTimer = 1;
    this.fadeIn = 1;
    this.camY = 0;
    this.camTarget = 0;
    this.shakeNow = { x: 0, y: 0 };
    this.time = 0;
  }

  MiningMode.prototype.enter = function () {
    if (this.resumeRequested && this.restoreRun()) return;
    this.newRun(this.seed, this.mapId);
  };

  MiningMode.prototype.exit = function () {};

  /* ══════════════════ 开局 / 重新生成 ══════════════════ */
  MiningMode.prototype.newRun = function (seed, mapId) {
    const B = MM.BALANCE;
    const forceTutorial = this.tutorialForced;
    this.tutorialForced = false;
    this.mapId = mapId || this.mapId || 'oldMine';
    const mineDef = MM.MINES && MM.MINES[this.mapId];
    this.seed = mineDef && mineDef.fixedSeed ? mineDef.fixedSeed : (seed != null ? String(seed) : MM.newSeed());
    this.save = MM.Save;
    this.prevBestDepth = this.save.records().bestDepth;

    const challengeMode = this.options && this.options.challengeMode;
    const daily = challengeMode === 'daily';
    const standardChallenge = daily || challengeMode === 'seed';
    const ex = this.save.get().miningSave.expedition;
    /* 标准 Seed / 每日挑战必须对所有档案状态生成同一张地图；个人遗物追踪只影响普通探索。 */
    const relicTarget = !standardChallenge && this.mapId !== 'sealedVault' && ex.trackedRelic ? ex.trackedRelic : null;
    const generationOptions = Object.assign({}, this.options.generationOptions || {}, relicTarget ? { relicTarget } : {});
    const gen = MM.Generator.generateValidated(this.seed, this.mapId, generationOptions);
    this.map = gen.map;
    this.genInfo = gen;
    this.run = MM.State.createRun(this.seed);
    this.run.mapId = this.mapId;    // V0.7：采矿门槛按地图真实深度缩放（9×20 测试图）
    this.run.challengeMode = this.options.challengeMode || null;
    this.run.challengeParams = Object.assign({}, this.options.challengeParams || (daily ? { mode: 'daily' } : {}),
      relicTarget ? { relicTarget } : {});
    this.run.relicTarget = relicTarget;
    this.run.sealedTrial = this.mapId === 'sealedVault';
    this.run.state = S.ENTERING;
    this.tutorial = MM.Tutorial.create(forceTutorial);
    this.run.tutorialRun = !!this.tutorial.authored;
    if (this.styleId && !this.run.tutorialRun) MM.Style.attach(this.run, this.styleId);
    if (this.tutorial.authored && MM.Tutorial.prepareMap) {
      MM.Tutorial.prepareMap(this.map, this.run, this.tutorial);
    }

    this.effects = new MM.Effects();
    this.panel = new MM.DebugPanel();
    this.exportMsg = null;
    this.exportMsgT = 0;
    this.armedTool = null;
    this.messages = [];
    this.banner = null;
    this.hoverCell = null;
    this.modal = null;
    this.settingsOpen = false;
    this.cartApproach = null;
    this.workbenchApproach = null;
    this.gateApproach = null;
    this.springApproach = null;
    this.cartPreview = null;
    this.treasureSeq = null;
    this.endConfirmT = 0;
    this.treasureTimer = 0;
    this.roomTimer = 0;
    this.enterTimer = B.ANIM.ENTER_TIME;
    this.fadeIn = 1;
    this.hit = {};
    this.shakeNow = { x: 0, y: 0 };
    this.autosaveDirty = true;

    MM.Vision.revealAround(this.map, this.run.playerX, this.run.playerY, MM.Vision.radius(this.run));
    if (MM.Telemetry) MM.Telemetry.start(this.run, this.mapId);
    this.camY = this.camTarget = this.clampCam(this.playerWorldY() - this.viewH() * 0.42);

    if (this.styleId) {
      this.tipOnce('style', '风格是可选目标：完成发局内奖励 + 档案徽章，不强制；进度在 HUD 右下角', '#9fd0ff', 4.0);
    }
  };

  MiningMode.prototype.restoreRun = function () {
    const saved = MM.Save.restoreActiveRun();
    if (!saved) return false;
    this.save = MM.Save;
    this.mapId = saved.mineId;
    this.seed = String(saved.run.seed || this.seed);
    this.run = saved.run;
    this.run.sealedTrial = this.mapId === 'sealedVault';
    this.map = saved.map;
    this.genInfo = { map: this.map, report: { ok: true, errors: [], warnings: [] }, attempts: this.map.attempt || 1, repairs: 0, notes: [] };
    this.tutorial = MM.Tutorial.create(false);
    this.effects = new MM.Effects();
    this.panel = new MM.DebugPanel();
    this.messages = [];
    this.banner = null;
    this.modal = saved.modal;
    this.cartPreview = this.modal && this.modal.type === 'minecart'
      ? (((this.modal.skip || {}).cells || []).slice()) : null;
    this.settingsOpen = false;
    this.armedTool = null;
    this.cartApproach = this.workbenchApproach = this.gateApproach = this.springApproach = null;
    this.treasureSeq = null;
    this.enterTimer = 0;
    this.fadeIn = 0;
    this.prevBestDepth = MM.Save.records().bestDepth;
    this.hit = {};
    this.camY = this.camTarget = this.clampCam(this.playerWorldY() - this.viewH() * 0.42);
    if (MM.Telemetry) MM.Telemetry.start(this.run, this.mapId);
    this.addMessage('已恢复上次探索 · ' + ((this.map.spec && this.map.spec.name) || this.mapId) + ' · ' + this.seed, '#9fe08a', 3.2);
    return true;
  };

  /* V0.8.3：首次情境提示——同一提示整个存档只出现一次 */
  MiningMode.prototype.tipOnce = function (key, text, color, dur) {
    if (!MM.Tips || MM.Tips.seen(key)) return false;
    MM.Tips.mark(key);
    this.addMessage(text, color || '#9fd0ff', dur || 3.4);
    return true;
  };

  /* ══════════════════ 坐标换算 ══════════════════ */
  MiningMode.prototype.viewH = function () {
    return MM.UI.LAYOUT.MAP_BOTTOM - MM.UI.LAYOUT.MAP_TOP;
  };

  MiningMode.prototype.worldH = function () {
    return this.map.h * MM.UI.LAYOUT.TILE;
  };

  MiningMode.prototype.clampCam = function (v) {
    return MM.U.clamp(v, 0, Math.max(0, this.worldH() - this.viewH()));
  };

  MiningMode.prototype.playerWorldY = function () {
    const pos = MM.Player.renderPos(this.run);
    return (pos.y + 0.5) * MM.UI.LAYOUT.TILE;
  };

  MiningMode.prototype.worldToScreen = function (wx, wy) {
    const shake = this.shakeNow || { x: 0, y: 0 };
    return {
      x: MM.UI.LAYOUT.MAP_X + wx + shake.x,
      y: MM.UI.LAYOUT.MAP_TOP + wy - Math.round(this.camY) + shake.y,
    };
  };

  MiningMode.prototype.screenToCell = function (px, py) {
    const T = MM.UI.LAYOUT.TILE;
    const gx = px - MM.UI.LAYOUT.MAP_X;
    const gy = py - MM.UI.LAYOUT.MAP_TOP + Math.round(this.camY);
    const cx = Math.floor(gx / T);
    const cy = Math.floor(gy / T);
    if (!this.map.inBounds(cx, cy)) return null;
    return { x: cx, y: cy };
  };

  /* ══════════════════ 主循环 ══════════════════ */
  MiningMode.prototype.update = function (dt) {
    this.time += dt;

    const events = MM.Input.consume();
    this.handleInput(events);

    const run = this.run;
    /* 动作态必须对应一个仍在推进的动作。
     * 交互弹窗可能打断移动/挖掘完成后的回调；若弹窗关闭时只剩 MOVING/DIGGING 状态，
     * 主循环将持续等待一个已经清空的 move/action。这里按动作对象校正，避免永久锁输入。 */
    if ((run.state === S.MOVING && !run.move) || (run.state === S.DIGGING && !run.action)) {
      run.state = S.EXPLORING;
      this.autosaveDirty = true;
    }
    if (this.endConfirmT > 0) this.endConfirmT = Math.max(0, this.endConfirmT - dt);
    if (this.panel) this.panel.update(dt);

    switch (run.state) {
      case S.ENTERING:
        this.enterTimer -= dt;
        this.fadeIn = MM.U.clamp(this.enterTimer / MM.BALANCE.ANIM.ENTER_TIME, 0, 1);
        if (this.enterTimer <= 0) run.state = S.EXPLORING;
        break;
      case S.DIGGING:
        this.updateAction(dt);
        break;
      case S.MOVING:
        this.updateMovement(dt);
        break;
      case S.ROOM_DISCOVERY:
        this.roomTimer -= dt;
        if (this.roomTimer <= 0) this.finishPending();
        break;
      case S.TREASURE_DISCOVERY:
        this.updateTreasureSequence(dt);
        break;
      default:
        break;
    }

    /* 消息 / 横幅计时 */
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      m.t += dt;
      m.left -= dt;
      if (m.left <= 0) this.messages.splice(i, 1);
    }
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.dur) this.banner = null;
    }

    /* 镜头平滑跟随（§60） */
    this.camTarget = this.clampCam(this.playerWorldY() - this.viewH() * 0.42);
    const k = Math.min(1, dt * MM.BALANCE.CAMERA.SMOOTH);
    this.camY += (this.camTarget - this.camY) * k;

    this.effects.update(dt);
    this.shakeNow = this.effects.shakeOffset();   // 每帧取一次，保证整张地图同一次震动
    this.updateHover(MM.Input.x, MM.Input.y);

    /* 体力耗尽提示（§51：并不等于失败，矿物全部保留） */
    if (run.state === S.EXPLORING && !run.exhaustedHint && run.stamina <= 0 && !run.freeDig) {
      run.exhaustedHint = true;
      this.addMessage('体力耗尽也不失败：可在已挖区域自由移动，或直接结束探索（按基础价值结算，矿物全部保留）', '#ff9a6b', 5);
    }
    if (this.exportMsgT > 0) this.exportMsgT = Math.max(0, this.exportMsgT - dt);

    /* V0.7.1：探索风格完成判定（只在可操作状态检查，避免打断演出 / 教程） */
    this.updateStyleCheck();
    /* V0.7.1：三段式节奏——进入新的深度层时提示一次 */
    this.updateDepthHint();
    if (this.autosaveDirty && run.state === S.EXPLORING && !run.tutorialRun) {
      MM.Save.saveActiveRun(run, this.map, this.modal);
      this.autosaveDirty = false;
    }
  };

  MiningMode.prototype.updateStyleCheck = function () {
    const run = this.run;
    if (run.tutorialRun || !run.style || run.style.done || run.style.failed) return;
    if (run.state !== S.EXPLORING) return;
    if (this.tutorial && this.tutorial.open) return;
    const res = MM.Style.check(run, this.map);
    if (res === 'done') {
      const rew = MM.Style.grantReward(run);
      MM.Audio.play('record');
      this.setBanner('探索风格完成 · ' + run.style.name,
        run.style.goal + (rew ? ' · 奖励：' + rew.text : '') + ' · 结算页记入探索档案', '#9fd0ff', 3.0);
      if (rew) {
        this.addMessage('风格奖励已入账：' + rew.text + ' · ' + MM.Style.rewardHint(run), '#9fd0ff', 3.6);
      }
    } else if (res === 'failed') {
      this.addMessage('风格「' + run.style.name + '」条件已失效：本局坐过矿车', '#8fa3c4', 3.0);
    }
  };

  MiningMode.prototype.updateDepthHint = function () {
    const run = this.run;
    if (run.state !== S.EXPLORING && run.state !== S.MOVING) return;
    if (this.tutorial && this.tutorial.open) return;
    const layer = MM.depthLayerAt(run.playerY);
    if (!layer) return;
    run.depthHints = run.depthHints || {};
    if (run.depthHints[layer.id]) return;
    run.depthHints[layer.id] = true;
    const hint = (MM.BALANCE.DEPTH_HINTS || {})[layer.id];
    if (hint) this.addMessage(hint, '#9fd0ff', 4.2);
  };

  MiningMode.prototype.updateHover = function (px, py) {
    const L = MM.UI.LAYOUT;
    if (this.run.state === S.RESULT || this.modal || this.settingsOpen || (this.panel && this.panel.open)) { this.hoverCell = null; return; }
    if (py < L.MAP_TOP || py > L.MAP_BOTTOM || px < L.MAP_X || px > L.MAP_X + this.map.w * L.TILE) {
      this.hoverCell = null;
      return;
    }
    this.hoverCell = this.screenToCell(px, py);
  };

  /* ══════════════════ 输入 ══════════════════ */
  MiningMode.prototype.handleInput = function (events) {
    if (events.length && MM.Audio) MM.Audio.init();   // 首次点击后解锁 WebAudio（§82）
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'key') { this.handleKey(ev.key); continue; }
      if (ev.type !== 'down') continue;
      const run = this.run;
      const x = ev.x, y = ev.y;

      /* 设置弹窗打开时屏蔽地图与其它热区。 */
      if (this.settingsOpen) {
        if (MM.U.pointInRect(x, y, this.hit.settingsClose)) { this.settingsOpen = false; continue; }
        if (MM.U.pointInRect(x, y, this.hit.settingsDebug)) {
          this.settingsOpen = false;
          this.panel.open = true;
          continue;
        }
        if (MM.U.pointInRect(x, y, this.hit.settingsSound)) {
          const on = MM.Audio.toggle();
          this.addMessage(on ? '音效已开启' : '音效已关闭', '#8fa3c4', 1.8);
          continue;
        }
        this.settingsOpen = false;
        continue;
      }
      if (MM.U.pointInRect(x, y, this.hit.sound)) {
        const on = MM.Audio.toggle();
        this.addMessage(on ? '音效已开启' : '音效已关闭', '#8fa3c4', 1.8);
        continue;
      }
      if (MM.U.pointInRect(x, y, this.hit.settings)) {
        this.settingsOpen = true;
        continue;
      }
      if (!this.modal && run.state !== S.RESULT && !(this.tutorial && this.tutorial.open)) {
        const slots = this.hit.upgradeSlots || [];
        let openedUpgradeInfo = false;
        for (let k = 0; k < slots.length; k++) {
          if (slots[k].upgradeId && MM.U.pointInRect(x, y, slots[k])) {
            this.modal = { type: 'upgradeInfo', upgradeId: slots[k].upgradeId };
            openedUpgradeInfo = true;
            break;
          }
        }
        if (openedUpgradeInfo) continue;
      }

      if (run.state === S.RESULT) {
        if (MM.U.pointInRect(x, y, this.hit.retry)) { this.newRun(MM.newSeed()); return; }
        if (MM.U.pointInRect(x, y, this.hit.back)) { MM.Game.setScene(new MM.TitleScene()); return; }
        if (MM.U.pointInRect(x, y, this.hit.copySeed)) { this.copySeedLink(); continue; }
        if (MM.U.pointInRect(x, y, this.hit.exportRun) && window.CampSkin) { MM.UI.openReport(this); continue; }
        if (MM.U.pointInRect(x, y, this.hit.exportRun)) {
          let note = '';
          try {
            if (typeof window !== 'undefined' && window.prompt) {
              note = window.prompt('可选：写下本局你为什么走了某条支路？（留空跳过）', '') || '';
            }
          } catch (e) { note = ''; }
          if (note) MM.Telemetry.setNote(note);
          const okk = MM.Telemetry.exportRun();
          this.exportMsg = okk ? '试玩记录已导出（如未弹出下载，请查看浏览器下载栏）' : '导出失败：可在控制台用 MT.MM.Telemetry.list() 复制记录';
          this.exportMsgT = 4;
          continue;
        }
        continue;
      }

      /* 新手教程：开局卡片期间不接收地图操作；操作指引期间只拦截跳过按钮。 */
      if (this.tutorial && this.tutorial.open) {
        if (MM.U.pointInRect(x, y, this.hit.tutorialNext)) MM.Tutorial.advance(this.tutorial);
        else if (MM.U.pointInRect(x, y, this.hit.tutorialSkip)) {
          MM.Tutorial.skip(this.tutorial);
          this.newRun(this.seed, this.mapId);
          this.addMessage('已跳过新手教程，进入正常随机矿坑；也可从标题页再次打开', '#8fa3c4', 2.8);
        }
        continue;
      }
      if (this.tutorial && this.tutorial.guided && !this.modal
          && MM.U.pointInRect(x, y, this.hit.tutorialSkipGuide)) {
        MM.Tutorial.skip(this.tutorial);
        this.addMessage('已完成基础操作引导', '#8fa3c4', 2.0);
        continue;
      }

      /* 弹窗优先：补给、工作台、仓库、矿车；弹窗外的输入全部屏蔽。 */
      if (this.modal) {
        if (this.modal.type === 'supply') {
          const opts = this.hit.supplyChoices || [];
          for (let k = 0; k < opts.length; k++) {
            if (MM.U.pointInRect(x, y, opts[k])) { this.chooseSupply(k); break; }
          }
          continue;
        }
        if (this.modal.type === 'workbench') {
          if (MM.U.pointInRect(x, y, this.hit.workbenchPrev)) {
            this.workbenchPage = Math.max(0, (this.workbenchPage || 0) - 1);
            continue;
          }
          if (MM.U.pointInRect(x, y, this.hit.workbenchNext)) {
            const pages = Math.max(1, Math.ceil((MM.CRAFTING_RECIPES || []).length / 2));
            this.workbenchPage = Math.min(pages - 1, (this.workbenchPage || 0) + 1);
            continue;
          }
          const crafts = this.hit.workbenchCraft || [];
          const tracks = this.hit.workbenchTrack || [];
          let handled = false;
          for (let k = 0; k < crafts.length; k++) {
            if (MM.U.pointInRect(x, y, crafts[k])) { this.craftUpgrade(k); handled = true; break; }
          }
          if (handled) continue;
          for (let k = 0; k < tracks.length; k++) {
            if (MM.U.pointInRect(x, y, tracks[k])) { this.trackRecipe(k); handled = true; break; }
          }
          if (handled) continue;
          if (MM.U.pointInRect(x, y, this.hit.workbenchClose)) this.modal = null;
          continue;
        }
        if (this.modal.type === 'warehouseChoice') {
          if (MM.U.pointInRect(x, y, this.hit.warehouseSupplies)) this.chooseWarehouse('supplies');
          else if (MM.U.pointInRect(x, y, this.hit.warehouseMaterials)) this.chooseWarehouse('materials');
          continue;
        }
        if (this.modal.type === 'springChoice') {
          if (MM.U.pointInRect(x, y, this.hit.springNow)) this.chooseSpring('now');
          else if (MM.U.pointInRect(x, y, this.hit.springLater)) this.chooseSpring('later');
          continue;
        }
        if (this.modal.type === 'gateChoice') {
          if (MM.U.pointInRect(x, y, this.hit.gateRepair)) this.chooseGate('repair');
          else if (MM.U.pointInRect(x, y, this.hit.gateDismantle)) this.chooseGate('dismantle');
          else if (MM.U.pointInRect(x, y, this.hit.gateClose)) { this.modal = null; this.autosaveDirty = true; }
          continue;
        }
        if (this.modal.type === 'treasureChoice') {
          if (MM.U.pointInRect(x, y, this.hit.treasureSettle)) this.settle('treasure');
          else if (MM.U.pointInRect(x, y, this.hit.treasureContinue)) this.continueAfterTreasure();
          continue;
        }
        if (this.modal.type === 'upgradeInfo') {
          if (MM.U.pointInRect(x, y, this.hit.upgradeClose)) this.modal = null;
          continue;
        }
        if (MM.U.pointInRect(x, y, this.hit.cartRide)) { this.rideMinecart(); continue; }
        if (MM.U.pointInRect(x, y, this.hit.cartSkip)) {
          this.modal = null;
          this.cartPreview = null;
          this.addMessage('已暂不乘坐：之后回到矿车还可以再决定', '#8fa3c4', 2.2);
          continue;
        }
        continue;
      }

      /* 调试面板：打开时屏蔽游戏输入 */
      if (this.panel.open) {
        if (MM.U.pointInRect(x, y, this.hit.debug)) { this.panel.open = false; continue; }
        this.panel.handleClick(this, x, y);
        continue;
      }
      if (MM.BALANCE.DEV_MODE && MM.U.pointInRect(x, y, this.hit.debug)) {
        this.panel.open = true;
        continue;
      }

      const interactive = run.state === S.EXPLORING;
      if (interactive && MM.U.pointInRect(x, y, this.hit.cartBadge)) {
        this.openCartModal(run.playerX, run.playerY);
        continue;
      }
      if (MM.U.pointInRect(x, y, this.hit.bomb)) { if (interactive) this.toggleBomb(); continue; }
      if (MM.U.pointInRect(x, y, this.hit.powerPick)) { if (interactive) this.useTool('powerPick'); continue; }
      if (MM.U.pointInRect(x, y, this.hit.lamp)) { if (interactive) this.useTool('lamp'); continue; }
      if (MM.U.pointInRect(x, y, this.hit.main)) { if (interactive) this.onMainButton(); continue; }
      if (MM.U.pointInRect(x, y, this.hit.end)) {
        if (run.state !== S.DIGGING && run.state !== S.TREASURE_DISCOVERY) this.requestDirectEnd();
        continue;
      }
      if (y >= MM.UI.LAYOUT.MAP_TOP && y <= MM.UI.LAYOUT.MAP_BOTTOM && interactive) {
        const c = this.screenToCell(x, y);
        if (c) this.onCellClick(c.x, c.y);
        continue;
      }
    }
  };

  /* V0.8.3：桌面键盘——方向键 / WASD 行动，1/2/3 选补给，Esc 取消。
   * 只影响操作方式，不改变任何规则；触屏 / 鼠标仍是完整操作路径。 */
  MiningMode.prototype.handleKey = function (key) {
    const run = this.run;
    if (key === 'Escape') {
      if (this.modal && this.modal.type === 'workbench') {
        this.modal = null;
        return;
      }
      if (this.modal && this.modal.type === 'upgradeInfo') {
        this.modal = null;
        return;
      }
      if (this.armedTool === 'bomb') {
        this.armedTool = null;
        this.addMessage('已取消炸药瞄准', '#8fa3c4', 1.5);
        return;
      }
      if (this.endConfirmT > 0) {
        this.endConfirmT = 0;
        this.addMessage('已取消结束探索', '#8fa3c4', 1.5);
        return;
      }
      return;
    }
    const num = { '1': 0, '2': 1, '3': 2 }[key];
    if (this.tutorial && this.tutorial.open) {
      if (key === 'Enter' || key === ' ') MM.Tutorial.advance(this.tutorial);
      return;
    }
    if (this.modal && this.modal.type === 'supply' && num != null) {
      this.chooseSupply(num);
      return;
    }
    if (this.modal && this.modal.type === 'workbench' && num != null) {
      if (num < 2) this.craftUpgrade(num + (this.workbenchPage || 0) * 2);
      return;
    }
    if (run.state !== S.EXPLORING || this.modal) return;
    if (this.panel && this.panel.open) return;
    const dirs = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
      W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
    };
    const d = dirs[key];
    if (!d) return;
    const tx = run.playerX + d[0], ty = run.playerY + d[1];
    if (!this.map.inBounds(tx, ty)) return;
    this.onCellClick(tx, ty);
  };

  MiningMode.prototype.toggleBomb = function () {
    if (this.armedTool === 'bomb') {
      this.armedTool = null;
      MM.Audio.play('click');
      this.addMessage('已取消炸药瞄准', '#8fa3c4', 1.5);
      return;
    }
    if ((this.run.tools.bomb || 0) <= 0) { MM.Audio.play('deny'); this.addMessage('没有炸药了', '#ff9a6b', 1.8); return; }
    this.armedTool = 'bomb';
    MM.Audio.play('click');
    this.addMessage('炸药瞄准中：点选目标格及上下左右（最多 5 格）', '#ff9a6b', 2.4);
  };

  MiningMode.prototype.useTool = function (id) {
    const run = this.run, map = this.map;
    if (id === 'powerPick') {
      const res = MM.Tools.tryPowerPick(run);
      if (!res.ok) { MM.Audio.play('deny'); this.addMessage(res.message, '#ff9a6b', 2); return; }
      MM.Audio.play('click');
      if (MM.Telemetry) MM.Telemetry.noteTool('powerPick');
      this.addMessage('强化矿镐生效：下一次成功挖掘不消耗体力', '#9fe08a', 2.4);
      if (this.tutorial && this.tutorial.guided && MM.Tutorial.onToolUsed
          && MM.Tutorial.onToolUsed(this.tutorial, id)) {
        this.addMessage('基础操作教学完成：从这里继续探索，或结束本局返回标题', '#9fe08a', 3.0);
      }
      return;
    }
    if (id === 'lamp') {
      const res = MM.Tools.tryLamp(run);
      if (!res.ok) { MM.Audio.play('deny'); this.addMessage(res.message, '#ff9a6b', 2); return; }
      MM.Audio.play('click');
      if (MM.Telemetry) MM.Telemetry.noteTool('lamp');
      MM.Vision.revealAround(map, run.playerX, run.playerY, MM.Vision.radius(run));
      this.effects.flash('rgba(127,216,255,0.30)', 0.4);
      this.addMessage(res.message, '#7fd8ff', 2.6);
      if (MM.Upgrades.has(run, 'prospectingLens')) {
        const hint = MM.Upgrades.roomHint(run, map);
        if (hint) {
          run.stats.lensHints = (run.stats.lensHints || 0) + 1;
          this.addMessage('勘探镜：' + hint.direction + '方有未发现房间线索，距离' + hint.range, '#7fd8ff', 3.4);
        }
      }
      if (this.tutorial && this.tutorial.guided && MM.Tutorial.onToolUsed
          && MM.Tutorial.onToolUsed(this.tutorial, id)) {
        this.addMessage('基础操作教学完成：从这里继续探索，或结束本局返回标题', '#9fe08a', 3.0);
      }
    }
  };

  MiningMode.prototype.onMainButton = function () {
    const run = this.run, map = this.map;
    if (MM.Move.atEntrance(run, map)) {
      MM.Audio.play('click');
      this.addMessage('已经在入口：继续探索，或点「结束探索」按基础价值结算', '#8fa3c4', 2.2);
      return;
    }
    const res = MM.Move.startReturnToEntrance(run, map);
    if (!res.ok) { MM.Audio.play('deny'); this.addMessage(res.message, '#ff9a6b', 2.5); return; }
    run.state = S.MOVING;
    this.addMessage('沿已挖道路返回入口（免费；可以经过矿车连接）', '#8fa3c4', 2.2);
  };

  MiningMode.prototype.requestDirectEnd = function () {
    if (this.endConfirmT > 0) { this.endConfirmT = 0; this.settle('direct'); return; }
    this.endConfirmT = 2.2;
    this.addMessage('再点一次「结束探索」确认（按基础价值结算，保留全部已获得价值）', '#ffd75e', 2.2);
  };

  /* ══════════════════ 本局采矿进度 / 补给（V0.7 试玩反馈） ══════════════════
   * 每次挖掘 / 爆破结算后调用：达到门槛时第一档自动发放，第二 / 三档弹出三选一。
   * 进度只认"实际挖出的矿物"（MM.Resources.grant），宝箱 / 藏宝库价值不算。 */
  MiningMode.prototype.checkProgress = function () {
    const run = this.run;
    const events = MM.Progress.check(run);
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'supplyGranted') {
        MM.Audio.play('record');
        const tier = MM.Progress.tiers(run).filter((t) => t.id === ev.tierId)[0];
        const label = tier ? tier.name : '补给';
        let text = '';
        if (ev.kind === 'stamina') {
          text = '体力 +' + ev.amount + (ev.amount < ev.want ? '（已接近上限）' : '');
        }
        this.setBanner('采矿补给 · ' + label, text + ' · 可以继续往深处挖了', '#9fe08a', 2.4);
        this.addMessage('采矿达标：' + label + ' 自动发放（' + text + '）', '#9fe08a', 3.2);
      } else if (ev.type === 'supplyChoice') {
        this.openSupplyModal(ev.tier);
      }
    }
  };

  MiningMode.prototype.openSupplyModal = function (tier) {
    if (!tier) return;
    this.modal = { type: 'supply', tierId: tier.id };
    MM.Audio.play('roomFound');
    this.addMessage('采矿进度达标：选择一份继续探索的补给', '#ffd75e', 3.0);
    this.tipOnce('supply', '三选一：每档只发一次、选中立刻生效；道具在底部工具条里点击使用', '#9fe08a', 4.0);
  };

  MiningMode.prototype.chooseSupply = function (index) {
    const m = this.modal;
    if (!m || m.type !== 'supply') return;
    const tier = MM.Progress.tiers(this.run).filter((t) => t.id === m.tierId)[0];
    if (!tier || !tier.choices || !tier.choices[index]) return;
    const choice = tier.choices[index];
    const res = MM.Progress.applyChoice(this.run, tier.id, choice.id);
    if (!res.ok) {
      if (res.reason === 'claimed') { this.modal = null; this.checkProgress(); }
      else MM.Audio.play('deny');
      return;
    }
    this.modal = null;
    MM.Audio.play('chest');
    const hint = this.supplyUseHint(choice);
    this.addMessage('补给已领取：' + res.detail + (hint ? ' · ' + hint : ''), '#9fe08a', 3.6);
    if (MM.Telemetry && MM.Telemetry.noteSupply) MM.Telemetry.noteSupply(tier.id, choice.id);
    this.autosaveDirty = true;
    this.checkProgress();   // 一次挖掘可能连续跨过下一档门槛
  };

  MiningMode.prototype.supplyUseHint = function (choice) {
    const gain = (choice && choice.gain) || {};
    if (gain.stamina) return '体力用于继续挖掘';
    if (gain.bomb) return '点工具条里的炸药，再选目标格';
    if (gain.powerPick) return '点工具条里的强化矿镐，下一次挖掘不耗体力';
    if (gain.lamp) return '点工具条里的探矿灯扩大视野';
    return '';
  };

  MiningMode.prototype.onCellClick = function (cx, cy) {
    const run = this.run, map = this.map;
    if (run.state !== S.EXPLORING) return;
    const cell = map.get(cx, cy);
    if (!cell) return;

    /* 炸药瞄准中 */
    if (this.armedTool === 'bomb') {
      const res = MM.Tools.tryBomb(run, map, cx, cy);
      if (!res.ok) { MM.Audio.play('deny'); this.addMessage(res.message, '#ff9a6b', 2.2); return; }
      this.armedTool = null;
      MM.Audio.play('click');
      run.action = res;
      run.state = S.DIGGING;
      return;
    }

    /* 已挖开的工作台可再次交互；远处点击时先沿已挖道路前往。 */
    if (cell.specialType === 'workbench' && cell.excavated) {
      if (run.playerX === cx && run.playerY === cy) {
        this.openWorkbench();
        return;
      }
      /* 工作台格也是已挖通的道路。相邻点击时先走上工作台，再打开面板；
       * 关掉面板后，玩家可以从工作台继续免费穿过已挖格。 */
      const adjacent = MM.Move.isAdjacent(run, cx, cy);
      const walk = adjacent
        ? MM.Move.startStep(run, map, cx, cy)
        : MM.Move.startWalk(run, map, cx, cy);
      if (!walk.ok) { MM.Audio.play('deny'); this.addMessage(walk.message, '#ff9a6b', 2.2); return; }
      this.workbenchApproach = { x: cx, y: cy };
      run.state = S.MOVING;
      return;
    }

    /* 共鸣石：爆破只打开石头，不会启动能力。 */
    if (cell.specialType === 'resonanceStone' && !cell.excavated) {
      this.activateResonanceStone(cell);
      return;
    }

    /* 已发现泉水可留在地图上，玩家需要时再回来饮用。 */
    if (cell.specialType === 'spring' && cell.excavated && cell.springFound && !cell.springUsed) {
      if (MM.U.manhattan(run.playerX, run.playerY, cx, cy) <= 1) {
        if (cell.springDeferred) this.useSpring(cell);
        else this.modal = { type: 'springChoice', x: cx, y: cy, heal: cell.springHeal || 0 };
        return;
      }
      const walk = MM.Move.startWalk(run, map, cx, cy);
      if (!walk.ok) { MM.Audio.play('deny'); this.addMessage(walk.message, '#ff9a6b', 2.2); return; }
      this.springApproach = { x: cx, y: cy };
      run.state = S.MOVING;
      return;
    }
    if (cell.specialType === 'gateConsole' && cell.excavated && map.gate && !map.gate.resolved) {
      if (MM.U.manhattan(run.playerX, run.playerY, cx, cy) <= 1) {
        this.openGateChoice();
        return;
      }
      const walk = MM.Move.startWalk(run, map, cx, cy);
      if (!walk.ok) { MM.Audio.play('deny'); this.addMessage(walk.message, '#ff9a6b', 2.2); return; }
      this.gateApproach = { x: cx, y: cy };
      run.state = S.MOVING;
      return;
    }

    /* 矿车站 / 站点（V0.6 双向连接）：相邻就地弹窗；远处先自动走过去，到站再弹窗 */
    if (cell.excavated && (cell.specialType === 'minecart' || cell.specialType === 'cartStop')) {
      const onOrAdjacent = MM.U.manhattan(run.playerX, run.playerY, cx, cy) <= 1;
      if (!onOrAdjacent) {
        const res0 = MM.Move.startWalk(run, map, cx, cy);
        if (!res0.ok) { MM.Audio.play('deny'); this.addMessage(res0.message, '#ff9a6b', 2.2); return; }
        this.cartApproach = { x: cx, y: cy };
        run.state = S.MOVING;
        MM.Player.face(run, cx - run.playerX, cy - run.playerY);
        return;
      }
      this.openCartModal(cx, cy);
      return;
    }

    /* 已挖格：免费移动（相邻一步 / 远处自动寻路） */
    if (cell.excavated) {
      if (cx === run.playerX && cy === run.playerY) return;
      const adjacent = MM.Move.isAdjacent(run, cx, cy);
      const res = adjacent ? MM.Move.startStep(run, map, cx, cy) : MM.Move.startWalk(run, map, cx, cy);
      if (!res.ok) { MM.Audio.play('deny'); this.addMessage(res.message, '#ff9a6b', 2.2); return; }
      run.state = S.MOVING;
      MM.Player.face(run, cx - run.playerX, cy - run.playerY);
      return;
    }

    /* 未挖格：相邻 → 挖掘；不相邻 → 提示成本 */
    const res = MM.Dig.begin(run, map, cx, cy);
    if (!res.ok) {
      MM.Audio.play('deny');
      if (res.reason === 'notAdjacent') {
        this.addMessage('不相邻，需要先挖通道路 · ' + this.cellInfoText(cell), '#ffd75e', 2.6);
      } else {
        this.addMessage(res.message, '#ff9a6b', 2.6);
      }
      return;
    }
    run.action = res;
    run.state = S.DIGGING;
    MM.Player.face(run, cx - run.playerX, cy - run.playerY);
    MM.Audio.play('swing');
    if (res.usesFreePick) this.addMessage('强化矿镐生效：本次挖掘不消耗体力', '#9fe08a', 1.8);
  };

  /* ══════════════════ 动作 / 移动结算 ══════════════════ */
  MiningMode.prototype.updateAction = function (dt) {
    const run = this.run, map = this.map;
    const a = run.action;
    if (!a) return;
    if (a.t == null) a.t = 0;        // V0.8.3 防御：任何动作都必须从 0 开始计时
    a.t += dt;
    if (a.t < a.dur) return;

    if (a.kind === 'dig') {
      const events = MM.Dig.resolve(run, map, a);
      this.processEvents(events);
      run.action = null;
      this.checkProgress();
      const res = MM.Move.startStep(run, map, a.x, a.y);
      if (res.ok) { run.state = S.MOVING; return; }
      this.finishPending();
      return;
    }
    if (a.kind === 'bomb') {
      const events = MM.Tools.resolveBomb(run, map, a);
      if (MM.Telemetry) MM.Telemetry.noteTool('bomb');
      this.processEvents(events);
      run.action = null;
      this.checkProgress();
        this.finishPending();
        this.autosaveDirty = true;
      }
  };

  MiningMode.prototype.updateMovement = function (dt) {
    const run = this.run, map = this.map, T = MM.UI.LAYOUT.TILE;
    const evs = MM.Move.update(run, map, dt);
    let done = null;
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (ev.type === 'cartHop') {
        MM.Audio.play('cart');
        this.addMessage('经过矿车连接：跨过的岩块保持未挖', '#8fa3c4', 2.0);
      } else if (ev.type === 'arrive') {
        run.currentDepth = run.playerY;
        if (run.playerY > run.maxDepthReached) {
          run.maxDepthReached = run.playerY;
          this.checkDepthRecord();
        }
        MM.Vision.revealAround(map, run.playerX, run.playerY, MM.Vision.radius(run));
        this.effects.dust((run.playerX + 0.5) * T, (run.playerY + 0.5) * T + 8);
        if (MM.Telemetry) MM.Telemetry.noteDepth(run);
      } else if (ev.type === 'moveDone') {
        done = ev;
      }
    }
    if (done) {
      if (done.toEntrance && MM.Move.atEntrance(run, map)) {
        this.addMessage('已回到入口：可继续探索，或点「结束探索」按基础价值结算', '#9fe08a', 3);
      }
      if (this.cartApproach && run.playerX === this.cartApproach.x && run.playerY === this.cartApproach.y) {
        const c = this.cartApproach;
        this.cartApproach = null;
        this.openCartModal(c.x, c.y);
      }
      if (this.workbenchApproach && run.playerX === this.workbenchApproach.x && run.playerY === this.workbenchApproach.y) {
        this.workbenchApproach = null;
        this.openWorkbench();
      }
      if (this.springApproach && run.playerX === this.springApproach.x && run.playerY === this.springApproach.y) {
        const p = this.springApproach; this.springApproach = null;
        const cell = map.get(p.x, p.y);
        if (cell && cell.springFound && !cell.springUsed) {
          if (cell.springDeferred) this.useSpring(cell);
          else run.pendingSpring = { x: p.x, y: p.y, heal: cell.springHeal || 0 };
        }
      }
      if (this.gateApproach && run.playerX === this.gateApproach.x && run.playerY === this.gateApproach.y) {
        this.gateApproach = null;
        if (map.gate && !map.gate.resolved) run.pendingGate = true;
      }
      this.finishPending();
    }
  };

  MiningMode.prototype.finishPending = function () {
    const run = this.run;
    if (run.pendingTreasure) { this.startTreasureSequence(); return; }
    if (run.pendingDiscovery) { this.startRoomDiscovery(run.pendingDiscovery); return; }
    /* 移动 / 动作完成后再弹出的交互选择，必须先退出 MOVING / DIGGING。
     * 否则 move 已清空，弹窗关闭后 updateMovement 再也收不到 moveDone，输入永久锁住。 */
    run.state = S.EXPLORING;
    if (run.pendingSpring) { this.openSpringChoice(); return; }
    if (run.pendingGate) { run.pendingGate = false; this.openGateChoice(); return; }
    if (run.pendingWorkbench) {
      run.pendingWorkbench = false;
      this.openWorkbench();
      return;
    }
    if (run.pendingRoomChoice) {
      const choice = run.pendingRoomChoice;
      run.pendingRoomChoice = null;
      this.openWarehouseChoice(choice);
      return;
    }
    this.autosaveDirty = true;
  };

  MiningMode.prototype.openSpringChoice = function () {
    const spring = this.run.pendingSpring;
    if (!spring) return;
    this.run.pendingSpring = null;
    this.modal = { type: 'springChoice', x: spring.x, y: spring.y, heal: spring.heal };
  };

  MiningMode.prototype.chooseSpring = function (choice) {
    const m = this.modal;
    if (!m || m.type !== 'springChoice') return;
    const cell = this.map.get(m.x, m.y);
    if (!cell || cell.springUsed) { this.modal = null; return; }
    if (choice === 'later') {
      cell.springDeferred = true;
      this.modal = null;
      this.addMessage('泉水已保留：回到泉边时可再使用一次', '#7fd8ff', 2.5);
    } else {
      this.useSpring(cell);
      this.modal = null;
    }
    this.autosaveDirty = true;
  };

  MiningMode.prototype.useSpring = function (cell) {
    if (!cell || cell.specialType !== 'spring' || cell.springUsed || !cell.springFound) return false;
    const wanted = Math.max(0, Math.floor(cell.springHeal || 0));
    const before = this.run.stamina;
    this.run.stamina = Math.min(this.run.maxStamina, this.run.stamina + wanted);
    const actual = this.run.stamina - before;
    cell.springUsed = true;
    this.run.springUsed = true;
    MM.Audio.play('spring');
    this.effects.floatText((cell.x + 0.5) * MM.UI.LAYOUT.TILE,
      (cell.y + 0.5) * MM.UI.LAYOUT.TILE, '体力 +' + actual, '#7fd8ff', 26);
    this.effects.ring((cell.x + 0.5) * MM.UI.LAYOUT.TILE,
      (cell.y + 0.5) * MM.UI.LAYOUT.TILE, '#7fd8ff');
    MM.Progress.note(this.run, 'spring', '地下泉（恢复体力 +' + actual + '）');
    if (MM.Telemetry && !this.run.springTelemetryNoted) {
      MM.Telemetry.noteSpring(cell.y);
      this.run.springTelemetryNoted = true;
    }
    this.addMessage(actual ? '饮用泉水：体力 +' + actual : '饮用泉水：体力已满，本次没有恢复量', '#7fd8ff', 2.8);
    this.autosaveDirty = true;
    return true;
  };

  MiningMode.prototype.openGateChoice = function () {
    const gate = this.map.gate;
    if (!gate || gate.resolved) return;
    this.modal = { type: 'gateChoice' };
  };

  MiningMode.prototype.activateResonanceStone = function (cell) {
    const run = this.run;
    if (!cell || cell.specialType !== 'resonanceStone' || cell.excavated || cell.resonanceActivated) return false;
    if (MM.U.manhattan(run.playerX, run.playerY, cell.x, cell.y) !== 1) {
      this.addMessage('共鸣石只能从相邻格启动', '#8fa3c4', 2.0);
      return false;
    }
    if (run.stamina < 2) {
      MM.Audio.play('deny'); this.addMessage('启动共鸣石需要体力 2', '#ff9a6b', 2.0); return false;
    }
    run.stamina -= 2;
    run.stats.spentStamina = (run.stats.spentStamina || 0) + 2;
    run.stats.resonanceUses = (run.stats.resonanceUses || 0) + 1;
    cell.excavated = true; cell.revealed = true; cell.resonanceActivated = true;
    run.stats.excavatedCells = (run.stats.excavatedCells || 0) + 1;
    let reduced = 0;
    [[0,-1],[1,0],[0,1],[-1,0]].forEach((d) => {
      const neighbor = this.map.get(cell.x + d[0], cell.y + d[1]);
      if (!neighbor || neighbor.excavated || neighbor.resourceType || neighbor.roomId || neighbor.specialType
          || neighbor.terrainType !== 'rock') return;
      neighbor.digCost = Math.max(1, neighbor.digCost - 1);
      neighbor.resonanceReduced = true;
      reduced++;
    });
    MM.Vision.revealAround(this.map, cell.x, cell.y, MM.Vision.radius(run));
    MM.Audio.play('ore');
    this.effects.ring((cell.x + 0.5) * MM.UI.LAYOUT.TILE, (cell.y + 0.5) * MM.UI.LAYOUT.TILE, '#7fd8ff');
    this.addMessage('共鸣石启动：体力 -2 · 邻近普通岩层降为 1 体力（影响 ' + reduced + ' 格）', '#7fd8ff', 3.0);
    this.autosaveDirty = true;
    return true;
  };

  MiningMode.prototype.chooseGate = function (choice) {
    const gate = this.map.gate;
    if (!gate || gate.resolved || !this.modal || this.modal.type !== 'gateChoice') return;
    if (choice === 'repair') {
      if ((this.run.materials.copper || 0) < 2) {
        this.addMessage('铜料不足：修复机巧闸门需要铜 ×2', '#ff9a6b', 2.5);
        return;
      }
      this.run.materials.copper -= 2;
      gate.opened = true;
      gate.resolved = true;
      (gate.path || []).forEach((p) => {
        const c = this.map.get(p.x, p.y);
        if (!c) return;
        c.excavated = true;
        c.revealed = true;
        c.resourceType = null;
        c.resourceValue = 0;
        c.resourceGranted = true;
        if (c.specialType === 'gateBarrier') { c.gateOpen = true; c.specialType = 'gateOpen'; }
      });
      this.addMessage('闸门修复完成：侧路已打开，不会额外发放矿物', '#9fe08a', 3);
    } else if (choice === 'dismantle') {
      gate.resolved = true;
      this.run.materials.silver = (this.run.materials.silver || 0) + 1;
      this.run.stats.gatesDismantled = (this.run.stats.gatesDismantled || 0) + 1;
      this.addMessage('拆下闸门零件：银料 +1；闸门保持关闭', '#c9d6ec', 2.8);
    } else return;
    this.modal = null;
    this.autosaveDirty = true;
  };

  MiningMode.prototype.continueAfterTreasure = function () {
    if (!this.modal || this.modal.type !== 'treasureChoice') return;
    this.modal = null;
    this.treasureSeq = null;
    this.run.treasureContinued = true;
    this.run.state = S.EXPLORING;
    this.addMessage('继续探索：藏宝库奖励已记入本局，不会再次领取；当前矿坑与体力保持不变', '#ffd75e', 3.2);
    this.autosaveDirty = true;
  };

  MiningMode.prototype.openWorkbench = function () {
    if (!this.run || (this.run.state !== S.EXPLORING && this.run.state !== S.MOVING)) return;
    /* 挖开工作台后，角色会先自动踏入该格；到达回调仍处于 MOVING，
     * 打开交互时统一落回探索态，避免“已发现”但弹窗被状态门槛吞掉。 */
    this.run.state = S.EXPLORING;
    this.run.move = null;
    this.workbenchPage = 0;
    this.modal = { type: 'workbench' };
    MM.Audio.play('roomFound');
    if (this.tutorial && this.tutorial.guided && MM.Tutorial.onWorkbenchOpened) {
      MM.Tutorial.onWorkbenchOpened(this.tutorial);
      this.addMessage('工作台：查看矿料、追踪配方或制作改造', '#9fd0ff', 3.2);
    }
  };

  MiningMode.prototype.trackRecipe = function (index) {
    const r = MM.CRAFTING_RECIPES[index];
    if (!r) return;
    const res = MM.Crafting.track(this.run, r.id);
    if (!res.ok) { MM.Audio.play('deny'); return; }
    MM.Audio.play('click');
    this.addMessage('已追踪「' + r.name + '」：挖到所需矿料后可回工作台制作', '#9fd0ff', 2.8);
  };

  MiningMode.prototype.craftUpgrade = function (index) {
    const r = MM.CRAFTING_RECIPES[index];
    if (!r) return;
    const res = MM.Crafting.craft(this.run, r.id);
    if (!res.ok) {
      MM.Audio.play('deny');
      const reason = res.reason === 'materials' ? '矿料不足'
        : (res.reason === 'slots' ? '改造槽已满（每局最多 ' + MM.UPGRADE_SLOT_LIMIT + ' 件）'
          : (res.reason === 'owned' ? '本局已经制作过' : '当前无法制作'));
      this.addMessage(reason + '：' + r.name, '#ff9a6b', 2.4);
      return;
    }
    this.run.stats.craftsMade++;
    MM.Audio.play('chest');
    this.addMessage('制作完成：' + res.upgrade.name + ' · 已装备 ' + this.run.upgrades.length + '/' + MM.UPGRADE_SLOT_LIMIT, '#9fe08a', 3.2);
    if (this.tutorial && this.tutorial.guided && MM.Tutorial.onCrafted) MM.Tutorial.onCrafted(this.tutorial);
    this.autosaveDirty = true;
  };

  MiningMode.prototype.openWarehouseChoice = function (choice) {
    if (choice !== 'warehouse' || (this.run.roomChoices || {}).warehouse) return;
    const salvage = MM.Crafting.salvagePreview(this.run);
    this.modal = { type: 'warehouseChoice', salvage };
    MM.Audio.play('roomFound');
  };

  MiningMode.prototype.chooseWarehouse = function (choice) {
    if (!this.modal || this.modal.type !== 'warehouseChoice' || this.run.roomChoices.warehouse) return;
    this.run.roomChoices.warehouse = choice;
    const grantWarehouseRelic = () => {
      const relic = MM.Relics && MM.Relics.collect(this.run, 'carvedTag');
      if (relic) this.processEvents([{ type: 'relic', relic, x: this.run.playerX, y: this.run.playerY }]);
    };
    if (choice === 'supplies') {
      const loot = MM.Rooms.rollCache(this.run, 'supplyChest');
      const tools = loot.toolId ? ' · ' + MM.TOOLS[loot.toolId].name + ' +' + loot.toolCount : '';
      this.modal = null;
      this.autosaveDirty = true;
      MM.Audio.play('chest');
      this.addMessage('带走工具补给：探索价值 +' + loot.value + tools, '#ffd75e', 3.2);
      MM.Progress.note(this.run, 'cache', '仓库补给（+' + loot.value + ' 其他价值）');
      grantWarehouseRelic();
      return;
    }
    const bundle = MM.Crafting.salvage(this.run);
    this.run.stats.salvagedMaterials += Object.keys(bundle).reduce((sum, type) => sum + bundle[type], 0);
    this.modal = null;
    MM.Audio.play('chest');
    this.addMessage('拆解仓库材料：' + MM.Crafting.materialText(bundle) + '（不计入探索价值）', '#9fd0ff', 3.2);
    this.autosaveDirty = true;
    grantWarehouseRelic();
  };

  MiningMode.prototype.startRoomDiscovery = function (roomId) {
    const run = this.run;
    run.pendingDiscovery = null;
    run.state = S.ROOM_DISCOVERY;
    this.roomTimer = MM.BALANCE.ANIM.ROOM_BANNER_TIME;
    const name = (MM.ROOMS[roomId] || {}).name || roomId;
    this.setBanner('发现隐藏区域', name, '#ffd75e', MM.BALANCE.ANIM.ROOM_BANNER_TIME);
    this.effects.flash('rgba(255,215,94,0.30)', 0.4);
  };

  /* ══════════════════ 藏宝库正式发现演出（§44 / §81） ══════════════════
   * 最后一块岩壁破碎 → 镜头轻震 → 金色光线 → 藏宝库区域逐格点亮 → 玩家选择结算或继续 */
  MiningMode.prototype.startTreasureSequence = function () {
    const run = this.run, map = this.map, T = MM.UI.LAYOUT.TILE;
    run.pendingTreasure = false;
    run.state = S.TREASURE_DISCOVERY;
    this.treasureTimer = MM.BALANCE.ANIM.TREASURE_TIME;

    const v = map.vault;
    this.treasureSeq = {
      t: 0,
      cells: MM.Treasure.chamberCells(map),
      revealedIdx: 0,
      /* §81：首达 / 重复奖励在演出里就告诉玩家（结算时才真正入账） */
      preview: run.firstTreasureAtArrival
        ? { first: true, amount: MM.BALANCE.META_REWARD.FIRST_TREASURE }
        : { first: false, amount: MM.BALANCE.META_REWARD.REPEAT_TREASURE },
    };

    if (v) {
      map.get(v.x, v.y).revealed = true;
      this.effects.shake(9);                                 // 镜头重震：最后一块岩壁破碎
      MM.Audio.play('vaultBreak');
      this.effects.flash('rgba(255,255,255,0.70)', 0.28);
      this.effects.ring((v.x + 0.5) * T, (v.y + 0.5) * T, '#ffd75e');
      this.effects.burst((v.x + 0.5) * T, (v.y + 0.5) * T, '#c9b06a', 24, 140);
    }
  };

  MiningMode.prototype.updateTreasureSequence = function (dt) {
    const seq = this.treasureSeq;
    if (!seq) return;
    /* V0.7：若采矿补给三选一正打开，先暂停演出，等玩家选完再继续结算。 */
    if (this.modal) return;
    const sequenceTimings = MM.BALANCE.TREASURE_SEQ;
    const total = MM.BALANCE.ANIM.TREASURE_TIME;
    const T = MM.UI.LAYOUT.TILE;
    const v = this.map.vault;
    const prev = seq.t;
    seq.t += dt;
    const t = seq.t;
    this.treasureTimer = Math.max(0, total - t);
    const crossed = (mark) => prev < mark && t >= mark;

    /* 阶段②：碎壁之后的余震与落尘 */
    if (t > sequenceTimings.CRACK && t < sequenceTimings.LIGHT) {
      if (seq._dustAt == null || t - seq._dustAt > 0.18) {
        seq._dustAt = t;
        if (v) this.effects.dust((v.x + 0.5) * T, (v.y + 0.9) * T);
      }
    }

    /* 阶段③：金色光线射出 */
    if (crossed(sequenceTimings.SHAKE) && v) {
      MM.Audio.play('rays');
      this.effects.flash('rgba(255,215,94,0.55)', 0.5);
      this.effects.shake(6);
      this.effects.ring((v.x + 0.5) * T, (v.y + 0.5) * T, '#ffd75e');
    }

    /* 阶段④：藏宝库区域逐格点亮（§44） */
    if (t > sequenceTimings.LIGHT && seq.cells.length) {
      const p = MM.U.clamp((t - sequenceTimings.LIGHT) / Math.max(0.01, sequenceTimings.REVEAL - sequenceTimings.LIGHT), 0, 1);
      const want = Math.ceil(p * seq.cells.length);
      while (seq.revealedIdx < want && seq.revealedIdx < seq.cells.length) {
        const cell = seq.cells[seq.revealedIdx++];
        cell.revealed = true;
        if (seq.revealedIdx % 2 === 0) MM.Audio.play('ore', 3);
        this.effects.tileFlash(cell.x, cell.y, 'rgba(255,215,94,0.9)');
        this.effects.burst((cell.x + 0.5) * T, (cell.y + 0.5) * T, '#ffd75e', 5, 70);
      }
    }

    /* 阶段⑤：发现横幅 + 首达 / 重复奖励预告 */
    if (crossed(sequenceTimings.REVEAL)) {
      const pv = seq.preview || { first: true, amount: MM.BALANCE.META_REWARD.FIRST_TREASURE };
      MM.Audio.play('treasure');
      this.setBanner(
        '发现魔王军地下藏宝库！',
        (pv.first ? '首次发现奖励：通用货币 +' + pv.amount : '重复抵达奖励：通用货币 +' + pv.amount)
          + ' · 本局可以结算，也可以继续探索',
        '#ffd75e', Math.max(0.8, total - sequenceTimings.REVEAL + 0.4)
      );
      this.effects.shake(5);
      this.effects.flash('rgba(255,215,94,0.30)', 0.4);
      if (v) this.effects.burst((v.x + 0.5) * T, (v.y + 0.5) * T, '#fff0a0', 16, 110);
    }

    /* 阶段⑥：演出结束 → 交由玩家选择结算或继续探索。 */
    if (t >= total) {
      this.treasureSeq = null;
      this.treasureTimer = 0;
      this.run.state = MM.State.S.EXPLORING;
      this.modal = { type: 'treasureChoice', preview: seq.preview || null };
      this.autosaveDirty = true;
    }
  };

  /* ══════════════════ 矿车（§36 / §37；V0.6 双向连接） ══════════════════ */
  MiningMode.prototype.openCartModal = function (x, y) {
    const map = this.map;
    const cell = map.get(x, y);
    if (!cell || !cell.excavated) return;
    if (cell.specialType !== 'minecart' && cell.specialType !== 'cartStop') return;
    const to = MM.Cart.partnerOf(map, cell);
    if (!to) { this.addMessage('这辆矿车暂时动不了（轨道两端还没接通）', '#ff9a6b', 2.2); return; }
    /* V0.7.1：把"跳过的代价"算出来（当前地图状态下沿最短路径还有多少未挖矿物） */
    const skip = MM.Cart.skippedInfo(map);
    this.modal = {
      type: 'minecart', x, y,
      from: { x: x, y: y },
      to: { x: to.x, y: to.y },
      dir: cell.specialType === 'minecart' ? 'forward' : 'back',
      skip: skip || { cells: [], count: 0, value: 0 },
    };
    this.cartPreview = skip && skip.cells ? skip.cells.slice() : null;
    const relic = MM.Relics && MM.Relics.collect(this.run, 'tornMap');
    if (relic) this.processEvents([{ type: 'relic', relic, x, y }]);
    MM.Audio.play('roomFound');
    this.tipOnce('cart', '金色虚线框 = 矿车会跳过的矿物格；跳过数字随已挖进度实时变化', '#ffd75e', 4.0);
  };

  /* 乘坐矿车：双向免费，跳过沿途矿物（跨过的岩块保持未挖） */
  MiningMode.prototype.rideMinecart = function () {
    const run = this.run, map = this.map;
    const m = this.modal;
    if (!m || m.type !== 'minecart') return;   // 防御：补给三选一等其它弹窗不得误触发乘车
    this.modal = null;
    this.cartPreview = null;
    const fromCell = map.get(m.x, m.y);
    if (!fromCell) return;
    const before = run.playerY;

    const res = MM.Cart.ride(run, map, fromCell);
    if (!res.ok) { this.addMessage('轨道已经塌了，矿车动不了', '#ff9a6b', 2.4); return; }
    /* V0.8.3：把"这次跳过多少"累计进本局取舍记录（结算页展示） */
    const skipNow = MM.Cart.skippedInfo(map) || { count: 0, value: 0 };
    run.stats.skippedMineralCount = (run.stats.skippedMineralCount || 0) + skipNow.count;
    run.stats.skippedMineralValue = (run.stats.skippedMineralValue || 0) + skipNow.value;
    MM.Audio.play('cart');
    if (res.events && res.events.length) this.processEvents(res.events);
    if (MM.Telemetry) MM.Telemetry.noteCart();
    run.move = null;
    run.action = null;
    run.state = S.EXPLORING;
    this.autosaveDirty = true;
    this.checkDepthRecord();
    this.camY = this.camTarget = this.clampCam(this.playerWorldY() - this.viewH() * 0.42);
    const T = MM.UI.LAYOUT.TILE;
    this.effects.shake(6);
    this.effects.dust((res.to.x + 0.5) * T, (res.to.y + 0.5) * T);
    const delta = res.to.y - before;
    const dirText = m.dir === 'back' ? '返回矿车站' : '向深处推进';
    this.addMessage('矿车飞驰：' + dirText + ' ' + (delta >= 0 ? '+' : '') + delta + 'm（沿途矿物已跳过）', '#ffd75e', 3.2);
  };

  MiningMode.prototype.settle = function (kind) {
    if (this.run.settled) return;
    this.run.move = null;
    this.run.action = null;
    this.run.pendingDiscovery = null;
    this.run.pendingTreasure = false;
    this.run.pendingWorkbench = false;
    this.run.pendingRoomChoice = null;
    this.treasureSeq = null;          // 演出收尾（镜头缩放复位）
    this.modal = null;
    this.cartPreview = null;
    if (kind !== 'treasure') MM.Audio.play('click');
    const summary = MM.Reward.settle(this.run, this.save, kind, this.map);
    if (MM.Telemetry) MM.Telemetry.finish(this.run, summary, kind);
  };

  /* V0.7.1：复制本局 Seed 作为挑战串（新一局可在标题页「输入 Seed 挑战」复现） */
  MiningMode.prototype.copySeedLink = function () {
    const seed = this.run.seed;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        const p = navigator.clipboard.writeText(seed);
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { /* 剪贴板不可用时只显示提示 */ }
    if (MM.Audio) MM.Audio.play('click');
    this.exportMsg = '挑战 Seed：' + seed + '（已尝试复制）· 新一局可在标题页输入它';
    this.exportMsgT = 5;
  };

  MiningMode.prototype.processEvents = function (events) {
    const T = MM.UI.LAYOUT.TILE;
    const run = this.run;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const wx = (ev.x + 0.5) * T, wy = (ev.y + 0.5) * T;
      switch (ev.type) {
        case 'resource': {
          const def = MM.RESOURCES[ev.mineral];
          MM.Audio.play('ore', ev.value >= 35 ? 3 : (ev.value >= 20 ? 2 : (ev.value >= 10 ? 1 : 0)));
          this.effects.floatText(wx, wy, '+' + ev.value, def.glow, ev.value >= 20 ? 26 : 21);
          this.effects.burst(wx, wy, def.color, ev.value >= 20 ? 10 : 6, 80);
          /* V0.7：矿物是"本局采矿进度"的唯一来源；反馈里始终带上距下档补给差多少 */
          MM.Progress.note(run, 'mineral', def.name);
          const st = MM.Progress.status(run);
          const remain = st.tier
            ? '距「' + st.tierName + '」还差 ' + st.remaining + ' 矿物价值'
            : '本局补给已全部领取';
          const stock = run.materials[ev.mineral] || 0;
          this.addMessage(def.name + ' +' + ev.value + ' · 可用' + def.name + ' ' + stock
            + ' · 采矿 ' + st.mineValue + ' / ' + (st.need || st.mineValue) + '（' + remain + '）', def.glow, 2.8);
          break;
        }
        case 'dug': {
          const t = MM.terrainDef(ev.terrain);
          this.effects.tileFlash(ev.x, ev.y);
          this.effects.burst(wx, wy, t.base, 8, 70);
          break;
        }
        case 'spring':
          /* 旧事件兼容：泉水现在只登记，必须由玩家选择饮用时机。 */
          run.pendingSpring = { x: ev.x, y: ev.y, heal: ev.heal || 0 };
          break;
        case 'springFound':
          run.pendingSpring = { x: ev.x, y: ev.y, heal: ev.heal || 0 };
          this.addMessage('发现地下泉：可立即饮用，或留到需要时再用一次', '#7fd8ff', 2.6);
          break;
        case 'gateConsoleFound':
          run.pendingGate = true;
          this.addMessage('发现机巧控制台：用铜修复侧路，或拆下零件换取银料', '#ffd75e', 2.8);
          break;
        case 'relic':
          if (ev.relic) {
            MM.Audio.play('treasure');
            this.effects.ring(wx, wy, '#c9b06a');
            this.setBanner('矿坑遗物 · ' + ev.relic.name, ev.relic.desc + ' · 已写入探索档案', '#c9b06a', 3.4);
            const haveRelics = MM.Save.relicCount ? MM.Save.relicCount() : 0;
            this.addMessage('遗物「' + ev.relic.name + '」已收集（' + haveRelics + ' / ' + MM.Relics.total() + '）', '#c9b06a', 3.8);
            MM.Progress.note(run, 'relic', '遗物：' + ev.relic.name);
            this.autosaveDirty = true;
          }
          break;
        case 'cache': {
          MM.Audio.play('chest');
          this.effects.floatText(wx, wy, '+' + ev.value, '#ffd75e', 24);
          this.effects.ring(wx, wy, '#ffd75e');
          const toolText = ev.toolId ? ' · ' + MM.TOOLS[ev.toolId].name + ' ×' + ev.toolCount : '';
          this.addMessage(ev.name + '：+探索价值 ' + ev.value + toolText, '#ffd75e', 3.0);
          MM.Progress.note(run, 'cache', ev.name + '（+其他价值 ' + ev.value + '）');
          if (ev.relic) {
            MM.Audio.play('treasure');
            this.effects.ring(wx, wy, '#c9b06a');
            this.setBanner('矿坑遗物 · ' + ev.relic.name, ev.relic.desc + ' · 已写入探索档案', '#c9b06a', 3.4);
            const haveRelics = MM.Save.relicCount ? MM.Save.relicCount() : 0;
            this.addMessage('遗物「' + ev.relic.name + '」已收集（' + haveRelics + ' / ' + MM.Relics.total() + '）', '#c9b06a', 3.8);
            MM.Progress.note(run, 'relic', '遗物：' + ev.relic.name);
          }
          if (ev.roomId) run.pendingDiscovery = ev.roomId;
          break;
        }
        case 'minecartFound':
          MM.Audio.play('roomFound');
          MM.Progress.note(run, 'cart', '矿车站（可乘车）');
          this.openCartModal(ev.x, ev.y);
          break;
        case 'warehouseChoice':
          MM.Progress.note(run, 'room', '仓库补给：工具或制作矿料二选一');
          run.pendingRoomChoice = 'warehouse';
          break;
        case 'workbenchFound':
          MM.Progress.note(run, 'room', '工作台：用本局矿料制作局内改造');
          run.pendingWorkbench = true;
          break;
        case 'chainOre':
          this.addMessage('连脉镐触发：额外采集一格相邻同类矿', '#9fd0ff', 2.2);
          break;
        case 'excavated': {
          const cell2 = this.map.get(ev.x, ev.y);
          if (ev.source === 'dig' && MM.Tutorial.onExcavated) {
            const step = MM.Tutorial.onExcavated(this.tutorial, cell2);
            if (step && step.message) this.addMessage(step.message, '#9fd0ff', 3.2);
          }
          if (cell2) {
            if (cell2.branchId) {
              const br = (this.map.branches || []).find((b) => (b.cells || []).some((c) => c.x === ev.x && c.y === ev.y));
              if (MM.Telemetry) MM.Telemetry.noteBranch(cell2.branchId, br ? br.tier : 'unknown', ev.y);
              /* V0.8.3：本局取舍记录（岔路去重，结算页展示） */
              run.branchSeen = run.branchSeen || {};
              if (!run.branchSeen[cell2.branchId]) {
                run.branchSeen[cell2.branchId] = 1;
                run.stats.branchLog = run.stats.branchLog || [];
                run.stats.branchLog.push({ branchId: cell2.branchId, tier: br ? br.tier : 'unknown', y: ev.y });
              }
            }
            if (cell2.roomId && MM.Telemetry) MM.Telemetry.noteRoom(cell2.roomId);
          }
          break;
        }
        case 'roomFound':
          MM.Progress.note(run, 'room', '发现：' + (ev.name || (MM.ROOMS[ev.roomId] || {}).name || ev.roomId));
          if (ev.roomId === 'treasure') this.addMessage('藏宝库入口被打通！', '#ffd75e', 2.5);
          break;
        case 'bomb':
          MM.Audio.play('bomb');
          this.effects.ring(wx, wy, '#ff9a6b');
          this.effects.shake(7);
          this.addMessage('炸药爆炸：' + (ev.shape === 'line' ? '直线' : '十字') + '范围 ' + ev.cells.length + ' 格', '#ff9a6b', 2.0);
          if (this.tutorial && this.tutorial.guided && MM.Tutorial.onToolUsed
              && MM.Tutorial.onToolUsed(this.tutorial, 'bomb')) {
            this.addMessage('基础操作教学完成：从这里继续探索，或结束本局返回标题', '#9fe08a', 3.0);
          }
          break;
        case 'treasureReached':
          this.save.markTreasureArrival(run, this.map, { x: ev.x, y: ev.y });
          run.pendingTreasure = true;
          MM.Progress.note(run, 'treasure', '藏宝库入口（已抵达）');
          break;
        case 'lampDig':
          if (ev.remaining === 0) {
            MM.Audio.play('click');
            this.addMessage('探矿灯效果结束，视野恢复 3', '#8fa3c4', 2.0);
          }
          break;
        case 'drillUsed':
          this.addMessage('硬岩钻头：本次节省 1 体力 · 剩余 ' + ev.remaining + ' 次', '#9fd0ff', 2.2);
          break;
        case 'recoveryPick':
          MM.Audio.play('chest');
          this.addMessage('回收套件：爆破采出多格矿物，强化矿镐 +' + ev.amount + ' · 剩余触发 ' + ev.remaining + ' 次', '#9fe08a', 2.8);
          break;
        case 'afterglowHeal':
          if (ev.amount > 0) this.addMessage('余辉灯芯：发现新区域，体力 +' + ev.amount + ' · 剩余 ' + ev.remaining + ' 次', '#7fd8ff', 2.4);
          break;
        default:
          break;
      }
    }
  };

  MiningMode.prototype.checkDepthRecord = function () {
    const run = this.run;
    if (run.tutorialRun) return;
    if (this.prevBestDepth > 0 && !run.recordAnnounced && run.currentDepth > this.prevBestDepth) {
      run.recordAnnounced = true;
      MM.Audio.play('record');
      this.setBanner('新纪录！' + run.currentDepth + 'm', '超过历史最深 ' + this.prevBestDepth + 'm', '#ffd75e', 1.6);
    }
  };

  /* ══════════════════ 文案 / 横幅 ══════════════════ */
  MiningMode.prototype.addMessage = function (text, color, dur) {
    this.messages.push({ text, color: color || '#e8eef8', left: dur || 2, dur: dur || 2, t: 0 });
    if (this.messages.length > 6) this.messages.shift();
  };

  MiningMode.prototype.setBanner = function (title, sub, color, dur) {
    this.banner = { title, sub, color: color || '#ffd75e', dur: dur || 1.6, t: 0 };
  };

  MiningMode.prototype.cellInfoText = function (cell) {
    if (!cell) return '';
    if (!cell.revealed && !(this.panel && this.panel.showAll)) return '未探索区域（黑暗迷雾）';
    if (cell.excavated) {
      if (cell.specialType === 'resonanceStone') return cell.resonanceActivated
        ? '已启动的共鸣石 · 邻近普通岩层已减免 1 点体力' : '未启动的共鸣石';
      if (cell.specialType === 'gateConsole') return this.map.gate && this.map.gate.resolved
        ? '机巧控制台 · 已处理' : '机巧控制台 · 相邻时点击，选择修复或拆解';
      if (cell.specialType === 'gateBarrier' && !cell.gateOpen) return '机巧闸门 · 关闭中，不能挖掘或爆破';
      if (cell.specialType === 'minecart') {
        const to = MM.Cart.partnerOf(this.map, cell);
        return '废弃矿车站 · 点击可乘坐前往 ' + (to ? to.y + 'm' : '深处') + '（免费 · 跳过沿途矿物）';
      }
      if (cell.specialType === 'cartStop') {
        const to = MM.Cart.partnerOf(this.map, cell);
        return '矿车站点 · 点击可乘坐返回 ' + (to ? to.y + 'm 处车站' : '车站') + '（免费 · 跳过沿途矿物）';
      }
      return '已挖开 · 点击可自动寻路移动（免费）';
    }
    const t = MM.terrainDef(cell.terrainType);
    let s = t.name + ' · 消耗 ' + t.digCost + ' 体力';
    if (cell.resourceType) {
      const def = MM.RESOURCES[cell.resourceType];
      s += ' · ' + def.name + ' 价值 ' + def.value;
    }
    if (cell.specialType === 'spring') s += cell.springFound
      ? ' · 地下泉（可选择现在饮用或留待之后）' : ' · 地下泉（发现后选择现在饮用或留待之后）';
    if (cell.specialType === 'resonanceStone') s += ' · 共鸣石（相邻点击启动，消耗 2 体力并降低附近普通岩层成本）';
    if (cell.specialType === 'gateConsole') s += ' · 机巧控制台（修复侧路需铜 ×2，或拆解获得银 +1）';
    if (cell.specialType === 'gateBarrier' && !cell.gateOpen) s += ' · 关闭的机巧闸门（无法挖掘或爆破）';
    if (cell.specialType === 'chest') s += ' · 宝箱';
    if (cell.specialType === 'warehouseChoice') s += ' · 仓库补给（工具 / 矿料二选一）';
    if (cell.specialType === 'workbench') s += ' · 工作台（制作局内改造）';
    if (cell.specialType === 'vaultEntrance') s += ' · 藏宝库入口';
    if (cell.clueType) s += ' · 线索：' + (MM.CLUE_STYLES[cell.clueType] || {}).name;
    return s;
  };

  MiningMode.prototype.hintText = function () {
    if (this.run.state === S.RESULT) return '';
    if (this.tutorial && this.tutorial.guided) return MM.Tutorial.guideText(this.tutorial, this.map, this.run);
    if (this.modal) {
      if (this.modal.type === 'supply') return '采矿达标：点选一份补给（立即生效 · 每档只发一次）';
      if (this.modal.type === 'workbench') return '工作台：制作会消耗“可用矿料”，不会减少采矿进度；每局最多装备两件改造';
      if (this.modal.type === 'warehouseChoice') return '废弃仓库：选择立刻能用的工具补给，或为追踪配方拆取矿料';
      if (this.modal.type === 'springChoice') return '地下泉：选择现在恢复体力，或留到稍后使用一次';
      if (this.modal.type === 'gateChoice') return '机巧闸门：可选侧路，不处理也能沿主路线继续';
      if (this.modal.type === 'treasureChoice') return '藏宝库：选择结算，或保留当前状态继续探索';
      return '矿车抉择：乘坐免费（会跳过沿途矿物，跨过的岩块保持未挖），或暂不乘坐';
    }
    if (this.armedTool === 'bomb') return MM.Upgrades.has(this.run, 'directionalBomb')
      ? '瞄准中：直线爆破预览以目标与矿工的方向为轴；再点炸药按钮取消'
      : '瞄准中：点选目标格及上下左右（最多 5 格），再点炸药按钮取消';
    if (this.hoverCell) {
      const cell = this.map.get(this.hoverCell.x, this.hoverCell.y);
      const info = this.cellInfoText(cell);
      if (info) return info;
    }
    if (this.run.state === S.EXPLORING) {
      return '点击相邻岩块挖掘 · 已挖道路移动免费（可经过矿车连接）· 任意位置可结束探索结算';
    }
    return '';
  };

  /* ══════════════════ 调试指令（§75） ══════════════════ */
  MiningMode.prototype.debugAction = function (id) {
    switch (id) {
      case 'stamina10': this.debugAddStamina(10); break;
      case 'stamina1': this.debugSetStamina(1); break;
      case 'stamina50': this.debugSetStamina(this.run.maxStamina); break;
      case 'giveBomb': this.debugGiveTool('bomb'); break;
      case 'givePick': this.debugGiveTool('powerPick'); break;
      case 'giveLamp': this.debugGiveTool('lamp'); break;
      case 'showAll': this.panel.showAll = true; break;
      case 'hideAll': this.panel.showAll = false; break;
      case 'togglePath': this.panel.showPath = !this.panel.showPath; break;
      case 'toggleBranches': this.panel.showBranches = !this.panel.showBranches; break;
      case 'teleport10': this.debugTeleport(10); break;
      case 'teleportBottom': this.debugTeleport(this.map.h - 3); break;
      case 'addValue':
        MM.Resources.addValue(this.run, 100, 'debug');
        this.addMessage('调试：探索价值 +100', '#ffd75e', 1.8);
        break;
      case 'vault': this.debugRevealVault(); break;
      case 'regen': this.debugRegenerate(null); break;
      case 'mapToggle': this.debugToggleMapSize(); break;
      case 'exportPlaytest': MM.Telemetry.exportAll(); break;
      case 'clearPlaytest': MM.Telemetry.clear(); break;
      case 'seedInput': this.debugSeedInput(); break;
      case 'reset': this.debugResetSave(); break;
      default: break;
    }
    return true;
  };

  MiningMode.prototype.debugAddStamina = function (n) {
    const run = this.run;
    run.stamina = Math.min(run.maxStamina, run.stamina + n);
    this.addMessage('调试：体力 +' + n + '（当前 ' + run.stamina + '）', '#9fe08a', 1.8);
  };

  MiningMode.prototype.debugSetStamina = function (v) {
    this.run.stamina = MM.U.clamp(Math.round(v), 0, this.run.maxStamina);
    this.addMessage('调试：体力 = ' + this.run.stamina, '#9fe08a', 1.8);
  };

  MiningMode.prototype.debugGiveTool = function (id) {
    this.run.tools[id] = (this.run.tools[id] || 0) + 1;
    this.addMessage('调试：' + MM.TOOLS[id].name + ' +1（现有 ' + this.run.tools[id] + '）', '#9fe08a', 1.8);
  };

  MiningMode.prototype.debugTeleport = function (y) {
    const map = this.map, run = this.run;
    const row = MM.U.clamp(Math.round(y), 1, map.h - 1);
    const candidates = [];
    const route = map.mainRoutePath[row];
    if (route) candidates.push(map.get(route.x, row));
    for (let x = 0; x < map.w; x++) candidates.push(map.get(x, row));

    let cell = null;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c && !c.specialType && !c.roomId) { cell = c; break; }
    }
    if (!cell) { this.addMessage('调试：该深度没有可传送的普通格', '#ff9a6b', 2); return; }

    cell.excavated = true;      // 调试专用：只挖开落脚格，不结算任何资源
    cell.revealed = true;
    run.move = null;
    run.action = null;
    run.playerX = cell.x;
    run.playerY = cell.y;
    run.currentDepth = cell.y;
    run.maxDepthReached = Math.max(run.maxDepthReached, cell.y);
    MM.Vision.revealAround(map, cell.x, cell.y, MM.Vision.radius(run));
    run.state = S.EXPLORING;
    this.camY = this.camTarget = this.clampCam(this.playerWorldY() - this.viewH() * 0.42);
    this.addMessage('调试：已传送到 ' + cell.y + 'm（周围未挖通，仅供测试）', '#ffd75e', 2.5);
  };

  MiningMode.prototype.debugRevealVault = function () {
    const map = this.map;
    if (!map.vault) {
      MM.Generator.placeVault(map, MM.RNG.create(this.run.seed + '#vault'));
      this.addMessage('调试：已补生成藏宝库入口', '#ffd75e', 2);
    }
    const v = map.vault;
    const cell = map.get(v.x, v.y);
    if (cell) cell.revealed = true;
    MM.Vision.revealAround(map, v.x, v.y, 2);
    MM.Treasure.chamberCells(map).forEach((c) => { c.revealed = true; });   // 调试：直接点亮藏宝室
    this.addMessage('调试：藏宝库入口已揭示 · (' + v.x + ', ' + v.y + ') · 深度 ' + v.y + 'm', '#ffd75e', 3);
  };

  MiningMode.prototype.debugRegenerate = function (seed) {
    const ns = (seed != null && String(seed).length) ? String(seed) : MM.newSeed();
    this.newRun(ns);
    this.addMessage('调试：已按 Seed「' + ns + '」重新生成地图', '#ffd75e', 3);
  };

  /* §79：9×20 ↔ 9×45 一键切换（调试用，方便对照 V0.1 / 正式尺寸） */
  MiningMode.prototype.debugToggleMapSize = function () {
    const cur = (this.map.spec && this.map.spec.id) || MM.BALANCE.DEFAULT_MAP;
    /* 正式尺寸现在以旧矿井 mineId 启动；调试切换需把它视为 full 的别名，
     * 但切回正式图时仍使用正常可选矿区 id，不能启动一个未定义的 full 矿区。 */
    const other = cur === 'v01' ? 'oldMine' : 'v01';
    const ns = MM.newSeed();
    const spec = MM.mapSpec(other);
    this.newRun(ns, other);
    this.addMessage('调试：已切换到 ' + spec.name + ' · Seed ' + ns, '#ffd75e', 3);
  };

  MiningMode.prototype.debugSeedInput = function () {
    let s = null;
    try {
      if (typeof window !== 'undefined' && window.prompt) {
        s = window.prompt('输入要复现的 Seed（同一个 Seed 生成同一张地图）：', this.seed);
      }
    } catch (e) { s = null; }
    if (s != null && String(s).trim().length) this.debugRegenerate(String(s).trim());
    else this.addMessage('已取消 Seed 输入', '#8fa3c4', 1.6);
  };

  MiningMode.prototype.debugResetSave = function () {
    MM.Save.resetMining();
    this.prevBestDepth = MM.Save.records().bestDepth;
    this.addMessage('调试：矿坑纪录已清空（账号级通用货币保留）', '#ffd75e', 2.5);
  };

  /* ══════════════════ 渲染 ══════════════════ */
  MiningMode.prototype.draw = function (ctx) {
    const L = MM.UI.LAYOUT;
    ctx.fillStyle = '#0d1019';
    ctx.fillRect(0, 0, L.W, L.H);

    /* §81：演出期间镜头围绕藏宝库入口轻微推近，演出结束立即复位 */
    const seq = this.treasureSeq;
    let zoom = 1;
    if (this.run.state === S.TREASURE_DISCOVERY && seq) {
      const p = MM.U.clamp(seq.t / MM.BALANCE.TREASURE_SEQ.REVEAL, 0, 1);
      zoom = 1 + 0.055 * Math.sin(Math.PI * p);
    }
    if (zoom > 1.001 && this.map.vault) {
      const T = MM.UI.LAYOUT.TILE;
      const pv = this.worldToScreen((this.map.vault.x + 0.5) * T, (this.map.vault.y + 0.5) * T);
      ctx.save();
      ctx.translate(pv.x, pv.y);
      ctx.scale(zoom, zoom);
      ctx.translate(-pv.x, -pv.y);
      MM.UI.drawMap(ctx, this);
      ctx.restore();
    } else {
      MM.UI.drawMap(ctx, this);
    }
    MM.UI.drawTop(ctx, this);
    MM.UI.drawRuler(ctx, this);
    MM.UI.drawBottom(ctx, this);
    MM.UI.drawBanners(ctx, this);
    if (this.modal) {
      if (this.modal.type === 'supply') MM.UI.drawSupplyModal(ctx, this);
      else if (this.modal.type === 'workbench') MM.UI.drawWorkbenchModal(ctx, this);
      else if (this.modal.type === 'warehouseChoice') MM.UI.drawWarehouseChoiceModal(ctx, this);
      else if (this.modal.type === 'springChoice') MM.UI.drawSpringChoiceModal(ctx, this);
      else if (this.modal.type === 'gateChoice') MM.UI.drawGateChoiceModal(ctx, this);
      else if (this.modal.type === 'treasureChoice') MM.UI.drawTreasureChoiceModal(ctx, this);
      else if (this.modal.type === 'upgradeInfo') MM.UI.drawUpgradeInfoModal(ctx, this);
      else MM.UI.drawCartModal(ctx, this);
    }

    if (this.run.state === S.TREASURE_DISCOVERY) MM.UI.drawTreasureOverlay(ctx, this);
    this.effects.drawFlash(ctx, L.W, L.H);

    if (this.run.state === S.RESULT) MM.UI.drawSettlement(ctx, this);
    if (this.panel) this.panel.draw(ctx, this);
    if (this.run.state === S.ENTERING) MM.UI.drawEntering(ctx, this);
    if (this.tutorial && this.tutorial.open) MM.UI.drawTutorial(ctx, this);
    else if (this.tutorial && this.tutorial.guided && !this.modal && this.run.state === S.EXPLORING) {
      MM.UI.drawTutorialGuide(ctx, this);
    }
    if (this.settingsOpen) MM.UI.drawSettings(ctx, this);
  };

  MM.MiningMode = MiningMode;
})();
