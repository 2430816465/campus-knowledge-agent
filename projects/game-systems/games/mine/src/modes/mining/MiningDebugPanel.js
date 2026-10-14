/* 开发调试面板（设计规格 §75 必须做；DEV_MODE=false 时自动隐藏）：
 *   体力：+10 / 设为1 / 设为50       工具：+炸药 / +强化矿镐 / +探矿灯
 *   地图：显示全图 / 隐藏全图        路径：显示理论最低成本路径（§77）
 *   传送：到 10m / 到底部附近        价值：+100 探索价值
 *   藏宝库：立即生成并揭示入口       重生成：新随机 Seed / 输入指定 Seed
 *   存档：清空矿坑存档（不含账号级通用货币）
 * 面板打开时游戏输入被屏蔽，避免误操作。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  function DebugPanel() {
    this.open = false;
    this.showAll = false;     // 显示全地图
    this.showPath = false;    // 显示最低成本路径
    this.showBranches = false; // P2：显示岔路 / 线索（入口成本与可能收益）
    this.info = '';
    this.hit = {};
    this.resetArmed = false;
    this.resetArmT = 0;
  }

  DebugPanel.prototype.handleClick = function (mode, x, y) {
    const ids = Object.keys(this.hit);
    for (let i = 0; i < ids.length; i++) {
      const rect = this.hit[ids[i]];
      if (MM.U.pointInRect(x, y, rect)) {
        const label = rect.label || ids[i];
        if (ids[i] === 'reset') {
          if (!this.resetArmed) {
            this.resetArmed = true;
            this.resetArmT = 2.5;
            this.info = '再点一次「清空矿坑存档」确认（不影响通用货币）';
            return true;
          }
          this.resetArmed = false;
          mode.debugAction('reset');
          this.info = '矿坑纪录已清空（通用货币保留）';
          return true;
        }
        mode.debugAction(ids[i]);
        this.info = '已执行：' + label;
        return true;
      }
    }
    return false;
  };

  DebugPanel.prototype.update = function (dt) {
    if (this.resetArmT > 0) {
      this.resetArmT -= dt;
      if (this.resetArmT <= 0) this.resetArmed = false;
    }
  };

  /* 面板按钮定义（顺序即布局顺序，2 列） */
  DebugPanel.prototype.defs = function () {
    return [
      { id: 'stamina10', label: '+10 体力' },
      { id: 'stamina1', label: '体力设为 1' },
      { id: 'stamina50', label: '体力设为 50' },
      { id: 'giveBomb', label: '+1 炸药' },
      { id: 'givePick', label: '+1 强化矿镐' },
      { id: 'giveLamp', label: '+1 探矿灯' },
      { id: 'showAll', label: this.showAll ? '显示全地图（开）' : '显示全地图' },
      { id: 'hideAll', label: '隐藏全地图' },
      { id: 'togglePath', label: this.showPath ? '最低成本路径（开）' : '显示最低成本路径' },
      { id: 'toggleBranches', label: this.showBranches ? '岔路/线索（开）' : '显示岔路/线索' },
      { id: 'teleport10', label: '传送到 10m' },
      { id: 'teleportBottom', label: '传送到底部附近' },
      { id: 'addValue', label: '+100 探索价值' },
      { id: 'vault', label: '揭示藏宝库入口' },
      { id: 'regen', label: '重新生成当前地图' },
      { id: 'seedInput', label: '输入 Seed 重生成' },
      { id: 'mapToggle', label: '切换尺寸（9×20 ↔ 9×45）' },
      { id: 'exportPlaytest', label: '导出试玩记录（全部）' },
      { id: 'clearPlaytest', label: '清空试玩记录' },
      { id: 'reset', label: this.resetArmed ? '注意：再点一次确认清空' : '清空矿坑存档' },
    ];
  };

  DebugPanel.prototype.draw = function (ctx, mode) {
    if (!this.open) return;
    const W = MM.UI.LAYOUT.W, H = MM.UI.LAYOUT.H;
    const px = 46, py = 150, pw = 628, ph = 980;

    ctx.fillStyle = 'rgba(4,6,10,0.72)';
    ctx.fillRect(0, 0, W, H);

    MM.U.fillRound(ctx, px, py, pw, ph, 16, '#121a2b');
    MM.U.strokeRound(ctx, px, py, pw, ph, 16, '#3b4d75', 2);

    MM.U.text(ctx, '开发调试面板（DEV）', 360, py + 46, 26, '#f4f8ff', 'center', true);

    /* 生成诊断信息（Generator / Validator 结果，一屏可见） */
    const rep = mode.genInfo && mode.genInfo.report;
    const st = rep && rep.stats ? rep.stats : {};
    MM.U.text(ctx,
      ((mode.map.spec && mode.map.spec.short) || '') + ' · Seed ' + mode.run.seed
      + ' · 尝试 ' + (mode.genInfo ? mode.genInfo.attempts : '-')
      + ' 次 · 修正 ' + (mode.genInfo ? mode.genInfo.repairs : '-') + ' 轮 · 校验 ' + (rep && rep.ok ? '通过' : '未通过'),
      px + 24, py + 84, 15, '#8fa3c4', 'left');
    MM.U.text(ctx,
      '理论成本：' + (st.midRow != null ? st.midRow + 'm=' + st.midCost : '-')
      + ' · 藏宝库=' + (st.treasureCost != null ? st.treasureCost : '-')
      + ' · 矿物格=' + (st.mineralCells != null ? st.mineralCells : '-')
      + ' · 提示格=' + (st.hints != null ? st.hints : '-'),
      px + 24, py + 110, 15, '#8fa3c4', 'left');
    const plan = mode.map.plan;
    if (plan) {
      const roomNames = (plan.rooms || []).map((id) => (MM.ROOMS[id] || {}).name || id).join('、');
      const brs = (mode.map.branches || []).length;
      MM.U.text(ctx, '房间计划（' + plan.rooms.length + '）：' + roomNames + ' · 岔路 ' + brs + ' 条',
        px + 24, py + 138, 15, '#8fa3c4', 'left');
    }
    if (this.info) MM.U.text(ctx, this.info, px + 24, py + 164, 15, '#ffd75e', 'left');

    const defs = this.defs();
    const cols = 2, bw = 286, bh = 54, gapX = 16, gapY = 8;
    const startX = px + 22, startY = py + 192;
    this.hit = {};
    defs.forEach((d, i) => {
      const cx = i % cols, cy = Math.floor(i / cols);
      const rect = {
        x: startX + cx * (bw + gapX),
        y: startY + cy * (bh + gapY),
        w: bw, h: bh,
        label: d.label,
      };
      this.hit[d.id] = rect;
      const active = (d.id === 'showAll' && this.showAll)
        || (d.id === 'togglePath' && this.showPath)
        || (d.id === 'reset' && this.resetArmed);
      MM.UI.button(ctx, rect, d.label, {
        small: true,
        color: d.id === 'reset' ? '#6e3a3a' : (active ? '#3b5f8f' : '#2b3550'),
        armed: active,
      });
    });

    MM.U.text(ctx, '提示：面板打开时游戏输入被屏蔽；点底部「调试面板」关闭',
      360, py + ph - 34, 15, '#6f7f9c', 'center');
  };

  MM.DebugPanel = DebugPanel;
})();
