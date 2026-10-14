/* 三种基础岩层（设计规格 §7 / §21）：体力成本 1 / 2 / 3，全部可调。
 * 颜色同样配置化：V0.5 起接入正式素材（assets/mining），程序化绘制作为兜底（§82）。
 * 显示逻辑只读这里的字段，不反向推断地图数据（§6）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.TERRAIN = {
    dirt: {
      id: 'dirt', name: '泥土', digCost: 1,
      base: '#8a5a33', dark: '#6f4526', light: '#a06c3f', speck: '#5f3b1f',
    },
    rock: {
      id: 'rock', name: '普通岩石', digCost: 2,
      base: '#7d828c', dark: '#666c78', light: '#949aa6', speck: '#5a6069',
    },
    hard: {
      id: 'hard', name: '坚硬岩石', digCost: 3,
      base: '#4e556a', dark: '#3a4054', light: '#5c6480', speck: '#2e3345',
    },
  };

  MM.TERRAIN_ORDER = ['dirt', 'rock', 'hard'];

  /* 各深度层的岩层生成权重（§21：浅层泥土多 / 深层坚硬岩石多） */
  MM.TERRAIN_WEIGHTS_BY_LAYER = {
    shallow:  { dirt: 55, rock: 38, hard: 7 },
    rock:     { dirt: 25, rock: 55, hard: 20 },
    deep:     { dirt: 12, rock: 55, hard: 33 },
    old:      { dirt: 10, rock: 48, hard: 42 },
    treasure: { dirt: 8,  rock: 50, hard: 42 },
  };

  MM.terrainDef = function (id) { return MM.TERRAIN[id] || MM.TERRAIN.rock; };
})();
