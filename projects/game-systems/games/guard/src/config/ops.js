/* 运营向内容配置（成就 / 每日任务 / 排行榜 / 分享）
 *
 * 奖励统一发「通用货币」——按规格 §34，货币只能买外观/内容，不做数值成长。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  /* ── 成就（12 个）─────────────────────────────
   * cond(ctx) 里的 ctx = { stats, save, run }
   *   stats / save：账号累计数据；run：仅在"单局结算"时有值
   */
  TD.ACHIEVEMENTS = [
    { id: 'first_clear', name: '初次登顶', desc: '完成任意地图的前 20 波', reward: 5,
      cond(c) { return c.stats.wins >= 1; } },
    { id: 'three_star', name: '完美防线', desc: '以满血（★★★）通过任意地图', reward: 10,
      cond(c) { return c.stats.bestStars >= 3; } },
    { id: 'boss_slayer', name: '屠龙者', desc: '击杀任意 Boss', reward: 8,
      cond(c) { return c.stats.bossKills >= 1; } },
    { id: 'all_boss', name: '五图征服', desc: '五张地图的 Boss 全部首杀', reward: 20,
      cond(c) { return !!c.save.metaProgress.allBossBonus; } },
    { id: 'combo_100', name: '合成大师', desc: '累计合成 100 次', reward: 10,
      cond(c) { return c.stats.merges >= 100; } },
    { id: 'recruit_200', name: '招募狂人', desc: '累计招募 200 次', reward: 10,
      cond(c) { return c.stats.recruits >= 200; } },
    { id: 'evolve_10', name: '究极形态', desc: '累计最终进化 10 次', reward: 10,
      cond(c) { return c.stats.evolutions >= 10; } },
    { id: 'kill_2000', name: '千军万马', desc: '累计击杀 2000 个怪物', reward: 10,
      cond(c) { return c.stats.kills >= 2000; } },
    { id: 'ad_user', name: '广告体验官', desc: '累计观看 3 次广告', reward: 5,
      cond(c) { return c.stats.adsWatched >= 3; } },
    { id: 'all_maps', name: '全图通行证', desc: '五张地图全部通关', reward: 25,
      cond(c) {
        return TD.MAPS.every(function (m) { return TD.Save.mapRecord(m.id).cleared; });
      } },
    { id: 'no_leak', name: '铜墙铁壁', desc: '一局通关且一次都不漏', reward: 15,
      cond(c) { return !!(c.run && c.run.result && c.run.result.victory && c.run.stats.leaked === 0); } },
    { id: 'fast_clear', name: '闪电战', desc: '9 分钟内完成一局（含 Boss）', reward: 15,
      cond(c) { return !!(c.run && c.run.result && c.run.result.victory && c.run.time < 540); } },
  ];

  /* ── 每日任务池（每天抽 3 个）───────────────── */
  TD.DAILY_POOL = [
    { id: 'd_run', title: '完成 1 局对局', field: 'runs', target: 1, reward: 5 },
    { id: 'd_win', title: '赢得 1 局防守', field: 'wins', target: 1, reward: 8 },
    { id: 'd_kill', title: '击杀 150 个怪物', field: 'kills', target: 150, reward: 6 },
    { id: 'd_merge', title: '合成 12 次', field: 'merges', target: 12, reward: 6 },
    { id: 'd_boss', title: '击杀 1 次 Boss', field: 'bossKills', target: 1, reward: 8 },
    { id: 'd_ad', title: '使用 1 次广告召唤', field: 'adsWatched', target: 1, reward: 5 },
    { id: 'd_evolve', title: '最终进化 2 次', field: 'evolutions', target: 2, reward: 6 },
    { id: 'd_recruit', title: '招募 30 次', field: 'recruits', target: 30, reward: 5 },
  ];
  TD.DAILY_PICK = 3;              // 每天抽几个
  TD.DAILY_ALL_BONUS = 10;        // 当天全部完成额外奖励

  /* ── 排行榜 ─────────────────────────────────── */
  TD.BOARD_SIZE = 5;              // 每张地图本机保留前 5 条

  /* ── 云存档 / 分享 ──────────────────────────── */
  TD.CLOUD_TAG = 'zsyj.td.cloud.v1';
})();
