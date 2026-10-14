/* 隐藏房 / 特殊区域配置（设计规格 §30～§43 / §80）。
 *
 * V0.3：**8 类隐藏房全部实现**，并启用"每局生成 2～4 个主要隐藏房"的房间计划：
 *   ① 废弃矿工仓库 supply      §32
 *   ② 黄金矿脉     goldenVein   §33
 *   ③ 天然水晶洞   crystalCave  §34
 *   ④ 地下泉       spring       §35（体力主要来源，§29 → 每局必出）
 *   ⑤ 废弃矿车站   minecart     §36 / §37（含 minecartDestination 约束）
 *   ⑥ 坍塌宝库     ruinVault    §38（奖励提前可见、成本提前可见）
 *   ⑦ 遗失物资室   lostSupplies §39
 *   ⑧ 神秘石室     mysteryRoom  §40（最稀有，保留收藏品等扩展接口）
 * 禁止任何纯负面隐藏房（§41）。
 *
 * 每个房间的内容 / 深度带 / 线索都在这里配置，生成器只负责"按配置摆位置"（§65）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.ROOMS = {
    /* ① 废弃矿工仓库（§32）：局内工具 + 少量矿物 */
    supply: {
      id: 'supply', name: '废弃矿工仓库', kind: 'supply',
      depthRatio: [0.60, 0.85],          // §21：旧矿区（约 27～38m）
      clue: 'planks',
      desc: '工作台与旧矿工储备：可在工具补给和回收制作材料之间选择',
    },

    /* ② 黄金矿脉（§33）：大量金矿 + 少量水晶；入口附近金色裂纹 */
    goldenVein: {
      id: 'goldenVein', name: '黄金矿脉', kind: 'vein',
      depthRatio: [0.25, 0.65],
      clue: 'goldCrack',
      desc: '大量金矿，挖出来才归你——可以挖几块就走，也可以吃干抹净',
    },

    /* ③ 天然水晶洞（§34）：大量水晶；外围较多 2～3 体力岩块，高收益高成本 */
    crystalCave: {
      id: 'crystalCave', name: '天然水晶洞', kind: 'cave',
      depthRatio: [0.35, 0.80],
      clue: 'crystalGlow',
      desc: '大量水晶矿，但外围岩层更硬（成本提前可见）',
    },

    /* ④ 地下泉（§35 / §29）：恢复体力，每眼只触发一次 */
    spring: {
      id: 'spring', name: '地下泉', kind: 'spring',
      depthRatio: [0.30, 0.60],
      clue: 'waterStain',
      desc: '恢复 6～10 体力（不突破上限 50）',
    },

    /* ⑤ 废弃矿车站（§36 / §37）：可以乘坐矿车快速向深处移动 5～8m，跳过沿途矿物 */
    minecart: {
      id: 'minecart', name: '废弃矿车站', kind: 'minecart',
      depthRatio: [0.45, 0.70],
      clue: 'rails',
      desc: '资源收益 vs 深度推进：乘车不消耗体力，但沿途矿物不会获得',
    },

    /* ⑥ 坍塌宝库（§38）：高价值资源肉眼可见，入口附近坚硬岩石较多（成本也提前可见） */
    ruinVault: {
      id: 'ruinVault', name: '坍塌宝库', kind: 'ruin',
      depthRatio: [0.55, 0.85],
      clue: 'goldCrack',
      desc: '里面能看见高价值资源，但入口岩层更硬——值不值得进去自己判断',
    },

    /* ⑦ 遗失物资室（§39）：宝箱 + 随机局内工具 + 矿物价值（综合奖励） */
    lostSupplies: {
      id: 'lostSupplies', name: '遗失物资室', kind: 'supplies',
      depthRatio: [0.35, 0.75],
      clue: 'crates',
      desc: '破损货架与旧矿工设施：宝箱 + 随机工具 + 矿物价值',
    },

    /* ⑧ 神秘石室（§40）：第一版最稀有的隐藏房；大宝箱 + 高额探索价值。
     * 未来扩展：收藏品 / 世界观小物件 / 其他模式解锁线索——先保留扩展接口。 */
    mysteryRoom: {
      id: 'mysteryRoom', name: '神秘石室', kind: 'mystery',
      depthRatio: [0.40, 0.85],
      clue: 'mossStone',
      desc: '最稀有的房间：大宝箱 + 高额探索价值（扩展接口已保留）',
      extensions: ['collectible', 'loreItem', 'unlockClue'],   // §40：V0.4+ 再接入
    },

    /* 最终藏宝库（§42 / §44）：每局必须生成 1 个，位于最深层，横向随机。
     * 它独立于"2～4 个主要隐藏房"的房间计划。 */
    treasure: {
      id: 'treasure', name: '魔王军地下藏宝库', kind: 'treasure',
      depthRatio: [0.85, 1.0],
      clue: 'goldGlow',
      desc: '抵达后判定最深层探索成功并获得 +120 探索价值，可选择结算或继续探索。',
    },
  };

  MM.ROOM_ORDER = ['supply', 'goldenVein', 'crystalCave', 'spring', 'minecart', 'ruinVault', 'lostSupplies', 'mysteryRoom'];

  /* 地下泉恢复量（§29 / §35）
   * V0.6 P3 实测调整：合法通关平均只剩 2 体力 → 从 6~10 上调到当前 12~16，
   * 让"合理选路 + 工具 + 泉水"的藏宝库路线留出可操作的余量（先测后调，见 P3 报告）。 */
  MM.SPRING_HEAL = { min: 12, max: 16 };

  /* 矿车约束（§37）：目的地必须可站立、有继续探索空间、不封闭、不直接进藏宝库、不越界 */
  MM.MINECART_CFG = {
    MIN_DIST: 5,                 // 向深处推进 5～8m（§36）
    MAX_DIST: 8,
    DEST_CLEAR_NEIGHBORS: 2,     // 目的地至少要有 2 个可继续探索的相邻格
  };

  /* 宝箱 / 宝匣档位（内容价值、附带工具、是否算"神秘发现"） */
  MM.CACHE_PROFILES = {
    supplyChest:  { id: 'supplyChest',  name: '木箱',       value: 15, vary: 5,  tools: 1 },
    lostChest:    { id: 'lostChest',    name: '遗失补给箱', value: 20, vary: 8,  tools: 1 },
    ruinCache:    { id: 'ruinCache',    name: '碎石宝匣',   value: 30, vary: 10, tools: 0 },
    mysteryChest: { id: 'mysteryChest', name: '神秘宝箱',   value: 60, vary: 20, tools: 1, mystery: true },
  };

  /* 视觉线索样式（§31 / §43）：临时色块阶段先做成叠加标记 */
  MM.CLUE_STYLES = {
    waterStain:  { id: 'waterStain',  name: '水迹',     color: '#6fb7d9' },
    planks:      { id: 'planks',      name: '木板',     color: '#b98a52' },
    goldGlow:    { id: 'goldGlow',    name: '微弱金光', color: '#ffd75e' },
    goldCrack:   { id: 'goldCrack',   name: '金色裂纹', color: '#ffb830' },
    crystalGlow: { id: 'crystalGlow', name: '蓝紫微光', color: '#7fd8ff' },
    rails:       { id: 'rails',       name: '铁轨',     color: '#8d6b4a' },
    crates:      { id: 'crates',      name: '木箱货架', color: '#c08b4f' },
    mossStone:   { id: 'mossStone',   name: '苔痕石砖', color: '#6fa06a' },
    copperSeam:  { id: 'copperSeam',  name: '铜色矿脉', color: '#e39c5e' },
    goldCache:   { id: 'goldCache',   name: '金矿与补给痕迹', color: '#ffd75e' },
  };

  /* V0.8.2 矿坑遗物（§40 神秘石室扩展接口 collectible 的第一版）：
   *   - 只从"神秘石室"的神秘宝箱掉落；未收集时必掉一件未拥有的（不重复、不随机落空）；
   *   - 纯收集品：不计探索价值、不是货币、不发数值奖励；
   *   - 掉落的瞬间直接写入探索档案（即使中途退出游戏也不会丢）。 */
  MM.RELICS = [
    { id: 'oldLamp',      name: '矿工旧灯',   desc: '灯芯还能亮；据说它照过更深的路。' },
    { id: 'goldPick',     name: '金色镐头',   desc: '镐柄没了，镐头完好。' },
    { id: 'crystalHeart', name: '水晶之心',   desc: '天然水晶洞最深处的那一块。' },
    { id: 'tornMap',      name: '半张旧矿图', desc: '标注的地方已经不存在了。' },
    { id: 'carvedTag',    name: '刻纹矿牌',   desc: '矿工下井前都会摸一摸它。' },
    { id: 'silverBell',   name: '银铃',       desc: '据说摇响它能找到回家的路。' },
  ];

  /* 收藏里程碑复用矿工角色与头灯效果，不增加永久战斗属性。 */
  MM.RELIC_MILESTONES = [
    { id: 'crystalLamp', count: 2, name: '晶辉矿灯', display: '探矿灯光变为晶蓝色。' },
    { id: 'minerBadge', count: 4, name: '远征徽章', display: '矿工胸前佩戴远征徽章。' },
    { id: 'keeperTitle', count: 6, name: '矿脉守藏人', display: '解锁称号与完整矿工手记。',
      note: '旧矿工把最后一盏灯留给后来者，愿每条矿脉都带你平安归来。' },
  ];
})();
