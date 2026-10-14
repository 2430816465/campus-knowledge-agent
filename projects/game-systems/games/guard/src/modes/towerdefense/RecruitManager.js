/* 招募系统（§16 / §17 / §18 / §29 / §30）
 *
 * - 普通招募：20 金币固定价，产出 1★；六职业等权起步 + 不公开的软保护
 * - 广告召唤：每局最多 3 次，概率来自配置；SDK 未接前走测试直通
 * - 容量 16 格全满时直接拒绝，绝对不"先扣金币再发现没位置"（§18 硬性要求）
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const Recruit = {
    /* 普通招募 */
    recruit(run) {
      if (TD.Heroes.capacityFull(run)) return { ok: false, reason: 'capacity' };
      if (run.gold < TD.BALANCE.RECRUIT_COST) return { ok: false, reason: 'gold' };

      run.gold -= TD.BALANCE.RECRUIT_COST;
      const classId = this.rollClass(run);
      const hero = TD.Heroes.create(run, classId, 1);
      const spot = TD.Heroes.placeAuto(run, hero);
      this.afterAcquire(run, classId, 1);
      TD.Heroes.refreshBest(run);
      TD.Meta.add('recruits');
      return { ok: true, hero: hero, spot: spot };
    },

    /* 广告召唤（测试直通；接入主项目后 TD.Ads 自动切到真实广告） */
    adSummon(run) {
      if (run.adSummonUsed >= TD.BALANCE.AD_SUMMON_LIMIT) return { ok: false, reason: 'limit' };
      if (TD.Heroes.capacityFull(run)) return { ok: false, reason: 'capacity' };

      run.adSummonUsed += 1;
      const star = this.rollAdStar(run);
      const classId = TD.HEROES[Math.floor(run.rng() * TD.HEROES.length)].id;  // 广告召唤六职业等概率
      const hero = TD.Heroes.create(run, classId, star);
      const spot = TD.Heroes.placeAuto(run, hero);
      TD.Heroes.refreshBest(run);
      return { ok: true, hero: hero, star: star, spot: spot };
    },

    rollAdStar(run) {
      const list = TD.RECRUIT.AD.STARS;
      const weights = list.map(function (x) { return x.p; });
      return list[TD.U.weightedIndex(weights, run && run.rng)].stars;
    },

    /* 受控随机（§17）：基础等权 + "再拿一个就能合成"的小幅加权
     * + 连续倒霉时逐步加码；整个过程不向玩家展示。 */
    rollClass(run) {
      const soft = TD.RECRUIT.SOFT;
      const heroes = TD.Heroes.all(run);
      let pityBonus = 0;
      if (soft.ENABLED && run.recruit.pityCount >= soft.PITY_START_AFTER) {
        pityBonus = Math.min(
          soft.PITY_STEP * (run.recruit.pityCount - soft.PITY_START_AFTER + 1),
          soft.PITY_MAX_BONUS
        );
      }

      const weights = [];
      for (let i = 0; i < TD.HEROES.length; i++) {
        const cls = TD.HEROES[i];
        let w = TD.RECRUIT.BASE_WEIGHT;
        if (soft.ENABLED && this.hasPairCandidate(heroes, cls.id)) {
          w += soft.PAIR_BONUS + pityBonus;
        }
        weights.push(w);
      }
      return TD.HEROES[TD.U.weightedIndex(weights, run.rng)].id;
    },

    /* 场上已有同职业 1★（未进化）→ 再来一个立刻能合成 */
    hasPairCandidate(heroes, classId) {
      for (let i = 0; i < heroes.length; i++) {
        const h = heroes[i];
        if (h.classId === classId && h.star === 1 && !h.evolved) return true;
      }
      return false;
    },

    /* 软保护计数：拿到有效合成单位后逐步恢复，连续倒霉则累积（§17） */
    afterAcquire(run, classId, star) {
      const soft = TD.RECRUIT.SOFT;
      if (!soft.ENABLED) return;
      let same = 0;
      const heroes = TD.Heroes.all(run);
      for (let i = 0; i < heroes.length; i++) {
        const h = heroes[i];
        if (h.classId === classId && h.star === star && !h.evolved) same += 1;
      }
      if (same >= 2) run.recruit.pityCount = Math.max(0, run.recruit.pityCount - soft.RECOVER_STEP);
      else run.recruit.pityCount += 1;
    },
  };

  TD.Recruit = Recruit;
})();
