/* 飞行物：弓箭手的箭、法师的魔法弹（§9 / §42）。
 * 简单追踪 + 命中判定；数量有上限，不无限创建（§43）。
 * 命中结算：
 *   aoeRadius > 0 → 以命中点为中心的范围伤害（法师 / 炎之贤者 / 冰霜贤者）
 *   否则          → 单体伤害（弓箭手）
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.Projectiles = {
    spawn(run, opt) {
      if (run.projectiles.length >= TD.BALANCE.MAX_PROJECTILES) return null;
      const p = {
        x: opt.x,
        y: opt.y,
        targetId: opt.target.id,
        dmg: opt.dmg,
        speed: opt.speed || 420,
        color: opt.color,
        hero: opt.hero || null,
        aoeRadius: opt.aoeRadius || 0,
        slow: opt.slow || null,
        ttl: 3,
        // Decays with travelled logical distance; it NEVER participates in collision or TTL.
        visualOffset: opt.visualOrigin ? { x: opt.visualOrigin.x-opt.x, y: opt.visualOrigin.y-opt.y } : null,
        visualDistance: opt.visualOrigin ? Math.max(1, Math.hypot(opt.target.x-opt.x,opt.target.y-opt.y)) : 1,
        travelled: 0,
      };
      run.projectiles.push(p);
      return p;
    },

    update(run, dt) {
      const list = run.projectiles;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        const target = TD.Enemies.byId(run, p.targetId);

        if (!target || target.dead || target.gone) {
          if (!p.hero || p.hero.classId !== 'archer') TD.Effects.puffFx(run, p.x, p.y, p.color);
          list.splice(i, 1);
          continue;
        }

        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = p.speed * dt;

        if (step >= d) {
          if (p.aoeRadius > 0) {
            const hit = TD.Enemies.damageArea(run, target.x, target.y, p.aoeRadius, p.dmg, p.hero, p.slow);
            TD.Effects.aoeBurst(run, target.x, target.y, p.aoeRadius, p.color);
            for (let k = 0; k < hit.length; k++) {
              TD.Effects.damageText(run, hit[k].x, TD.Enemies.headY(hit[k]) - 8, String(Math.round(p.dmg)), '#ffd75e');
            }
          } else {
            TD.Enemies.damage(run, target, p.dmg, p.hero, p.slow);
            if (p.hero && p.hero.classId === 'archer') TD.Effects.hitSpark(run, target.x, target.y, '#d9cbb0');
            else TD.Effects.puffFx(run, target.x, target.y, p.color);
            TD.Effects.damageText(run, target.x, TD.Enemies.headY(target) - 8, String(Math.round(p.dmg)), '#ffd75e');
          }
          list.splice(i, 1);
          continue;
        }

        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        p.travelled += step;
        p.ttl -= dt;
        if (p.ttl <= 0) list.splice(i, 1);
      }
    },
  };
})();
