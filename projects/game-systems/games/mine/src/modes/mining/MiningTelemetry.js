/* 试玩记录（V0.6 / P4）：
 *   本地记录每一局：Seed / 用时 / 每层到达时间 / 岔路选择 / 工具使用 /
 *   泉水发现 / 矿车乘坐 / 撤离原因 / 最终价值；最多保留最近 20 局。
 *   导出：浏览器直接下载 JSON（不可用时回退到剪贴板 / 提示框）。
 * 存档键：forgotten-tower.mining.playtest.v1（与游戏存档完全分离）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const KEY = 'forgotten-tower.mining.playtest.v1';
  const MAX_RUNS = 20;

  function readAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.runs)) return { v: MM.VERSION, runs: d.runs };
      }
    } catch (e) { /* 忽略损坏记录 */ }
    return { v: MM.VERSION, runs: [] };
  }

  function writeAll(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 存储不可用时静默 */ }
  }

  function download(name, text) {
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (e) { /* 回退到剪贴板 / 提示框 */ }
    try {
      if (navigator && navigator.clipboard) { navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* 继续回退 */ }
    try {
      if (typeof window !== 'undefined' && window.prompt) {
        window.prompt('自动下载不可用：请复制以下试玩记录 JSON', text);
        return true;
      }
    } catch (e) { /* 放弃 */ }
    return false;
  }

  let current = null;

  const Telemetry = {
    KEY,

    start(run, mapId) {
      current = {
        seed: run.seed,
        map: mapId || (MM.BALANCE.DEFAULT_MAP || 'full'),
        startedAt: Date.now(),
        depthTimeline: [],
        branchChoices: [],
        toolUse: { bomb: 0, powerPick: 0, lamp: 0 },
        springAt: null,
        cartRides: 0,
        supplyChoices: [],
        style: run.style ? { id: run.style.id, name: run.style.name } : null,
        roomsFound: [],
        notes: '',
      };
      this._depth(run.playerY, 0);
      return current;
    },

    _depth(depth, atMs) {
      if (!current) return;
      const last = current.depthTimeline[current.depthTimeline.length - 1];
      if (last && last.depth >= depth) return;
      current.depthTimeline.push({
        depth,
        atMs: atMs != null ? atMs : (Date.now() - current.startedAt),
      });
    },

    noteDepth(run) { this._depth(run.playerY); },

    noteBranch(branchId, tier, depth) {
      if (!current || !branchId) return;
      if (current.branchChoices.some((b) => b.branchId === branchId)) return;
      current.branchChoices.push({
        branchId,
        tier: tier || 'unknown',
        depth,
        atMs: Date.now() - current.startedAt,
      });
    },

    noteTool(id) {
      if (!current || !id) return;
      current.toolUse[id] = (current.toolUse[id] || 0) + 1;
    },

    noteSpring(depth) {
      if (!current || current.springAt) return;
      current.springAt = { depth, atMs: Date.now() - current.startedAt };
    },

    noteCart() { if (current) current.cartRides++; },

    /* V0.7：记录补给档位与玩家选择（P4 分析"是否总选同一项"） */
    noteSupply(tierId, choiceId) {
      if (!current || !tierId) return;
      current.supplyChoices.push({ tierId, choiceId, atMs: Date.now() - current.startedAt });
    },

    noteRoom(id) {
      if (!current || !id) return;
      if (current.roomsFound.indexOf(id) < 0) current.roomsFound.push(id);
    },

    /* 结算时收尾并写入本地（最近 20 局） */
    finish(run, summary, endReason) {
      if (!current) return null;
      const now = Date.now();
      const rec = Object.assign({}, current, {
        endedAt: now,
        durationMs: now - current.startedAt,
        maxDepth: summary ? summary.maxDepth : run.maxDepthReached,
        baseValue: summary ? summary.baseValue : run.baseValue,
        finalValue: summary ? summary.finalValue : run.baseValue,
        kind: summary ? summary.kind : (endReason || 'direct'),
        endReason: endReason || (summary && summary.kind) || 'direct',
        treasureReached: !!run.treasureReached,
        staminaLeft: run.stamina,
        digs: run.stats ? run.stats.digActions : 0,
        excavated: run.stats ? run.stats.excavatedCells : 0,
        bombsUsed: run.stats ? run.stats.bombsUsed : 0,
        picksUsed: run.stats ? run.stats.picksUsed : 0,
        lampsUsed: run.stats ? run.stats.lampsUsed : 0,
        mineValue: run.mineValue || 0,
        otherValue: run.otherValue || 0,
        supplyText: summary ? summary.supplyText : '',
        styleDone: !!(run.style && run.style.done),
        styleReward: run.style ? (run.style.rewardText || '') : '',
        relics: (run.relicsFound || []).slice(),
      });
      const all = readAll();
      all.runs.unshift(rec);
      all.runs = all.runs.slice(0, MAX_RUNS);
      writeAll(all);
      current = null;
      return rec;
    },

    setNote(text) {
      const t = String(text || '').slice(0, 240);
      if (current) { current.notes = t; return; }
      const all = readAll();
      if (all.runs.length) { all.runs[0].notes = t; writeAll(all); }
    },

    list() { return readAll().runs; },
    clear() { writeAll({ v: MM.VERSION, runs: [] }); },
    serialize(record) { return JSON.stringify(record, null, 2); },

    exportRun(record) {
      const data = record || this.list()[0];
      if (!data) return false;
      const stamp = new Date(data.endedAt || Date.now()).toISOString().slice(0, 19).replace(/[:T]/g, '-');
      return download('矿坑试玩-' + (data.seed || 'run') + '-' + stamp + '.json', this.serialize(data));
    },

    exportAll() {
      const all = readAll();
      if (!all.runs.length) return false;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      return download('矿坑试玩-全部-' + stamp + '.json', JSON.stringify(all, null, 2));
    },
  };

  MM.Telemetry = Telemetry;
})();
