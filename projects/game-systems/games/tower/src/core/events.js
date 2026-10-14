/* Small, data-driven event dispatcher for the isolated V2 map slice. */
(function () {
  const MT = (window.MT = window.MT || {});
  const TYPES = new Set(['ENTER', 'AREA', 'MONSTER', 'ITEM', 'DOOR', 'SWITCH', 'RETURN', 'FLAG']);
  const sameAt = (a, b) => !a || (!!b && a[0] === b[0] && a[1] === b[1]);

  function createState() { return { flags: {}, fired: {} }; }

  function matches(hook, type, context) {
    if (hook.type !== type) return false;
    if (hook.at && !sameAt(hook.at, context.at)) return false;
    if (hook.item && hook.item !== context.item) return false;
    if (hook.monster && hook.monster !== context.monster) return false;
    if (hook.door && hook.door !== context.door) return false;
    if (hook.flag && hook.flag !== context.flag) return false;
    return true;
  }

  function emit(state, hooks, type, context) {
    if (!TYPES.has(type)) throw new Error('Unknown event type: ' + type);
    const fired = [];
    (hooks || []).forEach((hook) => {
      if (!matches(hook, type, context || {})) return;
      if (hook.requires && !state.flags[hook.requires]) return;
      if (hook.once !== false && state.fired[hook.id]) return;
      if (hook.once !== false) state.fired[hook.id] = true;
      if (hook.setFlag) state.flags[hook.setFlag] = true;
      fired.push(hook);
    });
    return fired;
  }

  function setFlag(state, hooks, flag) {
    state.flags[flag] = true;
    return emit(state, hooks, 'FLAG', { flag });
  }

  MT.EventEngine = { TYPES: Array.from(TYPES), createState, emit, setFlag };
})();
