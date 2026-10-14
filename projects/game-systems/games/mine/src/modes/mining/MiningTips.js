/* 首次情境提示（V0.8.3）：
 *   - 只讲"第一次遇到某个界面时"需要知道的一句话，不重复、不说教；
 *   - 已读状态保存在独立的本地键，不写入矿坑纪录 / 本局规则存档；
 *   - 与 V0.8 三页新手教程互补：教程讲基础，情境提示讲"这个界面在干嘛"。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const KEY = 'forgotten-tower.mining.tips.v1';

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const d = JSON.parse(raw);
      return d && typeof d === 'object' ? d : {};
    } catch (e) { return {}; }
  }

  function write(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }

  MM.Tips = {
    KEY,
    seen(key) { return !!read()[key]; },
    mark(key) { const o = read(); o[key] = 1; write(o); },
    reset() { write({}); },
  };
})();
