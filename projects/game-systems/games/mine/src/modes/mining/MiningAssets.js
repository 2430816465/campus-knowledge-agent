/* 矿坑模式素材加载与像素帧取样。所有绘制坐标仍由 MiningArt / MiningUI 管理。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const paths = {
    miner: 'assets/mining/characters/miner/sheet-transparent.png',
    'miner-walk': 'assets/mining/characters/miner-walk-v2/sheet-transparent.png',
    'miner-dig': 'assets/mining/characters/miner-dig/sheet-transparent.png',
    icons: 'assets/mining/icons/sheet-transparent.png',
    'mine-entrance': 'assets/mining/scenes/mine-entrance-v1.png',
    relics: 'assets/mining/icons/relics-v09.png',
    relicsLocked: 'assets/mining/icons/relics-silhouette-v09.png',
    upgrades: 'assets/mining/icons/upgrades-v09.png',
    'dirt-a': 'assets/mining/tiles/dirt-a.png',
    'dirt-b': 'assets/mining/tiles/dirt-b.png',
    'rock-a': 'assets/mining/tiles/rock-a.png',
    'rock-b': 'assets/mining/tiles/rock-b.png',
    'hard-a': 'assets/mining/tiles/hard-a.png',
    'hard-b': 'assets/mining/tiles/hard-b.png',
    'hard-c': 'assets/mining/tiles/hard-c.png',
    'vault-wall': 'assets/mining/tiles/vault-wall-a.png',
    'floor-a': 'assets/mining/tiles/floor-a.png',
    'floor-b': 'assets/mining/tiles/floor-b.png',
    'floor-c': 'assets/mining/tiles/floor-c.png',
    'floor-d': 'assets/mining/tiles/floor-d.png',
    masonry: 'assets/mining/tiles/masonry-a.png',
  };
  const images = {};
  const upgradeFrames = {
    chainPick: 1,
    directionalBomb: 2,
    prospectingLens: 3,
    hardRockDrill: 4,
    recoveryKit: 5,
    afterglowWick: 6,
  };
  let loading = null;

  function ready(img) {
    return !!img && !!(img.complete ? img.naturalWidth : img.width);
  }

  const Assets = {
    loadAll() {
      if (loading) return loading;
      if (typeof document === 'undefined') return Promise.resolve(false);
      const keys = Object.keys(paths);
      loading = Promise.all(keys.map((key) => new Promise((resolve) => {
        const img = document.createElement('img');
        img.onload = () => resolve(true);
        img.onerror = () => { console.warn('[MiningAssets] 素材加载失败：' + paths[key]); resolve(false); };
        img.src = paths[key];
        images[key] = img;
      }))).then((results) => results.every(Boolean));
      return loading;
    },

    drawTile(ctx, key, x, y, size, alpha) {
      const img = images[key];
      if (!ready(img)) return false;
      if (alpha == null || alpha >= 1) {
        ctx.drawImage(img, Math.round(x), Math.round(y), size, size);
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, Math.round(x), Math.round(y), size, size);
        ctx.restore();
      }
      return true;
    },

    drawMineEntrance(ctx, x, y, w, h) {
      const img = images['mine-entrance'];
      if (!ready(img)) return false;
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const sw = w / scale, sh = h / scale;
      const sx = Math.max(0, (img.naturalWidth - sw) / 2);
      const sy = Math.max(0, (img.naturalHeight - sh) / 2);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, sx, sy, Math.min(sw, img.naturalWidth), Math.min(sh, img.naturalHeight), x, y, w, h);
      ctx.restore();
      return true;
    },

    drawIcon(ctx, frame, x, y, size, alpha) {
      const img = images.icons;
      if (!ready(img)) return false;
      const i = Math.max(1, Math.min(9, frame | 0)) - 1;
      ctx.save();
      if (alpha != null) ctx.globalAlpha *= alpha;
      ctx.drawImage(img, (i % 3) * 128, Math.floor(i / 3) * 128, 128, 128,
        Math.round(x), Math.round(y), size, size);
      ctx.restore();
      return true;
    },

    drawUpgradeIcon(ctx, id, x, y, size, alpha) {
      const img = images.upgrades;
      const frame = upgradeFrames[id];
      if (!ready(img) || !frame) return false;
      const i = frame - 1;
      ctx.save();
      if (alpha != null) ctx.globalAlpha *= alpha;
      ctx.drawImage(img, (i % 3) * 128, Math.floor(i / 3) * 128, 128, 128,
        Math.round(x), Math.round(y), size, size);
      ctx.restore();
      return true;
    },

    drawRelicIcon(ctx, index, x, y, size, locked, alpha) {
      const img = images[locked ? 'relicsLocked' : 'relics'];
      const i = Math.max(1, Math.min(6, index | 0)) - 1;
      if (!ready(img)) return false;
      ctx.save();
      if (alpha != null) ctx.globalAlpha *= alpha;
      ctx.drawImage(img, (i % 3) * 128, Math.floor(i / 3) * 128, 128, 128,
        Math.round(x), Math.round(y), size, size);
      ctx.restore();
      return true;
    },

    drawMiner(ctx, facing, frame, x, y, size, digging) {
      const digSheet = images['miner-dig'];
      const img = digging && ready(digSheet) ? digSheet : ready(images['miner-walk']) ? images['miner-walk'] : images.miner;
      if (!ready(img)) return false;
      const row = ({ down: 0, left: 1, right: 2, up: 3 })[facing] || 0;
      const col = Math.max(0, Math.min(3, frame | 0));
      ctx.drawImage(img, col * 128, row * 128, 128, 128,
        Math.round(x), Math.round(y), size, size);
      return true;
    },

    isReady(key) { return ready(images[key]); },
  };

  MM.Assets = Assets;
})();
