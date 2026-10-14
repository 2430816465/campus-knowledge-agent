/* 局内改造效果配置。规则由 MiningUpgradeSystem 执行，名称和说明由 UI 读取。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.UPGRADES = {
    chainPick: {
      id: 'chainPick', name: '连脉镐', iconId: 'chainPick',
      desc: '手动挖出矿物时，额外采集一格已显露的相邻同类矿；额外采集不会连锁。',
    },
    directionalBomb: {
      id: 'directionalBomb', name: '定向炸药', iconId: 'directionalBomb',
      desc: '炸药变为沿瞄准轴的五格直线；悬停预览与实际爆破一致。',
    },
    prospectingLens: {
      id: 'prospectingLens', name: '勘探镜', iconId: 'prospectingLens',
      desc: '使用探矿灯时给出最近未发现房间的方向与距离，不揭开迷雾。',
    },
    hardRockDrill: {
      id: 'hardRockDrill', name: '硬岩钻头', iconId: 'hardRockDrill',
      desc: '手动挖成本为 3 的硬岩少耗 1 体力；最多生效 6 次。',
    },
    recoveryKit: {
      id: 'recoveryKit', name: '回收套件', iconId: 'recoveryKit',
      desc: '一次爆破实际采出至少两格矿物，获得强化矿镐 ×1；最多触发 2 次。',
    },
    afterglowWick: {
      id: 'afterglowWick', name: '余辉灯芯', iconId: 'afterglowWick',
      desc: '探矿灯延长至 8 次挖掘；首次发现隐藏房恢复 2 体力，最多 3 次。',
    },
  };
  MM.UPGRADE_ORDER = ['chainPick', 'directionalBomb', 'prospectingLens', 'hardRockDrill', 'recoveryKit', 'afterglowWick'];
  MM.UPGRADE_SLOT_LIMIT = 2;
  MM.UPGRADE_USE_LIMITS = { hardRockDrill: 6, recoveryKit: 2, afterglowWick: 3 };
})();
