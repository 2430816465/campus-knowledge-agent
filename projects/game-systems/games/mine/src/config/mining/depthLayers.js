/* 深度层配置（设计规格 §21）：一个矿坑主题内的资源 / 岩层变化。
 * V0.1 的 9×20 只覆盖 shallow / rock 两层；deep / old / treasure 先配置好，
 * 扩到 9×45 正式地图（§79）时不需要改生成器逻辑。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.DEPTH_LAYERS = [
    { id: 'shallow',  name: '浅层',     from: 0,  to: 9  },
    { id: 'rock',     name: '岩层',     from: 10, to: 19 },
    { id: 'deep',     name: '深层',     from: 20, to: 29 },
    { id: 'old',      name: '旧矿区',   from: 30, to: 39 },
    { id: 'treasure', name: '藏宝区域', from: 40, to: 45 },
  ];

  /* 1 格 = 1m：返回该深度（行号）所在的层 */
  MM.depthLayerAt = function (y) {
    const layers = MM.DEPTH_LAYERS;
    for (let i = 0; i < layers.length; i++) {
      if (y >= layers[i].from && y <= layers[i].to) return layers[i];
    }
    return y < 0 ? layers[0] : layers[layers.length - 1];
  };

  MM.layerNameAt = function (y) { return MM.depthLayerAt(y).name; };
})();
