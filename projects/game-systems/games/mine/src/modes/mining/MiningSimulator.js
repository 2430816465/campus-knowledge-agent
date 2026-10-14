/* 生成验证模拟器（V0.6 / P3）：
 *  ① legalClear(map)：用"真实挖掘 / 工具 / 泉水规则"产出一条合法通关记录（全图知识，
 *     供 Validator 保证"每张图都存在一条合法通关记录"）；
 *  ② play(map, strategy)：只使用已揭示信息的三种策略——保守 / 均衡 / 冲深，
 *     输出实测记录（到达深度 / 探索价值 / 工具使用 / 泉水 / 结束原因）。
 * 所有模拟都在 map.clone() 上进行，不污染生成结果、不写存档。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});
  const DIRS4 = MM.Pathfinder.DIRS4;

  const Sim = {
    /* 模拟里的"深度追踪"（Mode 里由 updateMovement 负责；模拟器自己记） */
    _track(run) {
      run.currentDepth = run.playerY;
      if (run.playerY > run.maxDepthReached) run.maxDepthReached = run.playerY;
    },

    /* V0.7：把"采矿进度补给"纳入模拟（它是真实规则的一部分，不是可选修饰）。
     * 模拟策略按自身偏好选择（见 STRATEGIES.supplyPref），结果写入 out 数组。 */
    _applySupplies(run, policy, out) {
      const list = out || [];
      let guard = 0;
      while (guard++ < 6) {
        const evs = MM.Progress.check(run);
        if (!evs.length) break;
        let didChoice = false;
        for (let i = 0; i < evs.length; i++) {
          const ev = evs[i];
          if (ev.type === 'supplyGranted') {
            list.push({ tierId: ev.tierId, choiceId: 'auto' });
          } else if (ev.type === 'supplyChoice') {
            const cid = this._pickSupply(run, ev.tier, policy);
            const r = MM.Progress.applyChoice(run, ev.tier.id, cid);
            list.push({ tierId: ev.tier.id, choiceId: r.ok ? cid : null });
            didChoice = true;
          }
        }
        if (!didChoice) break;   // 只剩自动档：再查一次即可结束
      }
      return list;
    },

    _pickSupply(run, tier, policy) {
      const ids = (tier.choices || []).map((c) => c.id);
      if (!ids.length) return null;
      const pref = (policy && policy.supplyPref) || 'mixed';
      const has = (id) => ids.indexOf(id) >= 0;
      if (pref === 'stamina') {
        if (run.stamina < run.maxStamina - 2 && has('stamina')) return 'stamina';
        if (has('bomb')) return 'bomb';
        return ids[0];
      }
      if (pref === 'tools') {
        if (run.stamina <= 12 && has('stamina')) return 'stamina';
        if (has('bomb')) return 'bomb';
        if (has('powerPick')) return 'powerPick';
        return ids[0];
      }
      if (run.stamina <= 20 && has('stamina')) return 'stamina';
      if (has('bomb')) return 'bomb';
      return ids[0];
    },

    /* ── 通用执行器：从当前位置合法走到 (tx,ty)，必要时挖掘 / 用工具 ── */
    _moveTo(work, run, tx, ty, policy, log, supplies) {
      let guard = 0;
      while (!(run.playerX === tx && run.playerY === ty)) {
        if (guard++ > 320) return { ok: false, reason: 'stuck' };
        const an = MM.Pathfinder.analyze(work, { x: run.playerX, y: run.playerY });
        const path = an.pathTo(tx, ty);
        if (!path || !path.length) return { ok: false, reason: 'noPath' };
        const next = work.get(path[0].x, path[0].y);
        if (next.excavated) {
          const r = MM.Move.startStep(run, work, next.x, next.y);
          if (!r.ok) return { ok: false, reason: 'step:' + r.reason };
          MM.Move.update(run, work, 1);
          this._track(run);
          continue;
        }
        /* 工具策略：强化矿镐留给 3 体力；炸药炸 ≥2 体力的格子 */
        let picked = false;
        if (policy.pick && !run.freeDig && run.tools.powerPick > 0 && next.digCost >= 3) {
          MM.Tools.tryPowerPick(run);
          picked = true;
          log.push({ act: 'pick', x: next.x, y: next.y });
        }
        if (!picked && policy.bomb && run.tools.bomb > 0 && next.digCost >= 2) {
          const bomb = MM.Tools.tryBomb(run, work, next.x, next.y);
          if (bomb.ok) {
            MM.Tools.resolveBomb(run, work, bomb);
            log.push({ act: 'bomb', x: next.x, y: next.y });
            if (supplies) this._applySupplies(run, policy, supplies);
            continue;
          }
        }
        const begin = MM.Dig.begin(run, work, next.x, next.y);
        if (!begin.ok) return { ok: false, reason: begin.reason, stamina: run.stamina, need: next.digCost };
        MM.Dig.resolve(run, work, begin);
        log.push({ act: 'dig', x: next.x, y: next.y, cost: begin.cost });
        if (supplies) this._applySupplies(run, policy, supplies);
        const step = MM.Move.startStep(run, work, next.x, next.y);
        if (step.ok) MM.Move.update(run, work, 1);
        this._track(run);
      }
      return { ok: true };
    },

    /* ── ① 合法通关记录（Validator 用） ── */
    legalClear(map) {
      const attempt = (viaSpring) => {
        const work = map.clone();
        const run = MM.State.createRun(String(map.seed || 'SIM') + (viaSpring ? '#clearS' : '#clearD'));
        const log = [];
        const supLog = [];
        const policy = { pick: true, bomb: true };
        const spring = work.rooms && work.rooms.spring;
        const targets = [];
        if (viaSpring && spring) targets.push({ x: spring.x, y: spring.y });
        targets.push({ x: work.vault.x, y: work.vault.y });

        for (let i = 0; i < targets.length; i++) {
          const res = this._moveTo(work, run, targets[i].x, targets[i].y, policy, log, supLog);
          if (!res.ok) return { ok: false, reason: res.reason, log, work, run, detail: res };
        }
        const summary = MM.Reward.settle(run, null, 'treasure');
        return {
          ok: true, log, work, run, summary,
          usedSpring: !!(viaSpring && spring),
          digs: run.stats.digActions, bombs: run.stats.bombsUsed, picks: run.stats.picksUsed,
          staminaLeft: run.stamina, actions: log.length,
          supplies: supLog, mineValue: run.mineValue || 0,
        };
      };

      let r = attempt(false);
      if (!r.ok && map.rooms && map.rooms.spring) {
        const r2 = attempt(true);
        if (r2.ok) return r2;
      }
      return r;
    },

    /* ── ② 三种"只用已揭示信息"的策略 ── */
    STRATEGIES: {
      conservative: { costW: 2.2, depthW: 0.55, valueW: 0.06, curiosity: 0.4, stopDepth: 18, tools: false, minStamina: 6, supplyPref: 'stamina' },
      balanced: { costW: 1.15, depthW: 0.7, valueW: 0.5, curiosity: 1.6, stopDepth: 30, tools: true, minStamina: 4, supplyPref: 'mixed' },
      deep: { costW: 0.4, depthW: 1.9, valueW: 0.06, curiosity: 0.4, stopDepth: 9999, tools: true, minStamina: 2, supplyPref: 'tools' },
    },

    play(map, strategy) {
      const cfg = this.STRATEGIES[strategy] || this.STRATEGIES.balanced;
      const work = map.clone();
      const run = MM.State.createRun(String(map.seed || 'SIM') + '#' + strategy);
      const log = [];
      const supLog = [];
      let last = { x: -1, y: -1 };
      const visited = {};
      visited[run.playerX + ',' + run.playerY] = 1;
      let steps = 0;
      let stopReason = 'settle';
      let lastGainStep = 0;
      let lastDepthStep = 0;

      while (steps++ < MM.BALANCE.SIM.MAX_STEPS) {
        MM.Vision.revealAround(work, run.playerX, run.playerY, MM.Vision.radius(run));
        if (run.treasureReached || run.settled) break;
        /* 资源耗尽：既挖不动也没有工具 → 直接收手结算（避免在通道里空走） */
        if (run.stamina <= 2 && run.tools.bomb <= 0 && run.tools.powerPick <= 0 && !run.freeDig) {
          stopReason = 'stamina';
          break;
        }
        if (run.playerY >= cfg.stopDepth && (strategy !== 'balanced' || run.baseValue > 0)) {
          stopReason = 'depth';
          break;
        }

        /* 候选 = 四邻居（视野半径 ≥ 1，四邻居必然已揭示或已挖开）
         * 原则：优先"挖"（推进/收益），只有无格可挖时才移动换位——
         * 否则策略会在入口的已挖平台上打转（P3 抽检发现）。 */
        const digs = [];
        const moves = [];
        for (let d = 0; d < DIRS4.length; d++) {
          const c = work.get(run.playerX + DIRS4[d][0], run.playerY + DIRS4[d][1]);
          if (!c) continue;
          const back = (c.x === last.x && c.y === last.y);
          if (c.excavated) {
            /* 已挖格：按"前沿度"评分——通向未挖区域的通道值得走，死胡同不值得 */
            let frontier = 0;
            for (let dd = 0; dd < DIRS4.length; dd++) {
              const n = work.get(c.x + DIRS4[dd][0], c.y + DIRS4[dd][1]);
              if (n && !n.excavated && n.revealed) frontier++;
            }
            const seen = visited[c.x + ',' + c.y] || 0;
            moves.push({
              cell: c, type: 'move',
              score: 0.8 * frontier - 0.4 - (back ? 2.5 : 0) - 0.6 * Math.min(4, seen),
              back,
            });
            continue;
          }
          if (!c.revealed) continue;
          if (c.specialType === 'vault') continue;              // 藏宝室不当作普通格
          const gain = c.y - run.playerY;
          const value = c.resourceType ? MM.Resources.value(c.resourceType) : 0;
          let score = -c.digCost * cfg.costW + gain * cfg.depthW + value * cfg.valueW;
          /* 已揭示的线索 = "附近有东西"：给探索型策略一点好奇心奖励 */
          if (c.clueType) score += cfg.curiosity || 0;
          /* 已看见的泉水：体力偏低时值得绕过去（策略按"已揭示信息"行动，合法） */
          if (c.specialType === 'spring' && run.stamina < 14) score += 8;
          if (c.specialType === 'vaultEntrance') score += 2.5;
          if (gain < 0) score -= 1.2;   // 尽量别往回挖
          if (back) score -= 2.5;
          const affordable = run.freeDig || run.stamina >= c.digCost;
          const toolable = cfg.tools && c.digCost >= 2
            && (run.tools.bomb > 0 || (!run.freeDig && run.tools.powerPick > 0));
          if (!affordable && !toolable) score -= 100;
          digs.push({ cell: c, type: 'dig', score, cost: c.digCost, back, affordable });
        }
        const opts = digs.concat(moves);
        if (!opts.length) { stopReason = 'noOption'; break; }
        /* 四邻居全是"挖不动且用不了工具"的岩层时，收手 */
        if (digs.length && !digs.some((o) => o.affordable
          || (cfg.tools && ((run.tools.bomb > 0 && o.cost >= 2) || (!run.freeDig && run.tools.powerPick > 0 && o.cost >= 3))))) {
          stopReason = 'stamina';
          break;
        }
        opts.sort((a, b) => b.score - a.score);
        let bestOpt = opts[0];
        /* 有"还算值得挖"的格子时优先挖，避免在已挖通道里来回走 */
        if (bestOpt.type === 'move') {
          const goodDig = digs.filter((o) => o.score > -2).sort((a, b) => b.score - a.score)[0];
          if (goodDig) bestOpt = goodDig;
        }
        if (bestOpt.score <= -50) { stopReason = 'stamina'; break; }
        if (bestOpt.type === 'move') {
          const hasForward = opts.some((o) => !o.back);
          if (!hasForward) { stopReason = 'deadEnd'; break; }
        }

        if (bestOpt.type === 'move') {
          const r = MM.Move.startStep(run, work, bestOpt.cell.x, bestOpt.cell.y);
          if (!r.ok) break;
          last = { x: run.playerX, y: run.playerY };
          MM.Move.update(run, work, 1);
          this._track(run);
          visited[run.playerX + ',' + run.playerY] = (visited[run.playerX + ',' + run.playerY] || 0) + 1;
          continue;
        }

        /* 挖掘：工具"主动"使用（人类玩家的正常做法）——
         * 强化矿镐留给 3 体力硬岩；炸药留给 ≥2 体力且体力不宽裕时的推进 */
        let usedTool = false;
        const cell = bestOpt.cell;
        if (cfg.tools && !run.freeDig && run.tools.powerPick > 0 && cell.digCost >= 3) {
          MM.Tools.tryPowerPick(run);
          usedTool = true;
          log.push({ act: 'pick' });
        }
        if (!usedTool && cfg.tools && run.tools.bomb > 0 && cell.digCost >= 2 && run.stamina <= 26) {
          const bomb = MM.Tools.tryBomb(run, work, cell.x, cell.y);
          if (bomb.ok) {
            MM.Tools.resolveBomb(run, work, bomb);
            log.push({ act: 'bomb' });
            this._applySupplies(run, cfg, supLog);
            continue;
          }
        }
        if (!usedTool && !run.freeDig && run.stamina < cell.digCost) {
          if (cfg.tools && run.tools.bomb > 0 && cell.digCost >= 2) {
            const bomb = MM.Tools.tryBomb(run, work, cell.x, cell.y);
            if (bomb.ok) {
              MM.Tools.resolveBomb(run, work, bomb);
              log.push({ act: 'bomb' });
              this._applySupplies(run, cfg, supLog);
              continue;
            }
          }
          stopReason = 'stamina';
          break;
        }
        const begin = MM.Dig.begin(run, work, cell.x, cell.y);
        if (!begin.ok) { stopReason = begin.reason || 'deny'; break; }
        const beforeValue = run.baseValue;
        const beforeDepth = run.maxDepthReached;
        MM.Dig.resolve(run, work, begin);
        log.push({ act: 'dig', value: cell.resourceType ? MM.Resources.value(cell.resourceType) : 0 });
        this._applySupplies(run, cfg, supLog);
        const step = MM.Move.startStep(run, work, cell.x, cell.y);
        if (step.ok) MM.Move.update(run, work, 1);
        this._track(run);
        visited[run.playerX + ',' + run.playerY] = (visited[run.playerX + ',' + run.playerY] || 0) + 1;
        last = { x: run.playerX, y: run.playerY };
        if (run.baseValue > beforeValue || run.maxDepthReached > beforeDepth) lastGainStep = steps;
        if (run.maxDepthReached > beforeDepth) lastDepthStep = steps;
        if (steps - lastGainStep > 120) { stopReason = 'stalled'; break; }
        if (steps - lastDepthStep > 220) { stopReason = 'noProgress'; break; }
      }
      if (stopReason === 'settle' && steps >= MM.BALANCE.SIM.MAX_STEPS) stopReason = 'maxSteps';

      const summary = run.treasureReached
        ? MM.Reward.settle(run, null, 'treasure')
        : MM.Reward.settle(run, null, 'direct');
      return {
        strategy,
        seed: run.seed,
        depth: run.maxDepthReached,
        currentDepth: run.playerY,
        baseValue: summary.baseValue,
        value: summary.finalValue,
        treasureReached: run.treasureReached,
        digs: run.stats.digActions,
        bombs: run.stats.bombsUsed,
        picks: run.stats.picksUsed,
        springFound: run.roomsFound.indexOf('spring') >= 0,
        roomsFound: run.roomsFound.length,
        supplies: supLog,
        mineValue: run.mineValue || 0,
        cartRides: run.stats.cartRides || 0,
        endReason: run.treasureReached ? 'treasure' : (stopReason || 'settle'),
        steps,
      };
    },
  };

  MM.Simulator = Sim;
})();
