/* 角色逻辑（设计规格 §61 / §82）：
 * 朝向与移动插值属于状态层；具体像素形象（挥镐 / 行走 / 头灯）由 MiningArt 绘制。
 * 保留本模块是为了让"逻辑 / 美术"继续分离（§6 的原则）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const walkClocks = new WeakMap();
  MM.Player = {
    advanceWalk(run, dt) { walkClocks.set(run, (walkClocks.get(run) || 0) + Math.max(0, dt)); },
    walkPhase(run) { return ((walkClocks.get(run) || 0) * 2.5) % 1; },
    face(run, dx, dy) {
      if (dx < 0) run.facing = 'left';
      else if (dx > 0) run.facing = 'right';
      else if (dy < 0) run.facing = 'up';
      else if (dy > 0) run.facing = 'down';
      if (!run.facing) run.facing = 'down';
    },

    /* 移动中的插值位置（返回格坐标浮点） */
    renderPos(run) {
      let px = run.playerX, py = run.playerY;
      if (run.move) {
        const m = run.move;
        const next = m.path[Math.min(m.i, m.path.length - 1)];
        const t = MM.U.clamp(m.t / (m.curDur || m.dur), 0, 1);
        px = MM.U.lerp(run.playerX, next.x, t);
        py = MM.U.lerp(run.playerY, next.y, t);
      }
      return { x: px, y: py };
    },

    /* 兼容旧接口：转发到美术层 */
    draw(ctx, run, cx, cy, cellSize) {
      MM.Art.drawMiner(ctx, run, cx, cy, cellSize, 0);
    },
  };
})();
