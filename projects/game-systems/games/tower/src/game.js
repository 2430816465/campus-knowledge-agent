/* 魔塔 50 层 · 主程序
 * 状态机 + 渲染 + 输入 + 战斗 + 商店 + 存读档，全部塞在一个文件里，
 * 好让 index.html 只要按顺序引几个 <script> 就能跑（不需要 npm / 打包器）。
 */
(function () {
  const MT = window.MT;
  const FLOORS = MT.FLOORS, TILES = MT.TILES, MONSTERS = MT.MONSTERS;
  const Rules = MT.Rules, Sfx = MT.Sfx, Sp = MT.Sprites;
  const W = MT.ORIGINAL50_ACTIVE ? 11 : 12, H = W, TS = 44;
  const SAVE_KEY = MT.ORIGINAL50_ACTIVE ? 'forgotten-tower.original50.v1' : 'forgotten-tower.v3.first3.v1';
  const FLOOR_IDS = Object.keys(FLOORS).map(Number).sort((a, b) => a - b);

  // 广告收益的次数限制。开发版使用统一模拟广告，
  // 正式接入广告 SDK 之后这里就是运营侧的节流阀。
  const AD_LIMITS = { supply: 30, supplyPerFloor: 2, revive: 5, hint: 3 };

  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');

  const G = {
    hero: null, grids: {}, floor: 1, pos: { x: 3, y: 10 }, memo: {},
    visited: {}, entered: {}, flags: {}, busy: false, dead: false, won: false, t: 0,
    runes: {}, clues: {}, dialogueLog: [], opened: {}, hidden: {}, eventState: MT.EventEngine.createState(),
    ads: { supply: 0, supplyFloor: {}, revive: 0, hint: {} }, shopPurchases: 0,
    defeatedMonsters: {}, manualUnread: false
  };
  // 测试面板开关仅在当前页面会话生效，不作为游戏规则或存档字段。
  const DEBUG = { noclip: false, invincible: false, infiniteItems: false };
  const fx = { texts: [], shake: 0, flash: null, battle: null, heroStep: null };
  let battleSpeed = 1;
  const msgs = [];
  // v2: the first boot enters 1F and writes a fresh autosave before this check;
  // tutorial visibility must be controlled only by the player's explicit choice.
  const TUTORIAL_CHOICE_KEY = 'forgotten-tower.tutorial-choice.v2';
  const tutorial = { active: false, stage: '', snapshot: null, focus: null, wholeBoard: false };

  /* ── 初始化 / 存档 ─────────────────────────────────────────── */
  function cloneRows(f) { return FLOORS[f].rows.map((r) => r.split('')); }

  function newGame(keepMsg) {
    stopAutoWalk();
    G.campRunId = "tower-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));
    G.hero = MT.Hero.newHero();
    if (MT.ORIGINAL50_ACTIVE) {
      G.hero.atk = 100; G.hero.def = 100;
      G.hero.keys = {yellow:0, blue:0, red:0};
    }
    G.grids = {};
    FLOOR_IDS.forEach((f) => { G.grids[f] = cloneRows(f); });
    G.hidden = {};
    FLOOR_IDS.forEach((f) => { G.hidden[f] = JSON.parse(JSON.stringify(FLOORS[f].hidden || {})); });
    G.floor = 1;
    G.pos = { x: FLOORS[1].v2Entry[0], y: FLOORS[1].v2Entry[1] };
    G.memo = { 1: { x: G.pos.x, y: G.pos.y } };
    G.visited = { 1: true };
    G.entered = {};
    G.flags = {};
    G.runes = {};
    G.clues = {};
    G.dialogueLog = [];
    G.opened = {};
    G.eventState = MT.EventEngine.createState();
    G.ads = { supply: 0, supplyFloor: {}, revive: 0, hint: {} };
    G.shopPurchases = 0;
    G.defeatedMonsters = {};
    G.manualUnread = false;
    syncManualBadge();
    G.busy = false; G.dead = false; G.won = false;
    clearBattle();
    msgs.length = 0;
    log(MT.ORIGINAL50_ACTIVE ? '你踏入了魔塔。' : '你在塔底检疫入口醒来。上行通道被一道封印锁住了。');
    enterFloor(1);
    if (!keepMsg) { /* 首屏由弹窗负责 */ }
    syncAll();
  }

  function serialize() {
    const hero = testInventorySnapshot && DEBUG.infiniteItems
      ? Object.assign({}, G.hero, {
        keys: testInventorySnapshot.keys,
        items: testInventorySnapshot.items
      })
      : G.hero;
    return JSON.stringify({
      campRunId: G.campRunId, v: 4, hero: hero, grids: G.grids, floor: G.floor, pos: G.pos,
      memo: G.memo, visited: G.visited, entered: G.entered, flags: G.flags, won: G.won,
      runes: G.runes, clues: G.clues, dialogueLog: G.dialogueLog, opened: G.opened, hidden: G.hidden, ads: G.ads, shopPurchases: G.shopPurchases, eventState: G.eventState,
      defeatedMonsters: G.defeatedMonsters, manualUnread: G.manualUnread
    });
  }

  function save(silent) {
    if (tutorial.active) return true;
    try {
      const data=serialize();localStorage.setItem(SAVE_KEY,data);if(!silent)localStorage.setItem(SAVE_KEY+'.checkpoint',data);
      if (!silent) { log('已保存。'); toast('已保存'); }
      return true;
    } catch (e) {
      log('保存失败：浏览器不允许本地存储。');
      return false;
    }
  }

  function load(checkpoint=false) {
    if (tutorial.active) return false;
    let raw = null;
    try {
      raw = localStorage.getItem(checkpoint?SAVE_KEY+'.checkpoint':SAVE_KEY);
    } catch (e) { raw = null; }
    if (!raw) { log('没有找到存档。'); toast(checkpoint?'尚未手动存档，自动进度仍保留':'没有存档'); return false; }
    try {
      const s = JSON.parse(raw);
      if (s.v !== 4 || !FLOORS[s.floor] || !s.grids?.[s.floor] || s.grids[s.floor].length !== H || s.grids[s.floor].some((r) => r.length !== W)) {
        log('这份存档版本或地图尺寸不匹配；旧版存档仍保留在原存档位。');
        toast('旧存档已作废');
        return false;
      }
      stopAutoWalk();
      G.campRunId = s.campRunId || "tower-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));
      G.hero = s.hero; G.grids = s.grids; G.floor = s.floor; G.pos = s.pos;
      if (MT.ORIGINAL50_ACTIVE && G.grids[26]) {
        G.grids[26][7][4] = '#';
        G.grids[26][7][6] = '#';
      }
      G.memo = s.memo || {}; G.visited = s.visited || {}; G.entered = s.entered || {};
      G.flags = s.flags || {}; G.won = !!s.won;
      G.runes = s.runes || {};
      G.clues = s.clues || {};
      G.dialogueLog = Array.isArray(s.dialogueLog) ? s.dialogueLog : [];
      G.opened = s.opened || {};
      G.hidden = s.hidden || {};
      G.eventState = s.eventState || MT.EventEngine.createState();
      G.ads = s.ads || { supply: 0, supplyFloor: {}, revive: 0, hint: {} };
      G.shopPurchases = s.shopPurchases || 0;
      G.defeatedMonsters = s.defeatedMonsters || {};
      G.manualUnread = !!s.manualUnread;
      syncManualBadge();
      G.ads.supplyFloor = G.ads.supplyFloor || {};
      G.ads.hint = G.ads.hint || {};
      G.ads.rewards = G.ads.rewards || {};
      G.dead = false; G.busy = false;
      clearBattle();
      // Old saves keep their map state; materialize newly restored NPCs only
      // on empty cells, without resetting defeated monsters or opened doors.
      syncOriginalFloorEvents(G.floor);
      msgs.length = 0;
      log('读档成功：' + G.floor + 'F。');
      syncAll();
      if(checkpoint)save(true);
      return true;
    } catch (e) {
      log('存档已损坏。');
      return false;
    }
  }

  /* ── 新手教程（独立沙盒；结束后恢复完整运行状态） ────────────── */
  function offerTutorial() {
    let seen = false;
    try {
      const choice = localStorage.getItem(TUTORIAL_CHOICE_KEY);
      seen = choice === 'skipped' || choice === 'completed';
    } catch (_) { /* 私密浏览模式下仍允许本次会话选择 */ }
    if (seen) return;
    modal({
      title: '第一次登塔？',
      body: '<p>要先学习战斗判断、钥匙与门，以及几种移动方式吗？教程会在一间独立的教学房间中进行，不会改动正式楼层或存档。</p>',
      dismissable: false,
      buttons: [
        { label: '跳过教程', cb: () => { try { localStorage.setItem(TUTORIAL_CHOICE_KEY, 'skipped'); } catch (_) {} } },
        { label: '开始教程', primary: true, cb: () => { try { localStorage.setItem(TUTORIAL_CHOICE_KEY, 'started'); } catch (_) {} beginTutorial(); } }
      ]
    });
  }

  function beginTutorial() {
    if (tutorial.active) return;
    stopAutoWalk();
    tutorial.snapshot = {
      game: JSON.parse(JSON.stringify(G)), messages: msgs.slice(), debug: { ...DEBUG },
      touchpadOpen: document.querySelector('.boardwrap').classList.contains('touchpad-open')
    };
    tutorial.active = true;
    DEBUG.noclip = false; DEBUG.invincible = false; DEBUG.infiniteItems = false;
    clearBattle();
    fx.texts = []; fx.flash = null; fx.shake = 0; fx.heroStep = null;
    const room = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) =>
      (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? '#' : '.'
    ));
    room[4][4] = '1';
    room[5][3] = 'Y';
    room[5][5] = 'y';
    G.hero = MT.Hero.newHero();
    G.hero.keys = { yellow: 0, blue: 0, red: 0 };
    if (MT.ORIGINAL50_ACTIVE) { G.hero.atk = 100; G.hero.def = 100; }
    G.grids = { 1: room };
    G.floor = 1;
    G.pos = { x: 2, y: 5 };
    G.memo = { 1: { x: 2, y: 5 } };
    G.visited = { 1: true };
    G.entered = {}; G.flags = {}; G.runes = {}; G.clues = {};
    G.dialogueLog = []; G.opened = {}; G.hidden = { 1: {} };
    G.eventState = MT.EventEngine.createState();
    G.dead = false; G.won = false; G.busy = false;
    document.body.classList.add('tutorial-active');
    $('tutorialOverlay').hidden = false;
    syncAll();
    setTutorialStep('combat-rule');
    requestAnimationFrame(refreshTutorialOverlay);
  }

  function setTutorialStep(stage) {
    if (!tutorial.active) return;
    tutorial.stage = stage;
    tutorial.focus = null;
    tutorial.wholeBoard = false;
    const content = {
      'combat-rule': {
        title: '先理解战斗怎么算',
        text: '勇者每回合先攻击：伤害 = 勇者攻击 − 怪物防御；结果不大于 0 就无法破防。怪物反击：伤害 = 怪物攻击 − 勇者防御。先攻、魔法等怪物有特殊规则，所以战前要看预计战损。',
        next: true
      },
      'inspect-monster': {
        title: '查看怪物数值', text: '点一下房间里的史莱姆，打开怪物信息。对照它的攻击、防御和预计战损，再决定是否交战。',
        cell: [4, 4]
      },
      'collect-key': {
        title: '移动并拾取钥匙', text: '用键盘方向键 / WASD，或在地图上滑动，向右走到黄钥匙上。钥匙会自动拾取。',
        cell: [3, 5], whole: true
      },
      'reach-door': {
        title: '钥匙对应同色的门', text: '沿房间向右走到黄门。开门会消耗一把黄钥匙；没有对应钥匙就无法通过。',
        cell: [5, 5], whole: true
      },
      'open-touchpad': {
        title: '也可以用屏幕方向键', text: '点击“方向键”开关，展开屏幕方向键。',
        selector: '#btnTouchpad'
      },
      'touchpad-move': {
        title: '用方向键走一步', text: '点击上方向键移动。手机上也可以继续滑动地图操作。',
        selector: '[data-move="up"]'
      },
      'route-first': {
        title: '预览自动寻路路线', text: '点击右侧发光的地板格，先查看路线；路线只会规划可通行的路径。',
        cell: [8, 5]
      },
      'route-confirm': {
        title: '确认沿路线前进', text: '路线已经显示。再次点击同一个目的地，勇者就会沿着路线自动行走。',
        cell: [8, 5]
      },
      'route-walk': {
        title: '自动寻路中', text: '勇者正按刚才显示的路线前进。正式游戏途中遇到怪物或未开的门时，会停下让你决定。',
        cell: [8, 5], whole: true
      },
      finish: {
        title: '教程完成', text: '记住：战斗前先看数值，规划钥匙和门的消耗，选择适合自己的移动方式。努力向上攀登，击败魔王！',
        finish: true
      }
    }[stage];
    if (!content) return;
    $('tutorialTitle').textContent = content.title;
    $('tutorialText').textContent = content.text;
    $('tutorialKicker').textContent = stage === 'finish' ? '登塔准备完成' : '新手引导 · ' + (stage === 'combat-rule' || stage === 'inspect-monster' ? '战斗' : stage === 'collect-key' || stage === 'reach-door' ? '钥匙与门' : stage.startsWith('route') ? '自动寻路' : '移动');
    const tutorialStages = ['combat-rule', 'inspect-monster', 'collect-key', 'reach-door', 'open-touchpad', 'touchpad-move', 'route-first', 'route-confirm', 'route-walk', 'finish'];
    const tutorialStep = tutorialStages.indexOf(stage) + 1;
    $('tutorialStepCount').textContent = String(tutorialStep).padStart(2, '0') + ' / ' + String(tutorialStages.length).padStart(2, '0');
    $('tutorialProgressFill').style.width = (tutorialStep / tutorialStages.length * 100) + '%';
    $('tutorialOverlay').querySelector('.tutorial-progress').setAttribute('aria-valuenow', String(tutorialStep));
    $('tutorialFinish').hidden = !content.finish;
    $('tutorialNext').hidden = !content.next;
    const actionButton = content.next ? $('tutorialNext') : content.finish ? $('tutorialFinish') : null;
    if (actionButton) actionButton.focus({ preventScroll: true });
    tutorial.cell = content.cell || null;
    tutorial.selector = content.selector || null;
    tutorial.wholeBoard = !!content.whole;
    refreshTutorialOverlay();
  }

  function tutorialRect() {
    if (tutorial.selector) {
      const node = document.querySelector(tutorial.selector);
      if (node) return node.getBoundingClientRect();
    }
    const board = canvas.getBoundingClientRect();
    if (!tutorial.cell) return null;
    const cell = {
      left: board.left + tutorial.cell[0] * board.width / W,
      top: board.top + tutorial.cell[1] * board.height / H,
      width: board.width / W,
      height: board.height / H
    };
    return cell;
  }

  function refreshTutorialOverlay() {
    if (!tutorial.active || $('tutorialOverlay').hidden) return;
    const overlay = $('tutorialOverlay');
    const spot = $('tutorialSpotlight'), focus = $('tutorialFocus');
    const vw = window.innerWidth, vh = window.innerHeight;
    const target = tutorialRect();
    let hole = target;
    if (tutorial.wholeBoard) hole = canvas.getBoundingClientRect();
    if (hole && hole.width > 0 && hole.height > 0) {
      const l = Math.max(0, hole.left), t = Math.max(0, hole.top);
      const r = Math.min(vw, hole.right ?? (hole.left + hole.width));
      const b = Math.min(vh, hole.bottom ?? (hole.top + hole.height));
      const panes = {
        top: [0, 0, vw, t], bottom: [0, b, vw, Math.max(0, vh - b)],
        left: [0, t, l, Math.max(0, b - t)], right: [r, t, Math.max(0, vw - r), Math.max(0, b - t)]
      };
      Object.entries(panes).forEach(([name, rect]) => {
        const pane = overlay.querySelector('[data-tutorial-shade="' + name + '"]');
        pane.style.display = rect[2] > 0 && rect[3] > 0 ? 'block' : 'none';
        pane.style.left = rect[0] + 'px'; pane.style.top = rect[1] + 'px';
        pane.style.width = rect[2] + 'px'; pane.style.height = rect[3] + 'px';
      });
      spot.style.display = tutorial.wholeBoard ? 'none' : 'block';
      spot.style.left = l + 'px'; spot.style.top = t + 'px';
      spot.style.width = Math.max(0, r - l) + 'px'; spot.style.height = Math.max(0, b - t) + 'px';
    } else {
      overlay.querySelectorAll('.tutorial-shade').forEach((pane) => {
        pane.style.display = 'block'; pane.style.left = '0'; pane.style.top = '0';
        pane.style.width = vw + 'px'; pane.style.height = vh + 'px';
      });
      spot.style.display = 'none';
    }
    if (tutorial.cell) {
      const board = canvas.getBoundingClientRect();
      focus.style.display = 'block';
      focus.style.left = (board.left + tutorial.cell[0] * board.width / W) + 'px';
      focus.style.top = (board.top + tutorial.cell[1] * board.height / H) + 'px';
      focus.style.width = board.width / W + 'px'; focus.style.height = board.height / H + 'px';
    } else {
      focus.style.display = 'none';
    }
    const card = overlay.querySelector('.tutorial-card');
    const anchor = tutorial.cell ? focus.getBoundingClientRect() : target;
    card.classList.toggle('at-top', !!anchor && anchor.top > vh * .56);
    card.classList.toggle('at-bottom', !anchor || anchor.top <= vh * .56);
  }

  function finishTutorial() {
    if (!tutorial.active || !tutorial.snapshot) return;
    stopAutoWalk();
    const snapshot = tutorial.snapshot;
    tutorial.active = false; tutorial.stage = ''; tutorial.snapshot = null;
    document.body.classList.remove('tutorial-active');
    $('tutorialOverlay').hidden = true;
    $('tutorialOverlay').querySelectorAll('.tutorial-shade').forEach((pane) => { pane.style.display = 'none'; });
    const restored = JSON.parse(JSON.stringify(snapshot.game));
    Object.keys(G).forEach((key) => { if (!(key in restored)) delete G[key]; });
    Object.assign(G, restored);
    msgs.length = 0; msgs.push(...snapshot.messages);
    Object.assign(DEBUG, snapshot.debug || {});
    const boardWrap = document.querySelector('.boardwrap');
    boardWrap.classList.toggle('touchpad-open', !!snapshot.touchpadOpen);
    $('btnTouchpad').setAttribute('aria-expanded', snapshot.touchpadOpen ? 'true' : 'false');
    $('btnTouchpad').textContent = snapshot.touchpadOpen ? '收起方向键' : '方向键';
    try { localStorage.setItem(TUTORIAL_CHOICE_KEY, 'completed'); } catch (_) {}
    fx.texts = []; fx.flash = null; fx.shake = 0; fx.heroStep = null;
    clearBattle(); syncAll(); renderLog(); fitBoard(); draw(); refreshTutorialOverlay();
  }

  /* ── 工具 ─────────────────────────────────────────────────── */
  let logTab = 'system';
  function log(text) {
    msgs.push(text);
    if (msgs.length > 120) msgs.shift();
    renderLog();
  }
  function renderLog() {
    const box = $('log');
    const battle = (m) => /击败|战斗|损失|伤害|破防|无法攻击|攻击不足/.test(m);
    const visible = msgs.filter((m) => logTab === 'battle' ? battle(m) : !battle(m));
    box.innerHTML = visible.slice(-40).map((m) => '<div class="logline">' + esc(m) + '</div>').join('') || '<div class="logline dim">' + (logTab === 'battle' ? '战斗后在这里查看战损。' : '拾取物品与开门消息会显示在这里。') + '</div>';
    box.scrollTop = box.scrollHeight;
  }
  let toastTimer = null;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1300);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function grid(f) { return G.grids[f ?? G.floor]; }
  function at(x, y, f) {
    const g = grid(f);
    if (y < 0 || y >= H || x < 0 || x >= W) return '#';
    return g[y][x];
  }
  function setAt(x, y, ch) {
    if (MT.ORIGINAL50_ACTIVE && G.floor === 19 && x === 5 && y === 2 && ch === '.' && !G.flags.F19_CROSS_REVEALED) {
      G.flags.F19_CROSS_REVEALED = true;
      ch = 'c';
    }
    if (MT.ORIGINAL50_ACTIVE && ch === '.') {
      const stack = G.hidden[G.floor]?.[x + ',' + y];
      if (stack?.length) ch = stack.shift();
    }
    grid()[y][x] = ch;
  }
  function originalPickupScale() {
    return MT.ORIGINAL50_ACTIVE ? Math.max(1, Math.min(5, Math.ceil(G.floor / 10))) : 1;
  }
  function freezeAdjacentLava() {
    if (!G.hero.items.ice) { toast('还没有雪之结晶'); return; }
    let count = 0;
    for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const x = G.pos.x + dx, y = G.pos.y + dy;
      if (at(x,y) === '%') { grid()[y][x] = '.'; count++; }
    }
    if (!count) { toast('身边没有可冻结的岩浆'); return; }
    Sfx.secret(); log('冰魔法冻结了身边 ' + count + ' 格岩浆。'); save(true); syncAll();
  }
  function interactOriginalKeyTrader(kind) {
    const classicTrades = {
      6: { cost:50, reward:'蓝钥匙 ×1', apply: () => { G.hero.keys.blue++; } },
      7: { cost:50, reward:'黄钥匙 ×5', apply: () => { G.hero.keys.yellow += 5; } },
      15:{ cost:200, reward:'蓝钥匙 ×1', apply: () => { G.hero.keys.blue++; } },
      31:{ cost:1000, reward:'黄钥匙 ×4、蓝钥匙 ×1', apply: () => { G.hero.keys.yellow += 4; G.hero.keys.blue++; } },
      38:{ cost:200, reward:'黄钥匙 ×3', apply: () => { G.hero.keys.yellow += 3; } },
      45:{ cost:1000, reward:'生命 +2000', apply: () => { G.hero.hp += 2000; } },
      47:{ cost:4000, reward:'地震卷轴 ×1', apply: () => { G.hero.items.earthquake = (G.hero.items.earthquake || 0) + 1; } }
    };
    if (kind === 'classic') {
      const trade = classicTrades[G.floor], flag = 'O50_TRADE_' + G.floor;
      if (!trade || G.flags[flag]) return;
      modal({ title: '塔内商人', body: '<p>' + trade.cost + ' 金币兑换' + trade.reward + '。是否交易？</p>', buttons: [
        { label:'交易', primary:true, cb:() => {
          if (G.flags[flag] || G.hero.gold < trade.cost) { toast('金币不足'); return; }
          G.hero.gold -= trade.cost; trade.apply(); G.flags[flag] = true;
          syncOriginalFloorEvents(G.floor);
          log(G.floor + 'F 商人：' + trade.reward + '。'); Sfx.coin(); save(true); syncAll();
        } }, { label:'离开' }
      ] });
      return;
    }
    if (kind === 'buy-yellow') {
      const canBuy = G.hero.gold >= 1000;
      modal({
        title: '隐藏的钥匙商人',
        body: '<p>“我这里有黄钥匙，一把 1000 金币。要交易吗？”</p>' +
          (canBuy ? '' : '<p class="warn">金币不足：还差 ' + (1000 - G.hero.gold) + '。</p>'),
        buttons: [
          ...(canBuy ? [{ label: '购买黄钥匙 · 1000 金币', primary: true, cb: () => {
            G.hero.gold -= 1000; G.hero.keys.yellow += 1;
            log('隐藏商人售出一把黄钥匙。'); Sfx.coin(); save(true); syncHud();
          } }] : []),
          { label: '离开' }
        ]
      });
      return;
    }
    const canSell = G.hero.keys.yellow > 0;
    modal({
      title: '黄钥匙回收商',
      body: '<p>“我按每把 100 金币回收黄钥匙。你要卖一把吗？”</p>' +
        (canSell ? '' : '<p class="warn">你没有黄钥匙可以出售。</p>'),
      buttons: [
        ...(canSell ? [{ label: '出售一把 · +100 金币', primary: true, cb: () => {
          G.hero.keys.yellow -= 1; G.hero.gold += 100;
          G.flags.O50_F28_KEYS_SOLD = (G.flags.O50_F28_KEYS_SOLD || 0) + 1;
          log('卖出一把黄钥匙，金币 +100。'); Sfx.coin(); save(true); syncHud();
        } }] : []),
        { label: '离开' }
      ]
    });
  }
  const ORIGINAL_GUARD_DOORS = {
    8: [{ guards:[52,54], doors:[42] }],
    11:[{ guards:[44,46], doors:[34] }],
    17:[{ guards:[44,46], doors:[34] }, { guards:[77,79], doors:[67] },
        { guards:[52,54], doors:[42] }, { guards:[85,87], doors:[75] }],
    30:[{ guards:[46,47,48,50,51,52], doors:[38] }],
    32:[{ guards:[99,101], doors:[89] }],
    38:[{ guards:[99,101], doors:[89] }],
    44:[{ guards:[92,94], doors:[82] }],
    45:[{ guards:[95,117], doors:[105] }, { guards:[92,114], doors:[102] }],
    49:[{ guards:[103,105], doors:[93] }, { guards:[81,83], doors:[71] }]
  };
  function releaseOriginalGuardDoors(f, killedIndex) {
    const map = grid(f);
    let opened = 0;
    for (const chain of ORIGINAL_GUARD_DOORS[f] || []) {
      if (killedIndex != null && !chain.guards.includes(killedIndex)) continue;
      if (chain.guards.some(i => MONSTERS[map[Math.floor(i / W)][i % W]])) continue;
      for (const i of chain.doors) {
        const x = i % W, y = Math.floor(i / W);
        if (TILES[map[y][x]]?.originalType === 'prison') { map[y][x] = '.'; opened++; }
      }
    }
    if (opened) { log('守卫全部倒下，机关门自动开启。'); Sfx.door(); }
    return opened;
  }
  function syncOriginalFloorEvents(f) {
    if (!MT.ORIGINAL50_ACTIVE) return;
    releaseOriginalGuardDoors(f);
    const trades = {6:[7,3],7:[5,0],15:[10,10],31:[0,10],38:[4,1],45:[8,2],47:[4,1]};
    if (trades[f]) {
      const [x,y] = trades[f], cell = grid(f)[y][x];
      if (!G.flags['O50_TRADE_' + f] && cell === '.') grid(f)[y][x] = 'm';
      if (G.flags['O50_TRADE_' + f] && cell === 'm') grid(f)[y][x] = '.';
    }
    if (f === 18 && !G.flags.O50_F18_ELDER_MET && grid(18)[1][2] === '.') grid(18)[1][2] = 'o';
    if (f === 18 && G.flags.O50_F18_ELDER_MET && grid(18)[1][2] === 'o') grid(18)[1][2] = '.';
    if (f === 15 && !G.flags.O50_F15_THIEF_MET && grid(15)[0][8] === '.') grid(15)[0][8] = 't';
    if (f === 15 && G.flags.O50_F15_THIEF_MET && grid(15)[0][8] === 't') grid(15)[0][8] = '.';
    if (f !== 2) return;
    if (!G.flags.O50_F02_ELDER_GOLD && grid(2)[3][10] === '.') grid(2)[3][10] = 'o';
    if (G.flags.O50_F02_ELDER_GOLD && grid(2)[3][10] === 'o') grid(2)[3][10] = '.';
    releaseOriginal2PrisonDoors();
    if (!G.flags.O50_F02_BLESSING_CLAIMED && grid(2)[6][10] === '.') grid(2)[6][10] = 'm';
    else if (G.flags.O50_F02_BLESSING_CLAIMED && grid(2)[6][10] === 'm') grid(2)[6][10] = '.';
    const first = grid(2)[8][0];
    if (!G.flags.F02_THIEF_MET && first === '.') grid(2)[8][0] = 't';
    else if (G.flags.F02_THIEF_MET && first === 't') grid(2)[8][0] = '.';
    const returningThief = G.flags.F02_THIEF_MET && (G.flags.O50_F29_TUNNEL_OPENED || G.visited[35]) && !G.flags.F02_TUNNEL_OPENED;
    const cell = grid(2)[10][9];
    if (returningThief && cell === '.') grid(2)[10][9] = 't';
    else if (!returningThief && cell === 't') grid(2)[10][9] = '.';
  }
  function releaseOriginal2PrisonDoors() {
    if (!MT.ORIGINAL50_ACTIVE || G.flags.O50_F02_PRISON_RELEASED) return;
    const map = grid(2);
    if (MONSTERS[map[1][5]] || MONSTERS[map[1][7]]) return;
    for (const index of [48,52,81,85,114,118]) {
      const x = index % W, y = Math.floor(index / W);
      if (map[y][x] === '\uE102') map[y][x] = '.';
    }
    G.flags.O50_F02_PRISON_RELEASED = true;
    log('两名卫兵都已倒下，2层的六扇怪物门开启了。');
    Sfx.door(); save(true);
  }
  function dispatchFloorHooks(type, context) {
    const hooks = FLOORS[G.floor].eventHooks || [];
    let queue = MT.EventEngine.emit(G.eventState, hooks, type, context || {});
    let hops = 0;
    while (queue.length && hops++ < 16) {
      const current = queue;
      queue = [];
      current.forEach((hook) => {
        if (hook.id === 'F01_SEAL_INIT') log('入塔检疫封印仍在运行。两条廊道最终汇向封印节点。');
        if (hook.id === 'F01_SEAL_OPENED') {
          if (G.floor === 1 && at(9, 2) === ')') setAt(9, 2, '.');
          log('检疫机关解除：上行权限恢复，封印表面留下裂纹。');
          toast('1F封印已解除');
        }
        if (hook.id === 'F02_THIEF_TUNNEL') log('暗墙后的小偷通道已打开，牢区现在可以绕行。');
        if (hook.id === 'F03_DISARM') log('缴械记录已登记；当前装备与道具没有被移除。');
        if (hook.id === 'F05_PREDECESSOR_MARK') log('剑柜留下了前代远征者的入库标记。');
        if (hook.id === 'F10_GARRISON_DARK') {
          log('骷髅队长倒下，军区总闸熄灭。公主的通讯接入了终端。');
          modal({ title: '公主通讯', presentation: 'story', body: '<p>“队长已经倒下了吗？……勇者，请听我说。塔里的守卫，可能并不是你以为的敌人。”</p>', buttons: [{ label: '继续向上', primary: true }] });
        }
        if (hook.setFlag) queue.push(...MT.EventEngine.emit(G.eventState, hooks, 'FLAG', { flag: hook.setFlag }));
      });
    }
    if (hops >= 16 && queue.length) log('事件链达到安全深度上限，剩余事件已停止。');
    if (['ENTER', 'RETURN', 'AREA', 'SWITCH', 'ITEM', 'MONSTER', 'DOOR'].includes(type)) save(true);
  }
  function runOriginal50AreaEvents(x, y) {
    if (!MT.ORIGINAL50_ACTIVE) return;
    if (G.floor === 21 && x === 5 && y === 5 && !G.flags.O50_F21_SAGE_MET) {
      G.flags.O50_F21_SAGE_MET = true;
      showDialogue({ speaker: '智者', who: 'elder', pages: ['“大法师只在25层。以你现在的状态贸然挑战，无异于自寻死路。先取得更高级的装备，再回来。”'] });
      save(true);
    }
    if (G.floor === 23 && x === 5 && y === 5 && !G.flags.O50_F23_SAGE_MET) {
      G.flags.O50_F23_SAGE_MET = true;
      showDialogue({ speaker: '智者', who: 'elder', pages: ['“本层藏着一条确切消息。仔细调查那些砖缝异样的墙；全部找出后，29层的小偷才会挖通暗道。”'] });
      save(true);
    }
    if (G.floor === 26 && x === 5 && y === 5 && !G.flags.O50_PRINCESS_RESCUED) {
      // MT26.js: the doll reveals the passage on MT24 and enables its warp.
      G.flags.O50_PRINCESS_RESCUED = true;
      G.flags['营救公主'] = true;
      for (const xx of [4,5,6]) grid(24)[0][xx] = xx === 5 ? '\uE103' : '#';
      for (const yy of [1,2,3]) grid(24)[yy][5] = '.';
      showDialogue({ speaker: '洋娃娃', pages: ['“时间到了，你已被命运选中。如果你不怕死亡，最终将通过时空来到我这里。”', '这只是个洋娃娃……但24层的封墙发生了变化。'] });
      log('26层的洋娃娃启动了24层传送通道。');
      Sfx.secret(); save(true);
    }
    if (G.floor === 27 && x === 5 && y === 0 && !G.flags.O50_F27_SAGE_MET) {
      G.flags.O50_F27_SAGE_MET = true;
      const h = G.hero;
      showDialogue({ speaker: '智者', who: 'elder', pages: [
        '“看看你现在的准备：生命 ' + h.hp + '，攻击 ' + h.atk + '，防御 ' + h.def + '，蓝钥匙 ' + h.keys.blue + '，黄钥匙 ' + h.keys.yellow + '。”',
        '“到达27层时，若有约1500生命、80攻击、98防御、1把蓝钥匙和5把黄钥匙，说明前面的路线规划得不错。”'
      ] });
      save(true);
    }
    if (G.floor === 29 && x === 5 && y === 1 && !G.flags.O50_F29_TUNNEL_OPENED) {
      const walls = MT.ORIGINAL50_MAPS[23].layers.wall.filter((entry) => entry[2] === 321);
      const touched = G.flags.O50_F23_WALLS_TOUCHED || {};
      const remaining = walls.filter(([index]) => !touched[index]).length;
      if (remaining) {
        log('小偷还在挖暗道。23层有 ' + remaining + ' 处特殊墙没有调查。');
        toast('23层特殊墙剩余 ' + remaining);
        showDialogue({ speaker: '小偷', who: 'thief', pages: ['“还没挖通。回23层把砖缝特别的墙都调查一遍，再来找我。”'] });
      } else {
        G.flags.O50_F29_TUNNEL_OPENED = true;
        if (at(5, 2) === '#') grid()[2][5] = '.';
        log('小偷挖通了 29 层暗道，通往上楼梯的道路打开了。');
        showDialogue({ speaker: '小偷', who: 'thief', pages: ['“你来得正好，暗道挖好了！穿过这里就能继续上楼。下次见。”'] });
        Sfx.secret(); save(true);
      }
    }
    if (G.floor === 43 && x === 7 && y === 0 && !G.flags.O50_F43_KING_MOVED && at(8, 0) === 'V') {
      // MT43.js: the king retreats two cells; an empty rear cell and the
      // right-hand gap close, while the yellow door behind stays a door.
      grid()[0][8] = '.';
      grid()[0][10] = 'V';
      if (at(6, 0) === '.') grid()[0][6] = '\uE103';
      if (at(9, 0) === '.') grid()[0][9] = '\uE103';
      for (const xx of [7,9]) grid()[1][xx] = '\uE103';
      G.flags.O50_F43_KING_MOVED = true;
      log('43层的守卫向右撤退，石墙随之封住了通道。');
      Sfx.secret(); save(true);
    }
    if (G.floor === 12 && x === 10 && y === 0) interactOriginalKeyTrader('buy-yellow');
    if (G.floor === 28 && x === 7 && y === 3) interactOriginalKeyTrader('sell-yellow');
    if (G.floor === 40 && x === 5 && y === 6 && !G.flags.O50_F40_ARENA_STARTED) {
      G.flags.O50_F40_ARENA_STARTED = true;
      showDialogue({ speaker:'骑士队长', pages:['“我还在担心你不能来到这里。鬼战士、士兵、双手剑士——都给我上！”',
        '“战胜竞技场的所有守卫，通往上层的楼梯才会出现。”'] });
      log('40层竞技场开始：清除前方十二名守卫和骑士队长。'); save(true);
    }
    if (G.floor === 49 && x === 5 && y === 5 && !G.flags.O50_F49_SUMMONED && !G.flags.F49_BOSS_DEFEATED) {
      G.flags.O50_F49_SUMMONED = true;
      // MT49.js: crossing the center summons the red king and eight white kings.
      // An older save may already contain a partially defeated ring; never respawn it.
      if (at(5,2) !== '~' && ![15,16,17,26,28,37,38,39].some(i => at(i%W,Math.floor(i/W)) === 'V')) {
        grid()[2][5] = '~';
        for (const i of [15,16,17,26,28,37,38,39]) grid()[Math.floor(i/W)][i%W] = 'V';
      }
      showDialogue({ speaker:'魔王', pages:[
        '“你终于来了。我很想立刻与你决斗，但我的部下不同意。”',
        '八名护卫围在魔王周围。先打破十字四方的防线，保留四角封印，才能削弱他。'
      ] });
      log('49层的魔王与八名护卫现身。'); Sfx.secret(); save(true);
    }
    if (G.floor === 32 && x === 5 && y === 9 && !G.flags.O50_F32_CAPTAIN_APPEARED) {
      G.flags.O50_F32_CAPTAIN_APPEARED = true;
      if (at(5,8) === '.') grid()[8][5] = 'P';
      showDialogue({ speaker:'骑士队长', pages:['“你击败了前两个区域的头目，但这次由我亲手阻止你。”',
        '“来吧，看看你是否真有资格继续登塔！”'] });
      log('骑士队长挡住了32层的中央通道。'); save(true);
    }
    if (G.floor === 33 && x === 9 && y === 4 && !G.flags.O50_F33_SWORD_TRAP) {
      G.flags.O50_F33_SWORD_TRAP = true;
      const guards = [[8,4],[10,4],[8,6],[10,6]];
      if (guards.some(([gx,gy]) => MONSTERS[at(gx,gy)])) {
        if (at(9,3) === '.') grid()[3][9] = '\uE101';
        if (at(9,7) === '.') grid()[7][9] = '\uE101';
        log('骑士剑机关启动！击败四名守卫才能打开两侧封门。'); Sfx.door();
      }
      save(true);
    }
    if (G.floor === 42 && x === 4 && y === 9 && !G.flags.O50_F42_CAPTAIN_FLED) {
      G.flags.O50_F42_CAPTAIN_FLED = true;
      showDialogue({ speaker:'骑士队长', pages:['“又是你！我不是你的对手……”',
        '骑士队长转身逃走，前方忽然传来塔主的命令。'],
        onEnd:() => showDialogue({ speaker:'塔主', pages:[
          '“临阵脱逃？塔不需要这样的守卫。”',
          '守卫的身影消失了。塔主留下最后一句话：“我期待与你亲自决斗。”'
        ], onEnd:() => { if (at(5,9) === 'P') grid()[9][5] = '.'; save(true); syncAll(); } }) });
      save(true);
    }
    if (G.floor === 16 && x === 10 && y === 10 && !G.flags.O50_F16_ELDER_REVEALED) {
      G.flags.O50_F16_ELDER_REVEALED = true;
      grid()[10][10] = 'o';
      log('暗墙后传来敲击声，一位老人出现在密室里。');
      Sfx.secret(); save(true);
    }
    if (G.floor === 10 && x === 5 && y === 1 && !G.flags.O50_F10_CAPTAIN_INTRO) {
      G.flags.O50_F10_CAPTAIN_INTRO = true;
      showDialogue({ speaker: '骷髅队长', pages: ['“你怎能杀出重围？我绝不会让你通过。来吧，和我决斗！”'] });
      save(true);
    }
    if (G.floor === 10 && x === 5 && y === 4 && !G.flags.O50_F10_AMBUSH) {
      G.flags.O50_F10_AMBUSH = true;
      // H5 MT10.js marches the captain and eight skeletons into the arena;
      // preserve the encounter roster while resolving the movement instantly.
      [[5,6],[5,2],[3,3],[7,3],[4,3],[6,3],[3,4],[4,4],[6,4],[7,4],[4,5],[6,5]]
        .forEach(([cx,cy]) => { if (!MONSTERS[at(cx,cy)]) grid()[cy][cx] = '.'; });
      grid()[6][5] = '\uE101';
      grid()[3][3] = '\uE101'; grid()[3][7] = '\uE101';
      grid()[3][5] = '.';
      grid()[0][5] = '8';
      [[4,3,'6'],[6,3,'6'],[3,4,'5'],[4,4,'5'],[6,4,'5'],[7,4,'5'],[4,5,'5'],[6,5,'5']]
        .forEach(([cx,cy,ch]) => { grid()[cy][cx] = ch; });
      showDialogue({ speaker: '骷髅队长', pages: ['“哈哈哈，你竟然平安闯到这里……可好运到此为止！弟兄们，上！”'] });
      Sfx.secret(); save(true);
    }
    if (G.floor === 10 && x === 5 && y === 8 && G.flags.O50_F10_CAPTAIN_DEFEATED && !G.flags.O50_F10_THIEF_MET) {
      G.flags.O50_F10_THIEF_MET = true;
      showDialogue({ speaker: '小偷', who: 'thief', target: { floor: 10, x: 10, y: 0 }, pages: ['“又见面了！谢谢你打败这一区的头目。我终于能继续往上走了。听说银盾在11层，银剑在17层——这消息也许对你有用。”'] });
      save(true);
    }
    if (G.floor === 35 && x === 4 && y === 9 && G.flags.F02_TUNNEL_OPENED && !G.flags.O50_F35_THIEF_MET) {
      G.flags.O50_F35_THIEF_MET = true;
      showDialogue({ speaker: '小偷', who: 'thief', pages: ['“暗道已经挖好，你可以从这里绕过魔龙。我不想再被抓住了，就此告别。”'] });
      save(true);
    }
    if (G.floor === 24 && x === 5 && y === 1 && (G.flags.O50_PRINCESS_RESCUED || G.flags['营救公主']) && !G.flags.O50_F24_FINAL_WARP) {
      G.flags.O50_F24_FINAL_WARP = true;
      showDialogue({ speaker: '传送阵', pages: ['营救公主的信号已经确认。传送阵将你送往魔塔顶层。'], onEnd: () => {
        G.floor = 50; G.visited[50] = true; G.pos = {x:5,y:6}; G.memo[50] = {x:5,y:6};
        enterFloor(50); save(true);
      }});
    }
    // H5 50F-compatible 20F scene: the bat convergence is shown as its final
    // state here; the original map's moving-sprite sequence is presentation-only.
    if (G.floor === 20 && x === 5 && y === 7 && !G.flags.O50_F20_VAMPIRE_SCENE) {
      G.flags.O50_F20_VAMPIRE_SCENE = true;
      for (const [bx, by] of [[4,4],[5,4],[6,4],[4,5],[6,5],[4,6],[5,6],[6,6]]) grid()[by][bx] = '.';
      grid()[8][5] = '\uE101'; // special door at source outer coordinate (6,9)
      grid()[5][5] = 'H';
      log('八只大蝙蝠聚拢成了吸血鬼。它挡在通往上层的机关门前。');
      Sfx.secret();
      save(true);
    }
    const floorRules = MT.ORIGINAL50_RULES?.conditional_wall_reveals?.[String(G.floor)] || {};
    for (const [targetIndex, rule] of Object.entries(floorRules)) {
      const approach = rule.approach_index;
      if (y * W + x !== approach || G.flags['O50_REVEAL_' + G.floor + '_' + targetIndex]) continue;
      if (rule.requires_visited_floor && !G.visited[rule.requires_visited_floor]) continue;
      // MT41.js first sets flag:41 after the west-side wizard is defeated.
      if (G.floor === 41 && !G.flags.O50_F41_FIRST_WIZARD) continue;
      const tx = Number(targetIndex) % W, ty = Math.floor(Number(targetIndex) / W);
      const sourceMonster = MT.ORIGINAL50_MAPS[G.floor].layers.monster.find((entry) => entry[0] === Number(targetIndex));
      const glyph = sourceMonster && MT.ORIGINAL50_GLYPHS.monsters[sourceMonster[1]];
      if (!glyph || MONSTERS[at(tx, ty)]) continue;
      grid()[ty][tx] = glyph;
      G.flags['O50_REVEAL_' + G.floor + '_' + targetIndex] = true;
      log('墙后传来异响——一只隐藏的' + MONSTERS[glyph].name + '现身了。');
      Sfx.secret();
      save(true);
    }
  }
  function runOriginal50MonsterEvents(x, y) {
    if (!MT.ORIGINAL50_ACTIVE) return;
    const index = y * W + x;
    if (G.floor === 25 && index === 60 && !G.flags.O50_F25_RED_KEYS) {
      G.flags.O50_F25_RED_KEYS = true;
      G.hero.keys.red += 4;
      log('大法师倒下，获得红钥匙 ×4。'); Sfx.pickup(); syncHud();
    }
    if (G.floor === 32 && index === 93 && !G.flags.O50_F32_CAPTAIN_DEFEATED) {
      G.flags.O50_F32_CAPTAIN_DEFEATED = true;
      log('骑士队长撤退了，中央通道恢复安静。'); Sfx.secret();
    }
    if (G.floor === 33 && G.flags.O50_F33_SWORD_TRAP && [[8,4],[10,4],[8,6],[10,6]].every(([gx,gy]) => !MONSTERS[at(gx,gy)])) {
      let count = 0;
      for (const [dx,dy] of [[9,3],[9,7]]) if (at(dx,dy) === '\uE101') { grid()[dy][dx] = '.'; count++; }
      if (count) { log('骑士剑守卫全部倒下，机关门打开。'); Sfx.door(); }
    }
    if (G.floor === 15 && index === 60 && !G.flags.O50_F15_OCTOPUS_DEFEATED) {
      G.flags.O50_F15_OCTOPUS_DEFEATED = true;
      if (at(5,2) === '\uE101') grid()[2][5] = '.';
      for (const [wx,wy] of [[4,3],[4,4],[4,5],[6,3],[6,4],[6,5],[5,3]]) {
        if (at(wx,wy) === '#') grid()[wy][wx] = '.';
      }
      log('大乌贼倒下，机关门开启。'); Sfx.door();
    }
    const eightGuards = [37,39,41,43,81,83,85,87];
    if (G.floor === 34 && eightGuards.includes(index) && !G.flags.O50_F34_REWARD &&
        eightGuards.every(i => !MONSTERS[at(i % W, Math.floor(i / W))])) {
      [[0,4],[2,4],[0,6],[2,6]].forEach(([rx,ry]) => { if (at(rx,ry) === '.') grid()[ry][rx] = 'Y'; });
      grid()[5][1] = 'R';
      G.flags.O50_F34_REWARD = true;
      log('八名守卫尽数倒下：左侧出现四把黄钥匙，中央墙内露出一把红钥匙。'); Sfx.secret();
    }
    const arenaGuards = [12,13,14,18,19,20,35,36,37,39,40,41,5];
    if (G.floor === 40 && arenaGuards.includes(index) && !G.flags.O50_F40_ARENA_CLEARED &&
        arenaGuards.every(i => !MONSTERS[at(i % W, Math.floor(i / W))])) {
      const rewards = [
        ['Y',1,1],['Y',2,1],['Y',3,1],['e',7,1],['e',8,1],['e',9,1],
        ['(',2,3],['(',3,3],['(',4,3],['a',6,3],['a',7,3],['a',8,3]
      ];
      rewards.forEach(([glyph,rx,ry]) => { if (at(rx,ry) === '.') grid()[ry][rx] = glyph; });
      grid()[0][5] = '>';
      G.flags.O50_F40_ARENA_CLEARED = true;
      log('竞技场守卫已清除，奖励显现；上楼楼梯出现在北侧。'); Sfx.secret();
    }
    releaseOriginalGuardDoors(G.floor, index);
    if (G.floor === 2 && (index === 16 || index === 18)) releaseOriginal2PrisonDoors();
    if (G.floor === 43 && (index === 8 || index === 10) && !G.flags.O50_F43_KING_DEFEATED) {
      for (const xx of [7,9]) grid()[1][xx] = '\uE103';
      G.flags.O50_F43_KING_DEFEATED = true;
      log('43层守卫倒下，侧边的石墙重新闭合。');
    }
    if (G.floor === 20 && index === 60 && G.flags.O50_F20_VAMPIRE_SCENE && !G.flags.O50_F20_VAMPIRE_DEFEATED) {
      // H5 MT20.js afterBattle: open the upper/lower special doors and reveal
      // the four reward rows (tile IDs 21/27/28/32 in maps.js).
      grid()[2][5] = '.';
      grid()[8][5] = '.';
      for (const xx of [4,5,6]) grid()[3][xx] = 'Y';
      for (const yy of [4,5,6]) { grid()[yy][3] = 'a'; grid()[yy][7] = 'e'; }
      for (const xx of [4,5,6]) grid()[7][xx] = '(';
      G.flags.O50_F20_VAMPIRE_DEFEATED = true;
      log('吸血鬼倒下，机关门开启；黄钥匙、红蓝宝石与蓝药水显现。');
      Sfx.secret();
    }
    if (G.floor === 10 && index === 5 && G.flags.O50_F10_AMBUSH && !G.flags.O50_F10_CAPTAIN_DEFEATED) {
      // MT10.js opens the three arena exits and lays out its four reward rows.
      [[3,3],[5,6],[7,3]].forEach(([cx,cy]) => { if (at(cx,cy) === '\uE101') grid()[cy][cx] = '.'; });
      for (const xx of [0,1,2]) grid()[2][xx] = 'a';
      for (const xx of [8,9,10]) grid()[2][xx] = 'e';
      for (const xx of [0,1,2]) grid()[3][xx] = '(';
      for (const xx of [8,9,10]) grid()[3][xx] = 'Y';
      grid()[8][5] = '.';
      G.flags.O50_F10_CAPTAIN_DEFEATED = true;
      log('骷髅队长倒下，牢门开启；宝石、蓝药水与黄钥匙显现。');
      Sfx.secret();
    }
    if (G.floor === 35 && index === 71 && !G.flags.O50_F35_DRAGON_DEFEATED) {
      // MT35.js opens the central special door and reveals blue potions + snow.
      if (at(5,2) === '\uE101') grid()[2][5] = '.';
      for (const [cx,cy] of [[4,6],[6,6]]) if (at(cx,cy) === '#') grid()[cy][cx] = '.';
      [[4,4],[5,4],[6,4]].forEach(([cx,cy]) => { grid()[cy][cx] = '('; });
      grid()[5][5] = 'i';
      G.flags.O50_F35_DRAGON_DEFEATED = true;
      log('魔龙倒下，封门开启；蓝药水与雪之结晶显现。');
      Sfx.secret();
    }
    if (G.floor === 41 && index === 12) G.flags.O50_F41_FIRST_WIZARD = true;

    const groups = MT.ORIGINAL50_RULES?.door_group_completion_rewards?.[String(G.floor)] || [];
    groups.forEach((group, groupIndex) => {
      const flag = 'O50_GROUP_REWARD_' + G.floor + '_' + groupIndex;
      if (G.flags[flag] || !group.monsters.every((i) => !MONSTERS[at(i % W, Math.floor(i / W))])) return;
      (group.rewards || []).forEach((reward) => {
        const glyph = MT.ORIGINAL50_GLYPHS.props[reward.id];
        if (!glyph) return;
        const rx = reward.index % W, ry = Math.floor(reward.index / W);
        grid()[ry][rx] = glyph;
      });
      G.flags[flag] = true;
      log('守卫全部倒下，封锁解除，房间里的红钥匙显现了。');
      Sfx.secret();
    });

    const event = MT.ORIGINAL50_RULES?.scripted_monster_aftermath?.[String(G.floor)]?.[String(index)];
    if (event && !G.flags['O50_AFTER_BATTLE_' + G.floor + '_' + index]) {
      const cell = (i) => [i % W, Math.floor(i / W)];
      (event.remove?.door || []).forEach((i) => {
        const [cx, cy] = cell(i);
        if (TILES[at(cx, cy)]?.kind === 'door') grid()[cy][cx] = '.';
      });
      (event.remove?.wall || []).forEach((i) => {
        const [cx, cy] = cell(i);
        if (at(cx, cy) === '#' || at(cx, cy) === '*') grid()[cy][cx] = '.';
      });
      (event.add?.wall || []).forEach(([i, wallId]) => {
        const [cx, cy] = cell(i);
        grid()[cy][cx] = wallId === 2 || wallId === 3 ? '*' : '#';
      });
      (event.add?.prop || []).forEach(([i, propId]) => {
        const [cx, cy] = cell(i), glyph = MT.ORIGINAL50_GLYPHS.props[propId];
        if (glyph) grid()[cy][cx] = glyph;
      });
      G.flags['O50_AFTER_BATTLE_' + G.floor + '_' + index] = true;
      log('封印机关变动：墙门重新排列，一件隐藏道具显现。');
      Sfx.secret();
    }
  }
  function monSize(ch) { return (MONSTERS[ch] && MONSTERS[ch].size) || 1; }

  const ITEM_NAMES = {
    cross: '十字架', dragonDagger: '屠龙匕', ice: '雪之结晶', pickaxe: '破墙镐',
    bomb: '破坏之玉', gemPick: '宝石魔镐', teleporter: '楼层传送器', flyer: '中心对称飞行器',
    upOrb: '上楼器', downOrb: '下楼器', notebook: '记事本', luckyCoin: '幸运金币'
  };
  function itemName(key) { return ITEM_NAMES[key] || key; }
  function hasItem(key) {
    const v = G.hero.items[key];
    return typeof v === 'number' ? v > 0 : !!v;
  }

  /** 夹击：这只怪的上下左右还站着别的怪（同一只 3×3 Boss 的相邻格不算） */
  function isFlanked(x, y) {
    const self = at(x, y);
    return [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
      const ch = at(x + dx, y + dy);
      return !!MONSTERS[ch] && ch !== self;
    });
  }

  function specials(x, y) {
    return {
      cross: !!G.hero.items.cross,
      dragonDagger: !!G.hero.items.dragonDagger,
      holyShield: !!G.hero.items.holyShield,
      flanked: (x == null) ? false : isFlanked(x, y)
    };
  }

  /** 本层的守卫之锁：guard 那只怪还活着，所有 ')' 就是墙 */
  function guardLock() { return FLOORS[G.floor].guardLock || null; }
  function guardAlive(g) { return !!findChar(G.floor, g.guard); }
  /** 本层的道具封印门：'x,y' -> 需要的道具 */
  function gateNeed(x, y) {
    const t = FLOORS[G.floor].gateItems;
    return (t && t[x + ',' + y]) || null;
  }
  function openGuardWalls(reason) {
    const g = guardLock();
    if (!g) return 0;
    let n = 0;
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      if (grid()[yy][xx] === ')') { grid()[yy][xx] = '.'; n++; }
    }
    if (n) {
      Sfx.door();
      fx.shake = 8;
      log(reason || ('守卫倒下了，' + (g.name || '守卫之锁') + ' 的封墙裂开了 ' + n + ' 堵。'));
      toast('守卫之锁解除');
    }
    return n;
  }

  // MT49.js: 四角白王必须仍在，十字四格被清空，红王才降为十分之一数值。
  function zenithSealed(x, y) {
    const corners = [[-1,-1],[1,-1],[-1,1],[1,1]];
    const sides = [[0,-1],[-1,0],[1,0],[0,1]];
    return corners.every(([dx,dy]) => at(x+dx,y+dy) === 'V') &&
      sides.every(([dx,dy]) => !MONSTERS[at(x+dx,y+dy)]);
  }

  function effMon(ch, x, y) {
    const def = MONSTERS[ch];
    let stats = def;
    if (ch === '~') {
      if (FLOORS[G.floor].finalBoss) stats = Object.assign({}, def, def.final);
      else if (!zenithSealed(x, y)) stats = Object.assign({}, def, def.unsealed);
    }
    if (FLOORS[G.floor].allFirstStrike && (stats.traits || []).indexOf('firstStrike') < 0) {
      stats = Object.assign({}, stats, { traits: (stats.traits || []).concat(['firstStrike']) });
    }
    if (MT.ORIGINAL50_ACTIVE) {
      const sourceId = Number(Object.keys(MT.ORIGINAL50_GLYPHS.monsters).find((id) => MT.ORIGINAL50_GLYPHS.monsters[id] === ch));
      const event = Object.values(MT.ORIGINAL50_RULES.event_first_strike || {}).find((rule) =>
        rule.floor === G.floor && rule.monster_ids.includes(sourceId));
      if (event && (stats.traits || []).indexOf('firstStrike') < 0) {
        stats = Object.assign({}, stats, { traits: (stats.traits || []).concat(['firstStrike']) });
      }
    }
    return stats;
  }

  function floatText(tx, ty, text, color) {
    fx.texts.push({ x: tx * TS + TS / 2, y: ty * TS + TS / 2, text: text, color: color, t: 0 });
  }

  /* ── 面板刷新 ─────────────────────────────────────────────── */
  function syncHud() {
    grantTestItems();
    const h = G.hero;
    $('hp').textContent = h.hp;
    $('atk').textContent = h.atk;
    $('def').textContent = h.def;
    $('gold').textContent = h.gold;
    $('floorNo').textContent = G.floor;
    $('floorNo2').textContent = G.floor;
    $('ky').textContent = h.keys.yellow;
    $('kb').textContent = h.keys.blue;
    $('kr').textContent = h.keys.red;
    for (const id of ['hp','gold','atk','def','ky','kb','kr']) {
      const value = $(id);
      value.closest('.stat,.keybox').classList.toggle('long-value', value.textContent.length > 6);
    }
    const journey = $('towerJourney');
    if (journey) journey.textContent = '已到达 ' + Math.max(G.floor, ...Object.keys(G.visited || {}).map(Number)) + ' 层';
    // 原版地图的通用说明不提供线索，只重复楼层号；关键提示由事件/对话呈现。
    $('floorNote').textContent = MT.ORIGINAL50_ACTIVE ? '' : (FLOORS[G.floor].note || '');
    const debugStatus = $('debugStatus');
    if (debugStatus) {
      const active = [];
      if (DEBUG.noclip) active.push('穿墙');
      if (DEBUG.invincible) active.push('无敌');
      if (DEBUG.infiniteItems) active.push('无限道具');
      debugStatus.textContent = active.length ? '测试：' + active.join('、') : '';
    }

    const chips = [];
    const it = h.items;
    if (it.cross) chips.push(['十字架', '#f2e2b0']);
    if (it.luckyCoin) chips.push(['幸运金币', '#ffe98a']);
    if (it.dragonDagger) chips.push(['屠龙匕', '#ff8a5a']);
    if (it.ice) chips.push(['雪之结晶', '#bfeaff']);
    if (it.teleporter) chips.push(['楼层传送器', '#6ad0e0']);
    if (it.pickaxe > 0) chips.push(['破墙镐 ×' + it.pickaxe, '#c08a4a']);
    if (it.bomb > 0) chips.push(['破坏之玉 ×' + it.bomb, '#8a5ad0']);
    if (it.gemPick > 0) chips.push(['宝石魔镐 ×' + it.gemPick, '#c07ad0']);
    if (it.upOrb) chips.push(['上楼器', '#9ad0a0']);
    if (it.downOrb) chips.push(['下楼器', '#d0a09a']);
    if (it.flyer) chips.push(['飞行器' + (typeof it.flyer === 'number' ? ' ×' + it.flyer : ''), '#c0c8e0']);
    if (it.notebook) chips.push(['记事本', '#d8d0b8']);
    $('items').innerHTML = chips.map((c) =>
      '<span class="chip" style="border-color:' + c[1] + ';color:' + c[1] + '">' + esc(c[0]) + '</span>').join('')
      || '<span class="chip dim">（还没有特殊道具）</span>';
    $('infoItems').innerHTML = $('items').innerHTML;

    $('btnTeleport').disabled = !it.teleporter;
    $('btnPickaxe').disabled = !(it.pickaxe > 0);
    $('btnBomb').disabled = !(it.bomb > 0);
    $('btnGem').disabled = !(it.gemPick > 0);
    $('btnTools').disabled = false;
    $('btnShop').disabled = !shopHere();
    updateAdButtons();
    document.querySelectorAll('[data-ad-reward]').forEach((button) => {
      const claimed = !!G.ads.rewards?.[G.floor]?.[button.dataset.adReward];
      button.disabled = claimed;
      button.textContent = claimed ? '已领取' : '▶ 领取';
      if (!claimed) button.classList.remove('claim-fading');
    });

    syncDiag();
    scheduleFit();
  }

  /* 广告按钮只负责显示剩余次数；点一下直接结算（见 core/ads.js 的说明）。 */
  function updateAdButtons() {
    const b = $('btnAd');
    if (!b) return;
    const left = Math.max(0, AD_LIMITS.supply - G.ads.supply);
    const floorLeft = Math.max(0, AD_LIMITS.supplyPerFloor - (G.ads.supplyFloor[G.floor] || 0));
    b.textContent = '广告补给 ' + Math.min(left, floorLeft) + '/' + AD_LIMITS.supplyPerFloor;
    b.disabled = !(left > 0 && floorLeft > 0);
    b.title = MT.Ads.isReal()
      ? '观看激励视频，获得补给'
      : '测试直通：点一下立刻获得补给（本轮还剩 ' + left + ' 次，本层还剩 ' + floorLeft + ' 次）';
  }

  /* 隐藏诊断节点：给自动化测试 / 浏览器控制台读取当前状态，玩家看不见。 */
  function syncDiag() {
    const dg = $('diag');
    if (!dg || !G.hero) return;
    const h = G.hero;
    dg.textContent = JSON.stringify({
      floor: G.floor, x: G.pos.x, y: G.pos.y,
      hp: h.hp, atk: h.atk, def: h.def, gold: h.gold, lv: h.level, exp: h.exp,
      keys: h.keys, items: h.items, dead: !!G.dead, won: !!G.won, busy: !!G.busy,
      runes: G.runes, ads: G.ads, clues: Object.keys(G.clues),
      modal: $('modal').classList.contains('show')
    });
  }

  function shopHere() {
    const p = G.pos;
    return [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
      const ch = at(p.x + dx, p.y + dy);
      return TILES[ch] && TILES[ch].kind === 'npc' && TILES[ch].who === 'shop';
    });
  }

  function reveal39Flyer() {
    if (!MT.ORIGINAL50_ACTIVE || G.floor !== 39 || G.flags.O50_F39_FLYER ||
        at(3,3) !== 'y' || at(3,1) !== '.' || at(5,3) !== '.' ||
        ![[1,1],[5,1],[1,3],[1,5],[3,5],[5,5]].every(([x,y]) => at(x,y) === 'y')) return false;
    grid()[3][3] = '=';
    G.flags.O50_F39_FLYER = true;
    log('黄门组成了奇妙的对称图案，中央显现中心对称飞行器。');
    Sfx.secret(); save(true);
    return true;
  }

  function syncAll() { reveal39Flyer(); syncHud(); renderBook(); }

  const TEST_AMOUNT = 999999999;
  let testInventorySnapshot = null;
  function grantTestItems() {
    const h = G.hero;
    if (!DEBUG.infiniteItems || !h) return;
    h.keys = { yellow: TEST_AMOUNT, blue: TEST_AMOUNT, red: TEST_AMOUNT };
    Object.assign(h.items, {
      cross: true, luckyCoin: true, dragonDagger: true, ice: true,
      teleporter: true, pickaxe: TEST_AMOUNT, bomb: TEST_AMOUNT,
      gemPick: TEST_AMOUNT, upOrb: true, downOrb: true, flyer: true,
      notebook: true, monsterManual: true, earthquake: TEST_AMOUNT
    });
  }

  function setInfiniteItems(enabled) {
    if (enabled) {
      if (!testInventorySnapshot) {
        testInventorySnapshot = {
          keys: JSON.parse(JSON.stringify(G.hero.keys)),
          items: JSON.parse(JSON.stringify(G.hero.items))
        };
      }
      DEBUG.infiniteItems = true;
      grantTestItems();
      toast('无限道具已开启');
    } else {
      DEBUG.infiniteItems = false;
      if (testInventorySnapshot) {
        G.hero.keys = testInventorySnapshot.keys;
        G.hero.items = testInventorySnapshot.items;
        testInventorySnapshot = null;
      }
      toast('无限道具已关闭，库存已恢复');
    }
    syncHud();
  }

  function openTestPanel() {
    modal({
      title: '测试面板',
      body: '<div class="test-options">' +
        '<label class="test-option"><span><b>无限道具</b><small>钥匙和可消耗道具保持充足；关闭时恢复开启前库存。</small></span>' +
        '<input type="checkbox" data-test-option="items" ' + (DEBUG.infiniteItems ? 'checked' : '') + '></label>' +
        '<label class="test-option"><span><b>穿墙</b><small>可穿过墙、门和怪物；仍受地图边界限制。</small></span>' +
        '<input type="checkbox" data-test-option="noclip" ' + (DEBUG.noclip ? 'checked' : '') + '></label>' +
        '<div class="test-option test-action"><span><b>全属性 +100</b><small>一次性增加生命、攻击、防御各 100。</small></span>' +
        '<button type="button" data-test-action="stats">增加</button></div>' +
        '<div class="test-option test-teleport"><label for="testFloor"><b>传送到任意层</b><small>包括地下层与塔顶。</small></label>' +
        '<div><select id="testFloor">' + FLOOR_IDS.map((f) => '<option value="' + f + '"' + (f === G.floor ? ' selected' : '') + '>' + f + 'F · ' + esc(FLOORS[f].name || '') + '</option>').join('') +
        '</select><button type="button" class="primary" data-test-action="teleport">传送</button></div></div>' +
        '</div>',
      buttons: [{ label: '关闭', primary: true }],
      onMount: (root) => {
        root.querySelector('[data-test-option="items"]').addEventListener('change', (e) => setInfiniteItems(e.target.checked));
        root.querySelector('[data-test-option="noclip"]').addEventListener('change', (e) => {
          DEBUG.noclip = e.target.checked;
          toast('穿墙：' + (DEBUG.noclip ? '开启' : '关闭'));
          syncHud();
        });
        root.querySelector('[data-test-action="stats"]').addEventListener('click', () => {
          G.hero.hp += 100;
          G.hero.atk += 100;
          G.hero.def += 100;
          syncHud();
          toast('生命、攻击、防御各 +100');
        });
        root.querySelector('[data-test-action="teleport"]').addEventListener('click', () => {
          const floor = Number(root.querySelector('#testFloor').value);
          if (!FLOORS[floor]) return;
          closeModal();
          if (floor !== G.floor) jumpTo(floor, floor > G.floor ? 1 : -1);
        });
      }
    });
  }

  /* ── 移动与交互 ───────────────────────────────────────────── */
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  let autoWalk = null;
  let walkTarget = null;
  function stopAutoWalk() {
    if (autoWalk) clearTimeout(autoWalk.timer);
    autoWalk = null;
    walkTarget = null;
  }

  // 门和怪物可以处于路径中，但代价较高；真正消耗资源前仍须玩家确认。
  function findWalkPath(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return [];
    const start = G.pos.y * W + G.pos.x, goal = ty * W + tx;
    if (start === goal) return [];
    const previous = new Int16Array(W * H).fill(-1);
    const distance = new Float64Array(W * H).fill(Infinity);
    const visited = new Uint8Array(W * H);
    previous[start] = start;
    distance[start] = 0;
    for (let turn = 0; turn < W * H; turn++) {
      let id = -1;
      for (let i = 0; i < W * H; i++) if (!visited[i] && (id < 0 || distance[i] < distance[id])) id = i;
      if (id < 0 || !Number.isFinite(distance[id])) break;
      if (id === goal) break;
      visited[id] = 1;
      const x = id % W, y = Math.floor(id / W);
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const next = ny * W + nx;
        if (visited[next]) continue;
        const ch = at(nx, ny), kind = TILES[ch]?.kind;
        if (ch === '#' || ch === '\uE103' || ch === '*' || (ch === '%' && !G.hero.items.ice)) continue;
        const monster = !!MONSTERS[ch];
        const door = kind === 'door' || kind === 'gate';
        if (!monster && !door && ch !== '.' && kind !== 'pickup' && ch !== '%' && next !== goal) continue;
        if (monster && !DEBUG.noclip && !DEBUG.invincible && Rules.predict(G.hero, effMon(ch, nx, ny), specials(nx, ny)).reason === 'atk') continue;
        if (kind === 'door' && !DEBUG.noclip && !TILES[ch].originalType && !G.hero.keys[TILES[ch].color]) continue;
        if (kind === 'gate' && !DEBUG.noclip && gateNeed(nx, ny) && !hasItem(gateNeed(nx, ny))) continue;
        const cost = monster ? 18 : door ? 9 : 1;
        if (distance[id] + cost >= distance[next]) continue;
        distance[next] = distance[id] + cost;
        previous[next] = id;
      }
    }
    if (previous[goal] < 0) return [];
    const path = [];
    for (let p = goal; p !== start; p = previous[p]) path.push(p);
    return path.reverse();
  }

  function startAutoWalk(x, y, plannedPath) {
    const path = plannedPath ? plannedPath.slice() : findWalkPath(x, y);
    stopAutoWalk();
    if (G.busy || G.dead || G.won || $('modal').classList.contains('show')) return;
    if (!path.length) { if (x !== G.pos.x || y !== G.pos.y) toast('没有可通行的路线'); return; }
    if (!G.flags.AUTO_WALK_USED) {
      G.flags.AUTO_WALK_USED = true;
      save(true);
    }
    walkTarget = { x, y, floor: G.floor, path };
    const walk = autoWalk = { floor: G.floor, path, timer: 0, waiting: false };
    const nextStep = () => {
      if (autoWalk !== walk) return;
      if (G.floor !== walk.floor || G.busy || G.dead || G.won || $('modal').classList.contains('show')) {
        stopAutoWalk(); return;
      }
      const id = walk.path[0];
      if (id === undefined) {
        stopAutoWalk();
        if (tutorial.active && tutorial.stage === 'route-walk') setTutorialStep('finish');
        return;
      }
      const nx = id % W, ny = Math.floor(id / W);
      const dx = nx - G.pos.x, dy = ny - G.pos.y;
      const dir = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : dy === -1 ? 'up' : null;
      if (!dir) { stopAutoWalk(); return; }
      const ch = at(nx, ny);
      const kind = TILES[ch]?.kind;
      if (!DEBUG.noclip && (MONSTERS[ch] || kind === 'door' || kind === 'gate')) {
        walk.waiting = true;
        const monster = !!MONSTERS[ch];
        const stats = monster ? effMon(ch, nx, ny) : null;
        const prediction = monster ? Rules.predict(G.hero, stats, specials(nx, ny)) : null;
        const label = monster ? stats.name : (TILES[ch]?.name || '这扇门');
        const detail = monster ? ('预计战损 ' + prediction.loss + ' 生命。' +
          (!DEBUG.invincible && (!prediction.win || prediction.loss >= G.hero.hp) ? ' 当前生命不足，战斗可能导致死亡！' : '')) :
          (kind === 'door' && !TILES[ch].originalType ? '需要消耗一把' + ({ yellow: '黄', blue: '蓝', red: '红' }[TILES[ch].color] || '') + '钥匙。' : '确认开启后继续前往目的地。');
        modal({ title: monster ? '途中遇到怪物' : '途中遇到未开的门',
          body: '<p>' + esc(label) + '：' + esc(detail) + '</p><p>是否' + (monster ? '击败它' : '开门') + '并继续寻路？</p>',
          buttons: [{ label: '取消', cb: stopAutoWalk }, { label: monster ? '战斗' : '开门', primary: true, cb: () => {
            if (autoWalk !== walk || G.floor !== walk.floor) return;
            if (monster) {
              if (at(nx, ny) !== ch) { stopAutoWalk(); return; }
              if (prediction.reason === 'atk') { toast('攻击不足，无法击败'); stopAutoWalk(); return; }
              doBattle(nx, ny, ch, stats, prediction);
            } else {
              move(dir, true);
              if (G.pos.x !== nx || G.pos.y !== ny) { toast('开门失败，寻路已停止'); stopAutoWalk(); return; }
              walk.path.shift(); walk.waiting = false;
              walk.timer = setTimeout(nextStep, 190);
            }
          } }]
        });
        return;
      }
      move(dir, true);
      // 位置变化和剧情弹窗不可自动越过。
      if (G.pos.x !== nx || G.pos.y !== ny || G.floor !== walk.floor ||
          G.busy || $('modal').classList.contains('show')) { stopAutoWalk(); return; }
      walk.path.shift();
      walk.timer = setTimeout(nextStep, 190);
    };
    walk.nextStep = nextStep;
    nextStep();
  }

  function move(dir, fromAutoWalk = false) {
    if (tutorial.active) {
      const allowed = tutorial.stage === 'collect-key' || tutorial.stage === 'reach-door'
        ? dir === 'right'
        : tutorial.stage === 'touchpad-move' ? dir === 'up'
          : tutorial.stage === 'route-walk' ? fromAutoWalk
            : false;
      if (!allowed) return;
    }
    if (!fromAutoWalk) stopAutoWalk();
    if (G.busy || G.dead || G.won) return;
    // 弹窗开着时（商人、石碑、怪物确认、死亡…）方向键一律不生效。
    // 手机上「弹窗刚铺开」和「手指抬起补发 click」挨得极近，少了这道闸很容易多走一步。
    if ($('modal').classList.contains('show') || !$('manualOverlay').hidden) return;
    Sfx.resume();
    const d = DIRS[dir];
    if (!d) return;
    Sp.setHeroMotion(dir, false);
    const nx = G.pos.x + d[0], ny = G.pos.y + d[1];
    // 即使开了穿墙也不能走出 12×12 画布，否则坐标会脱离地图数组。
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) { Sfx.bump(); return; }
    const ch = at(nx, ny);
    const T = TILES[ch];

    // 画面测试时不修改墙、门、怪物、道具和机关，只移动勇者覆盖查看；
    // 楼梯仍正常切层，方便快速检查整塔场景。
    if (DEBUG.noclip) {
      if (ch === '>') return useStairs(1);
      if (ch === '<') return useStairs(-1);
      stepTo(nx, ny);
      return;
    }

    // 3x3 Boss 的任意一格都算撞到它
    if (MONSTERS[ch]) return encounter(nx, ny, ch);
    if (ch === '#' || ch === '\uE103') {
      if (MT.ORIGINAL50_ACTIVE && G.floor === 23 && ch === '#' &&
          MT.ORIGINAL50_MAPS[23].layers.wall.some(([index, , tile]) => index === ny * W + nx && tile === 321)) {
        const touched = G.flags.O50_F23_WALLS_TOUCHED ||= {};
        const index = ny * W + nx;
        if (!touched[index]) {
          touched[index] = true;
          grid()[ny][nx] = '\uE103';
          const total = MT.ORIGINAL50_MAPS[23].layers.wall.filter((entry) => entry[2] === 321).length;
          const remaining = total - Object.keys(touched).length;
          log('23层特殊墙被触碰后变成普通墙。还剩 ' + remaining + ' 处。');
          if (!remaining) toast('23层墙体调查完成');
          save(true);
        }
      }
      Sfx.bump(); return;
    }
    if (ch === '*') {
      setAt(nx, ny, '.');
      Sfx.secret();
      log('你撞在墙上——可这面墙是假的，它塌了。');
      floatText(nx, ny, '暗墙！', '#ffd76a');
      dispatchFloorHooks('SWITCH', { at: [nx, ny], switch: 'secret-wall' });
      stepTo(nx, ny);
      return;
    }
    if (T && T.kind === 'door') return openDoor(nx, ny, ch, T);
    if (T && T.kind === 'guardwall') {
      const g = guardLock();
      Sfx.bump();
      if (g && guardAlive(g)) {
        log('封墙纹丝不动——' + (g.name || '守卫') + ' 还活着。先解决它。');
        toast('先解决 ' + (g.name || '守卫'));
      } else {
        openGuardWalls();
      }
      return;
    }
    if (T && T.kind === 'gate') return openGate(nx, ny);
    if (T && T.kind === 'rock') { stepTo(nx, ny, true); return; }
    if (T && T.kind === 'rune') { stepTo(nx, ny); return stepOnRune(nx, ny, ch); }
    if (T && T.kind === 'pickup') { stepTo(nx, ny); return takePickup(nx, ny, ch); }
    if (T && T.kind === 'npc') return talkTo(ch, T, nx, ny);
    if (ch === '%') {
      Sfx.bump();
      log(G.hero.items.ice ? '先在道具面板使用冰魔法，冻结身边的岩浆。' : '岩浆烫得站不住。得先找到雪之结晶。');
      return;
    }
    if (ch === '>') return useStairs(1);
    if (ch === '<') return useStairs(-1);
    if (ch === '0') return fireEvent(nx, ny);
    stepTo(nx, ny);
  }

  /**
   * 走动。sealBehind = true 表示脚下是落石地：身后的来路当场塌掉。
   * 只塌「普通地面」——楼梯、传送阵、符文、宝箱格永远不会被封，避免把整层玩死。
   */
  function stepTo(x, y, sealBehind) {
    const from = { x: G.pos.x, y: G.pos.y };
    const now = performance.now();
    const previous = fx.heroStep;
    const progress = previous ? Math.min(1, (now - previous.start) / 180) : 1;
    const visualFrom = previous && previous.floor === G.floor
      ? { x: previous.from.x + (previous.to.x - previous.from.x) * progress,
          y: previous.from.y + (previous.to.y - previous.from.y) * progress }
      : from;
    if (sealBehind) {
      if (grid()[from.y][from.x] === '.') {
        grid()[from.y][from.x] = '#';
        floatText(from.x, from.y, '塌方', '#ff9a5a');
        log('头顶的落石砸了下来，你身后的路封死了。');
      }
      if (grid()[y][x] === 'w') grid()[y][x] = '.';
      Sfx.bump();
    }
    G.pos = { x: x, y: y };
    fx.heroStep = { from: visualFrom, to: { x, y }, start: now, floor: G.floor };
    Sp.setHeroMotion(x > from.x ? 'right' : x < from.x ? 'left' : y > from.y ? 'down' : 'up', true);
    G.memo[G.floor] = { x: x, y: y };
    Sfx.step();
    if (MT.ORIGINAL50_ACTIVE && !DEBUG.invincible && !G.hero.items.holyShield) {
      const north = MONSTERS[at(x,y-1)], south = MONSTERS[at(x,y+1)];
      const west = MONSTERS[at(x-1,y)], east = MONSTERS[at(x+1,y)];
      const adjacent = [north,south,west,east];
      const fixed = adjacent.reduce((sum, mon) => sum + (mon?.magicAttack > 1 ? mon.magicAttack : 0), 0);
      const sandwiched = (north?.magicAttack === .5 && south?.magicAttack === .5) ||
        (west?.magicAttack === .5 && east?.magicAttack === .5);
      const damage = Math.min(G.hero.hp, fixed + (sandwiched ? Math.ceil(Math.max(0,G.hero.hp-fixed) / 2) : 0));
      if (damage > 0) {
        G.hero.hp -= damage;
        floatText(x,y,'-' + damage,'#ff7a7a');
        log('地图魔法伤害：生命 -' + damage + (sandwiched ? '（魔法警卫夹击）' : '') + '。');
        if (G.hero.hp <= 0) { G.hero.hp = 0; syncHud(); die(); return; }
      }
    }
    if (!tutorial.active) {
      runOriginal50AreaEvents(x, y);
      dispatchFloorHooks('AREA', { at: [x, y] });
    }
    syncDiag();
    if (tutorial.active && tutorial.stage === 'reach-door' && x === 5 && y === 5) {
      setTutorialStep('open-touchpad');
    } else if (tutorial.active && tutorial.stage === 'touchpad-move' && x === 5 && y === 4) {
      setTutorialStep('route-first');
    }
  }

  /** 道具封印门：不认钥匙，只认道具 */
  function openGate(x, y) {
    const need = gateNeed(x, y);
    if (!need) { setAt(x, y, '.'); stepTo(x, y); return; }
    if (hasItem(need)) {
      setAt(x, y, '.');
      Sfx.door();
      G.opened[G.floor + ':' + x + ',' + y] = need;
      dispatchFloorHooks('DOOR', { at: [x, y], door: 'F' });
      log('「' + itemName(need) + '」嵌进凹槽，封印门开了。');
      toast('道具封印解除');
      stepTo(x, y);
      syncHud();
      return;
    }
    Sfx.bump();
    log('门上刻着一件道具的形状：' + itemName(need) + '。你没有它。');
  }

  function openDoor(x, y, ch, T) {
    if (MT.ORIGINAL50_ACTIVE && T.originalType) {
      const scriptedDoors = { 8:[42], 11:[34], 15:[27], 17:[34,42,67,75], 30:[38],
        32:[89], 33:[42,86], 38:[89], 44:[82], 45:[102,105], 48:[84], 49:[71,93] };
      if (T.originalType === 'prison' && scriptedDoors[G.floor]?.includes(y * W + x)) {
        Sfx.bump(); toast(G.floor === 48 ? '机关门无法直接打开，寻找破墙入口' : '先击败守门的怪物'); return;
      }
      if (T.originalType === 'monster' && grid().some(row => row.some(cell => MONSTERS[cell]))) {
        Sfx.bump(); toast('先击败本层守卫'); return;
      }
      setAt(x, y, '.'); Sfx.door();
      if (at(x, y) === '.') stepTo(x, y);
      syncHud();
      log(T.name + '开启了。'); return;
    }
    const color = T.color;
    const names = { yellow: '黄', blue: '蓝', red: '红' };
    if (G.hero.keys[color] > 0) {
      G.hero.keys[color] -= 1;
      setAt(x, y, '.');
      Sfx.door();
      if (!tutorial.active) dispatchFloorHooks('DOOR', { at: [x, y], door: ch });
      log('用' + names[color] + '钥匙打开了一扇门。');
      reveal39Flyer();
      if (at(x, y) === '.') stepTo(x, y);
      syncHud();
    } else {
      Sfx.bump();
      log('需要' + names[color] + '钥匙。');
    }
  }

  function talkTo(ch, T, x, y) {
    const who = T.who;
    const say = (spec) => showDialogue({ ...spec, target: { floor: G.floor, x, y } });
    const classicTradeCoords = {6:[7,3],7:[5,0],15:[10,10],31:[0,10],38:[4,1],45:[8,2],47:[4,1]};
    const tradeAt = classicTradeCoords[G.floor];
    if (MT.ORIGINAL50_ACTIVE && who === 'merchant' && tradeAt && x === tradeAt[0] && y === tradeAt[1]) {
      interactOriginalKeyTrader('classic'); return;
    }
    if (MT.ORIGINAL50_ACTIVE && G.floor === 2 && who === 'elder' && x === 10 && y === 3) {
      say({ speaker:'老人', who:'elder', pages:['“这是我留给下一位登塔者的积蓄。愿它助你走得更远。”'],
        onEnd:() => { if (G.flags.O50_F02_ELDER_GOLD) return; G.flags.O50_F02_ELDER_GOLD = true; G.hero.gold += 1000; setAt(x,y,'.'); log('老人赠予 1000 金币。'); Sfx.coin(); save(true); syncAll(); } });
      return;
    }
    if (MT.ORIGINAL50_ACTIVE && G.floor === 18 && who === 'elder' && x === 2 && y === 1) {
      say({ speaker:'老人', who:'elder', pages:['“塔里有些门并不认钥匙。守门者倒下，机关才会松开。”', '“别忘了回头看看旧楼层，曾经够不到的东西，或许现在可以拿到了。”'],
        onEnd:() => { G.flags.O50_F18_ELDER_MET = true; setAt(x,y,'.'); save(true); syncAll(); } });
      return;
    }
    if (MT.ORIGINAL50_ACTIVE && G.floor === 15 && who === 'thief' && x === 8 && y === 0) {
      say({ speaker:'小偷', who:'thief', pages:['“大章鱼挡住了我的路，不过暗道终于挖通了。你最好暂时绕开它，我先走了！”'],
        onEnd:() => { if (G.flags.O50_F15_THIEF_MET) return; G.flags.O50_F15_THIEF_MET = true;
          if (at(7,0) === '#' || at(7,0) === '*') grid()[0][7] = '.';
          setAt(x,y,'.'); log('小偷打开了15层的暗墙。'); Sfx.secret(); save(true); syncAll(); } });
      return;
    }
    if (MT.ORIGINAL50_ACTIVE && G.floor === 35 && x === 10 && y === 0 &&
        G.hidden[35]?.['10,0']?.includes('>')) {
      say({ speaker: '老人', who: 'elder',
        pages: ['“你已经来到这里了。往返高层还会用到这座楼梯，我先让开。”'],
        onEnd: () => { setAt(10, 0, '.'); save(true); syncAll(); }
      });
      return;
    }
    if (MT.ORIGINAL50_ACTIVE && G.floor === 2 && who === 'merchant' && x === 10 && y === 6) {
      if (G.flags.O50_F02_BLESSING_CLAIMED) return;
      say({ speaker: '被救的商人', who: 'merchant',
        pages: ['“谢谢你救了我。我能用祝福魔法提升你 3% 的攻击力和防御力。现在就提升吗？”'],
        choices: [
          { label: '现在提升', primary: true, cb: () => {
            if (G.flags.O50_F02_BLESSING_CLAIMED) return;
            const atk = Math.round(G.hero.atk * 0.03), def = Math.round(G.hero.def * 0.03);
            G.hero.atk += atk; G.hero.def += def;
            G.flags.O50_F02_BLESSING_CLAIMED = true;
            setAt(10, 6, '.');
            log('商人的祝福：攻击 +' + atk + '，防御 +' + def + '。');
            Sfx.pickup(); save(true); syncHud();
          } },
          { label: '等会再说' }
        ]
      });
      return;
    }
    if (MT.ORIGINAL50_ACTIVE && who === 'elder' && G.floor === 16) {
      if (G.flags.O50_F16_ELDER_REWARDED) {
        say({ speaker: '老人', pages: ['“圣水的力量已经交给你了。愿它能帮你走得更远。”'] });
        return;
      }
      const add = Math.round(0.74 * (G.hero.atk + G.hero.def)) * 10;
      say({
        speaker: '老人',
        pages: ['“你终于来了……拿着这瓶圣水吧。”', '圣水的力量取决于你当前的攻击与防御。现在饮下，生命 +' + add + '。'],
        onEnd: () => {
          if (G.flags.O50_F16_ELDER_REWARDED) return;
          G.hero.hp += add;
          G.flags.O50_F16_ELDER_REWARDED = true;
          setAt(10, 10, '.');
          log('老人交给你圣水：生命 +' + add + '。');
          Sfx.pickup(); save(true); syncHud();
        }
      });
      return;
    }
    if (MT.ORIGINAL50_ACTIVE && who === 'thief' && G.floor === 2) {
      const returned = x === 9 && y === 10;
      if (returned) {
        say({ ...MT.DIALOGUES.floor2.thiefReturn, onEnd: () => {
          G.flags.F02_TUNNEL_OPENED = true;
          // MT2.js action at source coordinate (4,9), offset by the outer wall.
          if (grid(35)[8][3] === '#') grid(35)[8][3] = '.';
          setAt(x, y, '.');
          save(true); syncAll();
        } });
      } else {
        say({ ...MT.DIALOGUES.floor2.thiefFirst, onEnd: () => {
          G.flags.F02_THIEF_MET = true;
          setAt(x, y, '.');
          save(true); syncAll();
        } });
      }
      return;
    }
    if (who === 'shop') { openShop(); return; }
    if (who === 'stele') {
      const text = MT.STELE[G.floor];
      if (text) { G.clues[G.floor] = text; save(true); }
      say({
        speaker: '石碑', who: 'stele',
        pages: [(text || '石碑上的字已经被磨平了。') + (text ? '\n\n已记入「笔记」，随时可以翻。' : '')]
      });
      return;
    }
    const entry = MT.DIALOGUES.common[who];
    say(entry || { speaker: T.name, pages: ['……'] });
  }

  /* ── 符文封印阵 ───────────────────────────────────────────── */
  function runeState(f) {
    if (!G.runes[f]) G.runes[f] = MT.Puzzle.newRuneState();
    return G.runes[f];
  }

  function stepOnRune(x, y, ch) {
    const def = FLOORS[G.floor].runeLock;
    if (!def) return;
    const st = runeState(G.floor);
    const r = MT.Puzzle.stepRune(def, st, ch);
    if (r.ignore) { log('这枚符文已经亮着了，纹丝不动。'); return; }
    if (r.ok) {
      Sfx.pickup();
      floatText(x, y, r.glyph, '#ffd76a');
      log('第 ' + r.index + ' / ' + def.order.length + ' 枚符文「' + r.glyph + '」亮了起来。');
      if (r.done) openRuneSeal(def);
      syncHud();
      return;
    }
    const dmg = MT.Puzzle.backlash(G.hero.hp);
    G.hero.hp -= dmg;
    Sfx.bump();
    fx.shake = 10;
    floatText(x, y, dmg > 0 ? '-' + dmg + ' HP' : '符文黯淡', '#ff7a7a');
    log('顺序错了。所有符文一齐黯淡下去' +
      (dmg > 0 ? '，反噬咬掉你 ' + dmg + ' 点生命' : '') + '。从头再来。');
    syncHud();
  }

  function openRuneSeal(def) {
    let n = 0;
    def.walls.forEach(([x, y]) => { if (grid()[y][x] === '#') { grid()[y][x] = '.'; n++; } });
    Sfx.door();
    fx.shake = 8;
    log('符文全部亮起，中央的封墙在震动中裂开了。');
    toast('封印解除');
    if (n) save(true);
  }

  /* ── 密语门 ───────────────────────────────────────────────── */
  function lockModal(ev, errText) {
    const key = 'lock' + G.floor;
    const used = G.ads.hint[key] || 0;
    const hints = [];
    for (let i = 0; i < used; i++) {
      const h = MT.Puzzle.lockHint(ev, i);
      if (h) hints.push(h);
    }
    let body = '<p>' + esc(ev.text).replace(/\n/g, '<br>') + '</p>';
    if (hints.length) {
      body += '<p class="warn">机关上浮出的字：<br>' + hints.map((h) => esc(h)).join('<br>') + '</p>';
    }
    if (errText) body += '<p class="warn">' + esc(errText) + '</p>';
    body += '<div class="codewrap"><input id="lockInput" class="codeinput" inputmode="numeric" ' +
      'autocomplete="off" maxlength="6" placeholder="三位数"></div>';

    modal({
      title: ev.title,
      body: body,
      buttons: [
        { label: '离开' },
        { label: '看广告 · 提示', cb: () => askLockHint(key, ev) },
        { label: '确定', primary: true, noClose: true, cb: () => tryLock(ev) }
      ],
      onMount: (root) => {
        const i = root.querySelector('#lockInput');
        if (!i) return;
        i.focus();
        i.onkeydown = (e) => {
          if (e.key === 'Enter') { e.preventDefault(); tryLock(ev); }
        };
      }
    });
  }

  function tryLock(ev) {
    const el = $('lockInput');
    if (!MT.Puzzle.checkCode(ev, el ? el.value : '')) {
      Sfx.bump();
      lockModal(ev, '机关纹丝不动。数字不对。');
      return;
    }
    closeModal();
    G.flags['lock' + G.floor] = true;
    let n = 0;
    ev.walls.forEach(([x, y]) => { if (grid()[y][x] === '#') { grid()[y][x] = '.'; n++; } });
    Sfx.door();
    fx.shake = 8;
    log('三个数字咬合了一声，封墙裂开了' + (n ? '（' + n + ' 堵）' : '') + '。');
    toast('密语正确');
    save(true);
    syncHud();
  }

  function askLockHint(key, ev) {
    const used = G.ads.hint[key] || 0;
    const total = (ev.hintSteps || []).length;
    if (used >= Math.min(total, AD_LIMITS.hint)) { toast('这个机关没有更多提示了'); return; }
    requestAd('hint', () => {
      G.ads.hint[key] = used + 1;
      log('（广告）机关上浮出一行字。');
      lockModal(ev);
      syncHud();
    });
  }

  /* ── 广告收益（当前为测试直通：点一下立刻结算） ─────────────── */
  function requestAd(placement, onReward) {
    Sfx.resume();
    MT.Ads.request(placement, () => { onReward(); save(true); }, reason => toast(reason||'暂时没有可用的广告'),G.campRunId);
  }

  function adSupply() {
    const f = G.floor;
    const perFloor = G.ads.supplyFloor[f] || 0;
    if (G.ads.supply >= AD_LIMITS.supply) { toast('本轮的广告补给已经用完了'); return; }
    if (perFloor >= AD_LIMITS.supplyPerFloor) { toast('这一层的补给已经领过了'); return; }
    requestAd('supply', () => {
      G.ads.supply += 1;
      G.ads.supplyFloor[f] = perFloor + 1;
      G.hero.hp += 500;
      G.hero.gold += 120;
      G.hero.keys.yellow += 1;
      Sfx.coin();
      floatText(G.pos.x, G.pos.y, '补给 +500HP', '#9fe0ff');
      log('（广告）补给送达：生命 +500、金币 +120、黄钥匙 +1。');
      syncHud();
    });
  }

  function claimAdReward(kind) {
    if (!['pickaxe', 'teleport', 'hp'].includes(kind) || G.dead || G.won) return;
    const floor = G.floor;
    if (G.ads.rewards?.[floor]?.[kind]) { toast('本层这项奖励已经领过了'); return; }
    requestAd('reward_' + kind, () => {
      const rewards = G.ads.rewards || (G.ads.rewards = {});
      const floorRewards = rewards[floor] || (rewards[floor] = {});
      if (floorRewards[kind]) return;
      floorRewards[kind] = true;
      let message;
      if (kind === 'pickaxe') {
        G.hero.items.pickaxe = (G.hero.items.pickaxe || 0) + 1;
        message = '领取破墙镐 ×1';
      } else if (kind === 'teleport') {
        G.hero.items.teleporter = true;
        message = '领取传送石：已解锁楼层传送器';
      } else {
        const gained = Math.max(1, Math.ceil(G.hero.hp * 0.3));
        G.hero.hp += gained;
        message = '领取生命 +' + gained;
      }
      log(message);
      toast(message);
      syncHud();
      const button = document.querySelector('[data-ad-reward="' + kind + '"]');
      if (button) {
        button.classList.add('claim-fading');
        button.addEventListener('animationend', () => button.classList.remove('claim-fading'), { once: true });
      }
    });
  }

  function adRevive() {
    if (G.ads.revive >= AD_LIMITS.revive) { toast('复活次数已经用完了'); die(); return; }
    requestAd('revive', () => {
      G.ads.revive += 1;
      G.dead = false;
      G.hero.hp = Math.max(500, G.hero.level * 120);
      Sfx.levelup();
      log('（广告）你从地上撑了起来：生命回到 ' + G.hero.hp + '。');
      syncHud();
    }, () => die());
  }

  function openNotes() {
    const keys = Object.keys(G.clues).map(Number).sort((a, b) => a - b);
    const clues = keys.length
      ? keys.map((f) => '<article class="note-entry"><b>' + f + 'F · 石碑</b><p>' + esc(G.clues[f]).replace(/\n/g, '<br>') + '</p></article>').join('')
      : '<p class="dim small">尚未记录石碑线索。</p>';
    const talks = G.dialogueLog.length
      ? G.dialogueLog.slice().reverse().map((entry) =>
        '<article class="note-entry note-talk"><b>' + entry.floor + 'F · ' + esc(entry.speaker) + '</b>' +
        entry.pages.map((line) => '<p>' + esc(line).replace(/\n/g, '<br>') + '</p>').join('') + '</article>'
      ).join('')
      : '<p class="dim small">尚未记录任何对话。</p>';
    const body = '<section class="notes-section"><h3>石碑线索</h3>' + clues + '</section>' +
      '<section class="notes-section"><h3>对话记录 <span class="dim small">' + G.dialogueLog.length + '</span></h3>' + talks + '</section>';
    modal({ title: '记事本', body: body, buttons: [{ label: '关闭', primary: true }] });
  }

  function takePickup(x, y, ch) {
    const T = TILES[ch];
    const h = G.hero;
    let text = '';
    if (T.key) { h.keys[T.key] += T.amount; text = T.name + ' +' + T.amount; Sfx.pickup(); }
    else if (T.stat === 'atk') { const n = T.amount * (MT.ORIGINAL50_ACTIVE && ch === 'a' ? originalPickupScale() : 1); h.atk += n; text = T.name + '：攻击 +' + n; Sfx.pickup(); }
    else if (T.stat === 'def') { const n = T.amount * (MT.ORIGINAL50_ACTIVE && ch === 'e' ? originalPickupScale() : 1); h.def += n; if (T.special === 'holyShield') h.items.holyShield = true; text = T.name + '：防御 +' + n + (T.special === 'holyShield' ? '，魔法攻击无效' : ''); Sfx.pickup(); }
    else if (T.stat === 'hp') { const n = T.amount * (MT.ORIGINAL50_ACTIVE && (ch === 'h' || ch === '(') ? originalPickupScale() : 1); h.hp += n; text = T.name + '：生命 +' + n; Sfx.pickup(); }
    else if (T.stat === 'gold') {
      h.gold += T.amount; text = T.name + '：金币 +' + T.amount;
      Sfx.coin();
    } else {
      switch (T.special) {
        case 'holyWater': {
          const add = MT.ORIGINAL50_ACTIVE ? Math.round(0.74 * (h.atk + h.def)) * 10 : 5 * h.atk + 10 * h.def;
          h.hp += add; text = '圣水：生命 +' + add + (MT.ORIGINAL50_ACTIVE ? '（按攻击与防御计算）' : '（5×攻击 + 10×防御）'); Sfx.pickup(); break;
        }
        case 'luckyCoin': h.items.luckyCoin = true; text = '幸运金币：以后所有金币翻倍'; Sfx.pickup(); break;
        case 'magicKey': {
          if (!MT.ORIGINAL50_ACTIVE) { h.keys.yellow += 1; h.keys.blue += 1; h.keys.red += 1; }
          let opened = 0;
          for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
            if (grid()[yy][xx] === 'y') { grid()[yy][xx] = '.'; opened++; }
          }
          text = MT.ORIGINAL50_ACTIVE ? '魔法钥匙：本层 ' + opened + ' 扇黄门消失' : '魔法钥匙：三色钥匙各 +1' + (opened ? '，本层的' + opened + '扇黄门全部消失' : '');
          Sfx.door(); break;
        }
        case 'cross': h.items.cross = true; text = '十字架：对不死系的伤害翻倍'; Sfx.pickup(); break;
        case 'dragonDagger': h.items.dragonDagger = true; text = '屠龙匕：对龙的伤害翻倍'; Sfx.pickup(); break;
        case 'ice': h.items.ice = true; text = '雪之结晶：在道具面板使用冰魔法，冻结身边四格岩浆'; Sfx.pickup(); break;
        case 'teleporter': h.items.teleporter = true; text = '楼层传送器：可以跳到任何到过的楼层'; Sfx.pickup(); break;
        case 'pickaxe': h.items.pickaxe = (h.items.pickaxe || 0) + 1; text = '破墙镐：可以凿穿一堵墙'; Sfx.pickup(); break;
        case 'bomb': h.items.bomb = (h.items.bomb || 0) + 1; text = '破坏之玉：可以炸掉身边一只怪'; Sfx.pickup(); break;
        case 'gemPick': h.items.gemPick = (h.items.gemPick || 0) + 1; text = '宝石魔镐：打开本层所有的门和暗墙'; Sfx.pickup(); break;
        case 'flyer': h.items.flyer = (typeof h.items.flyer === 'number' ? h.items.flyer : (h.items.flyer ? 3 : 0)) + 3; text = '中心对称飞行器：获得 3 次使用机会'; Sfx.pickup(); break;
        case 'upOrb': h.items.upOrb = true; text = '上楼器：随时上一层（不消耗，单向段的保险）'; Sfx.pickup(); break;
        case 'downOrb': h.items.downOrb = true; text = '下楼器：随时下一层，也能解开地下室的封印门'; Sfx.pickup(); break;
        case 'notebook': h.items.notebook = true; text = '记事本：石碑线索随你翻'; Sfx.pickup(); break;
        case 'monsterManual': h.items.monsterManual = true; text = '怪物手册：可查看怪物信息'; Sfx.pickup(); break;
        case 'earthquake': h.items.earthquake = (h.items.earthquake || 0) + 1; text = '地震卷轴：可以清除本层可破坏墙壁'; Sfx.pickup(); break;
        default: text = T.name; Sfx.pickup();
      }
    }
    setAt(x, y, '.');
    if (!tutorial.active) dispatchFloorHooks('ITEM', { at: [x, y], item: ch });
    floatText(x, y, text.split('：')[0], '#9fe0ff');
    log(text);
    const ups = MT.ORIGINAL50_ACTIVE ? 0 : MT.Hero.tryLevelUp(h, null);
    if (ups) {
      Sfx.levelup();
    }
    syncHud();
    if (tutorial.active && tutorial.stage === 'collect-key' && T.key === 'yellow') {
      setTutorialStep('reach-door');
    }
  }

  function fireEvent(nx, ny) {
    if (MT.ORIGINAL50_ACTIVE && G.floor === 49 && G.flags.F49_BOSS_DEFEATED) {
      jumpTo(50, 0);
      return;
    }
    // The V3 1F seal is an AREA event on the tile itself, not the legacy
    // warp/lock puzzle attached to this glyph in the original 50F campaign.
    if (G.floor === 1 && FLOORS[1].eventHooks) {
      stepTo(nx, ny);
      return;
    }
    const ev = MT.EVENTS[G.floor];
    if (!ev) { stepTo(nx, ny); log('这里什么也没有。'); return; }
    if (ev.kind === 'lock') {
      stepTo(nx, ny);
      if (G.flags['lock' + G.floor]) { log('封墙已经开了，机关不再有反应。'); return; }
      lockModal(ev);
      return;
    }
    if (ev.kind === 'warp') {
      modal({
        title: ev.title,
        body: '<p>' + esc(ev.text).replace(/\n/g, '<br>') + '</p>',
        buttons: [
          { label: '再想想' },
          { label: '踏进去', primary: true, cb: () => { stepTo(nx, ny); jumpTo(ev.to, 0); log('时空之门——你直接站在了五十层。'); } }
        ]
      });
      return;
    }
    stepTo(nx, ny);
    if (G.flags['ev' + G.floor]) return;
    G.flags['ev' + G.floor] = true;
    modal({
      title: ev.title,
      presentation: 'story',
      body: '<p>' + esc(ev.text).replace(/\n/g, '<br>') + '</p>',
      buttons: [{ label: '继续', primary: true }]
    });
  }

  function useStairs(dir) {
    const target = G.floor + dir;
    if (!FLOORS[target]) { Sfx.bump(); return; }
    if (!MT.ORIGINAL50_ACTIVE && G.floor === 1 && !G.eventState.flags.F01_SEAL_OPENED) { Sfx.bump(); toast('先解除1F封印'); return; }
    if (!MT.ORIGINAL50_ACTIVE && G.floor === 10 && dir > 0 && !G.eventState.flags.F10_GARRISON_DARK) { Sfx.bump(); toast('先击败骷髅队长'); return; }
    Sfx.stairs();
    jumpTo(target, dir);
  }

  // dir: +1 从下层上来（落在本层下楼楼梯），-1 从上层下来（落在本层上楼楼梯），0 无方向
  function jumpTo(f, dir) {
    G.floor = f;
    G.visited[f] = true;
    const want = dir > 0 ? '<' : (dir < 0 ? '>' : null);
    const land = (want && originalStairLanding(f, want)) || findChar(f, '<') || findChar(f, '>') || findChar(f, '@');
    G.pos = land ? { x: land[0], y: land[1] } : { x: 5, y: 5 };
    G.memo[f] = { x: G.pos.x, y: G.pos.y };
    enterFloor(f);
    save(true);
  }

  function originalStairLanding(f, glyph) {
    if (!MT.ORIGINAL50_ACTIVE) return findChar(f, glyph);
    const sprite = glyph === '<' ? 'stair_down' : 'stair_up';
    const sourceStair = MT.ORIGINAL50_MAPS[f]?.layers.stair.find(([, , , name]) => name === sprite);
    if (!sourceStair) return findChar(f, glyph);
    const x = sourceStair[0] % W, y = Math.floor(sourceStair[0] / W);
    if (grid(f)[y][x] === glyph) return [x, y];
    // The source sometimes stacks a monster, door or NPC over a staircase.
    // Never fall back to the *other* staircase or spawn on top of its blocker.
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (grid(f)[ny][nx] === '.') return [nx, ny];
    }
    return [x, y];
  }

  function findChar(f, ch) {
    const g = grid(f);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === ch) return [x, y];
    return null;
  }

  function enterFloor(f, silent) {
    const fl = FLOORS[f];
    const returning = !!G.entered[f];
    G.entered[f] = true;
    syncOriginalFloorEvents(f);
    if (MT.ORIGINAL50_ACTIVE && !returning) {
      if (f === 3) {
        G.hero.hp = 400; G.hero.atk = 10; G.hero.def = 10;
        log('魔王夺走了你的力量。生命降到 400，攻击与防御降到 10。');
      }
      if (f === 50) {
        grid()[4][5] = '~';
        log('真正的魔王出现在塔顶。');
      }
    }
    dispatchFloorHooks(returning ? 'RETURN' : 'ENTER', { at: G.pos ? [G.pos.x, G.pos.y] : null, floor: f });
    syncAll();
    if (silent) return;
    if (fl.note) log('【' + f + 'F】' + fl.note);
    else if (MT.ORIGINAL50_ACTIVE) log(f + 'F');
    if (MT.ORIGINAL50_ACTIVE) return;
    const ev = MT.EVENTS[f];
    const shownOnce = G.flags['intro' + f];
    if ((f === 1 || f === 5 || f === 10 || f === 12 || f === 15 || f === 19 || f === 20 || f === 23 || f === 25 ||
      f === 26 || f === 27 || f === 31 || f === 33 || f === 35 || f === 43 || f === 44 || f === 46 ||
      f === 47 || f === 48 || f === 49 || f === 50) && !shownOnce) {
      G.flags['intro' + f] = true;
      modal({
        title: f + 'F · ' + fl.name,
        presentation: 'story',
        body: '<p>' + esc(fl.note || '') + '</p>',
        buttons: [{ label: '继续', primary: true }]
      });
    } else if (ev && !ev.kind) {
      // 剧情层不用额外弹窗，踩到 0 时再看
    }
  }

  /* ── 战斗 ─────────────────────────────────────────────────── */
  function encounter(x, y, ch) {
    if (MT.ORIGINAL50_ACTIVE && G.floor === 50 && ch === '~' && !G.flags.O50_F50_REVEAL) {
      G.flags.O50_F50_REVEAL = true;
      showDialogue({ speaker:'小偷', who:'thief', target:{floor:50,x,y}, pages:[
        '“你问我为什么会在这里？我一直在等你走到塔顶。”',
        '小偷的伪装散去，站在面前的正是塔主。'
      ], onEnd:() => showDialogue({ speaker:'塔主', target:{floor:50,x,y}, pages:[
        '“此前的战斗，是为了检验你是否有资格掌握神圣剑。”',
        '“如今你已经走到这里。关于公主与这座塔的真相，先用剑来向我证明。”'
      ], onEnd:() => { save(true); encounter(x,y,ch); } }) });
      save(true);
      return;
    }
    const stats = effMon(ch, x, y);
    const p = Rules.predict(G.hero, stats, specials(x, y));
    const flank = isFlanked(x, y);
    if (!p.win && p.reason === 'atk') {
      Sfx.bump();
      log('【' + stats.name + '】你的攻击 ' + G.hero.atk + ' 打不穿它的防御 ' + stats.def + '。');
      toast('打不过 ' + stats.name);
      return;
    }
    // 打得穿防御、但撑不住损失：把「拼命」的选择权交给玩家。
    // 倒下之后的唯一出路就是看广告原地复活，所以这里要把复活次数一起说清楚。
    if (!DEBUG.invincible && (!p.win || p.loss >= G.hero.hp)) {
      const extra = [];
      if (flank) extra.push('它旁边还站着同伴——<b>夹击</b>让你每回合多挨一半');
      if (p.field > 0) extra.push('它的<b>领域</b>在你每一轮出手时额外咬你 ' + MT.Rules.auraOf(stats) + ' 点');
      modal({
        title: '要拼命吗？',
        body: '<p>对 <b>' + esc(stats.name) + '</b>：需要打 ' + p.rounds + ' 回合，' +
          '预计损失 <b>' + p.loss + '</b> 点生命，你只有 <b>' + G.hero.hp + '</b>。</p>' +
          (extra.length ? '<p class="warn">' + extra.join('；') + '。</p>' : '') +
          '<p class="warn">这一战很可能就是你的终点。倒下后可以看广告原地复活（本轮还剩 ' +
          Math.max(0, AD_LIMITS.revive - G.ads.revive) + ' 次）。</p>',
        buttons: [{ label: '撤退' }, { label: '拼命一搏', danger: true, cb: () => doBattle(x, y, ch, stats, p) }]
      });
      return;
    }
    if (flank || p.field > 0) {
      log('交手：' + stats.name + (flank ? '（夹击）' : '') + (p.field > 0 ? '（领域 ' + p.field + '）' : '') + '。');
    }
    doBattle(x, y, ch, stats, p);
  }

  /* 战斗演出完整播放预测回合；速度只缩放演出，不改变规则预演和实际结算。 */
  const FALL_MS = 280;
  const HIT_AT = 0.55;              // 一拍里「打实」的时刻（拍内进度）
  // Keep attack pacing in sync with the speed selector: 1× is twice as fast as before.
  const battleBeatMs = 500;

  function clearBattle() {
    const b = fx.battle;
    if (!b) return;
    if (b.timer) clearTimeout(b.timer);
    fx.battle = null;
  }

  /** 完整显示预测的勇者攻击轮数；怪物保持静态，仅用回合/伤害提示表达还手。 */
  function battleBeats(p, willDie, stats) {
    const rounds = Math.max(1, p.rounds || 1);
    const firstStrike = (stats.traits || []).indexOf('firstStrike') >= 0;
    const hs = rounds;
    const ms = willDie ? rounds : Math.max(0, rounds - 1);
    const beats = [];
    if (firstStrike) {
      for (let i = 0; i < rounds; i++) {
        if (i < ms) beats.push('mon');
        if (i < hs) beats.push('hero');
      }
    } else {
      for (let i = 0; i < hs; i++) {
        beats.push('hero');
        if (i < ms) beats.push('mon');
      }
    }
    return beats;
  }

  function doBattle(x, y, ch, stats, p) {
    const h = G.hero;
    G.busy = true;
    clearBattle();

    // 走到这里只有两种结局：堂堂正正打赢，或者按下「拼命一搏」后倒下。
    const willDie = !DEBUG.invincible && (!p.win || p.loss >= h.hp);
    const beats = battleBeats(p, willDie, stats);
    const beatMs = battleBeatMs;
    const aura = MT.Rules.auraOf(stats);
    const monHit = DEBUG.invincible ? 0 : p.monHit + aura; // 无敌测试模式也不显示虚假的扣血
    const monSeq = [stats.hp], heroSeq = [h.hp];
    let mv = stats.hp, hv = h.hp;
    beats.forEach((who, i) => {
      if (who === 'hero') mv = Math.max(0, mv - Math.max(1, p.heroHit));
      else hv = Math.max(0, hv - monHit);
      if (i === beats.length - 1) { if (willDie) hv = 0; else mv = 0; }
      monSeq.push(mv); heroSeq.push(hv);
    });

    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const b = fx.battle = {
      x: x, y: y, ch: ch, stats: stats, p: p, die: willDie,
      name: stats.name, big: monSize(ch) === 3,
      beats: beats, beatMs: beatMs, attackDur: beats.length * beatMs,
      dur: beats.length * beatMs + FALL_MS / 2,
      monSeq: monSeq, heroSeq: heroSeq, monHit: monHit, heroHit: Math.max(1, p.heroHit),
      t0: t0, lastNow: t0, t: 0, soundAt: -1, settled: false, timer: 0
    };
    $('battleSpeed').hidden = false;
    // 出刀的音效由 loop 里按拍播放，这里不重复响一次
    // 兜底：万一 requestAnimationFrame 被浏览器掐停（切后台），也保证战斗会结算
    b.timer = setTimeout(() => settleBattle(b), b.dur + 1500);
  }

  function settleBattle(b) {
    if(window.campPaused){b.timer=setTimeout(()=>settleBattle(b),100);return;}
    if (fx.battle !== b || b.settled) return;
    b.settled = true;
    if (b.timer) clearTimeout(b.timer);
    fx.battle = null;
    $('battleSpeed').hidden = true;

    const h = G.hero, stats = b.stats, p = b.p, ch = b.ch, x = b.x, y = b.y;
    const loss = DEBUG.invincible ? 0 : p.loss;
    h.hp -= loss;
    const gain = stats.gold * (h.items.luckyCoin ? 2 : 1);
    h.gold += gain;
    h.exp += stats.exp;
    fx.flash = { x: x, y: y, t: 0, size: monSize(ch) };
    fx.shake = b.die ? 12 : 8;
    floatText(x, y, '-' + loss + ' HP', '#ff7a7a');
    floatText(x, y + 0.5, '+' + gain + ' 金币', '#ffd76a');
    log('击败 ' + stats.name + '：损失 ' + loss + ' 生命' + (p.pierce && !DEBUG.invincible ? '（其中领域伤害 ' + p.pierce + '）' : '') +
      '，金币 +' + gain);

    if (!G.defeatedMonsters[ch]) {
      G.defeatedMonsters[ch] = true;
      G.manualUnread = true;
      syncManualBadge();
    }

    clearMonster(ch, x, y);
    runOriginal50MonsterEvents(x, y);

    const ups = MT.ORIGINAL50_ACTIVE ? 0 : MT.Hero.tryLevelUp(h, null);
    if (ups) {
      Sfx.levelup();
    }
    if (h.hp <= 0) { h.hp = 0; die(); }
    else {
      dispatchFloorHooks('MONSTER', { at: [x, y], monster: ch });
      if (MT.ORIGINAL50_ACTIVE && G.floor === 49 && ch === '~') {
        G.flags.F49_BOSS_DEFEATED = true;
        for (const index of [34,35,36]) grid()[Math.floor(index / 11)][index % 11] = 'a';
        for (const index of [40,41,42]) grid()[Math.floor(index / 11)][index % 11] = 'e';
        for (const index of [48,49,50]) grid()[Math.floor(index / 11)][index % 11] = '(';
        grid()[1][4] = 'R';
        grid()[1][6] = '`';
        for (const index of [16,27,38]) grid()[Math.floor(index / 11)][index % 11] = '.';
        grid()[0][5] = '0';
        log('封印解开，遗留的补给与屠龙匕显现。上方的传送门通往 50F。');
      }
      if (ch === '~' && FLOORS[G.floor].finalBoss) win();
    }
    G.busy = false;
    syncHud();
    // 自动寻路只在玩家确认的这一场战斗结束后恢复，不跨越死亡或剧情弹窗。
    const walk = autoWalk;
    if (walk?.waiting && walk.floor === G.floor) {
      if (G.dead || G.won || $('modal').classList.contains('show') || at(x, y) === ch) stopAutoWalk();
      else {
        walk.waiting = false;
        walk.timer = setTimeout(walk.nextStep, 190);
      }
    }
  }

  // 3x3 Boss 一次抹掉 9 格（每层最多一只，直接扫全图最省事也最不容易出错）
  function clearMonster(ch, x, y) {
    if (monSize(ch) === 3) {
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
        if (grid()[yy][xx] === ch) grid()[yy][xx] = '.';
      }
    } else setAt(x, y, '.');
    const g = guardLock();
    if (g && g.guard === ch && !guardAlive(g)) {
      openGuardWalls('你击败了' + (g.name || '守卫') + '，' + (g.wallName || '守卫之锁') + ' 的封墙应声裂开。');
    }
  }

  function die() {
    G.dead = true;
    Sfx.die();
    const left = Math.max(0, AD_LIMITS.revive - G.ads.revive);
    modal({
      title: MT.GAMEOVER.title,
      body: '<p>' + esc(MT.GAMEOVER.text).replace(/\n/g, '<br>') + '</p>' +
        '<p class="warn">看广告可以原地复活，位置不变。本轮还剩 ' + left + ' 次。</p>',
      buttons: [
        { label: '看广告 · 复活', primary: true, cb: () => adRevive() },
        { label: '读取存档', cb: () => load() },
        { label: '重新开始', cb: () => newGame() }
      ]
    });
  }

  function win() {
    G.won = true;
    Sfx.win();
    modal({
      title: '通关 · ' + MT.ENDING.title,
      body: '<p>' + esc(MT.ENDING.text).replace(/\n/g, '<br>') + '</p>' +
        '<p class="dim">最终：HP ' + G.hero.hp + ' / 攻击 ' + G.hero.atk + ' / 防御 ' + G.hero.def +
        '</p>',
      buttons: [{ label: '再爬一次', primary: true, cb: () => newGame() }]
    });
  }

  /* ── 商店 / 传送 / 道具 ───────────────────────────────────── */
  function openShop() {
    if (MT.ORIGINAL50_ACTIVE && at(G.pos.x, G.pos.y) !== 'q' &&
        !Object.values(DIRS).some(([dx, dy]) => at(G.pos.x + dx, G.pos.y + dy) === 'q')) {
      toast('请到商店柜台交易'); return;
    }
    const p = G.shopPurchases;
    const ratio = G.floor >= 46 ? 5 : G.floor >= 32 ? 4 : G.floor >= 12 ? 2 : 1;
    const cost = 20 + 10 * p * (p + 1);
    const options = MT.ORIGINAL50_ACTIVE ? [
      {label:'生命 +' + (100 * (p + 1) * ratio), cost, apply:h => { h.hp += 100 * (p + 1) * ratio; }},
      {label:'攻击 +' + (2 * ratio), cost, apply:h => { h.atk += 2 * ratio; }},
      {label:'防御 +' + (4 * ratio), cost, apply:h => { h.def += 4 * ratio; }}
    ] : MT.SHOP_OPTIONS;
    const rows = options.map((o, i) =>
      '<button class="shoprow" data-i="' + i + '"' + (G.hero.gold < o.cost ? ' disabled' : '') + '>' +
      '<span>' + esc(o.label) + '</span><span class="cost">' + o.cost + ' 金币</span></button>').join('');
    const m = modal({
      title: '贪婪之神',
      body: '<p class="dim">你有 ' + G.hero.gold + ' 金币。</p><div class="shoplist">' + rows + '</div>',
      buttons: [{ label: '离开' }],
      onMount: (root) => {
        root.querySelectorAll('.shoprow').forEach((b) => {
          b.onclick = () => {
            const o = options[+b.dataset.i];
            if (G.hero.gold < o.cost) return;
            G.hero.gold -= o.cost;
            o.apply(G.hero);
            if (MT.ORIGINAL50_ACTIVE) G.shopPurchases++;
            Sfx.coin();
            log('向贪婪之神买了「' + o.label + '」。');
            closeModal();
            syncHud();
            openShop();
          };
        });
      }
    });
    return m;
  }

  function openTeleport() {
    const stairs = [findChar(G.floor, '>'), findChar(G.floor, '<')].filter(Boolean);
    const besideStairs = stairs.some(([sx, sy]) => Math.abs(sx - G.pos.x) + Math.abs(sy - G.pos.y) <= 1);
    if (!besideStairs) { toast('请先走到楼梯旁再使用楼层传送器'); return; }
    const floors = Object.keys(G.visited).map(Number).filter((f) => f !== 44).sort((a, b) => a - b);
    const rows = floors.map((f) =>
      '<button class="shoprow" data-f="' + f + '"><span>' + f + 'F</span>' +
      (f === G.floor ? '<span class="cost">当前</span>' : '') + '</button>').join('');
    modal({
      title: '楼层传送器',
      body: '<div class="shoplist">' + rows + '</div>',
      buttons: [{ label: '取消' }],
      onMount: (root) => {
        root.querySelectorAll('.shoprow').forEach((b) => {
          b.onclick = () => {
            const f = +b.dataset.f;
            closeModal();
            if (f === G.floor) return;
            jumpTo(f, f > G.floor ? 1 : -1);
          };
        });
      }
    });
  }

  function chooseDir(title, cb) {
    modal({
      title: title,
      body: '<div class="dpad"><button data-d="up">上</button><button data-d="left">左</button>' +
        '<button data-d="right">右</button><button data-d="down">下</button></div>',
      buttons: [{ label: '取消' }],
      onMount: (root) => {
        root.querySelectorAll('.dpad button').forEach((b) => {
          b.onclick = () => { closeModal(); cb(b.dataset.d); };
        });
      }
    });
  }

  function usePickaxe() {
    if (!(G.hero.items.pickaxe > 0)) return;
    chooseDir('破墙镐：凿哪一边？', (dir) => {
      const d = DIRS[dir];
      const x = G.pos.x + d[0], y = G.pos.y + d[1];
      if (at(x, y) !== '#' && at(x, y) !== '*') { toast('那边不是可破坏的墙'); return; }
      if (MT.ORIGINAL50_ACTIVE && FLOORS[G.floor].unbreakable.includes(y * W + x)) { toast('这面墙无法破坏'); return; }
      setAt(x, y, '.');
      G.hero.items.pickaxe -= 1;
      Sfx.secret();
      log('用破墙镐凿穿了 (' + x + ',' + y + ') 的墙。');
      save(true);
      syncHud();
    });
  }

  function useBomb() {
    if (!(G.hero.items.bomb > 0)) return;
    const bombRule = MT.ORIGINAL50_ACTIVE && MT.ORIGINAL50_RULES?.item_rules?.bomb;
    chooseDir('破坏之玉：炸哪一边？', (dir) => {
      const d = DIRS[dir];
      const x = G.pos.x + d[0], y = G.pos.y + d[1];
      const ch = at(x, y);
      if (!MONSTERS[ch]) {
        if (bombRule?.consumed_without_target) {
          G.hero.items.bomb--;
          Sfx.bump(); log('破坏之玉落空，仍然消耗了一枚。'); syncHud();
        } else toast('那边没有怪');
        return;
      }
      const stats = effMon(ch, x, y);
      const maxHp = bombRule?.max_exclusive_enemy_hp || Infinity;
      if ((stats.traits || []).indexOf('noBomb') >= 0 || stats.hp >= maxHp) {
        Sfx.bump(); toast(stats.name + ' 无法被破坏之玉击败'); return;
      }
      clearMonster(ch, x, y);
      runOriginal50MonsterEvents(x, y);
      G.hero.items.bomb -= 1;
      const gold = bombRule?.grants_base_gold ? stats.gold : 0;
      G.hero.gold += gold;
      Sfx.hit();
      floatText(x, y, 'BOOM', '#ff9a5a');
      log('破坏之玉炸掉了 ' + stats.name + (gold ? '（金币 +' + gold + '）' : '（没有获得金币）') + '。');
      if (bombRule?.triggers_after_battle_events) dispatchFloorHooks('MONSTER', { at: [x, y], monster: ch });
      save(true);
      syncHud();
    });
  }

  /** 上楼器 / 下楼器：不消耗，随时上下楼。单向段的保险，也是回下层取钥匙的正规手段。 */
  function useOrb(dir) {
    const key = dir > 0 ? 'upOrb' : 'downOrb';
    if (!hasItem(key)) { toast('还没有' + itemName(key)); return; }
    if (!FLOORS[G.floor + dir]) { toast(dir > 0 ? '这里已经是塔顶' : '这里已经是塔底'); return; }
    log((dir > 0 ? '上楼器' : '下楼器') + '：你被直接送到了 ' + (G.floor + dir) + 'F。');
    useStairs(dir);
  }

  /** 中心对称飞行器：瞬移到本层的中心对称格（(x,y) → (10-x,10-y)）。 */
  function useFlyer() {
    if (!hasItem('flyer')) { toast('还没有中心对称飞行器'); return; }
    const x = W - 1 - G.pos.x, y = H - 1 - G.pos.y;
    if (at(x, y) !== '.') { toast('对称位置必须是空地'); return; }
    Sfx.secret();
    floatText(G.pos.x, G.pos.y, '飞行', '#c0c8e0');
    if (typeof G.hero.items.flyer === 'number') G.hero.items.flyer--;
    log('中心对称飞行器：你被翻到了 (' + x + ',' + y + ')' + (typeof G.hero.items.flyer === 'number' ? '，剩余 ' + G.hero.items.flyer + ' 次。' : '。'));
    stepTo(x, y);
    save(true);
    syncHud();
  }

  /** 「道具」面板：把拾取到就能用的东西集中在一处，手机上不用记快捷键。 */
  function openTools() {
    const it = G.hero.items;
    const rows = [];
    const add = (id, label, ok, hint) =>
      rows.push({ id, label, ok, hint });
    add('up', '上楼器 · 上一层', hasItem('upOrb'), hasItem('upOrb') ? '' : '还没有拿到');
    add('down', '下楼器 · 下一层', hasItem('downOrb'), hasItem('downOrb') ? '' : '还没有拿到');
    add('flyer', '中心对称飞行器', hasItem('flyer'), hasItem('flyer') ?
      (typeof it.flyer === 'number' ? '剩余 ' + it.flyer + ' 次 · (10-x, 10-y)' : '(10-x, 10-y)') : '还没有拿到');
    add('notebook', '记事本 · 翻笔记', hasItem('notebook') || Object.keys(G.clues).length > 0, '');
    if (it.pickaxe > 0) add('pickaxe', '破墙镐 ×' + it.pickaxe, true, '凿穿身边一堵墙');
    if (it.bomb > 0) add('bomb', '破坏之玉 ×' + it.bomb, true, '炸掉身边一只怪');
    if (it.gemPick > 0) add('gem', '宝石魔镐 ×' + it.gemPick, true, '打开本层所有门与暗墙');
    if (it.earthquake > 0) add('earthquake', '地震卷轴 ×' + it.earthquake, true, '清除本层可破坏墙壁');
    if (it.ice) add('snow', '冰魔法', true, '冻结身边四格岩浆，可反复使用');
    if (it.teleporter) add('teleport', '楼层传送器', true, '跳到任何到过的楼层');

    const body = '<div class="shoplist">' + rows.map((r) =>
      '<button class="shoprow" data-t="' + r.id + '"' + (r.ok ? '' : ' disabled') + '>' +
      '<span>' + esc(r.label) + '</span><span class="cost">' + esc(r.hint || '') + '</span></button>').join('') + '</div>';
    modal({
      title: '道具',
      body: rows.length ? body : '<p class="dim">现在还没有能用的道具。</p>',
      buttons: [{ label: '关闭' }],
      onMount: (root) => {
        root.querySelectorAll('.shoprow').forEach((b) => {
          b.onclick = () => {
            const id = b.dataset.t;
            closeModal();
            if (id === 'up') useOrb(1);
            else if (id === 'down') useOrb(-1);
            else if (id === 'flyer') useFlyer();
            else if (id === 'notebook') openNotes();
            else if (id === 'pickaxe') usePickaxe();
            else if (id === 'bomb') useBomb();
            else if (id === 'gem') useGemPick();
            else if (id === 'earthquake') useEarthquake();
            else if (id === 'snow') freezeAdjacentLava();
            else if (id === 'teleport') openTeleport();
          };
        });
      }
    });
  }

  function useGemPick() {
    if (!(G.hero.items.gemPick > 0)) return;
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = grid()[y][x];
      const T = TILES[ch];
      if (ch === '*' || (T && T.kind === 'door')) { setAt(x, y, '.'); n++; }
    }
    G.hero.items.gemPick -= 1;
    Sfx.door();
    log('宝石魔镐打开了本层的 ' + n + ' 扇门和暗墙。');
    save(true);
    syncHud();
  }

  function useEarthquake() {
    if (!(G.hero.items.earthquake > 0)) return;
    const fixed = new Set(FLOORS[G.floor].unbreakable || []);
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if ((at(x, y) === '#' || at(x, y) === '*') && !fixed.has(y * W + x)) {
        setAt(x, y, '.'); n++;
      }
    }
    G.hero.items.earthquake--;
    Sfx.secret(); log('地震卷轴震碎了 ' + n + ' 格可破坏墙壁。'); save(true); syncHud();
  }

  /* ── 怪物手册 ─────────────────────────────────────────────── */
  function syncManualBadge() {
    $('btnManual').classList.toggle('has-new-entry', G.manualUnread);
  }
  function closeManual() {
    $('manualOverlay').hidden = true;
    $('btnManual').setAttribute('aria-expanded', 'false');
  }
  function openManual() {
    if ($('modal').classList.contains('show')) return;
    stopAutoWalk();
    G.manualUnread = false;
    syncManualBadge();
    renderBook();
    $('manualOverlay').hidden = false;
    $('btnManual').setAttribute('aria-expanded', 'true');
  }
  function renderBook() {
    const box = $('book');
    if (!box) return;
    const list = MT.MONSTER_CHARS.filter((ch) => G.defeatedMonsters[ch]).map((ch) => ({ ch: ch, x: -1, y: -1 }));
    if (!list.length) { box.innerHTML = '<div class="dim small">还没有击败过怪物。</div>'; return; }
    box.innerHTML = list.map((it) => {
      const stats = it.x >= 0 ? effMon(it.ch, it.x, it.y) : MONSTERS[it.ch];
      const p = Rules.predict(G.hero, stats, specials(it.x >= 0 ? it.x : null, it.y));
      const verdict = !p.win
        ? '<span class="bad">打不过</span>'
        : (p.loss === 0 ? '<span class="good">不损血</span>' : '<span class="ok">损失 ' + p.loss + '</span>');
      const tags = [];
      if ((stats.traits || []).indexOf('undead') >= 0) tags.push('不死系');
      if ((stats.traits || []).indexOf('dragon') >= 0) tags.push('龙系');
      if ((stats.traits || []).indexOf('firstStrike') >= 0) tags.push('先攻');
      if ((stats.traits || []).indexOf('noBomb') >= 0) tags.push('免疫破坏之玉');
      if (MT.Rules.auraOf(stats) > 0) tags.push('领域 ' + MT.Rules.auraOf(stats));
      if ((stats.traits || []).indexOf('flank') >= 0) tags.push('夹击');
      return '<div class="monrow">' +
        '<canvas class="monicon" width="' + TS + '" height="' + TS + '" data-ch="' + esc(it.ch) + '"' +
        (it.x >= 0 ? ' data-x="' + it.x + '" data-y="' + it.y + '"' : '') + '></canvas>' +
        '<div class="moninfo"><div class="monname">' + esc(stats.name) + '</div>' +
        '<div class="monstat"><span>生命 <b>' + stats.hp + '</b></span><span>攻击 <b>' + stats.atk + '</b></span><span>防御 <b>' + stats.def + '</b></span><span>金币 <b>' + stats.gold + '</b></span></div>' +
        '<div class="monforecast">' + verdict + ' <span class="dim small">' + p.rounds + ' 回合</span>' +
        (tags.length ? ' <span class="dim small">' + esc(tags.join(' · ')) + '</span>' : '') + '</div>' +
        '</div></div>';
    }).join('');
    box.querySelectorAll('canvas.monicon').forEach((c) => {
      const g = c.getContext('2d');
      Sp.drawMonster(g, c.dataset.ch, 0, 0, TS);
    });
  }

  /* ── 弹窗 ─────────────────────────────────────────────────── */
  let lastModal = null;
  let modalOpenedAt = 0;      // 弹窗打开时刻
  let modalOpenGesture = -1;  // 打开弹窗的那一次「按下」编号（见 bindInput 的手势编号）
  function modal(opt) {
    lastModal = opt;
    modalOpenedAt = performance.now();
    modalOpenGesture = gestureSeq;
    const wrap = $('modal');
    wrap.onclick = null;
    wrap.classList.toggle('tutorial-inspection', !!opt.tutorialInspection);
    wrap.style.zIndex = opt.tutorialInspection ? '110' : '';
    wrap.classList.toggle('story-modal', opt.presentation === 'story');
    wrap.classList.toggle('dialogue-modal', !!opt.dialogue);
    wrap.innerHTML = '<div class="sheet"><h2>' + esc(opt.title) + '</h2>' +
      '<div class="mbody">' + (opt.body || '') + '</div>' +
      '<div class="mfoot"></div></div>';
    const foot = wrap.querySelector('.mfoot');
    (opt.buttons || [{ label: '好', primary: true }]).forEach((b) => {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      if (b.danger) el.className = 'danger';
      el.onclick = () => {
        if (!b.noClose) closeModal();
        if (b.cb) b.cb();
      };
      foot.appendChild(el);
    });
    wrap.classList.add('show');
    if (opt.onMount) opt.onMount(wrap);
    return wrap;
  }
  function showDialogue(spec) {
    const pages = (spec.pages && spec.pages.length ? spec.pages : ['……']).map(String);
    const choices = spec.choices || [];
    const portraitWho = spec.who || ({'仙子':'fairy','小偷':'thief','老人':'elder','智者':'elder','商人':'merchant','被救的商人':'merchant','公主':'princess','洋娃娃':'doll','石碑':'stele','骷髅队长':'captain'})[spec.speaker];
    G.dialogueLog = G.dialogueLog || [];
    const record = { floor: G.floor, speaker: spec.speaker || '对话', pages: pages.slice() };
    const recorded = G.dialogueLog.some((entry) => entry.floor === record.floor &&
      entry.speaker === record.speaker && JSON.stringify(entry.pages) === JSON.stringify(record.pages));
    if (!recorded) { G.dialogueLog.push(record); save(true); }
    let page = 0;
    function finish() {
      closeModal();
      if (spec.onEnd) spec.onEnd();
    }
    function advance() {
      if (page < pages.length - 1) { page++; render(); }
      else if (!choices.length) finish();
    }
    let holdTimer = null, held = false;
    function skip() {
      if (choices.length) { page = pages.length - 1; render(); }
      else finish();
    }
    function render() {
      const blocks = pages[page].split(/\n{2,}/).map((part) =>
        '<p>' + esc(part).replace(/\n/g, '<br>') + '</p>'
      ).join('');
      const portrait = portraitWho
        ? '<canvas class="dialogue-portrait" width="52" height="52" aria-hidden="true"></canvas>'
        : '<div class="dialogue-portrait dialogue-initial" aria-hidden="true">' + esc((spec.speaker || '·').slice(0, 1)) + '</div>';
      const options = page === pages.length - 1 && choices.length
        ? '<div class="dialogue-choices">' + choices.map((choice, i) =>
          '<span class="dialogue-choice" data-choice="' + i + '">' + esc(choice.label) + '</span>'
        ).join('') + '</div>' : '';
      modal({
        title: spec.speaker || '对话', presentation: 'dialogue',
        dialogue: true, dismissable: false,
        body: '<div class="dialogue-layout"><div class="dialogue-face">' + portrait + '</div>' +
          '<div class="dialogue-copy" aria-live="polite"><div class="dialogue-speaker">' + esc(spec.speaker || '对话') + '：</div>' + blocks +
          (pages.length > 1 ? '<div class="dialogue-page">' + (page + 1) + ' / ' + pages.length + '</div>' : '') +
          options + '</div></div>',
        buttons: [],
        onMount: (wrap) => {
          const face = wrap.querySelector('.dialogue-portrait');
          if (face instanceof HTMLCanvasElement) {
            const faceCtx = face.getContext('2d');
            if (portraitWho === 'stele') Sp.drawStele(faceCtx, 0, 0, 52);
            else if (portraitWho === 'doll') {
              if (!MT.Art?.draw(faceCtx, 'original50.doll', 0, 0, 52, 52, 0)) {
                Sp.drawNpc(faceCtx, 0, 0, 52, 'princess');
                MT.Art?.load('original50.doll').then((img) => {
                  if (img && face.isConnected) {
                    faceCtx.clearRect(0, 0, 52, 52);
                    MT.Art.draw(faceCtx, 'original50.doll', 0, 0, 52, 52, 0);
                  }
                });
              }
            } else if (portraitWho === 'captain') Sp.drawMonster(faceCtx, '8', 0, 0, 52);
            else Sp.drawNpc(faceCtx, 0, 0, 52, portraitWho);
          }
          const target = spec.target;
          const card = wrap.querySelector('.sheet');
          const tail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          tail.setAttribute('class', 'dialogue-tail');
          tail.setAttribute('aria-hidden', 'true');
          wrap.appendChild(tail);
          if (target && target.floor === G.floor) {
            const placeDialogue = () => {
            if (!tail.isConnected) return;
            const board = canvas.getBoundingClientRect();
            const cellW = board.width / W, cellH = board.height / H;
            const targetX = board.left + (target.x + 0.5) * cellW;
            const targetTop = board.top + target.y * cellH;
            const margin = 8, gap = 14;
            const box = card.getBoundingClientRect();
            const above = targetTop >= box.height + gap + margin;
            const left = Math.max(margin, Math.min(innerWidth - box.width - margin, targetX - box.width * 0.72));
            const top = above
              ? Math.max(margin, targetTop - box.height - gap)
              : Math.min(innerHeight - box.height - margin, targetTop + cellH + gap);
            card.style.left = left + 'px';
            card.style.top = top + 'px';
            const baseX = Math.max(left + 22, Math.min(left + box.width - 22, targetX));
            const tipY = above ? targetTop : targetTop + cellH;
            const baseY = above ? top + box.height - 2 : top + 2;
            const x0 = Math.min(baseX - 20, targetX), y0 = Math.min(baseY, tipY);
            const width = Math.max(1, Math.max(baseX + 20, targetX) - x0);
            const height = Math.max(1, Math.max(baseY, tipY) - y0);
            const points = `${baseX - 20 - x0},${baseY - y0} ${baseX + 20 - x0},${baseY - y0} ${targetX - x0},${tipY - y0}`;
            tail.style.left = x0 + 'px';
            tail.style.top = y0 + 'px';
            tail.style.width = width + 'px';
            tail.style.height = height + 'px';
            tail.setAttribute('width', width);
            tail.setAttribute('height', height);
            tail.setAttribute('viewBox', `0 0 ${width} ${height}`);
            tail.innerHTML = `<polygon points="${points}" fill="#b98548" stroke="#b98548" stroke-width="2"/>`;
            };
            placeDialogue();
            requestAnimationFrame(() => requestAnimationFrame(placeDialogue));
          } else {
            const box = card.getBoundingClientRect();
            card.style.left = Math.max(12, (innerWidth - box.width) / 2) + 'px';
            card.style.top = Math.max(12, (innerHeight - box.height) / 2) + 'px';
            tail.hidden = true;
          }
          const pageArea = wrap.querySelector('.dialogue-layout');
          pageArea.addEventListener('contextmenu', (e) => e.preventDefault());
          pageArea.addEventListener('pointerdown', () => {
            held = false;
            holdTimer = setTimeout(() => { held = true; skip(); }, 550);
          });
          for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
            pageArea.addEventListener(type, () => { clearTimeout(holdTimer); holdTimer = null; });
          }
          // 对话遮罩覆盖整屏；点击地图、框体或三角尾巴都翻到下一段。
          // 选项仍必须明确点击，避免普通点击替玩家作出选择。
          wrap.onclick = (e) => {
            if (held) { held = false; return; }
            const choice = e.target.closest('[data-choice]');
            if (choice) {
              const selected = choices[Number(choice.dataset.choice)];
              finish();
              if (selected?.cb) selected.cb();
              return;
            }
            advance();
          };
        }
      });
    }
    render();
  }
  function closeModal() {
    const wrap = $('modal');
    const closedModal = lastModal;
    wrap.classList.remove('show');
    wrap.classList.remove('story-modal');
    wrap.classList.remove('dialogue-modal');
    wrap.classList.remove('tutorial-inspection');
    wrap.style.zIndex = '';
    wrap.innerHTML = '';
    lastModal = null;
    syncHud();
    if (closedModal?.tutorialInspection && tutorial.active && tutorial.stage === 'inspect-monster') {
      setTutorialStep('collect-key');
    }
  }

  /* ── 渲染 ─────────────────────────────────────────────────── */
  function drawTile(ch, x, y, t) {
    const px = x * TS, py = y * TS;
    const T = TILES[ch];
    if (ch === '#') {
      Sp.drawWall(ctx, px, py, TS);
      if (MT.ORIGINAL50_ACTIVE && G.floor === 23 &&
          MT.ORIGINAL50_MAPS[23].layers.wall.some(([index, , tile]) => index === y * W + x && tile === 321)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(144, 195, 216, .8)';
        ctx.lineWidth = Math.max(1, TS * .035);
        ctx.beginPath();
        ctx.moveTo(px + TS * .22, py + TS * .36);
        ctx.lineTo(px + TS * .48, py + TS * .43);
        ctx.lineTo(px + TS * .41, py + TS * .61);
        ctx.lineTo(px + TS * .69, py + TS * .67);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    if (ch === '\uE103') {
      if (MT.Art && MT.Art.draw(ctx, 'original50.door.secret', px, py, TS, TS, 0)) return;
      return Sp.drawWall(ctx, px, py, TS);
    }
    if (ch === '*') {
      Sp.drawWall(ctx, px, py, TS);
      if (G.floor === 2 && x === 5 && y === 6) {
        // 同材质中的一条细微断缝：只提示观察，不直接标出答案。
        ctx.fillStyle = 'rgba(145, 186, 199, 0.45)';
        ctx.fillRect(px + TS * 0.48, py + TS * 0.2, Math.max(1, TS * 0.025), TS * 0.46);
        ctx.fillRect(px + TS * 0.4, py + TS * 0.65, TS * 0.11, Math.max(1, TS * 0.025));
      }
      return;
    }
    if (ch === ')') return Sp.drawGuardWall(ctx, px, py, TS);
    if (ch === 'F') return Sp.drawGate(ctx, px, py, TS);
    if (ch === 'w') return Sp.drawRock(ctx, px, py, TS);
    if (ch === '%') return Sp.drawLava(ctx, px, py, TS, t);
    if (ch === '0') return Sp.drawPortal(ctx, px, py, TS, t);
    if (ch === '>') return Sp.drawStairs(ctx, px, py, TS, 1);
    if (ch === '<') return Sp.drawStairs(ctx, px, py, TS, -1);
    if (!MT.ORIGINAL50_ACTIVE && (ch === '!' || ch === '?')) return; // 3x3 Boss 单独画
    if (MONSTERS[ch]) {
      Sp.drawFloor(ctx, px, py, TS, (x + y) % 2 === 0);
      if (G.floor === 50 && ch === '~') {
        const aura = ctx.createRadialGradient(px + TS / 2, py + TS / 2, TS * .06, px + TS / 2, py + TS / 2, TS * .72);
        aura.addColorStop(0, 'rgba(190,121,246,.55)');
        aura.addColorStop(1, 'rgba(117,59,203,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(px - TS * .25, py - TS * .25, TS * 1.5, TS * 1.5);
        return Sp.drawMonster(ctx, ch, px - TS * .13, py - TS * .19, TS * 1.26);
      }
      return Sp.drawMonster(ctx, ch, px, py, TS);
    }
    if (T && T.kind === 'door') {
      if (MT.ORIGINAL50_ACTIVE && T.originalType) {
        Sp.drawFloor(ctx, px, py, TS, false);
        // Special original-map doors have their own art; ordinary keyed doors
        // continue through drawDoor so the revised yellow/blue/red art is used.
        const artType = T.originalType;
        // The six 2F monster-sealed prison gates use the regenerated prison art.
        // Keep their monster-door tile IDs and unlock events unchanged.
        const useFloor2PrisonArt = G.floor === 2 && artType === 'monster';
        const artId = useFloor2PrisonArt ? 'original50.door.prison' : 'original50.door.' + artType;
        if (MT.Art) {
          // 原始牢门/怪物门资源是横向长条。按门两侧墙轴旋转，纵向墙段上的门也竖直贴合。
          const wallish = (v) => v === '#' || v === '*' || v === ')' || v === 'F' || (TILES[v] && TILES[v].kind === 'door');
          const horizontalWalls = Number(wallish(at(x - 1, y))) + Number(wallish(at(x + 1, y)));
          const verticalWalls = Number(wallish(at(x, y - 1))) + Number(wallish(at(x, y + 1)));
          const verticalDoor = verticalWalls > horizontalWalls;
          if (useFloor2PrisonArt && MT.Art.draw(ctx, artId, px, py, TS, TS, 0)) return;
          if (artType === 'prison') {
            // 牢门 PNG 透明边距导致按普通单格尺寸绘制时两端留白；
            // 仅沿门的长轴拉伸，将可见石框的两端精确贴到格子/墙边。
            const sourceLength = 109, sourceStart = 7, sourceCanvas = 128;
            const doorLength = TS * sourceCanvas / sourceLength;
            ctx.save();
            ctx.translate(px + TS / 2, py + TS / 2);
            if (verticalDoor) ctx.rotate(Math.PI / 2);
            const drawn = MT.Art.draw(ctx, artId,
              -TS / 2 - TS * sourceStart / sourceLength, -TS / 2,
              doorLength, TS, 0);
            ctx.restore();
          if (drawn) return;
          } else {
            if (!verticalDoor && MT.Art.draw(ctx, artId, px, py, TS, TS, 0)) return;
            ctx.save();
            ctx.translate(px + TS / 2, py + TS / 2);
            ctx.rotate(Math.PI / 2);
            const drawn = MT.Art.draw(ctx, artId, -TS / 2, -TS / 2, TS, TS, 0);
            ctx.restore();
            if (drawn) return;
          }
        }
      }
      // 方向索引与门图一致：0下、1左、2右、3上。
      // 门嵌在左右墙时朝向开放通道；嵌在上下墙时同理。
      const wallish = (v) => v === '#' || v === '*' || v === ')' || v === 'F' || (TILES[v] && TILES[v].kind === 'door');
      const left = wallish(at(x - 1, y)), right = wallish(at(x + 1, y));
      const up = wallish(at(x, y - 1)), down = wallish(at(x, y + 1));
      let direction;
      if ((left ? 1 : 0) + (right ? 1 : 0) >= (up ? 1 : 0) + (down ? 1 : 0)) {
        direction = !down && up ? 3 : 0;
      } else {
        direction = !right && left ? 1 : 2;
      }
      return Sp.drawDoor(ctx, px, py, TS, T.color, direction);
    }
    if (T && T.kind === 'rune') {
      Sp.drawFloor(ctx, px, py, TS, (x + y) % 2 === 0);
      const def = FLOORS[G.floor].runeLock;
      const st = G.runes[G.floor];
      return Sp.drawRune(ctx, px, py, TS, MT.Puzzle.glyph(def, ch), !!(st && st.lit.indexOf(ch) >= 0));
    }
    if (T && T.kind === 'npc') {
      Sp.drawFloor(ctx, px, py, TS, (x + y) % 2 === 0);
      if (MT.ORIGINAL50_ACTIVE && ch === 'q' && MT.Art && MT.Art.draw(ctx, 'original50.shop.counter', px, py, TS, TS, 0)) return;
      if (T.who === 'stele') return Sp.drawStele(ctx, px, py, TS);
      return Sp.drawNpc(ctx, px, py, TS, T.who);
    }
    if (T && T.kind === 'pickup') {
      Sp.drawFloor(ctx, px, py, TS, (x + y) % 2 === 0);
      if (MT.ORIGINAL50_ACTIVE && MT.Art) {
        const colorArt = ch === 'a' ? 'original50.item.gemRed' : ch === 'e' ? 'original50.item.gemBlue' : ch === '(' ? 'original50.item.potionBlue' : null;
        if (colorArt && MT.Art.draw(ctx, colorArt, px, py, TS, TS, 0)) return;
      }
      if (MT.ORIGINAL50_ACTIVE && (T.special === 'monsterManual' || T.special === 'earthquake' || T.special === 'flyer')) {
        const artId = T.special === 'monsterManual' ? 'original50.item.manual' :
          T.special === 'earthquake' ? 'original50.item.earthquake' : 'original50.item.flyer';
        if (MT.Art && MT.Art.draw(ctx, artId, px, py, TS, TS, 0)) return;
      }
      const tint = T.tint || '#ddd';
      switch (T.look) {
        case 'key': return Sp.drawKey(ctx, px, py, TS, tint);
        case 'gem': return Sp.drawGem(ctx, px, py, TS, tint);
        case 'potion': return Sp.drawPotion(ctx, px, py, TS, tint);
        case 'coin': return Sp.drawCoin(ctx, px, py, TS, tint);
        case 'sword': return Sp.drawSword(ctx, px, py, TS, tint);
        case 'shield': return Sp.drawShield(ctx, px, py, TS, tint);
        case 'cross': return Sp.drawCross(ctx, px, py, TS, tint);
        case 'holyWater': return Sp.drawHolyWater(ctx, px, py, TS, tint);
        default: return Sp.drawTool(ctx, px, py, TS, tint);
      }
    }
    Sp.drawFloor(ctx, px, py, TS, (x + y) % 2 === 0);
  }

  /* 战场：轻微蓄力、前冲、受击后仰；最后一击后保留倒地动作。 */
  function drawBattle() {
    const b = fx.battle;
    if (!b) return;
    const V = W * TS;
    const pw = V * 0.90, ph = V * 0.58;
    const px = (V - pw) / 2, py = (V - ph) / 2;

    const n = b.beats.length;
    const falling = b.t >= b.attackDur;
    let idx = Math.floor(b.t / b.beatMs);
    if (idx < 0) idx = 0;
    if (idx > n - 1) idx = n - 1;
    const u = falling ? 1 : Math.max(0, Math.min(1, (b.t - idx * b.beatMs) / b.beatMs));
    const hit = !falling && u >= HIT_AT;
    const step = falling ? n : Math.min(n, idx + (hit ? 1 : 0));
    const who = b.beats[idx];
    const loseSide = b.die ? 'hero' : 'mon';
    const fall = falling ? Math.min(1, (b.t - b.attackDur) / (FALL_MS / 2)) : 0;
    const fallen = 1 - Math.pow(1 - fall, 3);

    // 突进的位移：前 30% 后仰蓄力，之后一记前顶
    const push = falling ? 0 : u < 0.3 ? -5 * (u / 0.3) : 15 * Math.sin(Math.PI * ((u - 0.3) / 0.7));
    const heroPush = who === 'hero' ? push : 0;
    const monPush = who === 'mon' ? push : 0;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 压暗地图
    ctx.fillStyle = 'rgba(5,7,13,0.88)';
    ctx.fillRect(0, 0, V, V);

    // 战场面板
    Sp.rr(ctx, px, py, pw, ph, 14);
    const bg = ctx.createLinearGradient(px, py, px, py + ph);
    bg.addColorStop(0, '#242c41');
    bg.addColorStop(1, '#131926');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(150,175,225,0.5)';
    ctx.stroke();
    // 地面
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px + 8, py + ph * 0.62, pw - 16, ph * 0.32);

    const sz = ph * 0.42;
    const msz = b.big ? sz * 1.22 : sz;
    const top = py + ph * 0.16;
    const hx = px + pw * 0.08 + heroPush;
    const mx = px + pw * 0.92 - msz - monPush;
    // 挨打的一侧抖一下
    const recoil = hit ? Math.max(0, 1 - (u - HIT_AT) / (1 - HIT_AT)) : 0;
    const jitter = recoil * 4 * Math.sin(u * 70);

    const fighter = (drawSprite, x, y, size, side) => {
      const isFalling = side === loseSide;
      const takesHit = side !== who;
      const lean = isFalling && falling ? (side === 'hero' ? -1 : 1) * fallen * 1.24 :
        takesHit ? (side === 'hero' ? -1 : 1) * recoil * 0.11 : 0;
      ctx.save();
      ctx.translate(x + size / 2, y + size * 0.9 + (isFalling ? fallen * size * 0.14 : 0));
      ctx.rotate(lean);
      ctx.scale(1, isFalling ? 1 - fallen * 0.18 : 1);
      drawSprite(-size / 2, -size * 0.9, size);
      ctx.restore();
    };

    // 怪物 / 勇者
    // 怪物保持静态，勇者使用已逐帧分离的攻击动画。
    Sp.drawMonster(ctx, b.ch, mx, top + (sz - msz) * 0.5, msz);
    const heroProgress = who === 'hero' ? u : 0;
    fighter((x, y, s) => Sp.drawHeroBattle(ctx, x, y, s, heroProgress, who === 'hero'),
      hx + (who === 'mon' ? jitter : 0), top + (who === 'mon' ? jitter : 0), sz, 'hero');

    // 命中瞬间的光爆与刀光
    if (hit) {
      const k = Math.max(0, 1 - (u - HIT_AT) / (1 - HIT_AT) * 0.7);
      const onMon = who === 'hero';
      const cx = onMon ? mx + msz / 2 : hx + sz / 2;
      const cy = top + sz * 0.45;
      const r = (onMon ? msz : sz) * 0.6;
      const rgb = onMon ? '255,224,150' : '255,110,110';
      const g = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.5 * k).toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(' + rgb + ',' + (0.34 * k).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }

    // 命中时补两刀白光，读起来更「打中了」
    if (hit) {
      const k = Math.max(0, 1 - (u - HIT_AT) / (1 - HIT_AT));
      const onMon = who === 'hero';
      const cx = onMon ? mx + msz / 2 : hx + sz / 2;
      const cy = top + sz * 0.45;
      const r = (onMon ? msz : sz) * 0.6;
      ctx.save();
      ctx.globalAlpha = k * 0.85;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.62, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.55, cy + r * 0.45);
      ctx.moveTo(cx + r * 0.56, cy - r * 0.45);
      ctx.lineTo(cx - r * 0.5, cy + r * 0.52);
      ctx.stroke();
      ctx.restore();
    }

    // 双方血条
    const barW = pw * 0.34, barH = 12, barY = py + ph * 0.70;
    const heroRatio = Math.max(0, Math.min(1, b.heroSeq[step] / Math.max(1, b.heroSeq[0])));
    const monRatio = Math.max(0, Math.min(1, b.monSeq[step] / Math.max(1, b.monSeq[0])));
    const bar = (bx, ratio, c1, c2) => {
      Sp.rr(ctx, bx, barY, barW, barH, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.stroke();
      if (ratio > 0) {
        Sp.rr(ctx, bx + 1, barY + 1, Math.max(2, (barW - 2) * ratio), barH - 2, 3);
        const gg = ctx.createLinearGradient(bx, barY, bx, barY + barH);
        gg.addColorStop(0, c1);
        gg.addColorStop(1, c2);
        ctx.fillStyle = gg;
        ctx.fill();
      }
    };
    bar(px + pw * 0.08, heroRatio, '#7ee08a', '#2c8f4a');
    bar(px + pw * 0.92 - barW, monRatio, '#ff9a8a', '#a8342c');

    // 名字与血量
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#dfe6f2';
    ctx.textAlign = 'left';
    ctx.fillText('勇者', px + pw * 0.08, barY - 13);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffc9a0';
    ctx.fillText(b.name, px + pw * 0.92, barY - 13);
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#eef2f8';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(b.heroSeq[step]) + ' / ' + b.heroSeq[0], px + pw * 0.08 + barW / 2, barY + barH + 11);
    ctx.fillText(Math.round(b.monSeq[step]) + ' / ' + b.monSeq[0], px + pw * 0.92 - barW / 2, barY + barH + 11);

    // 掉血数字：跟着那一次出手往上飘
    if (hit) {
      const up = (u - HIT_AT) / (1 - HIT_AT);
      ctx.globalAlpha = Math.max(0, 1 - up);
      ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      const numX = who === 'hero' ? mx + msz / 2 : hx + sz / 2;
      const numY = top - 6 - up * 20;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,12,20,0.85)';
      ctx.fillStyle = who === 'hero' ? '#ffe9a0' : '#ff8a8a';
      ctx.strokeText('-' + (who === 'hero' ? b.heroHit : b.monHit), numX, numY);
      ctx.fillText('-' + (who === 'hero' ? b.heroHit : b.monHit), numX, numY);
      ctx.globalAlpha = 1;
    }

    // 回合圆点
    const dots = n, gap = 11, dx0 = px + pw / 2 - (dots - 1) * gap / 2;
    for (let i = 0; i < dots; i++) {
      ctx.beginPath();
      ctx.arc(dx0 + i * gap, py + ph - 14, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = i < step ? '#ffd76a' : 'rgba(255,255,255,0.22)';
      ctx.fill();
    }

    ctx.restore();
  }

  function draw() {
    const t = G.t;
    Sp.setTowerFloor(G.floor);
    ctx.save();
    if (fx.shake > 0) {
      ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
      fx.shake *= 0.85;
      if (fx.shake < 0.4) fx.shake = 0;
    }
    ctx.fillStyle = '#0c0f18';
    ctx.fillRect(0, 0, W * TS, H * TS);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) drawTile(at(x, y), x, y, t);

    if (MT.ORIGINAL50_ACTIVE) {
      const marker = FLOORS[G.floor].storyNpc;
      const visible = marker &&
        !(marker.who === 'doll' && G.flags.O50_PRINCESS_RESCUED) &&
        !(marker.who === 'thief' && G.flags.O50_F29_TUNNEL_OPENED);
      if (visible) {
        const mx = marker.x * TS, my = marker.y * TS;
        if (marker.who === 'doll') {
          if (!MT.Art || !MT.Art.draw(ctx, 'original50.doll', mx, my, TS, TS, 0)) Sp.drawNpc(ctx, mx, my, TS, 'princess');
        } else {
          Sp.drawNpc(ctx, mx, my, TS, marker.who);
        }
      }
    }

    // 3x3 Boss
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = at(x, y);
      if (!MT.ORIGINAL50_ACTIVE && (ch === '!' || ch === '?') && at(x - 1, y) !== ch && at(x, y - 1) !== ch) {
        Sp.drawFloor(ctx, x * TS, y * TS, TS * 3, true);
        Sp.drawMonster(ctx, ch, x * TS, y * TS, TS * 3);
      }
    }

    // 与手册共用战斗预测：直接在怪物格脚边标明预计战损。
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = at(x, y);
      if (!MONSTERS[ch] || (!MT.ORIGINAL50_ACTIVE && (ch === '!' || ch === '?'))) continue;
      const forecast = Rules.predict(G.hero, effMon(ch, x, y), specials(x, y));
      const label = forecast.reason === 'atk' ? '破防不足' :
        !forecast.win ? '致命 -' + forecast.loss : '-' + forecast.loss;
      const color = forecast.reason === 'atk' || !forecast.win ? '#ff9292' :
        forecast.loss === 0 ? '#9cf0a9' : '#ffda86';
      const center = x * TS + TS / 2, base = (y + 1) * TS - 6;
      const width = Math.min(TS - 2, ctx.measureText(label).width + 6);
      ctx.fillStyle = 'rgba(4,7,13,.88)';
      ctx.fillRect(center - width / 2, base - 7, width, 14);
      ctx.fillStyle = color;
      ctx.fillText(label, center, base);
    }
    ctx.restore();

    // 战斗闪光
    if (fx.flash) {
      const f = fx.flash;
      const s = (TS * (f.size || 1)) * (1 + f.t / 160);
      ctx.globalAlpha = Math.max(0, 1 - f.t / 160) * 0.8;
      ctx.fillStyle = '#fff2b0';
      ctx.fillRect(f.x * TS - (s - TS) / 2, f.y * TS - (s - TS) / 2, s, s);
      ctx.globalAlpha = 1;
    }

    // 预览完整路线；行走时只显示尚未走过的部分。
    const route = autoWalk?.floor === G.floor ? autoWalk.path : walkTarget?.floor === G.floor ? walkTarget.path : null;
    if (route?.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 210, 93, .86)';
      ctx.fillStyle = 'rgba(255, 210, 93, .85)';
      ctx.lineWidth = Math.max(2, TS * .045);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([TS * .12, TS * .09]);
      ctx.beginPath();
      ctx.moveTo((G.pos.x + .5) * TS, (G.pos.y + .5) * TS);
      for (const id of route) ctx.lineTo(((id % W) + .5) * TS, (Math.floor(id / W) + .5) * TS);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const id of route) {
        const px = ((id % W) + .5) * TS, py = (Math.floor(id / W) + .5) * TS;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, TS * .055), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 勇者：使用与《魔塔》相同的180ms格间位移，使步态与位移同步。
    const step = fx.heroStep;
    const moving = step && step.floor === G.floor && step.to.x === G.pos.x && step.to.y === G.pos.y;
    const k = moving ? Math.min(1, (performance.now() - step.start) / 180) : 1;
    Sp.drawHero(ctx, (moving ? step.from.x + (step.to.x - step.from.x) * k : G.pos.x) * TS,
      (moving ? step.from.y + (step.to.y - step.from.y) * k : G.pos.y) * TS, TS);

    // 首次点击及行走期间持续高亮目的地；画在地图与角色之上。
    if (walkTarget?.floor === G.floor) {
      const hx = walkTarget.x * TS, hy = walkTarget.y * TS;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 204, 85, .16)';
      ctx.fillRect(hx + 2, hy + 2, TS - 4, TS - 4);
      ctx.strokeStyle = '#ffd265';
      ctx.lineWidth = 3;
      ctx.strokeRect(hx + 2, hy + 2, TS - 4, TS - 4);
      ctx.restore();
    }

    // 飘字
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    fx.texts.forEach((ft) => {
      ctx.globalAlpha = Math.max(0, 1 - ft.t / 900);
      ctx.fillStyle = '#000';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1;
    drawBattle();
    ctx.restore();
  }

  function loop(now) {
    if(window.campPaused){G.t=now;if(fx.battle)fx.battle.lastNow=now;requestAnimationFrame(loop);return;}
    const dt = Math.min(48, now - (G.t || now));
    G.t = now;
    if (fx.heroStep && now - fx.heroStep.start >= 180) {
      fx.heroStep = null;
      Sp.setHeroMotion(null, false);
    }
    fx.texts.forEach((f) => { f.t += dt; f.y -= dt * 0.028; });
    fx.texts = fx.texts.filter((f) => f.t < 900);
    if (fx.flash) { fx.flash.t += dt; if (fx.flash.t > 160) fx.flash = null; }
    if (fx.battle) {
      const b = fx.battle;
      b.t += Math.max(0, now - b.lastNow) * battleSpeed;
      b.lastNow = now;
      const i = Math.min(b.beats.length - 1, Math.floor(b.t / b.beatMs));
      if (b.t < b.attackDur && i > b.soundAt) {
        b.soundAt = i;
        if (b.beats[i] === 'hero') Sfx.hit(); else Sfx.hurt();
      }
      if (b.t >= b.dur) settleBattle(b);
    }
    draw();
    requestAnimationFrame(loop);
  }

  /* ── 输入 ─────────────────────────────────────────────────── */
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
  };

  /* 触摸事件的尾巴 —— 手机端的两个老毛病都出在这里：
   *   1) 点一下方向键走两格：pointerdown 走了一格，手指抬起后浏览器又补发一个 click 走第二格
   *      （部分 WebView 里这个 click 的 detail 是 0，和键盘按 Enter 长得一模一样）；
   *   2) 撞到商人/怪物弹出界面后闪一下就消失：这个补发的 click 落在刚铺开的遮罩上，等于点了「关闭」。
   * 办法：给每一次「按下」编号，并记住当前这个 click 属于哪一次按下。
   * 只有「弹窗是在这次按下的过程中打开的」这一条尾巴会被吞掉，新按下的点击不受影响。 */
  let gestureSeq = 0;            // 每发生一次 pointerdown 自增
  let clickGesture = -1;         // 当前这个 click 归属哪一次按下
  let touchTail = false;         // 刚抬起手指，浏览器补发的 click 还没到
  let clickWasTouchTail = false; // 当前这个 click 就是那条尾巴
  let tailTimer = 0;
  const MODAL_GRACE = 350;       // 弹窗刚打开的这段毫秒里，遮罩点击不生效

  function bindInput() {
    document.querySelectorAll('[data-battle-speed]').forEach((button) => {
      button.addEventListener('click', (ev) => {
        ev.stopPropagation();
        battleSpeed = Number(button.dataset.battleSpeed) || 1;
        document.querySelectorAll('[data-battle-speed]').forEach((item) =>
          item.setAttribute('aria-pressed', item === button ? 'true' : 'false'));
      });
    });
    window.addEventListener('keydown', (e) => {
      touchTail = false;                 // 键盘操作和「手指尾巴」无关，别被上一次触摸误伤
      if ($('modal').classList.contains('show')) {
        if (e.key === 'Escape' && lastModal?.dismissable !== false && !lastModal?.dialogue) closeModal();
        return;
      }
      if (tutorial.active) {
        const tutorialDir = KEYMAP[e.key];
        if (tutorialDir) { move(tutorialDir); e.preventDefault(); return; }
        if (e.key === 'Tab') {
          const actionButton = !$('tutorialNext').hidden ? $('tutorialNext')
            : !$('tutorialFinish').hidden ? $('tutorialFinish') : null;
          e.preventDefault();
          if (actionButton) actionButton.focus({ preventScroll: true });
          return;
        }
        if ((e.key === 'Enter' || e.key === ' ') &&
            (e.target === $('tutorialNext') || e.target === $('tutorialFinish'))) return;
        e.preventDefault();
        return;
      }
      if (!$('manualOverlay').hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeManual(); }
        return;
      }
      if (!$('infoOverlay').hidden) {
        if (e.key === 'Escape') $('infoOverlay').hidden = true;
        e.preventDefault();
        return;
      }
      const dir = KEYMAP[e.key];
      if (dir) { e.preventDefault(); move(dir); return; }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); openManual(); }
      if (e.key === 'Escape') closeModal();
    });

    // 手势编号 + 尾巴识别，全部放在捕获阶段：比按钮自己的响应先跑。
    document.addEventListener('pointerdown', () => {
      gestureSeq += 1;
      touchTail = false;                       // 新手势开始（鼠标、触摸都一样）
      clearTimeout(tailTimer);
    }, true);
    document.addEventListener('touchend', () => {
      touchTail = true;
      clearTimeout(tailTimer);
      // 兜底：万一某次触摸没有补发 click，别让这条尾巴一直挂着。
      tailTimer = setTimeout(() => { touchTail = false; }, 1500);
    }, true);
    document.addEventListener('click', (ev) => {
      clickGesture = gestureSeq;
      clickWasTouchTail = touchTail;
      touchTail = false;
      if (!clickWasTouchTail) return;          // 鼠标点击、键盘激活不走这里
      if (clickGesture !== modalOpenGesture) return;
      if (performance.now() - modalOpenedAt > 1500) return;
      modalOpenGesture = -1;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);

    document.querySelectorAll('[data-move]').forEach((b) => {
      let lastFire = 0;
      const fire = (ev) => {
        ev.preventDefault();
        const now = performance.now();
        // 同一根手指重复派发（或两根手指同时按到同一个键）只认第一次
        if (now - lastFire < 90) return;
        lastFire = now;
        move(b.dataset.move);
      };
      b.addEventListener('pointerdown', fire);
      // 键盘激活（Enter / 空格）只产生 click，detail 为 0；
      // 触摸/鼠标的移动在 pointerdown 已经处理过，这里补发的 click 一律忽略。
      b.addEventListener('click', (ev) => {
        if (ev.detail !== 0 || clickWasTouchTail) return;
        fire(ev);
      });
    });

    let sx = 0, sy = 0;
    let tapHandledAt = 0;              // 上一次「原地轻点」已经处理过的时间戳
    function boardCell(cx, cy) {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.floor((cx - r.left) / (r.width / W)),
        y: Math.floor((cy - r.top) / (r.height / H))
      };
    }
    function handleBoardTap(cx, cy) {
      const { x, y } = boardCell(cx, cy);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      if (G.busy || G.dead || G.won || $('modal').classList.contains('show')) return;
      if (tutorial.active) {
        if (tutorial.stage === 'inspect-monster' && x === 4 && y === 4) {
          showMonsterAt(cx, cy);
          return;
        }
        if (tutorial.stage === 'route-first' && x === 8 && y === 5) {
          const path = findWalkPath(x, y);
          if (!path.length) return;
          walkTarget = { x, y, floor: G.floor, fromX: G.pos.x, fromY: G.pos.y, path };
          setTutorialStep('route-confirm');
          return;
        }
        if (tutorial.stage === 'route-confirm' && x === 8 && y === 5 &&
            walkTarget?.floor === G.floor && walkTarget.x === x && walkTarget.y === y &&
            walkTarget.fromX === G.pos.x && walkTarget.fromY === G.pos.y) {
          const path = walkTarget.path.slice();
          setTutorialStep('route-walk');
          startAutoWalk(x, y, path);
        }
        return;
      }
      if (MONSTERS[at(x, y)]) {
        showMonsterAt(cx, cy);
        return;
      }
      if (walkTarget?.floor === G.floor && walkTarget.x === x && walkTarget.y === y && !autoWalk &&
          walkTarget.fromX === G.pos.x && walkTarget.fromY === G.pos.y) {
        startAutoWalk(x, y, walkTarget.path);
        return;
      }
      if (autoWalk) stopAutoWalk();
      const path = findWalkPath(x, y);
      if (!path.length) {
        walkTarget = null;
        if (x !== G.pos.x || y !== G.pos.y) toast('没有可通行的路线');
        return;
      }
      walkTarget = { x, y, floor: G.floor, fromX: G.pos.x, fromY: G.pos.y, path };
      if (!G.flags.AUTO_WALK_USED) toast('路线已显示，再点一次目标格开始行走');
    }

    // 点某一格：如果是怪物，弹出它的属性
    function showMonsterAt(cx, cy) {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((cx - r.left) / (r.width / W));
      const y = Math.floor((cy - r.top) / (r.height / H));
      const ch = at(x, y);
      if (!MONSTERS[ch] || (tutorial.active && tutorial.stage !== 'inspect-monster')) return;
      const stats = effMon(ch, x, y);
      const p = Rules.predict(G.hero, stats, specials(x, y));
      modal({
        title: stats.name,
        body: '<div class="monster-preview"><canvas class="monster-preview-art" width="' + TS + '" height="' + TS + '" aria-hidden="true"></canvas>' +
          '<div class="monster-preview-stats"><span>生命 <b>' + stats.hp + '</b></span><span>攻击 <b>' + stats.atk + '</b></span>' +
          '<span>防御 <b>' + stats.def + '</b></span><span>金币 <b>' + stats.gold + '</b></span></div></div>' +
          '<div class="monster-preview-result ' + (p.win ? (p.loss ? 'warn' : 'safe') : 'danger') + '">' +
          (p.win ? (p.loss === 0 ? '预计战损：0 · 可以无伤击败' : '预计战损：' + p.loss + ' 生命 · ' + p.rounds + ' 回合')
            : (p.reason === 'atk' ? '破防不足 · 先提升攻击' : '生命不足 · 预计损失 ' + p.loss)) + '</div>',
        buttons: [{ label: '关闭', primary: true }],
        tutorialInspection: tutorial.active && tutorial.stage === 'inspect-monster',
        onMount: (root) => Sp.drawMonster(root.querySelector('.monster-preview-art').getContext('2d'), ch, 0, 0, TS)
      });
    }

    canvas.addEventListener('touchstart', (e) => {
      const t0 = e.touches[0];
      sx = t0.clientX; sy = t0.clientY;
    }, { passive: true });
    canvas.addEventListener('touchend', (e) => {
      const t0 = e.changedTouches[0];
      const dx = t0.clientX - sx, dy = t0.clientY - sy;
      if (Math.abs(dx) >= 22 || Math.abs(dy) >= 22) {
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        return;
      }
      /* 原地轻点 = 选中或确认目的地。
       * 这里不能只等浏览器补发的 click：手指滑动过一次之后紧接着轻点，
       * Chrome / 安卓 WebView 有时压根不补发这条 click（实测 20 次里丢 2 次），
       * 真机上就是「点了没反应」。所以在 touchend 直接把事情做完，
       * 后面那条 click 尾巴用时间戳挡掉，避免弹两次。 */
      tapHandledAt = performance.now();
      handleBoardTap(t0.clientX, t0.clientY);
    }, { passive: true });

    canvas.addEventListener('click', (e) => {
      if (tapHandledAt && performance.now() - tapHandledAt < 700) return;   // 这一次触摸已经在 touchend 处理过
      handleBoardTap(e.clientX, e.clientY);
    });
    // 桌面端右键仍可单独查看怪物属性，不占用选目标的两次左键操作。
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!$('modal').classList.contains('show')) showMonsterAt(e.clientX, e.clientY);
    });
  }

  /* ── 启动 ─────────────────────────────────────────────────── */
  function fitBoard() {
    const box = canvas.parentElement || canvas;
    // Measure real HUD/controls instead of leaving a flex spacer above and below the map.
    const row = box.parentElement;
    const app = document.querySelector('.app');
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    let available = Math.min(row.clientWidth, row.clientHeight);
    if (portrait) {
      const lower = document.querySelector('.lower-scene').getBoundingClientRect();
      const hint = document.querySelector('.tower-route-hint').getBoundingClientRect();
      const bottom = parseFloat(getComputedStyle(app).paddingBottom) || 0;
      available = innerHeight - row.getBoundingClientRect().top - lower.height - bottom - 6 - (hint.height ? hint.height + 6 : 0);
    }
    box.style.setProperty('--tower-map-size', Math.max(178, Math.min(row.clientWidth, available)) + 'px');
    const cap = 1400;                                  // 上限，避免超宽屏把棋盘拉得过大
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const boxStyle = getComputedStyle(box);
    const horizontalPadding = parseFloat(boxStyle.paddingLeft) + parseFloat(boxStyle.paddingRight);
    const verticalPadding = parseFloat(boxStyle.paddingTop) + parseFloat(boxStyle.paddingBottom);
    const bw = Math.max(0, (box.clientWidth || 0) - horizontalPadding);
    let bh = Math.max(0, (box.clientHeight || 0) - verticalPadding);
    if (!(bh > 40) || bh > bw * 3) bh = bw;            // 高度不确定时按宽度走（正方）
    const limit = Math.min(bw || W * TS, bh || W * TS, cap);
    const size = Math.max(160, Math.floor(limit > 0 ? limit : W * TS));
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const px = Math.round(size * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const s = px / (W * TS);
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }

  let fitPending = false;
  function scheduleFit() {
    if (fitPending) return;
    fitPending = true;
    requestAnimationFrame(() => { fitPending = false; fitBoard(); refreshTutorialOverlay(); });
  }

  function boot() {
    if (window.matchMedia('(max-width: 620px) and (orientation: portrait)').matches) {
      document.querySelector('.app').classList.add('ui-focus');
      $('btnUiFocus').setAttribute('aria-pressed', 'true');
      $('btnUiFocus').textContent = '显示信息';
    }
    fitBoard();
    window.addEventListener('resize', scheduleFit);
    window.addEventListener('orientationchange', () => setTimeout(fitBoard, 80));
    if (window.ResizeObserver && canvas.parentElement) {
      new ResizeObserver(scheduleFit).observe(canvas.parentElement);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBoard);

    $('btnSave').onclick = () => save(false);
    $('btnInfinite').onclick = () => openTestPanel();
    $('btnLoad').onclick = () => load(true);
    $('btnRestart').onclick = () => modal({
      title: '重新开始？',
      body: '<p>当前进度会被清掉（存档不会自动删除）。</p>',
      buttons: [{ label: '算了' }, { label: '重开', danger: true, cb: () => newGame() }]
    });
    $('btnShop').onclick = () => openShop();
    $('btnAd').onclick = () => adSupply();
    $('btnNotes').onclick = () => openNotes();
    $('btnTeleport').onclick = () => openTeleport();
    $('btnPickaxe').onclick = () => usePickaxe();
    $('btnBomb').onclick = () => useBomb();
    $('btnGem').onclick = () => useGemPick();
    $('btnTools').onclick = () => openTools();
    $('btnUiFocus').onclick = (e) => {
      const app = document.querySelector('.app');
      const focused = app.classList.toggle('ui-focus');
      e.currentTarget.setAttribute('aria-pressed', focused ? 'true' : 'false');
      e.currentTarget.textContent = focused ? '显示信息' : '专注地图';
      requestAnimationFrame(fitBoard);
    };
    const infoOverlay = $('infoOverlay');
    const closeInfo = () => { infoOverlay.hidden = true; document.body.classList.remove('info-open'); };
    $('btnInfo').onclick = () => { infoOverlay.hidden = false; document.body.classList.add('info-open'); };
    $('btnInfoClose').onclick = closeInfo;
    infoOverlay.onclick = (e) => { if (e.target === infoOverlay) closeInfo(); };
    document.querySelectorAll('.info-card[data-target]').forEach((card) => {
      card.onclick = () => {
        const target = $(card.dataset.target);
        if (target.disabled) { toast('当前尚不可用'); return; }
        closeInfo();
        target.click();
      };
    });
    document.querySelectorAll('[data-ad-reward]').forEach((button) => {
      button.onclick = () => claimAdReward(button.dataset.adReward);
    });
    $('btnSettings').onclick = () => modal({
      title: '设置',
      body: '<div class="settings-list"><div class="settings-row"><span><b>游戏声音</b><small>战斗、拾取与机关音效</small></span>' +
        '<button type="button" id="settingsSound" aria-pressed="' + (!Sfx.isMuted()) + '">' + (Sfx.isMuted() ? '已关闭 · 点击开启' : '已开启 · 点击关闭') + '</button></div>' +
        (window.CampOrientation?.setPortrait ? '<div class="settings-row"><span><b>屏幕方向</b><small>进入游戏默认竖屏，也可切换横屏。</small></span><div class="tower-orientation-actions"><button type="button" data-tower-orientation="portrait">竖屏</button><button type="button" data-tower-orientation="landscape">横屏</button></div></div>' : '') +
        '<div class="settings-row"><span><b>操作方式</b><small>点击方向键移动；点一次地图格子预览路线，再点同一格沿路线行走。手机上也可点击地图查看怪物信息。</small></span></div>' +
        '<div class="settings-row"><span><b>对话</b><small>点击屏幕任意位置继续，长按跳过当前对话。</small></span></div></div>',
      buttons: [{ label: '完成', primary: true }],
      onMount: (root) => {
        const sheet = root.querySelector('.sheet'); sheet.dataset.fitNative = ''; sheet.classList.add('tower-settings');
        root.querySelectorAll('[data-tower-orientation]').forEach(button => button.onclick = () => {
          if(button.dataset.towerOrientation === 'portrait') window.CampOrientation.setPortrait();
          else window.CampOrientation.setLandscape(true);
          scheduleFit();
        });
        root.querySelector('#settingsSound').onclick = (e) => {
        $('btnMute').click();
        e.currentTarget.setAttribute('aria-pressed', String(!Sfx.isMuted()));
        e.currentTarget.textContent = Sfx.isMuted() ? '已关闭 · 点击开启' : '已开启 · 点击关闭';
      }; }
    });
    document.querySelectorAll('[data-log-tab]').forEach((tab) => tab.onclick = () => {
      logTab = tab.dataset.logTab;
      document.querySelectorAll('[data-log-tab]').forEach((button) => {
        button.classList.toggle('active', button === tab);
        button.setAttribute('aria-selected', String(button === tab));
      });
      $('log').setAttribute('aria-labelledby', tab.id);
      renderLog();
    });
    $('btnTouchpad').onclick = (e) => {
      const open = document.querySelector('.boardwrap').classList.toggle('touchpad-open');
      e.currentTarget.setAttribute('aria-expanded', String(open));
      e.currentTarget.textContent = open ? '收起方向键' : '方向键';
      if (tutorial.active && tutorial.stage === 'open-touchpad' && open) {
        setTutorialStep('touchpad-move');
      }
      requestAnimationFrame(() => { fitBoard(); refreshTutorialOverlay(); });
    };
    $('btnMute').onclick = (e) => {
      const m = !Sfx.isMuted();
      Sfx.setMuted(m);
      e.target.textContent = m ? '🔇' : '🔊';
    };
    $('btnBookAll').hidden = true;
    $('tutorialFinish').onclick = finishTutorial;
    $('tutorialNext').onclick = () => {
      if (tutorial.active && tutorial.stage === 'combat-rule') setTutorialStep('inspect-monster');
    };
    $('btnManual').onclick = () => $('manualOverlay').hidden ? openManual() : closeManual();
    $('btnManualClose').onclick = closeManual;
    $('manualOverlay').onclick = (e) => { if (e.target === $('manualOverlay')) closeManual(); };
    $('modal').addEventListener('click', (e) => {
      if (e.target !== $('modal')) return;
      if (performance.now() - modalOpenedAt < MODAL_GRACE) return;   // 刚打开就被点：是手指的尾巴
      if (lastModal && lastModal.dismissable !== false) closeModal();
    });

    let campSave = null;
    try { if(new URLSearchParams(location.search).has('camp'))campSave=localStorage.getItem(SAVE_KEY); } catch(_) {}
    newGame();
    if (campSave) { try { localStorage.setItem(SAVE_KEY, campSave); load(); save(true); } catch(_) {} }
    bindInput();
    $('tutorialOverlay').hidden = true;
    window.addEventListener('resize', refreshTutorialOverlay);
    window.addEventListener('orientationchange', () => setTimeout(refreshTutorialOverlay, 90));
    offerTutorial();
    requestAnimationFrame(loop);
  }

  // syncAll / syncHud 一并导出：浏览器控制台与 tools/qa-ui.mjs 里改完状态后需要重画
  window.render_game_to_text = () => { syncDiag(); return document.getElementById("diag").textContent; };
  window.CampBack = () => {
    if (!$('manualOverlay').hidden) { closeManual(); return true; }
    if (!$('infoOverlay').hidden) { $('btnInfoClose').click(); return true; }
    if ($('modal').classList.contains('show') && lastModal?.dismissable !== false && !lastModal?.dialogue) { closeModal(); return true; }
    return false;
  };
  MT.Game = { newGame, save, load, G, adSupply, adRevive, openNotes, runeState, AD_LIMITS, syncAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
