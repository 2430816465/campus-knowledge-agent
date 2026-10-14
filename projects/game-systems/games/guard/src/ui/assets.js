/* 图片资源加载（阶段四 / §51）
 *
 * - 加载主游戏复用的怪物、地形、场景背景与界面图标
 * - 加载失败 / 环境不支持（例如无头 Node 测试）→ 自动回退成旧的色块绘制，
 *   游戏逻辑与测试完全不依赖美术资源是否到位。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const images = {};
  const state = { total: 0, loaded: 0, failed: [], revision: 0 };

  /* 资源根目录：按本脚本自身的位置解析，
   * 这样从 index.html（根目录）或 tools/qa-view.html（子目录）打开都能找到素材。 */
  let baseUrl = '';
  try {
    const me = document.currentScript;
    if (me && me.src) baseUrl = me.src.replace(/src\/ui\/assets\.js.*$/, '');
  } catch (e) { /* 无 DOM 环境 */ }

  function resolve(file) {
    if (!baseUrl) return file;
    return baseUrl + String(file).replace(/^\.?\//, '');
  }

  function conf(id) {
    const list = (TD.ASSET_MANIFEST && TD.ASSET_MANIFEST.monsterSprites) || {};
    return list[id] || null;
  }

  const Assets = {
    state: state,

    /* 预加载全部怪物素材；无论成功失败都会回调 */
    loadAll(cb) {
      const monsters = (TD.ASSET_MANIFEST && TD.ASSET_MANIFEST.monsterSprites) || {};
      const shared = (TD.ASSET_MANIFEST && TD.ASSET_MANIFEST.sharedSprites) || {};
      const sources = [];
      Object.keys(monsters).forEach(function (id) {
        sources.push([id, monsters[id].file]);
        if (monsters[id].walkFile) sources.push([id + '.walk', monsters[id].walkFile]);
        if (monsters[id].northWalkFile) sources.push([id + '.walk.north', monsters[id].northWalkFile]);
      });
      Object.keys(shared).forEach(function (id) { sources.push([id, shared[id]]); });
      const ids = sources.map(function (entry) { return entry[0]; });
      state.total = ids.length;
      if (typeof Image !== 'function') {          // 无 DOM 环境（Node 测试）
        state.failed = ids.slice();
        state.loaded = ids.length;
        if (cb) cb();
        return;
      }
      let done = 0;
      const finish = function () {
        done += 1;
        state.loaded = done;
        if (done >= ids.length && cb) cb();
      };
      sources.forEach(function (entry) {
        const id = entry[0];
        const img = new Image();
        img.onload = function () { images[id] = img; state.revision += 1; finish(); };
        img.onerror = function () { state.failed.push(id); finish(); };
        img.src = resolve(entry[1]);
      });
    },

    baseUrl: baseUrl,
    resolve: resolve,

    get(monsterId) { return images[monsterId] || null; },
    has(monsterId) { return !!images[monsterId]; },
    shared(id) { return images[id] || null; },

    /* 画一只怪；没有素材时返回 false（调用方回退色块） */
    drawMonster(ctx, monsterId, cx, cy, size, opts) {
      const baseImg = images[monsterId];
      const c = conf(monsterId);
      if (!baseImg || !c) return false;
      const o = opts || {};
      const moving = o.motionWeight == null ? 1 : Math.max(0, Math.min(1, o.motionWeight));
      const direction = o.direction || (o.facing === -1 ? 'west' : 'east');
      const northImg = c.northWalkFile ? images[monsterId + '.walk.north'] : null;
      const useNorth = direction === 'north' && !!northImg;
      const walkImg = c.walkFile ? images[monsterId + '.walk'] : null;
      const useWalk = useNorth || (!!walkImg && moving > 0.01);
      const img = useNorth ? northImg : (useWalk ? walkImg : baseImg);
      const h = size * (c.heightRatio || 1.5);
      const frames = useNorth ? (c.northWalkFrames || c.walkFrames || c.frames)
        : (useWalk ? (c.walkFrames || c.frames) : c.frames);
      const columns = useNorth ? (c.northColumns || c.columns || 1) : (c.columns || 1);
      const frameW = c.frameWidth || (frames ? 128 : img.width);
      const frameH = c.frameHeight || (frames ? 128 : img.height);
      const w = h * (frameW / Math.max(1, frameH));
      const phase = o.walkPhase || 0;
      const seed = o.seed || 0;
      const gait = Math.sin(phase);
      const gaitBob = c.gaitBob == null ? (useWalk ? 1.15 : 3.2) : c.gaitBob;
      const gaitSway = c.gaitSway == null ? (useWalk ? 0.018 : 0.045) : c.gaitSway;
      const bounce = o.fly
        ? Math.sin((o.time || 0) * 8 + seed) * (c.bob || 1.8)
        : Math.sin(phase * 2 + seed) * Math.min(size * 0.075, gaitBob) * moving
          + Math.sin((o.time || 0) * 2.5 + seed) * (c.bob || 0.45) * (1 - moving);
      const bodySway = o.fly ? Math.sin((o.time || 0) * 4 + seed) * 0.025
        : gait * gaitSway * moving;
      const hitK = Math.max(0, Math.min(1, (o.hitT || 0) / 0.16));
      const recoil = hitK * hitK * (3 - 2 * hitK);

      /* 贴地阴影让脚步和飞行高度更容易读；颜色、边缘保持克制，不叠发光圈。 */
      ctx.save();
      ctx.globalAlpha = o.fly ? 0.18 : 0.20;
      ctx.fillStyle = '#080b12';
      ctx.beginPath();
      ctx.ellipse(cx, cy + (o.fly ? size * 0.42 : h * 0.34), size * (o.fly ? 0.25 : 0.30),
        Math.max(2, size * (o.fly ? 0.065 : 0.085)) * (1 - Math.abs(bounce) * 0.035), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(cx + gait * size * 0.018 * moving + (o.facing || 1) * recoil * size * 0.035,
        cy + bounce - recoil * size * 0.025);
      /* 每类原图朝向不同；水平反向移动时镜像，保持头脸朝向终点。 */
      if (c.horizontalFacing && (direction === 'east' || direction === 'west')
          && direction !== c.horizontalFacing) ctx.scale(-1, 1);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      if (o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale);
      ctx.rotate(bodySway + (o.facing || 1) * recoil * 0.035);
      const squash = 1 - Math.abs(Math.sin(phase * 2)) * (useWalk ? 0.012 : 0.035) * moving;
      ctx.scale(1 + gait * 0.022 * moving, squash);
      ctx.imageSmoothingEnabled = false;
      const frameList = frames || [0];
      const framePosition = useWalk && !c.fly
        ? Math.floor((o.walkDist || 0) / (c.northWalkCycleDistance || c.walkCycleDistance || 64) * frameList.length)
        : Math.floor((o.time || 0) * (c.fps || 8));
      const frameIndex = frames ? frameList[framePosition % frameList.length] : 0;
      const sx = frames ? (frameIndex % columns) * frameW : 0;
      const sy = frames ? Math.floor(frameIndex / columns) * frameH : 0;
      ctx.drawImage(img, sx, sy, frameW, frameH, -w / 2, -h * 0.62, w, h);
      if (recoil > 0.01) {
        ctx.globalAlpha *= 0.34 * recoil;
        ctx.filter = 'brightness(1.8) saturate(0.55)';
        ctx.drawImage(img, sx, sy, frameW, frameH, -w / 2, -h * 0.62, w, h);
      }
      ctx.restore();
      return true;
    },
  };

  TD.Assets = Assets;
})();
