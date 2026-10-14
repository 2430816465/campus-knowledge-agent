/* 标题 / 探索档案 / 遗物图鉴：以矿坑正式瓦片和项目调色板构成入口。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  function pixelGear(ctx, rect) {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    ctx.fillStyle = '#5c3b21';
    ctx.fillRect(cx - 4, cy - 17, 8, 6); ctx.fillRect(cx - 4, cy + 11, 8, 6);
    ctx.fillRect(cx - 17, cy - 4, 6, 8); ctx.fillRect(cx + 11, cy - 4, 6, 8);
    ctx.fillRect(cx - 12, cy - 12, 7, 6); ctx.fillRect(cx + 5, cy - 12, 7, 6);
    ctx.fillRect(cx - 12, cy + 6, 7, 6); ctx.fillRect(cx + 5, cy + 6, 7, 6);
    ctx.fillStyle = '#a47b50'; ctx.fillRect(cx - 10, cy - 10, 20, 20);
    ctx.fillStyle = '#f7e8ce'; ctx.fillRect(cx - 5, cy - 5, 10, 10);
    ctx.fillStyle = '#5c3b21'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
  }

  function speaker(ctx, rect, enabled) {
    /* 以完整图标组（喇叭 + 声波/静音符号）的视觉边界居中。 */
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const x = Math.round(cx - 15), y = Math.round(cy - 16);
    ctx.fillStyle = '#5c3b21';
    ctx.fillRect(x + 1, y + 10, 7, 13); ctx.fillRect(x + 8, y + 6, 5, 21); ctx.fillRect(x + 13, y + 2, 6, 29);
    if (enabled) {
      ctx.strokeStyle = '#815a32'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 22, y + 8); ctx.lineTo(x + 27, y + 13);
      ctx.lineTo(x + 27, y + 20); ctx.lineTo(x + 22, y + 25); ctx.stroke();
    } else {
      ctx.fillStyle = '#a84832'; ctx.fillRect(x + 22, y + 8, 3, 18); ctx.fillRect(x + 19, y + 12, 10, 3); ctx.fillRect(x + 19, y + 21, 10, 3);
    }
  }

  function drawRoleIcon(ctx, id, x, y, size) {
    if (id === 'miner') {
      if (MM.Assets) MM.Assets.drawIcon(ctx, 8, x, y, size);
      return;
    }
    if (id === 'explorer') {
      const p = size / 48;
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(p, p);
      ctx.beginPath(); ctx.arc(24, 25, 19, 0, Math.PI * 2);
      ctx.fillStyle = '#101925'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#b77b32'; ctx.stroke();
      ctx.beginPath(); ctx.arc(24, 25, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#dce6e9'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#f2d58b'; ctx.stroke();
      ctx.fillStyle = '#697b8a';
      ctx.fillRect(23, 12, 2, 4); ctx.fillRect(23, 34, 2, 4);
      ctx.fillRect(11, 24, 4, 2); ctx.fillRect(33, 24, 4, 2);
      ctx.beginPath(); ctx.moveTo(24, 12); ctx.lineTo(28, 26); ctx.lineTo(24, 23); ctx.closePath();
      ctx.fillStyle = '#cf4637'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(24, 38); ctx.lineTo(20, 24); ctx.lineTo(24, 27); ctx.closePath();
      ctx.fillStyle = '#315f91'; ctx.fill();
      ctx.beginPath(); ctx.arc(24, 25, 3, 0, Math.PI * 2); ctx.fillStyle = '#f4c553'; ctx.fill();
      ctx.beginPath(); ctx.arc(24, 5, 5, 0, Math.PI * 2); ctx.fillStyle = '#111925'; ctx.fill();
      ctx.beginPath(); ctx.arc(24, 5, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#e3b850'; ctx.fill();
      ctx.fillStyle = '#9b632b'; ctx.fillRect(22, 8, 4, 4);
      ctx.restore();
      return;
    }
    /* 速降：用高筒、鞋尖、鞋带与羽翼组成可辨认的像素翼靴。 */
    const p = size / 48;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(p, p);
    const poly = (points, color) => {
      ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    poly([[21,22],[24,13],[30,7],[29,13],[39,7],[35,13],[44,13],[38,18],[31,18],[27,25]], '#19283a');
    poly([[23,20],[26,12],[29,10],[28,16],[37,10],[33,16],[40,15],[36,18],[30,17],[27,24]], '#80b9dc');
    poly([[25,17],[29,11],[28,16],[34,12],[31,17]], '#e1f0f4');
    poly([[6,35],[10,32],[10,15],[13,11],[25,11],[28,14],[27,25],[32,29],[41,29],[44,32],[44,38],[41,41],[8,41],[5,38]], '#11151d');
    poly([[9,35],[13,32],[13,15],[15,13],[23,13],[25,15],[24,26],[31,31],[40,31],[42,33],[41,37],[9,37]], '#783b20');
    poly([[15,18],[22,17],[22,29],[16,31],[14,28]], '#a95828');
    poly([[23,27],[30,31],[39,31],[41,33],[39,35],[26,35],[22,32]], '#a95828');
    poly([[12,14],[25,14],[26,18],[12,18]], '#e6b85c');
    poly([[12,15],[24,15],[24,16],[12,16]], '#fff0ac');
    ctx.fillStyle = '#e9cc87';
    ctx.fillRect(16, 20, 7, 2); ctx.fillRect(19, 23, 6, 2); ctx.fillRect(16, 26, 7, 2);
    ctx.fillStyle = '#d98239'; ctx.fillRect(14, 30, 5, 2); ctx.fillRect(30, 30, 7, 2);
    ctx.fillStyle = '#dfcfaa'; ctx.fillRect(8, 38, 32, 2);
    ctx.fillStyle = '#f0dcaa'; ctx.fillRect(9, 39, 28, 1);
    ctx.fillStyle = '#34313a'; ctx.fillRect(7, 34, 3, 4); ctx.fillRect(12, 33, 2, 4);
    ctx.restore();
  }

  function drawCart(ctx, x, y, s) {
    const p = s / 48;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(p, p);
    ctx.fillStyle = '#101620'; ctx.fillRect(4, 11, 42, 26);
    ctx.fillStyle = '#8795a9'; ctx.fillRect(7, 9, 36, 22);
    ctx.fillStyle = '#d3dfed'; ctx.fillRect(10, 12, 28, 3);
    ctx.fillRect(10, 15, 4, 12); ctx.fillRect(34, 15, 4, 12);
    ctx.fillStyle = '#3b4659'; ctx.fillRect(14, 19, 20, 9);
    ctx.fillStyle = '#111827'; ctx.fillRect(10, 34, 10, 10); ctx.fillRect(32, 34, 10, 10);
    ctx.fillStyle = '#d4a84e'; ctx.fillRect(12, 36, 6, 6); ctx.fillRect(34, 36, 6, 6);
    ctx.restore();
  }

  function drawChevron(ctx, x, y, color) {
    ctx.fillStyle = color || '#bdd0e7';
    ctx.fillRect(x, y, 4, 4); ctx.fillRect(x + 4, y + 4, 4, 4); ctx.fillRect(x + 8, y + 8, 4, 4);
    ctx.fillRect(x + 4, y + 12, 4, 4); ctx.fillRect(x, y + 16, 4, 4);
  }

  function drawTitleBackdrop(ctx) {
    ctx.fillStyle=window.CampSkin.paper;ctx.fillRect(0,0,720,MM.UI.LAYOUT.H);
    ctx.save();ctx.fillStyle='#a17c4a';ctx.globalAlpha=.10;
    for(let y=24;y<MM.UI.LAYOUT.H;y+=80)for(let x=20;x<720;x+=80){
      ctx.fillRect(x,y,4,4);ctx.fillRect(x+36,y+38,10,3);ctx.fillRect(x+39,y+35,3,9);
    }ctx.restore();
  }

  function TitleScene() {
    this.hit = {};this.moreOpen=false;
    this.archiveOpen = false;
    this.codexOpen = false;
    this.settingsOpen = false;
    this.currencyOpen = false;
    this.selectedStyle = null;
    this.minePickerOpen = false;
    this.selectedMine = 'oldMine';
    this.abandonConfirm = false;
    this.handbookOpen = false;
    this.pendingLaunch = null;
  }

  TitleScene.prototype.enter = function () {
    this.hit = {};this.moreOpen=false;
    this.archiveOpen = false;
    this.codexOpen = false;
    this.settingsOpen = false;
    this.currencyOpen = false;
    this.selectedStyle = null;
    this.minePickerOpen = false;
    this.selectedMine = 'oldMine';
    this.abandonConfirm = false;
    this.handbookOpen = false;
    this.pendingLaunch = null;
  };

  TitleScene.prototype.update = function () {
    const events = MM.Input.consume();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type !== 'down') continue;

      if (this.codexOpen) {
        const targets = this.hit.relicTargets || [];
        for (let k = 0; k < targets.length; k++) {
          if (!MM.U.pointInRect(ev.x, ev.y, targets[k])) continue;
          const ex = MM.Save.get().miningSave.expedition;
          MM.Expedition.trackRelic(ex.trackedRelic === targets[k].id ? null : targets[k].id);
          return;
        }
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.codexClose)) { this.codexOpen = false; return; }
        return;
      }
      if (this.handbookOpen) {
        const targets = this.hit.goalTargets || [];
        for (let k = 0; k < targets.length; k++) {
          if (!MM.U.pointInRect(ev.x, ev.y, targets[k])) continue;
          const ex = MM.Save.get().miningSave.expedition;
          MM.Expedition.trackGoal(ex.trackedGoal === targets[k].id ? null : targets[k].id);
          return;
        }
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.handbookClose)) {
          this.handbookOpen = false; this.archiveOpen = true; return;
        }
        return;
      }
      if (this.minePickerOpen) {
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.minePickerClose)) {
          this.minePickerOpen = false; this.abandonConfirm = false; this.pendingLaunch = null; return;
        }
        const cards = this.hit.mineCards || [];
        for (let k = 0; k < cards.length; k++) {
          if (cards[k].unlocked && MM.U.pointInRect(ev.x, ev.y, cards[k])) {
            this.selectedMine = cards[k].id; this.abandonConfirm = false; this.pendingLaunch = null; return;
          }
        }
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.mineResume) && MM.Save.hasActiveRun()) {
          MM.Game.setScene(new MM.MiningMode(undefined, undefined, { resume: true })); return;
        }
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.mineStart)) {
          let customSeed = null;
          if (MM.Save.hasActiveRun()) {
            if (!this.abandonConfirm) { this.abandonConfirm = true; return; }
            if (this.pendingLaunch === 'seed') {
              try { if (typeof window !== 'undefined' && window.prompt) customSeed = window.prompt('输入要挑战的 Seed：', ''); } catch (e) { customSeed = null; }
              if (customSeed == null || !String(customSeed).trim()) return;
            }
            MM.Save.clearActiveRun();
          }
          if (this.pendingLaunch === 'daily') {
            const daily = MM.Expedition.daily();
            MM.Game.setScene(new MM.MiningMode(daily.seed, daily.mineId, {
              challengeMode: 'daily', challengeParams: { mode: 'daily' },
            }));
          } else if (this.pendingLaunch === 'seed') {
            if (customSeed && String(customSeed).trim()) MM.Game.setScene(new MM.MiningMode(String(customSeed).trim(), this.selectedMine, {
              challengeMode: 'seed', challengeParams: { mode: 'seed' },
            }));
          } else {
            MM.Game.setScene(new MM.MiningMode(undefined, this.selectedMine, { style: this.selectedStyle }));
          }
          this.minePickerOpen = false; this.abandonConfirm = false;
          this.pendingLaunch = null;
          return;
        }
        return;
      }
      if (this.settingsOpen) {
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.settingsClose)) { this.settingsOpen = false; return; }
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.settingsSound)) {
          MM.Audio.toggle();
          return;
        }
        this.settingsOpen = false;
        return;
      }
      if (this.currencyOpen) { this.currencyOpen = false; return; }
      if (this.archiveOpen) {
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.handbook)) { this.handbookOpen = true; return; }
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.relics)) { this.codexOpen = true; return; }
        if (MM.U.pointInRect(ev.x, ev.y, this.hit.archiveClose)) { this.archiveOpen = false; return; }
        this.archiveOpen = false;
        return;
      }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.sound)) { MM.Audio.toggle(); return; }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.settings)) { this.settingsOpen = true; return; }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.currency)) { this.currencyOpen = true; return; }
      if(MM.U.pointInRect(ev.x,ev.y,this.hit.quickResume)){MM.Game.setScene(new MM.MiningMode(undefined,undefined,{resume:true}));return;}
      if(MM.U.pointInRect(ev.x,ev.y,this.hit.more)){this.moreOpen=true;return;}
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.back)) { if(this.moreOpen){this.moreOpen=false;return;} if(window.CampBridge)window.CampBridge.exitToCamp();else MM.Game.setScene(new MM.MainPlaceholderScene()); return; }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.archive)) { this.archiveOpen = true; return; }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.start)) {
        this.minePickerOpen = true;
        this.selectedMine = 'oldMine';
        this.abandonConfirm = false;
        this.pendingLaunch = null;
        return;
      }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.tutorial)) {
        MM.Game.setScene(new MM.MiningMode(undefined, undefined, { tutorial: true }));
        return;
      }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.daily)) {
        const daily = MM.Expedition.daily();
        if (MM.Save.hasActiveRun()) { this.minePickerOpen = true; this.selectedMine = 'oldMine'; this.pendingLaunch = 'daily'; return; }
        MM.Game.setScene(new MM.MiningMode(daily.seed, daily.mineId, {
          challengeMode: 'daily', challengeParams: { mode: 'daily' },
        }));
        return;
      }
      if (this.hit.styles) {
        for (let k = 0; k < this.hit.styles.length; k++) {
          if (MM.U.pointInRect(ev.x, ev.y, this.hit.styles[k])) {
            const id = this.hit.styles[k].id;
            this.selectedStyle = this.selectedStyle === id ? null : id;
            return;
          }
        }
      }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.seed)) {
        if (MM.Save.hasActiveRun()) { this.minePickerOpen = true; this.pendingLaunch = 'seed'; return; }
        let seed = null;
        try {
          if (typeof window !== 'undefined' && window.prompt) {
            seed = window.prompt('输入要挑战的 Seed（同一 Seed 会生成同一张矿坑）：', '');
          }
        } catch (e) { seed = null; }
        if (seed != null && String(seed).trim()) MM.Game.setScene(new MM.MiningMode(String(seed).trim(), null, {
          challengeMode: 'seed', challengeParams: { mode: 'seed' },
        }));
        return;
      }
    }
  };

  TitleScene.prototype.draw = function (ctx) {
    this.hit={};drawTitleBackdrop(ctx);
    const U = MM.UI;
    const gold = '#855018';
    const extra = Math.max(0, U.LAYOUT.H - 1280);
    const heroExtra = Math.min(56, extra * 0.16);
    const cardExtra = Math.min(24, extra * 0.075);
    const gap = Math.max(0, (extra - heroExtra - cardExtra) / 6);
    const goalShift = heroExtra + gap;
    const styleShift = heroExtra + gap * 2;
    const startShift = heroExtra + cardExtra + gap * 3;
    const linksShift = heroExtra + cardExtra + gap * 4;
    const seedShift = heroExtra + cardExtra + gap * 5;
    const archiveShift = extra;

    /* 顶栏：返回、账号货币、音效与设置 */
    this.hit.back = { x: 16, y: 8, w: 214, h: 62 };
    U.button(ctx, this.hit.back, '‹  返回大厅', { color: '#1d3049', border: '#8aa0bc', rivet: '#b98a4a' });
    U.drawPanel(ctx, { x: 238, y: 8, w: 298, h: 62 }, { fill: '#0c192b', border: '#55708d', accent: '#d49743' });
    if (MM.Assets) MM.Assets.drawIcon(ctx, 2, 250, 17, 42);
    MM.U.text(ctx, '矿坑纪念币', 301, 34, 17, '#444b54', 'left', true);
    MM.U.text(ctx, String(MM.Save.currency()), 436, 34, 27, gold, 'center', true);
    this.hit.currency = { x: 478, y: 12, w: 48, h: 54 };
    U.button(ctx, { x: 486, y: 18, w: 34, h: 42 }, '+', { color: '#644b2a', border: '#c69c54', rivet: '#c69c54', small: true });
    this.hit.sound = { x: 546, y: 8, w: 76, h: 62 };
    this.hit.settings = { x: 630, y: 8, w: 76, h: 62 };
    U.button(ctx, this.hit.sound, '', { color: '#1d3049', border: '#8aa0bc' });
    speaker(ctx, this.hit.sound, MM.Audio ? MM.Audio.enabled : false);
    U.button(ctx, this.hit.settings, '', { color: '#1d3049', border: '#b18a50' });
    pixelGear(ctx, this.hit.settings);

    /* 矿洞横幅使用项目专属的完整场景底图，避免瓦片拼贴出矩形洞口。 */
    const continuing = MM.Save.hasActiveRun();
    const heroHeight = this.moreOpen ? 176 + heroExtra : Math.max(260, U.LAYOUT.H - 730 - (continuing ? 122 : 0));
    const hero = { x: 24, y: 84, w: 672, h: heroHeight };
    U.drawPanel(ctx, hero, { fill: '#091221', border: '#c18a43', accent: '#f5bd58', lineWidth: 3 });
    ctx.save();
    const sceneRect = { x: hero.x + 9, y: hero.y + 9, w: hero.w - 18, h: hero.h - 18 };
    ctx.beginPath(); ctx.rect(sceneRect.x, sceneRect.y, sceneRect.w, sceneRect.h); ctx.clip();
    const sceneReady = MM.Assets && MM.Assets.drawMineEntrance(ctx,
      sceneRect.x, sceneRect.y, sceneRect.w, sceneRect.h);
    if (!sceneReady) {
      const bg = ctx.createLinearGradient(sceneRect.x, 0, sceneRect.x + sceneRect.w, 0);
      bg.addColorStop(0, '#10223a'); bg.addColorStop(0.55, '#0c1728'); bg.addColorStop(1, '#100d0b');
      ctx.fillStyle = bg; ctx.fillRect(sceneRect.x, sceneRect.y, sceneRect.w, sceneRect.h);
    }
    const titleShade = ctx.createLinearGradient(sceneRect.x, 0, sceneRect.x + 330, 0);
    titleShade.addColorStop(0, 'rgba(4,9,16,0.35)');
    titleShade.addColorStop(0.68, 'rgba(4,9,16,0.58)');
    titleShade.addColorStop(1, 'rgba(4,9,16,0)');
    ctx.fillStyle = titleShade; ctx.fillRect(sceneRect.x, sceneRect.y, 340, sceneRect.h);
    if (MM.Assets) {
      const minerSize = 74;
      MM.Assets.drawMiner(ctx, 'down', Math.floor((Date.now() / 180) % 4),
        hero.x + 420, hero.y + hero.h - minerSize - 12, minerSize, false);
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const logoY = hero.y + 50;
    ctx.font = 'bold 49px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.lineWidth = 7; ctx.strokeStyle = '#431b0b'; ctx.strokeText('再挖一层', 247, logoY);
    const logoGold = ctx.createLinearGradient(0, logoY - 27, 0, logoY + 27);
    logoGold.addColorStop(0, '#fff1ad'); logoGold.addColorStop(0.45, '#ffc84b'); logoGold.addColorStop(1, '#e56e22');
    ctx.fillStyle = logoGold; ctx.fillText('再挖一层', 247, logoY);
    ctx.restore();
    MM.U.text(ctx, '地 下 矿 坑', 247, logoY + 33, 19, '#ffedc9', 'center', true);

    if(!this.moreOpen){
      let y=hero.y+hero.h+20;
      U.drawPanel(ctx,{x:24,y:y,w:672,h:170},{fill:'#f5e5cf',border:'#c9a578'});
      const depth = MM.mapSpec().DEPTH_LABEL || 44;
      MM.U.text(ctx,'探索目标 · 抵达 '+depth+'m 藏宝库',360,y+34,27,'#573922','center',true);
      ['规划路线','采矿与制作','带着收获撤离'].forEach(function(label,i){
        const x=136+i*224;
        ctx.fillStyle='#785536';ctx.fillRect(x-18,y+64,36,36);
        MM.U.text(ctx,String(i+1),x,y+83,22,'#fff6e3','center',true);
        MM.U.text(ctx,label,x,y+131,23,'#573922','center',true);
      });
      y+=194;
      if(continuing){this.hit.quickResume={x:24,y:y,w:672,h:98};U.button(ctx,this.hit.quickResume,'继续上次探索',{color:'#b78230',border:'#ffe09b'});y+=122;}
      this.hit.start={x:24,y:y,w:672,h:98};U.button(ctx,this.hit.start,continuing?'选择新矿区':'开始探索 · 选择矿区',{color:'#b78230',border:'#ffe09b'});y+=125;
      MM.U.text(ctx,'体力决定路线，撤离可保住收获',360,y,23,'#514635','center',true);y+=45;
      this.hit.tutorial={x:24,y:y,w:330,h:100};U.button(ctx,this.hit.tutorial,'新手实操',{color:'#244f58',border:'#93b8b0'});
      this.hit.archive={x:366,y:y,w:330,h:100};U.button(ctx,this.hit.archive,'探索档案',{color:'#51402b',border:'#bc9e6d'});y+=124;
      this.hit.more={x:24,y:y,w:672,h:96};U.button(ctx,this.hit.more,'目标风格 / 每日与同图挑战',{color:'#51402b',border:'#bc9e6d'});
      if(this.archiveOpen)this.drawArchive(ctx);if(this.codexOpen)this.drawCodex(ctx);if(this.settingsOpen)this.drawSettings(ctx);
      if(this.currencyOpen)this.drawCurrencyInfo(ctx);if(this.handbookOpen)this.drawHandbook(ctx);if(this.minePickerOpen)this.drawMinePicker(ctx);
      return;
    }
    /* 主目标说明 */
    const spec = MM.mapSpec();
    const depthLabel = spec.DEPTH_LABEL || 44;
    const goal = { x: 24, y: 276 + goalShift, w: 672, h: 118 };
    U.drawPanel(ctx, goal, { fill: '#101b2b', border: '#637996', accent: '#ffd15c', lineWidth: 2 });
    U.button(ctx, { x: 44, y: goal.y + 8, w: 142, h: 34 }, '探索目标', { color: '#72592f', border: '#e3b452', small: true });
    ctx.save();
    ctx.font = 'bold 27px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
    const goalPrefixWidth = ctx.measureText('抵达 ').width;
    ctx.restore();
    MM.U.text(ctx, '抵达 ', 54, goal.y + 58, 27, '#4a4b4c', 'left', true);
    MM.U.text(ctx, depthLabel + 'm 藏宝库', 54 + goalPrefixWidth, goal.y + 58, 27, gold, 'left', true);
    MM.U.text(ctx, '挖矿收集材料，在工作台制作改造。', 54, goal.y + 92, 18, '#444b56', 'left');
    if (MM.Assets) MM.Assets.drawIcon(ctx, 2, 610, goal.y + 20, 58);

    /* 探索风格卡 */
    const styleY = 446 + styleShift;
    MM.U.text(ctx, '探索风格', 30, styleY - 28, 24, gold, 'left', true);
    MM.U.text(ctx, '可选 · 完成目标后获得奖励', 690, styleY - 28, 16, '#444b54', 'right');
    const styles = MM.BALANCE.STYLES || [];
    const styleRects = [
      { x: 24, y: styleY, w: 214, h: 192 + cardExtra, id: 'explorer' },
      { x: 253, y: styleY, w: 214, h: 192 + cardExtra, id: 'miner' },
      { x: 482, y: styleY, w: 214, h: 192 + cardExtra, id: 'racer' },
    ];
    this.hit.styles = styleRects;
    const colors = [
      { fill: '#203d5d', border: '#739bc1', accent: '#a9d5ff' },
      { fill: '#254338', border: '#73a178', accent: '#9fe08a' },
      { fill: '#584225', border: '#c3944c', accent: '#ffd15c' },
    ];
    const cardGoals = {
      explorer: '发现 2 个隐藏房', miner: '采矿达到第二档', racer: '不乘矿车抵达 30m',
    };
    styleRects.forEach((r, i) => {
      const style = styles.filter((s) => s.id === r.id)[0] || { name: r.id };
      const chosen = this.selectedStyle === r.id;
      U.drawPanel(ctx, r, {
        fill: chosen ? '#304e70' : colors[i].fill,
        border: chosen ? '#ffe27a' : colors[i].border,
        accent: chosen ? '#ffe27a' : colors[i].accent,
        lineWidth: chosen ? 3 : 2,
      });
      drawRoleIcon(ctx, r.id, r.x + 72, r.y + 12, 66);
      ctx.beginPath(); ctx.arc(r.x + r.w - 28, r.y + 30, 13, 0, Math.PI * 2);
      ctx.fillStyle = chosen ? '#ffe27a' : '#102037'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = chosen ? '#fff0b7' : '#9ab4d3'; ctx.stroke();
      if (chosen) {
        ctx.fillStyle = '#47320e'; ctx.fillRect(r.x + r.w - 34, r.y + 29, 5, 3); ctx.fillRect(r.x + r.w - 30, r.y + 33, 10, 3);
      }
      MM.U.text(ctx, style.name, r.x + r.w / 2, r.y + 98, 22, '#4a4b4c', 'center', true);
      MM.U.text(ctx, cardGoals[r.id] || style.goal || '', r.x + r.w / 2, r.y + 128,
        MM.U.fitSize(ctx, cardGoals[r.id] || style.goal || '', r.w - 24, 15, true), '#474b50', 'center', true);
      const rewardShift = Math.round(cardExtra * 0.55);
      ctx.fillStyle = 'rgba(223,233,248,0.25)'; ctx.fillRect(r.x + 16, r.y + 150 + rewardShift, r.w - 32, 1);
      if (MM.Assets) MM.Assets.drawIcon(ctx, 1, r.x + 17, r.y + 159 + rewardShift, 28);
      const reward = MM.Style ? MM.Style.rewardPreview(r.id) : '';
      MM.U.text(ctx, reward, r.x + 51, r.y + 173 + rewardShift,
        MM.U.fitSize(ctx, reward, r.w - 64, 13, false), '#484b4e', 'left');
    });

    /* 主操作条 */
    this.hit.start = { x: 24, y: 662 + startShift, w: 672, h: 98 };
    U.button(ctx, this.hit.start, '', { color: '#c18b31', border: '#ffdc78', rivet: '#ffe7a1', armed: false });
    if (MM.Assets) MM.Assets.drawIcon(ctx, 8, 168, this.hit.start.y + 14, 60);
    MM.U.text(ctx, this.selectedStyle ? '开始探索 · ' + (MM.Style.def(this.selectedStyle).name) : '开始探索',
      441, this.hit.start.y + 40, 34, '#2e1d0b', 'center', true);
    MM.U.text(ctx, this.selectedStyle ? '带着可选目标进入新矿坑' : '自由探索 · 向下寻找矿脉与藏宝库',
      442, this.hit.start.y + 72, 17, '#4c3013', 'center', true);

    /* 教程 / 每日挑战 */
    const tutorial = { x: 24, y: 784 + linksShift, w: 330, h: 84 };
    this.hit.tutorial = tutorial;
    U.drawPanel(ctx, tutorial, { fill: '#183454', border: '#7294b9', accent: '#9fcaff', lineWidth: 2 });
    if (MM.Assets) MM.Assets.drawIcon(ctx, 9, tutorial.x + 18, tutorial.y + 16, 54);
    MM.U.text(ctx, '新手教程', tutorial.x + 88, tutorial.y + 39, 23, '#494b4d', 'left', true);
    MM.U.text(ctx, '学习挖掘与制作', tutorial.x + 88, tutorial.y + 68, 16, '#444b55', 'left');
    drawChevron(ctx, tutorial.x + tutorial.w - 27, tutorial.y + 36, '#b8d6fa');

    const dailyDef = MM.Expedition.daily();
    const dailySeed = dailyDef.seed;
    const dailyBest = MM.Save.seedBestOf(dailySeed, dailyDef.mineId, { mode: 'daily' });
    const daily = { x: 366, y: 784 + linksShift, w: 330, h: 84 };
    this.hit.daily = daily;
    U.drawPanel(ctx, daily, { fill: '#164052', border: '#5d9ab0', accent: '#7dd8e8', lineWidth: 2 });
    /* 日历章 */
    ctx.fillStyle = '#111a27'; ctx.fillRect(daily.x + 20, daily.y + 15, 56, 58);
    ctx.fillStyle = '#d24c3f'; ctx.fillRect(daily.x + 20, daily.y + 15, 56, 14);
    ctx.fillStyle = '#e5eaf0'; ctx.fillRect(daily.x + 24, daily.y + 29, 48, 38);
    ctx.fillStyle = '#ad4433'; ctx.fillRect(daily.x + 29, daily.y + 9, 6, 13); ctx.fillRect(daily.x + 61, daily.y + 9, 6, 13);
    if (MM.Assets) MM.Assets.drawIcon(ctx, 2, daily.x + 34, daily.y + 35, 28);
    MM.U.text(ctx, '每日挑战', daily.x + 92, daily.y + 37, 23, '#494b4d', 'left', true);
    const dailyMineName = (MM.Expedition.mine(dailyDef.mineId) || {}).name || '固定矿坑';
    const dailyLabel = dailyBest
      ? dailyMineName + ' · 最佳 ' + dailyBest.bestDepth + 'm / ' + dailyBest.bestValue
      : '今日 · ' + dailyMineName;
    MM.U.text(ctx, dailyLabel, daily.x + 92, daily.y + 66,
      MM.U.fitSize(ctx, dailyLabel, 190, 16, false), '#444b55', 'left');
    drawChevron(ctx, daily.x + daily.w - 27, daily.y + 36, '#b8d6fa');

    /* 同图挑战 */
    this.hit.seed = { x: 24, y: 888 + seedShift, w: 672, h: 84 };
    U.drawPanel(ctx, this.hit.seed, { fill: '#33294b', border: '#8270b0', accent: '#c2a3ff', lineWidth: 2 });
    const seedY = this.hit.seed.y;
    ctx.fillStyle = '#bf9855'; ctx.fillRect(48, seedY + 17, 42, 48); ctx.fillRect(74, seedY + 9, 36, 56);
    ctx.fillStyle = '#553a22'; ctx.fillRect(53, seedY + 22, 30, 37); ctx.fillRect(79, seedY + 14, 26, 45);
    ctx.fillStyle = '#dfc58b'; ctx.fillRect(57, seedY + 26, 22, 2); ctx.fillRect(83, seedY + 18, 18, 2);
    if (MM.Assets) MM.Assets.drawIcon(ctx, 6, 81, seedY + 18, 24);
    MM.U.text(ctx, '同图挑战', 136, seedY + 30, 23, '#494b4d', 'left', true);
    MM.U.text(ctx, '输入 Seed，与朋友挑战同一矿坑', 136, seedY + 57, 16, '#4a4a54', 'left');
    drawChevron(ctx, 652, seedY + 23, '#d2c5f0');

    /* 档案概览 */
    const records = MM.Save.records();
    const ex = records.expedition || { unlockedMines: ['oldMine'], completedGoals: [], trackedGoal: null };
    const archive = records.archive || { rooms: [], minerals: [], relics: [], runs: 0 };
    const relicCount = (archive.relics || []).length;
    const archiveY = 992 + archiveShift;
    this.hit.archive = { x: 24, y: archiveY, w: 672, h: 242 };
    U.drawPanel(ctx, this.hit.archive, { fill: '#0c1727', border: '#637c98', accent: '#d59c48', lineWidth: 2 });
    MM.U.text(ctx, '探索档案', 50, archiveY + 28, 23, '#584a26', 'left', true);
    MM.U.text(ctx, '已探索 ' + (archive.runs || 0) + ' 局', 670, archiveY + 28, 17, '#444b55', 'right');
    const archiveStats = [
      { x: 54, icon: 9, title: '隐藏区域', value: (archive.rooms || []).length + '/' + MM.ROOM_ORDER.length, color: '#9fd0ff' },
      { x: 267, icon: 4, title: '矿物', value: (archive.minerals || []).length + '/' + MM.RESOURCE_ORDER.length, color: '#dce6f3' },
      { x: 480, icon: 6, title: '遗物', value: relicCount + '/' + (MM.RELICS || []).length, color: '#d4a7ff' },
    ];
    archiveStats.forEach((s, i) => {
      if (i) { ctx.fillStyle = 'rgba(180,202,230,0.23)'; ctx.fillRect(s.x - 20, archiveY + 49, 1, 76); }
      if (MM.Assets) MM.Assets.drawIcon(ctx, s.icon, s.x, archiveY + 55, 52);
      MM.U.text(ctx, s.title, s.x + 63, archiveY + 68, 16, '#444b55', 'left');
      MM.U.text(ctx, s.value, s.x + 63, archiveY + 100, 26, '#494b4c', 'left', true);
    });
    ctx.fillStyle = 'rgba(180,202,230,0.18)'; ctx.fillRect(46, archiveY + 130, 628, 1);
    MM.U.text(ctx, '查看档案与遗物图鉴', 360, archiveY + 199, 20, gold, 'center', true);
    drawChevron(ctx, 558, archiveY + 189, gold);

    if (this.archiveOpen) this.drawArchive(ctx);
    if (this.currencyOpen) this.drawCurrencyInfo(ctx);
    if (this.settingsOpen) this.drawSettings(ctx);
    if (this.codexOpen) this.drawRelicCodex(ctx);
    if (this.minePickerOpen) this.drawMinePicker(ctx);
    if (this.handbookOpen) this.drawHandbook(ctx);
  };

  TitleScene.prototype.drawSettings = function (ctx) {
    const H = MM.UI ? MM.UI.LAYOUT.H : 1280;
    ctx.fillStyle = 'rgba(2,5,10,0.78)'; ctx.fillRect(0, 0, 720, H);
    const rect = { x: 72, y: 340, w: 576, h: 590 };
    MM.UI.drawPanel(ctx, rect, { fill: '#111b2b', border: '#8a7043', accent: '#ffd15c', lineWidth: 3 });
    MM.U.text(ctx, '设置', 360, 408, 34, '#594a26', 'center', true);
    MM.U.text(ctx, '音效', 116, 490, 24, '#494b4c', 'left', true);
    MM.U.text(ctx, '挖掘、矿车与发现提示', 116, 528, 17, '#444b55', 'left');
    this.hit.settingsSound = { x: 444, y: 464, w: 154, h: 76 };
    MM.UI.button(ctx, this.hit.settingsSound, MM.Audio && MM.Audio.enabled ? '音效：开' : '音效：关', {
      color: MM.Audio && MM.Audio.enabled ? '#315e50' : '#3c4353', border: '#91a5bf',
    });
    MM.U.text(ctx, '触屏点击相邻岩块挖掘，点击已挖通道路移动。', 116, 620, 17, '#474b50', 'left');
    MM.U.text(ctx, '本局货币在抵达藏宝库后结算获得。', 116, 658, 17, '#474b50', 'left');
    if (MM.BALANCE.DEV_MODE) {
      this.hit.settingsDebug = { x: 190, y: 716, w: 340, h: 60 };
      MM.UI.button(ctx, this.hit.settingsDebug, '打开调试面板', { color: '#4b3b67', border: '#a28bc4' });
    }
    this.hit.settingsClose = { x: 190, y: 810, w: 340, h: 72 };
    MM.UI.button(ctx, this.hit.settingsClose, '返回标题', { color: '#2e4e77', border: '#95abc5' });
  };

  TitleScene.prototype.drawCurrencyInfo = function (ctx) {
    const H = MM.UI ? MM.UI.LAYOUT.H : 1280;
    ctx.fillStyle = 'rgba(2,5,10,0.78)'; ctx.fillRect(0, 0, 720, H);
    const rect = { x: 72, y: 408, w: 576, h: 432 };
    MM.UI.drawPanel(ctx, rect, { fill: '#111b2b', border: '#977541', accent: '#ffd15c', lineWidth: 3 });
    if (MM.Assets) MM.Assets.drawIcon(ctx, 2, 322, 454, 76);
    MM.U.text(ctx, '通用货币', 360, 560, 30, '#594a26', 'center', true);
    MM.U.text(ctx, '当前持有  ' + MM.Save.currency(), 360, 610, 23, '#4a4b4c', 'center', true);
    MM.U.text(ctx, '抵达藏宝库后获得，可用于《再上一层》的长期成长。', 360, 668,
      MM.U.fitSize(ctx, '抵达藏宝库后获得，可用于《再上一层》的长期成长。', 500, 18, false), '#464b52', 'center');
    this.hit.currencyClose = { x: 190, y: 736, w: 340, h: 72 };
    MM.UI.button(ctx, this.hit.currencyClose, '返回标题', { color: '#2e4e77', border: '#95abc5' });
  };

  TitleScene.prototype.drawArchive = function (ctx) {
    const H = MM.UI ? MM.UI.LAYOUT.H : 1280;
    const records = MM.Save.records();
    const a = records.archive || { rooms: [], minerals: [], relics: [], runs: 0 };
    const relics = MM.RELICS || [];
    const owned = a.relics || [];
    const challenge = MM.Save.challenge();
    const tops = MM.Save.seedTop ? MM.Save.seedTop(3) : [];
    ctx.fillStyle = 'rgba(4,6,10,0.88)';
    ctx.fillRect(0, 0, 720, H);
    MM.UI.drawPanel(ctx, { x: 48, y: 88, w: 624, h: 1104 }, { accent: '#9fd0ff', border: '#3d5874' });
    MM.U.text(ctx, '矿坑探索档案', 100, 144, 30, '#494b4d', 'left', true);
    MM.U.text(ctx, '记录本机见过的矿坑内容与个人最好成绩', 360, 180, 18, '#424b5b', 'center');
    this.hit.handbook = { x: 472, y: 108, w: 168, h: 52 };
    MM.UI.button(ctx, this.hit.handbook, '远征目标手册', { color: '#28466a', border: '#8db5dc', small: true });
    MM.U.fillRound(ctx, 80, 210, 560, 288, 10, 'rgba(255,255,255,0.025)');
    MM.U.strokeRound(ctx, 80, 210, 560, 288, 10, '#2b3a58', 1.5);
    const rows = [
      ['隐藏区域', (a.rooms || []).length + ' / ' + MM.ROOM_ORDER.length + ' 类'],
      ['矿物种类', (a.minerals || []).length + ' / ' + MM.RESOURCE_ORDER.length + ' 类'],
      ['最深深度', (records.bestDepth || 0) + 'm'],
      ['藏宝库', records.treasureFirstClear ? '已发现 · 抵达 ' + (records.treasureReachCount || 0) + ' 次' : '尚未发现'],
      ['累计探索', (a.runs || 0) + ' 局   ·   通用货币 ' + MM.Save.currency()],
    ];
    rows.forEach((r, i) => {
      const y = 250 + i * 50;
      MM.U.text(ctx, r[0], 108, y, 20, '#424b5b', 'left');
      MM.U.text(ctx, r[1], 612, y, 21, i === 2 ? '#594b20' : '#494b4e', 'right', true);
      if (i < rows.length - 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.fillRect(104, y + 20, 512, 1);
      }
    });

    const relicRect = { x: 80, y: 522, w: 560, h: 192 };
    this.hit.relics = relicRect;
    MM.UI.drawPanel(ctx, relicRect, { fill: '#182234', border: '#685a37', accent: '#ffd75e', radius: 12, lineWidth: 1.5 });
    MM.U.text(ctx, '矿坑遗物', 108, 558, 23, '#594b20', 'left', true);
    MM.U.text(ctx, owned.length + ' / ' + relics.length + ' 件 · 在对应矿区与事件中寻找',
      612, 558, 16, '#464b53', 'right');
    relics.forEach((r, i) => {
      const has = owned.indexOf(r.id) >= 0;
      if (MM.Assets) MM.Assets.drawRelicIcon(ctx, i + 1, 100 + i * 82, 574, 64, !has, has ? 1 : 0.8);
    });
    MM.U.text(ctx, '点击图标查看收集册', 360, 694, 16, '#424b5b', 'center');

    MM.U.fillRound(ctx, 80, 736, 560, 126, 10, 'rgba(159,208,255,0.055)');
    MM.U.strokeRound(ctx, 80, 736, 560, 126, 10, 'rgba(63,95,126,0.8)', 1.5);
    MM.U.text(ctx, '下一局可选挑战', 108, 774, 20, '#3b4d5f', 'left', true);
    const chText = challenge ? challenge.text : '暂无挑战建议，完成探索后会在这里出现。';
    MM.U.text(ctx, chText, 108, 812, MM.U.fitSize(ctx, chText, 500, 18, false), '#464b53', 'left');
    MM.U.text(ctx, '挑战只提供目标，不影响奖励，也不强制完成。', 108, 842, 15, '#424b5d', 'left');

    MM.U.fillRound(ctx, 80, 884, 560, 158, 10, 'rgba(255,255,255,0.025)');
    MM.U.strokeRound(ctx, 80, 884, 560, 158, 10, '#2b3a58', 1.5);
    MM.U.text(ctx, '同 Seed 本机挑战榜', 108, 920, 20, '#464b53', 'left', true);
    if (tops.length) {
      tops.forEach((t, i) => {
        const text = (i + 1) + '.  ' + t.seed + '   ·   ' + t.bestDepth + 'm / ' + t.bestValue;
        MM.U.text(ctx, text, 108, 954 + i * 28, 16, i === 0 ? '#594b20' : '#424b5b', 'left', i === 0);
      });
    } else {
      MM.U.text(ctx, '完成一局 Seed 挑战后会记录最佳深度与价值。', 108, 965, 17, '#424b5b', 'left');
    }
    const sealedComplete = !!(records.expedition && records.expedition.sealedMineCompleted);
    MM.UI.drawPanel(ctx, { x: 80, y: 1044, w: 560, h: 30 }, {
      fill: sealedComplete ? '#302746' : '#141d2b',
      border: sealedComplete ? '#9b7db9' : '#45556c',
      accent: sealedComplete ? '#d8bdff' : '#71849e', radius: 6, lineWidth: 1,
    });
    /* 以可见的徽记槽展示终局纪念物；完成后会常驻营地档案。 */
    ctx.fillStyle = '#c99d4c'; ctx.fillRect(94, 1050, 15, 17);
    ctx.fillStyle = '#f5d987'; ctx.fillRect(98, 1053, 7, 4);
    ctx.fillStyle = '#6e542e'; ctx.fillRect(98, 1059, 7, 5);
    MM.U.text(ctx, sealedComplete ? '营地纪念物 · 封存者铭牌（已陈列）'
      : '终局纪念物 · 完成封存矿库可获得封存者铭牌',
    126, 1064, MM.U.fitSize(ctx, sealedComplete ? '营地纪念物 · 封存者铭牌（已陈列）'
      : '终局纪念物 · 完成封存矿库可获得封存者铭牌', 492, 14, false),
    sealedComplete ? '#4d4954' : '#444b55', 'left', sealedComplete);
    this.hit.archiveClose = { x: 196, y: 1080, w: 328, h: 82 };
    MM.UI.button(ctx, this.hit.archiveClose, '返回标题', { color: '#3a3f52' });
  };

  TitleScene.prototype.drawMinePicker = function (ctx) {
    const H = MM.UI ? MM.UI.LAYOUT.H : 1280;
    const save = MM.Save.get().miningSave;
    const active = save.activeRun;
    const unlocked = MM.Expedition.unlockedMineIds();
    ctx.fillStyle = 'rgba(3,6,11,0.90)'; ctx.fillRect(0, 0, 720, H);
    const panel = { x: 38, y: 114, w: 644, h: 1052 };
    MM.UI.drawPanel(ctx, panel, { fill: '#0d192a', border: '#9a7540', accent: '#ffd15c', lineWidth: 3 });
    MM.U.text(ctx, '选择远征矿区', 360, 166, 31, '#5a4a20', 'center', true);
    MM.U.text(ctx, '不同矿区会改变路线机关与目标；解锁状态来自你的探索纪录。', 360, 204,
      MM.U.fitSize(ctx, '不同矿区会改变路线机关与目标；解锁状态来自你的探索纪录。', 570, 16, false), '#454b54', 'center');

    const mines = Object.keys(MM.MINES || {}).map((id) => MM.MINES[id]);
    this.hit.mineCards = [];
    const unlockText = { default: '初始开放', depth30: '历史最深到达 30m 后开放', firstClear: '任一普通矿区首次通关后开放', allMines: '三座普通矿区都首次通关后开放' };
    mines.forEach((mine, i) => {
      const y = 232 + i * 144;
      const isOpen = unlocked.indexOf(mine.id) >= 0;
      const selected = this.selectedMine === mine.id;
      const rect = { x: 66, y, w: 588, h: 128, id: mine.id, unlocked: isOpen };
      this.hit.mineCards.push(rect);
      MM.UI.drawPanel(ctx, rect, {
        fill: selected ? '#243c57' : (isOpen ? '#17263a' : '#111722'),
        border: selected ? '#ffd15c' : (isOpen ? '#526f90' : '#38404c'),
        accent: selected ? '#ffd15c' : (isOpen ? '#8fb6dc' : '#555d6b'),
        lineWidth: selected ? 2.5 : 1.5, radius: 10,
      });
      const icon = mine.id === 'resonanceCave' ? 6 : (mine.id === 'clockworkMine' ? 8 : (mine.id === 'sealedVault' ? 2 : 3));
      if (MM.Assets) MM.Assets.drawIcon(ctx, icon, rect.x + 16, rect.y + 24, 66);
      MM.U.text(ctx, mine.name, rect.x + 98, rect.y + 38, 22, isOpen ? '#494b4c' : '#464b54', 'left', true);
      const desc = mine.description || '';
      MM.U.text(ctx, desc, rect.x + 98, rect.y + 72, MM.U.fitSize(ctx, desc, 390, 15, false), isOpen ? '#454b53' : '#454b56', 'left');
      const sealedDone = mine.id === 'sealedVault' && !!save.expedition.sealedMineCompleted;
      const status = isOpen ? (sealedDone ? '已通关 · 封存者铭牌已记入营地档案'
        : (mine.fixedSeed ? '固定地图 · 每局从头挑战' : '已开放 · Seed 随机')) : (unlockText[mine.unlock] || '尚未开放');
      MM.U.text(ctx, status, rect.x + 98, rect.y + 103, MM.U.fitSize(ctx, status, 390, 14, false), isOpen ? '#3a5232' : '#454b56', 'left', true);
      if (selected) MM.U.text(ctx, '已选', rect.x + rect.w - 20, rect.y + 35, 16, '#5a4a20', 'right', true);
    });

    if (active) {
      const activeMine = MM.Expedition.mine(active.mineId) || MM.MINES.oldMine;
      const depth = active.run && active.run.maxDepthReached || 0;
      MM.U.text(ctx, '未结算探索：' + activeMine.name + ' · ' + depth + 'm · Seed ' + (active.seed || ''), 360, 820,
        MM.U.fitSize(ctx, '未结算探索：' + activeMine.name + ' · ' + depth + 'm · Seed ' + (active.seed || ''), 570, 15, false), '#464b53', 'center');
      this.hit.mineResume = { x: 70, y: 858, w: 270, h: 74 };
      MM.UI.button(ctx, this.hit.mineResume, '继续上次探索', { color: '#2f6f4f', border: '#8fca9e' });
      this.hit.mineStart = { x: 358, y: 858, w: 292, h: 74 };
      MM.UI.button(ctx, this.hit.mineStart, this.abandonConfirm ? '再次点击确认放弃' : '放弃旧局并开始新局', {
        color: this.abandonConfirm ? '#8a3c37' : '#765522', border: this.abandonConfirm ? '#ff9a8e' : '#d7b469',
      });
      MM.U.text(ctx, '放弃会永久结束上次探索；继续可从保存位置恢复。', 360, 950, 14, '#62453d', 'center');
    } else {
      const selected = MM.Expedition.mine(this.selectedMine) || MM.MINES.oldMine;
      this.hit.mineStart = { x: 98, y: 870, w: 524, h: 78 };
      MM.UI.button(ctx, this.hit.mineStart, '开始远征 · ' + selected.name, { color: '#936c2e', border: '#ffdc78' });
      this.hit.mineResume = null;
    }
    this.hit.minePickerClose = { x: 198, y: 1014, w: 324, h: 66 };
    MM.UI.button(ctx, this.hit.minePickerClose, '返回标题', { color: '#34445c', border: '#7488a2' });
  };

  TitleScene.prototype.drawHandbook = function (ctx) {
    const H = MM.UI ? MM.UI.LAYOUT.H : 1280;
    const saved = MM.Save.get().miningSave;
    const ex = saved.expedition;
    const completed = ex.completedGoals || [];
    ctx.fillStyle = 'rgba(3,6,11,0.93)'; ctx.fillRect(0, 0, 720, H);
    MM.UI.drawPanel(ctx, { x: 46, y: 54, w: 628, h: 1170 }, { accent: '#9fd0ff', border: '#456486', lineWidth: 2.5 });
    MM.U.text(ctx, '矿脉远征 · 目标手册', 360, 108, 30, '#3b4d5f', 'center', true);
    MM.U.text(ctx, '追踪只显示目标，不改变矿坑或奖励；点已追踪目标可取消。', 360, 146, 15, '#424b5b', 'center');
    this.hit.goalTargets = [];
    (MM.JOURNAL_GOALS || []).forEach((goal, i) => {
      const y = 176 + i * 100;
      const done = completed.indexOf(goal.id) >= 0;
      const tracked = ex.trackedGoal === goal.id;
      const rect = { x: 70, y, w: 580, h: 90 };
      MM.UI.drawPanel(ctx, rect, {
        fill: done ? 'rgba(67,112,78,0.20)' : (tracked ? 'rgba(54,89,129,0.30)' : 'rgba(255,255,255,0.025)'),
        border: done ? '#65906a' : (tracked ? '#9fd0ff' : '#36445a'),
        accent: done ? '#9fe08a' : (tracked ? '#9fd0ff' : '#61738f'), radius: 9, lineWidth: tracked ? 2 : 1.2,
      });
      MM.U.text(ctx, goal.id + ' · ' + goal.group + ' · ' + goal.name, rect.x + 18, rect.y + 29, 18,
        done ? '#3a5232' : '#494b4c', 'left', true);
      MM.U.text(ctx, goal.desc, rect.x + 18, rect.y + 59,
        MM.U.fitSize(ctx, goal.desc, 418, 14, false), '#454b53', 'left');
      const reward = goal.unlock ? '解锁 ' + ((MM.UPGRADES[goal.unlock] || {}).name || goal.unlock) : '完成后记录目标';
      MM.U.text(ctx, reward, rect.x + 18, rect.y + 80, 12, done ? '#3d503e' : '#424c59', 'left');
      const action = { x: rect.x + rect.w - 126, y: rect.y + 28, w: 108, h: 42, id: goal.id };
      MM.UI.button(ctx, action, done ? '已完成' : (tracked ? '取消追踪' : '追踪'), {
        color: done ? '#354438' : (tracked ? '#35577d' : '#293c59'), border: done ? '#647d68' : '#718ba9', small: true,
      });
      if (!done) this.hit.goalTargets.push(action);
    });
    this.hit.handbookClose = { x: 198, y: 1098, w: 324, h: 68 };
    MM.UI.button(ctx, this.hit.handbookClose, '返回探索档案', { color: '#2e4e77', border: '#95abc5' });
  };

  TitleScene.prototype.drawRelicCodex = function (ctx) {
    const H = MM.UI ? MM.UI.LAYOUT.H : 1280;
    const sum = MM.Relics ? MM.Relics.summary() : { owned: [], ownedCount: 0, total: 0 };
    const savedEx = MM.Save.get().miningSave.expedition;
    const sources = {
      oldLamp: '线索：废弃补给房的宝箱',
      goldPick: '线索：黄金矿脉，挖出两格金矿',
      crystalHeart: '线索：晶窟核心水晶',
      tornMap: '线索：废弃矿车站',
      carvedTag: '线索：废弃矿料仓库',
      silverBell: '线索：神秘房间宝箱',
    };
    ctx.fillStyle = 'rgba(4,6,10,0.92)';
    ctx.fillRect(0, 0, 720, H);
    MM.UI.drawPanel(ctx, { x: 48, y: 72, w: 624, h: 1136 }, { accent: '#d9b85e', border: '#786638' });
    MM.U.text(ctx, '矿坑遗物图鉴', 360, 132, 32, '#594b20', 'center', true);
    MM.U.text(ctx, '每件遗物都有固定来源；选择未收集遗物可让下一局优先生成线索。', 360, 170,
      MM.U.fitSize(ctx, '每件遗物都有固定来源；选择未收集遗物可让下一局优先生成线索。', 560, 15, false), '#424b5b', 'center');
    MM.U.fillRound(ctx, 80, 194, 560, 34, 6, '#111827');
    const progress = sum.total ? sum.ownedCount / sum.total : 0;
    if (progress > 0) MM.U.fillRound(ctx, 82, 196, Math.max(8, 556 * progress), 30, 5, '#8a7135');
    MM.U.strokeRound(ctx, 80, 194, 560, 34, 6, 'rgba(255,215,94,0.30)', 1.5);
    MM.U.text(ctx, '已收集 ' + sum.ownedCount + ' / ' + sum.total, 360, 211, 17, '#494b4d', 'center', true);

    const relics = MM.RELICS || [];
    this.hit.relicTargets = [];
    relics.forEach((r, i) => {
      const y = 248 + i * 126;
      const has = sum.owned.indexOf(r.id) >= 0;
      const rect = { x: 74, y, w: 572, h: 112 };
      MM.UI.drawPanel(ctx, rect, {
        fill: has ? 'rgba(201,176,106,0.10)' : 'rgba(255,255,255,0.025)',
        border: has ? 'rgba(201,176,106,0.50)' : 'rgba(99,116,145,0.42)',
        accent: has ? '#ffd75e' : '#53617a', radius: 10, lineWidth: 1.5,
      });
      if (MM.Assets) MM.Assets.drawRelicIcon(ctx, i + 1, rect.x + 16, rect.y + 13, 92, !has, has ? 1 : 0.95);
      MM.U.text(ctx, has ? r.name : '未识别遗物 0' + (i + 1), rect.x + 128, rect.y + 42,
        22, has ? '#594b20' : '#454b55', 'left', true);
      const desc = has ? r.desc : (sources[r.id] || '尚未发现 · 固定来源');
      MM.U.text(ctx, desc, rect.x + 128, rect.y + 70,
        MM.U.fitSize(ctx, desc, 318, 15, false), has ? '#464b53' : '#424b5a', 'left');
      if (has) {
        MM.U.text(ctx, '已收集', rect.x + rect.w - 18, rect.y + 101, 15, '#3a5232', 'right', true);
      } else {
        const tracked = savedEx.trackedRelic === r.id;
        const target = { x: rect.x + rect.w - 150, y: rect.y + 77, w: 132, h: 32, id: r.id };
        MM.UI.button(ctx, target, tracked ? '取消追踪' : '追踪来源', {
          color: tracked ? '#35577d' : '#293c59', border: tracked ? '#9fd0ff' : '#718ba9', small: true,
        });
        this.hit.relicTargets.push(target);
      }
    });
    const milestones = MM.Relics ? MM.Relics.milestoneStatus() : [];
    milestones.forEach((m, i) => {
      const rect = { x: 74 + i * 194, y: 1000, w: 184, h: 50 };
      MM.UI.drawPanel(ctx, rect, {
        fill: m.unlocked ? 'rgba(129,101,48,0.24)' : 'rgba(255,255,255,0.02)',
        border: m.unlocked ? 'rgba(255,215,94,0.60)' : 'rgba(99,116,145,0.35)',
        accent: m.unlocked ? '#ffd75e' : '#53617a', radius: 7, lineWidth: 1,
      });
      MM.U.text(ctx, m.count + '件 · ' + m.name, rect.x + rect.w / 2, rect.y + 19,
        MM.U.fitSize(ctx, m.count + '件 · ' + m.name, rect.w - 12, 13, true), m.unlocked ? '#544a33' : '#454b55', 'center', true);
      MM.U.text(ctx, m.unlocked ? '已解锁' : '还差 ' + Math.max(0, m.count - sum.ownedCount) + ' 件',
        rect.x + rect.w / 2, rect.y + 40, 12, m.unlocked ? '#3a5232' : '#424b5a', 'center');
    });
    const keeper = milestones.filter((m) => m.id === 'keeperTitle')[0];
    const note = keeper && keeper.unlocked
      ? '矿工手记：' + keeper.note
      : '集齐六件遗物，可复原矿工留下的最后一页手记。';
    MM.U.text(ctx, note, 360, 1073, MM.U.fitSize(ctx, note, 560, 13, false),
      keeper && keeper.unlocked ? '#464b53' : '#424b5a', 'center');
    this.hit.codexClose = { x: 198, y: 1096, w: 324, h: 64 };
    MM.UI.button(ctx, this.hit.codexClose, '返回探索档案', { color: '#2e4e77', border: '#95abc5' });
  };

  MM.TitleScene = TitleScene;
})();
