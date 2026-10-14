/* 输入层：把鼠标 / 触摸统一转成 720×1280 逻辑坐标的事件队列。
 * 场景每帧调用 TD.Input.consume() 取走事件（与主项目一致：只用原生事件，不引第三方库）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const Input = {
    queue: [],
    down: false,
    x: 0,
    y: 0,
    _canvas: null,

    init(canvas) {
      this._canvas = canvas;
      const toLocal = function (e) {
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / (rect.width || 1);
        const sy = canvas.height / (rect.height || 1);
        return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
      };

      const onDown = (e) => {
        if (e.preventDefault) e.preventDefault();
        const p = toLocal(e);
        this.down = true;
        this.x = p.x;
        this.y = p.y;
        this.queue.push({ type: 'down', x: p.x, y: p.y });
        try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (err) {}
      };
      const onMove = (e) => {
        const p = toLocal(e);
        this.x = p.x;
        this.y = p.y;
        this.queue.push({ type: 'move', x: p.x, y: p.y, down: this.down });
      };
      const onUp = (e) => {
        if (e.preventDefault) e.preventDefault();
        const p = toLocal(e);
        this.down = false;
        this.queue.push({ type: 'up', x: p.x, y: p.y });
      };

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    consume() {
      const q = this.queue;
      this.queue = [];
      return q;
    },
  };

  TD.Input = Input;
})();
