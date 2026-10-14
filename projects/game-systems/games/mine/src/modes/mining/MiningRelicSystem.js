/* 矿坑遗物：按来源固定收集；一局最多发现一件新遗物。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const Relics = {
    defs() { return MM.RELICS || []; },
    def(id) { return this.defs().filter((r) => r.id === id)[0] || null; },
    total() { return this.defs().length; },

    ownedIds() {
      const a = MM.Save && MM.Save.records ? MM.Save.records().archive : null;
      return (a && a.relics) || [];
    },

    ownedCount() { return this.ownedIds().length; },

    milestone(id) { return (MM.RELIC_MILESTONES || []).filter((m) => m.id === id)[0] || null; },

    milestoneUnlocked(id) {
      const milestone = this.milestone(id);
      return !!milestone && this.ownedCount() >= milestone.count;
    },

    milestoneStatus() {
      const count = this.ownedCount();
      return (MM.RELIC_MILESTONES || []).map((m) => Object.assign({}, m, { unlocked: count >= m.count }));
    },

    lampTint() { return this.milestoneUnlocked('crystalLamp') ? '#91d9ff' : '#ffe7aa'; },

    canCollect(run, id) {
      if (!run || run.tutorialRun || !id || (run.relicsFound || []).length) return false;
      return this.ownedIds().indexOf(id) < 0 && (MM.RELICS || []).some((r) => r.id === id);
    },

    collect(run, id) {
      if (!this.canCollect(run, id)) return null;
      const pick = this.def(id);
      if (!pick) return null;
      run.relicsFound = run.relicsFound || [];
      run.relicsFound.push(pick.id);
      if (MM.Save && MM.Save.discoverRelic) MM.Save.discoverRelic(pick.id);
      return { id: pick.id, name: pick.name, desc: pick.desc };
    },

    onResource(run, map, cell, events) {
      if (!cell || !cell.roomId) return;
      if (cell.roomId === 'goldenVein' && cell.resourceType === 'gold') {
        run.roomGoldCounts = run.roomGoldCounts || {};
        run.roomGoldCounts.goldenVein = (run.roomGoldCounts.goldenVein || 0) + 1;
        if (run.roomGoldCounts.goldenVein >= 2 && !run.goldRelicChecked) {
          run.goldRelicChecked = true;
          const relic = this.collect(run, 'goldPick');
          if (relic) events.push({ type: 'relic', relic, x: cell.x, y: cell.y });
        }
      }
      if (cell.relicSource === 'coreCrystal' && cell.resourceType === 'crystal') {
        const relic = this.collect(run, 'crystalHeart');
        if (relic) events.push({ type: 'relic', relic, x: cell.x, y: cell.y });
      }
    },

    /* 兼容旧调用：不再随机挑选，必须给出明确来源 id。 */
    roll(run) {
      return typeof run === 'string' ? this.collect(arguments[1], run) : null;
    },

    /* 标题页 / 结算页展示用：已收集的名称与尚未收集的占位 */
    summary() {
      const owned = this.ownedIds();
      return {
        owned: owned.slice(),
        ownedCount: owned.length,
        total: this.total(),
        names: this.defs().filter((r) => owned.indexOf(r.id) >= 0).map((r) => r.name),
      };
    },
  };

  MM.Relics = Relics;
})();
