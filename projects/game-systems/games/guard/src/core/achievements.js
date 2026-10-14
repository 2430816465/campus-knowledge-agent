/* 成就系统（运营向）
 * 条件全部由「账号统计 / 存档记录 / 单局结果」推导，奖励通用货币（只买外观）。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const A = {
    list() { return TD.ACHIEVEMENTS; },
    has(id) { return !!TD.Save.get().achievements.unlocked[id]; },
    count() {
      return TD.ACHIEVEMENTS.filter(function (a) { return A.has(a.id); }).length;
    },

    context(run) {
      return { stats: TD.Meta.stats(), save: TD.Save.get(), run: run || null };
    },

    /* 检查并解锁；返回本次新解锁的成就列表（由调用方决定怎么提示） */
    check(run) {
      const ctx = this.context(run);
      const fresh = [];
      TD.ACHIEVEMENTS.forEach(function (a) {
        if (A.has(a.id)) return;
        let ok = false;
        try { ok = !!a.cond(ctx); } catch (e) { ok = false; }
        if (!ok) return;
        TD.Save.get().achievements.unlocked[a.id] = Date.now();
        if (a.reward > 0) {
          TD.Save.get().metaProgress.currency += a.reward;
        }
        fresh.push(a);
      });
      if (fresh.length) {
        TD.Save.persist();
        fresh.forEach(function (a) {
          TD.Analytics.track('achievement_unlocked', { id: a.id, reward: a.reward });
        });
      }
      return fresh;
    },
  };

  TD.Achievements = A;
})();
