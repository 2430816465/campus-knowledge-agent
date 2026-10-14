/* 局内状态（§37）：一局塔防的全部数据都收在这个 run 对象里。
 *
 * 隔离要求（§56）：run 只存在于 MT.TD 内部，
 * 不写进主模式状态对象（主项目的 G / hero / gold / floor ...），
 * 也不写进主模式存档。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.RunState = {
    PREPARE: 'PREPARE',            // 整备（开局 / 每波之间）
    WAVE_RUNNING: 'WAVE_RUNNING',  // 普通波进行中
    WAVE_CLEAR: 'WAVE_CLEAR',      // 本波清空的小横幅
    MAIN_CLEAR: 'MAIN_CLEAR',      // 前 20（V0.1：3）波防守成功
    BOSS_PREPARE: 'BOSS_PREPARE',  // Boss 挑战的整备
    BOSS_RUNNING: 'BOSS_RUNNING',  // Boss 挑战进行中
    RESULT: 'RESULT',              // 最终结算
    FAILED: 'FAILED',              // 防线失守
  };

  TD.BossChallenge = { SUCCESS: 'SUCCESS', FAILED: 'FAILED' };

  TD.State = {
    createRun(mapId, opts) {
      const map = TD.MAP_BY_ID[mapId];
      if (!map || !map.playable) throw new Error('地图不可用: ' + mapId);
      const o = opts || {};
      const seed = (o.seed == null)
        ? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0)
        : (o.seed >>> 0);

      return {
        mapId: map.id,
        map: map,
        seed: seed,
        rng: TD.U.mulberry32(seed),     // 局内玩法随机（招募 / 广告星级）
        wave: 1,
        totalNormalWaves: TD.WAVES.normal.length,

        endpointHP: TD.BALANCE.ENDPOINT_HP,
        endpointHPMax: TD.BALANCE.ENDPOINT_HP,
        gold: TD.BALANCE.START_GOLD,
        adSummonUsed: 0,

        combat: new Array(map.combatSlots.length).fill(null),
        bench: new Array(TD.LAYOUT.bench.length).fill(null),

        enemies: [],
        projectiles: [],
        effects: [],
        texts: [],

        state: TD.RunState.PREPARE,
        prepareTimer: TD.BALANCE.FIRST_PREPARE_TIME,
        waveDef: TD.WAVES.normal[0] || null,
        waveTitle: '',
        spawnQueue: [],
        spawnIndex: 0,
        spawnClock: 0,
        waveStats: null,
        waveClearTimer: 0,
        mainClearTimer: 0,
        mainClearSettled: false,
        mainStars: 0,

        bossChallenge: null,
        bossWasFirst: false,

        result: null,
        stats: { kills: 0, leaked: 0, bestHeroLabel: '—', classDamage: {}, waveHistory: [] },
        recruit: { pityCount: 0 },

        debug: { invincible: false },

        toast: null,
        selection: null,

        heroSeq: 1,
        enemySeq: 1,
        time: 0,
      };
    },

    slotArray(run, zone) { return zone === 'bench' ? run.bench : run.combat; },

    slotPos(run, zone, index) {
      if (zone === 'bench') return TD.LAYOUT.bench[index];
      return run.map.combatSlots[index];
    },

    isOver(run) {
      return run.state === TD.RunState.RESULT || run.state === TD.RunState.FAILED;
    },
  };
})();
