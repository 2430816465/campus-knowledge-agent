(() => {
  const pet = document.getElementById('campus-pet');
  const panel = document.getElementById('consult');
  const close = document.getElementById('pet-close');
  let busy = false, greeting, drag, suppressClick = false;
  function state(value) { pet.dataset.state = value; panel.dataset.state = value; }
  function greet() { clearTimeout(greeting); state(busy ? 'thinking' : 'wave'); greeting = setTimeout(() => state(busy ? 'thinking' : 'idle'), 2200); }
  function clamp(element, x, y) {
    const r = element.getBoundingClientRect();
    const viewportWidth = document.documentElement?.clientWidth || innerWidth;
    element.style.left = Math.max(8, Math.min(x, viewportWidth - r.width - 8)) + 'px';
    element.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    element.style.right = 'auto'; element.style.bottom = 'auto';
  }
  function open() { panel.hidden = false; pet.setAttribute('aria-expanded', 'true'); greet(); document.getElementById('question').focus({preventScroll:true}); }
  function hide() { panel.hidden = true; pet.setAttribute('aria-expanded', 'false'); pet.focus({preventScroll:true}); }
  window.campusAssistant = {open};
  pet.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } panel.hidden ? open() : hide(); });
  pet.addEventListener('pointerenter', () => { if (!drag) greet(); });
  close.addEventListener('click', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden && !document.querySelector('dialog[open]')) hide(); });
  document.querySelectorAll('a[href="#consult"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); open(); }));
  function hashOpen() { if (location.hash === '#consult') open(); }
  window.addEventListener('hashchange', hashOpen); hashOpen();
  for (const handle of [pet, document.getElementById('pet-drag-handle')]) {
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 || (handle !== pet && e.target.closest('button'))) return;
      suppressClick = false;
      const element = handle === pet ? pet : panel, r = element.getBoundingClientRect();
      drag = {id:e.pointerId, handle, element, x:e.clientX, y:e.clientY, left:r.left, top:r.top, moved:false};
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId || drag.handle !== handle) return;
      const dx = e.clientX-drag.x, dy = e.clientY-drag.y;
      if (Math.hypot(dx,dy) > 6) drag.moved = true;
      if (drag.moved) clamp(drag.element, drag.left+dx, drag.top+dy);
    });
    const end = e => {
      if (!drag || drag.id !== e.pointerId || drag.handle !== handle) return;
      suppressClick = drag.moved && handle === pet;
      drag = null;
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  }
  window.addEventListener('resize', () => { for (const el of [pet,panel]) if (!el.hidden && el.style.left) {const r=el.getBoundingClientRect();clamp(el,r.left,r.top);} });
  const observer = new MutationObserver(() => { busy = document.getElementById('ask').disabled; clearTimeout(greeting); state(busy ? 'thinking' : 'idle'); });
  observer.observe(document.getElementById('ask'), {attributes:true, attributeFilter:['disabled']});
})();
