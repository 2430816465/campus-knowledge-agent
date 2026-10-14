/* 结算系统（V0.6 规则表 §2）：
 *   普通撤离（任意位置结束探索，含体力耗尽）→ 基础探索价值（无倍率）
 *   抵达藏宝库 → +120 探索价值；玩家可选结算（不叠加倍率）或继续探索
 * 一局只结算一次；同一事件只有一个结算结果。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Reward = {
    /* 兼容旧调用：V0.6 起恒为 1（不再有撤离倍率） */
    multiplierFor() { return MM.BALANCE.SETTLE_MULTIPLIER; },

    settle(run, save, kind, map) {
      if (run.settled && run.summary) return run.summary;   // 一局只结算一次

      const multiplier = this.multiplierFor(kind);
      const baseValue = run.baseValue;
      const finalValue = Math.round(baseValue * multiplier);

      const summary = {
        kind,
        multiplier,
        scoreVersion: 4,          // V1.0：矿脉远征规则
        tutorialRun: !!run.tutorialRun,
        baseValue,
        finalValue,
        /* V0.7：把"挖出来的矿物"与"宝箱 / 藏宝库等直接价值"分开结算展示 */
        mineValue: run.mineValue || 0,
        otherValue: run.otherValue || 0,
        supplyText: MM.Progress.summaryText(run),
        supplies: Object.assign({}, run.supplies),
        /* V0.8.3：本局取舍回顾（结算页"本局路线"） */
        route: {
          branches: (run.stats.branchLog || []).slice(),
          skippedCount: run.stats.skippedMineralCount || 0,
          skippedValue: run.stats.skippedMineralValue || 0,
          cartRides: run.stats.cartRides || 0,
          bombs: run.stats.bombsUsed || 0,
          picks: run.stats.picksUsed || 0,
          lamps: run.stats.lampsUsed || 0,
          springFound: (run.roomsFound || []).indexOf('spring') >= 0,
        },
        /* V0.7.1：探索风格 / 同 Seed 挑战 */
        styleText: MM.Style ? MM.Style.summaryText(run, map) : '',
        styleDone: !!(run.style && run.style.done),
        styleId: run.style ? run.style.id : null,
        seedBest: null,
        seedImproved: false,
        newStyles: [],
        newRelics: [],
        relicCount: 0,
        newRooms: [],
        newMinerals: [],
        challenge: null,
        maxDepth: run.maxDepthReached,
        excavated: run.stats.excavatedCells,
        digActions: run.stats.digActions,
        resources: Object.assign({}, run.resources),
        materials: Object.assign({}, run.materials),
        upgrades: (run.upgrades || []).slice(),
        craftingStats: {
          craftsMade: run.stats.craftsMade || 0,
          chainOreCells: run.stats.chainOreCells || 0,
          salvagedMaterials: run.stats.salvagedMaterials || 0,
        },
        upgradeContributions: {
          chainPickOreCells: run.stats.chainOreCells || 0,
          hardRockDrillStaminaSaved: run.stats.drillStaminaSaved || 0,
          recoveryPicksGranted: run.stats.recoveryPicks || 0,
          recoveryOreCells: run.stats.recoveryOreEvents || 0,
          afterglowRooms: run.stats.afterglowRooms || 0,
          afterglowStaminaRestored: run.stats.afterglowStaminaRestored || 0,
          prospectingHints: run.stats.lensHints || 0,
          directionalMaxWalls: run.stats.directionalBlastWalls || 0,
        },
        resourceRows: MM.Resources.summary(run),
        rooms: run.roomsFound.slice(),
        roomCount: run.roomsFound.length,
        chests: run.chestsOpened,
        treasureReached: run.treasureReached,
        currencyGranted: 0,
        firstTreasure: false,
        sealedTrial: run.mapId === 'sealedVault',
        sealedEnding: run.mapId === 'sealedVault' && !!run.treasureReached,
        sealedMemorial: run.mapId === 'sealedVault' && !!run.treasureReached ? '封存者铭牌' : null,
        sealedEndingText: run.mapId === 'sealedVault' && run.treasureReached
          ? '旧矿工把最后一盏灯留给后来者，愿每条矿脉都带你平安归来。' : '',
        seed: run.seed,
      };

      if (save && !run.tutorialRun) {
        const meta = save.recordRun(run, summary);
        summary.currencyGranted = meta.currencyGranted;
        summary.firstTreasure = meta.first;
        summary.currency = meta.currency;
        summary.sealedMemorialGranted = !!meta.firstSealedClear;
        summary.bestDepthImproved = !!meta.bestDepthImproved;
        summary.bestValueImproved = !!meta.bestValueImproved;
        summary.newRooms = meta.newRooms || [];
        summary.newMinerals = meta.newMinerals || [];
        summary.newStyles = meta.newStyles || [];
        summary.newRelics = meta.newRelics || [];
        summary.relicCount = save.relicCount ? save.relicCount() : 0;
        summary.seedBest = meta.seedBest || null;
        summary.seedImproved = !!meta.seedImproved;
        summary.challenge = save.challenge();
      }
      summary.mysteryFound = !!run.mysteryFound;

      run.settled = true;
      run.summary = summary;
      run.state = MM.State.S.RESULT;
      return summary;
    },
  };
})();
