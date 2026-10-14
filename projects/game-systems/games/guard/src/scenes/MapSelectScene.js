/* 地图选择：5 张地图 + 星级 / 最佳生命 / Boss 首杀记录（§4 / §5 / §6）。
 * V0.1 只有第一张可玩，其余显示解锁与制作状态。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  function MapSelectScene() {
    this.speedScaled = false;
    this.hit = { back: null, enter: [] };
  }

  MapSelectScene.prototype.enter = function () {
    this.hit = { back: null, enter: [] };
  };

  MapSelectScene.prototype.update = function () {
    const events = TD.Input.consume();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type !== 'down') continue;

      if (TD.U.pointInRect(ev.x, ev.y, this.hit.back)) {
        TD.Game.setScene(new TD.TitleScene());
        return;
      }
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.vault)) {
        TD.Game.setScene(new TD.VaultScene('maps'));
        return;
      }
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.ops)) {
        TD.Game.setScene(new TD.OpsScene('maps'));
        return;
      }
      for (let k = 0; k < this.hit.enter.length; k++) {
        const b = this.hit.enter[k];
        if (!TD.U.pointInRect(ev.x, ev.y, b.rect)) continue;
        const map = TD.MAP_BY_ID[b.mapId];
        if (map && map.playable && TD.Save.isUnlocked(map.id)) {
          TD.Game.setScene(new TD.TowerDefenseMode(map.id));
        }
        return;
      }
    }
  };

  MapSelectScene.prototype.draw = function (ctx) {
    if (TD.Art) TD.Art.backdrop(ctx, 'menu');
    else { ctx.fillStyle = '#0f1420'; ctx.fillRect(0, 0, 720, 1280); }

    this.hit.enter = [];
    this.hit.back = { x: 12, y: 10, w: 56, h: 56 };
    TD.UI.button(ctx, this.hit.back, '←', { color: '#2a3550' });

    TD.U.text(ctx, '选择地图', 120, 40, 30, '#ffffff', 'left', true);
    if (!TD.Art || !TD.Art.icon(ctx, 'currency', 645, 40, 30)) TD.U.text(ctx, '◆', 645, 40, 24, '#9fd6ff', 'center', true);
    TD.U.text(ctx, String(TD.Save.currency()), 699, 40, 24, '#9fd6ff', 'right', true);

    const x = 40, w = 640, h = 150, gap = 22;
    let y = 126;
    for (let i = 0; i < TD.MAPS.length; i++) {
      const m = TD.MAPS[i];
      const rec = TD.Save.mapRecord(m.id);
      const unlocked = TD.Save.isUnlocked(m.id);

      const accent = rec.cleared ? '#82aa83' : (TD.Art ? TD.Art.mapTheme(m.id).accent : '#7898bd');
      if (TD.Art) {
        TD.Art.panel(ctx, { x: x, y: y, w: w, h: h }, accent);
        TD.Art.drawMapThumb(ctx, m, { x: x + 18, y: y + 42, w: 60, h: 66 });
      } else { TD.U.fillRound(ctx, x, y, w, h, 18, '#161d2c'); TD.U.strokeRound(ctx, x, y, w, h, 18, rec.cleared ? '#4f7a5a' : '#2b3550', 2); }

      const textX = x + 94;
      TD.U.text(ctx, m.name, textX, y + 40, 26, unlocked ? '#f2f6ff' : '#6b7890', 'left', true);
      const descWidth = (x + w - 204) - textX - 12;
      TD.U.text(ctx, TD.U.fitText(ctx, m.desc, descWidth, 15, false), textX, y + 76, 15, '#aabbd0');

      if (rec.cleared) {
        TD.U.text(ctx,
          TD.U.stars(rec.bestStars) + '　最佳生命 ' + rec.bestEndpointHP
          + '　Boss首杀 ' + (rec.bossFirstClear ? '✓' : '—') + '　Boss击杀 ' + rec.bossKillCount,
          textX, y + 114, 15, '#f1d08a');
      } else if (!unlocked) {
        TD.U.text(ctx, '通关上一张地图后解锁', textX, y + 114, 16, '#8c9bb0');
      } else if (!m.playable) {
        TD.U.text(ctx, '已解锁 · 内容在阶段三制作', textX, y + 114, 16, '#8c9bb0');
      } else {
        TD.U.text(ctx, '尚无通关记录', textX, y + 114, 16, '#8c9bb0');
      }

      const btn = { x: x + w - 204, y: y + h / 2 - 32, w: 168, h: 64 };
      if (m.playable && unlocked) {
        TD.UI.button(ctx, btn, '进入', { color: '#2f5fae' });
        this.hit.enter.push({ mapId: m.id, rect: btn });
      } else if (!unlocked) {
        TD.UI.button(ctx, btn, '未解锁', { disabled: true });
      } else {
        TD.UI.button(ctx, btn, 'V0.1 未开放', { disabled: true });
      }
      y += h + gap;
    }

    TD.U.text(ctx, '每张地图都是 20+1 波 · 12 战斗位 + 4 备战位 · 通关解锁下一张',
      360, y + 14, 17, '#5d6b86', 'center');

    this.hit.vault = { x: 208, y: y + 46, w: 150, h: 46 };
    TD.UI.button(ctx, this.hit.vault, '解锁仓库', { color: '#2f4a78', small: true });
    this.hit.ops = { x: 370, y: y + 46, w: 150, h: 46 };
    TD.UI.button(ctx, this.hit.ops, '运营中心', { color: '#2f4a78', small: true });
  };

  TD.MapSelectScene = MapSelectScene;
})();
