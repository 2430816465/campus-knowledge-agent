/* 排行榜（运营向）
 * - 本机榜单：每张地图保留前 5 条（星级优先、用时次之），纯本地、离线可用
 * - 远端接口：setProvider(fn) 之后可以把成绩提交到自己的服务端（`fn('submit', payload)` /
 *   `fn('fetch', mapId, cb)`），游戏逻辑与界面不用改
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  let provider = null;

  const Board = {
    setProvider(fn) { provider = typeof fn === 'function' ? fn : null; },
    isRemote() { return !!provider; },

    local(mapId) {
      const b = TD.Save.get().board.local;
      return (b[mapId] || []).slice();
    },

    submit(run) {
      if (!run.result || !run.result.victory) return null;
      const entry = {
        stars: run.result.stars || 0,
        time: Math.round(run.time),
        kills: run.stats.kills,
        leaked: run.stats.leaked,
        boss: run.bossChallenge === TD.BossChallenge.SUCCESS,
        date: TD.Daily.dayKey(),
      };
      const b = TD.Save.get().board.local;
      if (!b[run.mapId]) b[run.mapId] = [];
      b[run.mapId].push(entry);
      b[run.mapId].sort(function (x, y) { return (y.stars - x.stars) || (x.time - y.time); });
      b[run.mapId] = b[run.mapId].slice(0, TD.BOARD_SIZE);
      TD.Save.persist();
      if (provider) {
        try { provider('submit', { mapId: run.mapId, entry: entry }); } catch (e) {}
      }
      TD.Analytics.track('board_submit', { mapId: run.mapId, stars: entry.stars, time: entry.time });
      return entry;
    },

    fetchRemote(mapId, cb) {
      if (!provider) { if (cb) cb(null); return false; }
      try { provider('fetch', mapId, function (rows) { if (cb) cb(rows || null); }); }
      catch (e) { if (cb) cb(null); }
      return true;
    },
  };

  TD.Board = Board;
})();
