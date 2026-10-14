/* 输入层：把鼠标 / 触摸统一转成 720×1280 逻辑坐标的事件队列。
 * 场景每帧调用 MM.Input.consume() 取走事件（与主项目一致：只用原生事件，不引第三方库）。 */
(function () {
  const MT = window.MT || (window.MT = {});
  const MM = (MT.MM = MT.MM || {});

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
        const x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;
        return MM.Game?.mapPointer?MM.Game.mapPointer(x,y):{x,y};
      };

      const onDown = (e) => {
        if(e.isPrimary===false)return;
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
        this.x = p.x;
        this.y = p.y;
        this.queue.push({ type: 'up', x: p.x, y: p.y });
      };

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      const reset=()=>{this.down=false;this.queue=[];};
      canvas.addEventListener('pointercancel', reset);
      canvas.addEventListener('lostpointercapture',()=>{this.down=false;});
      window.addEventListener('blur',reset);
      document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      /* V0.8.3：桌面键盘统一进事件队列（方向键 / WASD / 数字键 / Esc / Enter）。
       * 只转换事件，具体含义由场景决定；触屏与鼠标仍是完整操作路径。 */
      const onKey = (e) => {
        const k = e.key;
        if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' || k === ' ') {
          if (e.preventDefault) e.preventDefault();
        }
        this.queue.push({ type: 'key', key: k });
      };
      window.addEventListener('keydown', onKey);
    },

    consume() {
      const q = this.queue;
      this.queue = [];
      return q;
    },

    /* 无头测试 / 自动演示用：直接注入一个点击事件 */
    push(ev) { this.queue.push(ev); },
  };

  MM.Input = Input;
})();
