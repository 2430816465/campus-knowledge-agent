/* 地图数据层（设计规格 §6）：
 * 每格保存 { x, y, terrainType, digCost, revealed, excavated, resourceType,
 *           resourceValue, roomId, specialType, clueType }
 * 地图逻辑与显示逻辑分离：渲染只读数据，绝不通过 Sprite 状态反推地图数据。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  function createCell(x, y) {
    return {
      x, y,

      terrainType: 'rock',
      digCost: 2,

      revealed: false,      // §16：一旦揭示，本局永久已知
      excavated: false,     // §10：已挖开

      resourceType: null,
      resourceValue: 0,

      roomId: null,
      specialType: null,
      clueType: null,       // §31：水迹 / 木板 / 微弱金光……

      resourceGranted: false,  // §78⑦⑧：保证矿物只结算一次
      specialGranted: false,   // 泉 / 宝箱只触发一次
    };
  }

  function MineMap(w, h, spec) {
    this.w = w;
    this.h = h;
    /* 地图预设（尺寸 / 矿物池 / 验证阈值）：V0.2 起 9×20 与 9×45 共用这一套模块 */
    this.spec = spec || {
      id: 'custom',
      name: '自定义地图',
      short: w + '×' + h,
      WIDTH: w, DEPTH: h, DEPTH_LABEL: h - 1,
      resourcePool: MM.RESOURCE_ORDER.slice(),
      validator: MM.mapSpec().validator,
    };
    this.seed = null;
    this.baseSeed = null;
    this.attempt = 1;

    this.entrance = { x: 4, y: 0 };
    this.vault = null;              // { x, y }：藏宝库入口
    this.rooms = {};                // roomId -> 摆放信息（含线索格）
    this.mainRoutePath = [];        // 隐藏主路线（调试可显示，§77）
    this.mainRouteSet = new Set();

    this.cells = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) this.cells.push(createCell(x, y));
    }
  }

  MineMap.prototype.inBounds = function (x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  };

  MineMap.prototype.get = function (x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.cells[y * this.w + x];
  };

  MineMap.prototype.forEach = function (fn) {
    for (let i = 0; i < this.cells.length; i++) fn(this.cells[i], i);
  };

  MineMap.prototype.count = function (pred) {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) if (pred(this.cells[i])) n++;
    return n;
  };

  MineMap.prototype.isMainRoute = function (x, y) {
    return this.mainRouteSet.has(x + ',' + y);
  };

  MineMap.prototype.roomCells = function (roomId) {
    return this.cells.filter((c) => c.roomId === roomId);
  };

  /* 地图摘要：同 Seed 复现测试用（§78㉒），只包含数据层字段 */
  MineMap.prototype.digest = function () {
    let s = '';
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const t = MM.TERRAIN_ORDER.indexOf(c.terrainType);
      const r = c.resourceType ? MM.RESOURCE_ORDER.indexOf(c.resourceType) + 1 : 0;
      s += t + '' + r + (c.specialType ? 'S' : '.') + (c.clueType ? 'C' : '.') + (c.roomId ? 'R' : '.') + '|';
    }
    return s;
  };

  /* 深拷贝（P3 模拟器用）：只复制数据层，不共享任何引用 */
  MineMap.prototype.clone = function () {
    const m = new MineMap(this.w, this.h, this.spec);
    m.seed = this.seed;
    m.baseSeed = this.baseSeed;
    m.attempt = this.attempt;
    m.validated = this.validated;
    m.entrance = { x: this.entrance.x, y: this.entrance.y };
    m.vault = this.vault ? { x: this.vault.x, y: this.vault.y } : null;
    for (let i = 0; i < this.cells.length; i++) {
      const src = this.cells[i], dst = m.cells[i];
      for (const k in src) dst[k] = src[k];
    }
    m.mainRoutePath = this.mainRoutePath.map((c) => ({ x: c.x, y: c.y }));
    m.mainRouteSet = new Set(this.mainRouteSet);
    m.hintTrail = (this.hintTrail || []).map((c) => ({ x: c.x, y: c.y }));
    m.branches = (this.branches || []).map((b) => ({
      tier: b.tier,
      junction: { x: b.junction.x, y: b.junction.y },
      cells: (b.cells || []).map((c) => ({ x: c.x, y: c.y })),
      clue: b.clue ? { x: b.clue.x, y: b.clue.y } : null,
      approxCost: b.approxCost,
      approxValue: b.approxValue,
      reward: b.reward ? { kind: b.reward.kind, approx: b.reward.approx } : null,
    }));
    m.plan = this.plan ? JSON.parse(JSON.stringify(this.plan)) : null;
    m.workbench = this.workbench ? { x: this.workbench.x, y: this.workbench.y } : null;
    m.workbenches = JSON.parse(JSON.stringify(this.workbenches || (m.workbench ? [m.workbench] : [])));
    m.gate = this.gate ? JSON.parse(JSON.stringify(this.gate)) : null;
    m.resonanceStones = JSON.parse(JSON.stringify(this.resonanceStones || []));
    m.generationOptions = JSON.parse(JSON.stringify(this.generationOptions || {}));
    m.rooms = {};
    Object.keys(this.rooms || {}).forEach((id) => {
      m.rooms[id] = JSON.parse(JSON.stringify(this.rooms[id]));
    });
    return m;
  };

  MM.MineMap = MineMap;
  MM.createCell = createCell;
})();
