/* 挖掘系统（设计规格 §10 / §25 / §26 / §27 / §78⑦⑧⑨⑩⑪⑫）：
 *
 * begin()   检查：相邻 + 未挖 + 体力足够（或强化矿镐），返回一个待播放的挖掘动作
 * resolve() 动画结束后一次性结算：扣体力 / 消耗强化矿镐 / 挖开 / 拿矿物 / 触发房间 / 更新视野
 *
 * 所有"格子被挖开"的入口都收敛到 excavate()：
 *   - 矿物用 cell.resourceGranted 去重 → 只结算一次（炸药多格也不会重复结算）
 *   - 泉 / 宝箱用 cell.specialGranted 去重 → 只触发一次
 * 探矿灯只在"成功挖掘"（本函数 resolve，也就是玩家主动挥镐）时扣次数，
 * 与炸药无关，与停留时间无关（§27 / §78⑩）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Dig = {
    /* 是否与玩家相邻（只允许上下左右，禁止斜向，§9 / §78③） */
    isAdjacent(run, x, y) {
      return MM.U.manhattan(run.playerX, run.playerY, x, y) === 1;
    },

    begin(run, map, x, y) {
      const cell = map.get(x, y);
      if (!cell) return { ok: false, reason: 'out', message: '目标不在地图内' };
      if (cell.excavated) return { ok: false, reason: 'excavated', message: '该格已经挖开' };
      if (cell.specialType === 'gateBarrier' && !cell.gateOpen) {
        return { ok: false, reason: 'gateLocked', message: '机巧闸门关闭着：找到相邻的控制台进行处理' };
      }
      if (!this.isAdjacent(run, x, y)) return { ok: false, reason: 'notAdjacent', message: '只能挖相邻的岩块（上下左右，不能斜挖）' };

      const baseCost = cell.digCost;
      const usesDrill = !run.freeDig && baseCost === 3
        && MM.Upgrades && MM.Upgrades.has(run, 'hardRockDrill')
        && (run.stats.drillUses || 0) < (MM.UPGRADE_USE_LIMITS.hardRockDrill || 6);
      const cost = usesDrill ? baseCost - 1 : baseCost;
      if (!run.freeDig && run.stamina < cost) {
        return { ok: false, reason: 'stamina', cost, message: '体力不足：挖不动了，可以考虑返回入口或直接结束探索' };
      }

      return {
        ok: true,
        kind: 'dig',
        t: 0,                        // V0.8.3 修复：动画计时字段此前缺失，导致立即结算
        x, y,
        cost: run.freeDig ? 0 : cost,
        baseCost,
        usesDrill,
        usesFreePick: run.freeDig,
        terrain: cell.terrainType,
        dur: MM.BALANCE.ANIM.DIG_TIME,
      };
    },

    /* 动画结束后的结算；返回事件列表（供特效 / UI / 状态机处理） */
    resolve(run, map, action) {
      if (action.resolved) return [];      // 防御：同一个动作绝不结算两次
      action.resolved = true;
      const cell = map.get(action.x, action.y);
      const events = [];
      if (!cell || cell.excavated) return events;   // 防御：绝不对已挖格重复结算

      /* ① 消耗：强化矿镐只免"下一次成功挖掘"，用掉即失效（§26 / §78⑨） */
      if (action.usesFreePick) {
        run.freeDig = false;
        run.stats.freeDigsUsed++;
        events.push({ type: 'freePickUsed' });
      } else {
        run.stamina = Math.max(0, run.stamina - action.cost);
        run.stats.spentStamina += action.cost;
        if (action.usesDrill) {
          run.stats.drillUses = (run.stats.drillUses || 0) + 1;
          run.stats.drillStaminaSaved = (run.stats.drillStaminaSaved || 0) + 1;
          events.push({ type: 'drillUsed', remaining: Math.max(0, (MM.UPGRADE_USE_LIMITS.hardRockDrill || 6) - run.stats.drillUses) });
        }
      }
      run.stats.digActions++;

      /* ② 挖开 + 资源 + 房间触发 */
      const res = this.excavate(run, map, cell, 'dig');
      events.push.apply(events, res.events);
      /* 连脉镐只由手动挖掘触发；额外矿格走同一结算入口，但不再次触发连锁。 */
      if (MM.Upgrades && MM.Upgrades.has(run, 'chainPick')) {
        const chained = MM.Upgrades.chainTarget(run, map, cell);
        if (chained) {
          const extra = this.excavate(run, map, chained, 'chain');
          if (!extra.skipped) {
            run.stats.chainOreCells = (run.stats.chainOreCells || 0) + 1;
            events.push({ type: 'chainOre', x: chained.x, y: chained.y });
            events.push.apply(events, extra.events);
          }
        }
      }
      events.push({
        type: 'dug',
        x: cell.x, y: cell.y,
        cost: action.usesFreePick ? 0 : action.cost,
        free: !!action.usesFreePick,
        terrain: cell.terrainType,
      });

      /* ③ 探矿灯：按"成功挖掘次数"递减（§27 / §78⑩） */
      if (run.lampDigsRemaining > 0) {
        run.lampDigsRemaining--;
        events.push({ type: 'lampDig', remaining: run.lampDigsRemaining });
      }

      return events;
    },

    /* 统一的"挖开一格"入口：玩家挥镐 / 炸药 / 调试都用它（§78⑦⑧⑬） */
    excavate(run, map, cell, source) {
      const events = [];
      if (!cell) return { events, skipped: true };
      if (cell.excavated) return { events, skipped: true };

      cell.excavated = true;
      cell.revealed = true;
      run.stats.excavatedCells++;

      /* 矿物只结算一次（§78⑦⑧） */
      if (cell.resourceType && !cell.resourceGranted) {
        const value = MM.Resources.grant(run, cell.resourceType);
        cell.resourceGranted = true;
        events.push({
          type: 'resource',
          mineral: cell.resourceType,
          name: MM.RESOURCES[cell.resourceType].name,
          value,
          x: cell.x, y: cell.y,
        });
        if (MM.Relics && MM.Relics.onResource) MM.Relics.onResource(run, map, cell, events);
      }

      /* 房间 / 泉 / 宝箱 / 藏宝库（各自带"只触发一次"保护） */
      MM.Rooms.onCellExcavated(run, map, cell, events);
      MM.Treasure.onCellExcavated(run, map, cell, events);

      /* 正常触发视野（§25：被炸开的格子同样触发） */
      const revealed = MM.Vision.revealAround(map, cell.x, cell.y, MM.Vision.radius(run));
      if (MM.Cart) MM.Cart.ensureStop(map);   // V0.6：车站与目的地都挖开后，双向连接生效
      events.push({ type: 'excavated', x: cell.x, y: cell.y, source, revealed: revealed.length });
      return { events, skipped: false };
    },
  };
})();
