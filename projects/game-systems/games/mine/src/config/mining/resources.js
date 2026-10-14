/* 矿物系统（设计规格 §22 / §24）：四种矿物只是"本局矿物价值"，不是永久货币。
 * V0.1（§72）只启用 铜矿 / 金矿 两种测试矿物；银矿、水晶的配置先放好，
 * 但不会出现在 V0.1 生成器里（看 V01_RESOURCE_POOL）。
 * 所有价值 / 权重都在这里配置化（§24：不要把概率散落在代码里）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.RESOURCES = {
    copper:  { id: 'copper',  name: '铜矿', value: 5,  tier: 1, color: '#d2884a', glow: '#f0b070' },
    silver:  { id: 'silver',  name: '银矿', value: 10, tier: 2, color: '#dfe7f2', glow: '#ffffff' },
    gold:    { id: 'gold',    name: '金矿', value: 20, tier: 3, color: '#ffd75e', glow: '#fff0a0' },
    crystal: { id: 'crystal', name: '水晶', value: 35, tier: 4, color: '#7fd8ff', glow: '#c7f0ff' },
  };

  MM.RESOURCE_ORDER = ['copper', 'silver', 'gold', 'crystal'];

  /* §72：V0.1 只用两种测试矿物 */
  MM.V01_RESOURCE_POOL = ['copper', 'gold'];

  /* §79：V0.2 起启用完整矿物池（铜 / 银 / 金 / 水晶） */
  MM.RESOURCE_POOL_FULL = MM.RESOURCE_ORDER.slice();

  /* 各深度层的矿物类型权重（§21 / §24：浅层铜多，深层金 / 水晶提高） */
  MM.RESOURCE_WEIGHTS_BY_LAYER = {
    shallow:  { copper: 80, silver: 14, gold: 5,  crystal: 1 },
    rock:     { copper: 55, silver: 22, gold: 18, crystal: 5 },
    deep:     { copper: 35, silver: 20, gold: 30, crystal: 15 },
    old:      { copper: 25, silver: 18, gold: 35, crystal: 22 },
    treasure: { copper: 15, silver: 15, gold: 40, crystal: 30 },
  };

  /* 支路价值提升顺序（§85：高价值资源出现在支路） */
  MM.RESOURCE_TIER_UP = { copper: 'silver', silver: 'gold', gold: 'crystal', crystal: 'crystal' };

  MM.resourceDef = function (id) { return MM.RESOURCES[id] || null; };
})();
