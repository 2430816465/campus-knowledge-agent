/* 局内工具（设计规格 §25～§28 / §78⑧⑨⑩）：
 *   炸药：目标格 + 上下左右共最多 5 格；炸开的格子不耗体力、正常拿矿物、
 *          正常触发视野、可以打开隐藏区域入口；边界自动裁切，不炸出地图。
 *   强化矿镐：下一次成功挖掘不消耗体力（freeDig = true）。
 *   探矿灯：视野 3 → 5，持续接下来 5 次"成功挖掘"（按次数不按时间）。
 * 炸药不计入"成功挖掘"，因此不会消耗探矿灯次数——探矿灯只跟着挥镐走。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Tools = {
    count(run, id) { return run.tools[id] || 0; },

    /* 十字爆破范围（含目标格，边界裁切） */
    blastCells(map, x, y, run, requestedAxis) {
      const cells = [];
      const add = (cx, cy) => {
        const cell = map.get(cx, cy);
        if (cell && cells.length < MM.BALANCE.TOOL.BOMB_MAX_CELLS) cells.push(cell);
      };
      const axis = MM.Upgrades ? MM.Upgrades.bombAxis(run, x, y, requestedAxis) : null;
      if (axis) {
        const dx = axis === 'horizontal' ? 1 : 0;
        const dy = axis === 'vertical' ? 1 : 0;
        add(x, y);
        add(x - dx, y - dy);
        add(x + dx, y + dy);
        add(x - dx * 2, y - dy * 2);
        add(x + dx * 2, y + dy * 2);
        return cells;
      }
      add(x, y);
      add(x, y - 1);
      add(x, y + 1);
      add(x - 1, y);
      add(x + 1, y);
      return cells;
    },

    tryBomb(run, map, x, y) {
      if (this.count(run, 'bomb') <= 0) return { ok: false, reason: 'count', message: '没有炸药了' };
      const cell = map.get(x, y);
      if (!cell) return { ok: false, reason: 'out', message: '目标不在地图内' };
      if (!cell.revealed) return { ok: false, reason: 'fog', message: '只能炸已经看到的区域' };
      if (MM.U.manhattan(run.playerX, run.playerY, x, y) > MM.BALANCE.TOOL.BOMB_RANGE) {
        return { ok: false, reason: 'range', message: '距离太远，走近一点再放炸药' };
      }
      const cells = this.blastCells(map, x, y, run);
      const pending = cells.filter((c) => !c.excavated && !(c.specialType === 'gateBarrier' && !c.gateOpen));
      if (!pending.length) return { ok: false, reason: 'empty', message: '这一片已经挖空了' };

      return {
        ok: true,
        kind: 'bomb',
        shape: MM.Upgrades && MM.Upgrades.has(run, 'directionalBomb') ? 'line' : 'cross',
        t: 0,                        // V0.8.3 修复：动画计时字段此前缺失，导致立即结算
        x, y,
        cells: cells.filter((c) => !c.excavated && !(c.specialType === 'gateBarrier' && !c.gateOpen)),
        totalCells: cells.length,
        dur: MM.BALANCE.ANIM.BOMB_TIME,
      };
    },

    /* 动画结束后结算：不消耗体力；多格资源经 excavate 去重（§78⑧） */
    resolveBomb(run, map, action) {
      if (action.resolved) return [];      // 防御：同一个炸药动作只结算一次
      action.resolved = true;
      const events = [];
      run.tools.bomb = Math.max(0, (run.tools.bomb || 0) - 1);
      run.stats.bombsUsed++;

      const blasted = [];
      action.cells.forEach((c) => {
        if (c.excavated) return;
        const res = MM.Dig.excavate(run, map, c, 'bomb');
        events.push.apply(events, res.events);
        if (!res.skipped) blasted.push({ x: c.x, y: c.y });
      });

      const minedByBlast = events.filter((ev) => ev.type === 'resource').length;
      if (minedByBlast >= 2) run.stats.bombOreEvents = (run.stats.bombOreEvents || 0) + 1;
      if (action.shape === 'line') {
        const openedWalls = (action.cells || []).filter((c) => !c.specialType).length;
        run.stats.directionalBlastWalls = Math.max(run.stats.directionalBlastWalls || 0, openedWalls);
      }
      if (minedByBlast >= 2 && MM.Upgrades && MM.Upgrades.has(run, 'recoveryKit')
          && (run.stats.recoveryPicks || 0) < (MM.UPGRADE_USE_LIMITS.recoveryKit || 2)) {
        run.tools.powerPick = (run.tools.powerPick || 0) + 1;
        run.stats.recoveryPicks = (run.stats.recoveryPicks || 0) + 1;
        run.stats.recoveryOreEvents = (run.stats.recoveryOreEvents || 0) + minedByBlast;
        events.push({ type: 'recoveryPick', amount: 1, remaining: Math.max(0, (MM.UPGRADE_USE_LIMITS.recoveryKit || 2) - run.stats.recoveryPicks) });
      }

      events.unshift({ type: 'bomb', x: action.x, y: action.y, shape: action.shape || 'cross', cells: blasted });
      return events;
    },

    /* 强化矿镐：立即生效，不占用手感 */
    tryPowerPick(run) {
      if (this.count(run, 'powerPick') <= 0) return { ok: false, reason: 'count', message: '没有强化矿镐了' };
      if (run.freeDig) return { ok: false, reason: 'active', message: '强化矿镐已经在生效中' };
      run.tools.powerPick -= 1;
      run.freeDig = true;
      run.stats.picksUsed++;
      return { ok: true, message: '下一次成功挖掘不消耗体力' };
    },

    /* 探矿灯：视野 5，持续接下来 5 次成功挖掘（可叠加次数） */
    tryLamp(run) {
      if (this.count(run, 'lamp') <= 0) return { ok: false, reason: 'count', message: '没有探矿灯了' };
      run.tools.lamp -= 1;
      const digs = MM.Upgrades && MM.Upgrades.has(run, 'afterglowWick') ? 8 : MM.BALANCE.TOOL.LAMP_DIGS;
      run.lampDigsRemaining += digs;
      run.stats.lampsUsed++;
      return { ok: true, message: '视野扩大到 5，持续 ' + digs + ' 次成功挖掘' };
    },
  };
})();
