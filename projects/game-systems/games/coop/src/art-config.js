(function () {
  'use strict';
  window.RushArtConfig = {
    root: 'assets/pixel-v3/',
    revision: 'hero-matched-pixel-20261001',
    colors: { cyan: '#7ee4e3', gold: '#ffd27d', stone: '#554234', ink: '#201c1b', text: '#fff2d5' },
    hero: { cell: 80, anchorX: 40, anchorY: 74, fps: 12, run: [0,1,2,3,4,5,6,7], idle: [0], jump: [0,1,2], fall: [3,4], land: [5,6], hurt: [0], landDuration: 140 },
    objectives: ['踩住月纹板，让队友开启远端机关', '上路开下桥，下路再接应上路', '踩盘送队友 → 木箱接替供能 → 共同登顶'],
    help: ['月纹板需持续压住；队友穿门后启动菱纹开关，锁定通路。跳过裂隙后两人共同到达宝箱。', '上路月纹机关控制下桥；下路队友过桥启动菱纹机关，打开上桥。最后在右下方会合。', '圆盘持续受压才有电。先送队友上楼打开月门，再用可推木箱接替压板。靠近升降台互动切换方向。'],
    chapterBackdrops: ['backdrop', 'backdrop', 'backdrop', 'backdrop', 'backdrop'],
    // Visual assets have no authority over collision, switches, movement or rewards.
    files: { ruinStone:'../coop-ruins/stone.svg',pushBox:'../coop-ruins/push-box.svg',breakBox:'../coop-ruins/break-box.svg',pathMover:'../coop-ruins/mover.svg',patrol:'../coop-ruins/patrol.svg',ruinExit:'../coop-ruins/exit.svg', backdrop:'backdrop.png', terrain:'terrain.png', leaf:'leaf.png', bridge:'bridge.png', lift:'lift.png', gate:'gate.png', gateOpen:'gate-open.png', plateSun:'plate-sun.png', plateMoon:'plate-moon.png', lever:'lever-off.png', leverOn:'lever-on.png', runeSun:'rune-sun.png', runeMoon:'rune-moon.png', crystalSun:'crystal-sun.png', crystalMoon:'crystal-moon.png', poolSun:'pool-sun.png', poolMoon:'pool-moon.png', poolPoison:'pool-poison.png', poisonSign:'poison-sign.png', exitSun:'exit-sun.png', exitMoon:'exit-moon.png', checkpoint:'checkpoint.png', crate:'crate.png', chest:'chest.png', run:'../hero-video-modules/ready/run.png', idle:'../hero-video-modules/ready/idle.png', jump:'../hero-video-modules/ready/jump.png', hurt:'../hero-video-modules/ready/idle.png', runGold:'../hero-video-modules/ready/runGold.png', idleGold:'../hero-video-modules/ready/idleGold.png', jumpGold:'../hero-video-modules/ready/jumpGold.png', hurtGold:'../hero-video-modules/ready/idleGold.png' }
  };
})();
