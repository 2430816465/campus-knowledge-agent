/* 守塔战线独立存档（设计规格 §36 / §56）
 *
 * 关键要求：与《再上一层》主魔塔存档完全隔离。主项目存档键是
 *   forgotten-tower.original50.v1 / forgotten-tower.v3.first3.v1
 * 本模式只用下面这个独立键，主模式不读、也不写：
 *   forgotten-tower.td.save.v1
 *
 * 结构：
 * {
 *   v: '0.1.0',
 *   towerDefenseSave: {
 *     unlockedMaps: ['map01', ...],
 *     mapRecords: { map01: { unlocked, cleared, bestStars, bestEndpointHP, bossFirstClear, bossKillCount }, ... }
 *   },
 *   metaProgress: { currency: 0 }      // 账号级通用货币（§34）
 * }
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const KEY = 'forgotten-tower.td.save.v1';
  const MAIN_PLACEHOLDER_KEY = 'forgotten-tower.main.placeholder.v1';

  let data = null;
  let memory = null;

  function allMapIds() { return TD.MAPS.map((m) => m.id); }

  function fresh() {
    const records = {};
    const ids = allMapIds();
    ids.forEach(function (id, i) {
      records[id] = {
        unlocked: i === 0,          // §5：默认只解锁第一张
        cleared: false,
        bestStars: 0,
        bestEndpointHP: 0,
        bossFirstClear: false,
        bossKillCount: 0,
      };
    });
    return {
      v: TD.VERSION,
      towerDefenseSave: { unlockedMaps: [ids[0]], mapRecords: records },
      metaProgress: { currency: 0, allBossBonus: false, unlocked: [] },
      settings: { muted: false, lowFx: false },
      tutorial: { done: false },
      achievements: { unlocked: {} },
      daily: { date: '', progress: {}, claimed: [], bonus: false },
      board: { local: {} },
      stats: {
        runs: 0, wins: 0, losses: 0, kills: 0, leaked: 0,
        recruits: 0, merges: 0, evolutions: 0, adsWatched: 0, bossKills: 0,
        bestStars: 0, fastestClearSec: 0,
      },
    };
  }

  function readRaw() {
    if (memory != null) return memory;
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function writeRaw(str) {
    memory = str;
    try { localStorage.setItem(KEY, str); } catch (e) { /* 浏览器不允许本地存储时静默降级 */ }
  }

  /* 把磁盘里的数据规整成完整结构；顺带按 §5 重算解锁（已通关 → 解锁下一张） */
  function normalize(parsed) {
    const out = fresh();
    const src = (parsed && parsed.towerDefenseSave) || {};
    const meta = (parsed && parsed.metaProgress) || {};
    const ids = allMapIds();

    out.metaProgress.currency = Math.max(0, Math.floor(Number(meta.currency) || 0));
    out.metaProgress.allBossBonus = !!meta.allBossBonus;
    out.metaProgress.unlocked = Array.isArray(meta.unlocked) ? meta.unlocked.slice() : [];
    out.settings.muted = !!(parsed && parsed.settings && parsed.settings.muted);
    out.settings.lowFx = !!(parsed && parsed.settings && parsed.settings.lowFx);
    out.tutorial.done = !!(parsed && parsed.tutorial && parsed.tutorial.done);
    const ach = (parsed && parsed.achievements) || {};
    out.achievements.unlocked = (ach.unlocked && typeof ach.unlocked === 'object') ? ach.unlocked : {};
    const dl = (parsed && parsed.daily) || {};
    out.daily.date = String(dl.date || '');
    out.daily.progress = (dl.progress && typeof dl.progress === 'object') ? dl.progress : {};
    out.daily.claimed = Array.isArray(dl.claimed) ? dl.claimed.slice() : [];
    out.daily.bonus = !!dl.bonus;
    const bd = (parsed && parsed.board) || {};
    out.board.local = (bd.local && typeof bd.local === 'object') ? bd.local : {};
    const st = (parsed && parsed.stats) || {};
    Object.keys(out.stats).forEach(function (k) {
      out.stats[k] = Math.max(0, Math.floor(Number(st[k]) || 0));
    });

    const records = src.mapRecords || {};
    ids.forEach(function (id) {
      const r = records[id] || {};
      const rec = out.towerDefenseSave.mapRecords[id];
      rec.cleared = !!r.cleared;
      rec.bestStars = Math.max(0, Math.min(3, Math.floor(Number(r.bestStars) || 0)));
      rec.bestEndpointHP = Math.max(0, Math.floor(Number(r.bestEndpointHP) || 0));
      rec.bossFirstClear = !!r.bossFirstClear;
      rec.bossKillCount = Math.max(0, Math.floor(Number(r.bossKillCount) || 0));
    });

    const unlocked = {};
    unlocked[ids[0]] = true;
    ids.forEach(function (id, i) {
      if (out.towerDefenseSave.mapRecords[id].cleared && ids[i + 1]) unlocked[ids[i + 1]] = true;
    });
    (Array.isArray(src.unlockedMaps) ? src.unlockedMaps : []).forEach(function (id) {
      if (out.towerDefenseSave.mapRecords[id]) unlocked[id] = true;
    });
    out.towerDefenseSave.unlockedMaps = ids.filter(function (id) { return unlocked[id]; });
    ids.forEach(function (id) { out.towerDefenseSave.mapRecords[id].unlocked = !!unlocked[id]; });

    return out;
  }

  function load() {
    if (data) return data;
    const raw = readRaw();
    if (raw) {
      try { data = normalize(JSON.parse(raw)); }
      catch (e) { data = fresh(); }   // 存档损坏 → 重建
    } else {
      data = fresh();
    }
    writeRaw(JSON.stringify(data));
    return data;
  }

  const Save = {
    KEY: KEY,
    MAIN_PLACEHOLDER_KEY: MAIN_PLACEHOLDER_KEY,

    get() { return load(); },
    persist() { writeRaw(JSON.stringify(load())); },

    mapRecord(mapId) { return load().towerDefenseSave.mapRecords[mapId]; },
    isUnlocked(mapId) { return !!this.mapRecord(mapId).unlocked; },

    unlockNextMap(mapId) {
      const ids = allMapIds();
      const next = ids[ids.indexOf(mapId) + 1];
      if (!next) return;
      if (!this.mapRecord(next).unlocked) {
        this.mapRecord(next).unlocked = true;
        const list = load().towerDefenseSave.unlockedMaps;
        if (list.indexOf(next) === -1) list.push(next);
      }
    },

    currency() { return load().metaProgress.currency; },
    addCurrency(n) {
      load().metaProgress.currency = Math.max(0, load().metaProgress.currency + (n || 0));
      this.persist();
    },

    setMuted(v) {
      load().settings.muted = !!v;
      this.persist();
    },

    setLowFx(v) {
      load().settings.lowFx = !!v;
      this.persist();
    },

    isTutorialDone() { return !!load().tutorial.done; },
    setTutorialDone(v) {
      load().tutorial.done = !!v;
      this.persist();
    },

    stats() { return load().stats; },

    /* 云存档导入用：整份覆盖（会走一遍 normalize 校验） */
    replaceAll(obj) {
      data = normalize(obj);
      this.persist();
    },

    /* 调试用：重置守塔战线全部记录（绝不影响主模式存档） */
    reset() {
      data = fresh();
      this.persist();
    },

    /* 主模式"占位"存档：只为验证两条存档链完全隔离（§58-⑯⑰），
     * 绝不触碰主模式的真实存档键。 */
    mainPlaceholder: {
      load() {
        try {
          const raw = localStorage.getItem(MAIN_PLACEHOLDER_KEY);
          if (raw) {
            const o = JSON.parse(raw);
            return {
              floor: Math.max(1, Math.floor(Number(o.floor) || 1)),
              gold: Math.max(0, Math.floor(Number(o.gold) || 0)),
            };
          }
        } catch (e) {}
        return { floor: 1, gold: 0 };
      },
      save(o) {
        try { localStorage.setItem(MAIN_PLACEHOLDER_KEY, JSON.stringify(o)); } catch (e) {}
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
  };

  TD.Save = Save;
})();
