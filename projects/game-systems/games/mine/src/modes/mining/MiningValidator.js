/* 地图验证器（设计规格 §20 / §84 / §78㉓）：
 *
 * 生成结束后从入口做一次带权最短路（未挖格权重 = digCost），至少验证：
 *   ✔ 中段深度（9×45 = 32m / 9×20 = 14m）的最低理论成本 ≤ 该预设预算
 *   ✔ 藏宝库存在、成本在预设区间内（不能白给，也不能"理论 80+ 不可完成"）
 *   ✔ 矿物数量达标、地下泉 / 仓库 / 藏宝库全部可达
 *   ✔ 藏宝库方向提示不少于 3 格
 * 所有阈值都来自地图预设（MAP_PRESETS[x].validator，§79）。
 * 任何一条不过 → 返回失败清单，交给 Generator 局部修正或重新生成（§18⑨）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Validator = {
    validate(map) {
      const V = MM.specValidatorOf(map);
      const failures = [];
      const stats = {};

      const start = map.get(map.entrance.x, map.entrance.y);
      if (!start || !start.excavated) failures.push({ code: 'entranceMissing' });

      const an = MM.Pathfinder.analyze(map, map.entrance);

      /* ① 中段深度预算（§20：到约 30～35m 的最低成本要在初始体力的合理比例内） */
      const midRow = MM.U.clamp(Math.round(V.MID_DEPTH_METERS), 1, Math.max(1, map.h - 2));
      stats.midRow = midRow;
      stats.midCost = an.minRow[midRow];
      if (!(stats.midCost <= V.MID_DEPTH_BUDGET)) {
        failures.push({ code: 'midDepth', row: midRow, cost: stats.midCost, budget: V.MID_DEPTH_BUDGET });
      }

      /* ② 藏宝库：存在 + 成本区间（§20 不允许明显不可完成地图） */
      const vault = map.vault ? map.get(map.vault.x, map.vault.y) : null;
      if (!vault || vault.specialType !== 'vaultEntrance') {
        failures.push({ code: 'vaultMissing' });
      } else {
        stats.treasureCost = an.cost(vault.x, vault.y);
        if (!isFinite(stats.treasureCost)) {
          failures.push({ code: 'vaultUnreachable' });
        } else {
          if (stats.treasureCost > V.TREASURE_MAX_COST) {
            failures.push({ code: 'treasureTooExpensive', cost: stats.treasureCost, max: V.TREASURE_MAX_COST });
          }
          if (stats.treasureCost < V.TREASURE_MIN_COST) {
            failures.push({ code: 'treasureTooCheap', cost: stats.treasureCost, min: V.TREASURE_MIN_COST });
          }
        }
      }

      /* ③ 矿物数量 */
      stats.mineralCells = map.count((c) => !!c.resourceType);
      if (stats.mineralCells < V.MIN_MINERAL_CELLS) {
        failures.push({ code: 'minerals', count: stats.mineralCells, min: V.MIN_MINERAL_CELLS });
      }

      /* ④ 房间计划：2～4 个隐藏房全部存在且可达（§30 / §80）；
       *    矿车目的地必须满足 §37 的全部约束。 */
      const roomProblems = [];
      const plan = map.plan || { rooms: [], missing: [] };
      const planned = plan.rooms || [];
      stats.roomCount = planned.length;
      if (planned.length < 2 || planned.length > 4) roomProblems.push('plan:count=' + planned.length);
      (plan.missing || []).forEach((id) => roomProblems.push(id + ':placementFailed'));
      planned.forEach((id) => {
        const cells = map.roomCells(id);
        if (!cells.length) { roomProblems.push(id + ':missing'); return; }
        let best = Infinity;
        cells.forEach((c) => { const cost = an.cost(c.x, c.y); if (cost < best) best = cost; });
        if (!isFinite(best) || best > V.TREASURE_MAX_COST) roomProblems.push(id + ':unreachable');
      });
      if (planned.indexOf('minecart') >= 0) {
        const cart = plan.minecart;
        const dest = plan.minecartDest;
        const destCell = dest ? map.get(dest.x, dest.y) : null;
        if (!cart || !destCell) roomProblems.push('minecart:noDest');
        else {
          const dist = dest.y - cart.y;
          if (dist < MM.MINECART_CFG.MIN_DIST || dist > MM.MINECART_CFG.MAX_DIST) roomProblems.push('minecart:badDistance');
          if (destCell.roomId === 'treasure' || dest.y >= map.h - 1) roomProblems.push('minecart:intoTreasure');
          let open = 0;
          MM.Pathfinder.DIRS4.forEach((d) => {
            const n = map.get(dest.x + d[0], dest.y + d[1]);
            if (n && n.y > 0 && n.roomId !== 'treasure') open++;
          });
          if (open < MM.MINECART_CFG.DEST_CLEAR_NEIGHBORS) roomProblems.push('minecart:deadEnd');
        }
      }
      if (roomProblems.length) failures.push({ code: 'roomsUnreachable', detail: roomProblems });

      /* ④.5 P2：可判断的岔路——数量 / 层级混合 / 入口成本 / 奖励规模 / 线索可见 */
      const CFG = MM.BALANCE.GENERATOR;
      const expectBranches = !(map.spec && map.spec.branches === false);
      const branches = expectBranches ? (map.branches || []) : [];
      stats.branchCount = (map.branches || []).length;
      const branchProblems = [];
      if (expectBranches && branches.length < CFG.BRANCH_COUNT_MIN) branchProblems.push('count=' + branches.length);
      const tiers = {};
      branches.forEach((b, i) => {
        tiers[b.tier] = (tiers[b.tier] || 0) + 1;
        if (!b.cells || b.cells.length < 3) branchProblems.push('#' + i + ':cells');
        if (b.approxCost > CFG.BRANCH_ENTRY_COST_MAX) branchProblems.push('#' + i + ':cost=' + b.approxCost);
        const needValue = b.tier === 'low' ? CFG.BRANCH_LOW_VALUE_MIN : CFG.BRANCH_HIGH_VALUE_MIN;
        if ((b.approxValue || 0) < needValue) branchProblems.push('#' + i + ':value');
        const clue = b.clue ? map.get(b.clue.x, b.clue.y) : null;
        if (!clue || !clue.clueType || MM.Generator.routeDistance(map, clue.x, clue.y) > CFG.CLUE_MAX_ROUTE_DIST) {
          branchProblems.push('#' + i + ':clue');
        }
        (b.cells || []).forEach((p) => {
          const c = map.get(p.x, p.y);
          if (!c || !c.branchId) branchProblems.push('#' + i + ':cellData');
        });
      });
      if (expectBranches && (!tiers.low || !tiers.high)) branchProblems.push('tiers=' + JSON.stringify(tiers));
      if (!expectBranches && (map.branches || []).length) branchProblems.push('unexpected-on-v01');
      if (branchProblems.length) failures.push({ code: 'branches', detail: branchProblems });

      /* ④.6 P2：房间线索必须进入主矿道视野（做绕路决定前可见） */
      const clueProblems = [];
      planned.forEach((id) => {
        const room = map.rooms[id];
        const clue = room && room.clue;
        const cell = clue ? map.get(clue.x, clue.y) : null;
        if (!cell || !cell.clueType
          || MM.Generator.routeDistance(map, cell.x, cell.y) > CFG.CLUE_MAX_ROUTE_DIST) {
          clueProblems.push(id + ':clue');
        }
      });
      if (clueProblems.length) failures.push({ code: 'roomClues', detail: clueProblems });

      /* ⑤ 藏宝库方向提示（§43） */
      stats.hints = map.count((c) => c.clueType === 'goldGlow' || c.clueType === 'goldCrack');
      if (stats.hints < MM.BALANCE.GENERATOR.HINT_TRAIL_MIN) {
        failures.push({ code: 'hints', count: stats.hints, min: MM.BALANCE.GENERATOR.HINT_TRAIL_MIN });
      }

      /* ⑥ P3：合法通关记录（按真实挖掘 / 工具 / 泉水 / 矿车规则模拟）
       * "最低成本路径"只说明理论上可行；这里证明"真的能打穿"。 */
      if (MM.Simulator) {
        let clear = null;
        try { clear = MM.Simulator.legalClear(map); }
        catch (e) { clear = { ok: false, reason: 'exception:' + (e && e.message) }; }
        stats.clearOk = !!(clear && clear.ok);
        stats.clearActions = clear && clear.log ? clear.log.length : 0;
        stats.clearUsedSpring = !!(clear && clear.usedSpring);
        stats.clearStaminaLeft = clear && clear.ok ? clear.staminaLeft : null;
        if (!clear || !clear.ok) {
          failures.push({ code: 'notClearable', reason: (clear && clear.reason) || 'unknown' });
        }
      }

      return { ok: failures.length === 0, failures, stats };
    },
  };
})();
