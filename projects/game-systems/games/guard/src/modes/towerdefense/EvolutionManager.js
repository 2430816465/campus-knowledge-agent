/* 最终进化（§21 / §27）：4★ 英雄在两个最终形态里二选一。
 *
 * 进化之后：不能继续升星、不能再次进化、也不能和其它最终英雄合成；
 * 同一种最终英雄数量不限。
 * V0.1 只有数值 / 名称 / 颜色差异（机制差异留到第二阶段，§49）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.Evolve = {
    options(hero) {
      if (!hero || hero.star !== 4 || hero.evolved) return [];
      return TD.EVOLUTIONS[hero.classId] || [];
    },

    canEvolve(hero) { return this.options(hero).length > 0; },

    evolve(run, hero, evoId) {
      const list = this.options(hero);
      let picked = null;
      for (let i = 0; i < list.length; i++) if (list[i].id === evoId) picked = list[i];
      if (!picked) return false;

      hero.evolved = evoId;
      TD.Sfx.evolve();
      TD.Meta.add('evolutions');
      const at = TD.Heroes.findSlot(run, hero);
      if (at) {
        const pos = TD.State.slotPos(run, at.zone, at.index);
        TD.Effects.evolveFx(run, pos.x, pos.y, picked.name, picked.color);
      }
      TD.Heroes.refreshBest(run);
      return true;
    },
  };
})();
