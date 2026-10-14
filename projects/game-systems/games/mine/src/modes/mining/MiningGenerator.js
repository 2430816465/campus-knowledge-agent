/* 地图随机生成（设计规格 §18～§24 / §74 / §79 / §85）：
 *
 * 生成流程（§18）：
 *   ① 创建基础地形（按深度层权重）
 *   ② 生成一条隐藏的合理主矿道（V0.2：分段直线 + 段间漂移，§85 不让"永远直线向下"成立）
 *   ③ 填充周围地形（主矿道及邻格软化，保证存在低成本通道）
 *   ④ 分布矿物（支路概率 / 价值更高，§85）
 *   ⑤ 生成隐藏房（V0.1：一个废弃矿工仓库）
 *   ⑥ 生成补给（V0.1：一个地下泉）
 *   ⑦ 生成最终藏宝库（横向随机，§42）
 *   ⑧ 进行可达性 / 成本验证（交给 MinerValidator）
 *   ⑨ 不合格则局部修正或重新生成
 *
 * 注意：生成器不保证随机出的图能直接通关（§19），但必须"公平、有合理探索空间"；
 * 所有阈值都在 config/miningBalance.js 的地图预设里（9×45 / 9×20 共用同一套逻辑），
 * 逻辑里不写死概率（§24 / §65）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const G = {
    /* 生成一张"未验证"的地图（mapId 省略时用默认预设，V0.2 = 9×45） */
    generate(seed, mapId, options) {
      const spec = MM.mapSpec(mapId);
      const rng = MM.RNG.create(seed);
      const map = new MM.MineMap(spec.WIDTH, spec.DEPTH, spec);
      map.seed = String(seed);
      map.generationOptions = JSON.parse(JSON.stringify(options || {}));

      if (spec.mineId === 'sealedVault') {
        this.buildSealedVault(map, rng);
        return map;
      }

      this.buildTerrain(map, rng);       // ①
      this.carveMainRoute(map, rng);     // ② + ③
      this.carveBranches(map, rng);      // ②.5（P2）：可判断的岔路
      this.scatterMinerals(map, rng);    // ④
      this.placeRooms(map, rng, options); // ⑤ + ⑥ + ⑦
      this.placeMineFeatures(map, rng);   // 矿区规则物件
      this.placeHintTrail(map, rng);     // §43：藏宝库方向提示
      return map;
    },

    /* 完整生成 + 验证 + 修正 / 重试（§18⑧⑨）。返回 { map, report, attempts, repairs, notes } */
    generateValidated(seed, mapId, options) {
      const B = MM.BALANCE;
      let last = null;

      for (let attempt = 1; attempt <= B.GENERATOR.MAX_ATTEMPTS; attempt++) {
        const attemptSeed = attempt === 1 ? String(seed) : String(seed) + '@' + attempt;
        const map = this.generate(attemptSeed, mapId, options);
        map.baseSeed = String(seed);
        map.attempt = attempt;

        let report = MM.Validator.validate(map);
        let repairs = 0;
        const notes = [];
        while (!report.ok && repairs < B.VALIDATOR.MAX_REPAIR_ROUNDS) {
          const rng = MM.RNG.create(attemptSeed + '#repair' + repairs);
          notes.push.apply(notes, this.repair(map, rng, report));
          report = MM.Validator.validate(map);
          repairs++;
        }
        if (report.ok) {
          map.validated = true;
          return { map, report, attempts: attempt, repairs, notes };
        }
        last = { map, report };
      }

      /* 兜底（正常不该走到）：沿最低成本路径强行修成泥土，保证不产出死图。
       * 这条路径也会被无头测试统计，一旦频繁出现说明生成器参数需要调整。 */
      const map = last ? last.map : this.generate(seed, mapId, options);
      map.baseSeed = String(seed);
      this.forcePassable(map, MM.RNG.create(String(seed) + '#fallback'));
      const report = MM.Validator.validate(map);
      map.validated = report.ok;
      return { map, report, attempts: B.GENERATOR.MAX_ATTEMPTS + 1, repairs: -1, notes: [{ why: 'fallback' }] };
    },

    /* ── ① 基础地形 ─────────────────────────────────────────── */
    buildTerrain(map, rng) {
      map.forEach((cell) => {
        const layer = MM.depthLayerAt(cell.y);
        const weights = MM.TERRAIN_WEIGHTS_BY_LAYER[layer.id] || MM.TERRAIN_WEIGHTS_BY_LAYER.rock;
        this.setTerrain(cell, weights, rng);
      });

      /* 顶部入口区域（§5）：入口平台三格先挖开、先可见 */
      for (let x = map.entrance.x - 1; x <= map.entrance.x + 1; x++) {
        const cell = map.get(x, 0);
        if (!cell) continue;
        cell.terrainType = 'dirt';
        cell.digCost = MM.TERRAIN.dirt.digCost;
        cell.excavated = true;
        cell.revealed = true;
      }
      map.get(map.entrance.x, map.entrance.y).specialType = 'entrance';
    },

    setTerrain(cell, weights, rng) {
      const id = rng.weighted(weights);
      const def = MM.terrainDef(id);
      cell.terrainType = def.id;
      cell.digCost = def.digCost;
    },

    /* ── ②③ 隐藏主矿道 + 周围地形（§19 / §85） ─────────────────
     * V0.2：主路线从"逐行随机游走"升级为"分段直线矿道"——
     * 全程分 ROUTE_BANDS 段，段内竖直向下，段与段之间只做一次横向连接。
     * 这样 45m 深处的最低成本路线才可能落在"初始 40 体力的合理比例"内；
     * 同时每段锚点随机漂移，让每局低成本通道的横向位置都不同（§85）。 */
    carveMainRoute(map, rng) {
      const W = map.w, H = map.h;
      const cfg = MM.BALANCE.GENERATOR;
      const bands = Math.max(1, cfg.ROUTE_BANDS || 5);
      const bandH = Math.ceil(H / bands);

      /* 每段的锚点列（第一段从入口列出发，之后每段最多漂移 ROUTE_BAND_DRIFT 列） */
      const cols = [];
      let col = map.entrance.x;
      for (let b = 0; b < bands; b++) {
        cols.push(MM.U.clamp(col, 0, W - 1));
        col = MM.U.clamp(col + rng.rangeInt(-cfg.ROUTE_BAND_DRIFT, cfg.ROUTE_BAND_DRIFT), 0, W - 1);
      }

      const route = [];
      for (let y = 0; y < H; y++) {
        const target = cols[Math.min(bands - 1, Math.floor(y / bandH))];
        const last = route[route.length - 1];
        if (last && last.x !== target) {
          /* 段间横向连接（同行推进，保持四方向连通） */
          const sgn = target > last.x ? 1 : -1;
          for (let x = last.x + sgn; x !== target + sgn; x += sgn) {
            route.push({ x, y: last.y });
          }
        }
        route.push({ x: target, y });
      }
      map.mainRoutePath = route;
      map.mainRouteSet = new Set(route.map((c) => c.x + ',' + c.y));

      /* 主矿道本身软化：保证存在一条合理成本通道（§19） */
      route.forEach((c) => {
        if (c.y === 0) return;
        const cell = map.get(c.x, c.y);
        const deep = c.y >= Math.round((H - 1) * (cfg.DEEP_SOFTEN_RATIO || 1));
        if (cell) this.setTerrain(cell, deep ? cfg.DEEP_ROUTE_SOFTEN : cfg.ROUTE_SOFTEN, rng);
      });

      /* 主矿道邻格稍微软化：路线附近多一点泥土与普通岩石，但绝不整片铲平 */
      map.forEach((cell) => {
        if (cell.y === 0) return;
        if (map.isMainRoute(cell.x, cell.y)) return;
        if (this.adjacentToRoute(map, cell.x, cell.y)) {
          this.setTerrain(cell, cfg.NEAR_ROUTE_SOFTEN, rng);
        }
      });
      /* P2：连续软泥段封顶（避免"一条软泥直通底"） */
      this.capSoftRuns(map);
    },

    adjacentToRoute(map, x, y) {
      const dirs = MM.Pathfinder.DIRS4;
      for (let d = 0; d < dirs.length; d++) {
        if (map.isMainRoute(x + dirs[d][0], y + dirs[d][1])) return true;
      }
      return false;
    },

    /* ── P2：可判断的岔路（直通岩石插塞 + 低/高收益支线） ─────────────
     * 在 2～3 个深度上给主矿道打一个 2 格岩石插塞；旁边挂一条 3 格支线：
     *   低收益：较便宜的岩层，尽头铜矿 ×2（价值 10）；
     *   高收益：更贵的岩层，尽头金矿 ×2 + 遗失补给箱（价值 ≈64 + 工具）。
     * 线索放在插塞格（走主矿道一定会经过），玩家在决定绕路前就能看到。 */
    carveBranches(map, rng) {
      if (map.spec && map.spec.branches === false) { map.branches = []; return []; }
      const cfg = MM.BALANCE.GENERATOR;
      const H = map.h;
      const y0 = Math.max(8, Math.round((H - 1) * cfg.BRANCH_ROW_MIN_RATIO));
      const y1 = Math.min(H - 8, Math.round((H - 1) * cfg.BRANCH_ROW_MAX_RATIO));
      const count = rng.rangeInt(cfg.BRANCH_COUNT_MIN, cfg.BRANCH_COUNT_MAX);
      const rows = [];
      let guard = 0;
      while (rows.length < count && guard++ < 240) {
        const y = rng.rangeInt(y0, y1);
        if (rows.some((r) => Math.abs(r - y) < cfg.BRANCH_MIN_SEPARATION)) continue;
        rows.push(y);
      }
      rows.sort((a, b) => a - b);
      map.branches = [];
      rows.forEach((y, i) => {
        const tier = i % 2 === 0 ? 'low' : 'high';
        let routeCell = null;
        for (let k = 0; k < map.mainRoutePath.length; k++) {
          if (map.mainRoutePath[k].y === y) { routeCell = map.mainRoutePath[k]; break; }
        }
        if (!routeCell) return;
        const side = rng.pick([-1, 1]);
        /* 先试随机一侧；放不下（贴边/被占用）就换另一侧，尽量保证 2 条岔路 */
        let built = this.buildBranch(map, rng, routeCell.x, y, side, tier);
        if (!built) built = this.buildBranch(map, rng, routeCell.x, y, -side, tier);
        if (built) map.branches.push(built);
      });
      return map.branches;
    },

    buildBranch(map, rng, rx, y, side, tier) {
      const cfg = MM.BALANCE.GENERATOR;
      const pattern = [[1, 0], [1, 1], [2, 1]];
      const weights = tier === 'low' ? cfg.BRANCH_LOW_WEIGHTS : cfg.BRANCH_HIGH_WEIGHTS;
      const cells = [];
      for (let i = 0; i < pattern.length; i++) {
        const x = rx + pattern[i][0] * side;
        const yy = y + pattern[i][1];
        const cell = map.get(x, yy);
        if (!cell || cell.y === 0) return null;
        if (cell.roomId || cell.specialType || cell.branchId) return null;
        if (map.isMainRoute(cell.x, cell.y)) return null;
        cell.branchId = 'br' + y + (side > 0 ? 'R' : 'L');
        this.setTerrain(cell, weights, rng);
        cells.push(cell);
      }
      /* 奖励：低收益 = 铜 ×2；高收益 = 金 ×2 + 补给箱（随机工具 + 20~28 价值） */
      if (tier === 'low') {
        cells[0].resourceType = 'copper'; cells[0].resourceValue = MM.Resources.value('copper');
        cells[1].resourceType = 'copper'; cells[1].resourceValue = MM.Resources.value('copper');
      } else {
        cells[0].resourceType = 'gold'; cells[0].resourceValue = MM.Resources.value('gold');
        cells[1].resourceType = 'gold'; cells[1].resourceValue = MM.Resources.value('gold');
        cells[2].specialType = 'lostChest';
      }
      /* 直通插塞：主矿道两格换成普通岩石（成本提前可见） */
      [[rx, y], [rx, y + 1]].forEach((p) => {
        const c = map.get(p[0], p[1]);
        if (c && !c.roomId && !c.specialType && !c.branchId) {
          this.setTerrain(c, { rock: 100 }, rng);
        }
      });
      /* 线索：支线第一格（房间永远不会占用 branch 格，保证不被覆盖）；
       * 它紧贴主矿道（距离 1），玩家走在矿道上就能看到。插塞格再补一个作为强化提示。 */
      const clueType = tier === 'low' ? 'copperSeam' : 'goldCache';
      const clueCell = cells[0];
      if (clueCell && !clueCell.clueType) clueCell.clueType = clueType;
      const plugClue = map.get(rx, y + 1) || map.get(rx, y);
      if (plugClue && !plugClue.clueType && !plugClue.roomId) plugClue.clueType = clueType;

      const approxCost = cells.reduce((s, c) => s + c.digCost, 0);
      return {
        tier,
        junction: { x: rx, y },
        cells: cells.map((c) => ({ x: c.x, y: c.y })),
        clue: clueCell ? { x: clueCell.x, y: clueCell.y } : null,
        approxCost,
        approxValue: tier === 'low' ? cfg.BRANCH_LOW_VALUE_MIN : cfg.BRANCH_HIGH_VALUE_MIN + 14,
        reward: tier === 'low' ? { kind: 'copper', approx: cfg.BRANCH_LOW_VALUE_MIN }
          : { kind: 'gold+cache', approx: cfg.BRANCH_HIGH_VALUE_MIN + 14 },
      };
    },

    /* P2：主矿道连续泥土段超过上限时插一格普通岩石，避免"一条软泥直通底" */
    capSoftRuns(map) {
      const cap = MM.BALANCE.GENERATOR.BRANCH_RUN_CAP || 8;
      let run = 0, changed = 0;
      for (let y = 1; y < map.h; y++) {
        let routeCell = null;
        for (let k = 0; k < map.mainRoutePath.length; k++) {
          if (map.mainRoutePath[k].y === y) { routeCell = map.mainRoutePath[k]; break; }
        }
        if (!routeCell) continue;
        const c = map.get(routeCell.x, y);
        if (!c) continue;
        if (c.terrainType === 'dirt' && !c.specialType && !c.roomId && !c.branchId) {
          run++;
          if (run > cap) {
            c.terrainType = 'rock';
            c.digCost = MM.TERRAIN.rock.digCost;
            run = 0;
            changed++;
          }
        } else {
          run = 0;
        }
      }
      return changed;
    },

    /* 到主矿道的最近距离（P2 线索可见性） */
    routeDistance(map, x, y) {
      let best = Infinity;
      for (let i = 0; i < map.mainRoutePath.length; i++) {
        const rc = map.mainRoutePath[i];
        const d = MM.U.manhattan(x, y, rc.x, rc.y);
        if (d < best) best = d;
        if (best === 0) break;
      }
      return best;
    },

    /* P2：保证房间线索在玩家做绕路决定前进入视野（与主矿道距离 ≤ CLUE_MAX_ROUTE_DIST） */
    ensureRoomClueVisible(map, roomId) {
      const room = map.rooms[roomId];
      if (!room) return false;
      const cells = map.roomCells(roomId);
      if (!cells.length) return false;
      const maxD = MM.BALANCE.GENERATOR.CLUE_MAX_ROUTE_DIST;
      if (room.clue) {
        const cur = map.get(room.clue.x, room.clue.y);
        if (cur && this.routeDistance(map, cur.x, cur.y) <= maxD) return true;
      }
      const dirs8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
      let best = null, bestScore = Infinity;
      cells.forEach((c) => {
        dirs8.forEach((d) => {
          for (let step = 1; step <= 5; step++) {
            const x = c.x + d[0] * step, y = c.y + d[1] * step;
            const cell = map.get(x, y);
            if (!cell || cell.y === 0) break;
            if (cell.roomId || cell.specialType || cell.branchId) continue;
            const dist = this.routeDistance(map, x, y);
            if (dist <= maxD && dist < bestScore) { bestScore = dist; best = cell; }
          }
        });
      });
      /* 兜底：贴着主矿道找一格空位，保证线索一定出现在视野里 */
      if (!best) {
        for (let i = 0; i < map.mainRoutePath.length; i++) {
          const rc = map.mainRoutePath[i];
          dirs8.forEach((d) => {
            const cell = map.get(rc.x + d[0], rc.y + d[1]);
            if (!cell || cell.y === 0) return;
            if (cell.roomId || cell.specialType || cell.branchId) return;
            const score = MM.U.manhattan(cell.x, cell.y, cells[0].x, cells[0].y);
            if (score < bestScore) { bestScore = score; best = cell; }
          });
        }
      }
      if (!best) return false;
      const def = MM.ROOMS[roomId] || {};
      best.clueType = def.clue || 'goldCrack';
      room.clue = { x: best.x, y: best.y };
      return true;
    },

    /* ── ④ 矿物分布 ─────────────────────────────────────────── */
    scatterMinerals(map, rng) {
      const cfg = MM.BALANCE.GENERATOR;
      /* §79：full 预设为完整四种矿物（铜/银/金/水晶）；v01 预设仍只放铜/金对照 */
      const pool = (map.spec && map.spec.resourcePool) || MM.RESOURCE_POOL_FULL;

      map.forEach((cell) => {
        if (cell.y === 0 || cell.excavated || cell.specialType || cell.branchId) return;
        const layer = MM.depthLayerAt(cell.y);
        let chance = cfg.MINERAL_CHANCE_BY_LAYER[layer.id] || 0.18;

        const branch = !map.isMainRoute(cell.x, cell.y) && this.adjacentToRoute(map, cell.x, cell.y);
        if (branch) chance *= cfg.BRANCH_MINERAL_BOOST;
        if (!rng.chance(chance)) return;

        const raw = MM.RESOURCE_WEIGHTS_BY_LAYER[layer.id] || MM.RESOURCE_WEIGHTS_BY_LAYER.rock;
        const weights = {};
        pool.forEach((id) => { weights[id] = raw[id] || 0; });
        let pick = rng.weighted(weights);

        /* §85：高价值资源更容易出现在支路 */
        if (branch && rng.chance(cfg.BRANCH_TIER_BOOST)) {
          const up = MM.RESOURCE_TIER_UP[pick];
          if (pool.indexOf(up) >= 0) pick = up;
        }

        cell.resourceType = pick;
        cell.resourceValue = MM.Resources.value(pick);
      });
    },

    /* ── ⑤⑥⑦ 隐藏房计划 / 藏宝库（§30～§43 / §80） ──────────────
     * V0.3：8 类隐藏房全部实装；每局按房间计划生成 2～4 个主要隐藏房
     * （地下泉是体力主来源，§29 → 每局必出），藏宝库独立必出（§42）。 */
    placeRooms(map, rng, options) {
      const spec = map.spec || MM.mapSpec();
      const plan = this.rollRoomPlan(rng, spec);
      const targetRelic = options && options.relicTarget;
      const relicSource = targetRelic && MM.RELIC_SOURCES && MM.RELIC_SOURCES[targetRelic];
      if (relicSource && plan.indexOf(relicSource.roomId) < 0) {
        let replace = plan.length - 1;
        while (replace >= 0 && plan[replace] === 'spring') replace--;
        if (replace >= 0) plan[replace] = relicSource.roomId;
        else if (plan.length < 4) plan.push(relicSource.roomId);
      }
      map.plan = { rooms: plan.slice(), missing: [], minecart: null, minecartDest: null };

      /* 藏宝库先放：矿车目的地必须避开藏宝库（§37） */
      this.placeVault(map, rng);
      /* 可预见工作台：沿入口主矿道前段放置，房间布局会避开该格。 */
      this.placeWorkbench(map);
      this.placeSecondWorkbench(map);

      plan.forEach((id) => {
        let placed = null;
        switch (id) {
          case 'spring': placed = this.placeSpring(map, rng); break;
          case 'supply': placed = this.placeSupply(map, rng); break;
          case 'goldenVein': placed = this.placeGoldenVein(map, rng); break;
          case 'crystalCave': placed = this.placeCrystalCave(map, rng); break;
          case 'minecart': placed = this.placeMinecart(map, rng); break;
          case 'ruinVault': placed = this.placeRuinVault(map, rng); break;
          case 'lostSupplies': placed = this.placeLostSupplies(map, rng); break;
          case 'mysteryRoom': placed = this.placeMysteryRoom(map, rng); break;
          default: break;
        }
        if (!placed) map.plan.missing.push(id);
      });
      /* P2：房间线索必须在玩家于主矿道做绕路决定前进入视野 */
      plan.forEach((id) => {
        if (map.roomCells(id).length) this.ensureRoomClueVisible(map, id);
      });
      return map.plan;
    },

    placeSecondWorkbench(map) {
      const preferred = [21, 19, 23, 18, 24, 20, 22];
      const benches = map.workbenches || (map.workbenches = []);
      for (let i = 0; i < preferred.length; i++) {
        const y = preferred[i];
        if (y >= map.h - 3) continue;
        const p = (map.mainRoutePath || []).find((c) => c.y === y);
        const cell = p && map.get(p.x, p.y);
        if (!cell || cell.roomId || cell.specialType) continue;
        cell.specialType = 'workbench'; cell.roomId = null;
        cell.resourceType = null; cell.resourceValue = 0; cell.clueType = null;
        cell.terrainType = 'dirt'; cell.digCost = MM.TERRAIN.dirt.digCost;
        benches.push({ x: cell.x, y: cell.y });
        map.workbench = map.workbench || { x: cell.x, y: cell.y };
        return { x: cell.x, y: cell.y };
      }
      return null;
    },

    placeMineFeatures(map, rng) {
      const mineId = (map.spec && map.spec.mineId) || 'oldMine';
      if (mineId === 'resonanceCave') {
        const candidates = map.cells.filter((c) => c.y >= 8 && c.y <= map.h - 8
          && !map.isMainRoute(c.x, c.y) && !c.roomId && !c.specialType && !c.clueType
          && this.adjacentToRoute(map, c.x, c.y));
        const chosen = [];
        while (candidates.length && chosen.length < 2) {
          const index = rng.nextInt(candidates.length);
          const cell = candidates.splice(index, 1)[0];
          if (chosen.some((p) => MM.U.manhattan(p.x, p.y, cell.x, cell.y) < 5)) continue;
          cell.specialType = 'resonanceStone';
          cell.resourceType = null; cell.resourceValue = 0;
          cell.terrainType = 'hard'; cell.digCost = MM.TERRAIN.hard.digCost;
          chosen.push({ x: cell.x, y: cell.y });
        }
        if (chosen.length < 2) {
          const fallback = map.cells.filter((c) => c.y >= 8 && c.y <= map.h - 8
            && !map.isMainRoute(c.x, c.y) && !c.roomId && !c.specialType && !c.clueType
            && this.adjacentToRoute(map, c.x, c.y));
          fallback.forEach((cell) => {
            if (chosen.length >= 2 || chosen.some((p) => MM.U.manhattan(p.x, p.y, cell.x, cell.y) < 5)) return;
            cell.specialType = 'resonanceStone'; cell.resourceType = null; cell.resourceValue = 0;
            cell.terrainType = 'hard'; cell.digCost = MM.TERRAIN.hard.digCost;
            chosen.push({ x: cell.x, y: cell.y });
          });
        }
        map.resonanceStones = chosen;
      } else if (mineId === 'clockworkMine') {
        const branches = (map.branches || []).filter((b) => (b.cells || []).length >= 3);
        const candidates = branches.filter((b) => {
          const first = b.cells[0] && map.get(b.cells[0].x, b.cells[0].y);
          const second = b.cells[1] && map.get(b.cells[1].x, b.cells[1].y);
          return first && second && !first.roomId && !first.specialType && !second.roomId && !second.specialType;
        });
        if (!candidates.length) return;
        const branch = candidates[rng.nextInt(candidates.length)];
        const consoleCell = map.get(branch.cells[0].x, branch.cells[0].y);
        const barrierCell = map.get(branch.cells[1].x, branch.cells[1].y);
        consoleCell.specialType = 'gateConsole';
        consoleCell.resourceType = null; consoleCell.resourceValue = 0;
        barrierCell.specialType = 'gateBarrier';
        barrierCell.resourceType = null; barrierCell.resourceValue = 0;
        map.gate = {
          x: consoleCell.x, y: consoleCell.y,
          barrier: { x: barrierCell.x, y: barrierCell.y },
          path: branch.cells.slice(1).map((p) => ({ x: p.x, y: p.y })),
          opened: false, resolved: false,
        };
      }
    },

    /* 封存矿库：手工布置的固定 9×45 终局图。两条纵向路线在三处相连，
     * 泉、矿车、双工作台、共鸣石和可选闸门都固定在可验证的位置。 */
    buildSealedVault(map, rng) {
      map.spec = Object.assign({}, map.spec, { branches: false });
      this.buildTerrain(map, rng);
      map.rooms = {};
      map.branches = [];
      map.workbenches = [];
      map.resonanceStones = [];
      map.plan = { rooms: ['spring', 'minecart', 'goldenVein'], missing: [], minecart: null, minecartDest: null };
      const main = [];
      const open = (x, y, opts) => {
        const c = map.get(x, y);
        if (!c) return null;
        c.terrainType = 'dirt'; c.digCost = MM.TERRAIN.dirt.digCost;
        c.excavated = false; c.revealed = false; c.resourceType = null; c.resourceValue = 0;
        c.resourceGranted = false; c.specialGranted = false; c.roomId = null; c.specialType = null; c.clueType = null;
        if (opts) Object.assign(c, opts);
        return c;
      };
      open(4, 0, { terrainType: 'dirt', excavated: true, revealed: true, specialType: 'entrance' });
      /* 入口与双巷道、双巷道与藏宝库入口均保持四向相邻连通。 */
      open(4, 1);
      for (let y = 1; y <= 42; y++) {
        open(3, y); open(5, y);
        if ([8, 20, 32].indexOf(y) >= 0) open(4, y);
        main.push({ x: 3, y });
      }
      [8, 20, 32].forEach((y) => { open(4, y); });
      open(4, 42);
      open(4, 43, { specialType: 'vaultEntrance', roomId: 'treasure' });
      main.unshift({ x: 4, y: 1 }, { x: 4, y: 0 }); main.push({ x: 4, y: 42 }, { x: 4, y: 43 });
      map.mainRoutePath = main;
      map.mainRouteSet = new Set(main.map((p) => p.x + ',' + p.y));
      map.vault = { x: 4, y: 43 };
      for (let x = 3; x <= 5; x++) {
        const c = open(x, 44, { terrainType: 'dirt', specialType: 'vault', roomId: 'treasure' });
        if (c) c.resourceType = null;
      }
      map.rooms.treasure = { anchor: { x: 4, y: 44 }, cells: [{ x: 3, y: 44 }, { x: 4, y: 44 }, { x: 5, y: 44 }] };

      const benchA = open(3, 6, { specialType: 'workbench' });
      const benchB = open(5, 25, { specialType: 'workbench' });
      map.workbenches = [benchA, benchB].map((c) => ({ x: c.x, y: c.y }));
      map.workbench = map.workbenches[0];

      const spring = open(5, 17, { specialType: 'spring', roomId: 'spring' });
      open(4, 17, { clueType: 'waterStain' });
      map.rooms.spring = { anchor: { x: spring.x, y: spring.y }, x: spring.x, y: spring.y,
        cells: [{ x: spring.x, y: spring.y }], clue: { x: 4, y: 17 } };

      const cart = open(3, 14, { specialType: 'minecart', roomId: 'minecart' });
      const stop = open(5, 20, { specialType: 'cartStop' });
      open(4, 14, { clueType: 'rails' });
      map.plan.minecart = { x: cart.x, y: cart.y };
      map.plan.minecartDest = { x: stop.x, y: stop.y };
      map.rooms.minecart = { anchor: { x: cart.x, y: cart.y }, cart: { x: cart.x, y: cart.y },
        cells: [{ x: cart.x, y: cart.y }], clue: { x: 4, y: 14 } };

      const goldA = open(2, 23, { resourceType: 'gold', resourceValue: MM.Resources.value('gold'), roomId: 'goldenVein' });
      const goldB = open(2, 24, { resourceType: 'gold', resourceValue: MM.Resources.value('gold'), roomId: 'goldenVein' });
      open(3, 23, { clueType: 'goldCrack' });
      map.rooms.goldenVein = { anchor: { x: 2, y: 23 }, cells: [{ x: goldA.x, y: goldA.y }, { x: goldB.x, y: goldB.y }], clue: { x: 3, y: 23 } };
      /* 侧路通过控制台到达可选闸门；不切断通向藏宝库的两条主路线。 */
      open(2, 28, { specialType: 'gateConsole' });
      open(1, 28, { specialType: 'gateBarrier' });
      open(1, 29); open(1, 30); open(2, 30); open(3, 30);
      map.gate = { x: 2, y: 28, barrier: { x: 1, y: 28 },
        path: [{ x: 1, y: 28 }, { x: 1, y: 29 }, { x: 1, y: 30 }, { x: 2, y: 30 }],
        opened: false, resolved: false };
      open(6, 24); open(7, 24, { specialType: 'resonanceStone', terrainType: 'hard', digCost: MM.TERRAIN.hard.digCost });
      map.resonanceStones = [{ x: 7, y: 24 }];

      /* 手工铺出可规划的矿脉，避免 Validator 通过随机补矿改写这张固定挑战图。
       * 中央双巷按深度换矿种；外侧少量矿点形成可选支线，不直接赠送采矿进度。 */
      const oreForDepth = (y) => y < 10 ? 'copper' : (y < 22 ? 'silver' : (y < 34 ? 'gold' : 'crystal'));
      const placeOre = (cell, y) => {
        if (!cell || cell.specialType || cell.roomId || cell.resourceType) return;
        const type = oreForDepth(y);
        cell.resourceType = type; cell.resourceValue = MM.Resources.value(type);
      };
      for (let y = 2; y <= 40; y += 2) {
        placeOre(map.get(3, y), y);
        placeOre(map.get(5, y), y);
      }
      for (let y = 4; y <= 40; y += 4) {
        placeOre(map.get(2, y), y);
        placeOre(map.get(6, y), y);
      }
      const hintTrail = [];
      [38, 40, 42].forEach((y) => {
        const c = map.get(3, y);
        if (c && !c.specialType) { c.clueType = 'goldGlow'; hintTrail.push({ x: c.x, y: c.y }); }
      });
      map.hintTrail = hintTrail;
      map.plan.rooms.forEach((id) => {
        const room = map.rooms[id];
        if (room && room.clue) {
          const clue = map.get(room.clue.x, room.clue.y);
          if (clue && !clue.clueType) clue.clueType = (MM.ROOMS[id] || {}).clue || 'goldCrack';
        }
      });
      return map;
    },

    /* 房间计划：保证房间 + 权重抽样 → 每局 2～4 个主要隐藏房（§30） */
    rollRoomPlan(rng, spec) {
      const cfg = (spec && spec.roomPlan) || MM.BALANCE.ROOM_PLAN;
      const plan = (cfg.GUARANTEED || []).slice();
      const pool = Object.assign({}, cfg.WEIGHTS);
      (cfg.GUARANTEED || []).forEach((id) => { delete pool[id]; });
      const count = rng.rangeInt(cfg.MIN_OTHER, cfg.MAX_OTHER);
      for (let i = 0; i < count; i++) {
        if (!Object.keys(pool).length) break;
        const id = rng.weighted(pool);
        delete pool[id];
        plan.push(id);
      }
      return plan;
    },

    placeWorkbench(map) {
      const preferred = [3, 4, 5, 2, 6, 7];
      let spot = null;
      for (let i = 0; i < preferred.length && !spot; i++) {
        const y = preferred[i];
        if (y >= map.h - 2) continue;
        const pathCell = (map.mainRoutePath || []).find((p) => p.y === y);
        if (!pathCell) continue;
        const cell = map.get(pathCell.x, pathCell.y);
        if (cell && !cell.roomId && !cell.specialType) spot = cell;
      }
      if (!spot) return null;
      spot.specialType = 'workbench';
      spot.roomId = null;
      spot.resourceType = null;
      spot.resourceValue = 0;
      spot.clueType = null;
      spot.terrainType = 'dirt';
      spot.digCost = MM.TERRAIN.dirt.digCost;
      map.workbench = { x: spot.x, y: spot.y };
      map.workbenches = [{ x: spot.x, y: spot.y }];
      return map.workbench;
    },

    /* 通用：按相对坐标摆放一个房间（离主矿道 2～4 格，深度带内），返回 { anchor, cells } */
    placeCluster(map, rng, opts) {
      const W = map.w;
      for (let tries = 0; tries < 80; tries++) {
        const y = rng.rangeInt(opts.y0, opts.y1);
        let x0;
        if (tries < 60) {
          const routeX = (map.mainRoutePath[y] && map.mainRoutePath[y].x) || map.entrance.x;
          const dir = rng.pick([-1, 1]);
          x0 = routeX + dir * rng.rangeInt(2, 4);
        } else {
          x0 = rng.nextInt(W);
        }
        x0 = MM.U.clamp(x0, 0, W - 2);
        if (this.tooCloseToRooms(map, x0, y, opts.minDist || 2)) continue;

        const cells = [];
        let ok = true;
        for (let i = 0; i < opts.pattern.length; i++) {
          const p = opts.pattern[i];
          const cell = map.get(x0 + p[0], y + p[1]);
          if (!cell || cell.y === 0) { ok = false; break; }
          if (cell.roomId || cell.branchId || (cell.specialType && cell.specialType !== 'entrance')) { ok = false; break; }
          cells.push(cell);
        }
        if (!ok) continue;
        if (opts.extraCheck && !opts.extraCheck(cells, x0, y)) continue;
        return { anchor: { x: x0, y }, cells };
      }
      return null;
    },

    /* 通用：给房间格子赋内容（连带清掉原有线索，避免冲突） */
    fillRoomCells(spot, roomId, contents) {
      spot.cells.forEach((cell, i) => {
        cell.roomId = roomId;
        cell.clueType = null;
        const content = contents[i] || {};
        cell.specialType = content.special || null;
        cell.resourceType = content.resource || null;
        cell.resourceValue = cell.resourceType ? MM.Resources.value(cell.resourceType) : 0;
      });
    },

    /* 通用：把房间周围若干邻近格换成更硬的岩层（§34 / §38：成本提前可见） */
    hardenAround(map, rng, cells, count, weights, blockRoute) {
      const dirs8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
      const candidates = [];
      cells.forEach((c) => {
        dirs8.forEach((d) => {
          const n = map.get(c.x + d[0], c.y + d[1]);
          if (!n || n.y === 0) return;
          if (n.roomId || n.specialType) return;
          if (blockRoute && map.isMainRoute(n.x, n.y)) return;
          if (candidates.indexOf(n) === -1) candidates.push(n);
        });
      });
      const shuffled = rng.shuffle(candidates);
      let changed = 0;
      for (let i = 0; i < shuffled.length && changed < count; i++) {
        this.setTerrain(shuffled[i], weights, rng);
        changed++;
      }
      return changed;
    },

    /* 地下泉（§35） */
    placeSpring(map, rng) {
      const def = MM.ROOMS.spring;
      const H = map.h;
      const spot = this.findSpot(map, rng, {
        y0: Math.max(4, Math.floor(H * def.depthRatio[0])),
        y1: Math.min(H - 3, Math.floor(H * def.depthRatio[1])),
        minDist: 3,
        offsetMin: 1, offsetMax: 3,   // P3 实测调整：泉更贴近主矿道，合理路线能顺路补给
      });
      if (!spot) return null;

      const cell = map.get(spot.x, spot.y);
      cell.specialType = 'spring';
      cell.roomId = 'spring';
      cell.resourceType = null;
      cell.resourceValue = 0;

      const clue = this.pickClueCell(map, spot.x, spot.y, rng, def.clue);
      map.rooms.spring = { x: spot.x, y: spot.y, clue };
      return map.rooms.spring;
    },

    /* ① 废弃矿工仓库（§32）：局内工具 + 少量矿物 */
    placeSupply(map, rng) {
      const def = MM.ROOMS.supply;
      const spot = this.placeCluster(map, rng, {
        y0: Math.max(5, Math.floor(map.h * def.depthRatio[0])),
        y1: Math.min(map.h - 4, Math.floor(map.h * def.depthRatio[1])),
        pattern: [[0, 0], [1, 0], [0, 1], [1, 1]],
        minDist: 2,
      });
      if (!spot) return null;
      const chestIndex = rng.nextInt(4);
      const plainIndex = (chestIndex + 1) % 4;
      const contents = spot.cells.map((c, i) => {
        if (i === chestIndex) return { special: 'warehouseChoice' };
        if (i === plainIndex) return {};
        return { resource: rng.pick(['copper', 'copper', 'gold']) };
      });
      this.fillRoomCells(spot, 'supply', contents);
      const clue = this.pickClueCell(map, spot.anchor.x, spot.anchor.y, rng, def.clue);
      map.rooms.supply = { anchor: spot.anchor, cells: spot.cells, chest: spot.cells[chestIndex], clue };
      return map.rooms.supply;
    },

    /* ② 黄金矿脉（§33）：大量金矿 + 少量水晶；发现不等于白拿，仍要挖 */
    placeGoldenVein(map, rng) {
      const def = MM.ROOMS.goldenVein;
      const spot = this.placeCluster(map, rng, {
        y0: Math.max(5, Math.floor(map.h * def.depthRatio[0])),
        y1: Math.min(map.h - 5, Math.floor(map.h * def.depthRatio[1])),
        pattern: [[0, 0], [1, 0], [0, 1], [1, 1]],
        minDist: 3,
      });
      if (!spot) return null;
      this.fillRoomCells(spot, 'goldenVein', [
        { resource: 'gold' }, { resource: 'gold' },
        { resource: 'gold' }, { resource: 'crystal' },
      ]);
      const clue = this.pickClueCell(map, spot.anchor.x, spot.anchor.y, rng, def.clue);
      map.rooms.goldenVein = { anchor: spot.anchor, cells: spot.cells, clue };
      return map.rooms.goldenVein;
    },

    /* ③ 天然水晶洞（§34）：大量水晶；外围较多 2～3 体力岩块（高收益高成本） */
    placeCrystalCave(map, rng) {
      const def = MM.ROOMS.crystalCave;
      const spot = this.placeCluster(map, rng, {
        y0: Math.max(5, Math.floor(map.h * def.depthRatio[0])),
        y1: Math.min(map.h - 6, Math.floor(map.h * def.depthRatio[1])),
        pattern: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
        minDist: 3,
      });
      if (!spot) return null;
      this.fillRoomCells(spot, 'crystalCave', [
        { resource: 'crystal' }, { resource: 'crystal' }, { resource: 'crystal' },
        { resource: 'silver' }, { resource: 'crystal' },
      ]);
      const core = map.get(spot.anchor.x, spot.anchor.y);
      if (core) core.relicSource = 'coreCrystal';
      const hardened = this.hardenAround(map, rng, spot.cells, 8, { rock: 55, hard: 45 }, true);
      const clue = this.pickClueCell(map, spot.anchor.x, spot.anchor.y, rng, def.clue);
      map.rooms.crystalCave = { anchor: spot.anchor, cells: spot.cells, clue, hardened };
      return map.rooms.crystalCave;
    },

    /* ⑤ 废弃矿车站（§36 / §37）：可乘坐矿车向深处移动 5～8m；目的地预生成并验证 */
    placeMinecart(map, rng) {
      const def = MM.ROOMS.minecart;
      const spot = this.placeCluster(map, rng, {
        y0: Math.max(6, Math.floor(map.h * def.depthRatio[0])),
        y1: Math.min(map.h - 8, Math.floor(map.h * def.depthRatio[1])),
        pattern: [[0, 0]],
        minDist: 3,
      });
      if (!spot) return null;

      const cart = spot.cells[0];
      cart.roomId = 'minecart';
      cart.specialType = 'minecart';
      cart.resourceType = null;
      cart.resourceValue = 0;
      cart.clueType = null;

      /* 铁轨线索：车格上下各铺一段（§31 / §36） */
      const rails = [];
      [[0, -1], [0, 1], [1, 1]].forEach((d) => {
        const c = map.get(cart.x + d[0], cart.y + d[1]);
        if (c && c.y > 0 && !c.roomId && !c.specialType && !c.clueType) {
          c.clueType = 'rails';
          rails.push({ x: c.x, y: c.y });
        }
      });

      /* §37：先生成目的地，目的地不合法就视为摆放失败（交给重生成） */
      const dest = this.pickMinecartDestination(map, rng, cart);
      if (!dest) return null;

      map.plan.minecart = { x: cart.x, y: cart.y };
      map.plan.minecartDest = dest;
      map.rooms.minecart = { anchor: { x: cart.x, y: cart.y }, cart: { x: cart.x, y: cart.y }, clue: rails[0] || null };
      return map.rooms.minecart;
    },

    /* §37：矿车目的地必须可站立、有继续探索空间、不封闭、不直接进入藏宝库、不越界 */
    pickMinecartDestination(map, rng, cart) {
      const cfg = MM.MINECART_CFG;
      const vaultRow = map.vault ? map.vault.y : map.h - 1;
      const minRow = cart.y + cfg.MIN_DIST;
      const maxRow = Math.min(Math.min(map.h - 2, vaultRow - 2), cart.y + cfg.MAX_DIST);
      if (minRow > maxRow) return null;

      for (let tries = 0; tries < 60; tries++) {
        const y = rng.rangeInt(minRow, maxRow);
        const routeX = (map.mainRoutePath[y] && map.mainRoutePath[y].x) || cart.x;
        const x = MM.U.clamp(routeX + rng.rangeInt(-1, 1), 0, map.w - 1);
        const cell = map.get(x, y);
        if (!cell || cell.roomId || cell.specialType || cell.clueType) continue;
        if (cell.resourceType) continue;              // 目的地不白送"被跳过"的矿物
        let open = 0;
        MM.Pathfinder.DIRS4.forEach((d) => {
          const n = map.get(x + d[0], y + d[1]);
          if (n && n.y > 0 && n.roomId !== 'treasure') open++;
        });
        if (open < cfg.DEST_CLEAR_NEIGHBORS) continue;
        return { x, y };
      }
      return null;
    },

    /* ⑥ 坍塌宝库（§38）：奖励提前可见、成本提前可见（入口附近坚硬岩石较多） */
    placeRuinVault(map, rng) {
      const def = MM.ROOMS.ruinVault;
      const spot = this.placeCluster(map, rng, {
        y0: Math.max(6, Math.floor(map.h * def.depthRatio[0])),
        y1: Math.min(map.h - 5, Math.floor(map.h * def.depthRatio[1])),
        pattern: [[0, 0], [1, 0], [0, 1], [1, 1]],
        minDist: 3,
      });
      if (!spot) return null;
      const cacheIndex = rng.nextInt(4);
      const contents = spot.cells.map((c, i) => {
        if (i === cacheIndex) return { special: 'ruinCache' };
        return { resource: rng.pick(['gold', 'gold', 'crystal']) };
      });
      this.fillRoomCells(spot, 'ruinVault', contents);
      const hardened = this.hardenAround(map, rng, spot.cells, 3, { hard: 100 }, true);
      const clue = this.pickClueCell(map, spot.anchor.x, spot.anchor.y, rng, def.clue);
      map.rooms.ruinVault = { anchor: spot.anchor, cells: spot.cells, clue, hardened };
      return map.rooms.ruinVault;
    },

    /* ⑦ 遗失物资室（§39）：宝箱 + 随机工具 + 矿物价值（综合奖励） */
    placeLostSupplies(map, rng) {
      const def = MM.ROOMS.lostSupplies;
      const spot = this.placeCluster(map, rng, {
        y0: Math.max(5, Math.floor(map.h * def.depthRatio[0])),
        y1: Math.min(map.h - 5, Math.floor(map.h * def.depthRatio[1])),
        pattern: [[0, 0], [1, 0], [0, 1]],
        minDist: 3,
      });
      if (!spot) return null;
      this.fillRoomCells(spot, 'lostSupplies', [
        { special: 'lostChest' }, { resource: 'gold' }, { resource: 'copper' },
      ]);
      const clue = this.pickClueCell(map, spot.anchor.x, spot.anchor.y, rng, def.clue);
      map.rooms.lostSupplies = { anchor: spot.anchor, cells: spot.cells, clue };
      return map.rooms.lostSupplies;
    },

    /* ⑧ 神秘石室（§40）：第一版最稀有；大宝箱 + 高额探索价值 + 扩展接口 */
    placeMysteryRoom(map, rng) {
      const def = MM.ROOMS.mysteryRoom;
      const spot = this.placeCluster(map, rng, {
        y0: Math.max(6, Math.floor(map.h * def.depthRatio[0])),
        y1: Math.min(map.h - 5, Math.floor(map.h * def.depthRatio[1])),
        pattern: [[0, 0], [1, 0]],
        minDist: 3,
      });
      if (!spot) return null;
      this.fillRoomCells(spot, 'mysteryRoom', [
        { special: 'mysteryChest' }, { resource: 'crystal' },
      ]);
      const clue = this.pickClueCell(map, spot.anchor.x, spot.anchor.y, rng, def.clue);
      map.rooms.mysteryRoom = {
        anchor: spot.anchor, cells: spot.cells, clue,
        extensions: (def.extensions || []).slice(),   // §40：V0.4+ 收藏品 / 世界观物件接口
      };
      return map.rooms.mysteryRoom;
    },

    /* 最终藏宝库（§42 / §44） */
    placeVault(map, rng) {
      const row = map.h - 2;
      const col = rng.nextInt(map.w);          // §42：横向位置随机，不要每次都在正中央

      const entrance = map.get(col, row);
      entrance.specialType = 'vaultEntrance';
      entrance.roomId = 'treasure';
      entrance.resourceType = null;
      entrance.resourceValue = 0;
      entrance.clueType = null;

      const chamber = [];
      for (let cx = col - 1; cx <= col + 1; cx++) {
        const cell = map.get(cx, map.h - 1);
        if (!cell) continue;
        cell.roomId = 'treasure';
        cell.specialType = 'vault';
        cell.resourceType = null;
        cell.resourceValue = 0;
        chamber.push({ x: cx, y: map.h - 1 });
      }

      /* §43：越靠近藏宝库，提示越明显——入口正上方放金色裂纹 */
      const up = map.get(col, row - 1);
      if (up && !up.clueType && !up.roomId && up.y > 0) up.clueType = 'goldCrack';

      map.vault = { x: col, y: row };
      map.rooms.treasure = { anchor: { x: col, y: row }, cells: chamber, clue: up ? { x: col, y: row - 1 } : null };
      return map.vault;
    },

    /* §43：约进入 35m（跟随预设配置）后，沿"主矿道 → 藏宝库"方向铺一串微弱金光 */
    placeHintTrail(map, rng) {
      const vault = map.vault;
      if (!vault) return [];
      const V = MM.specValidatorOf(map);
      const startMeters = (V && V.HINT_START_METERS) || 35;
      const startRow = MM.U.clamp(Math.round(startMeters), 1, Math.max(1, vault.y - 2));
      const startX = (map.mainRoutePath[startRow] && map.mainRoutePath[startRow].x) || map.entrance.x;

      const hints = [];
      for (let y = startRow; y < vault.y; y++) {
        const t = (y - startRow) / Math.max(1, vault.y - startRow);
        const jitter = rng.nextInt(3) - 1;
        const x = MM.U.clamp(Math.round(MM.U.lerp(startX, vault.x, t)) + jitter, 0, map.w - 1);
        const cell = map.get(x, y);
        if (cell && !cell.clueType && !cell.specialType && !cell.roomId && !cell.branchId) {
          cell.clueType = 'goldGlow';
          hints.push({ x, y });
        }
      }

      /* 保底：抖动导致提示太少时，沿藏宝库正上方补齐 */
      let guard = 0;
      let y2 = vault.y - 2;
      while (hints.length < MM.BALANCE.GENERATOR.HINT_TRAIL_MIN && y2 >= 1 && guard++ < 20) {
        const cell = map.get(vault.x, y2);
        if (cell && !cell.clueType && !cell.specialType && !cell.roomId && !cell.branchId) {
          cell.clueType = 'goldGlow';
          hints.push({ x: vault.x, y: y2 });
        }
        y2--;
      }

      map.hintTrail = hints;
      return hints;
    },

    /* ── 辅助：位置选择 ─────────────────────────────────────── */
    findSpot(map, rng, opts) {
      for (let tries = 0; tries < 60; tries++) {
        const y = rng.rangeInt(opts.y0, opts.y1);
        let x;
        if (tries < 45) {
          const routeX = (map.mainRoutePath[y] && map.mainRoutePath[y].x) || map.entrance.x;
          const dir = rng.pick([-1, 1]);
          const oMin = opts.offsetMin != null ? opts.offsetMin : 2;
          const oMax = opts.offsetMax != null ? opts.offsetMax : 4;
          x = MM.U.clamp(routeX + dir * rng.rangeInt(oMin, oMax), 0, map.w - 1);
        } else {
          x = rng.nextInt(map.w);
        }
        const cell = map.get(x, y);
        if (!cell || cell.y === 0) continue;
        if (cell.roomId || (cell.specialType && cell.specialType !== 'entrance')) continue;
        if (this.tooCloseToRooms(map, x, y, opts.minDist || 3)) continue;
        return { x, y };
      }
      return null;
    },

    tooCloseToRooms(map, x, y, minDist) {
      const anchors = [];
      Object.keys(map.rooms).forEach((id) => {
        const r = map.rooms[id];
        if (!r) return;
        if (r.anchor) anchors.push(r.anchor);
        else if (r.x != null && r.y != null) anchors.push({ x: r.x, y: r.y });
      });
      for (let i = 0; i < anchors.length; i++) {
        if (MM.U.manhattan(x, y, anchors[i].x, anchors[i].y) < minDist) return true;
      }
      return false;
    },

    /* 在目标格周围挑一个"线索格"（§31：不要完全靠随机撞墙） */
    pickClueCell(map, x, y, rng, clueType) {
      const candidates = rng.shuffle([
        { x: x, y: y - 1 },
        { x: x - 1, y: y },
        { x: x + 1, y: y },
        { x: x - 2, y: y },
        { x: x + 2, y: y },
        { x: x, y: y + 1 },
      ]);
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const cell = map.get(c.x, c.y);
        if (!cell || cell.y === 0) continue;
        if (cell.specialType || cell.roomId) continue;
        if (!cell.clueType) cell.clueType = clueType;
        return c;
      }
      return null;
    },

    /* ── ⑨ 局部修正 ────────────────────────────────────────── */
    repair(map, rng, report) {
      const notes = [];
      const V = MM.specValidatorOf(map);
      const an = MM.Pathfinder.analyze(map, map.entrance);
      const carveTo = (x, y, why) => {
        const path = an.pathTo(x, y);
        if (!path) return;
        let changed = 0;
        path.forEach((c) => {
          const cell = map.get(c.x, c.y);
          if (cell && !cell.excavated && cell.digCost > MM.TERRAIN.dirt.digCost) {
            cell.terrainType = 'dirt';
            cell.digCost = MM.TERRAIN.dirt.digCost;
            changed++;
          }
        });
        notes.push({ why, changed });
      };

      const codes = (report.failures || []).map((f) => f.code);
      if (codes.indexOf('treasureTooExpensive') >= 0 || codes.indexOf('vaultUnreachable') >= 0) {
        carveTo(map.vault.x, map.vault.y, 'treasure');
      }
      if (codes.indexOf('midDepth') >= 0) {
        const row = MM.U.clamp(Math.round(V.MID_DEPTH_METERS), 1, Math.max(1, map.h - 2));
        const arg = an.argRow[row];
        if (arg >= 0) carveTo(arg % map.w, row, 'midDepth');
      }
      if (codes.indexOf('minerals') >= 0) {
        const pool = (map.spec && map.spec.resourcePool) || MM.RESOURCE_POOL_FULL;
        let count = map.count((c) => !!c.resourceType);
        let guard = 0;
        while (count < V.MIN_MINERAL_CELLS && guard++ < 400) {
          const cell = map.get(rng.nextInt(map.w), rng.rangeInt(1, map.h - 1));
          if (cell && !cell.resourceType && !cell.specialType) {
            const pick = rng.pick(pool);
            cell.resourceType = pick;
            cell.resourceValue = MM.Resources.value(pick);
            count++;
          }
        }
        notes.push({ why: 'minerals', count });
      }
      if (codes.indexOf('roomsUnreachable') >= 0) {
        const plan = map.plan || { rooms: [] };
        (plan.rooms || []).forEach((id) => {
          const cells = map.roomCells(id);
          if (cells.length) carveTo(cells[0].x, cells[0].y, id);
        });
        if ((plan.rooms || []).indexOf('minecart') >= 0 && !plan.minecartDest && plan.minecart) {
          const cartCell = map.get(plan.minecart.x, plan.minecart.y);
          plan.minecartDest = this.pickMinecartDestination(map, rng, cartCell);
          notes.push({ why: 'minecartDest' });
        }
      }
      if (codes.indexOf('hints') >= 0) {
        this.placeHintTrail(map, rng);
        notes.push({ why: 'hints' });
      }
      if (codes.indexOf('roomClues') >= 0) {
        const plan = map.plan || { rooms: [] };
        (plan.rooms || []).forEach((id) => {
          if (map.roomCells(id).length) this.ensureRoomClueVisible(map, id);
        });
        notes.push({ why: 'roomClues' });
      }
      if (codes.indexOf('branches') >= 0) {
        /* 岔路不合格：重新铺一次岔路（插塞/支线/线索都重算），仍不合格则整体重生成 */
        this.carveBranches(map, rng);
        const plan = map.plan || { rooms: [] };
        (plan.rooms || []).forEach((id) => {
          if (map.roomCells(id).length) this.ensureRoomClueVisible(map, id);
        });
        notes.push({ why: 'branches' });
      }
      if (codes.indexOf('notClearable') >= 0) {
        /* P3：真实通关失败的图，先沿"藏宝库 + 泉水"两条走线补泥土，再交给 Validator 复验 */
        carveTo(map.vault.x, map.vault.y, 'clearVault');
        const sp = map.rooms && map.rooms.spring;
        if (sp) carveTo(sp.x, sp.y, 'clearSpring');
      }
      return notes;
    },

    /* 兜底：保证入口 → 中段 / 藏宝库存在泥土通道 + 矿物数量达标 */
    forcePassable(map, rng) {
      const V = MM.specValidatorOf(map);
      const pool = (map.spec && map.spec.resourcePool) || MM.RESOURCE_POOL_FULL;
      const an = MM.Pathfinder.analyze(map, map.entrance);
      const targets = [];
      if (map.vault) targets.push({ x: map.vault.x, y: map.vault.y });
      const midRow = MM.U.clamp(Math.round(V.MID_DEPTH_METERS), 1, Math.max(1, map.h - 2));
      if (an.argRow[midRow] >= 0) targets.push({ x: an.argRow[midRow] % map.w, y: midRow });
      const sp = map.rooms && map.rooms.spring;
      if (sp) targets.push({ x: sp.x, y: sp.y });
      const plan = map.plan || { rooms: [] };
      (plan.rooms || []).forEach((id) => {
        const cells = map.roomCells(id);
        if (cells.length && targets.length < 16) targets.push({ x: cells[0].x, y: cells[0].y });
      });

      targets.forEach((t) => {
        const path = an.pathTo(t.x, t.y) || [];
        path.forEach((c) => {
          const cell = map.get(c.x, c.y);
          if (cell && !cell.excavated) {
            cell.terrainType = 'dirt';
            cell.digCost = MM.TERRAIN.dirt.digCost;
          }
        });
      });

      let count = map.count((c) => !!c.resourceType);
      let guard = 0;
      while (count < V.MIN_MINERAL_CELLS && guard++ < 400) {
        const cell = map.get(rng.nextInt(map.w), rng.rangeInt(1, map.h - 1));
        if (cell && !cell.resourceType && !cell.specialType) {
          const pick = rng.pick(pool);
          cell.resourceType = pick;
          cell.resourceValue = MM.Resources.value(pick);
          count++;
        }
      }
    },
  };

  MM.Generator = G;
})();
