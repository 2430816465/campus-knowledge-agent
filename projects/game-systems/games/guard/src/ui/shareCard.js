/* 分享战绩（运营向）：文字 + 720×720 战绩卡片（可保存为 PNG）。
 * 浏览器支持 navigator.share 时也可以直接调用系统分享。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return m + ' 分 ' + (s < 10 ? '0' : '') + s + ' 秒';
  }

  const Share = {
    text(run) {
      const r = run.result || {};
      return [
        '【再上一层 · 守塔战线】',
        '地图：' + run.map.name,
        '结果：' + (r.victory ? '防守成功 ' + TD.U.stars(r.stars || 0) : '防线失守'),
        '用时：' + fmtTime(run.time) + '　击杀：' + run.stats.kills,
        'Boss：' + (run.bossChallenge === TD.BossChallenge.SUCCESS ? '挑战成功' : '未击败'),
        '—— 5 张地图 · 20+1 波 · 合成塔防',
      ].join('\n');
    },

    /* 生成战绩卡片（返回 canvas，无 DOM 环境返回 null） */
    render(run) {
      if (typeof document === 'undefined' || !document.createElement) return null;
      const cv = document.createElement('canvas');
      cv.width = 720;
      cv.height = 720;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#08111f';
      ctx.fillRect(0, 0, 720, 720);
      if (TD.Art) TD.Art.panel(ctx, { x: 16, y: 16, w: 688, h: 688 }, TD.Art.mapTheme(run.mapId).accent);
      else TD.U.strokeRound(ctx, 16, 16, 688, 688, 20, '#3a4a6e', 3);
      TD.U.text(ctx, '再上一层 · 守塔战线', 360, 78, 30, '#ffd75e', 'center', true);
      TD.U.text(ctx, run.map.name, 360, 140, 44, '#ffffff', 'center', true);
      const r = run.result || {};
      TD.U.text(ctx, TD.U.stars(r.stars || 0), 360, 220, 56, '#ffd75e', 'center', true);
      TD.U.text(ctx, r.victory ? '防守成功' : '防线失守', 360, 292, 34,
        r.victory ? '#9fe8a8' : '#ff8d8d', 'center', true);

      const rows = [
        ['用时', fmtTime(run.time)],
        ['击杀', String(run.stats.kills)],
        ['漏怪', String(run.stats.leaked)],
        ['Boss', run.bossChallenge === TD.BossChallenge.SUCCESS ? '挑战成功' : '未击败'],
      ];
      rows.forEach(function (row, i) {
        const y = 380 + i * 62;
        if (TD.Art) TD.Art.panel(ctx, { x: 120, y: y - 26, w: 480, h: 52 }, '#7898bd');
        else TD.U.fillRound(ctx, 120, y - 26, 480, 52, 12, 'rgba(255,255,255,0.06)');
        TD.U.text(ctx, row[0], 160, y, 22, '#8fa3c4', 'left');
        TD.U.text(ctx, row[1], 560, y, 24, '#e8eef8', 'right', true);
      });
      TD.U.text(ctx, 'www · 5 张地图 · 20+1 波 · 合成塔防', 360, 660, 20, '#6f7f9c', 'center');
      return cv;
    },

    download(run) {
      const cv = this.render(run);
      if (!cv) return false;
      try {
        const url = cv.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = '守塔战线-' + run.map.id + '-' + TD.Daily.dayKey() + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        TD.Analytics.track('share_download', { mapId: run.mapId });
        return true;
      } catch (e) { return false; }
    },

    copyText(run) {
      const text = this.text(run);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
          TD.Analytics.track('share_copy', { mapId: run.mapId });
          return true;
        }
      } catch (e) { /* 剪贴板不可用 */ }
      return false;
    },
  };

  TD.Share = Share;
})();
