/* 每日任务（运营向）
 * - 每天按日期确定性地抽 3 个任务（同一天所有人一样）
 * - 进度写存档，跨天自动重置
 * - 奖励通用货币；当天全部完成还有额外奖励
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  function dayKey(d) {
    const t = d || new Date();
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
  }

  /* 用日期做种子，确定性地抽任务（LCG） */
  function seedOf(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }
  function pickTasks(dateKey) {
    const pool = TD.DAILY_POOL.slice();
    const out = [];
    let s = seedOf(dateKey);
    const n = Math.min(TD.DAILY_PICK, pool.length);
    for (let k = 0; k < n; k++) {
      s = (s * 1103515245 + 12345) % 2147483648;
      const idx = s % pool.length;
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  const Daily = {
    dayKey: dayKey,

    /* 读取"今天"的任务（含进度/领取状态），必要时重置 */
    today() {
      const d = TD.Save.get().daily;
      const key = dayKey();
      if (d.date !== key) {
        d.date = key;
        d.progress = {};
        d.claimed = [];
        d.bonus = false;
        TD.Save.persist();
      }
      const defs = pickTasks(key);
      return defs.map(function (t) {
        return {
          id: t.id, title: t.title, field: t.field, target: t.target, reward: t.reward,
          progress: Math.min(t.target, d.progress[t.field] || 0),
          claimed: d.claimed.indexOf(t.id) >= 0,
        };
      });
    },

    /* 记进度（与 TD.Meta.add 同一批调用点） */
    add(field, n) {
      const d = TD.Save.get().daily;
      this.today();                       // 保证跨天已重置
      if (!d.progress[field]) d.progress[field] = 0;
      d.progress[field] += (n == null ? 1 : n);
      TD.Save.persist();
    },

    /* 一局结束后的批量入账 */
    recordRun(run) {
      this.add('runs', 1);
      if (run.result && run.result.victory) this.add('wins', 1);
      if (run.bossChallenge === TD.BossChallenge.SUCCESS) this.add('bossKills', 1);
    },

    claimable() {
      return this.today().filter(function (t) { return !t.claimed && t.progress >= t.target; });
    },
    badge() { return this.claimable().length; },

    claim(id) {
      const list = this.today();
      const task = list.filter(function (t) { return t.id === id; })[0];
      if (!task || task.claimed || task.progress < task.target) return { ok: false };
      const d = TD.Save.get().daily;
      d.claimed.push(id);
      TD.Save.get().metaProgress.currency += task.reward;
      let bonus = 0;
      const all = list.every(function (t) {
        return d.claimed.indexOf(t.id) >= 0;
      });
      if (all && !d.bonus) {
        d.bonus = true;
        bonus = TD.DAILY_ALL_BONUS;
        TD.Save.get().metaProgress.currency += bonus;
      }
      TD.Save.persist();
      TD.Analytics.track('daily_claim', { id: id, reward: task.reward, bonus: bonus });
      return { ok: true, reward: task.reward, bonus: bonus, allDone: all };
    },
  };

  TD.Daily = Daily;
})();
