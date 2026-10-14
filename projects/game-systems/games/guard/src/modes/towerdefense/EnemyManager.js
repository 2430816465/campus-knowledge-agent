/* 怪物管理（§9 / §10 / §11 / §14 / §40）
 *
 * - 沿固定路径移动；唯一进度变量 dist（pathProgress）
 * - 普通怪 / 精英怪走到终点：终点生命 -1；归零立即失败
 * - Boss 走到终点：Boss 挑战失败，但终点生命 -0，绝不影响正式胜利（§14）
 * - 击杀金币只结算一次（用 dead/gone 双标志防重复，§58-⑨）
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.Enemies = {
    spawn(run, item) {
      const def = TD.MONSTERS[item.monsterId];
      if (!def) return null;
      if (run.enemies.length >= TD.BALANCE.MAX_ENEMIES) return null;

      const hp = item.hp == null ? def.hp : item.hp;
      const baseSpeed = item.speed == null ? def.speed : item.speed;
      const speed = baseSpeed;   // 地图移速补偿已在 TD.Waves.resolve() 里应用（预告与实际同源）
      const start = TD.MapGeo.pointAt(run.map, 0);
      const direction = TD.MapGeo.directionAt(run.map, 0);

      const e = {
        id: run.enemySeq++,
        monsterId: def.id,
        name: def.name,
        tier: def.tier,
        isBoss: !!def.isBoss,
        hp: hp,
        maxHp: hp,
        speed: speed,
        slowT: 0,          // 剩余减速时间（§23）
        slowFactor: 1,     // 减速系数（最低 0.5，禁止冻结）
        size: def.size,
        color: def.color,
        shape: def.shape,
        dist: 0,
        walkDist: 0,
        walkPhase: 0,
        motionWeight: 1,
        x: start.x,
        y: start.y,
        direction: direction,
        facing: direction === 'west' ? -1 : 1,
        hitT: 0,
        dead: false,   // 被打死（只结算一次）
        gone: false,   // 已离场（死亡 / 到达终点 / 被清场）
      };
      run.enemies.push(e);
      return e;
    },

    byId(run, id) {
      for (let i = 0; i < run.enemies.length; i++) {
        if (run.enemies[i].id === id) return run.enemies[i];
      }
      return null;
    },

    /* 精灵"头顶"位置（血条 / 伤害数字 / 名字都挂在这里） */
    headY(e) { return e.y - e.size * 1.05; },

    update(run, dt) {
      const total = TD.MapGeo.length(run.map);
      for (let i = 0; i < run.enemies.length; i++) {
        const e = run.enemies[i];
        if (e.gone) continue;
        if (e.hitT > 0) e.hitT = Math.max(0, e.hitT - dt);
        let mult = 1;
        if (e.slowT > 0) {
          e.slowT -= dt;
          if (e.slowT <= 0) { e.slowT = 0; e.slowFactor = 1; }
          else mult = e.slowFactor || 1;
        }
        const prevX = e.x, prevY = e.y;
        e.dist += e.speed * mult * dt;
        if (e.dist >= total) {
          this.leak(run, e);
          continue;
        }
        const p = TD.MapGeo.pointAt(run.map, e.dist);
        e.direction = TD.MapGeo.directionAt(run.map, e.dist);
        e.facing = e.direction === 'west' ? -1 : 1;
        const dx = p.x - prevX, dy = p.y - prevY;
        const moved = Math.hypot(dx, dy);
        if (moved > 0.001) {
          e.walkDist += moved;
          const stride = e.monsterId === 'boss' ? 38 : (e.monsterId === 'elite' ? 27 : 20);
          e.walkPhase = e.walkDist / stride * Math.PI * 2;
          e.motionWeight = Math.min(1, moved / Math.max(0.001, e.speed * dt));
        }
        e.x = p.x;
        e.y = p.y;
      }
      if (run.enemies.length) {
        run.enemies = run.enemies.filter(function (e) { return !e.gone; });
      }
    },

    /* 到达终点（漏怪 / Boss 逃脱） */
    leak(run, e) {
      if (e.gone) return;
      e.gone = true;

      if (e.isBoss) {
        TD.Waves.recordBossEscape(run);
        TD.Effects.bossEscape(run, e.x, e.y);
        run.shake = Math.max(run.shake || 0, 0.5);
        TD.Sfx.leak();
        TD.Waves.finishBoss(run, false);   // 不扣终点生命（§14）
        return;
      }

      TD.Waves.recordLeak(run, e);
      run.stats.leaked += 1;
      if (!run.debug.invincible) run.endpointHP -= 1;
      TD.Effects.leakFx(run, e.x, e.y);
      run.shake = Math.max(run.shake || 0, 0.35);   // 屏幕反馈（§51）
      TD.Sfx.leak();
      if (run.endpointHP <= 0 && !run.debug.invincible) TD.Waves.fail(run);
    },

    damage(run, e, amount, hero, slow) {
      if (!e || e.dead || e.gone) return;
      if (slow) this.applySlow(run, e, slow);
      e.hitT = 0.15;
      const dealt = Math.min(Math.max(0, amount), Math.max(0, e.hp));
      e.hp -= dealt;
      if (hero) {
        hero.totalDamage = (hero.totalDamage || 0) + dealt;
        const byClass = run.stats.classDamage || (run.stats.classDamage = {});
        byClass[hero.classId] = (byClass[hero.classId] || 0) + dealt;
        TD.Waves.recordDamage(run, hero, dealt);
      }
      if (e.hp > 0) return;

      e.dead = true;
      e.gone = true;
      run.stats.kills += 1;
      TD.Waves.recordKill(run, e);
      TD.Sfx.death();
      if (!e.isBoss) {
        run.gold += TD.ECONOMY.killGold(TD.MONSTERS[e.monsterId], e.tier);
      }
      TD.Effects.deathFx(run, e.x, e.y, e.color, e.size, e.monsterId);
      if (e.isBoss) TD.Waves.finishBoss(run, true);
    },

    /* 减速（§23）：简单规则、最低 50%、绝不冻结 */
    applySlow(run, e, slow) {
      if (!e || e.dead || e.gone) return;
      const factor = Math.max(0.5, slow.factor || 0.5);
      const duration = Math.max(0.2, slow.duration || 2);
      e.slowFactor = Math.min(e.slowFactor || 1, factor);
      e.slowT = Math.max(e.slowT || 0, duration);
    },

    /* 范围伤害（§42）：以某点为中心，半径内敌人全部受伤（供法师 / 炎之贤者 / 冰霜贤者使用） */
    damageArea(run, x, y, radius, amount, hero, slow) {
      const hit = [];
      for (let i = 0; i < run.enemies.length; i++) {
        const e = run.enemies[i];
        if (e.dead || e.gone) continue;
        if (TD.U.dist2(x, y, e.x, e.y) <= radius * radius) {
          this.damage(run, e, amount, hero, slow);
          hit.push(e);
        }
      }
      return hit;
    },

    /* 调试用：清空场上怪物（Boss 按"逃脱"处理，不给击杀奖励） */
    clearAll(run) {
      for (let i = 0; i < run.enemies.length; i++) {
        const e = run.enemies[i];
        if (e.gone) continue;
        e.gone = true;
        if (e.isBoss) TD.Waves.finishBoss(run, false);
        else TD.Effects.deathFx(run, e.x, e.y, e.color, e.size, e.monsterId);
      }
      run.enemies = [];
    },
  };
})();
