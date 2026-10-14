/* 埋点接口（运营向）：默认只在内存里留最近 200 条，接上 provider 后即可上报。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const buffer = [];
  let provider = null;

  TD.Analytics = {
    setProvider(fn) { provider = typeof fn === 'function' ? fn : null; },
    isReal() { return !!provider; },
    track(name, data) {
      const evt = { t: Date.now(), name: name, data: data || {} };
      buffer.push(evt);
      if (buffer.length > 200) buffer.shift();
      if (provider) { try { provider(evt); } catch (e) { /* 埋点失败不能影响游戏 */ } }
      return evt;
    },
    recent() { return buffer.slice(); },
  };
})();
