/* 主模式占位场景（不是魔塔玩法本身）
 *
 * 目的只有一个：证明"主模式存档"和"守塔战线存档"完全隔离（§58-⑯⑰）。
 * 它只写 forgotten-tower.main.placeholder.v1 这个占位键，
 * 绝不触碰主项目的真实存档键（forgotten-tower.original50.v1 等）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  function MainPlaceholderScene() {
    this.speedScaled = false;
    this.hit = {};
  }

  MainPlaceholderScene.prototype.enter = function () { this.hit = {}; };

  MainPlaceholderScene.prototype.update = function () {
    const events = TD.Input.consume();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type !== 'down') continue;
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.back)) { TD.Game.setScene(new TD.TitleScene()); return; }
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.add)) { TD.Save.mainPlaceholder.addFloor(); return; }
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.reset)) { TD.Save.mainPlaceholder.reset(); return; }
    }
  };

  MainPlaceholderScene.prototype.draw = function (ctx) {
    if (TD.Art) TD.Art.backdrop(ctx, 'menu');
    else { ctx.fillStyle = '#0f1420'; ctx.fillRect(0, 0, 720, 1280); }

    this.hit.back = { x: 12, y: 10, w: 56, h: 56 };
    TD.UI.button(ctx, this.hit.back, '←', { color: '#2a3550' });

    TD.U.text(ctx, '主模式（占位演示）', 360, 120, 36, '#ffffff', 'center', true);
    TD.U.text(ctx, '这不是魔塔玩法本身，只用来验证两条存档链完全隔离：', 360, 176, 19, '#8fa3c4', 'center');
    TD.U.text(ctx, '两边随便存，都不会互相串数据。', 360, 206, 19, '#8fa3c4', 'center');

    const mp = TD.Save.mainPlaceholder.load();
    const td = TD.Save.get();

    if (TD.Art) TD.Art.panel(ctx, { x: 40, y: 270, w: 640, h: 240 }, '#7898bd');
    else { TD.U.fillRound(ctx, 40, 270, 640, 240, 18, '#161d2c'); TD.U.strokeRound(ctx, 40, 270, 640, 240, 18, '#2b3550', 2); }
    TD.U.text(ctx, '主模式占位存档', 70, 314, 26, '#f2f6ff', 'left', true);
    TD.U.text(ctx, '键：' + TD.Save.MAIN_PLACEHOLDER_KEY, 70, 350, 16, '#6f7f9c');
    TD.U.text(ctx, '楼层 ' + mp.floor + 'F　金币 ' + mp.gold, 70, 404, 30, '#ffd75e', 'left', true);

    this.hit.add = { x: 340, y: 376, w: 300, h: 60 };
    TD.UI.button(ctx, this.hit.add, '+1 层（写主模式存档）', { color: '#3a5f3f', small: true });
    this.hit.reset = { x: 340, y: 448, w: 300, h: 46 };
    TD.UI.button(ctx, this.hit.reset, '重置主模式占位存档', { color: '#3a3f52', small: true });

    if (TD.Art) TD.Art.panel(ctx, { x: 40, y: 540, w: 640, h: 250 }, '#c9964c');
    else { TD.U.fillRound(ctx, 40, 540, 640, 250, 18, '#161d2c'); TD.U.strokeRound(ctx, 40, 540, 640, 250, 18, '#2b3550', 2); }
    TD.U.text(ctx, '守塔战线存档（独立）', 70, 584, 26, '#f2f6ff', 'left', true);
    TD.U.text(ctx, '键：' + TD.Save.KEY, 70, 620, 16, '#6f7f9c');
    TD.U.text(ctx,
      '通用货币 ' + td.metaProgress.currency + '　已解锁地图 '
      + td.towerDefenseSave.unlockedMaps.length + ' / ' + TD.MAPS.length,
      70, 672, 24, '#9fd6ff', 'left', true);
    TD.U.text(ctx, '合并进《再上一层》后，这个入口会换成真正的主模式界面，', 70, 722, 17, '#8fa3c4');
    TD.U.text(ctx, '守塔战线只需要一个按钮调用 MT.TD.start()。', 70, 750, 17, '#8fa3c4');

    TD.U.text(ctx, '建议验收：这里 +1 层 → 回标题 → 进守塔战线打一局 → 再回来对比，两边数据各自独立。',
      360, 900, 18, '#5d6b86', 'center');
  };

  TD.MainPlaceholderScene = MainPlaceholderScene;
})();
