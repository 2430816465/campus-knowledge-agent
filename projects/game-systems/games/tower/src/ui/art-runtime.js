/* 第51层美术基础设施 Phase 1：资源、精灵、动画、分层与 fallback。 */
(function () {
  const MT = (window.MT = window.MT || {});
  const manifest = {
    assets: {
      "hero.walk": { src: "美术/hero/勇者四向行走帧-八帧版.png", frameWidth: 320, frameHeight: 320, frameCount: 32, fps: 44.44, loop: true, anchorX: 0.5, anchorY: 0.92 }
      ,"monster.1.idle": { src: "assets/art/monsters/slime_green/idle/sheet-transparent-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 4, fps: 6, loop: true, anchorX: 0.5, anchorY: 0.92 }
      ,"monster.2.idle": { src: "assets/art/monsters/slime_red/idle/sheet-transparent-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 4, fps: 6, loop: true, anchorX: 0.5, anchorY: 0.92 }
      ,"monster.9.idle": { src: "assets/art/monsters/slime_giant/idle/sheet-transparent-clean.png", frameWidth: 160, frameHeight: 160, frameCount: 4, fps: 6, loop: true, anchorX: 0.5, anchorY: 0.92 }
      ,"monster.5.idle": { src: "assets/art/monsters/skeleton/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.6.idle": { src: "assets/art/monsters/skeleton_elite/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.3.idle": { src: "assets/art/monsters/bat-idle-v2-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 12, fps: 5, loop: true, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.4.idle": { src: "assets/art/monsters/mage_beginner/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.7.idle": { src: "assets/art/monsters/guard_low/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.8.idle": { src: "assets/art/monsters/skeleton_captain/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.A.idle": { src: "assets/art/monsters/bat-idle-v2-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 12, fps: 5, loop: true, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.C.idle": { src: "assets/art/monsters/orc_warrior/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.D.idle": { src: "assets/art/monsters/mage_red/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.E.idle": { src: "assets/art/monsters/rock_golem/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.G.idle": { src: "assets/art/monsters/orc_samurai/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.!.idle": { src: "assets/art/monsters/octopus/idle/user-idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 8, fps: 5, loop: true, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.H.idle": { src: "assets/art/monsters/vampire/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.I.idle": { src: "assets/art/monsters/archmage/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.J.idle": { src: "assets/art/monsters/slime_man/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.K.idle": { src: "assets/art/monsters/ghost_warrior/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.L.idle": { src: "assets/art/monsters/warrior/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.M.idle": { src: "assets/art/monsters/swordsman/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.N.idle": { src: "assets/art/monsters/knight/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.O.idle": { src: "assets/art/monsters/guard_mid/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.P.idle": { src: "assets/art/monsters/knight_gold/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.Q.idle": { src: "assets/art/monsters/slime_king/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.S.idle": { src: "assets/art/monsters/bat-idle-v2-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 12, fps: 5, loop: true, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.T.idle": { src: "assets/art/monsters/mage_low/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.U.idle": { src: "assets/art/monsters/mage_high/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.V.idle": { src: "assets/art/monsters/mage_master/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.W.idle": { src: "assets/art/monsters/knight_black/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.X.idle": { src: "assets/art/monsters/guard_high/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.?.idle": { src: "assets/art/monsters/dragon/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"monster.~.idle": { src: "assets/art/monsters/zeno/remade/idle-clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false, anchorX: 0.5, anchorY: 0.96 }
      ,"original50.door.prison": { src: "assets/art/original50/prison-door/sheet-transparent-v3.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.door.monster": { src: "assets/art/original50/monster-door/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.door.secret": { src: "assets/art/original50/secret-door/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.item.manual": { src: "assets/art/original50/monster-manual/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.item.earthquake": { src: "assets/art/original50/earthquake-scroll/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.item.flyer": { src: "assets/art/original50/symmetry-flyer/clean.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.shop.counter": { src: "assets/art/original50/shop-counter/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.doll": { src: "assets/art/original50/doll/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.item.gemRed": { src: "assets/art/original50/gem-red/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.item.gemBlue": { src: "assets/art/original50/gem-blue/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"original50.item.potionBlue": { src: "assets/art/original50/potion-blue/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"key.yellow": { src: "assets/art/items/keys/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 4, fps: 1, loop: false }
      ,"key.blue": { src: "assets/art/items/keys/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 4, fps: 1, loop: false }
      ,"key.red": { src: "assets/art/items/keys/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 4, fps: 1, loop: false }
      ,"key.master": { src: "assets/art/items/keys/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 4, fps: 1, loop: false }
      ,"door.yellow": { src: "assets/art/tiles/tower-v2/doors-v3-straight.png", frameWidth: 128, frameHeight: 128, frameCount: 8, fps: 1, loop: false }
      ,"door.blue": { src: "assets/art/tiles/tower-v2/doors-v3-straight.png", frameWidth: 128, frameHeight: 128, frameCount: 8, fps: 1, loop: false }
      ,"door.red": { src: "assets/art/tiles/tower-v2/doors-v3-straight.png", frameWidth: 128, frameHeight: 128, frameCount: 8, fps: 1, loop: false }
      ,"door.flower": { src: "assets/art/tiles/tower-v2/doors-v3-straight.png", frameWidth: 128, frameHeight: 128, frameCount: 8, fps: 1, loop: false }
      ,"stairs.up": { src: "assets/art/tiles/stairs-portal/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 4, fps: 1, loop: false }
      ,"stairs.down": { src: "assets/art/tiles/stairs-portal/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 4, fps: 1, loop: false }
      ,"teleporter": { src: "assets/art/tiles/stairs-portal/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 4, fps: 4, loop: true }
      ,"tile.floor": { src: "assets/art/tiles/tower-v2/floor-seamless.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"tile.wall": { src: "assets/art/tiles/tower-v2/wall-clean-small.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"tile.secret": { src: "assets/art/tiles/tower-v2/wall-clean-small.png", frameWidth: 128, frameHeight: 128, frameCount: 1, fps: 1, loop: false }
      ,"environment.rock": { src: "assets/art/tiles/tower-v2/environment-sheet.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"environment.lava": { src: "assets/art/tiles/tower-v2/environment-sheet.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"mechanism.rune": { src: "assets/art/tiles/tower-v2/environment-sheet.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"npc.stele": { src: "assets/art/tiles/tower-v2/environment-sheet.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"mechanism.guardwall": { src: "assets/art/tiles/tower-v2/environment-sheet.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"mechanism.gate": { src: "assets/art/tiles/tower-v2/environment-sheet.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"item.gem": { src: "assets/art/items/basic/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"item.potion": { src: "assets/art/items/basic/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"item.coin": { src: "assets/art/items/basic/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"item.sword": { src: "assets/art/items/basic/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"item.shield": { src: "assets/art/items/basic/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"item.artifact": { src: "assets/art/items/basic/sheet-transparent.png", frameWidth: 128, frameHeight: 128, frameCount: 6, fps: 1, loop: false }
      ,"npc.fairy": { src: "assets/art/npcs/basic/sheet-v2.png", frameWidth: 160, frameHeight: 160, frameCount: 6, fps: 1, loop: false }
      ,"npc.thief": { src: "assets/art/npcs/basic/sheet-v2.png", frameWidth: 160, frameHeight: 160, frameCount: 6, fps: 1, loop: false }
      ,"npc.elder": { src: "assets/art/npcs/basic/sheet-v2.png", frameWidth: 160, frameHeight: 160, frameCount: 6, fps: 1, loop: false }
      ,"npc.merchant": { src: "assets/art/npcs/basic/sheet-v2.png", frameWidth: 160, frameHeight: 160, frameCount: 6, fps: 1, loop: false }
      ,"npc.shop": { src: "assets/art/npcs/basic/sheet-v2.png", frameWidth: 160, frameHeight: 160, frameCount: 6, fps: 1, loop: false }
      ,"npc.princess": { src: "assets/art/npcs/basic/sheet-v2.png", frameWidth: 160, frameHeight: 160, frameCount: 6, fps: 1, loop: false }
    },
    fallback: {
      "hero.walk": "legacy.hero", "monster.1.idle": "legacy.monster", "monster.2.idle": "legacy.monster", "monster.9.idle": "legacy.monster", "monster.3.idle": "legacy.monster", "monster.4.idle": "legacy.monster", "monster.5.idle": "legacy.monster", "monster.6.idle": "legacy.monster", "tile.floor": "legacy.floor", "tile.wall": "legacy.wall",
      "tile.secret": "legacy.wall", "door.yellow": "legacy.door", "door.blue": "legacy.door",
      "door.red": "legacy.door", "stairs.up": "legacy.stairs", "stairs.down": "legacy.stairs",
      "teleporter": "legacy.portal", "key.yellow": "legacy.key", "key.blue": "legacy.key",
      "key.red": "legacy.key", "key.master": "legacy.key", "*": "legacy.sprites"
    }
  };
  const images = new Map();
  const loadedImages = new Map();
  const failures = new Set();
  let previewOnly = false;
  try { previewOnly = new URLSearchParams(location.search).get('artPreview') === '1'; } catch (_) {}

  function previewTile(ctx, id, x, y, w, h, frame) {
    if (!previewOnly) return false;
    const def = manifest.assets[id];
    if (!def || failures.has(id)) {
      ctx.save();
      ctx.fillStyle = '#341f4f'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#d98cff'; ctx.lineWidth = Math.max(1, w * 0.04);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
      ctx.restore();
      return true;
    }
    draw(ctx, id, x, y, w, h, frame);
    return true;
  }

  function configure(data) {
    if (!data) return;
    Object.assign(manifest, data);
  }

  function load(id) {
    const def = manifest.assets[id];
    if (!def || failures.has(id)) return Promise.resolve(null);
    if (images.has(id)) return images.get(id);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { loadedImages.set(id, img); resolve(img); };
      img.onerror = () => { failures.add(id); resolve(null); };
      img.src = def.src;
    });
    images.set(id, p);
    return p;
  }

  function draw(ctx, id, x, y, w, h, frame) {
    const def = manifest.assets[id];
    if (!def || failures.has(id)) return false;
    const img = loadedImages.get(id);
    if (!img) { load(id); return false; }
    if (!ctx || !ctx.canvas) return false;
    const cols = Math.max(1, Math.floor(img.naturalWidth / def.frameWidth));
    const f = Math.max(0, Math.min((def.frameCount || 1) - 1, frame || 0));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, (f % cols) * def.frameWidth, Math.floor(f / cols) * def.frameHeight,
      def.frameWidth, def.frameHeight, x, y, w, h);
    ctx.restore();
    return true;
  }

  function frame(id, state, now) {
    const def = manifest.assets[id];
    if (!def) return 0;
    const fps = def.fps || 8;
    return def.loop === false ? 0 : Math.floor((now || performance.now()) / (1000 / fps)) % (def.frameCount || 1);
  }

  const animationStates = new Map();
  function createAnimation(id, state) {
    const key = id + ':' + state;
    if (!animationStates.has(key)) animationStates.set(key, { id, state, started: performance.now(), playing: true });
    return animationStates.get(key);
  }
  function animationFrame(id, state, now) {
    const a = createAnimation(id, state);
    return frame(id + '.' + state, state, now - a.started);
  }
  function stopAnimation(id, state) {
    const a = animationStates.get(id + ':' + state);
    if (a) a.playing = false;
  }

  function resolve(id) {
    return manifest.assets[id] ? id : (manifest.fallback[id] || manifest.fallback['*'] || null);
  }

  // LayerRenderer 先作为命令队列存在，保持当前单 Canvas 绘制结果不变。
  function LayerRenderer(ctx) { this.ctx = ctx; this.layers = []; }
  LayerRenderer.prototype.add = function (layer, drawFn) { this.layers.push({ layer, drawFn }); };
  LayerRenderer.prototype.flush = function () {
    this.layers.sort((a, b) => a.layer - b.layer).forEach((x) => x.drawFn(this.ctx));
    this.layers.length = 0;
  };

  MT.Art = {
    configure, load, draw, frame, resolve, failures,
    SpriteManager: { configure, load, draw, resolve },
    AnimationManager: { frame, create: createAnimation, animationFrame, stop: stopAnimation },
    LayerRenderer,
    Fallback: function (primary, legacy) { return primary || legacy; },
    manifest, previewOnly, previewTile
  };
})();
