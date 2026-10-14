/* 云存档（运营向）
 * - 本地实现：导出 / 导入整份守塔战线存档（JSON 文本），方便玩家自己在设备间搬运
 * - 远端接口：setProvider(fn)（`fn('put', text, cb)` / `fn('get', cb)`）接了自己的服务端后，
 *   push() / pull() 就能真正云同步
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  let provider = null;

  const Cloud = {
    setProvider(fn) { provider = typeof fn === 'function' ? fn : null; },
    isReal() { return !!provider; },

    exportText() {
      return JSON.stringify({
        tag: TD.CLOUD_TAG,
        v: TD.VERSION,
        exportedAt: new Date().toISOString(),
        save: TD.Save.get(),
      });
    },

    importText(text) {
      let obj = null;
      try { obj = JSON.parse(text); } catch (e) { return { ok: false, reason: 'json' }; }
      if (!obj || obj.tag !== TD.CLOUD_TAG || !obj.save) return { ok: false, reason: 'tag' };
      TD.Save.replaceAll(obj.save);
      TD.Analytics.track('cloud_import', { exportedAt: obj.exportedAt || '' });
      return { ok: true };
    },

    push() {
      if (!provider) return false;
      try { provider('put', this.exportText(), function () {}); } catch (e) { return false; }
      return true;
    },

    pull(cb) {
      if (!provider) { if (cb) cb(null); return false; }
      try { provider('get', function (text) { if (cb) cb(text || null); }); }
      catch (e) { if (cb) cb(null); }
      return true;
    },
  };

  TD.Cloud = Cloud;
})();
