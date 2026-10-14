/* 主模式占位场景（仅用于验证存档隔离，§71 / §78㉔）。
 * 它使用一个独立的占位键 forgotten-tower.main.placeholder.v1，
 * 绝不触碰主模式真实存档；地下矿坑的任何操作都不应该改变这里的数值。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  function MainPlaceholderScene() {
    this.speedScaled = false;
    this.hit = {};
  }

  MainPlaceholderScene.prototype.enter = function () { this.hit = {}; };

  MainPlaceholderScene.prototype.update = function () {
    const events = MM.Input.consume();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type !== 'down') continue;
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.up)) { MM.Save.mainPlaceholder.addFloor(); continue; }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.reset)) { MM.Save.mainPlaceholder.reset(); continue; }
      if (MM.U.pointInRect(ev.x, ev.y, this.hit.back)) { MM.Game.setScene(new MM.TitleScene()); return; }
    }
  };

  MainPlaceholderScene.prototype.draw = function (ctx) {
    ctx.fillStyle = '#141018';
    ctx.fillRect(0, 0, 720, 1280);

    const o = MM.Save.mainPlaceholder.load();
    MM.U.text(ctx, '主模式（占位演示）', 360, 210, 40, '#ffffff', 'center', true);
    MM.U.text(ctx, '这一屏只是一个独立的"假主模式"存档，用来验证：', 360, 268, 19, '#8fa3c4', 'center');
    MM.U.text(ctx, '地下矿坑的挖掘 / 结算 / 清档，完全不会影响主魔塔数据。', 360, 298, 19, '#8fa3c4', 'center');

    MM.U.fillRound(ctx, 150, 380, 420, 200, 16, 'rgba(30,24,38,0.95)');
    MM.U.text(ctx, '楼层：' + o.floor + ' 层', 360, 450, 30, '#ffd75e', 'center', true);
    MM.U.text(ctx, '金币：' + o.gold, 360, 510, 30, '#ffd75e', 'center', true);

    this.hit.up = { x: 160, y: 650, w: 400, h: 84 };
    MM.UI.button(ctx, this.hit.up, '上一层（+10 金币）', { color: '#5a4632' });
    this.hit.reset = { x: 160, y: 754, w: 400, h: 74 };
    MM.UI.button(ctx, this.hit.reset, '重置占位存档', { color: '#3a3f52' });
    this.hit.back = { x: 160, y: 848, w: 400, h: 84 };
    MM.UI.button(ctx, this.hit.back, '返回标题', { color: '#2f4a78' });

    MM.U.text(ctx, '占位存档键：' + MM.Save.MAIN_PLACEHOLDER_KEY, 360, 990, 15, '#6f7f9c', 'center');
    MM.U.text(ctx, '矿坑纪录键：' + MM.Save.KEY + '（互不影响）', 360, 1018, 15, '#6f7f9c', 'center');
  };

  MM.MainPlaceholderScene = MainPlaceholderScene;
})();
