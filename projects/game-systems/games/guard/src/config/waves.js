/* 波次配置（阶段三 / §13 / §50）。
 *
 * 20 个正式防守波 + 1 个 Boss 挑战波，节奏按 §13：
 *   1~4   建立阵容（数量少、血量低）
 *   5     第一次精英压力节点
 *   6~9   数量 + 血量 + 移速（蝙蝠）组合
 *   10    第二次精英压力节点
 *   11~14 2★/3★ 主力成型期
 *   15    第三次精英压力节点
 *   16~19 阵容成型、大量怪物、清场爽感
 *   20    最终波：大量普通怪 + 多只精英怪（不是 Boss）
 *   21    只有 1 只 Boss（血量按地图在 maps.js 的 bossHp 里配置）
 *
 * 五张地图共用这一套怪物数值标准（§4）；地图之间的难度差由
 * maps.js 里的 speedScale 与 bossHp 按路线长度补偿；普通波数量保持一致。
 * 第 11 波之后的血量是按平衡模拟结果整体放大的（见 tools/balance-sim.js）。
 * entries[].gap     = 同一组怪物的出现间隔（秒）
 * entries[].leadIn  = 这一组相对于上一组的入场延迟（秒）
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.WAVES = {
    version: '0.1-test',
    normal: [
      {
        index: 1, title: '第 1 波',
        entries: [
          { monster: 'grunt', hp: 30, speed: 55, count: 6, gap: 0.90 },
        ],
      },
      {
        index: 2, title: '第 2 波',
        entries: [
          { monster: 'grunt', hp: 32, speed: 56, count: 7, gap: 0.85 },
        ],
      },
      {
        index: 3, title: '第 3 波',
        entries: [
          { monster: 'grunt', hp: 35, speed: 57, count: 8, gap: 0.80 },
        ],
      },
      {
        index: 4, title: '第 4 波',
        entries: [
          { monster: 'grunt', hp: 40, speed: 58, count: 9, gap: 0.80 },
        ],
      },
      {
        index: 5, title: '第 5 波 · 精英节点',
        entries: [
          { monster: 'grunt', hp: 45, speed: 58, count: 8, gap: 0.80 },
          { monster: 'elite', hp: 200, speed: 44, count: 1, gap: 1.0, leadIn: 3.0 },
        ],
      },
      {
        index: 6, title: '第 6 波',
        entries: [
          { monster: 'grunt', hp: 50, speed: 60, count: 9, gap: 0.75 },
          { monster: 'hound', hp: 30, speed: 85, count: 3, gap: 0.60, leadIn: 4.0 },
        ],
      },
      {
        index: 7, title: '第 7 波',
        entries: [
          { monster: 'grunt', hp: 55, speed: 60, count: 10, gap: 0.75 },
          { monster: 'hound', hp: 32, speed: 85, count: 4, gap: 0.60, leadIn: 4.0 },
        ],
      },
      {
        index: 8, title: '第 8 波',
        entries: [
          { monster: 'grunt', hp: 60, speed: 62, count: 10, gap: 0.60 },
          { monster: 'hound', hp: 34, speed: 86, count: 3, gap: 0.48, leadIn: 3.0 },
          { monster: 'elite', hp: 230, speed: 44, count: 1, gap: 0.80, leadIn: 5.0 },
        ],
      },
      {
        index: 9, title: '第 9 波',
        entries: [
          { monster: 'grunt', hp: 65, speed: 62, count: 11, gap: 0.58 },
          { monster: 'hound', hp: 36, speed: 86, count: 4, gap: 0.48, leadIn: 3.0 },
          { monster: 'elite', hp: 240, speed: 44, count: 1, gap: 0.80, leadIn: 6.0 },
        ],
      },
      {
        index: 10, title: '第 10 波 · 精英节点',
        entries: [
          { monster: 'grunt', hp: 70, speed: 62, count: 12, gap: 0.56 },
          { monster: 'elite', hp: 260, speed: 44, count: 2, gap: 1.12, leadIn: 4.0 },
        ],
      },
      {
        index: 11, title: '第 11 波',
        entries: [
          { monster: 'grunt', hp: 151, speed: 64, count: 12, gap: 0.56 },
          { monster: 'hound', hp: 77, speed: 88, count: 4, gap: 0.48, leadIn: 3.0 },
          { monster: 'elite', hp: 541, speed: 45, count: 1, gap: 0.80, leadIn: 6.0 },
        ],
      },
      {
        index: 12, title: '第 12 波',
        entries: [
          { monster: 'grunt', hp: 165, speed: 64, count: 13, gap: 0.54 },
          { monster: 'hound', hp: 81, speed: 88, count: 5, gap: 0.48, leadIn: 3.0 },
          { monster: 'elite', hp: 580, speed: 45, count: 1, gap: 0.80, leadIn: 6.0 },
        ],
      },
      {
        index: 13, title: '第 13 波',
        entries: [
          { monster: 'grunt', hp: 174, speed: 66, count: 14, gap: 0.53 },
          { monster: 'hound', hp: 85, speed: 88, count: 5, gap: 0.48, leadIn: 3.0 },
          { monster: 'elite', hp: 580, speed: 45, count: 2, gap: 1.12, leadIn: 6.0 },
          { monster: 'hound', hp: 70, speed: 106, count: 2, gap: 0.60, leadIn: 9.0 },
        ],
      },
      {
        index: 14, title: '第 14 波',
        entries: [
          { monster: 'grunt', hp: 190, speed: 66, count: 14, gap: 0.53 },
          { monster: 'hound', hp: 89, speed: 90, count: 6, gap: 0.44, leadIn: 3.0 },
          { monster: 'elite', hp: 618, speed: 45, count: 2, gap: 1.12, leadIn: 6.0 },
        ],
      },
      {
        index: 15, title: '第 15 波 · 精英节点',
        entries: [
          { monster: 'grunt', hp: 203, speed: 66, count: 15, gap: 0.52 },
          { monster: 'hound', hp: 93, speed: 90, count: 6, gap: 0.44, leadIn: 3.0 },
          { monster: 'elite', hp: 657, speed: 46, count: 3, gap: 1.12, leadIn: 6.0 },
          { monster: 'hound', hp: 75, speed: 108, count: 2, gap: 0.60, leadIn: 9.0 },
        ],
      },
      {
        index: 16, title: '第 16 波',
        entries: [
          { monster: 'grunt', hp: 223, speed: 68, count: 16, gap: 0.50 },
          { monster: 'hound', hp: 97, speed: 90, count: 7, gap: 0.44, leadIn: 3.0 },
          { monster: 'elite', hp: 696, speed: 46, count: 3, gap: 1.12, leadIn: 6.0 },
        ],
      },
      {
        index: 17, title: '第 17 波',
        entries: [
          { monster: 'grunt', hp: 242, speed: 68, count: 18, gap: 0.48 },
          { monster: 'hound', hp: 100, speed: 92, count: 8, gap: 0.40, leadIn: 3.0 },
          { monster: 'elite', hp: 734, speed: 46, count: 4, gap: 1.04, leadIn: 6.0 },
          { monster: 'hound', hp: 80, speed: 110, count: 3, gap: 0.55, leadIn: 9.0 },
        ],
      },
      {
        index: 18, title: '第 18 波',
        entries: [
          { monster: 'grunt', hp: 261, speed: 68, count: 20, gap: 0.46 },
          { monster: 'hound', hp: 104, speed: 92, count: 8, gap: 0.40, leadIn: 3.0 },
          { monster: 'elite', hp: 773, speed: 46, count: 4, gap: 1.04, leadIn: 6.0 },
        ],
      },
      {
        index: 19, title: '第 19 波',
        entries: [
          { monster: 'grunt', hp: 290, speed: 70, count: 22, gap: 0.45 },
          { monster: 'hound', hp: 109, speed: 92, count: 9, gap: 0.40, leadIn: 3.0 },
          { monster: 'elite', hp: 811, speed: 47, count: 5, gap: 1.04, leadIn: 6.0 },
          { monster: 'hound', hp: 85, speed: 112, count: 3, gap: 0.55, leadIn: 9.0 },
        ],
      },
      {
        index: 20, title: '第 20 波 · 防守最终波',
        entries: [
          { monster: 'grunt', hp: 319, speed: 70, count: 26, gap: 0.44 },
          { monster: 'hound', hp: 112, speed: 94, count: 10, gap: 0.40, leadIn: 2.0 },
          { monster: 'elite', hp: 869, speed: 47, count: 6, gap: 1.04, leadIn: 5.0 },
        ],
      },
    ],
    boss: {
      index: 'boss', title: 'Boss 挑战波',
      entries: [
        { monster: 'boss', hp: 3000, speed: 34, count: 1, gap: 1.0 },
      ],
    },
  };
})();
