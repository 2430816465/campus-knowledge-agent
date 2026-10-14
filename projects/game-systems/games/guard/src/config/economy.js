/* 经济规则：金币来源 / 出售返还 / Boss 奖励。
 * 所有数值都在 TD.BALANCE 里集中，本文件只负责"规则"本身。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.ECONOMY = {
    /* 怪物死亡的金币（§15：普通 / 精英固定，不按怪物类型复杂计算） */
    killGold(monsterDef, tier) {
      if (tier === 'boss') return TD.BALANCE.BOSS_KILL_GOLD;
      if (tier === 'elite') return TD.BALANCE.ELITE_KILL_GOLD;
      return TD.BALANCE.NORMAL_KILL_GOLD;
    },

    /* 出售返还（§28：按理论消耗的 1★ 数量估计，不允许买卖套利） */
    sellRefund(hero) {
      return TD.BALANCE.SELL_REFUND[hero.star] || 0;
    },

    /* 执行出售：返还金币 + 从格子移除 */
    sellHero(run, hero) {
      const refund = this.sellRefund(hero);
      run.gold += refund;
      TD.Heroes.remove(run, hero);
      TD.Heroes.refreshBest(run);
      return refund;
    },

    /* Boss 奖励（§35：首杀多、重复少） */
    bossReward(firstClear) {
      return firstClear ? TD.BALANCE.BOSS_FIRST_REWARD : TD.BALANCE.BOSS_REPEAT_REWARD;
    },
  };
})();
