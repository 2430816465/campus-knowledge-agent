/* 再挖一层 · 地下矿坑 V0.1 · 命名空间
 *
 * 全部代码挂在 window.MT 下（与《再上一层》主项目同一命名空间风格），
 * 地下矿坑自身的东西全部收在 MT.MM 里：
 *   - 不读写主模式状态（G / hero / floor / gold ...）
 *   - 不读写主模式真实存档（forgotten-tower.original50.v1 等）
 *   - 通用内容货币通过账号级 metaProgress 结构共享（设计规格 §46 / §70）
 */
(function () {
  const MT = (window.MT = window.MT || {});
  const MM = (MT.MM = MT.MM || {});
  MM.VERSION = '1.0.0';
  MM.MODE_NAME = '地下矿坑';
})();



