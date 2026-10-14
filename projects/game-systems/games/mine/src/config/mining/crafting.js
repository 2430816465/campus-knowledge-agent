/* 本局工作台配方。
 * 数量是玩法原型的可调初值，尚未通过真人试玩验证；调整成本只改本配置。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.CRAFTING_RECIPES = [
    {
      id: 'chainPick', name: '连脉镐', upgradeId: 'chainPick',
      costs: { copper: 2, silver: 1 },
      desc: '手动挖出矿物时，额外采集一格已显露的相邻同类矿。',
    },
    {
      id: 'directionalBomb', name: '定向炸药', upgradeId: 'directionalBomb',
      costs: { copper: 1 },
      desc: '炸药改为直线爆破；瞄准预览与实际爆破使用同一范围。',
    },
    {
      id: 'prospectingLens', name: '勘探镜', upgradeId: 'prospectingLens',
      costs: { copper: 1, silver: 1 },
      desc: '使用探矿灯时提示最近未发现房间的方向，不揭开迷雾。',
    },
    {
      id: 'hardRockDrill', name: '硬岩钻头', upgradeId: 'hardRockDrill',
      costs: { copper: 2, silver: 2, gold: 1 }, unlockGoal: 'R1',
      desc: '手动挖成本为 3 的普通硬岩，少耗 1 体力；最多 6 次。',
    },
    {
      id: 'recoveryKit', name: '回收套件', upgradeId: 'recoveryKit',
      costs: { copper: 2, silver: 1, gold: 1 }, unlockGoal: 'M2',
      desc: '一次爆破采出至少两格矿物时，获得强化矿镐 ×1；最多 2 次。',
    },
    {
      id: 'afterglowWick', name: '余辉灯芯', upgradeId: 'afterglowWick',
      costs: { silver: 2, crystal: 1 }, unlockGoal: 'E2',
      desc: '探矿灯持续 8 次挖掘；首次发现隐藏房时恢复 2 体力，最多 3 次。',
    },
  ];
  MM.CRAFTING_SALVAGE_LIMIT = 1;
})();
