/* 局部视野（设计规格 §15 / §16 / §27）：
 *   - 基础视野：曼哈顿距离 ≤ 3；
 *   - 探矿灯：视野 5，持续"接下来 5 次成功挖掘"（按次数，不按时间）；
 *   - 已揭示区域本局永久保持已知（§16，V0.1 采用"揭开后永久显示"的推荐方案）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  MM.Vision = {
    radius(run) {
      return run.lampDigsRemaining > 0
        ? MM.BALANCE.TOOL.LAMP_VISION
        : MM.BALANCE.BASE_VISION;
    },

    /* 当前是否在"实时可见范围"内（用于高亮 / 特效判断） */
    inView(run, x, y) {
      return MM.U.manhattan(run.playerX, run.playerY, x, y) <= this.radius(run);
    },

    /* 以 (cx, cy) 为中心揭示半径内所有格子，返回本次新揭示的格子列表 */
    revealAround(map, cx, cy, radius) {
      const out = [];
      for (let y = Math.max(0, cy - radius); y <= Math.min(map.h - 1, cy + radius); y++) {
        for (let x = Math.max(0, cx - radius); x <= Math.min(map.w - 1, cx + radius); x++) {
          if (MM.U.manhattan(cx, cy, x, y) > radius) continue;
          const cell = map.get(x, y);

          /* §44 / §81：藏宝室（vault 格）不被普通视野揭示——
           * 入口被挖通后，藏宝室只由"发现演出"逐格点亮（否则贴脸开视野会一眼看光）。 */
          if (cell && cell.specialType === 'vault') continue;

          if (cell && !cell.revealed) {
            cell.revealed = true;
            out.push({ x, y });
          }
        }
      }
      return out;
    },
  };
})();
