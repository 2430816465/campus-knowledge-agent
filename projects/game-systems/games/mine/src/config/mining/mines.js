/* 《矿脉远征》矿区与局外目标配置。生成器继续复用 9×45 基础地图规格。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.MINES = {
    oldMine: {
      id: 'oldMine', name: '旧矿井', baseMap: 'full', unlock: 'default', theme: 'old',
      description: '均衡矿脉与隐藏房，熟悉基础路线。',
    },
    resonanceCave: {
      id: 'resonanceCave', name: '共鸣晶窟', baseMap: 'full', unlock: 'depth30', theme: 'resonance',
      description: '启动共鸣石削弱周围岩层，规划晶矿路线。',
    },
    clockworkMine: {
      id: 'clockworkMine', name: '机巧矿场', baseMap: 'full', unlock: 'firstClear', theme: 'clockwork',
      description: '选择把铜料投入侧路，还是拆取银料。',
    },
    sealedVault: {
      id: 'sealedVault', name: '封存矿库', baseMap: 'full', unlock: 'allMines', theme: 'sealed',
      fixedSeed: 'EXPEDITION-SEALED-01', description: '固定矿坑挑战：两件改造，两条可行路线。',
    },
  };

  MM.JOURNAL_GOALS = [
    { id: 'E1', group: '探索', name: '寻踪者', desc: '同局发现两类隐藏区域。', test(run) { return (run.roomsFound || []).filter((id) => id !== 'treasure').length >= 2; } },
    { id: 'E2', group: '探索', name: '熟悉矿道', desc: '累计发现四类隐藏房。', unlock: 'afterglowWick', persistent: true },
    { id: 'E3', group: '探索', name: '深入遗迹', desc: '同局发现三类隐藏房并抵达藏宝库。', test(run) { return (run.roomsFound || []).filter((id) => id !== 'treasure').length >= 3 && run.treasureReached; } },
    { id: 'M1', group: '采矿', name: '稳定采掘', desc: '单局采矿进度达到 150。', test(run) { return (run.mineValue || 0) >= 150; } },
    { id: 'M2', group: '采矿', name: '爆破回收', desc: '一次爆破采出两格矿物，并在同局到达 20m。', unlock: 'recoveryKit', test(run) { return !!run.recoveryGoalReady; } },
    { id: 'M3', group: '采矿', name: '满载而归', desc: '装备两种改造、采矿进度达到 300 并抵达藏宝库。', test(run) { return (run.upgrades || []).length >= 2 && (run.mineValue || 0) >= 300 && run.treasureReached; } },
    { id: 'R1', group: '开路', name: '徒步深入', desc: '不乘矿车抵达 30m。', unlock: 'hardRockDrill', test(run) { return (run.maxDepthReached || 0) >= 30 && !(run.stats && run.stats.cartRides); } },
    { id: 'R2', group: '开路', name: '直线破障', desc: '一次定向爆破打开四格未挖岩块，并到达 30m。', test(run) { return !!run.directionalGoalReady; } },
    { id: 'R3', group: '开路', name: '节制补给', desc: '领取 150 / 300 档补给且不选择体力，仍抵达藏宝库。', test(run) { return !!run.treasureReached && run.supplies && !!run.supplies.t2 && !!run.supplies.t3 && run.supplies.t2 !== 'stamina' && run.supplies.t3 !== 'stamina'; } },
  ];

  MM.RELIC_SOURCES = {
    oldLamp: { roomId: 'lostSupplies', event: 'lostChest' },
    goldPick: { roomId: 'goldenVein', event: 'twoGold' },
    crystalHeart: { roomId: 'crystalCave', event: 'coreCrystal' },
    tornMap: { roomId: 'minecart', event: 'station' },
    carvedTag: { roomId: 'supply', event: 'warehouseChoice' },
    silverBell: { roomId: 'mysteryRoom', event: 'mysteryChest' },
  };
})();
