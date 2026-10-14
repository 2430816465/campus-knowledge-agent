/* 魔塔 · 勇者成长规则 */
(function () {
  const MT = (window.MT = window.MT || {});

  // 隐藏成长进度阈值：20 * 当前阶段^2
  function expNeeded(level) {
    return 20 * level * level;
  }
  // 每次成长结算的属性收益
  const LEVEL_GAIN = { hp: 150, atk: 2, def: 2 };

  function newHero() {
    return {
      hp: 1000,
      atk: 10,
      def: 10,
      gold: 0,
      exp: 0,
      level: 1,
      keys: { yellow: 1, blue: 0, red: 0 },
      items: {},
      flags: {},
      floor: 1,
      x: 1,
      y: 9
    };
  }

  /** 返回本次结算升了几级 */
  function tryLevelUp(hero, log) {
    let ups = 0;
    while (hero.exp >= expNeeded(hero.level)) {
      hero.exp -= expNeeded(hero.level);
      hero.level += 1;
      hero.hp += LEVEL_GAIN.hp;
      hero.atk += LEVEL_GAIN.atk;
      hero.def += LEVEL_GAIN.def;
      ups++;
      if (ups > 999) break;
    }
    return ups;
  }

  MT.Hero = { newHero, expNeeded, LEVEL_GAIN, tryLevelUp };
})();
