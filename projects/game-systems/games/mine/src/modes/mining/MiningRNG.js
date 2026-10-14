/* 确定性随机数（设计规格 §76：同一个 Seed 应尽量生成相同地图）。
 * 用 FNV-1a 散列 + mulberry32，零依赖、可复现，Node 无头测试同样适用。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RNG(seed) {
    this.seed = String(seed);
    this._state = MM.U.hashSeed(this.seed) | 0;
    this.draws = 0;
    this._next = mulberry32(this._state);
  }

  RNG.prototype.next = function () { this.draws++; return this._next(); };
  RNG.prototype.snapshot = function () { return { seed: this.seed, draws: this.draws }; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.nextInt = function (n) { return Math.floor(this.next() * n); };
  RNG.prototype.rangeInt = function (min, max) { return min + Math.floor(this.next() * (max - min + 1)); };
  RNG.prototype.pick = function (list) { return list[Math.floor(this.next() * list.length)]; };

  /* 对象权重随机：{ key: weight } → key */
  RNG.prototype.weighted = function (weights) {
    const keys = Object.keys(weights);
    let total = 0;
    for (let i = 0; i < keys.length; i++) total += weights[keys[i]];
    let r = this.next() * total;
    for (let i = 0; i < keys.length; i++) {
      r -= weights[keys[i]];
      if (r <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  };

  /* 数组权重随机：返回下标 */
  RNG.prototype.weightedIndex = function (weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  };

  RNG.prototype.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  MM.RNG = {
    mulberry32,
    create(seed) { return new RNG(seed); },
    restore(snapshot) {
      const rng = new RNG(snapshot && snapshot.seed || 'restored');
      const count = Math.max(0, Math.floor(Number(snapshot && snapshot.draws) || 0));
      for (let i = 0; i < count; i++) rng.next();
      return rng;
    },
  };

  /* 玩家新开局的随机 Seed（可读、方便口述复现） */
  MM.newSeed = function () {
    const t = Date.now().toString(36).toUpperCase();
    const r = (Math.floor(Math.random() * 46655).toString(36).toUpperCase() + '000').slice(0, 3);
    return 'M' + t.slice(-4) + '-' + r;
  };

  /* 每日挑战标识委托远征系统，包含 UTC 日期和当天轮换矿区。 */
  MM.dailySeed = function (d) {
    if (MM.Expedition && MM.Expedition.daily) return MM.Expedition.daily(d).seed;
    const dt = d || new Date();
    const y = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const date = dt.getUTCDate();
    const m = ('0' + month).slice(-2);
    const day = ('0' + date).slice(-2);
    const mines = ['oldMine', 'resonanceCave', 'clockworkMine'];
    const dayIndex = Math.floor(Date.UTC(y, month - 1, date) / 86400000);
    const mineId = mines[((dayIndex % mines.length) + mines.length) % mines.length];
    return 'EXPEDITION-DAILY-' + y + m + day + '-' + mineId;
  };
})();
