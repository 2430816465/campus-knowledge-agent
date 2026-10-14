/* 守塔战线 · 激励广告接入层（阶段五 / §29 / §52）
 *
 * 三级优先级：
 *   1) 主项目已接入 MT.Ads（《再上一层》src/core/ads.js）→ 直接用主项目的
 *   2) 本工程通过 TD.Ads.setProvider(fn) 接入真实 SDK（AdMob / 穿山甲 / 优量汇…）
 *   3) 都没有 → 「测试直通」：立即回调成功（方便开发与验收）
 *
 * 统一入口 requestWithStats()：带 15 秒超时保护 + 广告次数统计，
 * 游戏逻辑只调这个入口，因此换 SDK 时一行业务代码都不用动。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  let provider = null;
  const listeners = [];

  /* 主项目的广告层（如果存在） */
  function mainAds() {
    const real = MT.Ads;
    if (real && real !== TD.Ads && typeof real.request === 'function') return real;
    return null;
  }

  const Ads = {
    _timeoutMs: 15000,   // 可在测试里调小
    isReal() { return !!mainAds() || typeof provider === 'function'; },
    /* 接入真实 SDK：fn(placement, onReward, onFail) */
    setProvider(fn) {
      provider = typeof fn === 'function' ? fn : null;
      listeners.forEach(function (f) { f(Ads.isReal()); });
    },
    onModeChange(fn) {
      listeners.push(fn);
      fn(Ads.isReal());
    },

    request(placement, onReward, onFail) {
      const m = mainAds();
      if (m) { m.request(placement, onReward, onFail || function () {}); return; }
      if (provider) {
        try { provider(placement, onReward, onFail || function () {}); }
        catch (e) { if (onFail) onFail(e); }
        return;
      }
      /* 测试直通：模拟"看完广告" */
      if (typeof onReward === 'function') onReward();
    },

    /* 游戏内统一走这里：超时保护 + 次数统计 */
    requestWithStats(placement, onReward, onFail) {
      let done = false;
      const timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (onFail) onFail('timeout');
      }, this._timeoutMs || 15000);
      const good = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (TD.Meta) TD.Meta.add('adsWatched');
        if (onReward) onReward();
      };
      const bad = function (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (onFail) onFail(e);
      };
      this.request(placement, good, bad);
    },
  };

  TD.Ads = Ads;
})();
