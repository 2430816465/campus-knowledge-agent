/* 工作台事务：材料预览、追踪与制作。所有扣料和获得改造在校验后一次提交。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  function recipe(id) {
    return (MM.CRAFTING_RECIPES || []).find((r) => r.id === id) || null;
  }

  MM.Crafting = {
    recipe,

    preview(run, id) {
      const r = recipe(id);
      if (!r) return { ok: false, reason: 'recipe' };
      const upgrade = MM.Upgrades.canAcquire(run, r.upgradeId);
      const costs = Object.keys(r.costs).map((type) => ({
        type,
        name: (MM.RESOURCES[type] || {}).name || type,
        need: r.costs[type],
        have: (run.materials && run.materials[type]) || 0,
      }));
      const enough = costs.every((c) => c.have >= c.need);
      return {
        ok: upgrade.ok && enough,
        reason: !upgrade.ok ? upgrade.reason : (!enough ? 'materials' : null),
        recipe: r,
        costs,
        tracked: run.trackedRecipe === id,
      };
    },

    track(run, id) {
      const r = recipe(id);
      if (!r || MM.Upgrades.has(run, r.upgradeId)) return { ok: false, reason: 'recipe' };
      run.trackedRecipe = id;
      return { ok: true, recipe: r };
    },

    craft(run, id) {
      const view = this.preview(run, id);
      if (!view.ok) return { ok: false, reason: view.reason, preview: view };
      view.costs.forEach((c) => { run.materials[c.type] -= c.need; });
      const result = MM.Upgrades.acquire(run, view.recipe.upgradeId);
      if (!result.ok) {
        /* 防御性回滚：同一事务不得出现扣料但没有获得改造。 */
        view.costs.forEach((c) => { run.materials[c.type] += c.need; });
        return result;
      }
      run.crafted[view.recipe.id] = (run.crafted[view.recipe.id] || 0) + 1;
      if (run.trackedRecipe === id) run.trackedRecipe = null;
      return { ok: true, recipe: view.recipe, upgrade: result.upgrade, costs: view.costs };
    },

    salvagePreview(run) {
      const id = run.trackedRecipe;
      const r = recipe(id);
      const bundle = {};
      if (r && !MM.Upgrades.has(run, r.upgradeId)) {
        Object.keys(r.costs).forEach((type) => {
          const missing = Math.max(0, r.costs[type] - ((run.materials && run.materials[type]) || 0));
          if (missing) bundle[type] = Math.min(MM.CRAFTING_SALVAGE_LIMIT, missing);
        });
      }
      if (!Object.keys(bundle).length) {
        bundle.copper = 1;
        bundle.silver = 1;
      }
      return bundle;
    },

    salvage(run) {
      const bundle = this.salvagePreview(run);
      Object.keys(bundle).forEach((type) => {
        run.materials[type] = (run.materials[type] || 0) + bundle[type];
      });
      return bundle;
    },

    materialText(bundle) {
      return Object.keys(bundle || {}).map((type) => (MM.RESOURCES[type] || {}).name + ' +' + bundle[type]).join('、');
    },
  };
})();
