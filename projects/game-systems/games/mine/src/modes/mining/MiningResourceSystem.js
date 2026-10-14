/* 矿物 / 探索价值结算（设计规格 §22 / §23）：
 * 铜、银、金、水晶只是"本局矿物价值"，统一汇成"探索价值"；
 * 不把矿物永久塞进账号背包（§23），不新增第二套永久货币（§46）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Resources = {
    value(type) {
      const def = MM.RESOURCES[type];
      return def ? def.value : 0;
    },

    /* 领取一次矿物（调用方必须已通过 resourceGranted 去重，§78⑦⑧） */
    grant(run, type) {
      const def = MM.RESOURCES[type];
      if (!def) return 0;
      run.resources[type] = (run.resources[type] || 0) + 1;
      run.materials[type] = (run.materials[type] || 0) + 1;
      run.baseValue += def.value;
      run.mineValue = (run.mineValue || 0) + def.value;   // V0.7：采矿进度只认实际挖出的矿物
      run.stats.minerals++;
      return def.value;
    },

    /* 宝箱 / 藏宝库等直接加价值 */
    addValue(run, amount, reason) {
      const v = Math.max(0, Math.round(amount || 0));
      run.baseValue += v;
      run.otherValue = (run.otherValue || 0) + v;         // 宝箱 / 藏宝库等：不计入采矿进度
      return v;
    },

    /* 结算面板用：只列出本局出现过或价值非零的矿物 */
    summary(run) {
      const rows = [];
      MM.RESOURCE_ORDER.forEach((id) => {
        const count = run.resources[id] || 0;
        if (count <= 0) return;
        rows.push({ id, name: MM.RESOURCES[id].name, count, value: MM.RESOURCES[id].value });
      });
      return rows;
    },
  };
})();
