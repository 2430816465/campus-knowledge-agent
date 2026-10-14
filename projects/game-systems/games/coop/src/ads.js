(function (root) {
  'use strict';

  let provider = null;
  let resolveSimulation = null;

  function normalize(result) {
    const status = result && result.status;
    if (status === 'completed' || status === 'cancelled') return status;
    return 'failed';
  }

  async function requestRewardedVideo() {
    if (provider) {
      try {
        return normalize(await provider.showRewardedVideo());
      } catch (_) {
        return 'failed';
      }
    }
    const snapshot=root.CampCoop?.snapshot();
    return (await root.CampAds.show('coop','post-result',snapshot?.selfAward?.id||'coop-local')).status;
  }

  function finishSimulation(status) {
    if (!resolveSimulation) return;
    const resolve = resolveSimulation;
    resolveSimulation = null;
    document.querySelector('#adModal').classList.add('hidden');
    resolve(normalize({ status: status }));
  }

  function setProvider(nextProvider) {
    if (nextProvider != null && typeof nextProvider.showRewardedVideo !== 'function') {
      throw new TypeError('广告适配器需要提供 showRewardedVideo()');
    }
    provider = nextProvider;
  }

  root.RushAds = {
    mode: function () { return provider ? 'PLATFORM_ADAPTER' : 'DEV_SIMULATION'; },
    setProvider: setProvider,
    requestRewardedVideo: requestRewardedVideo,
    finishSimulation: finishSimulation
  };

  document.querySelectorAll('[data-ad-status]').forEach(function (button) {
    button.addEventListener('click', function () { finishSimulation(button.dataset.adStatus); });
  });
  document.querySelector('#closeAdModal').addEventListener('click', function () { finishSimulation('cancelled'); });
})(window);
