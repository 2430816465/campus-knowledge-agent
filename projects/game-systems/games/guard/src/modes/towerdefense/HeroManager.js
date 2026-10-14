/* 英雄管理：英雄 = 纯数据（职业 + 星级 + 最终形态），
 * 没有 HP、不会受伤、不会被怪物攻击（§9）。
 * 备战位英雄保存 / 合成 / 出售 / 换位，但不攻击（§7）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const Heroes = {
    create(run, classId, star) {
      const def = TD.HERO_BY_ID[classId];
      if (!def) throw new Error('未知职业: ' + classId);
      return {
        uid: run.heroSeq++,
        classId: classId,
        star: star || 1,
        evolved: null,     // 最终形态 id；null = 未进化
        cooldown: 0,
        animT: 0,
        animDuration: 0,
        attackState: null,
        totalDamage: 0,
      };
    },

    /* 当前实际数值：基础值 × 星级倍率（§20）× 最终形态倍率（§21） */
    stats(hero) {
      const def = TD.HERO_BY_ID[hero.classId];
      const starPower = TD.BALANCE.STAR_POWER[hero.star] || 1;
      const evo = this.evolvedDef(hero);
      const mods = evo ? evo.mods : { atk: 1, interval: 1, range: 1 };
      return {
        name: this.label(hero),
        classId: def.id,
        short: evo ? evo.short : def.short,
        color: evo ? evo.color : def.color,
        atk: Math.round(def.atk * starPower * mods.atk * 10) / 10,
        interval: Math.max(0.15, def.interval * mods.interval),
        range: def.range * mods.range,
        attackType: def.attackType,
        projectile: def.projectile,
        aoeRadius: (def.aoeRadius || 0) * (mods.aoeRadius || 1),
        maxTargets: (def.maxTargets || 1) + (mods.maxTargetsBonus || 0),
        pierceWidth: def.pierceWidth || 28,
        /* 减速（§23）：只允许出现在最终形态上，且最低速度 50%，禁止冻结 */
        slow: (evo && evo.slow)
          ? { factor: Math.max(0.5, evo.slow.factor || 0.5), duration: Math.max(0.2, evo.slow.duration || 2) }
          : null,
        isFinal: !!evo,
      };
    },

    evolvedDef(hero) {
      if (!hero.evolved) return null;
      const list = TD.EVOLUTIONS[hero.classId] || [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === hero.evolved) return list[i];
      }
      return null;
    },

    label(hero) {
      const evo = this.evolvedDef(hero);
      if (evo) return evo.name + '（最终）';
      return TD.HERO_BY_ID[hero.classId].name + ' ' + TD.U.stars(hero.star);
    },

    all(run) {
      const out = [];
      for (let i = 0; i < run.combat.length; i++) if (run.combat[i]) out.push(run.combat[i]);
      for (let i = 0; i < run.bench.length; i++) if (run.bench[i]) out.push(run.bench[i]);
      return out;
    },

    at(run, zone, index) { return TD.State.slotArray(run, zone)[index] || null; },

    findSlot(run, hero) {
      for (let i = 0; i < run.combat.length; i++) if (run.combat[i] === hero) return { zone: 'combat', index: i };
      for (let i = 0; i < run.bench.length; i++) if (run.bench[i] === hero) return { zone: 'bench', index: i };
      return null;
    },

    count(run) { return this.all(run).length; },

    capacityFull(run) { return this.count(run) >= TD.BALANCE.CAPACITY; },

    /* 招募入场：优先战斗位（直接参战），战斗位满再去备战位（§7 / §48） */
    placeAuto(run, hero) {
      for (let i = 0; i < run.combat.length; i++) {
        if (!run.combat[i]) { run.combat[i] = hero; return { zone: 'combat', index: i }; }
      }
      for (let i = 0; i < run.bench.length; i++) {
        if (!run.bench[i]) { run.bench[i] = hero; return { zone: 'bench', index: i }; }
      }
      return null;
    },

    put(run, hero, zone, index) {
      const arr = TD.State.slotArray(run, zone);
      if (index < 0 || index >= arr.length || arr[index]) return false;
      arr[index] = hero;
      return true;
    },

    remove(run, hero) {
      const at = this.findSlot(run, hero);
      if (!at) return null;
      TD.State.slotArray(run, at.zone)[at.index] = null;
      return at;
    },

    /* 索敌（§9）：攻击范围内、pathProgress 最大（离终点最近）的敌人 */
    findTarget(run, pos, range) {
      let best = null;
      for (let i = 0; i < run.enemies.length; i++) {
        const e = run.enemies[i];
        if (e.dead || e.gone) continue;
        if (TD.U.dist2(pos.x, pos.y, e.x, e.y) <= range * range) {
          if (!best || e.dist > best.dist) best = e;
        }
      }
      return best;
    },

    /* 自动战斗（§9）：战斗位英雄按各自间隔自动攻击。
     * 阶段二起按 attackType 分流（§49）：
     *   single  单体（剑士 / 弓箭手 / 盗贼 / 骑士）
     *   aoe     法师：命中点半径内群体伤害（§42）
     *   pierce  枪兵：直线穿透，最多命中 maxTargets 个（§41）
     */
    updateCombat(run, dt) {
      for (let i = 0; i < run.combat.length; i++) {
        const hero = run.combat[i];
        if (!hero) continue;
        if (hero.attackState && TD.LayeredHeroRig && TD.LayeredHeroRig.supported(hero.classId)) {
          const watched = TD.Enemies.byId(run, hero.attackState.targetId);
          if (watched && !hero.attackState.released) this.aimVisual(hero, hero.attackState.origin, watched);
        }
        this.advanceAttack(run, hero, dt);
        const st = this.stats(hero);
        hero.cooldown -= dt;
        const pos = run.map.combatSlots[i];
        const target = this.findTarget(run, pos, st.range);
        TD.Waves.recordHeroFrame(run, hero, !!target, dt);
        if (hero.attackState || hero.cooldown > 0) continue;
        if (!target) continue;
        hero.cooldown = st.interval;
        hero.animDuration = Math.max(0.1, Math.min(0.54, st.interval * 0.9));
        hero.animT = hero.animDuration;
        hero.visualSuppressed = false;
        this.aimVisual(hero, pos, target);
        hero.attackState = {
          elapsed: 0,
          duration: hero.animDuration,
          releaseAt: hero.animDuration * 0.56,
          released: false,
          targetId: target.id,
          origin: { x: pos.x, y: pos.y },
          stats: {
            atk: st.atk, color: st.color, attackType: st.attackType,
            projectile: st.projectile, aoeRadius: st.aoeRadius, slow: st.slow,
            speed: st.attackType === 'aoe' ? 380 : 460,
            range: st.range, maxTargets: st.maxTargets, pierceWidth: st.pierceWidth,
          },
        };
        TD.Waves.recordAttackStart(run, hero);
      }

      /* A wind-up already started in the combat row remains a committed action if moved to the bench. */
      for (let i = 0; i < run.bench.length; i++) {
        const hero = run.bench[i];
        if (hero && hero.attackState) this.advanceAttack(run, hero, dt);
      }
    },

    advanceAttack(run, hero, dt) {
      if (hero.animT > 0) hero.animT = Math.max(0, hero.animT - dt);
      const action = hero.attackState;
      if (!action) return;
      action.elapsed += dt;
      if (!action.released && action.elapsed >= action.releaseAt) {
        action.released = true;
        const fired = this.releaseAttack(run, hero, action);
        TD.Waves.recordAttackRelease(run, hero, fired);
        if (fired) TD.Sfx.hit();
      }
      if (action.elapsed >= action.duration) {
        hero.attackState = null;
        hero.animT = 0;
      }
    },

    /* Presentation metadata only. The target and range tests still use the original positions. */
    aimVisual(hero, origin, target) {
      const dx = target.x - origin.x;
      hero.visualFacing = dx < 0 ? -1 : 1;
      hero.visualAim = Math.atan2(target.y - (target.size || 30) * .35 - (origin.y - 9), dx);
    },

    releaseAttack(run, hero, action) {
      const target = TD.Enemies.byId(run, action.targetId);
      if (!target || target.dead || target.gone) return false;
      const st = action.stats;
      const pos = action.origin;

      if (st.attackType === 'pierce') {
        return this.attackPierce(run, hero, st, pos, target) > 0;
      }
      if (!st.projectile) {
        if (TD.U.dist2(pos.x, pos.y, target.x, target.y) > st.range * st.range) return false;
        TD.Enemies.damage(run, target, st.atk, hero, st.slow);
        if (hero.classId === 'swordsman' && TD.LayeredHeroRig) TD.Effects.hitSpark(run, target.x, target.y, '#ddc9a2');
        else TD.Effects.slash(run, pos.x, pos.y, target.x, target.y, st.color, 5);
        TD.Effects.damageText(run, target.x, TD.Enemies.headY(target) - 8, String(Math.round(st.atk)), '#ffd75e');
        return true;
      }
      return !!TD.Projectiles.spawn(run, {
        x: pos.x, y: pos.y, target: target, dmg: st.atk, color: st.color, hero: hero,
        visualOrigin: hero.classId === 'archer' && TD.LayeredHeroRig ? TD.LayeredHeroRig.muzzle(hero, pos) : null,
        aoeRadius: st.aoeRadius, slow: st.slow, speed: st.speed,
      });
    },

    /* 枪兵直线穿透（§41）：朝当前目标生成一条直线判定，命中线上最近的 maxTargets 个敌人 */
    attackPierce(run, hero, st, pos, target) {
      const hits = this.pierceHits(run, pos, target, st);
      if (!hits.length) return 0;
      let far = target;
      for (let i = 0; i < hits.length; i++) {
        const e = hits[i].e;
        TD.Enemies.damage(run, e, st.atk, hero, st.slow);
        TD.Effects.damageText(run, e.x, TD.Enemies.headY(e) - 8, String(Math.round(st.atk)), '#ffd75e');
        far = e;
      }
      TD.Effects.slash(run, pos.x, pos.y, far.x, far.y, st.color, 7);
      return hits.length;
    },

    pierceHits(run, pos, target, st) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const maxLen = st.range;
      const halfW = (st.pierceWidth || 28) / 2;
      const list = [];
      for (let i = 0; i < run.enemies.length; i++) {
        const e = run.enemies[i];
        if (e.dead || e.gone) continue;
        const ex = e.x - pos.x;
        const ey = e.y - pos.y;
        const t = ex * ux + ey * uy;          // 沿枪线的投影距离
        if (t < -e.size * 0.5 || t > maxLen) continue;
        const perp = Math.abs(ex * uy - ey * ux);   // 到枪线的垂直距离
        if (perp > halfW + e.size * 0.35) continue;
        list.push({ e: e, t: t });
      }
      list.sort(function (a, b) { return a.t - b.t; });
      return list.slice(0, Math.max(1, st.maxTargets || 1));
    },

    refreshBest(run) {
      let best = null, bestScore = -1;
      const list = this.all(run);
      for (let i = 0; i < list.length; i++) {
        const h = list[i];
        const score = (h.evolved ? 100000 : 0) + h.star * 1000;
        if (score > bestScore) { bestScore = score; best = h; }
      }
      run.stats.bestHeroLabel = best ? this.label(best) : '—';
    },
  };

  TD.Heroes = Heroes;
})();
