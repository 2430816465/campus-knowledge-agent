/* 局内改造规则：单局最多两件，效果集中在这里供挖掘、工具和 UI 共用。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Upgrades = {
    has(run, id) { return !!(run && run.upgrades && run.upgrades.indexOf(id) >= 0); },

    canAcquire(run, id) {
      if (!MM.UPGRADES[id]) return { ok: false, reason: 'unknown' };
      if (this.has(run, id)) return { ok: false, reason: 'owned' };
      if ((run.upgrades || []).length >= MM.UPGRADE_SLOT_LIMIT) return { ok: false, reason: 'slots' };
      const recipe = (MM.CRAFTING_RECIPES || []).find((r) => r.upgradeId === id);
      const sharedChallenge = run.challengeMode === 'daily' || run.challengeMode === 'seed' || run.sealedTrial;
      if (!sharedChallenge && recipe && recipe.unlockGoal && MM.Save
          && MM.Save.get().miningSave.expedition.unlockedUpgrades.indexOf(id) < 0) {
        return { ok: false, reason: 'locked' };
      }
      return { ok: true };
    },

    acquire(run, id) {
      const check = this.canAcquire(run, id);
      if (!check.ok) return check;
      run.upgrades.push(id);
      return { ok: true, upgrade: MM.UPGRADES[id] };
    },

    chainTarget(run, map, cell) {
      if (!this.has(run, 'chainPick') || !cell || !cell.resourceType) return null;
      const dirs = MM.Pathfinder.DIRS4;
      for (let i = 0; i < dirs.length; i++) {
        const next = map.get(cell.x + dirs[i][0], cell.y + dirs[i][1]);
        if (!next || next.excavated || !next.revealed) continue;
        if (next.resourceType === cell.resourceType) return next;
      }
      return null;
    },

    bombAxis(run, x, y, requestedAxis) {
      if (!this.has(run, 'directionalBomb')) return null;
      if (requestedAxis === 'horizontal' || requestedAxis === 'vertical') return requestedAxis;
      const dx = x - run.playerX, dy = y - run.playerY;
      return Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    },

    roomHint(run, map) {
      if (!this.has(run, 'prospectingLens')) return null;
      const found = run.roomsFound || [];
      let best = null;
      map.forEach((cell) => {
        if (!cell.clueType || cell.excavated || !cell.roomId || cell.roomId === 'treasure') return;
        if (found.indexOf(cell.roomId) >= 0) return;
        const distance = MM.U.manhattan(run.playerX, run.playerY, cell.x, cell.y);
        if (!best || distance < best.distance) best = { x: cell.x, y: cell.y, roomId: cell.roomId, distance };
      });
      if (!best) return null;
      const dx = best.x - run.playerX, dy = best.y - run.playerY;
      const horizontal = dx < 0 ? '西' : '东';
      const vertical = dy < 0 ? '北' : '南';
      const direction = Math.abs(dx) > Math.abs(dy) ? horizontal
        : (Math.abs(dy) > Math.abs(dx) ? vertical : vertical + horizontal);
      const range = best.distance <= 3 ? '近' : (best.distance <= 7 ? '中' : '远');
      return { direction, range, roomId: best.roomId };
    },
  };
})();
