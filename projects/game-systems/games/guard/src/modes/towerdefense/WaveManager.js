/* 波次管理（§12 / §13 / §46 / §57）
 *
 * V0.1：3 个普通测试波 + 第 4 波 Boss 挑战波。
 * 正式版 20+1 波只往 config/waves.js 里加配置，本文件逻辑不用改。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});
  const S = TD.RunState;

  TD.Waves = {
    /* ── 统一波次解析（方案第一部分：预告与实战共用同一份结果） ──
     * resolve(mapId, waveIndex) 把「波次配置 + 地图补偿」合成最终刷怪表：
     *   - 血量：Boss 用地图的 bossHp，其它用波次配置；未填时回退怪物基础值
     *   - 移速：乘上地图的 speedScale（地图差异全部在这里体现）
     *   - 间隔 / 入场延迟：原样透传
     */
    resolve(mapId, waveIndex) {
      const map = TD.MAP_BY_ID[mapId];
      if (!map) return null;
      const isBoss = waveIndex === 'boss';
      const def = isBoss ? TD.WAVES.boss : TD.WAVES.normal[waveIndex - 1];
      if (!def) return null;
      const scale = map.speedScale || 1;
      const bossHp = isBoss ? (map.bossHp || null) : null;
      const entries = def.entries.map(function (e) {
        const mDef = TD.MONSTERS[e.monster];
        const baseSpeed = (e.speed == null) ? mDef.speed : e.speed;
        return {
          monsterId: e.monster,
          count: e.count,
          hp: (isBoss && bossHp && e.monster === 'boss') ? bossHp : (e.hp == null ? mDef.hp : e.hp),
          speed: Math.round(baseSpeed * scale * 100) / 100,
          gap: (e.gap == null ? 1.0 : e.gap),
          leadIn: e.leadIn || 0,
        };
      });
      return { mapId: mapId, index: def.index, title: def.title, isBoss: isBoss, entries: entries };
    },

    /* 预告摘要：怪物类型 / 数量 / 总血量 / 威胁标签（全部来自 resolve 结果） */
    preview(mapId, waveIndex) {
      const w = this.resolve(mapId, waveIndex);
      if (!w) return null;
      let total = 0;
      let elite = 0;
      let boss = 0;
      let totalHp = 0;
      let fast = 0;
      let window = 0;
      const byType = {};
      w.entries.forEach(function (e) {
        const def = TD.MONSTERS[e.monsterId];
        total += e.count;
        totalHp += e.hp * e.count;
        if (def.tier === 'elite') elite += e.count;
        if (def.isBoss) boss += e.count;
        if (e.speed >= 80) fast += e.count;
        window += e.leadIn + Math.max(0, e.count - 1) * e.gap;
        const row = byType[e.monsterId] || (byType[e.monsterId] = {
          id: e.monsterId, name: def.name, color: def.color, count: 0, tier: def.tier,
          minHp: e.hp, maxHp: e.hp, maxSpeed: 0, fastCount: 0, totalHp: 0,
        });
        row.count += e.count;
        row.minHp = Math.min(row.minHp, e.hp);
        row.maxHp = Math.max(row.maxHp, e.hp);
        row.maxSpeed = Math.max(row.maxSpeed, e.speed);
        if (e.speed >= 80) row.fastCount += e.count;
        row.totalHp += e.hp * e.count;
      });
      const tags = [];
      if (boss) tags.push('Boss');
      if (elite) tags.push('精英 ×' + elite);
      if (fast) {
        Object.keys(byType).forEach(function (id) {
          const row = byType[id];
          if (row.fastCount) tags.push('高速' + row.name + ' ×' + row.fastCount);
        });
      }
      if (total >= 30) tags.push('大波次');
      if (totalHp >= 6000) tags.push('高血量');
      return {
        wave: w, byType: Object.keys(byType).map(function (id) { return byType[id]; }), total: total, elite: elite, boss: boss,
        totalHp: totalHp, tags: tags, spawnWindow: Math.round(window * 10) / 10,
        title: w.title,
      };
    },

    /* 把（已解析的）波次展开成"时间轴生成表" */
    buildSchedule(waveDef) {
      const list = [];
      let t = 0;
      const entries = waveDef.entries || [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        t += (e.leadIn || 0);
        for (let k = 0; k < e.count; k++) {
          list.push({ t: t, monsterId: e.monsterId || e.monster, hp: e.hp, speed: e.speed });
          t += (e.gap == null ? 1.0 : e.gap);
        }
      }
      return list;
    },

    beginWave(run, waveDef, isBoss) {
      if (!waveDef) return;
      run.waveDef = waveDef;
      run.waveTitle = waveDef.title || '';
      run.spawnQueue = this.buildSchedule(waveDef);
      run.spawnIndex = 0;
      run.spawnClock = 0;
      run.waveStats = {
        wave: waveDef.index,
        title: waveDef.title || '',
        isBoss: !!isBoss,
        status: 'running',
        elapsed: 0,
        scheduled: run.spawnQueue.length,
        spawned: 0,
        rejectedSpawns: 0,
        spawnByType: {},
        kills: 0,
        killsByType: {},
        leaks: 0,
        leaksByType: {},
        bossEscapes: 0,
        attacksStarted: 0,
        attacksReleased: 0,
        attackMisses: 0,
        classDamage: {},
        heroes: {},
      };
      if (isBoss) {
        run.state = S.BOSS_RUNNING;
        run.bossChallenge = null;
        run.bossIntro = 2.2;                                   // Boss 登场演出（§51）
        run.flash = { color: '#ff5c5c', ttl: 0.5, ttl0: 0.5 };
        run.shake = Math.max(run.shake || 0, 0.4);
        TD.Sfx.boss();
      } else {
        run.state = S.WAVE_RUNNING;
        TD.Sfx.wave();
      }
    },

    heroRecord(run, hero) {
      const wave = run.waveStats;
      if (!wave || !hero) return null;
      const key = String(hero.uid);
      const rec = wave.heroes[key] || (wave.heroes[key] = {
        uid: hero.uid,
        classId: hero.classId,
        label: TD.Heroes.label(hero),
        attacksStarted: 0,
        attacksReleased: 0,
        attackMisses: 0,
        targetableSeconds: 0,
        noTargetSeconds: 0,
        damage: 0,
      });
      rec.label = TD.Heroes.label(hero);
      return rec;
    },

    recordSpawn(run, enemy) {
      const wave = run.waveStats;
      if (!wave || !enemy) return;
      wave.spawned += 1;
      wave.spawnByType[enemy.monsterId] = (wave.spawnByType[enemy.monsterId] || 0) + 1;
    },

    recordHeroFrame(run, hero, hasTarget, dt) {
      const rec = this.heroRecord(run, hero);
      if (!rec) return;
      const key = hasTarget ? 'targetableSeconds' : 'noTargetSeconds';
      rec[key] += dt;
    },

    recordAttackStart(run, hero) {
      const wave = run.waveStats;
      const rec = this.heroRecord(run, hero);
      if (!wave || !rec) return;
      wave.attacksStarted += 1;
      rec.attacksStarted += 1;
    },

    recordAttackRelease(run, hero, hit) {
      const wave = run.waveStats;
      const rec = this.heroRecord(run, hero);
      if (!wave || !rec) return;
      wave.attacksReleased += 1;
      rec.attacksReleased += 1;
      if (!hit) {
        wave.attackMisses += 1;
        rec.attackMisses += 1;
      }
    },

    recordDamage(run, hero, amount) {
      const wave = run.waveStats;
      if (!wave || !hero || amount <= 0) return;
      const rec = this.heroRecord(run, hero);
      wave.classDamage[hero.classId] = (wave.classDamage[hero.classId] || 0) + amount;
      if (rec) rec.damage += amount;
    },

    recordKill(run, enemy) {
      const wave = run.waveStats;
      if (!wave || !enemy) return;
      wave.kills += 1;
      wave.killsByType[enemy.monsterId] = (wave.killsByType[enemy.monsterId] || 0) + 1;
    },

    recordLeak(run, enemy) {
      const wave = run.waveStats;
      if (!wave || !enemy) return;
      wave.leaks += 1;
      wave.leaksByType[enemy.monsterId] = (wave.leaksByType[enemy.monsterId] || 0) + 1;
    },

    recordBossEscape(run) {
      if (run.waveStats) run.waveStats.bossEscapes += 1;
    },

    closeWave(run, status) {
      const wave = run.waveStats;
      if (!wave || wave.status !== 'running') return;
      wave.status = status;
      const copy = JSON.parse(JSON.stringify(wave));
      run.stats.waveHistory.push(copy);
      run.waveStats = null;
    },

    startNormalWave(run) {
      this.beginWave(run, this.resolve(run.mapId, run.wave), false);
    },

    startBossWave(run) {
      this.beginWave(run, this.resolve(run.mapId, 'boss'), true);
    },

    enterPrepare(run) {
      run.state = S.PREPARE;
      run.prepareTimer = TD.BALANCE.PREPARE_TIME;
      run.waveDef = this.resolve(run.mapId, run.wave);
    },

    enterBossPrepare(run) {
      run.state = S.BOSS_PREPARE;
      run.prepareTimer = TD.BALANCE.PREPARE_TIME;
      run.waveDef = this.resolve(run.mapId, 'boss');
    },

    skipPrepare(run) {
      if (run.state === S.PREPARE || run.state === S.BOSS_PREPARE) {
        run.prepareTimer = Math.min(run.prepareTimer, 0.05);
      }
    },

    /* 主循环：整备倒计时 / 按时间轴生成怪物 / 波次完成判定 */
    update(run, dt) {
      if (run.state === S.PREPARE || run.state === S.BOSS_PREPARE) {
        run.prepareTimer -= dt;
        if (run.prepareTimer <= 0) {
          if (run.state === S.BOSS_PREPARE) this.startBossWave(run);
          else this.startNormalWave(run);
        }
        return;
      }

      if (run.state === S.WAVE_RUNNING || run.state === S.BOSS_RUNNING) {
        if (run.waveStats) run.waveStats.elapsed += dt;
        run.spawnClock += dt;
        while (run.spawnIndex < run.spawnQueue.length
               && run.spawnQueue[run.spawnIndex].t <= run.spawnClock) {
          const enemy = TD.Enemies.spawn(run, run.spawnQueue[run.spawnIndex]);
          if (enemy) this.recordSpawn(run, enemy);
          else if (run.waveStats) run.waveStats.rejectedSpawns += 1;
          run.spawnIndex += 1;
        }

        if (run.spawnIndex >= run.spawnQueue.length && run.enemies.length === 0) {
          if (run.state === S.WAVE_RUNNING) {
            this.closeWave(run, 'cleared');
            if (run.wave >= run.totalNormalWaves) this.finishMain(run);
            else {
              run.state = S.WAVE_CLEAR;
              run.waveClearTimer = TD.BALANCE.WAVE_CLEAR_TIME;
            }
          } else {
            this.finishBoss(run, TD.BossChallenge.SUCCESS);
          }
        }
        return;
      }

      if (run.state === S.WAVE_CLEAR) {
        run.waveClearTimer -= dt;
        if (run.waveClearTimer <= 0) {
          run.wave += 1;
          this.enterPrepare(run);
        }
        return;
      }

      if (run.state === S.MAIN_CLEAR) {
        run.mainClearTimer -= dt;
        if (run.mainClearTimer <= 0) this.enterBossPrepare(run);
        return;
      }
    },

    /* 前 20（V0.1：3）波全部清空 → 正式胜利（§46：先明确"防守成功"） */
    finishMain(run) {
      if (run.mainClearSettled) return;
      run.mainClearSettled = true;
      run.state = S.MAIN_CLEAR;
      run.mainClearTimer = TD.BALANCE.MAIN_CLEAR_TIME;
      TD.Rewards.onMainClear(run);
    },

    /* Boss 挑战结束（击杀 / 逃脱）
     * —— 是"额外奖励挑战"，不影响正式胜负和星级（§14 / §46） */
    finishBoss(run, success) {
      if (run.state === S.RESULT || run.state === S.FAILED) return;
      this.closeWave(run, success ? 'cleared' : 'escaped');
      run.bossChallenge = success ? TD.BossChallenge.SUCCESS : TD.BossChallenge.FAILED;
      run.state = S.RESULT;
      TD.Rewards.onBossResult(run);
    },

    /* 终点生命归零 → 立即失败，不进入 Boss 波（§11 / §3） */
    fail(run) {
      if (run.state === S.FAILED || run.state === S.RESULT) return;
      this.closeWave(run, 'failed');
      run.state = S.FAILED;
      TD.Rewards.onFailed(run);
    },
  };
})();
