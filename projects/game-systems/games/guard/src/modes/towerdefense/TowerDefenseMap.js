/* 地图几何（§40）：把路径点折线做成"按距离查询坐标"的工具。
 *
 * 怪物只有一个进度变量 dist（已走距离 = pathProgress），
 * 英雄索敌（§9）和子弹飞行都用它定位，不做欧氏距离的实时寻路。
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const cache = {};

  TD.MapGeo = {
    of(map) {
      if (cache[map.id]) return cache[map.id];
      const pts = map.path;
      const segs = [];
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = TD.U.dist(a.x, a.y, b.x, b.y) || 1;
        segs.push({
          a: a, b: b, len: len, start: total,
          ux: (b.x - a.x) / len, uy: (b.y - a.y) / len,
        });
        total += len;
      }
      const geo = { segs: segs, total: total };
      cache[map.id] = geo;
      return geo;
    },

    /* 距离路径起点 dist 像素处的坐标 */
    pointAt(map, dist) {
      const geo = this.of(map);
      const d = TD.U.clamp(dist, 0, geo.total);
      for (let i = 0; i < geo.segs.length; i++) {
        const s = geo.segs[i];
        if (d <= s.start + s.len) {
          const t = d - s.start;
          return { x: s.a.x + s.ux * t, y: s.a.y + s.uy * t };
        }
      }
      const last = geo.segs[geo.segs.length - 1];
      return { x: last.b.x, y: last.b.y };
    },

    /* 当前路线段的朝向；在拐点处立即切换到下一段，避免转弯后短暂朝反方向。 */
    directionAt(map, dist) {
      const geo = this.of(map);
      if (!geo.segs.length) return 'east';
      const d = TD.U.clamp(dist, 0, geo.total);
      let seg = geo.segs[geo.segs.length - 1];
      for (let i = 0; i < geo.segs.length; i++) {
        const current = geo.segs[i];
        if (d < current.start + current.len || i === geo.segs.length - 1) {
          seg = current;
          break;
        }
      }
      if (Math.abs(seg.ux) >= Math.abs(seg.uy)) return seg.ux >= 0 ? 'east' : 'west';
      return seg.uy >= 0 ? 'south' : 'north';
    },

    /* Exact portions of the route whose enemy centers are in a hero's range. */
    coverage(map, center, radius) {
      const geo = this.of(map);
      const parts = [];
      let length = 0;
      const r2 = radius * radius;
      for (let i = 0; i < geo.segs.length; i++) {
        const seg = geo.segs[i];
        const dx = center.x - seg.a.x;
        const dy = center.y - seg.a.y;
        const along = dx * seg.ux + dy * seg.uy;
        const perpendicular2 = Math.max(0, dx * dx + dy * dy - along * along);
        if (perpendicular2 > r2) continue;
        const half = Math.sqrt(Math.max(0, r2 - perpendicular2));
        const from = Math.max(0, along - half);
        const to = Math.min(seg.len, along + half);
        if (to <= from) continue;
        const partLength = to - from;
        parts.push({
          a: { x: seg.a.x + seg.ux * from, y: seg.a.y + seg.uy * from },
          b: { x: seg.a.x + seg.ux * to, y: seg.a.y + seg.uy * to },
          length: partLength,
        });
        length += partLength;
      }
      return { parts: parts, length: length };
    },

    length(map) { return this.of(map).total; },
  };
})();
