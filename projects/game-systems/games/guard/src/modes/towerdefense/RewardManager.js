/* 奖励与结算（§6 / §35 / §45 / §46）+ 永久记录写入（独立存档）
 *
 * 星级只与前 20（V0.1：3）波结束时的终点生命有关，Boss 完全不参与；
 * Boss 首杀 / 击杀次数和星级是两条独立记录（§6）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.Rewards = {
    /* §6：HP>0 = ★；HP≥10 = ★★；HP=20 = ★★★ */
    starsFor(hp, maxHp) {
      if (hp <= 0) return 0;
      if (hp >= maxHp) return 3;
      if (hp >= Math.ceil(maxHp / 2)) return 2;
      return 1;
    },

    /* 正式胜利：立刻写入永久记录（即使玩家在 Boss 挑战中途退出也已保存） */
    onMainClear(run) {
      if (run.mainRecorded) return;
      run.mainRecorded = true;

      const rec = TD.Save.mapRecord(run.mapId);
      const stars = this.starsFor(run.endpointHP, run.endpointHPMax);
      run.mainStars = stars;

      rec.cleared = true;
      if (stars > rec.bestStars) rec.bestStars = stars;
      if (run.endpointHP > rec.bestEndpointHP) rec.bestEndpointHP = run.endpointHP;

      TD.Save.unlockNextMap(run.mapId);   // §5：完成前 20 波即永久解锁下一张
      TD.Save.persist();
      TD.Sfx.win();
    },

    /* Boss 挑战结算：首杀给大量通用货币，重复击杀给少量（§35） */
    onBossResult(run) {
      if (run.result) return;

      const rec = TD.Save.mapRecord(run.mapId);
      let gained = 0;
      let bonus = 0;
      if (run.bossChallenge === TD.BossChallenge.SUCCESS) {
        const first = !rec.bossFirstClear;
        run.bossWasFirst = first;
        rec.bossFirstClear = true;
        rec.bossKillCount = (rec.bossKillCount || 0) + 1;
        gained = TD.ECONOMY.bossReward(first);
        TD.Save.addCurrency(gained);
        TD.Sfx.win();

        /* §35：5 张地图的 Boss 全部首杀 → 一次性额外 50 通用货币 */
        const save = TD.Save.get();
        if (!save.metaProgress.allBossBonus) {
          let allFirst = TD.MAPS.length > 0;
          for (let i = 0; i < TD.MAPS.length; i++) {
            if (!TD.Save.mapRecord(TD.MAPS[i].id).bossFirstClear) { allFirst = false; break; }
          }
          if (allFirst) {
            save.metaProgress.allBossBonus = true;
            bonus = TD.BALANCE.ALL_BOSS_BONUS;
            TD.Save.addCurrency(bonus);
          }
        }
      }
      if (run.bossChallenge === TD.BossChallenge.FAILED) TD.Sfx.deny();
      TD.Save.persist();

      run.result = {
        victory: true,
        stars: run.mainStars || this.starsFor(run.endpointHP, run.endpointHPMax),
        endpointHP: run.endpointHP,
        endpointHPMax: run.endpointHPMax,
        bossChallenge: run.bossChallenge,
        bossFirst: !!run.bossWasFirst,
        currencyGained: gained,
        allBossBonus: bonus,
        mapId: run.mapId,
      };
      this.recordMeta(run);
    },

    /* 失败结算（§45）：不发 Boss 奖励，也不写任何通关记录 */
    onFailed(run) {
      if (run.result) return;
      TD.Sfx.lose();
      run.result = {
        victory: false,
        stars: 0,
        endpointHP: 0,
        endpointHPMax: run.endpointHPMax,
        reachedWave: run.wave,
        kills: run.stats.kills,
        bestHero: run.stats.bestHeroLabel,
        currencyGained: 0,
        mapId: run.mapId,
      };
      this.recordMeta(run);
    },

    /* 把一局的结果汇进账号统计（每局只记一次） */
    recordMeta(run) {
      if (run.metaRecorded) return;
      run.metaRecorded = true;
      TD.Meta.add('kills', run.stats.kills);
      TD.Meta.add('leaked', run.stats.leaked);
      TD.Meta.recordRun(run);
      /* 运营向：每日任务 / 排行榜 / 成就 */
      TD.Daily.recordRun(run);
      TD.Board.submit(run);
      run.newAchievements = TD.Achievements.check(run);
    },
  };
})();
