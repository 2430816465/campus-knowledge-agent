/* 运营中心（运营向）：成就 / 每日任务 / 排行榜 / 云存档，四个标签页。
 * 入口：标题页、地图选择页。奖励统一发通用货币（只买外观，§34）。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const TABS = ['成就', '每日任务', '排行榜', '云存档'];

  function OpsScene(from) {
    this.speedScaled = false;
    this.from = from || 'title';
    this.tab = 0;
    this.boardIdx = 0;
    this.hit = { back: null, tabs: [], claim: [], maps: [], cloud: [] };
    this.toastText = '';
    this.toastTtl = 0;
  }

  OpsScene.prototype.enter = function () {
    this.hit = { back: null, tabs: [], claim: [], maps: [], cloud: [] };
    this.toastText = '';
    this.toastTtl = 0;
    TD.Achievements.check();     // 打开时补一次检查（有些成就是累计型的）
  };

  OpsScene.prototype.toast = function (text) { this.toastText = text; this.toastTtl = 2.2; };

  OpsScene.prototype.update = function (dt) {
    if (this.toastTtl > 0) this.toastTtl -= dt;
    const events = TD.Input.consume();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type !== 'down') continue;

      if (TD.U.pointInRect(ev.x, ev.y, this.hit.back)) {
        TD.Sfx.click();
        TD.Game.setScene(this.from === 'maps' ? new TD.MapSelectScene() : new TD.TitleScene());
        return;
      }
      for (let t = 0; t < this.hit.tabs.length; t++) {
        const b = this.hit.tabs[t];
        if (TD.U.pointInRect(ev.x, ev.y, b.rect)) { this.tab = b.idx; TD.Sfx.click(); return; }
      }
      for (let c = 0; c < this.hit.claim.length; c++) {
        const b = this.hit.claim[c];
        if (!TD.U.pointInRect(ev.x, ev.y, b.rect)) continue;
        const res = TD.Daily.claim(b.id);
        if (res.ok) {
          TD.Sfx.coin();
          this.toast('领取成功：通用货币 +' + res.reward + (res.bonus ? '　全部完成额外 +' + res.bonus : ''));
        } else { TD.Sfx.deny(); }
        return;
      }
      for (let m = 0; m < this.hit.maps.length; m++) {
        const b = this.hit.maps[m];
        if (TD.U.pointInRect(ev.x, ev.y, b.rect)) { this.boardIdx = b.idx; TD.Sfx.click(); return; }
      }
      for (let k = 0; k < this.hit.cloud.length; k++) {
        const b = this.hit.cloud[k];
        if (!TD.U.pointInRect(ev.x, ev.y, b.rect)) continue;
        this.cloudAction(b.id);
        return;
      }
    }
  };

  OpsScene.prototype.cloudAction = function (id) {
    if (id === 'exportCopy') {
      const text = TD.Cloud.exportText();
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch (e) { ok = false; }
      this.toast(ok ? '存档已复制到剪贴板（' + Math.round(text.length / 1024) + ' KB）'
        : '浏览器不允许写剪贴板，请用「下载存档文件」');
      TD.Analytics.track('cloud_export', { method: ok ? 'clipboard' : 'failed' });
      return;
    }
    if (id === 'exportFile') {
      try {
        const blob = new Blob([TD.Cloud.exportText()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '守塔战线-存档-' + TD.Daily.dayKey() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        this.toast('存档文件已开始下载');
      } catch (e) { this.toast('当前环境不支持下载文件'); }
      return;
    }
    if (id === 'importClipboard') {
      const self = this;
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(function (text) {
            const res = TD.Cloud.importText(text);
            self.toast(res.ok ? '导入成功，存档已覆盖' : '导入失败：文件格式不对');
          }).catch(function () { self.toast('浏览器不允许读剪贴板，请改用「选择文件导入」'); });
        } else {
          this.toast('浏览器不支持读剪贴板，请改用「选择文件导入」');
        }
      } catch (e) { this.toast('读剪贴板失败，请改用「选择文件导入」'); }
      return;
    }
    if (id === 'importFile') {
      const self = this;
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = function () {
          const file = input.files && input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function () {
            const res = TD.Cloud.importText(String(reader.result || ''));
            self.toast(res.ok ? '导入成功，存档已覆盖' : '导入失败：文件格式不对');
          };
          reader.readAsText(file);
        };
        input.click();
      } catch (e) { this.toast('当前环境不支持选择文件'); }
    }
  };

  OpsScene.prototype.draw = function (ctx) {
    if (TD.Art) TD.Art.backdrop(ctx, 'menu');
    else { ctx.fillStyle = '#0f1420'; ctx.fillRect(0, 0, 720, 1280); }
    this.hit.tabs = [];
    this.hit.claim = [];
    this.hit.maps = [];
    this.hit.cloud = [];

    this.hit.back = { x: 12, y: 10, w: 56, h: 56 };
    TD.UI.button(ctx, this.hit.back, '←', { color: '#2a3550' });
    TD.U.text(ctx, '运营中心', 120, 40, 30, '#ffffff', 'left', true);
    if (!TD.Art || !TD.Art.icon(ctx, 'currency', 645, 40, 30)) TD.U.text(ctx, '◆', 645, 40, 24, '#9fd6ff', 'center', true);
    TD.U.text(ctx, String(TD.Meta.currency()), 699, 40, 24, '#9fd6ff', 'right', true);

    /* 标签页 */
    const tw = 158;
    for (let i = 0; i < TABS.length; i++) {
      const r = { x: 40 + i * (tw + 10), y: 74, w: tw, h: 52 };
      const active = this.tab === i;
      let label = TABS[i];
      if (i === 1) {
        const badge = TD.Daily.badge();
        if (badge > 0) label += ' ●' + badge;
      }
      TD.UI.button(ctx, r, label, { color: active ? '#2f5fae' : '#26304a', small: true });
      this.hit.tabs.push({ idx: i, rect: r });
    }

    if (this.tab === 0) this.drawAchievements(ctx);
    else if (this.tab === 1) this.drawDaily(ctx);
    else if (this.tab === 2) this.drawBoard(ctx);
    else this.drawCloud(ctx);

    if (this.toastTtl > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.toastTtl / 0.4);
      if (TD.Art) TD.Art.panel(ctx, { x: 120, y: 1150, w: 480, h: 56 }, '#c9964c');
      else { TD.U.fillRound(ctx, 120, 1150, 480, 56, 12, 'rgba(10,14,22,0.95)'); TD.U.strokeRound(ctx, 120, 1150, 480, 56, 12, '#3a4a6e', 1.5); }
      TD.U.text(ctx, this.toastText, 360, 1178, 19, '#ffd75e', 'center', true);
      ctx.restore();
    }
  };

  OpsScene.prototype.drawAchievements = function (ctx) {
    const list = TD.Achievements.list();
    const got = TD.Achievements.count();
    TD.U.text(ctx, '已解锁 ' + got + ' / ' + list.length + '　（达成即发通用货币，可在仓库买外观）',
      40, 156, 18, '#8fa3c4');
    let y = 184;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const has = TD.Achievements.has(a.id);
      if (TD.Art) TD.Art.panel(ctx, { x: 40, y: y, w: 640, h: 66 }, has ? '#82aa83' : '#7898bd');
      else TD.U.fillRound(ctx, 40, y, 640, 66, 12, has ? 'rgba(40,70,50,0.55)' : 'rgba(22,29,44,0.9)');
      if (!TD.Art) TD.U.strokeRound(ctx, 40, y, 640, 66, 12, has ? '#4f7a5a' : '#2b3550', 1.5);
      TD.U.text(ctx, has ? '✔' : '☆', 70, y + 33, 26, has ? '#9fe8a8' : '#5d6b86', 'center', true);
      TD.U.text(ctx, a.name, 100, y + 24, 21, has ? '#eafff0' : '#e8eef8', 'left', true);
      TD.U.text(ctx, a.desc, 100, y + 48, 15, '#8fa3c4');
      TD.U.text(ctx, has ? '已达成' : '货币 +' + a.reward, 656, y + 33, 17,
        has ? '#9fe8a8' : '#ffd75e', 'right', true);
      y += 74;
    }
  };

  OpsScene.prototype.drawDaily = function (ctx) {
    const tasks = TD.Daily.today();
    TD.U.text(ctx, '今日任务（每天 0 点刷新）· ' + TD.Daily.dayKey(), 40, 156, 18, '#8fa3c4');
    let y = 184;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (TD.Art) TD.Art.panel(ctx, { x: 40, y: y, w: 640, h: 108 }, '#7898bd');
      else TD.U.fillRound(ctx, 40, y, 640, 108, 12, 'rgba(22,29,44,0.9)');
      if (!TD.Art) TD.U.strokeRound(ctx, 40, y, 640, 108, 12, t.claimed ? '#4f7a5a' : '#2b3550', 1.5);
      TD.U.text(ctx, t.title, 64, y + 32, 22, '#e8eef8', 'left', true);
      /* 进度条 */
      const ratio = TD.U.clamp(t.progress / t.target, 0, 1);
      TD.U.fillRound(ctx, 64, y + 56, 380, 14, 7, 'rgba(0,0,0,0.5)');
      TD.U.fillRound(ctx, 65, y + 57, 378 * ratio, 12, 6, ratio >= 1 ? '#7fe08a' : '#5aa9ff');
      TD.U.text(ctx, t.progress + ' / ' + t.target, 456, y + 63, 16, '#c8d6ee', 'left');
      TD.U.text(ctx, '货币 +' + t.reward, 540, y + 32, 17, '#f1d08a', 'left', true);
      const btn = { x: 560, y: y + 52, w: 104, h: 44 };
      if (t.claimed) TD.UI.button(ctx, btn, '已领取', { disabled: true, small: true });
      else if (t.progress >= t.target) {
        TD.UI.button(ctx, btn, '领取', { color: '#2f6a4f', small: true });
        this.hit.claim.push({ id: t.id, rect: btn });
      } else TD.UI.button(ctx, btn, '进行中', { disabled: true, small: true });
      y += 118;
    }
    const done = tasks.filter(function (t) { return t.claimed; }).length;
    TD.U.text(ctx, '全部完成还有额外奖励：货币 +' + TD.DAILY_ALL_BONUS
      + '（当前 ' + done + '/' + tasks.length + '）', 40, y + 16, 18, '#8fa3c4');
    TD.U.text(ctx, '任务进度与「数据统计」共用计数：击杀 / 合成 / 招募 / 广告 / Boss 等都会累计。',
      40, y + 48, 16, '#5d6b86');
  };

  OpsScene.prototype.drawBoard = function (ctx) {
    const maps = TD.MAPS;
    for (let i = 0; i < maps.length; i++) {
      const r = { x: 40 + i * 130, y: 148, w: 120, h: 48 };
      TD.UI.button(ctx, r, maps[i].name, { color: this.boardIdx === i ? '#2f5fae' : '#26304a', small: true });
      this.hit.maps.push({ idx: i, rect: r });
    }
    const map = maps[this.boardIdx];
    const rows = TD.Board.local(map.id);
    TD.U.text(ctx, map.name + ' · 本机前 ' + TD.BOARD_SIZE + ' 名（星级优先，其次用时）', 40, 226, 18, '#8fa3c4');

    let y = 248;
    if (!rows.length) {
      if (TD.Art) TD.Art.panel(ctx, { x: 40, y: 248, w: 640, h: 120 }, '#c9964c');
      else TD.U.fillRound(ctx, 40, 248, 640, 120, 12, 'rgba(22,29,44,0.9)');
      TD.U.text(ctx, '还没有上榜成绩——通关这张地图就会记一笔。', 360, 308, 20, '#8fa3c4', 'center');
      y = 368;
    } else {
      for (let i = 0; i < rows.length; i++) {
        const e = rows[i];
        if (TD.Art) TD.Art.panel(ctx, { x: 40, y: y, w: 640, h: 84 }, i === 0 ? '#c9964c' : '#7898bd');
        else TD.U.fillRound(ctx, 40, y, 640, 84, 12, i === 0 ? 'rgba(48,44,20,0.7)' : 'rgba(22,29,44,0.9)');
        if (!TD.Art) TD.U.strokeRound(ctx, 40, y, 640, 84, 12, i === 0 ? '#c8a24a' : '#2b3550', 1.5);
        TD.U.text(ctx, '#' + (i + 1), 76, y + 42, 26, i === 0 ? '#ffd75e' : '#c8d6ee', 'center', true);
        TD.U.text(ctx, TD.U.stars(e.stars), 130, y + 30, 22, '#ffd75e', 'left', true);
        TD.U.text(ctx, '用时 ' + Math.floor(e.time / 60) + ' 分 ' + (e.time % 60) + ' 秒　击杀 ' + e.kills
          + '　漏怪 ' + e.leaked + (e.boss ? '　Boss ✓' : ''), 130, y + 58, 16, '#c8d6ee');
        TD.U.text(ctx, e.date, 656, y + 42, 15, '#6f7f9c', 'right');
        y += 92;
      }
    }
    TD.U.text(ctx, TD.Board.isRemote()
      ? '远端排行榜已接入：成绩会自动上报。'
      : '远端排行榜未接入（TD.Board.setProvider 可以接自己的服务端；现在是本机榜单）。',
      40, y + 40, 16, '#6f7f9c');
  };

  OpsScene.prototype.drawCloud = function (ctx) {
    TD.U.text(ctx, '把存档导出保存，或在新设备上导入，就能实现"云存档"搬运。', 40, 156, 18, '#8fa3c4');
    TD.U.text(ctx, '存档里包含：地图记录 / 通用货币 / 解锁内容 / 成就 / 每日任务 / 统计（不含局内进度）。',
      40, 184, 16, '#6f7f9c');

    const btns = [
      { id: 'exportCopy', label: '导出到剪贴板', color: '#2f5fae' },
      { id: 'exportFile', label: '下载存档文件', color: '#2f4a78' },
      { id: 'importClipboard', label: '从剪贴板导入', color: '#2f4a78' },
      { id: 'importFile', label: '选择文件导入', color: '#3a5f3f' },
    ];
    for (let i = 0; i < btns.length; i++) {
      const r = {
        x: 40 + (i % 2) * 330, y: 230 + Math.floor(i / 2) * 84, w: 310, h: 66,
      };
      TD.UI.button(ctx, r, btns[i].label, { color: btns[i].color, small: true });
      this.hit.cloud.push({ id: btns[i].id, rect: r });
    }

    const save = TD.Save.get();
    const lines = [
      '存档版本：v' + save.v + '　导出时间戳格式：ISO',
      '地图记录 ' + Object.keys(save.towerDefenseSave.mapRecords).length + ' 张　'
        + '已解锁内容 ' + save.metaProgress.unlocked.length + ' 项　'
        + '成就 ' + TD.Achievements.count() + '/' + TD.Achievements.list().length,
      '统计：对局 ' + save.stats.runs + ' / 击杀 ' + save.stats.kills
        + ' / 合成 ' + save.stats.merges + ' / 广告 ' + save.stats.adsWatched,
      TD.Cloud.isReal() ? '远端云存档已接入：可用 push()/pull() 同步。'
        : '远端云存档未接入（TD.Cloud.setProvider 可以接自己的服务端）。',
    ];
    let y = 430;
    if (TD.Art) TD.Art.panel(ctx, { x: 40, y: y, w: 640, h: 210 }, '#7898bd');
    else TD.U.fillRound(ctx, 40, y, 640, 210, 14, 'rgba(18,24,38,0.9)');
    if (!TD.Art) TD.U.strokeRound(ctx, 40, y, 640, 210, 14, '#2b3550', 2);
    lines.forEach(function (line, i) {
      TD.U.text(ctx, line, 64, y + 40 + i * 42, 17, i === 3 ? '#8fa3c4' : '#c8d6ee');
    });
    TD.U.text(ctx, '提示：导入会覆盖当前存档，建议先导出一份备份。', 40, y + 240, 16, '#6f7f9c');
  };

  TD.OpsScene = OpsScene;
})();
