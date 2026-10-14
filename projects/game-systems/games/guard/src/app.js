/* 启动器：画布适配 + 主循环 + 场景切换。
 * 与主项目一致：不引任何库、不需要构建，直接双击 index.html 运行。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = MT.TD;

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  TD.Input.init(canvas);

  const Game = {
    canvas: canvas,
    ctx: ctx,
    scene: null,
    speed: 1,   // 调试面板的 ×1 / ×2 / ×4（§54）

    setScene(scene) {
      if (this.scene && this.scene.exit) this.scene.exit();
      this.scene = scene;
      simAccumulator = 0;
      if (scene && scene.enter) scene.enter();
    },

    setSpeed(speed) {
      const allowed = [1, 2, 4];
      this.speed = allowed.indexOf(speed) >= 0 ? speed : 1;
      return this.speed;
    },

    cyclePlaySpeed() {
      return this.setSpeed(this.speed === 1 ? 2 : 1);
    },

    cycleSpeed() {
      return this.setSpeed(this.speed === 1 ? 2 : (this.speed === 2 ? 4 : 1));
    },

    advanceTime(seconds) {
      const scene = this.scene;
      const elapsed = Math.max(0, Number(seconds) || 0);
      if (!scene) return;

      if (scene.speedScaled) {
        simAccumulator += elapsed * this.speed;
        let steps = 0;
        while (simAccumulator >= FIXED_STEP && steps < MAX_FIXED_STEPS) {
          scene.update(FIXED_STEP, elapsed);
          steps += 1;
          if (this.scene !== scene) {
            simAccumulator = 0;
            break;
          }
          simAccumulator -= FIXED_STEP;
        }
      } else {
        simAccumulator = 0;
        scene.update(elapsed, elapsed);
      }
      const activeScene = this.scene;
      if (activeScene && activeScene.draw) activeScene.draw(ctx);
    },
  };
  TD.Game = Game;

  const FIXED_STEP = 1 / 60;
  const MAX_FIXED_STEPS = 1200;
  let simAccumulator = 0;

  function fit() {
    const scale = Math.min(window.innerWidth / 720, window.innerHeight / 1280);
    canvas.style.width = Math.round(720 * scale) + 'px';
    canvas.style.height = Math.round(1280 * scale) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;   // 保持像素清晰（§43）

  /* 阶段四：音效开关（跟随存档）+ 怪物素材预加载（失败自动回退色块） */
  TD.Sfx.setMuted(!!(TD.Save.get().settings && TD.Save.get().settings.muted));
  TD.Assets.loadAll();

  /* 开发 / QA 快捷入口（可选参数，不影响正常玩法）：
   *   index.html?start=map01   → 直接进入塔防对局（跳过标题与选图）
   *   index.html?scene=maps    → 直接打开地图选择
   */
  let bootScene = null;
  try {
    const params = new URLSearchParams(window.location.search || '');
    const startMap = params.get('start');
    if (startMap && TD.MAP_BY_ID[startMap]) bootScene = new TD.TowerDefenseMode(startMap);
    else if (params.get('scene') === 'maps') bootScene = new TD.MapSelectScene();
  } catch (e) { /* 环境不支持时正常走标题 */ }
  Game.setScene(bootScene || new TD.TitleScene());

  /* Deterministic hooks for tools and scripted previews. */
  window.advanceTime = function (milliseconds) {
    Game.advanceTime((Number(milliseconds) || 0) / 1000);
  };
  window.render_game_to_text = function () {
    const scene = Game.scene;
    const run = scene && scene.run;
    if (!run) return JSON.stringify({ scene: scene && scene.constructor ? scene.constructor.name : 'none' });
    const enemies = run.enemies.filter(function (e) { return !e.dead && !e.gone; });
    const heroes = [];
    for (let i = 0; i < run.combat.length; i++) {
      const hero = run.combat[i];
      if (!hero) continue;
      heroes.push({ slot: i, classId: hero.classId, star: hero.star, evolved: hero.evolved || null,
        cooldown: Math.round(hero.cooldown * 1000) / 1000,
        attackProgress: hero.animDuration ? Math.round((1 - hero.animT / hero.animDuration) * 100) / 100 : 0 });
    }
    return JSON.stringify({
      coordinates: 'origin top-left; x increases right; y increases down',
      scene: 'towerdefense', mapId: run.mapId, seed: run.seed, wave: run.wave, state: run.state,
      paused: !!(scene && scene.paused), speed: Game.speed,
      endpointHP: run.endpointHP, gold: run.gold, kills: run.stats.kills, leaked: run.stats.leaked,
      enemies: enemies.slice(0, 24).map(function (e) {
        return { id: e.id, monsterId: e.monsterId, x: Math.round(e.x), y: Math.round(e.y),
          hp: Math.ceil(e.hp), maxHp: e.maxHp };
      }),
      enemiesOmitted: Math.max(0, enemies.length - 24), heroes: heroes,
      telemetry: {
        currentWave: run.waveStats,
        completedWaves: run.stats.waveHistory,
      },
    });
  };

  let last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function frame(now) {
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (rawDt > 0) Game.fps = Game.fps ? (Game.fps * 0.9 + (1 / rawDt) * 0.1) : (1 / rawDt);
    Game.advanceTime(rawDt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
