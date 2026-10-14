/* 屏幕布局（720×1280 竖屏）。
 * 地图的战斗格由各张地图自己定义；备战区 4 格与所有按钮位置在这里统一。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.LAYOUT = {
    W: 720,
    H: 1280,

    topBack: { x: 12, y: 10, w: 56, h: 56 },
    topSpeed: { x: 468, y: 10, w: 56, h: 56 },
    topMute: { x: 528, y: 10, w: 56, h: 56 },
    topPause: { x: 588, y: 10, w: 56, h: 56 },
    topDebug: { x: 648, y: 10, w: 56, h: 56 },

    chipHP: { x: 24, y: 100, w: 220, h: 44 },
    chipGold: { x: 256, y: 100, w: 190, h: 44 },
    chipCurrency: { x: 458, y: 100, w: 238, h: 44 },

    mapArea: { x: 20, y: 158, w: 680, h: 640 },   // 默认地图区域（地图可覆盖）

    benchLabelY: 816,
    bench: [
      { x: 180, y: 866 },
      { x: 300, y: 866 },
      { x: 420, y: 866 },
      { x: 540, y: 866 },
    ],
    slotSize: 64,
    benchSlotSize: 84,
    heroSize: 52,

    recruitBtn: { x: 20, y: 920, w: 320, h: 76 },
    adBtn: { x: 360, y: 920, w: 340, h: 76 },

    panel: { x: 16, y: 1002, w: 688, h: 262 },
    prepareBanner: { x: 170, y: 666, w: 380, h: 82 },
    toast: { x: 140, y: 742, w: 440, h: 54 },
    hintY: 1246,
  };
})();
