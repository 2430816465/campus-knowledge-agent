/* Optional rewarded ads: foreground development countdown by default.
 * Future SDK providers must confirm completed viewing; callbacks are deduplicated. */
(function () {
  const MT = (window.MT = window.MT || {});
  let provider = null;
  const listeners = [];

  const Ads = {
    /** 是否已经接上了真实广告（未接上时按钮显示为开发模拟） */
    isReal() { return typeof provider === 'function'; },

    setProvider(fn) {
      provider = typeof fn === 'function' ? fn : null;
      listeners.forEach((f) => f(Ads.isReal()));
    },

    onModeChange(fn) { listeners.push(fn); fn(Ads.isReal()); },

    /**
     * 请求一次激励广告。
     * 默认实现使用统一的开发模拟广告，取消或失败不发奖励。
     */
    request(placement, onReward, onFail, runId) {
      let done=false;const reward=()=>{if(done)return;done=true;onReward();},fail=reason=>{if(done)return;done=true;onFail?.(reason);};
      if (!Ads.isReal()) {if(!window.CampAds){fail('测试广告不可用');return;}window.CampAds.show('tower',placement,runId).then(r=>{if(r.status==='completed')reward();else fail(r.reason);}).catch(fail);return;}
      try {
        provider(placement, reward, fail);
      } catch (e) {
        fail(e);
      }
    }
  };

  MT.Ads = Ads;
})();
