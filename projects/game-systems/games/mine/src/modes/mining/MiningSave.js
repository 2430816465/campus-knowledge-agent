/* 地下矿坑独立存档（设计规格 §54 / §70；V0.6 起加入纪录版本）：
 *
 * 与《再上一层》主魔塔存档完全隔离，本模式只用自己的键：
 *   forgotten-tower.mining.save.v1   —— 矿坑自己的历史纪录
 *
 * 通用内容货币是"账号级"的（§46 / §70），不允许出现第二套永久货币：
 *   forgotten-tower.meta.v1          —— 账号级 metaProgress { currency }
 * 同时兼容"再守一波"原型已建立的 forgotten-tower.td.save.v1：
 *   - 读取时若账号级键还没有，就先采用它里面的 metaProgress.currency；
 *   - 发放奖励时同步写回它的 metaProgress.currency（只动这一个字段）。
 * 接入正式项目时，这里整体替换为主项目现有的 metaProgress 结构即可。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const KEY = 'forgotten-tower.mining.save.v1';
  const META_KEY = 'forgotten-tower.meta.v1';
  const TD_COMPAT_KEY = 'forgotten-tower.td.save.v1';
  const MAIN_PLACEHOLDER_KEY = 'forgotten-tower.main.placeholder.v1';

  let data = null;
  let memory = null;

  function readRaw(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeRaw(key, str) {
    try { localStorage.setItem(key, str); return true; } catch (e) { return false; }
  }
  function readJson(key) {
    const raw = readRaw(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function walletData() {
    const meta = readJson(META_KEY);
    if (meta && meta.metaProgress) return meta;
    const td = readJson(TD_COMPAT_KEY);
    if (td && td.metaProgress) {
      const migrated = { v: MM.VERSION, metaProgress: { currency: Math.max(0, Math.floor(Number(td.metaProgress.currency) || 0)) } };
      writeRaw(META_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return { v: MM.VERSION, metaProgress: { currency: 0 }, rewardLedger: {} };
  }

  function writeWallet(meta) {
    const ok = writeRaw(META_KEY, JSON.stringify(meta));
    const td = readJson(TD_COMPAT_KEY);
    if (td) {
      td.metaProgress = td.metaProgress || {};
      td.metaProgress.currency = Math.max(0, Math.floor(Number(meta.metaProgress && meta.metaProgress.currency) || 0));
      writeRaw(TD_COMPAT_KEY, JSON.stringify(td));
    }
    return ok;
  }

  function fresh() {
    return {
      v: MM.VERSION,
      miningSave: {
        scoreVersion: 4,                       // V1.0：矿脉远征规则
        v4: { bestDepth: 0, bestValue: 0, totalDigs: 0 },
        v3: { bestDepth: 0, bestValue: 0, totalDigs: 0 },
        v2: { bestDepth: 0, bestValue: 0, totalDigs: 0 },
        legacy: { scoreVersion: 1, bestDepth: 0, bestValue: 0, totalDigs: 0 },  // V0.1–V0.5（×1.2 时代）仅展示
        treasureFirstClear: false,
        treasureReachCount: 0,
        treasureArrivals: {},
        /* V0.7 矿坑探索档案（§目标记录，不是第二套货币）：
         * 只记录"见过什么 / 到过多深"，用于标题页与结算页展示未发现内容。 */
        archive: { rooms: [], minerals: [], maxDepth: 0, treasureReachCount: 0, runs: 0, styles: [], relics: [] },
        /* V0.7.1 同 Seed 挑战：本机每个 Seed 的最佳记录（最多 40 条，本地互比） */
        seedRecordsByVersion: { '2': {}, '3': {}, '4': {} },
        seedRecords: {},                    // 兼容旧界面字段；始终指向当前规则榜
        activeRun: null,
        completedRunIds: {},
        expedition: {
          unlockedMines: ['oldMine'], firstClearMines: [], completedGoals: [],
          unlockedUpgrades: ['chainPick', 'directionalBomb', 'prospectingLens'],
          trackedGoal: null, trackedRelic: null, sealedMineCompleted: false, sealedRewardClaimed: false,
          goalRewards: {},
        },
      },
    };
  }

  function uniqList(v, allow) {
    const src = Array.isArray(v) ? v : [];
    const out = [];
    for (let i = 0; i < src.length; i++) {
      const id = String(src[i]);
      if (allow && allow.indexOf(id) === -1) continue;
      if (out.indexOf(id) === -1) out.push(id);
    }
    return out;
  }

  const SEED_CAP = 40;
  let legacyRunSequence = 0;

  function normSeedRecords(v) {
    const out = {};
    if (!v || typeof v !== 'object') return out;
    Object.keys(v).forEach((k) => {
      const seed = String(k).slice(0, 64);
      if (!seed) return;
      const r = v[k] || {};
      out[seed] = {
        challengeId: String(r.challengeId || k),
        seed: String(r.seed || k),
        mineId: String(r.mineId || 'oldMine'),
        params: r.params && typeof r.params === 'object' ? r.params : {},
        runs: Math.max(0, Math.floor(Number(r.runs) || 0)),
        bestDepth: Math.max(0, Math.floor(Number(r.bestDepth) || 0)),
        bestValue: Math.max(0, Math.floor(Number(r.bestValue) || 0)),
        treasureReached: !!r.treasureReached,
        lastAt: Math.max(0, Math.floor(Number(r.lastAt) || 0)),
      };
    });
    const keys = Object.keys(out);
    if (keys.length > SEED_CAP) {
      keys.sort((a, b) => out[a].lastAt - out[b].lastAt);
      keys.slice(0, keys.length - SEED_CAP).forEach((k) => delete out[k]);
    }
    return out;
  }

  function normalize(parsed) {
    const out = fresh();
    const src = (parsed && parsed.miningSave) || {};
    const num = (v) => Math.max(0, Math.floor(Number(v) || 0));

    /* 分数规则迁移：v2 与 v3 独立保存；旧 v2 的 Seed 榜不能混进新规则榜。 */
    if (src.v2) {
      out.miningSave.v2.bestDepth = num(src.v2.bestDepth);
      out.miningSave.v2.bestValue = num(src.v2.bestValue);
      out.miningSave.v2.totalDigs = num(src.v2.totalDigs);
      const lg = src.legacy || {};
      out.miningSave.legacy.bestDepth = num(lg.bestDepth);
      out.miningSave.legacy.bestValue = num(lg.bestValue);
      out.miningSave.legacy.totalDigs = num(lg.totalDigs);
    } else {
      out.miningSave.legacy.bestDepth = num(src.bestDepth);
      out.miningSave.legacy.bestValue = num(src.bestValue);
      out.miningSave.legacy.totalDigs = num(src.totalDigs);
    }
    if (src.v3) {
      out.miningSave.v3.bestDepth = num(src.v3.bestDepth);
      out.miningSave.v3.bestValue = num(src.v3.bestValue);
      out.miningSave.v3.totalDigs = num(src.v3.totalDigs);
    }
    if (src.v4) {
      out.miningSave.v4.bestDepth = num(src.v4.bestDepth);
      out.miningSave.v4.bestValue = num(src.v4.bestValue);
      out.miningSave.v4.totalDigs = num(src.v4.totalDigs);
    }
    out.miningSave.treasureFirstClear = !!src.treasureFirstClear;
    out.miningSave.treasureReachCount = num(src.treasureReachCount);
    out.miningSave.treasureArrivals = src.treasureArrivals && typeof src.treasureArrivals === 'object'
      ? src.treasureArrivals : {};
    /* V0.7 探索档案：旧存档没有该字段 → 从空档案开始（不清空旧纪录）。 */
    const ar = src.archive || {};
    out.miningSave.archive = {
      rooms: uniqList(ar.rooms, MM.ROOM_ORDER),
      minerals: uniqList(ar.minerals, MM.RESOURCE_ORDER),
      maxDepth: num(ar.maxDepth),
      treasureReachCount: out.miningSave.treasureReachCount,   // 以顶层纪录为准（旧档也能对齐）
      runs: num(ar.runs),
      styles: uniqList(ar.styles, (MM.BALANCE.STYLES || []).map((s) => s.id)),
      relics: uniqList(ar.relics, (MM.RELICS || []).map((r) => r.id)),
    };
    const ex = src.expedition || {};
    const unlocked = uniqList(ex.unlockedMines, Object.keys(MM.MINES || {}));
    const firstClearMines = uniqList(ex.firstClearMines, ['oldMine', 'resonanceCave', 'clockworkMine']);
    /* 旧版本只保存全局藏宝库首次通关；当时唯一可进入的是旧矿井。 */
    if (out.miningSave.treasureFirstClear && firstClearMines.indexOf('oldMine') < 0) firstClearMines.push('oldMine');
    if (unlocked.indexOf('oldMine') < 0) unlocked.unshift('oldMine');
    const historicDepth = Math.max(out.miningSave.archive.maxDepth, out.miningSave.v4.bestDepth,
      out.miningSave.v3.bestDepth, out.miningSave.v2.bestDepth, out.miningSave.legacy.bestDepth);
    if (historicDepth >= 30 && unlocked.indexOf('resonanceCave') < 0) unlocked.push('resonanceCave');
    out.miningSave.expedition = {
      unlockedMines: unlocked,
      firstClearMines,
      completedGoals: uniqList(ex.completedGoals, (MM.JOURNAL_GOALS || []).map((g) => g.id)),
      unlockedUpgrades: uniqList(ex.unlockedUpgrades, MM.UPGRADE_ORDER || []),
      trackedGoal: !((MM.RELICS || []).some((r) => r.id === ex.trackedRelic && !(ar.relics || []).includes(r.id)))
        && (MM.JOURNAL_GOALS || []).some((g) => g.id === ex.trackedGoal) ? ex.trackedGoal : null,
      trackedRelic: (MM.RELICS || []).some((r) => r.id === ex.trackedRelic && !(ar.relics || []).includes(r.id)) ? ex.trackedRelic : null,
      sealedMineCompleted: !!ex.sealedMineCompleted,
      sealedRewardClaimed: !!ex.sealedRewardClaimed,
      goalRewards: ex.goalRewards && typeof ex.goalRewards === 'object' ? ex.goalRewards : {},
    };
    out.miningSave.activeRun = src.activeRun && src.activeRun.version === 1 ? src.activeRun : null;
    out.miningSave.completedRunIds = src.completedRunIds && typeof src.completedRunIds === 'object' ? src.completedRunIds : {};
    /* 旧档有可核验历史时继承三个基础目标，不推测新增目标。 */
    if (out.miningSave.archive.styles.includes('explorer') && !out.miningSave.expedition.completedGoals.includes('E1')) out.miningSave.expedition.completedGoals.push('E1');
    if (out.miningSave.archive.styles.includes('miner') && !out.miningSave.expedition.completedGoals.includes('M1')) out.miningSave.expedition.completedGoals.push('M1');
    if (out.miningSave.archive.styles.includes('racer') && !out.miningSave.expedition.completedGoals.includes('R1')) out.miningSave.expedition.completedGoals.push('R1');
    out.miningSave.expedition.completedGoals.forEach((id) => {
      const goal = MM.Expedition && MM.Expedition.goal(id);
      if (goal && goal.unlock && out.miningSave.expedition.unlockedUpgrades.indexOf(goal.unlock) < 0) {
        out.miningSave.expedition.unlockedUpgrades.push(goal.unlock);
      }
    });
    const byVersion = src.seedRecordsByVersion || {};
    if (byVersion['2'] || byVersion['3'] || byVersion['4']) {
      out.miningSave.seedRecordsByVersion['2'] = normSeedRecords(byVersion['2']);
      out.miningSave.seedRecordsByVersion['3'] = normSeedRecords(byVersion['3']);
      out.miningSave.seedRecordsByVersion['4'] = normSeedRecords(byVersion['4']);
    } else if (src.seedRecords) {
      const oldVersion = Number(src.scoreVersion) >= 4 ? '4' : (Number(src.scoreVersion) >= 3 ? '3' : '2');
      out.miningSave.seedRecordsByVersion[oldVersion] = normSeedRecords(src.seedRecords);
    }
    out.miningSave.seedRecords = out.miningSave.seedRecordsByVersion['4'];
    if (MM.Expedition) MM.Expedition.evaluateUnlocks(out.miningSave);
    return out;
  }

  function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function serializeMap(map) {
    return {
      w: map.w, h: map.h, specId: (map.spec && (map.spec.mineId || map.spec.id)) || 'full',
      seed: map.seed, baseSeed: map.baseSeed, attempt: map.attempt,
      entrance: cloneJson(map.entrance), vault: cloneJson(map.vault),
      cells: map.cells.map((c) => cloneJson(c)),
      mainRoutePath: cloneJson(map.mainRoutePath || []),
      hintTrail: cloneJson(map.hintTrail || []), branches: cloneJson(map.branches || []),
      plan: cloneJson(map.plan), rooms: cloneJson(map.rooms || {}),
      workbench: cloneJson(map.workbench || null), workbenches: cloneJson(map.workbenches || []),
      gate: cloneJson(map.gate || null), resonanceStones: cloneJson(map.resonanceStones || []),
      generationOptions: cloneJson(map.generationOptions || {}),
    };
  }

  function restoreMap(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.cells) || snapshot.cells.length !== snapshot.w * snapshot.h) return null;
    const spec = MM.mapSpec(snapshot.specId || 'full');
    const map = new MM.MineMap(snapshot.w, snapshot.h, spec);
    map.seed = snapshot.seed || null;
    map.baseSeed = snapshot.baseSeed || map.seed;
    map.attempt = Math.max(1, Math.floor(snapshot.attempt || 1));
    map.validated = true;
    map.entrance = cloneJson(snapshot.entrance) || { x: 4, y: 0 };
    map.vault = cloneJson(snapshot.vault);
    map.cells = snapshot.cells.map((c) => Object.assign(MM.createCell(c.x, c.y), cloneJson(c)));
    map.mainRoutePath = cloneJson(snapshot.mainRoutePath || []);
    map.mainRouteSet = new Set(map.mainRoutePath.map((p) => p.x + ',' + p.y));
    map.hintTrail = cloneJson(snapshot.hintTrail || []);
    map.branches = cloneJson(snapshot.branches || []);
    map.plan = cloneJson(snapshot.plan);
    map.rooms = cloneJson(snapshot.rooms || {});
    map.workbench = cloneJson(snapshot.workbench || null);
    map.workbenches = cloneJson(snapshot.workbenches || (map.workbench ? [map.workbench] : []));
    map.gate = cloneJson(snapshot.gate || null);
    map.resonanceStones = cloneJson(snapshot.resonanceStones || []);
    map.generationOptions = cloneJson(snapshot.generationOptions || {});
    return map;
  }

  function load() {
    if (data) return data;
    const raw = readRaw(KEY);
    if (raw) {
      try { data = normalize(JSON.parse(raw)); }
      catch (e) { data = fresh(); }
    } else {
      data = fresh();
    }
    writeRaw(KEY, JSON.stringify(data));
    return data;
  }

  const Save = {
    KEY, META_KEY, TD_COMPAT_KEY, MAIN_PLACEHOLDER_KEY,

    get() { return load(); },
    persist() { writeRaw(KEY, JSON.stringify(load())); },

    hasActiveRun() { return !!load().miningSave.activeRun; },

    saveActiveRun(run, map, modal) {
      if (!run || !map || run.tutorialRun || run.settled || !run.runId) return false;
      /* 仅在动作边界保存，避免恢复到扣料/爆破动画的中间帧。 */
      if (run.state === MM.State.S.DIGGING || run.state === MM.State.S.MOVING
          || run.state === MM.State.S.ROOM_DISCOVERY) return false;
      const runCopy = {};
      Object.keys(run).forEach((key) => {
        if (key !== 'rngLoot' && key !== 'action' && key !== 'move') runCopy[key] = cloneJson(run[key]);
      });
      runCopy.state = MM.State.S.EXPLORING;
      runCopy.pendingDiscovery = null;
      runCopy.pendingTreasure = false;
      runCopy.pendingWorkbench = false;
      runCopy.pendingRoomChoice = null;
      const active = {
        version: 1, runId: run.runId, seed: run.seed, mineId: run.mapId || 'oldMine',
        savedAt: Date.now(), run: runCopy,
        rngLoot: run.rngLoot && run.rngLoot.snapshot ? run.rngLoot.snapshot() : null,
        map: serializeMap(map), modal: modal ? cloneJson(modal) : null,
      };
      load().miningSave.activeRun = active;
      this.persist();
      return true;
    },

    restoreActiveRun() {
      const active = load().miningSave.activeRun;
      if (!active || active.version !== 1) return null;
      const map = restoreMap(active.map);
      if (!map) return null;
      const run = cloneJson(active.run) || {};
      const arrival = load().miningSave.treasureArrivals[active.runId];
      if (arrival) {
        run.treasureArrivalRecorded = true;
        run.firstTreasureAtArrival = !!arrival.first;
        run.mineFirstClearAtArrival = !!arrival.firstMineClear;
      }
      run.rngLoot = active.rngLoot ? MM.RNG.restore(active.rngLoot) : MM.RNG.create(String(run.seed || 'restored') + '#loot');
      run.action = null;
      run.move = null;
      run.state = MM.State.S.EXPLORING;
      run.settled = false;
      run.summary = null;
      run.pendingDiscovery = null;
      run.pendingTreasure = false;
      run.pendingWorkbench = false;
      run.pendingRoomChoice = null;
      return { run, map, modal: cloneJson(active.modal), mineId: active.mineId || run.mapId || 'oldMine' };
    },

    clearActiveRun(runId) {
      const s = load().miningSave;
      if (!s.activeRun || (runId && s.activeRun.runId !== runId)) return false;
      s.activeRun = null;
      this.persist();
      return true;
    },
    /* 对外视图：best* / totalDigs 指当前规则 v4，v3 / v2 / legacy 分开保留。 */
    records() {
      const s = load().miningSave;
      return {
        scoreVersion: s.scoreVersion,
        bestDepth: s.v4.bestDepth,
        bestValue: s.v4.bestValue,
        totalDigs: s.v4.totalDigs,
        v3: Object.assign({}, s.v3),
        v4: Object.assign({}, s.v4),
        expedition: JSON.parse(JSON.stringify(s.expedition)),
        activeRun: !!s.activeRun,
        previous: {
          scoreVersion: 2,
          bestDepth: s.v2.bestDepth,
          bestValue: s.v2.bestValue,
          totalDigs: s.v2.totalDigs,
        },
        legacy: {
          bestDepth: s.legacy.bestDepth,
          bestValue: s.legacy.bestValue,
          totalDigs: s.legacy.totalDigs,
        },
        treasureFirstClear: s.treasureFirstClear,
        treasureReachCount: s.treasureReachCount,
        archive: {
          rooms: s.archive.rooms.slice(),
          minerals: s.archive.minerals.slice(),
          maxDepth: s.archive.maxDepth,
          treasureReachCount: s.archive.treasureReachCount,
          runs: s.archive.runs,
          styles: s.archive.styles.slice(),
          relics: s.archive.relics.slice(),
        },
      };
    },

    /* V0.8.2：遗物掉落即时归档（不必等结算，中途退出也不丢） */
    discoverRelic(id) {
      const a = load().miningSave.archive;
      if (a.relics.indexOf(id) >= 0) return false;
      if (!(MM.RELICS || []).some((r) => r.id === id)) return false;
      a.relics.push(id);
      if (load().miningSave.expedition.trackedRelic === id) load().miningSave.expedition.trackedRelic = null;
      this.persist();
      return true;
    },

    relicCount() { return load().miningSave.archive.relics.length; },

    /* 藏宝库抵达即记入局外进度；稳定 runId 使崩溃恢复与结算兜底不会重复计数。 */
    markTreasureArrival(run, map, entrance) {
      if (!run || !run.runId || run.tutorialRun) return null;
      const s = load().miningSave;
      const runId = String(run.runId);
      let arrival = s.treasureArrivals[runId];
      if (!arrival) {
        const mineId = run.mapId || 'oldMine';
        const isSealed = mineId === 'sealedVault';
        const first = !s.treasureFirstClear;
        const firstSealedClear = isSealed && !s.expedition.sealedMineCompleted;
        const firstMineClear = !isSealed && s.expedition.firstClearMines.indexOf(mineId) < 0;
        arrival = { first, firstMineClear, firstSealedClear, mineId, at: Date.now() };
        s.treasureArrivals[runId] = arrival;
        s.treasureFirstClear = true;
        s.treasureReachCount += 1;
        s.archive.treasureReachCount = s.treasureReachCount;
        if (firstMineClear) s.expedition.firstClearMines.push(mineId);
        if (isSealed) s.expedition.sealedMineCompleted = true;
        if (MM.Expedition) MM.Expedition.evaluateUnlocks(s);
        /* 抵达事件发生在 DIGGING 动作末尾。同步保存一个动作已完成的恢复点，
         * 避免应用中断时地图、+120 价值和抵达记录只保存了一部分。 */
        if (map) {
          const checkpointRun = {};
          Object.keys(run).forEach((key) => {
            if (key !== 'rngLoot' && key !== 'action' && key !== 'move') checkpointRun[key] = cloneJson(run[key]);
          });
          const at = entrance || { x: run.playerX, y: run.playerY };
          checkpointRun.playerX = at.x;
          checkpointRun.playerY = at.y;
          checkpointRun.currentDepth = at.y;
          checkpointRun.maxDepthReached = Math.max(checkpointRun.maxDepthReached || 0, at.y);
          checkpointRun.state = MM.State.S.EXPLORING;
          checkpointRun.pendingTreasure = false;
          checkpointRun.pendingDiscovery = null;
          checkpointRun.pendingWorkbench = false;
          checkpointRun.pendingRoomChoice = null;
          checkpointRun.pendingSpring = null;
          checkpointRun.pendingGate = false;
          const mapCheckpoint = serializeMap(map);
          mapCheckpoint.cells.forEach((cell) => { if (cell.roomId === 'treasure') cell.revealed = true; });
          const preview = first
            ? { first: true, amount: MM.BALANCE.META_REWARD.FIRST_TREASURE }
            : { first: false, amount: MM.BALANCE.META_REWARD.REPEAT_TREASURE };
          s.activeRun = {
            version: 1, runId, seed: String(run.seed), mineId,
            savedAt: Date.now(), arrivalCheckpoint: true, run: checkpointRun,
            rngLoot: run.rngLoot && run.rngLoot.snapshot ? run.rngLoot.snapshot() : null,
            map: mapCheckpoint, modal: { type: 'treasureChoice', preview },
          };
          arrival.checkpoint = true;
        }
        const keys = Object.keys(s.treasureArrivals);
        if (keys.length > 500) {
          keys.sort((a, b) => (s.treasureArrivals[a].at || 0) - (s.treasureArrivals[b].at || 0));
          keys.slice(0, keys.length - 500).forEach((id) => {
            if (!s.activeRun || s.activeRun.runId !== id) delete s.treasureArrivals[id];
          });
        }
        this.persist();
      }
      run.treasureArrivalRecorded = true;
      run.firstTreasureAtArrival = !!arrival.first;
      run.mineFirstClearAtArrival = !!arrival.firstMineClear;
      return cloneJson(arrival);
    },

    /* V0.7.1：本机挑战榜（按最深 → 价值排序），标题页展示用 */
    seedTop(n) {
      const recs = load().miningSave.seedRecordsByVersion['4'] || {};
      return Object.keys(recs)
        .map((key) => Object.assign({ seed: recs[key].seed || key }, recs[key]))
        .sort((a, b) => (b.bestDepth - a.bestDepth) || (b.bestValue - a.bestValue))
        .slice(0, n || 3);
    },

    /* V0.8.3：查询单个 Seed 的本机记录（每日挑战按钮 / 结算页使用） */
    seedBestOf(seed, mineId, params) {
      const recs = load().miningSave.seedRecordsByVersion['4'];
      const id = MM.Expedition ? MM.Expedition.challengeId(seed, mineId || 'oldMine', params || {}) : null;
      const r = (id && recs[id]) || Object.keys(recs).map((key) => recs[key])
        .find((entry) => entry.seed === String(seed) && (!mineId || entry.mineId === mineId)
          && (!params || JSON.stringify(entry.params || {}) === JSON.stringify(params)));
      return r ? Object.assign({}, r, { seed: String(seed) }) : null;
    },

    /* V0.7：下一局可选挑战（只是提示，不绑定任务 / 奖励压力）。
     * 优先级：先藏宝库 → 未发现的房间 → 未挖到的矿物 → 个人深度纪录。 */
    challenge() {
      if (MM.Expedition && MM.Expedition.nextSuggestion) return MM.Expedition.nextSuggestion();
      const rec = this.records();
      const a = rec.archive;
      const spec = MM.mapSpec();
      const depth = (spec && spec.DEPTH_LABEL) || 44;
      if (!rec.treasureReachCount) {
        return { id: 'treasure', text: '抵达 ' + depth + 'm 藏宝库（本局主目标）' };
      }
      const unRooms = MM.ROOM_ORDER.filter((id) => a.rooms.indexOf(id) === -1);
      if (unRooms.length) {
        const first = (MM.ROOMS[unRooms[0]] || {}).name || unRooms[0];
        return {
          id: 'rooms',
          text: '找到尚未发现的「' + first + '」'
            + (unRooms.length > 1 ? '（还有 ' + (unRooms.length - 1) + ' 类隐藏区域未发现）' : ''),
        };
      }
      /* V0.7.1：房间都见过后，优先提示还没完成过的探索风格 */
      const unStyles = (MM.BALANCE.STYLES || []).filter((s) => a.styles.indexOf(s.id) === -1);
      if (unStyles.length) {
        return {
          id: 'style',
          styleId: unStyles[0].id,
          text: '试试「' + unStyles[0].name + '」风格：' + unStyles[0].goal,
        };
      }
      const unMinerals = MM.RESOURCE_ORDER.filter((id) => a.minerals.indexOf(id) === -1);
      if (unMinerals.length) {
        const first = (MM.RESOURCES[unMinerals[0]] || {}).name || unMinerals[0];
        return { id: 'minerals', text: '挖到尚未见过的「' + first + '」' };
      }
      /* V0.8.2：遗物收集（只在神秘石室掉落） */
      const unRelics = (MM.RELICS || []).filter((r) => a.relics.indexOf(r.id) === -1);
      if (unRelics.length) {
        return { id: 'relics', text: '在神秘石室找到遗物（还差 ' + unRelics.length + ' 件）' };
      }
      if (a.maxDepth > 0) {
        return { id: 'depth', text: '超过个人最深 ' + a.maxDepth + 'm，或换一条岔路走' };
      }
      return { id: 'route', text: '试试少坐矿车、多挖岔路的路线' };
    },

    /* 账号级通用货币：先读账号级键，没有则兼容吸收再守一波的 metaProgress */
    currency() {
      return Math.max(0, Math.floor(Number(walletData().metaProgress.currency) || 0));
    },

    addCurrency(n) {
      const meta = walletData();
      meta.metaProgress = meta.metaProgress || {};
      const v = Math.max(0, Math.floor(Number(meta.metaProgress.currency) || 0) + Math.round(n || 0));
      meta.v = MM.VERSION;
      meta.metaProgress.currency = v;
      writeWallet(meta);
      return v;
    },

    grantCurrencyOnce(id, amount) {
      const key = String(id || '');
      const n = Math.max(0, Math.floor(Number(amount) || 0));
      if (!key || !n) return { granted: false, amount: 0, currency: this.currency() };
      const meta = walletData();
      meta.metaProgress = meta.metaProgress || { currency: 0 };
      meta.rewardLedger = meta.rewardLedger || {};
      if (meta.rewardLedger[key]) return { granted: false, amount: 0, currency: Math.max(0, Number(meta.metaProgress.currency) || 0) };
      meta.metaProgress.currency = Math.max(0, Math.floor(Number(meta.metaProgress.currency) || 0)) + n;
      meta.rewardLedger[key] = Date.now();
      /* 仅保留最近 500 个幂等令牌，避免账号存档无限增长。 */
      const tokens = Object.keys(meta.rewardLedger);
      if (tokens.length > 500) {
        tokens.sort((a, b) => (meta.rewardLedger[a] || 0) - (meta.rewardLedger[b] || 0));
        tokens.slice(0, tokens.length - 500).forEach((k) => delete meta.rewardLedger[k]);
      }
      meta.v = MM.VERSION;
      const ok = writeWallet(meta);
      return { granted: ok, amount: ok ? n : 0, currency: Math.max(0, Number(meta.metaProgress.currency) || 0) };
    },

    /* 一局结束：v4 成绩、手册/矿区进度与账号奖励使用稳定 runId 去重。 */
    recordRun(run, summary) {
      const s = load().miningSave;
      const runId = String(run.runId || ('legacy-' + (run.seed == null ? 'unknown' : run.seed)
        + '-' + Date.now().toString(36) + '-' + (++legacyRunSequence).toString(36)
        + '-' + Math.random().toString(36).slice(2, 8)));
      /* 旧调用可能没有 runId；在本次记录入口补齐后，藏宝库抵达兜底也能复用同一幂等键。 */
      run.runId = runId;
      if (s.completedRunIds[runId]) return cloneJson(s.completedRunIds[runId].result);
      const active = s.v4;
      const prevDepth = active.bestDepth;
      const prevValue = active.bestValue;
      const maxDepth = Math.floor(summary.maxDepth || 0);
      const finalValue = Math.floor(summary.finalValue || 0);
      active.bestDepth = Math.max(active.bestDepth, maxDepth);
      active.bestValue = Math.max(active.bestValue, finalValue);
      active.totalDigs += Math.floor(summary.excavated || 0);

      const mineId = run.mapId || 'oldMine';
      const isSealed = mineId === 'sealedVault';
      const previouslyUnlockedMines = (s.expedition.unlockedMines || []).slice();
      const arrival = summary.treasureReached ? this.markTreasureArrival(run) : null;
      const first = !!summary.treasureReached && !!run.firstTreasureAtArrival;
      let currencyGranted = 0;

      /* V0.7 探索档案：累计"见过的房间 / 矿物"用于标题页与结算页。 */
      const a = s.archive;
      const newRooms = [];
      (run.roomsFound || []).forEach((id) => {
        if (MM.ROOM_ORDER.indexOf(id) === -1) return;
        if (a.rooms.indexOf(id) !== -1) return;
        a.rooms.push(id);
        newRooms.push(id);
      });
      const newMinerals = [];
      MM.RESOURCE_ORDER.forEach((id) => {
        if (!(run.resources && run.resources[id] > 0)) return;
        if (a.minerals.indexOf(id) !== -1) return;
        a.minerals.push(id);
        newMinerals.push(id);
      });
      a.maxDepth = Math.max(a.maxDepth, Math.floor(summary.maxDepth || 0));
      a.treasureReachCount = s.treasureReachCount;
      a.runs += 1;
      /* V0.7.1：风格徽章 */
      const newStyles = [];
      if (run.style && run.style.done && MM.BALANCE.STYLES.some((st) => st.id === run.style.id)
        && a.styles.indexOf(run.style.id) === -1) {
        a.styles.push(run.style.id);
        newStyles.push(run.style.id);
      }

      /* V0.8.2：遗物（掉落时已写入档案，这里兜底合并并返回本局清单） */
      const newRelics = [];
      (run.relicsFound || []).forEach((id) => {
        if (!(MM.RELICS || []).some((r) => r.id === id)) return;
        if (a.relics.indexOf(id) === -1) a.relics.push(id);
        if (newRelics.indexOf(id) === -1) newRelics.push(id);
      });

      /* 规则版本、矿区、Seed、显式参数都参与同图成绩身份。 */
      const challengeId = (MM.Expedition && MM.Expedition.challengeId(run.seed, mineId, run.challengeParams))
        || ('v4|' + mineId + '|' + run.seed);
      const seedRecords = s.seedRecordsByVersion['4'];
      const sr = seedRecords[challengeId]
        || (seedRecords[challengeId] = { seed: String(run.seed), mineId, params: cloneJson(run.challengeParams || {}), challengeId, runs: 0, bestDepth: 0, bestValue: 0, treasureReached: false, lastAt: 0 });
      const prevSeedDepth = sr.bestDepth;
      const prevSeedValue = sr.bestValue;
      sr.runs += 1;
      sr.bestDepth = Math.max(sr.bestDepth, Math.floor(summary.maxDepth || 0));
      sr.bestValue = Math.max(sr.bestValue, Math.floor(summary.finalValue || 0));
      sr.treasureReached = sr.treasureReached || !!summary.treasureReached;
      sr.lastAt = Date.now();
      const seedImproved = Math.floor(summary.maxDepth || 0) > prevSeedDepth
        || Math.floor(summary.finalValue || 0) > prevSeedValue;
      const seedKeys = Object.keys(seedRecords);
      if (seedKeys.length > SEED_CAP) {
        seedKeys.sort((x, y) => seedRecords[x].lastAt - seedRecords[y].lastAt);
        seedKeys.slice(0, seedKeys.length - SEED_CAP).forEach((k) => delete seedRecords[k]);
      }
      s.seedRecords = seedRecords;

      /* 首次抵达时已立即记录矿区通关与解锁；此处仅为旧存档 / 旧调用兜底。 */
      if (summary.treasureReached && !arrival) this.markTreasureArrival(run);
      const newGoals = MM.Expedition ? MM.Expedition.completeGoals(run, s) : [];
      if (MM.Expedition) MM.Expedition.evaluateUnlocks(s);
      const newlyUnlockedMines = s.expedition.unlockedMines.filter((id) => previouslyUnlockedMines.indexOf(id) < 0);
      const firstMineClear = !!summary.treasureReached && !!run.mineFirstClearAtArrival;

      const rewards = [];
      if (summary.treasureReached) {
        const amount = first ? MM.BALANCE.META_REWARD.FIRST_TREASURE : MM.BALANCE.META_REWARD.REPEAT_TREASURE;
        rewards.push({ id: 'run:' + runId + ':treasure', amount });
      }
      newGoals.forEach((goalId) => rewards.push({ id: 'goal:' + goalId, amount: 1 }));
      if (firstMineClear) rewards.push({ id: 'mine:' + mineId + ':first-clear', amount: 2 });
      if (isSealed && summary.treasureReached && !s.expedition.sealedRewardClaimed) {
        s.expedition.sealedRewardClaimed = true;
        rewards.push({ id: 'sealed-vault:first-clear', amount: 10 });
      }
      rewards.forEach((reward) => {
        const grant = this.grantCurrencyOnce(reward.id, reward.amount);
        currencyGranted += grant.amount;
      });

      const result = {
        first,
        currencyGranted,
        currency: this.currency(),
        runId,
        challengeId,
        firstMineClear,
        firstSealedClear: !!(arrival && arrival.firstSealedClear),
        newGoals,
        newlyUnlockedMines,
        bestDepthImproved: Math.floor(summary.maxDepth || 0) > prevDepth,
        bestValueImproved: Math.floor(summary.finalValue || 0) > prevValue,
        newRooms,
        newMinerals,
        newStyles,
        newRelics,
        seedBest: { runs: sr.runs, bestDepth: sr.bestDepth, bestValue: sr.bestValue, treasureReached: sr.treasureReached },
        seedImproved,
      };
      s.activeRun = null;
      s.completedRunIds[runId] = { at: Date.now(), result: cloneJson(result) };
      const doneRuns = Object.keys(s.completedRunIds);
      if (doneRuns.length > 100) {
        doneRuns.sort((a, b) => (s.completedRunIds[a].at || 0) - (s.completedRunIds[b].at || 0));
        doneRuns.slice(0, doneRuns.length - 100).forEach((id) => delete s.completedRunIds[id]);
      }
      this.persist();
      return result;
    },

    /* 调试：清空矿坑纪录（账号级通用货币属于账号共享，不清，见 §70） */
    resetMining() {
      data = fresh();
      this.persist();
    },

    /* 主模式"占位"存档：只为验证两条存档链完全隔离（§71 / §78㉔），
     * 绝不触碰主模式真实存档键。 */
    mainPlaceholder: {
      load() {
        const o = readJson(MAIN_PLACEHOLDER_KEY);
        if (o) {
          return {
            floor: Math.max(1, Math.floor(Number(o.floor) || 1)),
            gold: Math.max(0, Math.floor(Number(o.gold) || 0)),
          };
        }
        return { floor: 1, gold: 0 };
      },
      save(o) {
        writeRaw(MAIN_PLACEHOLDER_KEY, JSON.stringify(o));
      },
      addFloor() {
        const o = this.load();
        o.floor += 1;
        o.gold += 10;
        this.save(o);
        return o;
      },
      reset() { this.save({ floor: 1, gold: 0 }); },
    },

    /* 无头测试用：丢弃内存缓存，强制从 localStorage 重读 */
    _dropCache() { data = null; memory = null; },
  };

  MM.Save = Save;
})();
