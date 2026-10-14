/* 调试面板（§54）：开发期专用。
 * 正式发布把 TD.BALANCE.DEV_MODE 改成 false，入口按钮与面板一起消失。
 * 所有操作只影响当前这一局（"重置地图记录"除外，那是明确要重置存档的）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});
  const S = TD.RunState;

  const classIdx = { v: 0 };

  const Debug = {
    rects: [],

    draw(ctx, run, mode) {
      const P = { x: 26, y: 170, w: 668, h: 810 };
      ctx.fillStyle = 'rgba(6,8,12,0.88)';
      ctx.fillRect(0, 0, 720, 1280);
      if (TD.Art) TD.Art.panel(ctx, P, '#c9964c');
      else { TD.U.fillRound(ctx, P.x, P.y, P.w, P.h, 18, '#141b2b'); TD.U.strokeRound(ctx, P.x, P.y, P.w, P.h, 18, '#3a4a6e', 2); }
      const fps = Math.round(TD.Game && TD.Game.fps ? TD.Game.fps : 0);
      TD.U.text(ctx, '调试面板（DEV_MODE）', P.x + 28, P.y + 42, 28, '#ffd75e', 'left', true);
      TD.U.text(ctx, fps + ' fps', P.x + P.w - 28, P.y + 42, 22, '#9fd6ff', 'right', true);

      const items = this.items(run);
      this.rects = [];
      const cols = 2;
      const bw = (P.w - 28 * 2 - 18) / cols;
      const bh = 62;
      const gap = 14;
      for (let i = 0; i < items.length; i++) {
        const c = i % cols;
        const row = Math.floor(i / cols);
        const r = { x: P.x + 28 + c * (bw + 18), y: P.y + 82 + row * (bh + gap), w: bw, h: bh };
        this.rects.push({ id: items[i].id, rect: r });
        TD.UI.button(ctx, r, items[i].label, { color: items[i].color || '#2f4a78', small: true });
      }
      TD.U.text(ctx, '提示：+金币 / 无敌 / 跳波 / 生成英雄 / 速度，都不写存档；',
        P.x + 28, P.y + P.h - 46, 16, '#7d8aa6');
      TD.U.text(ctx, '「重置地图记录」会清空守塔战线存档（不影响主模式）。',
        P.x + 28, P.y + P.h - 22, 16, '#7d8aa6');
    },

    items(run) {
      const cls = TD.HEROES[classIdx.v].name;
      const speed = TD.Game ? TD.Game.speed : 1;
      return [
        { id: 'gold', label: '+100 金币' },
        { id: 'invincible', label: '终点无敌：' + (run.debug.invincible ? '开' : '关'), color: run.debug.invincible ? '#2f6a4f' : '#2f4a78' },
        { id: 'nextwave', label: '立即下一波' },
        { id: 'lastwave', label: '跳到最后一波' },
        { id: 'boss', label: '跳到 Boss 波' },
        { id: 'class', label: '职业：' + cls + '（点击切换）' },
        { id: 'spawn1', label: '生成 ' + cls + ' 1★' },
        { id: 'spawn2', label: '生成 ' + cls + ' 2★' },
        { id: 'spawn3', label: '生成 ' + cls + ' 3★' },
        { id: 'spawn4', label: '生成 ' + cls + ' 4★' },
        { id: 'evolve', label: '一键进化第一个 4★' },
        { id: 'clearenemies', label: '清空怪物' },
        { id: 'speed', label: '游戏速度 ×' + speed },
        { id: 'lowfx', label: '低配模式：' + (TD.lowFx() ? '开' : '关'), color: TD.lowFx() ? '#2f6a4f' : '#2f4a78' },
        { id: 'reset', label: '重置地图记录' },
        { id: 'clearStats', label: '清空统计' },
        { id: 'close', label: '关闭面板' },
      ];
    },

    /* 面板打开时吞掉全部输入（返回 true = 已消费） */
    handleEvent(mode, run, ev) {
      if (ev.type !== 'down') return true;
      for (let i = 0; i < this.rects.length; i++) {
        const item = this.rects[i];
        if (!TD.U.pointInRect(ev.x, ev.y, item.rect)) continue;
        this.act(item.id, mode, run);
        return true;
      }
      return true;
    },

    act(id, mode, run) {
      const H = TD.Heroes;

      if (id === 'gold') {
        run.gold += 100;
      } else if (id === 'invincible') {
        run.debug.invincible = !run.debug.invincible;
      } else if (id === 'nextwave') {
        if (run.state === S.PREPARE || run.state === S.BOSS_PREPARE) TD.Waves.skipPrepare(run);
        else if (run.state === S.WAVE_RUNNING || run.state === S.BOSS_RUNNING) TD.Enemies.clearAll(run);
        else if (run.state === S.WAVE_CLEAR) run.waveClearTimer = 0.01;
        else if (run.state === S.MAIN_CLEAR) run.mainClearTimer = 0.01;
      } else if (id === 'lastwave') {
        if (!TD.State.isOver(run)) {
          TD.Enemies.clearAll(run);
          run.wave = run.totalNormalWaves;
          TD.Waves.enterPrepare(run);
          run.prepareTimer = 0.5;
        }
      } else if (id === 'boss') {
        if (!TD.State.isOver(run)) {
          TD.Enemies.clearAll(run);
          TD.Waves.enterBossPrepare(run);
          run.prepareTimer = 0.5;
        }
      } else if (id === 'class') {
        classIdx.v = (classIdx.v + 1) % TD.HEROES.length;
      } else if (id === 'spawn1' || id === 'spawn2' || id === 'spawn3' || id === 'spawn4') {
        const star = Number(id.slice(5));
        if (H.capacityFull(run)) {
          TD.UI.toast(run, '位子满了，无法生成', '#ffb0b0');
        } else {
          const hero = H.create(run, TD.HEROES[classIdx.v].id, star);
          H.placeAuto(run, hero);
          H.refreshBest(run);
        }
      } else if (id === 'evolve') {
        const list = H.all(run);
        for (let i = 0; i < list.length; i++) {
          if (TD.Evolve.canEvolve(list[i])) {
            TD.Evolve.evolve(run, list[i], TD.Evolve.options(list[i])[0].id);
            TD.UI.toast(run, TD.Heroes.label(list[i]) + ' 进化完成！', '#ffd75e');
            break;
          }
        }
      } else if (id === 'clearenemies') {
        TD.Enemies.clearAll(run);
      } else if (id === 'speed') {
        if (TD.Game) TD.Game.cycleSpeed();
      } else if (id === 'lowfx') {
        TD.Save.setLowFx(!TD.lowFx());
      } else if (id === 'clearStats') {
        TD.Meta.reset();
      } else if (id === 'reset') {
        TD.Save.reset();
        TD.Game.setScene(new TD.MapSelectScene());
      } else if (id === 'close') {
        mode.debugOpen = false;
      }
    },
  };

  TD.DebugPanel = Debug;
})();
