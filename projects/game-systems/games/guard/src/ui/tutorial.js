/* 守塔战线 · 新手引导（阶段五 / §52）
 *
 * 第一局进入 map01 时自动出现，共 5 步；随时可以跳过；
 * 完成后写进存档，之后不再出现（标题界面可以「重看引导」）。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const STEPS = [
    {
      id: 'recruit', anchor: 'recruitBtn',
      text: '先招募 3 个英雄：点下面的「招募英雄」按钮（20 金币 / 次）。',
      cond(run, ctx) { return TD.Heroes.count(run) >= 3; },
    },
    {
      id: 'merge',
      text: '把两个「相同职业 + 相同星级」的英雄拖到一起 → 合成升星，格子也会省出来。',
      cond(run, ctx) { return TD.Meta.stats().merges > ctx.merges; },
    },
    {
      id: 'combat', manual: true,
      text: '整备倒计时结束后会自动开打；英雄会自动攻击离终点最近的敌人，你只需要管阵容。',
    },
    {
      id: 'evolve', manual: true,
      text: '攒到 4★ 后点开英雄 → 选择「最终进化」（二选一），战力与外观都会明显升级。',
      cond(run, ctx) { return TD.Meta.stats().evolutions > ctx.evolutions; },
    },
    {
      id: 'finish', manual: true, final: true,
      text: '守住 20 波就算通关；之后还有额外 Boss 挑战（首杀有通用货币奖励）。开始守塔吧！',
    },
  ];

  const Tutorial = {
    step: 0,
    ctx: null,
    active: false,
    hit: [],

    reset() { this.step = 0; this.ctx = null; this.active = false; this.hit = []; },

    shouldShow(run) {
      if (!run || run.mapId !== 'map01') return false;
      if (TD.Save.isTutorialDone()) return false;
      return !TD.State.isOver(run);
    },

    update(run) {
      this.active = this.shouldShow(run);
      if (!this.active) return;
      if (!this.ctx) {
        const s = TD.Meta.stats();
        this.ctx = { merges: s.merges, evolutions: s.evolutions };
      }
      const st = STEPS[this.step];
      if (!st) { this.finish(); return; }
      if (st.cond && st.cond(run, this.ctx)) this.next();
    },

    next() {
      this.step += 1;
      if (this.step >= STEPS.length) this.finish();
    },

    finish() {
      this.active = false;
      TD.Save.setTutorialDone(true);
    },

    draw(ctx, run) {
      if (!this.active) return;
      const st = STEPS[this.step];
      if (!st) return;
      this.hit = [];

      /* 锚点高亮 */
      let anchor = null;
      if (st.anchor === 'recruitBtn') anchor = TD.LAYOUT.recruitBtn;
      if (anchor) {
        ctx.save();
        ctx.strokeStyle = 'rgba(220,165,82,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(anchor.x - 4, anchor.y - 4, anchor.w + 8, anchor.h + 8);
        ctx.restore();
      }

      /* 底部气泡 */
      const bx = 40;
      const bw = 640;
      const bh = 148;
      const by = 1002;
      if (TD.Art) TD.Art.panel(ctx, { x: bx, y: by, w: bw, h: bh }, '#c9964c');
      else { TD.U.fillRound(ctx, bx, by, bw, bh, 16, 'rgba(13,19,30,0.97)'); TD.U.strokeRound(ctx, bx, by, bw, bh, 16, '#c9964c', 2); }
      TD.U.text(ctx, '新手引导  ' + (this.step + 1) + ' / ' + STEPS.length, bx + 24, by + 28, 18, '#f1d08a', 'left', true);
      TD.U.wrapText(ctx, st.text, bx + 24, by + 62, bw - 48, 26, 20, '#e8eef8');

      const skip = { x: bx + 24, y: by + bh - 52, w: 150, h: 40 };
      TD.UI.button(ctx, skip, '跳过引导', { color: '#3a3f52', small: true });
      this.hit.push({ id: 'skip', rect: skip });

      const isLast = this.step === STEPS.length - 1;
      const next = { x: bx + bw - 194, y: by + bh - 56, w: 170, h: 48 };
      TD.UI.button(ctx, next, isLast ? '开始守塔！' : (st.manual ? '继续' : '下一步'),
        { color: isLast ? '#2f6a4f' : '#2f5fae', small: true });
      this.hit.push({ id: 'next', rect: next });
    },

    /* 只吃自己的按钮（不挡玩家操作棋盘） */
    handleClick(ev) {
      if (!this.active) return false;
      for (let i = 0; i < this.hit.length; i++) {
        const b = this.hit[i];
        if (!TD.U.pointInRect(ev.x, ev.y, b.rect)) continue;
        if (b.id === 'skip') this.finish();
        else this.next();
        return true;
      }
      return false;
    },
  };

  TD.Tutorial = Tutorial;
})();
