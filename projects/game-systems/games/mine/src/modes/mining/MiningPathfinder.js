/* 寻路（设计规格 §12 / §20 / §77）：
 *  ① analyze / cheapestPath：带权最短路（未挖格权重 = digCost，已挖格 = 0），
 *     供 Validator 验证"合理探索路线"和调试面板显示"最低成本路径"。
 *  ② bfsExcavated：只经过已挖格的 BFS，供玩家点击远处已挖区域自动寻路——
 *     绝不能自动替玩家挖石头（§12）。
 * 地图只有约 9×45，O(n²) 的 Dijkstra 完全够用，不引入优先队列。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  const P = {
    DIRS4,

    /* 从 start 出发的全图带权最短路分析 */
    analyze(map, start) {
      const n = map.w * map.h;
      const dist = new Array(n).fill(Infinity);
      const prev = new Array(n).fill(-1);
      const done = new Array(n).fill(false);
      const si = start.y * map.w + start.x;
      dist[si] = 0;

      for (let iter = 0; iter < n; iter++) {
        let u = -1, best = Infinity;
        for (let i = 0; i < n; i++) {
          if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
        }
        if (u === -1) break;
        done[u] = true;
        const ux = u % map.w, uy = Math.floor(u / map.w);
        for (let d = 0; d < DIRS4.length; d++) {
          const nx = ux + DIRS4[d][0], ny = uy + DIRS4[d][1];
          if (!map.inBounds(nx, ny)) continue;
          const ni = ny * map.w + nx;
          const cell = map.cells[ni];
          const w = cell.excavated ? 0 : cell.digCost;   // 已挖格免费（§11）
          const nd = dist[u] + w;
          if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = u; }
        }
      }

      const minRow = [], argRow = [];
      for (let y = 0; y < map.h; y++) {
        let m = Infinity, arg = -1;
        for (let x = 0; x < map.w; x++) {
          const i = y * map.w + x;
          if (dist[i] < m) { m = dist[i]; arg = i; }
        }
        minRow.push(m);
        argRow.push(arg);
      }

      return {
        map,
        start: { x: start.x, y: start.y },
        dist, prev, minRow, argRow,
        cost(x, y) { return dist[y * map.w + x]; },
        pathTo(x, y) {
          const i = y * map.w + x;
          if (!isFinite(dist[i])) return null;
          const out = [];
          let cur = i;
          while (cur !== si) {
            out.push({ x: cur % map.w, y: Math.floor(cur / map.w) });
            cur = prev[cur];
            if (cur === -1) return null;
          }
          return out.reverse();     // 含目标格，不含起点
        },
      };
    },

    /* 只走已挖格的 BFS（自动寻路移动用，§12）。返回 {x,y} 数组（不含起点），不可达返回 null */
    bfsExcavated(map, start, goal) {
      const cellGoal = map.get(goal.x, goal.y);
      if (!cellGoal || !cellGoal.excavated) return null;   // 目标必须已挖开
      const si = start.y * map.w + start.x;
      const gi = goal.y * map.w + goal.x;
      if (si === gi) return [];

      /* V0.6：矿车连接也视为一条可走边（两端都已挖开时） */
      const links = (MM.Cart ? MM.Cart.linksOf(map) : []).map((pair) => {
        const a = pair[0], b = pair[1];
        return [a.y * map.w + a.x, b.y * map.w + b.x];
      });

      const prev = new Array(map.w * map.h).fill(-2);
      prev[si] = -1;
      const q = [si];

      const finish = (ni) => {
        const out = [];
        let cur = ni;
        while (cur !== si) {
          out.push({ x: cur % map.w, y: Math.floor(cur / map.w) });
          cur = prev[cur];
        }
        return out.reverse();
      };

      while (q.length) {
        const u = q.shift();
        const ux = u % map.w, uy = Math.floor(u / map.w);
        for (let d = 0; d < DIRS4.length; d++) {
          const nx = ux + DIRS4[d][0], ny = uy + DIRS4[d][1];
          if (!map.inBounds(nx, ny)) continue;
          const ni = ny * map.w + nx;
          if (prev[ni] !== -2) continue;
          const cell = map.cells[ni];
          if (!cell.excavated) continue;                   // 只能经过已挖格
          prev[ni] = u;
          if (ni === gi) return finish(ni);
          q.push(ni);
        }
        for (let l = 0; l < links.length; l++) {
          const a = links[l][0], b = links[l][1];
          let ni = -1;
          if (u === a) ni = b;
          else if (u === b) ni = a;
          else continue;
          if (prev[ni] !== -2) continue;
          prev[ni] = u;
          if (ni === gi) return finish(ni);
          q.push(ni);
        }
      }
      return null;
    },

    /* 玩家能否沿已挖道路回到入口（§49 / §59） */
    canReturnToEntrance(map, run) {
      return !!this.bfsExcavated(map, { x: run.playerX, y: run.playerY }, map.entrance);
    },
  };

  MM.Pathfinder = P;
})();
