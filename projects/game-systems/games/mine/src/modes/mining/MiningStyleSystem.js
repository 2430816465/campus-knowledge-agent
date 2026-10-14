/* 探索风格（V0.7.1 / 可选个人目标）：
 *   - 开局可选三种风格：探险家 / 矿工 / 速降；
 *   - 风格只回答"这局我想怎么玩"，不改变主目标、不发永久货币或数值奖励；
 *   - 完成后写入探索档案（archive.styles），作为长期收集与"下一局挑战"的来源。
 * 进度只使用玩家本来就能看到的信息（房间发现数 / 采矿进度 / 最深与矿车次数）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const Style = {
    defs() { return MM.BALANCE.STYLES || []; },

    def(id) { return this.defs().filter((s) => s.id === id)[0] || null; },

    /* 进入矿坑时挂到 run 上；未选择风格返回 null */
    attach(run, id) {
      const d = this.def(id);
      if (!d || !run) return null;
      run.style = {
        id: d.id, name: d.name, goal: d.goal,
        done: false, failed: false,
        rewardGranted: false, rewardText: '',
      };
      return run.style;
    },

    /* 速降目标深度：9×45 = 30m；9×20 测试图按真实深度比例缩放 */
    racerDepth(map) {
      const label = (map && map.spec && map.spec.DEPTH_LABEL) || MM.mapSpec().DEPTH_LABEL || 44;
      return Math.max(5, Math.round(30 * (label / 44)));
    },

    /* 当前进度：{ cur, need, text, done, failed } */
    progress(run, map) {
      const s = run && run.style;
      if (!s) return null;
      if (s.id === 'explorer') {
        const n = (run.roomsFound || []).filter((id) => id !== 'treasure').length;
        return { cur: n, need: 2, text: '隐藏房 ' + Math.min(n, 2) + ' / 2', done: n >= 2, failed: false };
      }
      if (s.id === 'miner') {
        const tiers = MM.Progress.tiers(run);
        const need = tiers[1] ? tiers[1].need : 150;
        const v = run.mineValue || 0;
        return { cur: v, need, text: '采矿 ' + v + ' / ' + need, done: v >= need, failed: false };
      }
      if (s.id === 'racer') {
        const need = this.racerDepth(map);
        const cur = run.maxDepthReached || 0;
        const noCart = (run.stats.cartRides || 0) === 0;
        return {
          cur, need, text: '无矿车 ' + Math.min(cur, need) + ' / ' + need + 'm',
          done: noCart && cur >= need,
          failed: !noCart,
        };
      }
      return null;
    },

    /* 每次移动 / 挖掘后调用；返回 'done' | 'failed' | null，且只会触发一次 */
    check(run, map) {
      const s = run && run.style;
      if (!s || s.done || s.failed) return null;
      const p = this.progress(run, map);
      if (!p) return null;
      if (p.failed) { s.failed = true; return 'failed'; }
      if (p.done) { s.done = true; return 'done'; }
      return null;
    },

    /* V0.8.2：风格完成奖励（局内即时、只发一次；数值来自 BALANCE.STYLES[].reward） */
    rewardOf(runOrId) {
      const id = typeof runOrId === 'string' ? runOrId : (runOrId && runOrId.style && runOrId.style.id);
      const d = id ? this.def(id) : null;
      return (d && d.reward) || null;
    },

    rewardPreview(id) {
      const g = this.rewardOf(id);
      if (!g) return '';
      const parts = [];
      if (g.stamina) parts.push('体力 +' + g.stamina);
      if (g.lamp) parts.push('探矿灯 ×' + g.lamp);
      if (g.powerPick) parts.push('强化矿镐 ×' + g.powerPick);
      if (g.bomb) parts.push('炸药 ×' + g.bomb);
      return parts.join(' · ');
    },

    grantReward(run) {
      const s = run && run.style;
      if (!s || !s.done || s.rewardGranted) return null;
      s.rewardGranted = true;   // 无论配置是否存在，都只处理一次
      const g = this.rewardOf(s.id);
      if (!g) return null;
      const parts = [];
      if (g.stamina) {
        const before = run.stamina;
        run.stamina = Math.min(run.maxStamina, run.stamina + g.stamina);
        parts.push('体力 +' + (run.stamina - before));
      }
      if (g.lamp) { run.tools.lamp = (run.tools.lamp || 0) + g.lamp; parts.push('探矿灯 ×' + g.lamp); }
      if (g.powerPick) { run.tools.powerPick = (run.tools.powerPick || 0) + g.powerPick; parts.push('强化矿镐 ×' + g.powerPick); }
      if (g.bomb) { run.tools.bomb = (run.tools.bomb || 0) + g.bomb; parts.push('炸药 ×' + g.bomb); }
      s.rewardText = parts.join(' · ');
      return { text: s.rewardText };
    },

    /* "现在能用它做什么"——奖励弹窗/横幅里必须说明用途 */
    rewardHint(runOrId) {
      const g = this.rewardOf(runOrId);
      if (!g) return '';
      if (g.lamp) return '点工具条里的探矿灯扩大视野';
      if (g.powerPick) return '留给 3 体力硬岩，下一次挖掘不耗体力';
      if (g.bomb) return '点工具条里的炸药再选目标格';
      if (g.stamina) return '体力用于继续挖掘';
      return '';
    },

    /* 结算展示用一行文本 */
    summaryText(run, map) {
      const s = run && run.style;
      if (!s) return '';
      const p = this.progress(run, map);
      if (!p) return '';
      if (s.done) {
        return s.name + ' ✓ 已完成（' + s.goal
          + (s.rewardText ? ' · 奖励 ' + s.rewardText : '') + '）';
      }
      if (p.failed) return s.name + ' ✗ 已失效（本局坐过矿车）';
      return s.name + ' · ' + p.text + '（未完成）';
    },
  };

  MM.Style = Style;
})();
