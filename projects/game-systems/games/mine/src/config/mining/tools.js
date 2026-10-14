/* 局内工具（设计规格 §25 / §26 / §27 / §28）：V0.1 只有三种，不增加第四、第五种。
 * 数量、效果数值全部来自 BALANCE.TOOL，这里只放名称 / 图标 / 说明 / 掉落权重。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.TOOLS = {
    bomb: {
      id: 'bomb', name: '炸药', icon: 7,
      desc: '炸开目标格 + 上下左右，共最多 5 格（不消耗体力）',
    },
    powerPick: {
      id: 'powerPick', name: '强化矿镐', icon: 8,
      desc: '下一次成功挖掘不消耗体力（建议留给 3 体力坚硬岩石）',
    },
    lamp: {
      id: 'lamp', name: '探矿灯', icon: 9,
      desc: '视野 3 → 5，持续接下来 5 次成功挖掘（按次数，不按时间）',
    },
  };

  MM.TOOL_ORDER = ['bomb', 'powerPick', 'lamp'];

  /* 废弃矿工仓库的宝箱掉落权重（§32） */
  MM.SUPPLY_CHEST_DROP_WEIGHTS = { bomb: 40, powerPick: 30, lamp: 30 };
  MM.SUPPLY_CHEST_VALUE = 15;          // 宝箱附带的少量矿物价值
  MM.SUPPLY_CHEST_VALUE_VARY = 5;      // 15 + 0～5

  MM.toolDef = function (id) { return MM.TOOLS[id] || null; };
})();
