/* 招募配置（§16 / §17 / §29 / §30）
 *
 * - 六职业没有稀有度，普通招募等权起步
 * - 软保护（受控随机）不向玩家展示，只是避免极端倒霉
 * - 广告召唤星级概率集中在这里，不散落在业务代码
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.RECRUIT = {
    BASE_WEIGHT: 100,   // 每个职业的基础权重

    /* 受控随机（§17）：绝不展示给玩家 */
    SOFT: {
      ENABLED: true,
      PAIR_BONUS: 15,        // "再来一个就能合成"的职业：+15 权重
      PITY_START_AFTER: 3,   // 连续 3 次没拿到可合成单位后开始加码
      PITY_STEP: 10,         // 每次倒霉 +10
      PITY_MAX_BONUS: 50,    // 加码上限
      RECOVER_STEP: 2,       // 一旦拿到有效合成单位，软保护逐步恢复（§17）
    },

    /* 广告召唤星级概率（§30），初始平衡值，随时可调 */
    AD: {
      STARS: [
        { stars: 1, p: 0.55 },
        { stars: 2, p: 0.30 },
        { stars: 3, p: 0.12 },
        { stars: 4, p: 0.03 },
      ],
    },
  };
})();
