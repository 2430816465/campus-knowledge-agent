/* 最终藏宝库（设计规格 §42～§45 / §52）：
 * 挖通藏宝库入口的那一刻立即判定"最深层探索成功"，不需要再逐格挖完整间藏宝室；
 * 获得大量探索价值（+120），播放发现演出后由玩家选择结算或继续探索。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Treasure = {
    /* 由 DigSystem 在挖开 vaultEntrance 时调用 */
    onCellExcavated(run, map, cell, events) {
      if (cell.specialType !== 'vaultEntrance') return;
      if (run.treasureReached) return;

      run.treasureReached = true;
      const value = MM.Resources.addValue(run, MM.BALANCE.TREASURE_VALUE, 'treasure');
      events.push({ type: 'treasureReached', value, x: cell.x, y: cell.y });
    },

    /* §44：藏宝库区域点亮（发现时把整间藏宝室揭示出来） */
    revealChamber(map) {
      const cells = map.roomCells('treasure');
      cells.forEach((cell) => { cell.revealed = true; });
      return cells;
    },

    /* §44 / §81：藏宝室格子（按与入口的距离排序，用于"逐格点亮"演出） */
    chamberCells(map) {
      const v = map.vault || { x: 0, y: 0 };
      return map.roomCells('treasure')
        .filter((c) => c.specialType === 'vault')   // 不含藏宝库入口格（入口本身要玩家挖开）
        .slice()
        .sort((a, b) => MM.U.manhattan(v.x, v.y, a.x, a.y) - MM.U.manhattan(v.x, v.y, b.x, b.y) || (a.y - b.y) || (a.x - b.x));
    },
  };
})();
