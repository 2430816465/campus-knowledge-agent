/* 美术资源清单（阶段四 / §51）
 *
 * 怪物素材直接复用《再上一层》主项目 `assets/art/monsters/<名字>/remade/idle-clean.png`
 * （已拷进本工程的 assets/monsters/，只读来源，没有改主项目任何文件）。
 * 英雄是程序化像素小人（src/ui/heroSprites.js），不需要图片。
 *
 * 每项：
 *   file        相对 index.html 的路径
 *   heightRatio 绘制高度 = 怪物 size × heightRatio
 *   bob         待机上下浮动幅度（px）
 *   frames      当前资源图集中的连续动画帧（帧索引按行优先）
 *   horizontalFacing 原行走图的水平朝向；相反方向由绘制器镜像
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.ASSET_MANIFEST = {
    version: '0.4.0',
    /* 以下地形、界面图标和环境装饰直接取自正式主游戏《遗忘之塔》。
     * 资源在塔防副本内保存，运行时不依赖桌面主项目的绝对路径。 */
    sharedSprites: {
      'ui.backdrop': 'assets/forgotten-tower/ui/lower-scene.png',
      'ui.hud': 'assets/forgotten-tower/ui/hud-icons.png',
      'ui.nav': 'assets/forgotten-tower/ui/nav-icons.png',
      'tile.floor': 'assets/forgotten-tower/tiles/floor-seamless.png',
      'tile.wall': 'assets/forgotten-tower/tiles/wall-clean-small.png',
      'tile.environment': 'assets/forgotten-tower/tiles/environment-sheet.png',
      'tile.portal': 'assets/forgotten-tower/tiles/stairs-portal.png',
      'item.basic': 'assets/forgotten-tower/items/basic.png',
    },
    monsterSprites: {
      grunt:  { file: 'assets/monsters/skeleton.png', walkFile: 'assets/monsters/skeleton/walk/sheet-transparent.png',
        northWalkFile: 'assets/monsters/skeleton/walk-north/sheet-transparent.png',
        heightRatio: 1.55, bob: 0.5, horizontalFacing: 'west', frameWidth: 128, frameHeight: 128,
        columns: 4, walkFrames: Array.from({ length: 16 }, function (_, i) { return i; }), walkCycleDistance: 64 },
      hound:  { file: 'assets/monsters/bat_walk_atlas.png', heightRatio: 1.60, bob: 1.8, fly: true,
        northWalkFile: 'assets/monsters/bat/walk-north/sheet-transparent.png', northColumns: 2,
        northWalkFrames: [0, 1, 2, 3], frameWidth: 128, frameHeight: 128, columns: 4, frames: [0, 1, 2, 3], fps: 14 },
      elite:  { file: 'assets/monsters/guard_mid.png', walkFile: 'assets/monsters/guard_mid/walk/sheet-transparent.png',
        northWalkFile: 'assets/monsters/guard_mid/walk-north/sheet-transparent.png',
        heightRatio: 1.50, bob: 0.4, horizontalFacing: 'west', frameWidth: 128, frameHeight: 128,
        columns: 4, walkFrames: Array.from({ length: 16 }, function (_, i) { return i; }), walkCycleDistance: 64 },
      boss:   { file: 'assets/monsters/knight_black.png', walkFile: 'assets/monsters/knight_black/walk/sheet-transparent.png',
        northWalkFile: 'assets/monsters/knight_black/walk-north/sheet-transparent.png',
        heightRatio: 1.42, bob: 0.5, horizontalFacing: 'east', frameWidth: 128, frameHeight: 128,
        columns: 4, walkFrames: Array.from({ length: 16 }, function (_, i) { return i; }), walkCycleDistance: 64 },
    },
  };
})();
