/* 守塔战线 · 解锁仓库（阶段五 / §34 / §52）
 *
 * 通用货币的消费出口：解锁的都是「外观 / 预留位」，规格明确禁止买永久数值。
 * 其他模式（例如主项目）可以通过 TD.Meta.register() 把自己的内容挂进来。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  function VaultScene(from) {
    this.speedScaled = false;
    this.from = from || 'title';
    this.hit = { back: null, buy: [] };
    this.toastText = '';
    this.toastTtl = 0;
  }

  VaultScene.prototype.enter = function () {
    this.hit = { back: null, buy: [] };
    this.toastText = '';
    this.toastTtl = 0;
  };

  VaultScene.prototype.update = function (dt) {
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
      for (let k = 0; k < this.hit.buy.length; k++) {
        const b = this.hit.buy[k];
        if (!TD.U.pointInRect(ev.x, ev.y, b.rect)) continue;
        const res = TD.Meta.buy(b.id);
        if (res.ok) {
          TD.Sfx.evolve();
          this.toastText = '已解锁：' + res.item.name;
        } else if (res.reason === 'currency') {
          TD.Sfx.deny();
          this.toastText = '通用货币不足（需要 ' + b.cost + '）';
        } else if (res.reason === 'owned') {
          this.toastText = '这个内容已经解锁了';
        }
        this.toastTtl = 2.0;
        return;
      }
    }
  };

  VaultScene.prototype.draw = function (ctx) {
    if (TD.Art) TD.Art.backdrop(ctx, 'menu');
    else { ctx.fillStyle = '#0f1420'; ctx.fillRect(0, 0, 720, 1280); }

    this.hit.back = { x: 12, y: 10, w: 56, h: 56 };
    this.hit.buy = [];
    TD.UI.button(ctx, this.hit.back, '←', { color: '#2a3550' });
    TD.U.text(ctx, '解锁仓库', 120, 40, 30, '#ffffff', 'left', true);
    if (!TD.Art || !TD.Art.icon(ctx, 'currency', 645, 40, 30)) TD.U.text(ctx, '◆', 645, 40, 24, '#9fd6ff', 'center', true);
    TD.U.text(ctx, String(TD.Meta.currency()), 699, 40, 24, '#9fd6ff', 'right', true);

    TD.U.text(ctx, '通用货币只能解锁「外观 / 内容」，不会强化英雄数值（§34）',
      40, 92, 17, '#6f7f9c');

    const items = TD.Meta.list();
    const x = 40;
    const w = 640;
    let y = 118;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const owned = TD.Meta.has(it.id);
      const reserved = it.kind === 'reserved';
      const h = 96;

      if (TD.Art) TD.Art.panel(ctx, { x: x, y: y, w: w, h: h }, owned ? '#82aa83' : '#7898bd');
      else { TD.U.fillRound(ctx, x, y, w, h, 14, '#161d2c'); TD.U.strokeRound(ctx, x, y, w, h, 14, owned ? '#4f7a5a' : '#2b3550', 2); }
      TD.U.text(ctx, it.name, x + 24, y + 32, 24, owned ? '#9fe8a8' : '#f2f6ff', 'left', true);
      TD.U.text(ctx, it.desc, x + 24, y + 66, 16, '#8fa3c4');

      const btn = { x: x + w - 200, y: y + h / 2 - 24, w: 176, h: 48 };
      if (owned) {
        TD.UI.button(ctx, btn, '已解锁', { disabled: true });
      } else if (reserved) {
        TD.UI.button(ctx, btn, '待其他模式接入', { disabled: true, small: true });
      } else {
        const afford = TD.Meta.canAfford(it.cost);
        TD.UI.button(ctx, btn, '解锁  ' + it.cost + ' 货币', { color: afford ? '#2f5fae' : '#3a3f52', disabled: !afford, small: true });
        if (afford) this.hit.buy.push({ id: it.id, cost: it.cost, rect: btn });
      }
      y += h + 14;
    }

    /* 数据统计（§52） */
    const s = TD.Meta.stats();
    const sy = y + 12;
    if (TD.Art) TD.Art.panel(ctx, { x: x, y: sy, w: w, h: 230 }, '#c9964c');
    else { TD.U.fillRound(ctx, x, sy, w, 230, 14, 'rgba(18,24,38,0.9)'); TD.U.strokeRound(ctx, x, sy, w, 230, 14, '#2b3550', 2); }
    TD.U.text(ctx, '数据统计', x + 24, sy + 32, 22, '#ffd75e', 'left', true);
    const winRate = s.runs ? Math.round(100 * s.wins / s.runs) : 0;
    const lines = [
      '对局 ' + s.runs + '　胜利 ' + s.wins + '　失败 ' + s.losses + '　胜率 ' + winRate + '%',
      '击杀 ' + s.kills + '　漏怪 ' + s.leaked + '　Boss 击杀 ' + s.bossKills,
      '招募 ' + s.recruits + '　合成 ' + s.merges + '　最终进化 ' + s.evolutions + '　广告 ' + s.adsWatched,
      '最佳星级 ' + TD.U.stars(s.bestStars || 0) + '　最快通关 '
        + (s.fastestClearSec ? Math.round(s.fastestClearSec / 60) + ' 分 ' + (s.fastestClearSec % 60) + ' 秒' : '—'),
    ];
    for (let i = 0; i < lines.length; i++) {
      TD.U.text(ctx, lines[i], x + 24, sy + 70 + i * 36, 18, '#c8d6ee');
    }

    TD.U.text(ctx, '提示：其他模式可以用 TD.Meta.register() 把自己的解锁内容挂进这个仓库。',
      360, 1216, 15, '#5d6b86', 'center');

    if (this.toastTtl > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.toastTtl / 0.4);
      if (TD.Art) TD.Art.panel(ctx, { x: 140, y: 918, w: 440, h: 52 }, '#c9964c');
      else { TD.U.fillRound(ctx, 140, 918, 440, 52, 12, 'rgba(10,14,22,0.94)'); TD.U.strokeRound(ctx, 140, 918, 440, 52, 12, '#3a4a6e', 1.5); }
      TD.U.text(ctx, this.toastText, 360, 944, 19, '#ffd75e', 'center', true);
      ctx.restore();
    }
  };

  TD.VaultScene = VaultScene;
})();
