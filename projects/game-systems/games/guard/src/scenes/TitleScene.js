/* 标题场景：模式入口（§48-①）。
 * 提供「守塔战线」入口和一个「主模式（占位演示）」入口，
 * 后者只用来验证两条存档链互不干扰。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  function TitleScene() {
    this.speedScaled = false;
    this.hit = {};
  }

  TitleScene.prototype.enter = function () { this.hit = {}; };

  TitleScene.prototype.update = function () {
    const events = TD.Input.consume();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type !== 'down') continue;
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.td)) { TD.Game.setScene(new TD.MapSelectScene()); return; }
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.main)) { TD.Game.setScene(new TD.MainPlaceholderScene()); return; }
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.vault)) { TD.Game.setScene(new TD.VaultScene('title')); return; }
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.ops)) { TD.Game.setScene(new TD.OpsScene('title')); return; }
      if (TD.U.pointInRect(ev.x, ev.y, this.hit.tutorial)) {
        TD.Save.setTutorialDone(false);
        TD.Tutorial.reset();
        return;
      }
    }
  };

  TitleScene.prototype.draw = function (ctx) {
    if (TD.Art) TD.Art.backdrop(ctx, 'menu');
    else { ctx.fillStyle = '#0f1420'; ctx.fillRect(0, 0, 720, 1280); }

    TD.U.text(ctx, '再上一层', 360, 200, 64, '#ffffff', 'center', true);
    TD.U.text(ctx, '守塔战线 · V' + TD.VERSION + ' 正式内容版', 360, 264, 30, '#ffd75e', 'center', true);
    TD.U.text(ctx, '数据驱动配置 · 独立战斗状态 · 独立存档（不碰主模式）', 360, 306, 19, '#8fa3c4', 'center');

    this.hit.td = { x: 160, y: 452, w: 400, h: 104 };
    TD.UI.button(ctx, this.hit.td, '守塔战线\n进入塔防模式', { color: '#2f5fae' });

    this.hit.main = { x: 160, y: 572, w: 190, h: 64 };
    TD.UI.button(ctx, this.hit.main, '主模式（占位）', { color: '#3a3f52', small: true });
    this.hit.vault = { x: 370, y: 572, w: 190, h: 64 };
    TD.UI.button(ctx, this.hit.vault, '解锁仓库', { color: '#2f4a78', small: true });

    const save = TD.Save.get();
    const st = TD.Meta.stats();
    const winRate = st.runs ? Math.round(100 * st.wins / st.runs) : 0;
    TD.U.text(ctx,
      '通用货币 ' + save.metaProgress.currency + '　·　已解锁地图 '
      + save.towerDefenseSave.unlockedMaps.length + ' / ' + TD.MAPS.length,
      360, 672, 21, '#ffd75e', 'center');

    /* 数据统计（§52） */
    if (TD.Art) TD.Art.panel(ctx, { x: 140, y: 694, w: 440, h: 108 }, '#c9964c');
    else { TD.U.fillRound(ctx, 140, 694, 440, 108, 14, 'rgba(18,24,38,0.85)'); TD.U.strokeRound(ctx, 140, 694, 440, 108, 14, '#2b3550', 1.5); }
    TD.U.text(ctx, '对局 ' + st.runs + '　胜率 ' + winRate + '%　Boss 击杀 ' + st.bossKills
      + '　最佳 ' + TD.U.stars(st.bestStars || 0),
      360, 722, 18, '#c8d6ee', 'center');
    TD.U.text(ctx, '击杀 ' + st.kills + '　合成 ' + st.merges + '　最终进化 ' + st.evolutions
      + '　广告 ' + st.adsWatched,
      360, 754, 18, '#c8d6ee', 'center');
    TD.U.text(ctx, '最快通关 ' + (st.fastestClearSec
      ? Math.round(st.fastestClearSec / 60) + ' 分 ' + (st.fastestClearSec % 60) + ' 秒' : '—'),
      360, 786, 18, '#8fa3c4', 'center');

    this.hit.ops = { x: 160, y: 812, w: 190, h: 44 };
    TD.UI.button(ctx, this.hit.ops, '运营中心', { color: '#2f4a78', small: true });
    this.hit.tutorial = { x: 370, y: 812, w: 190, h: 44 };
    TD.UI.button(ctx, this.hit.tutorial, '重看新手引导', { color: '#3a3f52', small: true });

    TD.U.text(ctx, '守塔战线存档键：' + TD.Save.KEY, 360, 884, 16, '#6f7f9c', 'center');
    TD.U.text(ctx, '（主模式真实存档 forgotten-tower.* 本原型绝不读写）', 360, 908, 16, '#6f7f9c', 'center');

    TD.U.text(ctx, 'V' + TD.VERSION + ' 内容：5 张正式地图 · 20+1 波 · 六职业机制 · 12 种最终进化',
      360, 1040, 17, '#5d6b86', 'center');
    TD.U.text(ctx, '像素美术 / 音效 / 新手引导 / 数据统计 · 零依赖，双击 index.html 即玩',
      360, 1070, 17, '#5d6b86', 'center');
  };

  TD.TitleScene = TitleScene;
})();
