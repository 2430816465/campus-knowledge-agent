/* 本局采矿进度与补给（V0.7 / 试玩反馈）：
 *   - 进度只由"实际挖出的矿物"累计（宝箱 / 藏宝库 / 调试加值不算）；
 *   - 达到档位门槛：第一档自动发放，第二 / 三档由玩家三选一；
 *   - 所有门槛与数量都来自 BALANCE.MINE_PROGRESS（待试玩验证的假设值）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const Progress = {
    /* 档位配置：9×20 测试图按"真实深度比例"缩放门槛，
     * 否则该图上 T2/T3 可能整张图都无法达成（短期目标必须始终可完成）。
     * 奖励数量保持全套配置不变；缩放只影响测试图的达成门槛。 */
    tiers(run) {
      const base = MM.BALANCE.MINE_PROGRESS.TIERS;
      const fullLabel = (MM.mapSpec().DEPTH_LABEL) || 44;
      const mapId = (run && run.mapId) || MM.BALANCE.DEFAULT_MAP;
      const label = (MM.mapSpec(mapId).DEPTH_LABEL) || fullLabel;
      if (label >= fullLabel) return base;
      const k = label / fullLabel;
      return base.map((t) => Object.assign({}, t, {
        need: Math.max(10, Math.round(t.need * k / 5) * 5),
      }));
    },

    isClaimed(run, id) {
      const s = run.supplies || {};
      return id === 't1' ? !!s.t1 : !!s[id];
    },

    /* 当前进度状态：{ mineValue, tier, need, remaining, nextRewardText } */
    status(run) {
      const tiers = this.tiers(run);
      const mine = run.mineValue || 0;
      let current = null;
      for (let i = 0; i < tiers.length; i++) {
        if (!this.isClaimed(run, tiers[i].id)) { current = tiers[i]; break; }
      }
      return {
        mineValue: mine,
        tier: current,
        tierName: current ? current.name : null,
        need: current ? current.need : null,
        remaining: current ? Math.max(0, current.need - mine) : 0,
        rewardText: current ? this.rewardText(current) : '全部领取',
      };
    },

    rewardText(tier) {
      if (tier.auto && tier.auto.stamina) return '体力 +' + tier.auto.stamina;
      if (tier.choices) return '三选一：' + tier.choices.map((c) => c.label).join(' / ');
      return '';
    },

    /* HUD 一行用的短奖励说明 */
    rewardShort(tier) {
      if (!tier) return '';
      if (tier.auto && tier.auto.stamina) return '奖励：体力 +' + tier.auto.stamina;
      if (tier.choices) return '奖励：体力/炸药/矿镐 三选一';
      return '';
    },

    /* ── "当前发现"清单（V0.7）：只记录已揭示的信息，不提前揭迷雾 ── */
    note(run, kind, text) {
      if (!text) return;
      const list = run.discoveries || (run.discoveries = []);
      const id = kind + ':' + text;
      if (list.some((d) => d.id === id)) return;
      list.push({ id, kind, text });
      if (list.length > 6) list.shift();   // 只保留最近的发现，避免 HUD 变成长任务列表
    },

    discoveriesText(run, max) {
      const list = (run.discoveries || []).slice(-(max || 3));
      return list.map((d) => d.text).join(' · ');
    },

    /* 挖掘后调用：返回 [{type:'supplyGranted',...}] 或 [{type:'supplyChoice',tier}] */
    check(run) {
      const events = [];
      let guard = 0;
      while (guard++ < 8) {
        const st = this.status(run);
        if (!st.tier) break;
        if ((run.mineValue || 0) < st.tier.need) break;
        if (st.tier.auto) {
          this.applyAuto(run, st.tier, events);
          continue;
        }
        events.push({ type: 'supplyChoice', tier: st.tier });
        break;   // 等玩家选择后，下一次 check 再继续
      }
      return events;
    },

    applyAuto(run, tier, events) {
      run.supplies[tier.id] = 'auto';
      run.supplyActual = run.supplyActual || {};
      const gain = tier.auto || {};
      if (gain.stamina) {
        const before = run.stamina;
        run.stamina = Math.min(run.maxStamina, run.stamina + gain.stamina);
        const actual = run.stamina - before;
        run.supplyActual[tier.id] = '体力 +' + actual;
        events.push({ type: 'supplyGranted', tierId: tier.id, kind: 'stamina', amount: actual, want: gain.stamina });
      }
    },

    /* 玩家选择：只允许一次，选完即记档 */
    applyChoice(run, tierId, choiceId) {
      const tier = this.tiers(run).filter((t) => t.id === tierId)[0];
      if (!tier || !tier.choices) return { ok: false, reason: 'tier' };
      if (this.isClaimed(run, tierId)) return { ok: false, reason: 'claimed' };
      const choice = tier.choices.filter((c) => c.id === choiceId)[0];
      if (!choice) return { ok: false, reason: 'choice' };
      const gain = choice.gain || {};
      const detail = [];
      if (gain.stamina) {
        const before = run.stamina;
        run.stamina = Math.min(run.maxStamina, run.stamina + gain.stamina);
        detail.push('体力 +' + (run.stamina - before));
      }
      if (gain.bomb) { run.tools.bomb = (run.tools.bomb || 0) + gain.bomb; detail.push('炸药 +' + gain.bomb); }
      if (gain.powerPick) { run.tools.powerPick = (run.tools.powerPick || 0) + gain.powerPick; detail.push('强化矿镐 +' + gain.powerPick); }
      if (gain.lamp) { run.tools.lamp = (run.tools.lamp || 0) + gain.lamp; detail.push('探矿灯 +' + gain.lamp); }
      run.supplies[tierId] = choiceId;
      /* V0.8.4：记录“这次实际拿到多少”，结算按实际展示（体力接近上限时不虚报） */
      run.supplyActual = run.supplyActual || {};
      run.supplyActual[tierId] = detail.join('，');
      return { ok: true, tierId, choiceId, detail: detail.join('，') };
    },

    /* 结算展示用：本局补给成果 */
    summaryText(run) {
      const parts = [];
      this.tiers(run).forEach((t) => {
        const v = (run.supplies || {})[t.id];
        if (!v) return;
        const actual = (run.supplyActual || {})[t.id];
        if (actual) { parts.push(t.name + '：' + actual); return; }
        if (t.auto) { parts.push(t.name + '：体力 +' + (t.auto.stamina || 0)); return; }
        const choice = (t.choices || []).filter((c) => c.id === v)[0];
        parts.push(t.name + '：' + (choice ? choice.label : v));
      });
      return parts.length ? parts.join(' · ') : '未领取';
    },
  };

  MM.Progress = Progress;
})();
