/* 再守一波 · 守塔战线 V0.1 · 命名空间
 *
 * 全部代码挂在 window.MT 下（与《再上一层》主项目同一命名空间风格），
 * 守塔战线自身的东西全部收在 MT.TD 里：
 *   - 不读写主模式状态（G / hero / floor / gold ...）
 *   - 不读写主模式存档（forgotten-tower.original50.v1 等）
 */
(function () {
  const MT = (window.MT = window.MT || {});
  const TD = (MT.TD = MT.TD || {});
  TD.VERSION = '0.4.0';
  TD.MODE_NAME = '守塔战线';
})();
