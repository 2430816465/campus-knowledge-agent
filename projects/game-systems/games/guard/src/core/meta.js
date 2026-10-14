/* 守塔战线 · 账号级元进度（阶段五 / §34 / §52）
 *
 * 1) 通用货币（metaCurrency）——只用来"解锁内容"，规格明确禁止买永久数值。
 * 2) 多模式解锁接口：register() / has() / spend()，其他模式（例如主项目）可以
 *    把自己的角色 / 地图 / 特殊内容注册进来，用同一份货币解锁。
 * 3) 数据统计：局数 / 胜负 / 击杀 / 漏怪 / 招募 / 合成 / 进化 / 广告 / 最佳星级 / 最快通关。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  /* 内置解锁内容：全部是外观或预留位，没有任何数值强化 */
  const BUILTIN = [
    {
      id: 'flag_royal', name: '王城战旗', cost: 10, kind: 'deco',
      desc: '终点城堡挂上金色战旗（纯外观）',
    },
    {
      id: 'skin_shadow', name: '暗影套装', cost: 20, kind: 'skin',
      desc: '剑士 / 盗贼 换成暗影配色（纯外观）',
    },
    {
      id: 'skin_platinum', name: '白金套装', cost: 30, kind: 'skin',
      desc: '骑士 / 枪兵 换成白金配色（纯外观）',
    },
    {
      id: 'other_mode_slot', name: '其他模式内容位', cost: 0, kind: 'reserved',
      desc: '接入其他模式后，角色 / 地图 / 特殊内容会注册到这里',
    },
  ];

  const registry = {};   // 其他模式 register 进来的内容

  function meta() { return TD.Save.get().metaProgress; }
  function stats() { return TD.Save.get().stats; }

  const Meta = {
    /* ── 解锁内容 ───────────────────────────── */
    list() {
      const out = [];
      BUILTIN.forEach(function (it) { out.push(it); });
      Object.keys(registry).forEach(function (id) { out.push(registry[id]); });
      return out;
    },

    /* 供其他模式接入：{ id, name, cost, desc, kind } */
    register(item) {
      if (!item || !item.id) return false;
      registry[item.id] = item;
      return true;
    },

    has(id) { return meta().unlocked.indexOf(id) >= 0; },
    currency() { return meta().currency; },
    canAfford(cost) { return meta().currency >= (cost || 0); },

    /* 花费通用货币解锁；失败不会扣钱（与 §18 同一条原则） */
    buy(id) {
      const item = this.list().filter(function (x) { return x.id === id; })[0];
      if (!item) return { ok: false, reason: 'unknown' };
      if (this.has(id)) return { ok: false, reason: 'owned' };
      if (item.cost > 0 && !this.canAfford(item.cost)) return { ok: false, reason: 'currency' };
      if (item.cost > 0) meta().currency -= item.cost;
      meta().unlocked.push(id);
      TD.Save.persist();
      return { ok: true, item: item };
    },

    /* 给外部模式用的消费接口：够就扣、不够返回 false */
    spend(n, reason) {
      const cost = Math.max(0, Math.floor(n || 0));
      if (meta().currency < cost) return false;
      meta().currency -= cost;
      TD.Save.persist();
      if (TD.Sfx) TD.Sfx.coin();
      return true;
    },

    unlock(id) {
      if (!this.has(id)) {
        meta().unlocked.push(id);
        TD.Save.persist();
      }
      return true;
    },

    /* 皮肤/装饰是否生效（HeroSprites 与 UI 会调用） */
    skinColor(classId, baseColor) {
      if (this.has('skin_shadow') && (classId === 'swordsman' || classId === 'rogue')) return '#4a4f6a';
      if (this.has('skin_platinum') && (classId === 'knight' || classId === 'spearman')) return '#e8e4d2';
      return baseColor;
    },
    hasFlag() { return this.has('flag_royal'); },

    /* ── 数据统计 ───────────────────────────── */
    stats() { return stats(); },
    add(field, n) {
      const s = stats();
      if (s[field] == null) s[field] = 0;
      s[field] += (n == null ? 1 : n);
      if (TD.Daily) TD.Daily.add(field, n);   // 每日任务与统计共用同一批计数点
      return s[field];
    },

    /* 一局结束后汇总（RewardManager 调用） */
    recordRun(run) {
      const s = stats();
      s.runs += 1;
      const r = run.result || {};
      if (r.victory) {
        s.wins += 1;
        if (!s.fastestClearSec || run.time < s.fastestClearSec) s.fastestClearSec = Math.round(run.time);
      } else {
        s.losses += 1;
      }
      if (r.stars && r.stars > s.bestStars) s.bestStars = r.stars;
      if (run.bossChallenge === TD.BossChallenge.SUCCESS) s.bossKills += 1;
      TD.Save.persist();
    },

    reset() {
      const s = stats();
      Object.keys(s).forEach(function (k) { s[k] = 0; });
      TD.Save.persist();
    },
  };

  TD.Meta = Meta;

  /* 低配模式（移动端性能优化）：效果与震屏降级 */
  TD.lowFx = function () {
    try { return !!TD.Save.get().settings.lowFx; } catch (e) { return false; }
  };
})();
