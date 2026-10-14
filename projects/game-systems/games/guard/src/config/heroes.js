/* 六种基础英雄（§22~§26）。
 *
 * 阶段二（§49）已启用完整六职业差异，全部由 attackType 驱动：
 *   - 'single' 单体：剑士（近战）/ 弓箭手（远程）/ 盗贼（极短程高攻速）/ 骑士（大范围近战）
 *   - 'aoe'    法师：命中点半径内群体伤害（aoeRadius）
 *   - 'pierce' 枪兵：直线穿透，最多命中 maxTargets 个（pierceWidth 为判定线宽）
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.HEROES = [
    { id: 'swordsman', name: '剑士',   short: '剑', color: '#d96b3f', atk: 12, interval: 1.00, range: 100, attackType: 'single', projectile: false, desc: '近战稳定输出' },
    { id: 'archer',    name: '弓箭手', short: '弓', color: '#57bd6a', atk: 10, interval: 1.20, range: 260, attackType: 'single', projectile: true,  desc: '超远程物理输出' },
    { id: 'mage',      name: '法师',   short: '法', color: '#7d6cf0', atk: 12, interval: 1.50, range: 180, attackType: 'aoe', projectile: true, aoeRadius: 70, desc: '魔法弹 · 小范围伤害' },
    { id: 'rogue',     name: '盗贼',   short: '贼', color: '#b9ac4a', atk: 7,  interval: 0.45, range: 80,  attackType: 'single', projectile: false, desc: '极短范围高频攻击' },
    { id: 'knight',    name: '骑士',   short: '骑', color: '#4a94d8', atk: 18, interval: 1.60, range: 130, attackType: 'single', projectile: false, desc: '较慢攻击，大范围近战' },
    { id: 'spearman',  name: '枪兵',   short: '枪', color: '#c07ad8', atk: 12, interval: 1.10, range: 155, attackType: 'pierce', projectile: false, maxTargets: 3, pierceWidth: 30, desc: '中距离直线穿透' },
  ];

  TD.HERO_BY_ID = {};
  TD.HEROES.forEach(function (h) { TD.HERO_BY_ID[h.id] = h; });
})();
