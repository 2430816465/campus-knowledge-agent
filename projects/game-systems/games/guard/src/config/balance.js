/* TD_BALANCE —— 守塔战线全局平衡参数（设计规格 §55：改这一个文件就能快速重平衡）
 *
 * 这里全部是"可调初始值"，不是写死在逻辑里的常量。
 * 第一阶段数字以"跑通框架、方便测试"为准，正式平衡放到阶段三（§50）。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.BALANCE = {
    START_GOLD: 60,           // 局内初始金币（§15）
    RECRUIT_COST: 20,         // 普通招募固定价格，全程不变（§15）
    ENDPOINT_HP: 20,          // 终点初始生命（§11）

    NORMAL_KILL_GOLD: 2,      // 普通怪击杀金币（§15）
    ELITE_KILL_GOLD: 2,       // 精英怪击杀金币（§15）
    BOSS_KILL_GOLD: 0,        // Boss 不给局内金币，奖励走通用货币（§35）

    AD_SUMMON_LIMIT: 3,       // 每局广告召唤硬上限（§29）

    FIRST_PREPARE_TIME: 8,    // 第 1 波前整备时间（开局可以先招募 3 次）
    PREPARE_TIME: 5,          // 每波之间的整备时间（§12）
    WAVE_CLEAR_TIME: 1.2,     // "本波清空"横幅停留时间
    MAIN_CLEAR_TIME: 4.0,     // "防守成功"展示时长，之后进入 Boss 挑战（§46）
    ALLOW_SKIP_PREPARE: true, // 整备期允许点击"提前开始"（方便测试）

    STAR_POWER: [0, 1.0, 2.2, 4.8, 10.5],  // 1★~4★ 战力倍率（§20）

    BOSS_FIRST_REWARD: 10,    // Boss 首杀通用货币（§35）
    BOSS_REPEAT_REWARD: 2,    // Boss 重复击杀通用货币（§35）
    ALL_BOSS_BONUS: 50,       // 5 张地图全部首杀的一次性额外奖励（§35）

    SELL_REFUND: { 1: 5, 2: 10, 3: 20, 4: 40 },  // 出售返还（§28）

    CAPACITY: 16,             // 12 战斗位 + 4 备战位（§7）

    DEV_MODE: true,           // 正式发布改成 false → 调试面板自动隐藏（§54）
    MAX_ENEMIES: 80,
    MAX_PROJECTILES: 120,
    MAX_DAMAGE_TEXTS: 60,
    MAX_EFFECTS: 160,
  };
})();
