/* 移动系统（设计规格 §9 / §11 / §12 / §59 / §73）：
 *   - 上下左右四方向；禁止斜向移动；
 *   - 已挖开的格子移动不消耗体力，可以自由返回（§11 硬性要求）；
 *   - 点击远处已挖区域 → BFS 沿已挖道路自动寻路（§12，只经过已挖格）；
 *   - 返回入口 = 免费的自动寻路移动（V0.6：不再是撤离方式；可经过矿车连接）。
 * 动画状态保存在 run.move 里：{ kind:'step'|'walk', path, i, t, dur, toEntrance }。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Move = {
    walkable(map, x, y) {
      const cell = map.get(x, y);
      return !!cell && cell.excavated;
    },

    isAdjacent(run, x, y) {
      return MM.U.manhattan(run.playerX, run.playerY, x, y) === 1;
    },

    /* 相邻一步（挖开格子后走进新格 / 相邻已挖格之间平移） */
    startStep(run, map, x, y) {
      if (!this.walkable(map, x, y)) return { ok: false, reason: 'blocked', message: '该格还没有挖开' };
      run.move = {
        kind: 'step',
        path: [{ x, y }],
        i: 0, t: 0,
        dur: MM.BALANCE.ANIM.MOVE_TIME,
        toEntrance: false,
      };
      return { ok: true, move: run.move };
    },

    /* 自动寻路（只经过已挖格，§12） */
    startWalk(run, map, x, y, opts) {
      const o = opts || {};
      if (!this.walkable(map, x, y)) {
        return { ok: false, reason: 'blocked', message: '目标格还没有挖开' };
      }
      if (x === run.playerX && y === run.playerY) {
        return { ok: false, reason: 'same', message: '已经站在目标格上' };
      }
      const path = MM.Pathfinder.bfsExcavated(map, { x: run.playerX, y: run.playerY }, { x, y });
      if (!path || !path.length) {
        return { ok: false, reason: 'noPath', message: '没有已挖通的路线可以过去' };
      }
      run.move = {
        kind: 'walk',
        path,
        i: 0, t: 0,
        dur: MM.BALANCE.ANIM.WALK_TIME,
        toEntrance: !!o.toEntrance,
      };
      return { ok: true, move: run.move, path };
    },

    /* §59：点击"返回入口"沿已挖路径自动回走 */
    startReturnToEntrance(run, map) {
      return this.startWalk(run, map, map.entrance.x, map.entrance.y, { toEntrance: true });
    },

    atEntrance(run, map) {
      return run.playerX === map.entrance.x && run.playerY === map.entrance.y;
    },

    cancel(run) { run.move = null; },

    /* 推进移动动画；返回事件：'arrive'（每进一格） / 'moveDone'（本次结束） */
    update(run, map, dt) {
      const events = [];
      if (run.move) MM.Player.advanceWalk(run, dt);
      let guard = 0;
      while (run.move && guard++ < 500) {
        const m = run.move;
        const next = m.path[m.i];
        const from = { x: run.playerX, y: run.playerY };
        /* V0.6：矿车连接段按"乘坐"处理（更长的一次位移，免费、跨过的岩块保持未挖） */
        const isHop = MM.Cart && MM.Cart.isLinkStep(map, from, next);
        m.isHop = !!isHop;
        MM.Player.face(run, next.x - from.x, next.y - from.y);
        const dur = isHop ? MM.BALANCE.ANIM.CART_TIME : m.dur;
        m.curDur = dur;
        m.t += dt;
        if (m.t < dur) break;
        m.t -= dur;
        if (isHop) events.push({ type: 'cartHop', from: from, to: { x: next.x, y: next.y } });
        run.playerX = next.x;
        run.playerY = next.y;
        m.i++;
        events.push({ type: 'arrive', x: next.x, y: next.y, kind: m.kind, hop: !!isHop });
        if (m.i >= m.path.length) {
          events.push({ type: 'moveDone', kind: m.kind, toEntrance: !!m.toEntrance, x: next.x, y: next.y });
          run.move = null;
          break;
        }
        dt = m.t;          // 剩余时间继续消耗（动画超长帧也不会丢步）
        m.t = 0;
      }
      return events;
    },
  };
})();
