/* 最终进化：每种英雄两个最终形态（§22~§26），4★ 之后二选一（§21）。
 *
 * 阶段二（§49 / §27）说明：
 *   - 最终进化的爽感主要来自 数值 / 外观 / 特效，不做复杂技能树；
 *   - 除"冰系减速"（§23 明确允许保留的机制差异）外，其余形态只改数值；
 *   - mods 支持字段：atk / interval / range / aoeRadius / maxTargetsBonus，
 *     以及可选的 slow: { factor, duration }（仅冰霜贤者使用，且速度最低 50%）。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.EVOLUTIONS = {
    swordsman: [
      { id: 'berserker',   name: '狂战士', short: '狂', color: '#d1342f', desc: '极高攻击 · 高攻速', mods: { atk: 1.60, interval: 0.90, range: 1.00 } },
      { id: 'swordmaster', name: '剑圣',   short: '圣', color: '#dce8ff', desc: '高攻速 · 大范围', mods: { atk: 1.20, interval: 0.72, range: 1.25 } },
    ],
    archer: [
      { id: 'sharpshooter', name: '神射手',   short: '神', color: '#f2c94c', desc: '极高单发攻击', mods: { atk: 1.75, interval: 1.00, range: 1.15 } },
      { id: 'stormranger',  name: '风暴游侠', short: '风', color: '#3ec6b8', desc: '极高攻击速度', mods: { atk: 1.05, interval: 0.55, range: 1.05 } },
    ],
    mage: [
      { id: 'firesage', name: '炎之贤者', short: '炎', color: '#ff8a3d', desc: '高攻击 · 大范围', mods: { atk: 1.55, interval: 0.95, range: 1.15, aoeRadius: 1.35 } },
      { id: 'frostsage', name: '冰霜贤者', short: '冰', color: '#7fd4ff', desc: '中高攻击 · 减速', mods: { atk: 1.25, interval: 0.90, range: 1.10, aoeRadius: 1.10 }, slow: { factor: 0.5, duration: 2.0 } },
    ],
    rogue: [
      { id: 'assassin',      name: '刺客',   short: '刺', color: '#a03040', desc: '更高单次攻击', mods: { atk: 1.80, interval: 0.95, range: 1.00 } },
      { id: 'shadowdancer',  name: '影舞者', short: '影', color: '#8a5fd6', desc: '极高攻击速度', mods: { atk: 1.10, interval: 0.62, range: 1.05 } },
    ],
    knight: [
      { id: 'judgeknight', name: '裁决骑士', short: '裁', color: '#e0b44c', desc: '高攻击 · 大范围', mods: { atk: 1.60, interval: 0.95, range: 1.15 } },
      { id: 'paladin',     name: '圣骑士',   short: '圣', color: '#f5efc0', desc: '大覆盖 · 稳定输出', mods: { atk: 1.30, interval: 0.85, range: 1.25 } },
    ],
    spearman: [
      { id: 'dragonlance',  name: '龙枪骑士', short: '龙', color: '#e05a2b', desc: '高攻击 · 强穿透', mods: { atk: 1.65, interval: 1.00, range: 1.10, maxTargetsBonus: 1 } },
      { id: 'royallancer',  name: '皇家枪骑', short: '皇', color: '#e6d38a', desc: '更强单体 · 更远距离', mods: { atk: 1.45, interval: 0.90, range: 1.30 } },
    ],
  };
})();
