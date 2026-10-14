/* 矿车双向连接（V0.6 规则表 §3；设计规格 §36 / §37）：
 *   - 车站 ↔ 深处巷道 双向可乘坐；两格都挖开后连接即生效；
 *   - 免费、跳过沿途矿物（跨过的岩块保持未挖；落点由生成器保证无矿物）；
 *   - 「返回入口」的自动寻路可以经过该连接（连接段按乘坐处理）。
 * 说明：本模块只描述"连接在哪里、是否可用、如何乘坐"，具体动画与提示在 Movement / Mode / UI。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  const same = (c, t) => !!c && !!t && c.x === t.x && c.y === t.y;

  const Cart = {
    /* 车站与目的地的格子对象（生成期写入 map.plan） */
    pair(map) {
      const p = map && map.plan;
      if (!p || !p.minecart || !p.minecartDest) return null;
      const a = map.get(p.minecart.x, p.minecart.y);
      const b = map.get(p.minecartDest.x, p.minecartDest.y);
      if (!a || !b) return null;
      return { station: a, stop: b };
    },

    /* 连接生效条件：两端都已挖开 */
    usable(map) {
      const p = this.pair(map);
      return !!(p && p.station.excavated && p.stop.excavated);
    },

    linksOf(map) {
      const p = this.pair(map);
      return this.usable(map) ? [[p.station, p.stop]] : [];
    },

    /* 这一步是不是"矿车连接"（用于自动寻路中的乘坐段） */
    isLinkStep(map, from, to) {
      const p = this.pair(map);
      if (!p || !this.usable(map)) return false;
      return (same(from, p.station) && same(to, p.stop)) || (same(from, p.stop) && same(to, p.station));
    },

    /* 给定所在端点，返回对端 */
    partnerOf(map, cell) {
      const p = this.pair(map);
      if (!p || !cell) return null;
      if (same(cell, p.station)) return p.stop;
      if (same(cell, p.stop)) return p.station;
      return null;
    },

    /* 目的地首次挖开后标记为"可乘车站点"（可点击返回车站） */
    ensureStop(map) {
      const p = this.pair(map);
      if (p && p.station.excavated && p.stop.excavated && !p.stop.specialType) {
        p.stop.specialType = 'cartStop';
        return true;
      }
      return false;
    },

    /* V0.7.1：把"跳过的代价"变成看得见的数字——
     * 计算"如果沿最短路径自己挖过去"，轨道两端之间还有哪些未挖的矿物格。
     * 只统计当前地图状态（已经挖开/已经拿到的矿物不再计入），供矿车弹窗与地图高亮使用。 */
    skippedInfo(map) {
      const p = this.pair(map);
      if (!p) return null;
      const an = MM.Pathfinder.analyze(map, { x: p.station.x, y: p.station.y });
      const path = an.pathTo(p.stop.x, p.stop.y);
      if (!path) return { cells: [], count: 0, value: 0 };
      const cells = [];
      let value = 0;
      path.forEach((pt) => {
        const c = map.get(pt.x, pt.y);
        if (!c || c.excavated || !c.resourceType) return;
        cells.push({ x: c.x, y: c.y });
        value += MM.Resources.value(c.resourceType);
      });
      return { cells, count: cells.length, value };
    },

    /* 乘坐：把玩家移动到对端；对端未挖开时先挖开（落点无矿物） */
    ride(run, map, fromCell) {
      const to = this.partnerOf(map, fromCell);
      if (!to) return { ok: false, reason: 'noLink' };
      const events = [];
      if (!to.excavated) {
        const res = MM.Dig.excavate(run, map, to, 'cart');
        events.push.apply(events, res.events);
      }
      const fromDepth = run.playerY;
      run.playerX = to.x;
      run.playerY = to.y;
      run.currentDepth = to.y;
      if (to.y > run.maxDepthReached) run.maxDepthReached = to.y;
      MM.Vision.revealAround(map, to.x, to.y, MM.Vision.radius(run));
      run.stats.cartRides = (run.stats.cartRides || 0) + 1;
      this.ensureStop(map);
      return { ok: true, to, fromDepth, events };
    },
  };

  MM.Cart = Cart;
})();
