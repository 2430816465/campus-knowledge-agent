/* 矿脉远征：局外目标、矿区开放条件与可复现挑战身份。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const E = {
    mines() { return MM.MINES || {}; },
    goals() { return MM.JOURNAL_GOALS || []; },
    mine(id) { return this.mines()[id] || null; },
    goal(id) { return this.goals().find((g) => g.id === id) || null; },

    challengeId(seed, mineId, params) {
      return ['v' + (MM.BALANCE.RULE_VERSION || 4), mineId || 'oldMine', String(seed),
        JSON.stringify(params || {})].join('|');
    },

    daily(date) {
      const d = date || new Date();
      /* Daily identity is UTC so two devices in different time zones share one map. */
      const year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, dateNum = d.getUTCDate();
      /* 每日矿区按 UTC 自然日轮换；挑战入口不检查个人解锁进度。 */
      const mines = ['oldMine', 'resonanceCave', 'clockworkMine'];
      const dayIndex = Math.floor(Date.UTC(year, month - 1, dateNum) / 86400000);
      const mineId = mines[((dayIndex % mines.length) + mines.length) % mines.length];
      const seed = 'EXPEDITION-DAILY-' + year + ('0' + month).slice(-2)
        + ('0' + dateNum).slice(-2) + '-' + mineId;
      return { mineId, seed, challengeId: this.challengeId(seed, mineId, { mode: 'daily' }) };
    },

    unlockedMineIds(save) {
      const s = (save || MM.Save.get()).miningSave;
      return (s.expedition.unlockedMines || ['oldMine']).slice();
    },

    evaluateUnlocks(s) {
      const ex = s.expedition;
      const archive = s.archive;
      if (archive.maxDepth >= 30 && ex.unlockedMines.indexOf('resonanceCave') < 0) ex.unlockedMines.push('resonanceCave');
      if ((ex.firstClearMines || []).some((id) => id !== 'sealedVault')
          && ex.unlockedMines.indexOf('clockworkMine') < 0) ex.unlockedMines.push('clockworkMine');
      const required = ['oldMine', 'resonanceCave', 'clockworkMine'];
      if (required.every((id) => ex.firstClearMines.indexOf(id) >= 0)
          && ex.unlockedMines.indexOf('sealedVault') < 0) ex.unlockedMines.push('sealedVault');
      if (ex.sealedMineCompleted) ex.unlockedMines = Array.from(new Set(ex.unlockedMines.concat(['sealedVault'])));
    },

    canEnter(mineId, save) {
      const m = this.mine(mineId);
      if (!m) return { ok: false, reason: 'unknown' };
      if (this.unlockedMineIds(save).indexOf(mineId) < 0) return { ok: false, reason: 'locked', mine: m };
      return { ok: true, mine: m };
    },

    goalDone(id, run, s) {
      const archive = s.archive;
      const rooms = (run.roomsFound || []).filter((r) => r !== 'treasure');
      switch (id) {
        case 'E1': return new Set(rooms).size >= 2;
        case 'E2': return new Set((archive.rooms || []).concat(rooms)).size >= 4;
        case 'E3': return new Set(rooms).size >= 3 && !!run.treasureReached;
        case 'M1': return (run.mineValue || 0) >= 150;
        case 'M2': return (((run.stats || {}).bombOreEvents) || 0) > 0 && (run.maxDepthReached || 0) >= 20;
        case 'M3': return (run.upgrades || []).length >= 2 && (run.mineValue || 0) >= 300 && !!run.treasureReached;
        case 'R1': return (run.maxDepthReached || 0) >= 30 && !((run.stats || {}).cartRides);
        case 'R2': return (((run.stats || {}).directionalBlastWalls) || 0) >= 4 && (run.maxDepthReached || 0) >= 30;
        case 'R3': return !!run.treasureReached && run.supplies
          && !!run.supplies.t2 && !!run.supplies.t3
          && run.supplies.t2 !== 'stamina' && run.supplies.t3 !== 'stamina';
        default: return false;
      }
    },

    completeGoals(run, s) {
      const ex = s.expedition;
      const completed = [];
      if (run.tutorialRun) return completed;
      this.goals().forEach((goal) => {
        if (ex.completedGoals.indexOf(goal.id) >= 0 || !this.goalDone(goal.id, run, s)) return;
        ex.completedGoals.push(goal.id);
        completed.push(goal.id);
        if (goal.unlock && ex.unlockedUpgrades.indexOf(goal.unlock) < 0) ex.unlockedUpgrades.push(goal.unlock);
      });
      if (ex.trackedGoal && ex.completedGoals.indexOf(ex.trackedGoal) >= 0) ex.trackedGoal = null;
      return completed;
    },

    trackedGoalText(save) {
      const s = save || MM.Save.get();
      const id = s.miningSave.expedition.trackedGoal;
      const g = this.goal(id);
      return g ? g.name + '：' + g.desc : '';
    },

    trackGoal(id) {
      const s = MM.Save.get().miningSave;
      if (id != null && (!this.goal(id) || s.expedition.completedGoals.indexOf(id) >= 0)) return false;
      s.expedition.trackedGoal = id || null;
      if (id != null) s.expedition.trackedRelic = null;
      MM.Save.persist();
      return true;
    },

    trackRelic(id) {
      const s = MM.Save.get().miningSave;
      const valid = (MM.RELICS || []).some((r) => r.id === id);
      if (id != null && (!valid || s.archive.relics.indexOf(id) >= 0)) return false;
      s.expedition.trackedRelic = id || null;
      if (id != null) s.expedition.trackedGoal = null;
      MM.Save.persist();
      return true;
    },

    nextSuggestion(save) {
      const s = (save || MM.Save.get()).miningSave;
      const ex = s.expedition;
      /* 明确追踪的内容优先显示；旧档缺少 archive.maxDepth 时回退历史最好深度，
       * 避免已到过 30m 的玩家被错误提示重新完成解锁里程碑。 */
      if (ex.trackedRelic) {
        const relic = (MM.RELICS || []).find((r) => r.id === ex.trackedRelic);
        if (relic) return { id: 'relic', relicId: relic.id, text: '追踪遗物「' + relic.name + '」，沿线索寻找对应隐藏房。' };
      }
      if (ex.trackedGoal) {
        const goal = this.goal(ex.trackedGoal);
        if (goal && ex.completedGoals.indexOf(goal.id) < 0) {
          return { id: goal.id, goalId: goal.id, text: '矿工手册：' + goal.name + ' · ' + goal.desc };
        }
      }
      const historicDepth = Math.max(s.archive.maxDepth || 0,
        (s.v4 && s.v4.bestDepth) || 0, (s.v3 && s.v3.bestDepth) || 0,
        (s.v2 && s.v2.bestDepth) || 0, (s.legacy && s.legacy.bestDepth) || 0);
      if (historicDepth < 30) return { id: 'depth30', text: '试着到达 30m，解锁共鸣晶窟与硬岩钻头目标。' };
      if (!s.treasureFirstClear) return { id: 'vault', text: '保留工具与体力，规划一条抵达 44m 藏宝库的路线。' };
      const goal = this.goals().find((g) => ex.completedGoals.indexOf(g.id) < 0);
      if (goal) return { id: goal.id, goalId: goal.id, text: '矿工手册：' + goal.name + ' · ' + goal.desc };
      const nextMine = ['oldMine', 'resonanceCave', 'clockworkMine'].find((id) => ex.firstClearMines.indexOf(id) < 0);
      if (nextMine) return { id: 'mine', mineId: nextMine, text: '前往「' + this.mine(nextMine).name + '」完成首次远征。' };
      const unStyles = (MM.BALANCE.STYLES || []).filter((st) => s.archive.styles.indexOf(st.id) < 0);
      if (unStyles.length) return {
        id: 'style', styleId: unStyles[0].id,
        text: '试试「' + unStyles[0].name + '」风格：' + unStyles[0].goal,
      };
      const unRelics = (MM.RELICS || []).filter((relic) => s.archive.relics.indexOf(relic.id) < 0);
      if (unRelics.length) return {
        id: 'relics', relicId: unRelics[0].id,
        text: '追踪遗物「' + unRelics[0].name + '」并按线索寻找对应隐藏房。',
      };
      /* 44m 是终点，不生成无法完成的“超过个人最深”任务。 */
      return { id: 'daily', text: '试试今日挑战，或用同一矿图提高价值、减少挖掘步数。' };
    },
  };
  MM.Expedition = E;
})();
