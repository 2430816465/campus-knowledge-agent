/* 地下矿坑 V0.1 · 无头验收测试（Node 直接运行，不需要浏览器、不需要装依赖）
 *
 * 用法：
 *   node tools/headless-test.js
 *
 * 覆盖设计规格 §78 验收清单中"不依赖 UI"的全部项目：
 *   挖掘成本 / 免费返回 / 禁止斜挖 / 自动寻路 / 视野与永久记忆 / 矿物只领一次 /
 *   炸药不重复结算 / 强化矿镐 / 探矿灯按次数 / 地下泉上限 / 体力不足与耗尽 /
 *   三种结算倍率 / 通用货币首达与重复 / 历史纪录 / Seed 复现与随机性 /
 *   Validator 负面用例 / 存档隔离 / 一条"从开局挖到藏宝库"的全流程冒烟。
 *
 * 另外按 §88 的建议做批量生成体检（300 张随机图，统计最低成本路线是否合理），
 * 以及一次"假 Canvas"渲染冒烟（标题 / 矿坑 / 调试面板 / 结算面板）。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../games/mine');

/* ── 浏览器环境桩（window / localStorage） ────────────── */
const store = {};
global.window = global;
global.CampSkin = {paper:'#fcf7ef',wood:'#f5e5cf',ink:'#482e24',muted:'#817268',line:'#dfbea0',primary:'#dfa36e',green:'#6d8657',danger:'#a54338'};
global.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; },
};

/* ── 按 index.html 的顺序加载全部脚本（跳过 app.js：它需要 DOM） ── */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [];
{
  const re = /<script src="([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html))) scripts.push(m[1]);
}
for (const src of scripts) {
  if (/app\.js$/.test(src) || !src.startsWith('src/') || src.endsWith('MiningAdventure.js')) continue;
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), { filename: src });
}

const MM = global.MT.MM;
const S = MM.State.S;

/* ── 测试小工具 ───────────────────────────────────────── */
let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; failures.push(msg); console.log('  ✗ ' + msg); }
}
function section(title) { console.log('\n■ ' + title); }

function freshStore() {
  Object.keys(store).forEach((k) => delete store[k]);
  // 核心玩法测试模拟完成过新手教程的老玩家；教程开场另由 UI 冒烟检查。
  store[MM.Tutorial.KEY] = '1';
  MM.Save._dropCache();
}

/* 推进场景直到回到"可操作"状态（EXPLORING / RESULT） */
function pump(mode, maxSteps) {
  const limit = maxSteps || 800;
  let n = 0;
  while (mode.run.state !== S.EXPLORING && mode.run.state !== S.RESULT && n++ < limit) {
    mode.update(0.05);
  }
  return n;
}

function fakeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set() { return true; },
  });
}

/* 一张只有入口平台的空图（单元测试用，不跑生成器） */
function blankMap() {
  const map = new MM.MineMap(9, 20);
  map.forEach((c) => { c.terrainType = 'rock'; c.digCost = 2; });
  for (let x = 3; x <= 5; x++) {
    const c = map.get(x, 0);
    c.terrainType = 'dirt'; c.digCost = 1; c.excavated = true; c.revealed = true;
  }
  map.get(4, 0).specialType = 'entrance';
  map.vault = { x: 4, y: 18 };
  return map;
}

console.log('=== 再挖一层：矿脉远征 V1.0 无头验收测试 ===');
console.log('（默认 9×45 正式矿坑 + 9×20 对照图 · 三种岩层 · 铜/银/金/水晶 · 工具 / 工作台 / 藏宝库）');

/* ============================================================
 * ① 开局状态与局部视野
 * ============================================================ */
section('① 开局状态（§13 / §15 / §68 / §73）');
freshStore();
let mode = new MM.MiningMode('TEST-SEED-01');
mode.enter();
let run = mode.run;
ok(run.stamina === 40 && run.maxStamina === 50, '初始体力 40 / 上限 50');
ok(run.tools.bomb === 2 && run.tools.powerPick === 1 && run.tools.lamp === 1, '开局工具 💣×2 ⛏×1 🔦×1');
ok(run.playerX === 4 && run.playerY === 0, '玩家位于入口 (4, 0)');
ok(run.state === S.ENTERING, '开局处于 ENTERING（进场过场）');
ok(mode.map.validated === true && mode.genInfo.report.ok, '地图生成后通过 Validator');
ok(mode.map.h === 45 && mode.map.spec.mineId === 'oldMine', '默认地图 = 9×45 旧矿井正式矿区');
ok(mode.map.get(3, 0).excavated && mode.map.get(4, 0).excavated && mode.map.get(5, 0).excavated, '入口平台三格已挖开');
ok(mode.map.get(1, 0).revealed === true, '入口周围 3 格内已揭示');
ok(mode.map.get(0, 0).revealed === false, '曼哈顿距离 4 的格子仍是迷雾');
ok(mode.map.get(0, 19).revealed === false, '最深处开局不可见（不做全图显示）');
pump(mode);
ok(run.state === S.EXPLORING, '过场结束进入 EXPLORING');

/* ============================================================
 * ② 挖掘成本 1/2/3 与四方向限制
 * ============================================================ */
section('② 挖掘成本 / 禁止斜挖（§7 / §9 / §10 / §78①③）');
{
  const map = blankMap();
  const r = MM.State.createRun('UNIT-DIG');
  map.get(4, 1).terrainType = 'rock'; map.get(4, 1).digCost = 2;
  map.get(3, 1).terrainType = 'dirt'; map.get(3, 1).digCost = 1;
  map.get(3, 2).terrainType = 'hard'; map.get(3, 2).digCost = 3;

  const a1 = MM.Dig.begin(r, map, 4, 1);
  ok(a1.ok && a1.cost === 2, '普通岩石：扣 2 体力');
  MM.Dig.resolve(r, map, a1);
  ok(r.stamina === 38, '挖完普通岩石体力 = 38');
  MM.Move.startStep(r, map, 4, 1); MM.Move.update(r, map, 1);

  const a2 = MM.Dig.begin(r, map, 3, 1);
  ok(a2.ok && a2.cost === 1, '泥土：扣 1 体力');
  MM.Dig.resolve(r, map, a2);
  ok(r.stamina === 37, '挖完泥土体力 = 37');
  MM.Move.startStep(r, map, 3, 1); MM.Move.update(r, map, 1);

  const a3 = MM.Dig.begin(r, map, 3, 2);
  ok(a3.ok && a3.cost === 3, '坚硬岩石：扣 3 体力');
  MM.Dig.resolve(r, map, a3);
  ok(r.stamina === 34, '挖完坚硬岩石体力 = 34（1/2/3 全部准确）');
  MM.Move.startStep(r, map, 3, 2); MM.Move.update(r, map, 1);

  const diag = MM.Dig.begin(r, map, 4, 3);
  ok(!diag.ok && diag.reason === 'notAdjacent', '禁止斜挖：(4,3) 与 (3,2) 对角，被拒绝');

  /* 已挖区域免费往返（§11） */
  const stBefore = r.stamina;
  const back = MM.Move.startWalk(r, map, 4, 0);
  ok(back.ok, '沿已挖道路自动寻路回入口');
  let guard = 0;
  while (r.move && guard++ < 20) MM.Move.update(r, map, 1);
  ok(r.stamina === stBefore, '已挖区域移动 0 消耗（体力不变）');
  ok(r.playerX === 4 && r.playerY === 0, '已回到入口');
}

/* ============================================================
 * ③ 自动寻路只经过已挖格
 * ============================================================ */
section('③ 自动寻路限制（§12 / §78④）');
{
  const map = blankMap();
  const r = MM.State.createRun('UNIT-PATH');
  const a = MM.Dig.begin(r, map, 4, 1);
  MM.Dig.resolve(r, map, a);
  MM.Move.startStep(r, map, 4, 1); MM.Move.update(r, map, 1);
  const a2 = MM.Dig.begin(r, map, 4, 2);
  MM.Dig.resolve(r, map, a2);
  MM.Move.startStep(r, map, 4, 2); MM.Move.update(r, map, 1);

  const walk = MM.Move.startWalk(r, map, 4, 0);
  ok(walk.ok, '可以寻路回到起点');
  const allExcavated = walk.path.every((c) => map.get(c.x, c.y).excavated);
  ok(allExcavated, '寻路路径 100% 只经过已挖格');

  const five = MM.Move.startWalk(r, map, 5, 2);
  ok(!five.ok && five.reason === 'blocked', '目标未挖开时拒绝自动寻路');
  const b = MM.Pathfinder.bfsExcavated(map, { x: 4, y: 2 }, { x: 5, y: 2 });
  ok(b === null, 'BFS 不会把未挖格当成通路');
}

/* ============================================================
 * ④ 视野随探索展开 + 永久记忆
 * ============================================================ */
section('④ 视野（§15 / §16 / §78⑤⑥）');
{
  const map = blankMap();
  const r = MM.State.createRun('UNIT-VISION');
  const first = MM.Vision.revealAround(map, 4, 0, MM.Vision.radius(r));
  ok(first.length > 0, '入口周围揭开一圈新格子');
  ok(MM.U.manhattan(4, 0, 1, 0) <= 3 && map.get(1, 0).revealed, '半径 3 内的格子被揭示');
  ok(!map.get(0, 0).revealed, '半径外保持迷雾');

  map.get(4, 1).excavated = true;
  r.playerX = 4; r.playerY = 1;
  const second = MM.Vision.revealAround(map, 4, 1, MM.Vision.radius(r));
  ok(second.length > 0, '移动后视野继续展开');
  ok(map.get(4, 0).revealed && map.get(3, 0).revealed, '离开后旧区域保持"已揭示"（本局永久记忆）');
}

/* ============================================================
 * ⑤ 矿物只领一次 / 炸药不重复结算
 * ============================================================ */
section('⑤ 矿物结算（§22 / §25 / §78⑦⑧）');
{
  const map = blankMap();
  const r = MM.State.createRun('UNIT-MINERAL');
  const c = map.get(4, 1);
  c.resourceType = 'copper'; c.resourceValue = 5;
  const a = MM.Dig.begin(r, map, 4, 1);
  MM.Dig.resolve(r, map, a);
  ok(r.baseValue === 5 && r.resources.copper === 1, '挖开铜矿：+5 探索价值');
  const again = MM.Dig.excavate(r, map, c, 'dig');
  ok(again.skipped === true && r.baseValue === 5, '同一格再次结算被拒绝（矿物只领一次）');

  /* 炸药：十字 5 格 + 不耗体力 + 不重复结算 */
  const map2 = blankMap();
  const r2 = MM.State.createRun('UNIT-BOMB');
  map2.get(4, 1).resourceType = 'copper'; map2.get(4, 1).resourceValue = 5; map2.get(4, 1).revealed = true;
  map2.get(3, 1).resourceType = 'gold'; map2.get(3, 1).resourceValue = 20; map2.get(3, 1).revealed = true;
  map2.get(5, 1).resourceType = 'copper'; map2.get(5, 1).resourceValue = 5; map2.get(5, 1).revealed = true;
  const st0 = r2.stamina;
  const bomb = MM.Tools.tryBomb(r2, map2, 4, 1);
  ok(bomb.ok && bomb.cells.length === 4, '炸药瞄准十字范围（入口已挖格自动裁掉，剩 4 格）');
  MM.Tools.resolveBomb(r2, map2, bomb);
  ok(r2.baseValue === 30, '炸药一次结算 5+20+5 = 30');
  ok(r2.stamina === st0, '炸药不消耗体力');
  MM.Tools.resolveBomb(r2, map2, bomb);
  ok(r2.baseValue === 30, '同一炸药动作再次结算无效（防重复结算）');
  ok(r2.tools.bomb === 1, '炸药只扣 1 个');

  /* 边界裁切：不炸出地图 */
  const edge = MM.Tools.tryBomb(r2, map2, 0, 1);
  ok(edge.ok && edge.totalCells === 4, '贴边目标自动裁切（5-1=4 格，不炸出地图）');
}

/* ============================================================
 * ⑥ 强化矿镐 / 探矿灯
 * ============================================================ */
section('⑥ 工具（§26 / §27 / §78⑨⑩）');
{
  const map = blankMap();
  const r = MM.State.createRun('UNIT-TOOLS');
  map.get(4, 1).terrainType = 'hard'; map.get(4, 1).digCost = 3;
  map.get(4, 2).terrainType = 'rock'; map.get(4, 2).digCost = 2;

  ok(MM.Vision.radius(r) === 3, '基础视野 = 3');
  const lamp = MM.Tools.tryLamp(r);
  ok(lamp.ok && r.lampDigsRemaining === 5 && MM.Vision.radius(r) === 5, '探矿灯：视野 3 → 5，剩 5 次挖掘');
  ok(MM.Tools.tryLamp(r).ok === false, '没有探矿灯时无法再次使用');

  const pick = MM.Tools.tryPowerPick(r);
  ok(pick.ok && r.freeDig === true && r.tools.powerPick === 0, '强化矿镐：进入 freeDig 状态');
  ok(MM.Tools.tryPowerPick(r).ok === false, '没有强化矿镐时无法再次使用');

  const a1 = MM.Dig.begin(r, map, 4, 1);
  ok(a1.ok && a1.cost === 0 && a1.usesFreePick, '下一次挖掘成本为 0（3 体力坚硬岩石也免费）');
  MM.Dig.resolve(r, map, a1);
  ok(r.stamina === 40 && r.freeDig === false, '强化矿镐只让这一次免费，用完即失效');
  ok(r.lampDigsRemaining === 4, '这次成功挖掘消耗探矿灯 1 次（剩 4）');
  MM.Move.startStep(r, map, 4, 1); MM.Move.update(r, map, 1);

  const a2 = MM.Dig.begin(r, map, 4, 2);
  ok(a2.ok && a2.cost === 2 && !a2.usesFreePick, '再下一次恢复普通扣体力');
  MM.Dig.resolve(r, map, a2);
  ok(r.stamina === 38, '普通挖掘扣 2 体力');

  /* 探矿灯按"成功挖掘次数"消耗，而不是时间 */
  const before = r.lampDigsRemaining;
  for (let i = 0; i < 3; i++) {
    map.get(4, 3 + i).terrainType = 'dirt'; map.get(4, 3 + i).digCost = 1;
  }
  MM.Move.startStep(r, map, 4, 2); MM.Move.update(r, map, 1);
  const digs = [[4, 3], [4, 4], [4, 5]];
  digs.forEach((d, idx) => {
    const aa = MM.Dig.begin(r, map, d[0], d[1]);
    MM.Dig.resolve(r, map, aa);
    MM.Move.startStep(r, map, d[0], d[1]); MM.Move.update(r, map, 1);
    if (idx < 2) ok(r.lampDigsRemaining === before - 1 - idx, '只按挖掘次数递减（第 ' + (idx + 1) + ' 次后剩 ' + r.lampDigsRemaining + '）');
  });
  ok(r.lampDigsRemaining === 0 && MM.Vision.radius(r) === 3, '5 次成功挖掘后探矿灯结束，视野恢复 3');

  /* 炸药不消耗探矿灯次数 */
  const r2 = MM.State.createRun('UNIT-LAMP-BOMB');
  const map2 = blankMap();
  map2.get(4, 1).revealed = true;
  MM.Tools.tryLamp(r2);
  const bomb = MM.Tools.tryBomb(r2, map2, 4, 1);
  MM.Tools.resolveBomb(r2, map2, bomb);
  ok(r2.lampDigsRemaining === 5, '炸药不算"成功挖掘"，不消耗探矿灯');
}

/* ============================================================
 * ⑦ 地下泉 / 体力不足 / 体力耗尽
 * ============================================================ */
section('⑦ 体力（§13 / §14 / §29 / §35 / §51 / §78⑪⑫⑬）');
{
  const map = blankMap();
  const r = MM.State.createRun('UNIT-SPRING');
  const sp = map.get(4, 1);
  sp.specialType = 'spring'; sp.roomId = 'spring'; sp.revealed = true;
  r.stamina = 47;
  const a = MM.Dig.begin(r, map, 4, 1);
  const springEvents = MM.Dig.resolve(r, map, a);
  ok(r.stamina === 47 - a.cost && springEvents.some((ev) => ev.type === 'springFound'), '挖到泉水只发现泉眼，不自动恢复体力');
  ok(r.roomsFound.indexOf('spring') >= 0, '泉被记录进"隐藏房"');
  const springMode = new MM.MiningMode('UNIT-SPRING-UI');
  springMode.enter();
  springMode.map = map;
  springMode.run = r;
  springMode.processEvents(springEvents);
  const springStep = MM.Move.startStep(r, map, sp.x, sp.y);
  ok(springStep.ok, '挖出泉水后可以正常踏入泉格');
  if (springStep.ok) {
    r.state = S.MOVING;
    let springMoveTicks = 0;
    while (r.move && springMoveTicks++ < 50) springMode.updateMovement(0.1);
  }
  ok(!r.move && springMode.modal && springMode.modal.type === 'springChoice', '移动抵达泉水后弹出饮用选择');
  springMode.chooseSpring('now');
  ok(r.stamina === 50 && sp.springUsed, '选择立即饮用：恢复量受体力上限约束');
  ok(r.state === S.EXPLORING, '饮用泉水后回到可操作探索状态（防止卡死）');
  springMode.onCellClick(sp.x, sp.y + 1);
  ok(r.state === S.DIGGING && r.action, '饮用泉水后可以立刻继续挖掘');
  ok(springMode.useSpring(sp) === false && r.stamina === 50, '同一泉水只能使用一次');

  /* 同一 finishPending 队列还负责闸门和仓库选择，确保不会留下 MOVING 状态。 */
  const pendingMode = new MM.MiningMode('UNIT-PENDING-CHOICES');
  pendingMode.enter();
  pendingMode.run.state = S.MOVING;
  pendingMode.run.pendingGate = true;
  pendingMode.map.gate = { resolved: false, path: [] };
  pendingMode.finishPending();
  ok(pendingMode.run.state === S.EXPLORING && pendingMode.modal && pendingMode.modal.type === 'gateChoice',
    '移动后闸门选择弹出时恢复探索状态');
  pendingMode.chooseGate('dismantle');
  ok(pendingMode.run.state === S.EXPLORING && pendingMode.modal === null,
    '处理闸门选择后仍可继续探索');
  pendingMode.run.state = S.MOVING;
  pendingMode.run.pendingRoomChoice = 'warehouse';
  pendingMode.finishPending();
  ok(pendingMode.run.state === S.EXPLORING && pendingMode.modal && pendingMode.modal.type === 'warehouseChoice',
    '移动后仓库选择弹出时恢复探索状态');
  pendingMode.modal = null;
  pendingMode.run.state = S.MOVING;
  pendingMode.run.pendingWorkbench = true;
  pendingMode.finishPending();
  ok(pendingMode.run.state === S.EXPLORING && pendingMode.modal && pendingMode.modal.type === 'workbench',
    '移动后工作台选择保持可操作状态');

  /* 宝箱仓库的实际流程：挖开 → 自动踏入 → 选择效果 → 再沿已挖通道路移动。 */
  const chestMap = blankMap();
  const chest = chestMap.get(4, 1);
  chest.specialType = 'warehouseChoice';
  const chestMode = new MM.MiningMode('UNIT-CHEST-CHOICE');
  chestMode.enter();
  chestMode.map = chestMap;
  chestMode.run = MM.State.createRun('UNIT-CHEST-CHOICE');
  chestMode.run.state = S.EXPLORING;
  chestMode.run.tutorialRun = true;
  chestMode.onCellClick(chest.x, chest.y);
  let chestTicks = 0;
  while ((!chestMode.modal || chestMode.modal.type !== 'warehouseChoice') && chestTicks++ < 100) chestMode.update(0.1);
  ok(chestMode.modal && chestMode.modal.type === 'warehouseChoice'
      && chestMode.run.playerX === chest.x && chestMode.run.playerY === chest.y,
    '移动到仓库宝箱后出现工具/矿料选择');
  chestMode.chooseWarehouse('materials');
  ok(chestMode.run.state === S.EXPLORING && chestMode.modal === null,
    '选择宝箱效果后回到探索状态');
  chestMode.onCellClick(5, 0);
  ok(chestMode.run.state === S.MOVING && chestMode.run.move,
    '选择宝箱效果后可以继续移动');

  /* 防御恢复：若任一回调留下没有活动对象的动作态，下一帧立即恢复探索。 */
  const recoveryMode = new MM.MiningMode('UNIT-STALE-ACTION-STATE');
  recoveryMode.enter();
  recoveryMode.run.state = S.MOVING;
  recoveryMode.run.move = null;
  recoveryMode.modal = { type: 'warehouseChoice', salvage: {} };
  recoveryMode.chooseWarehouse('materials');
  recoveryMode.update(0.016);
  ok(recoveryMode.run.state === S.EXPLORING && recoveryMode.modal === null,
    '宝箱选项关闭后若遗留无 move 的 MOVING 状态，自动解除输入锁');
  recoveryMode.run.state = S.DIGGING;
  recoveryMode.run.action = null;
  recoveryMode.update(0.016);
  ok(recoveryMode.run.state === S.EXPLORING, 'DIGGING 但没有 action 时自动解除输入锁');

  const benchMap = blankMap();
  const bench = benchMap.get(4, 1);
  bench.specialType = 'workbench'; bench.excavated = true; bench.revealed = true;
  benchMap.get(4, 2).excavated = true; benchMap.get(4, 2).revealed = true;
  const benchMode = new MM.MiningMode('UNIT-WORKBENCH-WALK');
  benchMode.enter();
  benchMode.map = benchMap;
  benchMode.run.playerX = 4; benchMode.run.playerY = 0;
  benchMode.run.state = S.EXPLORING; benchMode.run.stamina = 0;
  benchMode.onCellClick(bench.x, bench.y);
  ok(benchMode.run.state === S.MOVING && !benchMode.modal && benchMode.run.move,
    '从相邻格点击工作台先开始免费移动，不抢先弹窗');
  let benchMoveTicks = 0;
  while (benchMode.run.move && benchMoveTicks++ < 50) benchMode.updateMovement(0.1);
  ok(benchMode.run.playerX === bench.x && benchMode.run.playerY === bench.y
    && benchMode.modal && benchMode.modal.type === 'workbench',
  '移动到工作台格后才打开工作台界面');
  benchMode.modal = null; // 模拟关闭工作台
  benchMode.onCellClick(4, 2);
  ok(benchMode.run.state === S.MOVING && benchMode.run.move && benchMode.run.stamina === 0,
    '关闭工作台后，体力为 0 仍能穿过工作台继续移动');
  benchMode.updateMovement(1);
  ok(benchMode.run.playerX === 4 && benchMode.run.playerY === 2,
    '角色成功走到工作台另一侧');

  const map2 = blankMap();
  const r2 = MM.State.createRun('UNIT-LOW');
  map2.get(4, 1).terrainType = 'hard'; map2.get(4, 1).digCost = 3;
  r2.stamina = 2;
  const no = MM.Dig.begin(r2, map2, 4, 1);
  ok(!no.ok && no.reason === 'stamina', '体力不足时禁止挖掘');
  ok(!map2.get(4, 1).excavated && r2.stamina === 2, '体力不足时格未挖开、体力未扣');

  r2.stamina = 0;
  r2.baseValue = 100;
  const summary = MM.Reward.settle(r2, MM.Save, 'direct');
  ok(summary.finalValue === 100 && summary.multiplier === 1.0, '体力耗尽直接结算 ×1.0，已获得价值 100 全部保留');
  ok(summary.kind === 'direct' && r2.state === S.RESULT, '直接结束进入 RESULT 状态');
}

/* ============================================================
 * ⑧ 三种结算倍率 / 通用货币
 * ============================================================ */
section('⑧ 结算与通用货币（§45～§52 / §78⑮⑯⑰⑱⑲）');
{
  freshStore();
  const r1 = MM.State.createRun('UNIT-END');
  r1.baseValue = 100;
  const ended = MM.Reward.settle(r1, MM.Save, 'direct');
  ok(ended.multiplier === 1 && ended.finalValue === 100, '普通撤离：基础价值结算（100 → 100，V0.6 无倍率）');
  ok(MM.Save.records().bestValue === 100, '历史最高单局价值已保存（V0.6 规则）');

  const r2 = MM.State.createRun('UNIT-T1');
  r2.baseValue = 50;
  MM.Reward.settle(r2, MM.Save, 'direct');
  ok(MM.Save.currency() === 0 && MM.Save.records().treasureReachCount === 0, '未抵达藏宝库不发通用货币');

  /* 藏宝库抵达记入局外进度，实际结算由玩家选择。 */
  function reachTreasure(seed) {
    const g = MM.Generator.generateValidated(seed);
    const map = g.map;
    const r = MM.State.createRun(seed);
    const vx = map.vault.x, vy = map.vault.y;
    const stand = map.get(vx, vy - 1);
    stand.excavated = true; stand.revealed = true;
    r.playerX = vx; r.playerY = vy - 1;
    r.stamina = 40;
    const action = MM.Dig.begin(r, map, vx, vy);
    const before = r.baseValue;
    const evs = MM.Dig.resolve(r, map, action);
    const arrival = evs.find((ev) => ev.type === 'treasureReached');
    if (arrival) MM.Save.markTreasureArrival(r, map, { x: arrival.x, y: arrival.y });
    return { run: r, map, events: evs, gained: r.baseValue - before, seed };
  }

  const t1 = reachTreasure('TREASURE-A');
  ok(t1.run.treasureReached === true, '挖通藏宝库入口 → 立即判定最深层探索成功（§44）');
  ok(t1.gained === MM.BALANCE.TREASURE_VALUE, '抵达藏宝库直接获得大量探索价值 +' + MM.BALANCE.TREASURE_VALUE);
  ok(MM.Save.records().treasureReachCount === 1 && MM.Save.records().treasureFirstClear === true,
    '抵达时立即写入首次抵达档案，不必等结算');
  ok(t1.run.state !== S.RESULT, '抵达藏宝库不会自动结束本局');
  const s1 = MM.Reward.settle(t1.run, MM.Save, 'treasure');
  ok(s1.multiplier === 1 && s1.finalValue === s1.baseValue, '玩家选择结算后按基础价值入账（无倍率）');
  ok(s1.currencyGranted === 12 && s1.firstTreasure === true, '首次抵达：藏宝库 +10、旧矿井首通 +2');
  ok(MM.Save.records().treasureReachCount === 1 && MM.Save.records().treasureFirstClear === true, '首达记录写入');

  const t2 = reachTreasure('TREASURE-B');
  const s2 = MM.Reward.settle(t2.run, MM.Save, 'treasure');
  ok(s2.currencyGranted === 2 && s2.firstTreasure === false, '重复抵达：只给 +2');
  ok(MM.Save.currency() === 14, '通用货币累计 = 14（首达 / 首通 / 重复抵达）');
  MM.Reward.settle(t2.run, MM.Save, 'treasure');
  ok(MM.Save.currency() === 14, '同一局重复结算不会重复发货币');
}

/* ============================================================
 * ⑨ 历史纪录 / 存档隔离
 * ============================================================ */
section('⑨ 存档（§54 / §70 / §71 / §78⑳㉔）');
{
  freshStore();
  const save = MM.Save;
  ok(save.KEY === 'forgotten-tower.mining.save.v1', '矿坑使用独立存档键');
  ok(save.KEY !== 'forgotten-tower.original50.v1' && save.KEY !== 'forgotten-tower.td.save.v1', '与主魔塔 / 守塔战线键完全隔离');

  save.recordRun({}, { maxDepth: 12, finalValue: 300, excavated: 30, treasureReached: false });
  ok(save.records().bestDepth === 12 && save.records().bestValue === 300 && save.records().totalDigs === 30, '保存历史最深 / 最高价值 / 累计挖掘');
  save.recordRun({}, { maxDepth: 8, finalValue: 200, excavated: 10, treasureReached: false });
  ok(save.records().bestDepth === 12 && save.records().bestValue === 300, '更差的成绩不会覆盖历史纪录');
  save.recordRun({}, { maxDepth: 18, finalValue: 900, excavated: 50, treasureReached: true });
  ok(save.currency() === 12 && save.records().treasureReachCount === 1, '首达 +10 与矿区首通 +2 均发放，抵达次数 = 1');

  /* 账号级通用货币：与"再守一波"的 metaProgress 互通（§70） */
  freshStore();
  localStorage.setItem(save.TD_COMPAT_KEY, JSON.stringify({
    v: '0.1.0',
    towerDefenseSave: { unlockedMaps: ['map01'], mapRecords: { map01: { cleared: true } } },
    metaProgress: { currency: 4 },
  }));
  save.mainPlaceholder.save({ floor: 5, gold: 77 });

  ok(save.currency() === 4, '读取时兼容吸收再守一波的 metaProgress.currency');
  save.addCurrency(6);
  ok(save.currency() === 10, '通用货币 +6 → 10');
  const td = JSON.parse(localStorage.getItem(save.TD_COMPAT_KEY));
  ok(td.towerDefenseSave.mapRecords.map01.cleared === true && td.metaProgress.currency === 10,
    '同步只改 currency 一个字段，不动守塔战线其他数据');
  ok(save.mainPlaceholder.load().floor === 5 && save.mainPlaceholder.load().gold === 77,
    '主模式占位存档完全不受矿坑操作影响');

  save.mainPlaceholder.addFloor();
  ok(save.mainPlaceholder.load().floor === 6, '占位主模式自己可以正常"上一层"');
  save.resetMining();
  ok(save.records().bestDepth === 0 && save.records().bestValue === 0, '清空矿坑存档');
  ok(save.currency() === 10, '清档不影响账号级通用货币（§70）');
  ok(save.mainPlaceholder.load().floor === 6, '清档不影响主模式占位存档');
}

/* ============================================================
 * ⑩ Seed 复现 / 随机性
 * ============================================================ */
section('⑩ Seed（§74 / §76 / §78㉑㉒）');
{
  const a = MM.Generator.generateValidated('REPRO-X');
  const b = MM.Generator.generateValidated('REPRO-X');
  ok(a.map.digest() === b.map.digest(), '同一 Seed：两次生成的地图逐格一致');
  ok(JSON.stringify(a.map.vault) === JSON.stringify(b.map.vault), '同一 Seed：藏宝库位置一致');
  ok(a.map.attempt === b.map.attempt && a.attempts === b.attempts, '同一 Seed：重试次数一致');

  const c = MM.Generator.generateValidated('REPRO-Y');
  ok(a.map.digest() !== c.map.digest(), '不同 Seed：地图不同（真随机，不是固定测试图）');

  const seeds = {};
  for (let i = 0; i < 60; i++) seeds[MM.newSeed()] = true;
  ok(Object.keys(seeds).length >= 55, '随机 Seed 基本不重复（60 次生成 ≥ 55 个不同值）');
}

/* ============================================================
 * ⑩.5 地图预设：9×45 正式图 / 9×20 快速图（§79）
 * ============================================================ */
section('⑩.5 地图预设（9×45 正式图 / 9×20 快速对照图）');
{
  ok(MM.mapSpec('full').DEPTH === 45 && MM.mapSpec('v01').DEPTH === 20, '两种预设尺寸正确（9×45 / 9×20）');

  const gv = MM.Generator.generateValidated('V01-CHECK', 'v01');
  ok(gv.report.ok && gv.map.h === 20, '9×20 快速测试图仍可生成并通过验证');
  ok(gv.map.cells.every((c) => c.resourceType === null || MM.mapSpec('v01').resourcePool.indexOf(c.resourceType) >= 0),
    '9×20 图只出现铜 / 金（V0.1 对照）');

  const gf = MM.Generator.generateValidated('FULL-CHECK', 'full');
  ok(gf.map.h === 45 && gf.report.stats.mineralCells >= 50, '9×45 正式图高度 45 且矿物充足（' + gf.report.stats.mineralCells + ' 格）');

  const m = new MM.MiningMode('TOGGLE-1');
  m.enter();
  pump(m);
  ok(m.map.spec.mineId === 'oldMine' && m.map.h === 45, '默认真机开局 = 9×45');
  m.debugAction('mapToggle');
  pump(m);
  ok(m.map.spec.id === 'v01' && m.map.h === 20, '调试面板一键切换到 9×20 快速图');
  m.debugAction('mapToggle');
  pump(m);
  ok(m.map.spec.mineId === 'oldMine' && m.map.h === 45, '再切回 9×45 正式图');
}

/* ============================================================
 * ⑪ 批量生成体检（§20 / §84 / §88：连续生成几十张看最低成本路线）
 * ============================================================ */
section('⑪ 生成器 + Validator 批量体检（300 张 9×45 正式图）');
{
  const V = MM.mapSpec('full').validator;
  let bad = 0, retry = 0, repairRounds = 0, fallback = 0;
  let minTc = Infinity, maxTc = 0, maxMid = 0, minMinerals = Infinity, minHints = Infinity;
  let reach63 = 0, reach40 = 0;
  const mineralTypes = {}, roomTypes = {};
  const vaultXs = {}, routeXs = {};
  /* P2：岔路与线索统计 */
  const routeDirtRunMax = (map) => {
    let run = 0, mx = 0;
    for (let y = 1; y < map.h; y++) {
      let rc = null;
      for (let k = 0; k < map.mainRoutePath.length; k++) {
        if (map.mainRoutePath[k].y === y) { rc = map.mainRoutePath[k]; break; }
      }
      if (!rc) continue;
      const c = map.get(rc.x, y);
      if (c && c.terrainType === 'dirt' && !c.specialType && !c.roomId && !c.branchId) {
        run++;
        if (run > mx) mx = run;
      } else run = 0;
    }
    return mx;
  };
  const branchStats = {
    min: Infinity, max: 0, tiersLow: 0, tiersHigh: 0,
    clueMaxDist: 0, roomClueMaxDist: 0, runMax: 0, runMaxClean: 0,
    lowCostSum: 0, lowCostN: 0, highCostSum: 0, highCostN: 0,
  };

  for (let i = 0; i < 300; i++) {
    const g = MM.Generator.generateValidated('BATCH-' + i);
    const rep = g.report;
    if (g.attempts > 1) retry++;
    if (g.repairs > 0) repairRounds++;
    if (g.repairs === -1) fallback++;
    if (!rep.ok) { bad++; continue; }
    minTc = Math.min(minTc, rep.stats.treasureCost);
    maxTc = Math.max(maxTc, rep.stats.treasureCost);
    maxMid = Math.max(maxMid, rep.stats.midCost);
    minMinerals = Math.min(minMinerals, rep.stats.mineralCells);
    minHints = Math.min(minHints, rep.stats.hints);
    if (rep.stats.treasureCost <= 63) reach63++;   // 40体力 + 泉水8 + 矿镐3 + 两发炸药≈12
    if (rep.stats.treasureCost <= 40) reach40++;

    const m = g.map;
    const plan = m.plan;
    if (!plan || plan.rooms.length < 2 || plan.rooms.length > 4) bad++;
    if (plan && plan.rooms.indexOf('spring') < 0) bad++;
    if (plan && plan.missing.length) bad++;
    (plan ? plan.rooms : []).forEach((id) => {
      roomTypes[id] = (roomTypes[id] || 0) + 1;
      if (!m.roomCells(id).length) bad++;
    });
    if (m.roomCells('treasure').length < 1) bad++;
    if (plan && plan.rooms.indexOf('minecart') >= 0) {
      const d = plan.minecartDest, cart = plan.minecart;
      const nOpen = d ? MM.Pathfinder.DIRS4.filter((dd) => {
        const n = m.get(d.x + dd[0], d.y + dd[1]);
        return n && n.y > 0 && n.roomId !== 'treasure';
      }).length : 0;
      if (!d || d.y - cart.y < MM.MINECART_CFG.MIN_DIST || d.y - cart.y > MM.MINECART_CFG.MAX_DIST
        || nOpen < MM.MINECART_CFG.DEST_CLEAR_NEIGHBORS) bad++;
    }
    m.cells.forEach((cc) => { if (cc.resourceType) mineralTypes[cc.resourceType] = (mineralTypes[cc.resourceType] || 0) + 1; });

    /* P2：岔路（数量 / 层级 / 线索可见 / 入口成本 / 奖励内容）与连续泥土段 */
    const brs = m.branches || [];
    branchStats.min = Math.min(branchStats.min, brs.length);
    branchStats.max = Math.max(branchStats.max, brs.length);
    const tierSet = {};
    brs.forEach((b) => {
      tierSet[b.tier] = true;
      if (b.tier === 'low') { branchStats.tiersLow++; branchStats.lowCostSum += b.approxCost; branchStats.lowCostN++; }
      else { branchStats.tiersHigh++; branchStats.highCostSum += b.approxCost; branchStats.highCostN++; }
      if (!b.cells || b.cells.length < 3) bad++;
      if (b.approxCost > MM.BALANCE.GENERATOR.BRANCH_ENTRY_COST_MAX) bad++;
      const clueCell = b.clue ? m.get(b.clue.x, b.clue.y) : null;
      if (!clueCell || !clueCell.clueType) bad++;
      else branchStats.clueMaxDist = Math.max(branchStats.clueMaxDist, MM.Generator.routeDistance(m, clueCell.x, clueCell.y));
      const cells = (b.cells || []).map((p) => m.get(p.x, p.y));
      cells.forEach((c) => { if (!c || !c.branchId) bad++; });
      const hasOre = cells.some((c) => c && c.resourceType);
      const hasCache = cells.some((c) => c && c.specialType === 'lostChest');
      if (b.tier === 'low' && !hasOre) bad++;
      if (b.tier === 'high' && (!hasOre || !hasCache)) bad++;
    });
    if (!tierSet.low || !tierSet.high) bad++;
    const runMax = routeDirtRunMax(m);
    branchStats.runMax = Math.max(branchStats.runMax, runMax);
    /* 局部修正会把路径补成泥土，可能重新出现长泥土段；上限只对"无需修正"的原生图断言 */
    if (g.repairs === 0) branchStats.runMaxClean = Math.max(branchStats.runMaxClean, runMax);
    (plan ? plan.rooms : []).forEach((id) => {
      const room = m.rooms[id];
      const clueCell = room && room.clue ? m.get(room.clue.x, room.clue.y) : null;
      if (!clueCell || !clueCell.clueType) { bad++; return; }
      branchStats.roomClueMaxDist = Math.max(branchStats.roomClueMaxDist,
        MM.Generator.routeDistance(m, clueCell.x, clueCell.y));
    });

    vaultXs[m.vault.x] = (vaultXs[m.vault.x] || 0) + 1;
    const rowCells = m.mainRoutePath.filter((c) => c.y === 32);
    const rx = rowCells[rowCells.length - 1].x;
    routeXs[rx] = (routeXs[rx] || 0) + 1;
  }

  ok(bad === 0, '300 张地图全部通过 Validator（内容 / 房间 / 成本全部合格）');
  ok(fallback === 0, '没有任何一张需要"兜底强改"（生成器本身健康）');
  ok(retry <= 30, '绝大多数一次生成通过（重试 ' + retry + ' 张）');
  ok(repairRounds <= 90, '偶发问题基本靠局部修正解决（修正 ' + repairRounds + ' 次 / 300 张，占比 < 30%）');
  ok(minTc >= V.TREASURE_MIN_COST && maxTc <= V.TREASURE_MAX_COST,
    '藏宝库理论最低成本全部在 [' + minTc + ', ' + maxTc + '] ⊂ [' + V.TREASURE_MIN_COST + ', ' + V.TREASURE_MAX_COST + ']（不存在理论 80+ 的死图）');
  ok(maxMid <= V.MID_DEPTH_BUDGET,
    '32m 中段理论最低成本 ≤ ' + V.MID_DEPTH_BUDGET + '（最大 ' + maxMid + '）——30~35m 区域在初始 40 体力的合理比例内（§20）');
  ok(minMinerals >= V.MIN_MINERAL_CELLS, '每张图矿物格 ≥ ' + V.MIN_MINERAL_CELLS + '（最少 ' + minMinerals + '）');
  ok(minHints >= 3, '每张图都有藏宝库方向提示（最少 ' + minHints + ' 格）');
  ok(Object.keys(mineralTypes).length === 4, '铜/银/金/水晶四种矿物全部实装（' + JSON.stringify(mineralTypes) + '）');
  ok(roomTypes.spring === 300, '地下泉每局必出（300/300，§29）');
  ok(MM.ROOM_ORDER.every((id) => (roomTypes[id] || 0) >= 5), '8 类隐藏房在 300 局中全部出现（' + JSON.stringify(roomTypes) + '）');
  ok((roomTypes.mysteryRoom || 0) < (roomTypes.goldenVein || 0), '神秘石室是最稀有的房间（§40）');
  ok(branchStats.min >= 2 && branchStats.max <= 3,
    'P2：每张图 2～3 条岔路（最少 ' + branchStats.min + '，最多 ' + branchStats.max + '）');
  ok(branchStats.tiersLow > 0 && branchStats.tiersHigh > 0,
    'P2：低收益 / 高收益两种岔路都存在（' + branchStats.tiersLow + ' / ' + branchStats.tiersHigh + ' 条）');
  ok(branchStats.clueMaxDist <= MM.BALANCE.GENERATOR.CLUE_MAX_ROUTE_DIST,
    'P2：岔路线索全部进入主矿道视野（最大距离 ' + branchStats.clueMaxDist + ' ≤ ' + MM.BALANCE.GENERATOR.CLUE_MAX_ROUTE_DIST + '）');
  ok(branchStats.roomClueMaxDist <= MM.BALANCE.GENERATOR.CLUE_MAX_ROUTE_DIST,
    'P2：房间线索全部进入主矿道视野（最大距离 ' + branchStats.roomClueMaxDist + '）');
  ok(branchStats.runMaxClean <= MM.BALANCE.GENERATOR.BRANCH_RUN_CAP,
    'P2：原生图主矿道连续泥土段 ≤ ' + MM.BALANCE.GENERATOR.BRANCH_RUN_CAP + ' 格（实测最长 ' + branchStats.runMaxClean + '，含修正图整体最长 ' + branchStats.runMax + '）');
  ok((branchStats.highCostSum / branchStats.highCostN) > (branchStats.lowCostSum / branchStats.lowCostN),
    'P2：高收益岔路的入口成本更高（低 ' + (branchStats.lowCostSum / branchStats.lowCostN).toFixed(1)
    + ' vs 高 ' + (branchStats.highCostSum / branchStats.highCostN).toFixed(1) + '）');
  ok(reach40 / 300 < 0.5, '只用初始 40 体力能摸到藏宝库的图很少（' + (reach40 / 3).toFixed(1) + '%）——§19 不保证初始体力直达');
  ok(reach63 / 300 >= 0.6, '配齐泉水 + 工具后大部分图可抵达藏宝库（' + (reach63 / 3).toFixed(1) + '%）——不是"运气死图"（§83/§84）');
  ok(Object.keys(vaultXs).length >= 6, '藏宝库横向位置随机（300 图覆盖 ' + Object.keys(vaultXs).length + ' 列）');
  ok(Object.keys(routeXs).length >= 4, '低成本主矿道横向位置随 Seed 变化（§85：不会永远直线向下）');

  const sample = MM.Generator.generateValidated('BATCH-0');
  console.log('  · 抽样：Seed=BATCH-0 · ' + sample.map.spec.name + ' · 尝试 ' + sample.attempts + ' 次 · 32m 成本 '
    + sample.report.stats.midCost + ' · 藏宝库成本 ' + sample.report.stats.treasureCost
    + ' · 矿物 ' + sample.report.stats.mineralCells + ' 格 · 提示 ' + sample.report.stats.hints + ' 格');
}

/* ============================================================
 * ⑫ Validator 负面用例（§78㉓）
 * ============================================================ */
section('⑫ Validator 负面用例（能识破明显不可探索的地图）');
{
  /* (a) 全图成本 99：理论最低成本远超预算 */
  const mapA = MM.Generator.generate('NEG-A');
  mapA.forEach((c) => { c.digCost = 99; });
  const repA = MM.Validator.validate(mapA);
  ok(!repA.ok && repA.failures.some((f) => f.code === 'midDepth' || f.code === 'treasureTooExpensive'),
    '识破"理论最低成本 80+"的不可完成地图');

  /* (b) 藏宝库缺失 */
  const mapB = MM.Generator.generate('NEG-B');
  mapB.get(mapB.vault.x, mapB.vault.y).specialType = null;
  mapB.vault = null;
  const repB = MM.Validator.validate(mapB);
  ok(!repB.ok && repB.failures.some((f) => f.code === 'vaultMissing'), '识破"没有藏宝库"的地图');

  /* (c) 矿物 / 提示不足 */
  const mapC = MM.Generator.generate('NEG-C');
  mapC.forEach((c) => {
    c.resourceType = null; c.resourceValue = 0;
    if (c.clueType === 'goldGlow' || c.clueType === 'goldCrack') c.clueType = null;
  });
  const repC = MM.Validator.validate(mapC);
  ok(!repC.ok && repC.failures.some((f) => f.code === 'minerals') && repC.failures.some((f) => f.code === 'hints'),
    '识破"矿物不足 / 没有方向提示"的地图');
}

/* ============================================================
 * ⑬ 玩到藏宝库的全流程冒烟（§73 核心循环一条链）
 * ============================================================ */
section('⑬ 全流程冒烟：进入 → 挖通 → 工具 → 藏宝库 → 结算');
{
  freshStore();
  mode = new MM.MiningMode('FLOW-1');
  mode.enter();
  pump(mode);
  run = mode.run;
  ok(run.state === S.EXPLORING, '流程：进入矿坑');

  mode.useTool('lamp');
  ok(run.lampDigsRemaining === 5, '流程：使用探矿灯（视野 5）');
  mode.useTool('powerPick');
  ok(run.freeDig === true, '流程：使用强化矿镐（下一次免费）');

  /* 找一块已揭示、带矿物、在炸药射程内的格子炸掉（§64） */
  let bombTarget = null;
  for (let y = 1; y < mode.map.h && !bombTarget; y++) {
    for (let x = 0; x < mode.map.w; x++) {
      const cc = mode.map.get(x, y);
      if (cc.revealed && !cc.excavated && cc.resourceType
        && MM.U.manhattan(run.playerX, run.playerY, x, y) <= MM.BALANCE.TOOL.BOMB_RANGE) { bombTarget = cc; break; }
    }
  }
  if (bombTarget) {
    const before = run.baseValue;
    mode.toggleBomb();
    mode.onCellClick(bombTarget.x, bombTarget.y);
    pump(mode);
    ok(run.tools.bomb === 1 && run.baseValue > before, '流程：炸药炸开并正常结算矿物（工具数量 -1）');
    ok(run.state === S.EXPLORING, '流程：爆炸动画结束后恢复可操作');
  } else {
    ok(false, '流程：应能找到炸药目标（视野内应有带矿格）');
  }

  /* 沿"理论最低成本路径"一路挖到藏宝库 */
  const an = MM.Pathfinder.analyze(mode.map, mode.map.entrance);
  const path = an.pathTo(mode.map.vault.x, mode.map.vault.y);
  ok(!!path && path.length > 5, '流程：入口 → 藏宝库存在理论路径（' + (path ? path.length : 0) + ' 格）');

  let refills = 0;
  let steps = 0;
  let rides = 0;
  let guard = 0;
  while (run.state !== S.RESULT && guard++ < 600) {
    pump(mode);
    if (run.state === S.RESULT) break;
    /* 弹窗：沿目标路径处理补给、工作台、仓库与矿车，不让新系统卡住旧通关冒烟。 */
    if (mode.modal) {
      if (mode.modal.type === 'supply') mode.chooseSupply(0);
      else if (mode.modal.type === 'workbench') mode.modal = null; // 本测试只验证到达藏宝库，不测制作平衡
      else if (mode.modal.type === 'warehouseChoice') mode.chooseWarehouse('materials');
      else if (mode.modal.type === 'minecart') { mode.rideMinecart(); rides++; }
      else if (mode.modal.type === 'treasureChoice') mode.settle('treasure');
      else mode.modal = null;
      pump(mode);
      continue;
    }

    const an2 = MM.Pathfinder.analyze(mode.map, { x: run.playerX, y: run.playerY });
    const path2 = an2.pathTo(mode.map.vault.x, mode.map.vault.y);
    if (!path2 || !path2.length) { ok(false, '流程：从当前位置找不到通往藏宝库的路径'); break; }
    const cc = mode.map.get(path2[0].x, path2[0].y);
    if (cc.excavated) {
      mode.onCellClick(cc.x, cc.y);
      pump(mode);
      steps++;
      continue;
    }
    if (run.stamina < cc.digCost && !run.freeDig) { run.stamina = run.maxStamina; refills++; }
    mode.onCellClick(cc.x, cc.y);
    pump(mode);
    steps++;
    if (steps > 400) break;
  }
  pump(mode, 3000);

  ok(run.treasureReached === true, '流程：挖通藏宝库入口，判定最深层成功');
  ok(run.state === S.RESULT, '流程：玩家在藏宝库选择结算后进入 RESULT');
  const sum = run.summary;
  ok(!!sum && sum.kind === 'treasure' && sum.multiplier === 1, '流程：藏宝库选择结算（无倍率）');
  ok(sum.finalValue === sum.baseValue, '流程：最终价值 = 基础价值（' + sum.baseValue + ' → ' + sum.finalValue + '）');
  ok(sum.excavated > 20, '流程：挖掘 ' + sum.excavated + ' 格（45m 正式图）');
  ok(sum.roomCount >= 1 && sum.treasureReached,
    '流程：沿最低成本路线至少发现藏宝库（隐藏区域 ' + sum.roomCount + ' 处；泉 / 仓库在支路上，被跳过属正常取舍）');
  ok(refills <= 6, '流程：体力恢复次数 ≤ 6（模拟泉水补给 ' + refills + ' 次）');
  ok(rides <= 2, '流程：矿车乘坐 ' + rides + ' 次（顺路遇到矿车站时才会乘坐）');
  ok(run.stamina >= 0, '流程：体力从未变成负数');

  const rec2 = MM.Save.records();
  ok(rec2.bestDepth >= 40 && rec2.treasureReachCount >= 1 && rec2.treasureFirstClear, '流程：历史纪录 + 藏宝库记录已保存');
  ok(MM.Save.currency() >= 10, '流程：通用货币已发放（' + MM.Save.currency() + '）');
}

/* ============================================================
 * ⑭ 「返回入口 → 安全撤离」完整流程（§49 / §59 / §78⑭⑮）
 * ============================================================ */
section('⑭ 返回入口安全撤离');
{
  freshStore();
  const m = new MM.MiningMode('RETURN-1');
  m.enter();
  pump(m);
  const st0 = m.run.stamina;
  m.onCellClick(4, 1);
  pump(m);
  ok(m.run.playerY === 1, '挖开并进入第 1 格');
  const st1 = m.run.stamina;
  ok(st1 < st0, '挖掘消耗了体力（' + (st0 - st1) + ' 点）');

  m.onMainButton();
  ok(m.run.state === S.MOVING, '点击「返回入口」开始沿已挖道路走回');
  pump(m);
  ok(m.run.playerX === 4 && m.run.playerY === 0, '回到入口');
  ok(m.run.stamina === st1, '返回过程 0 体力消耗（§11）');

  m.onMainButton();
  ok(m.run.state === S.EXPLORING, 'V0.6：入口不再是撤离方式（点击无效，仍可继续探索）');
  m.requestDirectEnd(); m.requestDirectEnd();
  ok(m.run.state === S.RESULT && m.run.summary.kind === 'direct' && m.run.summary.multiplier === 1,
    '普通撤离：任意位置结束 → 基础价值结算');
  ok(m.run.summary.finalValue === m.run.summary.baseValue, '普通撤离最终价值 = 基础价值（无倍率）');
}

/* ============================================================
 * ⑭.5 V0.6 规则闭环（P1）：结算单一化 / 矿车双向 / 深度标注 / 纪录版本
 * ============================================================ */
section('⑭.5 V0.6 规则闭环（P1）');
{
  /* ① 深度标注统一：1 格 = 1m，入口 0m，最深 44m / 19m */
  ok(MM.mapSpec('full').DEPTH_LABEL === 44 && MM.mapSpec('v01').DEPTH_LABEL === 19,
    '深度标注统一：9×45 → 最深 44m；9×20 → 19m');

  /* ② 纪录版本与迁移 */
  freshStore();
  localStorage.setItem(MM.Save.KEY, JSON.stringify({
    v: '0.5.0',
    miningSave: { bestDepth: 30, bestValue: 500, treasureFirstClear: true, treasureReachCount: 2, totalDigs: 40 },
  }));
  MM.Save._dropCache();
  let rec = MM.Save.records();
  ok(rec.bestDepth === 0 && rec.bestValue === 0, '旧规则纪录不进入 V0.6 新纪录（v2 从零开始）');
  ok(rec.legacy.bestDepth === 30 && rec.legacy.bestValue === 500 && rec.legacy.totalDigs === 40,
    '旧纪录完整保留在 legacy（可查看）');
  ok(rec.treasureFirstClear === true && rec.treasureReachCount === 2, '与规则无关的藏宝库计数沿用');
  MM.Save.recordRun({}, { maxDepth: 25, finalValue: 300, excavated: 10, treasureReached: false });
  rec = MM.Save.records();
  ok(rec.bestDepth === 25 && rec.bestValue === 300 && rec.totalDigs === 10, 'V0.6 新纪录正常写入');
  ok(rec.legacy.bestDepth === 30 && rec.legacy.bestValue === 500, '写入新纪录不覆盖旧纪录');
  const again = MM.Save.recordRun({}, { maxDepth: 30, finalValue: 500, excavated: 5, treasureReached: false });
  ok(again.bestDepthImproved === true && MM.Save.records().bestDepth === 30, '新纪录比较只基于 v2（30 > 25）');

  /* ③ 任意位置结束 → 基础价值；体力 0 也能结算；同一局唯一结算 */
  freshStore();
  const mapEnd = blankMap();
  const rEnd = MM.State.createRun('P1-END');
  const aEnd = MM.Dig.begin(rEnd, mapEnd, 4, 1);
  MM.Dig.resolve(rEnd, mapEnd, aEnd);
  const valueEnd = rEnd.baseValue;
  rEnd.stamina = 0;
  const sEnd = MM.Reward.settle(rEnd, MM.Save, 'direct');
  ok(sEnd.finalValue === valueEnd && sEnd.multiplier === 1, '体力 0 时任意位置结束：基础价值结算（' + valueEnd + '）');
  ok(MM.Reward.settle(rEnd, MM.Save, 'direct') === sEnd, '同一局重复结算返回同一结果（唯一结算）');

  /* ④ 矿车双向连接 + 自动返回经过连接 */
  let cartMap = null;
  for (let i = 0; i < 200 && !cartMap; i++) {
    const gm = MM.Generator.generateValidated('CART2-' + i).map;
    if (gm.plan.rooms.indexOf('minecart') >= 0) cartMap = gm;
  }
  ok(!!cartMap, '找到矿车样本');
  if (cartMap) {
    const cart = cartMap.plan.minecart;
    const dest = cartMap.plan.minecartDest;
    const r2 = MM.State.createRun('P1-CART');
    const stand = cartMap.get(cart.x, cart.y - 1);
    stand.excavated = true; stand.revealed = true;
    r2.playerX = cart.x; r2.playerY = cart.y - 1;
    const a2 = MM.Dig.begin(r2, cartMap, cart.x, cart.y);
    MM.Dig.resolve(r2, cartMap, a2);
    MM.Move.startStep(r2, cartMap, cart.x, cart.y);
    MM.Move.update(r2, cartMap, 1);
    ok(MM.Cart.usable(cartMap) === false, '只挖开车站时双向连接还不可用');

    /* 模拟玩家已从入口挖出一条竖井通到车站，并在第 0 行与入口平台连通 */
    for (let y = 0; y < cart.y; y++) {
      const c = cartMap.get(cart.x, y);
      if (c) { c.excavated = true; c.revealed = true; }
    }
    for (let x = Math.min(cart.x, cartMap.entrance.x); x <= Math.max(cart.x, cartMap.entrance.x); x++) {
      const c = cartMap.get(x, 0);
      if (c) { c.excavated = true; c.revealed = true; }
    }

    const st0 = r2.stamina, val0 = r2.baseValue;
    const res1 = MM.Cart.ride(r2, cartMap, cartMap.get(cart.x, cart.y));
    ok(res1.ok && r2.playerY === dest.y, '乘坐前往深处：' + cart.y + 'm → ' + r2.playerY + 'm');
    ok(cartMap.get(dest.x, dest.y).specialType === 'cartStop', '目的地被标记为可乘车站点');
    ok(r2.stamina === st0 && r2.baseValue === val0, '乘坐不消耗体力、不获得跳过的矿物');
    let middleDug = 0;
    for (let y = cart.y + 1; y < dest.y; y++) {
      for (let x = 0; x < cartMap.w; x++) if (cartMap.get(x, y).excavated) middleDug++;
    }
    ok(middleDug === 0, '跨过的岩块全部保持未挖（中间被挖 ' + middleDug + ' 格）');

    const res2 = MM.Cart.ride(r2, cartMap, cartMap.get(dest.x, dest.y));
    ok(res2.ok && r2.playerY === cart.y && r2.stats.cartRides === 2, '双向：从站点乘车返回车站');

    r2.playerX = dest.x; r2.playerY = dest.y;
    const ret = MM.Move.startReturnToEntrance(r2, cartMap);
    ok(ret.ok, '自动返回入口：可沿"已挖道路 + 矿车连接"寻路');
    if (ret.ok) {
      let hops = 0;
      let prev = { x: dest.x, y: dest.y };
      ret.move.path.forEach((c) => {
        if (Math.abs(c.x - prev.x) + Math.abs(c.y - prev.y) !== 1) hops++;
        prev = c;
      });
      ok(hops === 1, '返回路径中包含 1 次矿车连接段（实际 ' + hops + '）');
      const st1 = r2.stamina;
      let guard = 0;
      while (r2.move && guard++ < 200) MM.Move.update(r2, cartMap, 1);
      ok(r2.playerX === cartMap.entrance.x && r2.playerY === cartMap.entrance.y, '沿连接返回入口成功');
      ok(r2.stamina === st1, '返回全程 0 体力消耗');
    }
  }
}

/* ============================================================
 * ⑭.6 P3 生成验证：合法通关记录 + 三种策略（只使用已揭示信息）
 * ============================================================ */
section('⑭.6 P3 生成验证（合法通关记录 + 三种策略）');
{
  const N3 = MM.BALANCE.SIM.ROUTINE_SEEDS;
  let structuralFail = 0, cartTrapped = 0, clearFail = 0, fallback = 0;
  const depths = { conservative: [], balanced: [], deep: [] };
  const treasure = { conservative: 0, balanced: 0, deep: 0 };
  const t0 = Date.now();
  const pct = (a, p) => {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };

  for (let i = 0; i < N3; i++) {
    const g = MM.Generator.generateValidated('P3-' + i);
    if (!g.report.ok) { structuralFail++; continue; }
    if (g.repairs === -1) fallback++;
    if (!g.report.stats.clearOk) clearFail++;
    const m = g.map;

    /* 矿车困住：双向乘坐 + 目的地继续探索空间 */
    if (m.plan && m.plan.rooms.indexOf('minecart') >= 0) {
      const clone = m.clone();
      const runC = MM.State.createRun('P3CART-' + i);
      const cart = m.plan.minecart, dest = m.plan.minecartDest;
      clone.get(cart.x, cart.y).excavated = true;
      clone.get(dest.x, dest.y).excavated = true;
      MM.Cart.ensureStop(clone);
      const back = MM.Cart.ride(runC, clone, clone.get(dest.x, dest.y));
      const forth = MM.Cart.ride(runC, clone, clone.get(cart.x, cart.y));
      let open = 0;
      MM.Pathfinder.DIRS4.forEach((d) => {
        const n = m.get(dest.x + d[0], dest.y + d[1]);
        if (n && n.y > 0 && n.roomId !== 'treasure') open++;
      });
      if (!back.ok || !forth.ok || !MM.Cart.usable(clone)
        || back.to.y !== cart.y || forth.to.y !== dest.y
        || open < MM.MINECART_CFG.DEST_CLEAR_NEIGHBORS) cartTrapped++;
    }

    /* 三种策略（只使用已揭示信息），只记录实测值 */
    ['conservative', 'balanced', 'deep'].forEach((name) => {
      const r = MM.Simulator.play(m, name);
      depths[name].push(r.depth);
      if (r.treasureReached) treasure[name]++;
      if (typeof r.value !== 'number' || typeof r.endReason !== 'string' || typeof r.depth !== 'number') {
        structuralFail++;
      }
    });
  }

  const fmt = (name, label) => label + ' p50=' + pct(depths[name], 0.5) + 'm/p90=' + pct(depths[name], 0.9)
    + 'm 通关率 ' + (treasure[name] / N3 * 100).toFixed(1) + '%';
  ok(structuralFail === 0, 'P3：' + N3 + ' 张图零结构错误（含策略记录字段校验）');
  ok(cartTrapped === 0, 'P3：零矿车困住（双向乘坐 / 目的地继续探索空间）');
  ok(clearFail === 0, 'P3：每张图都有合法通关记录（真实挖掘 / 工具 / 泉水规则）');
  ok(fallback === 0, 'P3：无兜底强改');
  ok(depths.conservative.length === N3 && depths.balanced.length === N3 && depths.deep.length === N3,
    'P3：三种策略全部产出实测记录（' + N3 + ' 张 × 3）');
  ok(pct(depths.deep, 0.5) > pct(depths.conservative, 0.5),
    'P3：策略行为差异成立（冲深 p50 ' + pct(depths.deep, 0.5) + 'm > 保守 p50 ' + pct(depths.conservative, 0.5) + 'm）');
  console.log('  · ' + fmt('conservative', '保守') + ' · ' + fmt('balanced', '均衡') + ' · ' + fmt('deep', '冲深'));
  console.log('  · P3 抽检 ' + N3 + ' 张 · 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's（完整 1000 张见 tools/seed-sweep.js）');
}

/* ============================================================
 * ⑮ 隐藏房专项（8 类内容 / 效果 / 矿车，§30～§40）
 * ============================================================ */
section('⑮ 隐藏房专项（8 类内容 / 效果 / 矿车）');
{
  /* (a) 四档宝匣：价值区间 / 附带工具 / 神秘标记 */
  const cacheCases = [
    { special: 'chest',        min: 15, max: 20, tool: true,  name: '木箱' },
    { special: 'lostChest',    min: 20, max: 28, tool: true,  name: '遗失补给箱' },
    { special: 'ruinCache',    min: 30, max: 40, tool: false, name: '碎石宝匣' },
    { special: 'mysteryChest', min: 60, max: 80, tool: true,  name: '神秘宝箱' },
  ];
  cacheCases.forEach((c) => {
    const map = blankMap();
    const r = MM.State.createRun('CACHE-' + c.special);
    const cell = map.get(4, 1);
    cell.specialType = c.special;
    cell.roomId = 'lostSupplies';
    const before = r.baseValue;
    const a = MM.Dig.begin(r, map, 4, 1);
    const evs = MM.Dig.resolve(r, map, a);
    const ev = evs.find((e) => e.type === 'cache');
    ok(!!ev, c.name + '：挖开产出 cache 事件');
    if (ev) {
      ok(ev.value >= c.min && ev.value <= c.max, c.name + '：价值 ' + ev.value + ' ∈ [' + c.min + ',' + c.max + ']');
      ok(c.tool ? !!ev.toolId : !ev.toolId, c.name + (c.tool ? '：附带随机工具' : '：不附带工具'));
      ok(r.baseValue === before + ev.value, c.name + '：探索价值只加一次');
    }
    if (c.special === 'mysteryChest') ok(r.mysteryFound === true, '神秘宝箱：触发扩展标记 mysteryFound（§40）');
  });

  /* (b) 生成样本：验证各类房间的内容组合 */
  const seen = {};
  for (let i = 0; i < 400; i++) {
    const gm = MM.Generator.generateValidated('RT-' + i).map;
    ['goldenVein', 'crystalCave', 'ruinVault', 'lostSupplies', 'mysteryRoom', 'minecart'].forEach((id) => {
      if (!seen[id] && gm.plan.rooms.indexOf(id) >= 0 && gm.roomCells(id).length) seen[id] = gm;
    });
    if (Object.keys(seen).length === 6) break;
  }
  ok(Object.keys(seen).length === 6, '400 局内集齐 6 类新房间样本');

  if (seen.goldenVein) {
    const cells = seen.goldenVein.roomCells('goldenVein');
    const g = cells.filter((c) => c.resourceType === 'gold').length;
    const cr = cells.filter((c) => c.resourceType === 'crystal').length;
    ok(g >= 2 && cr >= 1, '黄金矿脉：金矿 ×' + g + ' + 水晶 ×' + cr + '（发现≠白拿，仍要挖，§33）');
  }
  if (seen.crystalCave) {
    const cells = seen.crystalCave.roomCells('crystalCave');
    const cr = cells.filter((c) => c.resourceType === 'crystal').length;
    const hardened = (seen.crystalCave.rooms.crystalCave || {}).hardened || 0;
    ok(cr >= 3 && hardened >= 4, '天然水晶洞：水晶 ×' + cr + ' · 外围硬化岩块 ×' + hardened + '（§34 高收益高成本）');
  }
  if (seen.ruinVault) {
    const cells = seen.ruinVault.roomCells('ruinVault');
    const hasCache = cells.some((c) => c.specialType === 'ruinCache');
    let hardNeighbors = 0;
    cells.forEach((c) => {
      MM.Pathfinder.DIRS4.forEach((d) => {
        const n = seen.ruinVault.get(c.x + d[0], c.y + d[1]);
        if (n && n.terrainType === 'hard' && !n.roomId) hardNeighbors++;
      });
    });
    ok(hasCache && hardNeighbors >= 2,
      '坍塌宝库：碎石宝匣 + 入口硬岩 ' + hardNeighbors + ' 格（奖励与成本都提前可见，§38）');
  }
  if (seen.lostSupplies) {
    ok(seen.lostSupplies.roomCells('lostSupplies').some((c) => c.specialType === 'lostChest'),
      '遗失物资室：有遗失补给箱（§39）');
  }
  if (seen.mysteryRoom) {
    const ex = (seen.mysteryRoom.rooms.mysteryRoom || {}).extensions || [];
    ok(seen.mysteryRoom.roomCells('mysteryRoom').some((c) => c.specialType === 'mysteryChest') && ex.length >= 3,
      '神秘石室：大宝箱 + 扩展接口（' + ex.join('/') + '，§40）');
  }

  /* (c) 废弃矿车站：乘坐 / 暂不乘坐两条分支（§36 / §37） */
  freshStore();
  let cartMap = null;
  for (let i = 0; i < 200 && !cartMap; i++) {
    const gm = MM.Generator.generateValidated('CART-' + i).map;
    if (gm.plan.rooms.indexOf('minecart') >= 0) cartMap = gm;
  }
  ok(!!cartMap, '找到带废弃矿车站的地图样本');

  if (cartMap) {
    const cart = cartMap.plan.minecart;
    const dest = cartMap.plan.minecartDest;
    ok(dest.y - cart.y >= MM.MINECART_CFG.MIN_DIST && dest.y - cart.y <= MM.MINECART_CFG.MAX_DIST,
      '矿车目的地距车站 ' + (dest.y - cart.y) + 'm（5～8m，§36）');

    const m = new MM.MiningMode('CART-RIDE');
    m.enter();
    m.map = cartMap;
    m.run = MM.State.createRun('CART-RIDE');
    m.run.state = S.EXPLORING;
    m.run.playerX = cart.x;
    m.run.playerY = cart.y - 1;
    const standCell = cartMap.get(cart.x, cart.y - 1);
    standCell.excavated = true;
    standCell.revealed = true;

    m.onCellClick(cart.x, cart.y);
    pump(m);
    ok(!!m.modal && m.modal.type === 'minecart', '挖到矿车 → 弹出"乘坐 / 不乘坐"抉择（§36）');

    const st0 = m.run.stamina, y0 = m.run.playerY, val0 = m.run.baseValue;
    if (m.modal) m.rideMinecart();
    ok(m.run.playerY === dest.y && m.run.stats.cartRides === 1,
      '乘坐矿车：' + y0 + 'm → ' + m.run.playerY + 'm');
    ok(m.run.stamina === st0 && m.run.baseValue === val0, '乘坐不消耗体力，也不获得被跳过的矿物（§36 取舍）');
    ok(cartMap.get(dest.x, dest.y).excavated && m.run.state === S.EXPLORING, '目的地已挖通，恢复可操作状态');
    ok(m.modal === null, '抉择弹窗关闭');

    const m2 = new MM.MiningMode('CART-SKIP');
    m2.enter();
    m2.map = cartMap;
    m2.run = MM.State.createRun('CART-SKIP');
    m2.run.state = S.EXPLORING;
    m2.run.playerX = cart.x;
    m2.run.playerY = cart.y - 1;
    m2.openCartModal(cart.x, cart.y);
    ok(!!m2.modal, '再次点击矿车可重新打开抉择');
    ok(MM.Save.records().archive.relics.indexOf('tornMap') >= 0,
      '调查矿车站记录即可获得半张旧矿图，不要求乘车');
    m2.modal = null;
    ok(m2.run.playerX === cart.x && m2.run.playerY === cart.y - 1 && m2.run.stats.cartRides === 0,
      '暂不乘坐：位置不变，可之后再来');
  }
}

/* ============================================================
 * ⑯ 藏宝库正式发现演出（§44 / §81）
 * ============================================================ */
section('⑯ 藏宝库发现演出（碎壁 → 轻震 → 金光 → 逐格点亮 → 结算/继续选择）');
{
  freshStore();
  function digVault(m) {
    let guard = 0;
    while (m.run.state !== S.EXPLORING && m.run.state !== S.TREASURE_DISCOVERY && guard++ < 300) m.update(0.05);
    const map = m.map, v = map.vault;
    const stand = map.get(v.x, v.y - 1);
    stand.excavated = true;
    stand.revealed = true;
    m.run.playerX = v.x;
    m.run.playerY = v.y - 1;
    m.onCellClick(v.x, v.y);
    guard = 0;
    while (m.run.state !== S.TREASURE_DISCOVERY && m.run.state !== S.RESULT && guard++ < 300) m.update(0.05);
  }

  const m1 = new MM.MiningMode('CINE-1');
  m1.enter();
  digVault(m1);
  ok(m1.run.state === S.TREASURE_DISCOVERY, '挖通入口 → 进入藏宝库演出状态');
  ok(!!m1.treasureSeq && m1.treasureSeq.preview.first === true && m1.treasureSeq.preview.amount === 10,
    '首达演出预览：通用货币 +10（§47 / §81）');

  const chamber = MM.Treasure.chamberCells(m1.map);   // 只含藏宝室（不含入口格）
  ok(chamber.length >= 2 && chamber.every((c) => !c.revealed), '演出开始：藏宝室还没点亮（' + chamber.length + ' 格待点亮）');

  /* 推进到区域点亮阶段途中（1.6s） */
  for (let i = 0; i < 32; i++) m1.update(0.05);
  const mid = chamber.filter((c) => c.revealed).length;
  ok(mid > 0 && mid < chamber.length, '藏宝库区域逐格扫过点亮（中途 ' + mid + '/' + chamber.length + '）');

  /* 演出结束 → 等待玩家选择 */
  let guard = 0;
  while ((!m1.modal || m1.modal.type !== 'treasureChoice') && guard++ < 200) m1.update(0.1);
  ok(m1.run.state === S.EXPLORING && m1.modal && m1.modal.type === 'treasureChoice',
    '演出结束停在选择弹窗（state=' + m1.run.state + ', modal=' + (m1.modal && m1.modal.type) + ', guard=' + guard + ')');
  ok(MM.Save.records().treasureReachCount === 1 && MM.Save.currency() === 0,
    '抵达进度即时记录；奖励货币在玩家结算时发放');
  ok(chamber.every((c) => c.revealed), '演出结束时藏宝库区域全部点亮');
  m1.settle('treasure');
  const sum1 = m1.run.summary;
  ok(sum1.currencyGranted === 13 && sum1.firstTreasure === true,
    '结算发放首达 +10、旧矿井首通 +2 与速降手册首次奖励 +1（实际 +' + sum1.currencyGranted + '）');
  ok(sum1.bestDepthImproved === true && sum1.bestValueImproved === true, '结算标记新纪录（最深 / 最高价值，§81 结算亮点）');

  /* 重复抵达：预览 +2 */
  const m2 = new MM.MiningMode('CINE-2');
  m2.enter();
  digVault(m2);
  ok(m2.run.state === S.TREASURE_DISCOVERY && m2.treasureSeq.preview.first === false && m2.treasureSeq.preview.amount === 2,
    '重复抵达演出预览：通用货币 +2');
  guard = 0;
  while ((!m2.modal || m2.modal.type !== 'treasureChoice') && guard++ < 200) m2.update(0.1);
  ok(m2.run.state !== S.RESULT, '重复抵达演出也等待玩家选择，不自动结束');
  m2.settle('treasure');
  ok(m2.run.summary.currencyGranted === 2 && m2.run.summary.firstTreasure === false, '重复抵达只给 +2');

  const m3 = new MM.MiningMode('CINE-CONTINUE');
  m3.enter();
  digVault(m3);
  guard = 0;
  while ((!m3.modal || m3.modal.type !== 'treasureChoice') && guard++ < 200) m3.update(0.1);
  const vaultBackCell = m3.map.get(m3.map.vault.x, m3.map.vault.y - 2);
  vaultBackCell.excavated = true;
  vaultBackCell.revealed = true;
  m3.continueAfterTreasure();
  ok(m3.run.state === S.EXPLORING && m3.modal === null, '选择继续探索后关闭藏宝库选择并恢复探索');
  m3.onCellClick(vaultBackCell.x, vaultBackCell.y);
  ok(m3.run.state === S.MOVING && m3.run.move, '藏宝库选择继续后可以沿通路移动');
}

/* ============================================================
 * ⑰ 美术层 + 音效层（V0.5 / §82）
 * ============================================================ */
section('⑰ 美术层 + 音效层（正式像素美术 / WebAudio 合成）');
{
  ok(!!MM.Art && typeof MM.Art.drawMiner === 'function' && typeof MM.Art.drawTerrain === 'function',
    '美术层 MiningArt 已接入（地形 / 角色 / 物件全部由它绘制）');
  ok(!!MM.Audio && typeof MM.Audio.toggle === 'function' && typeof MM.Audio.play === 'function',
    '音效层 MiningAudio 已接入（WebAudio 程序化合成，零素材文件）');

  /* 音效：开关 / 持久化 / 无 AudioContext 环境安全降级 */
  const before = MM.Audio.enabled;
  MM.Audio.setEnabled(false);
  ok(MM.Audio.enabled === false, '音效可关闭');
  MM.Audio.setEnabled(true);
  ok(MM.Audio.enabled === true, '音效可重新打开');
  ok(localStorage.getItem('forgotten-tower.mining.sound.v1') === '1', '音效开关持久化');
  let audioOk = true;
  try { MM.Audio.play('dig'); MM.Audio.play('ore', 3); MM.Audio.play('bomb'); MM.Audio.play('treasure'); }
  catch (e) { audioOk = false; }
  ok(audioOk, '无 AudioContext 环境播放安全降级（不抛异常）');

  /* 音效不会影响任何游戏数值 */
  const mapA = blankMap();
  const rA = MM.State.createRun('AUDIO-1');
  const aA = MM.Dig.begin(rA, mapA, 4, 1);
  MM.Dig.resolve(rA, mapA, aA);
  ok(rA.stamina === 38, '音效接入不影响挖掘数值（岩石 -2）');

  /* 底部音效开关按钮：可点、可切换、可再切换回来 */
  const modeA = new MM.MiningMode('AUDIO-2');
  modeA.enter();
  pump(modeA);
  modeA.draw(fakeCtx());                       // 生成按钮热区
  const rect = modeA.hit.sound;
  ok(!!rect, '底部有音效开关按钮（🔊 / 🔇）');
  const before2 = MM.Audio.enabled;
  MM.Input.push({ type: 'down', x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  modeA.update(0.05);
  ok(MM.Audio.enabled === !before2, '点击音效按钮可切换开关');
  MM.Input.push({ type: 'down', x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  modeA.update(0.05);
  ok(MM.Audio.enabled === before2, '再点一次恢复原状态');

  /* 美术层全部画笔可渲染（用假 Canvas 全量走一遍） */
  let artOk = true;
  try {
    const c2 = fakeCtx();
    const cell = {
      terrainType: 'hard', x: 3, y: 5,
      resourceType: 'gold', clueType: 'goldCrack', specialType: 'vault',
    };
    MM.Art.drawTerrain(c2, cell, 0, 0);
    MM.Art.drawFloor(c2, cell, 0, 0);
    MM.Art.drawFog(c2, cell, 0, 0);
    MM.Art.drawOre(c2, cell, 0, 0, 1.0);
    MM.Art.drawClue(c2, cell, 0, 0, 1.0);
    MM.Art.drawSpring(c2, cell, 0, 0, 1.0, true);
    MM.Art.drawChest(c2, cell, 0, 0, false, 'mystery');
    MM.Art.drawRuinCache(c2, cell, 0, 0, false);
    MM.Art.drawMinecart(c2, cell, 0, 0, 1.0);
    MM.Art.drawVaultDoor(c2, cell, 0, 0, 1.0);
    MM.Art.drawVaultGold(c2, cell, 0, 0, 1.0);
    const rm = MM.State.createRun('ART-1');
    MM.Art.drawMiner(c2, rm, 100, 100, 64, 1.0);
    MM.Art.drawPlayerGlow(c2, rm, 100, 100, 64, 1.0);
  } catch (e) {
    artOk = false;
    console.log('  ! 美术层异常：' + (e && e.message));
  }
  ok(artOk, '美术层全部画笔可渲染（地形/地面/迷雾/矿物/线索/泉/宝箱/宝匣/矿车/门/金币/角色/头灯）');
}

/* ============================================================
 * ⑱ UI 渲染冒烟（假 Canvas：标题 / 矿坑 / 面板 / 结算全部可画）
 * ============================================================ */
section('⑱ UI 渲染冒烟（无异常即可）');
{
  let uiOk = true;
  try {
    const ctx = fakeCtx();
    const t = new MM.TitleScene();
    t.enter(); t.draw(ctx);
    const ph = new MM.MainPlaceholderScene();
    ph.enter(); ph.draw(ctx);

    const m = new MM.MiningMode('UI-1');
    m.enter();
    m.draw(ctx);                 // ENTERING
    pump(m);
    m.draw(ctx);                 // EXPLORING
    m.panel.open = true; m.panel.draw(ctx, m);
    m.panel.showAll = true; m.panel.showPath = true; m.panel.showBranches = true;
    m.draw(ctx);                 // 调试叠加
    m.panel.open = false;
    m.toggleBomb();
    m.draw(ctx);                 // 炸药瞄准
    m.settle('direct');
    m.draw(ctx);                 // 结算面板
  } catch (e) {
    uiOk = false;
    console.log('  ! 渲染异常：' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
  ok(uiOk, '标题 / 矿坑 / 调试面板 / 结算面板渲染无异常');
}

/* ============================================================
 * ⑲ P4 试玩记录（本地记录 / 导出 / 汇总工具）
 * ============================================================ */
section('⑲ P4 试玩记录（本地记录 / 导出）');
{
  freshStore();
  const map4 = blankMap();
  const run4 = MM.State.createRun('PT-1');
  MM.Telemetry.start(run4, 'full');
  const a4 = MM.Dig.begin(run4, map4, 4, 1);
  MM.Dig.resolve(run4, map4, a4);
  MM.Move.startStep(run4, map4, 4, 1);
  MM.Move.update(run4, map4, 1);
  run4.maxDepthReached = run4.playerY;      // 真实游戏由 Mode.updateMovement 记录
  MM.Telemetry.noteDepth(run4);
  MM.Telemetry.noteTool('lamp');
  MM.Telemetry.noteSpring(3);
  MM.Telemetry.noteCart();
  MM.Telemetry.noteBranch('brX', 'high', 2);
  MM.Telemetry.noteRoom('supply');
  const s4 = MM.Reward.settle(run4, null, 'direct');
  const rec4 = MM.Telemetry.finish(run4, s4, 'direct');
  ok(!!rec4 && rec4.seed === 'PT-1', '试玩记录：Seed');
  ok(rec4.durationMs >= 0 && rec4.depthTimeline.length >= 2, '试玩记录：用时 + 每层到达时间');
  ok(rec4.toolUse.lamp === 1 && rec4.springAt && rec4.springAt.depth === 3
    && rec4.cartRides === 1 && rec4.branchChoices.length === 1,
    '试玩记录：工具 / 泉水 / 矿车 / 岔路选择');
  ok(rec4.endReason === 'direct' && rec4.finalValue === s4.finalValue && rec4.maxDepth === 1,
    '试玩记录：撤离原因 / 最终价值 / 最深深度');
  ok(MM.Telemetry.list().length === 1, '试玩记录写入本地（最近 20 局）');
  const json4 = MM.Telemetry.serialize(MM.Telemetry.list()[0]);
  ok(json4.indexOf('"seed"') >= 0 && json4.indexOf('"depthTimeline"') >= 0, '导出 JSON 含 Seed 与深度时间线');
  MM.Telemetry.setNote('因为看到蓝紫微光想赌金矿');
  ok(MM.Telemetry.list()[0].notes === '因为看到蓝紫微光想赌金矿', '备注写回最近一局记录（P4 关键定性数据）');
  MM.Telemetry.clear();
  ok(MM.Telemetry.list().length === 0, '清空试玩记录');

  /* 模式内：结算面板导出按钮 + 调试面板动作（无 DOM 环境安全降级，不抛异常） */
  const mode4 = new MM.MiningMode('PT-2');
  mode4.enter();
  pump(mode4);
  mode4.settle('direct');
  mode4.draw(fakeCtx());
  ok(!!mode4.hit.exportRun, '结算面板有「导出试玩记录」按钮');
  let panelOk = true;
  try { mode4.debugAction('exportPlaytest'); mode4.debugAction('clearPlaytest'); }
  catch (e) { panelOk = false; }
  ok(panelOk, '调试面板：导出 / 清空试玩记录不报错');
  ok(MM.Telemetry.list().length === 0, '清空后记录为空');
}

/* ============================================================
 * ⑳ V0.7 采矿进度与补给（试玩反馈：矿物有什么用 / 短期目标）
 * ============================================================ */
section('⑳ V0.7 采矿进度与补给');
{
  freshStore();

  /* (a) 进度只认"实际挖出的矿物" */
  const r5 = MM.State.createRun('PROG-1');
  MM.Resources.addValue(r5, 100, 'debug');
  ok(r5.mineValue === 0 && r5.otherValue === 100,
    '宝箱 / 调试加值不计入采矿进度（mineValue 0 / otherValue 100）');
  MM.Resources.grant(r5, 'copper');
  MM.Resources.grant(r5, 'gold');
  ok(r5.mineValue === 25, '实际挖出的矿物才计入采矿进度（铜 5 + 金 20 = 25）');

  /* (b) 第一档自动发放，且只发一次 */
  r5.mineValue = 50;
  r5.stamina = 40;
  let evs5 = MM.Progress.check(r5);
  ok(evs5.length === 1 && evs5[0].type === 'supplyGranted' && evs5[0].amount === 10,
    '第一档达标自动发放体力 +10');
  ok(r5.stamina === 50 && MM.Progress.isClaimed(r5, 't1'), '体力按上限截断（40→50）并已记档');
  ok(MM.Progress.check(r5).length === 0, '第一档不会重复发放');

  /* (c) 第二档三选一：选择立即生效、只能领一次 */
  r5.mineValue = 150;
  evs5 = MM.Progress.check(r5);
  ok(evs5.length === 1 && evs5[0].type === 'supplyChoice' && evs5[0].tier.id === 't2',
    '第二档门槛弹出三选一（不是自动发放）');
  const bombBefore = r5.tools.bomb;
  const pick5 = MM.Progress.applyChoice(r5, 't2', 'bomb');
  ok(pick5.ok && r5.tools.bomb === bombBefore + 1, '选择「炸药 ×1」立即生效');
  ok(MM.Progress.applyChoice(r5, 't2', 'stamina').reason === 'claimed', '同一档不能重复领取');
  ok(MM.Progress.check(r5).length === 0, '第二档领取后不会重新触发（第三档未达）');

  /* (d) 第三档 + 结算文案 */
  r5.mineValue = 300;
  evs5 = MM.Progress.check(r5);
  ok(evs5.length === 1 && evs5[0].tier.id === 't3', '第三档门槛同样弹出三选一');
  MM.Progress.applyChoice(r5, 't3', 'powerPick');
  const supText5 = MM.Progress.summaryText(r5);
  ok(supText5.indexOf('第一档补给') >= 0 && supText5.indexOf('第二档补给') >= 0 && supText5.indexOf('第三档补给') >= 0,
    '结算补给成果包含三档领取记录');
  ok(MM.Progress.status(r5).tier === null, '三档领完，短期目标切换为「全部领取」');
  ok(MM.Progress.summaryText(MM.State.createRun('PROG-0')) === '未领取', '未领取时结算补给成果为「未领取」');

  /* (e) 页面级：达标 → 弹窗 → 点击选择（热区 + 输入分派） */
  const m5 = new MM.MiningMode('PROG-2');
  m5.enter();
  pump(m5);
  MM.Tutorial.skip(m5.tutorial);   // V0.8：教程开启时会拦截输入，测试先跳过
  m5.run.mineValue = 150;
  m5.checkProgress();
  ok(!!m5.modal && m5.modal.type === 'supply' && m5.modal.tierId === 't2', '页面级：第二档打开三选一弹窗');
  m5.draw(fakeCtx());
  ok(Array.isArray(m5.hit.supplyChoices) && m5.hit.supplyChoices.length === 3, '弹窗有三个可点击选项');
  const rect5 = m5.hit.supplyChoices[0];
  MM.Input.push({ type: 'down', x: rect5.x + rect5.w / 2, y: rect5.y + rect5.h / 2 });
  m5.update(0.05);
  ok(!m5.modal && m5.run.supplies.t2 === 'stamina', '点击选项后弹窗关闭并记档（t2=stamina）');
  ok(!m5.run.supplies.t3 && m5.run.mineValue === 150, '第三档未达门槛，不会提前领取');

  /* (f) 当前发现：去重 + 上限 */
  const r5b = MM.State.createRun('PROG-3');
  MM.Progress.note(r5b, 'mineral', '铜矿');
  MM.Progress.note(r5b, 'mineral', '铜矿');
  ok(r5b.discoveries.length === 1, '同一发现不会重复写入「当前发现」');
  for (let i = 0; i < 10; i++) MM.Progress.note(r5b, 'x', '发现' + i);
  ok(r5b.discoveries.length === 6, '「当前发现」最多保留 6 条（HUD 只显示最近几条）');

  /* (g) 9×20 测试图：门槛按深度缩放，整图矿物足够第三档 */
  const rV01 = MM.State.createRun('PROG-V01');
  rV01.mapId = 'v01';
  const tV01 = MM.Progress.tiers(rV01);
  ok(tV01[0].need === 20 && tV01[1].need === 65 && tV01[2].need === 130,
    '9×20 测试图门槛按真实深度缩放为 20 / 65 / 130');
  let v01Ok = true;
  let v01Min = Infinity;
  for (let i = 0; i < 8; i++) {
    const gV01 = MM.Generator.generateValidated('V07-V01-' + i, 'v01');
    let totalV01 = 0;
    gV01.map.forEach((c) => { if (c.resourceType) totalV01 += MM.Resources.value(c.resourceType); });
    v01Min = Math.min(v01Min, totalV01);
    if (totalV01 < tV01[2].need) v01Ok = false;
  }
  ok(v01Ok, '抽检 8 张 9×20 图整图矿物 ≥ 第三档门槛（最低 ' + v01Min + ' ≥ ' + tV01[2].need + '）');
  ok(MM.Progress.tiers(MM.State.createRun('FULL')).map((t) => t.need).join('/') === '50/150/300',
    '默认 9×45 图门槛保持 50 / 150 / 300');

  const m19 = new MM.MiningMode('V01-T', 'v01');
  m19.enter();
  pump(m19);
  ok(m19.map.spec.DEPTH_LABEL === 19 && MM.Progress.status(m19.run).tier.need === 20,
    'v01 模式：19m 地图与缩放门槛 20 绑定（进入即生效）');
  let v01Draw = true;
  try { m19.draw(fakeCtx()); } catch (e) { v01Draw = false; }
  ok(v01Draw, 'v01 模式 HUD / 地图渲染无异常');
}

/* ============================================================
 * ㉑ V0.7 结算拆分 / 探索档案 / 存档兼容
 * ============================================================ */
section('㉑ V0.7 结算拆分与探索档案');
{
  freshStore();

  /* (a) 结算拆分：矿物 / 其他 / 补给 */
  const r6 = MM.State.createRun('ARCH-1');
  for (let i = 0; i < 5; i++) MM.Resources.grant(r6, 'silver');   // 50 采矿价值 → 触发第一档
  MM.Resources.addValue(r6, 30, 'cache');
  r6.stamina = 40;
  MM.Progress.check(r6);
  const s6 = MM.Reward.settle(r6, MM.Save, 'direct');
  ok(s6.mineValue === 50 && s6.otherValue === 30, '结算拆分：矿物价值 50 / 其他价值 30');
  ok(s6.baseValue === 80 && s6.finalValue === 80, '基础价值 = 矿物 + 其他（无倍率）');
  ok(s6.supplyText.indexOf('体力 +10') >= 0, '结算包含本局补给成果');

  /* (b) 档案累计：房间 / 矿物 / 深度 / 局数 */
  const r7 = MM.State.createRun('ARCH-2');
  MM.Resources.grant(r7, 'crystal');
  r7.roomsFound.push('spring');
  r7.maxDepthReached = 12;
  const s7 = MM.Reward.settle(r7, MM.Save, 'direct');
  const recA = MM.Save.records();
  ok(recA.archive.rooms.indexOf('spring') >= 0 && recA.archive.minerals.indexOf('crystal') >= 0,
    '档案记录本局发现的隐藏区域与矿物');
  ok(recA.archive.maxDepth === 12 && recA.archive.runs === 2
    && s7.newRooms.indexOf('spring') >= 0 && s7.newMinerals.indexOf('crystal') >= 0,
    '档案累计最深 / 局数，并返回本局新发现');
  ok(s7.challenge && s7.challenge.id === 'depth30', '尚未抵达 30m 时，下一局挑战指向矿区解锁里程碑');

  /* (c) 旧 v2 存档（无 archive）：纪录保留，档案从空开始 */
  localStorage.setItem(MM.Save.KEY, JSON.stringify({
    v: '0.6.0',
    miningSave: {
      scoreVersion: 2, v2: { bestDepth: 41, bestValue: 999, totalDigs: 300 },
      treasureFirstClear: true, treasureReachCount: 3,
    },
  }));
  MM.Save._dropCache();
  const rec8 = MM.Save.records();
  ok(rec8.previous.bestDepth === 41 && rec8.previous.bestValue === 999 && rec8.treasureReachCount === 3,
    '旧 v2 存档迁移：纪录进入历史栏位且藏宝库次数保留');
  ok(rec8.archive.rooms.length === 0 && rec8.archive.runs === 0, '旧存档无档案字段 → 从空档案开始（不丢旧纪录）');
  ok(MM.Save.challenge().id === 'E1', '旧档已有 30m 与藏宝库纪录 → 挑战指向首个未完成手册目标');

  /* (d) 更老存档（顶层字段）→ legacy 迁移，不冒充新纪录 */
  localStorage.setItem(MM.Save.KEY, JSON.stringify({
    miningSave: { bestDepth: 33, bestValue: 500, totalDigs: 120 },
  }));
  MM.Save._dropCache();
  const rec9 = MM.Save.records();
  ok(rec9.bestDepth === 0 && rec9.legacy.bestDepth === 33 && rec9.legacy.totalDigs === 120,
    'V0.1–V0.5 旧存档迁入 legacy，不冒充新规则纪录');
  ok(rec9.archive.rooms.length === 0 && rec9.archive.minerals.length === 0, '迁移存档的安全空档案');

  /* (d2) V0.7 人工核对样本可被正常读取 */
  const sample = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/mine-v07-record.json'), 'utf8'));
  localStorage.setItem(MM.Save.KEY, JSON.stringify(sample.miningSave));
  MM.Save._dropCache();
  const recS = MM.Save.records();
  ok(recS.previous.bestDepth === 41 && recS.archive.rooms.length === 3 && recS.archive.minerals.length === 3,
    'V0.7 存档样本可被正常读取（旧纪录进入历史栏位，含探索档案）');

  /* (e) 全部内容发现后，挑战切换为个人深度 */
  const ar9 = MM.Save.get().miningSave.archive;
  ar9.rooms = MM.ROOM_ORDER.slice();
  ar9.minerals = MM.RESOURCE_ORDER.slice();
  ar9.styles = MM.BALANCE.STYLES.map((st) => st.id);
  ar9.relics = MM.RELICS.map((r) => r.id);
  MM.Save.get().miningSave.treasureReachCount = 1;
  MM.Save.get().miningSave.treasureFirstClear = true;
  MM.Save.get().miningSave.expedition.completedGoals = MM.JOURNAL_GOALS.map((g) => g.id);
  MM.Save.get().miningSave.expedition.firstClearMines = ['oldMine', 'resonanceCave', 'clockworkMine'];
  ar9.maxDepth = 30;
  MM.Save.persist();
  const ch9 = MM.Save.challenge();
  ok(ch9.id === 'daily', '全部目标、矿区、风格与遗物完成后，推荐每日或同图挑战');

  /* (f) 损坏存档安全回退 */
  localStorage.setItem(MM.Save.KEY, '{broken json');
  MM.Save._dropCache();
  let safe9 = true;
  try { MM.Save.records(); MM.Save.challenge(); } catch (e) { safe9 = false; }
  ok(safe9, '损坏存档安全回退为默认值，不抛异常');
}

/* ============================================================
 * ㉒ V0.8.1 挑战 / 风格 / 节奏（探索动机扩展）
 * ============================================================ */
section('㉒ V0.8.1 挑战 / 探索风格 / 节奏提示');
{
  freshStore();

  /* (a) 风格定义与进度 */
  ok(MM.BALANCE.STYLES.length === 3, '三种探索风格（探险家 / 矿工 / 速降）');
  const rA = MM.State.createRun('STYLE-1');
  MM.Style.attach(rA, 'explorer');
  ok(MM.Style.progress(rA, null).text === '隐藏房 0 / 2', '探险家进度从 0/2 开始');
  rA.roomsFound.push('spring');
  rA.roomsFound.push('treasure');   // 藏宝库不算隐藏房
  ok(MM.Style.progress(rA, null).cur === 1, '藏宝库不计入探险家目标');
  rA.roomsFound.push('supply');
  ok(MM.Style.progress(rA, null).done === true, '发现 2 个隐藏区域后探险家达标');
  ok(MM.Style.check(rA, null) === 'done', '第一次 check 触发完成（写入 run.style.done）');
  ok(MM.Style.check(rA, null) === null, '已完成的风格不会重复触发（check 返回 null）');

  const rB = MM.State.createRun('STYLE-2');
  MM.Style.attach(rB, 'miner');
  rB.mapId = 'full';
  rB.mineValue = 149;
  ok(MM.Style.progress(rB, null).done === false, '矿工：149 / 150 未达标');
  rB.mineValue = 150;
  ok(MM.Style.check(rB, null) === 'done', '矿工：达到第二档（150）完成');
  const rBv = MM.State.createRun('STYLE-2V');
  MM.Style.attach(rBv, 'miner');
  rBv.mapId = 'v01';
  rBv.mineValue = 65;
  ok(MM.Style.progress(rBv, null).done === true, '9×20 测试图：矿工门槛按缩放后的 65 判定');

  const rC = MM.State.createRun('STYLE-3');
  MM.Style.attach(rC, 'racer');
  rC.maxDepthReached = 30;
  ok(MM.Style.progress(rC, null).done === true && MM.Style.check(rC, null) === 'done', '速降：不坐矿车抵达 30m 完成');
  const rD = MM.State.createRun('STYLE-4');
  MM.Style.attach(rD, 'racer');
  rD.stats.cartRides = 1;
  rD.maxDepthReached = 40;
  ok(MM.Style.progress(rD, null).failed === true && MM.Style.check(rD, null) === 'failed', '速降：一旦乘坐矿车即失效');
  const rDv = MM.State.createRun('STYLE-4V');
  MM.Style.attach(rDv, 'racer');
  const gV01 = MM.Generator.generateValidated('STYLE-V01', 'v01');
  ok(MM.Style.racerDepth(gV01.map) === 13, '9×20 图速降目标缩放为 13m');

  /* (b) 页面级：风格完成触发横幅（教程先跳过） */
  const mS = new MM.MiningMode('STYLE-PAGE', 'full', { style: 'racer' });
  mS.enter();
  pump(mS);
  MM.Tutorial.skip(mS.tutorial);
  mS.run.maxDepthReached = 30;
  mS.update(0.05);
  ok(mS.run.style.done === true && mS.banner && mS.banner.title.indexOf('探索风格完成') >= 0,
    '页面级：速降达标立即横幅提示，且写入 run.style.done');
  const styleDoneSnapshot = mS.run.style.done;
  mS.update(0.05);
  ok(styleDoneSnapshot === true && mS.run.style.done === true, '风格完成状态保持');

  /* (c) 三段式节奏：进入新深度层提示一次 */
  const mH = new MM.MiningMode('HINT-1');
  mH.enter();
  pump(mH);
  MM.Tutorial.skip(mH.tutorial);
  mH.update(0.05);
  ok(mH.run.depthHints.shallow === true, '开局进入浅层 → 记录已提示');
  const hintMsg = mH.messages.map((m) => m.text).join(' | ');
  ok(hintMsg.indexOf('浅层') >= 0, '浅层提示进入消息（' + hintMsg.slice(0, 40) + '…）');
  mH.run.playerY = 10;
  mH.update(0.05);
  ok(mH.run.depthHints.rock === true && mH.messages.map((m) => m.text).join('|').indexOf('岩层') >= 0,
    '进入 10m 岩层提示一次');
  const hintedCount = Object.keys(mH.run.depthHints).length;
  mH.update(0.05);
  ok(Object.keys(mH.run.depthHints).length === hintedCount, '同一层不会重复提示');

  /* (d) 矿车跳过代价：沿最短路径统计未挖矿物 */
  const mapC = blankMap();
  const station = mapC.get(4, 1);
  station.specialType = 'minecart';
  station.excavated = true; station.revealed = true;
  const dest = mapC.get(4, 6);
  dest.excavated = true; dest.revealed = true;
  mapC.plan = { rooms: ['minecart'], missing: [], minecart: { x: 4, y: 1 }, minecartDest: { x: 4, y: 6 } };
  const mc1 = mapC.get(4, 2), mc2 = mapC.get(4, 3);
  mc1.resourceType = 'copper'; mc2.resourceType = 'gold';
  const skipInfo = MM.Cart.skippedInfo(mapC);
  ok(skipInfo && skipInfo.count === 2 && skipInfo.value === 25,
    '矿车跳过信息：2 格矿物 / 约 25 价值');
  mc1.excavated = true;
  const skipInfo2 = MM.Cart.skippedInfo(mapC);
  ok(skipInfo2.count === 1 && skipInfo2.value === 20, '已挖的格子不再计入跳过代价（动态计算）');

  /* (e) 同 Seed 挑战记录与挑战榜 */
  freshStore();
  const rs1 = MM.State.createRun('SEED-X');
  rs1.maxDepthReached = 20;
  const ss1 = MM.Reward.settle(rs1, MM.Save, 'direct');
  const sr1 = MM.Save.get().miningSave.seedRecords[MM.Expedition.challengeId('SEED-X', 'oldMine', {})];
  ok(sr1 && sr1.runs === 1 && sr1.bestDepth === 20, '每局写入同 Seed 记录（第 1 局 20m）');
  ok(ss1.seedImproved === true, '首局即视为刷新本 Seed 记录');
  const rs2 = MM.State.createRun('SEED-X');
  rs2.maxDepthReached = 12;
  const ss2 = MM.Reward.settle(rs2, MM.Save, 'direct');
  ok(ss2.seedImproved === false && ss2.seedBest.runs === 2 && ss2.seedBest.bestDepth === 20,
    '较差的一局不刷新记录，但计数 +1（2 局 / 保持 20m）');
  const rs3 = MM.State.createRun('SEED-Y');
  rs3.maxDepthReached = 30;
  MM.Reward.settle(rs3, MM.Save, 'direct');
  const top = MM.Save.seedTop(3);
  ok(top.length === 2 && top[0].seed === 'SEED-Y' && top[0].bestDepth === 30, '挑战榜按最深优先排序');

  /* (f) Seed 记录上限 40（保留最近使用） */
  const store9 = MM.Save.get();
  for (let i = 0; i < 45; i++) {
    store9.miningSave.seedRecords['CAP-' + i] = {
      runs: 1, bestDepth: i, bestValue: i, treasureReached: false, lastAt: 1000 + i,
    };
  }
  MM.Save.persist();
  MM.Save._dropCache();
  const capKeys = Object.keys(MM.Save.get().miningSave.seedRecords);
  ok(capKeys.length <= 40, 'Seed 记录最多保留 40 条（当前 ' + capKeys.length + '）');
  ok(capKeys.indexOf('CAP-44') >= 0 && capKeys.indexOf('CAP-0') === -1, '上限裁剪保留最近使用的记录');

  /* (g) 风格徽章归档 + 挑战优先指向未完成的风格 */
  freshStore();
  const rs4 = MM.State.createRun('STYLE-ARCH');
  MM.Style.attach(rs4, 'miner');
  rs4.style.done = true;
  const ss4 = MM.Reward.settle(rs4, MM.Save, 'direct');
  const recA8 = MM.Save.records();
  ok(recA8.archive.styles.indexOf('miner') >= 0 && ss4.newStyles.indexOf('miner') >= 0,
    '完成的风格写入探索档案并作为"档案新发现"返回');
  const rs5 = MM.State.createRun('STYLE-ARCH2');
  MM.Style.attach(rs5, 'miner');
  rs5.style.done = true;
  const ss5 = MM.Reward.settle(rs5, MM.Save, 'direct');
  ok(ss5.newStyles.length === 0, '同一风格徽章不会重复记录');

  const arch8 = MM.Save.get().miningSave.archive;
  arch8.rooms = MM.ROOM_ORDER.slice();
  arch8.maxDepth = 30;
  MM.Save.get().miningSave.treasureReachCount = 1;
  MM.Save.get().miningSave.treasureFirstClear = true;
  MM.Save.get().miningSave.expedition.completedGoals = MM.JOURNAL_GOALS.map((g) => g.id);
  MM.Save.get().miningSave.expedition.firstClearMines = ['oldMine', 'resonanceCave', 'clockworkMine'];
  MM.Save.persist();
  MM.Save._dropCache();
  const ch8 = MM.Save.challenge();
  ok(ch8.id === 'style' && ch8.styleId, '矿区与手册目标完成后，推荐尚未完成的探索风格（' + (ch8.styleId || '') + '）');

  /* (h) V0.8.1 渲染冒烟：风格 HUD / 矿车代价弹窗 / 结算新行 */
  let renderOk = true;
  try {
    const mR = new MM.MiningMode('REND-81', 'full', { style: 'miner' });
    mR.enter();
    pump(mR);
    MM.Tutorial.skip(mR.tutorial);
    mR.draw(fakeCtx());
    mR.modal = {
      type: 'minecart', x: 4, y: 5,
      from: { x: 4, y: 5 }, to: { x: 4, y: 11 }, dir: 'forward',
      skip: { count: 1, value: 5, cells: [{ x: 4, y: 8 }] },
    };
    mR.cartPreview = [{ x: 4, y: 8 }];
    mR.draw(fakeCtx());
    mR.modal = null;
    mR.cartPreview = null;
    mR.settle('direct');
    mR.draw(fakeCtx());
  } catch (e) {
    renderOk = false;
    console.log('  ! 渲染异常：' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
  ok(renderOk, 'V0.8.1 新增界面（风格 HUD / 矿车代价 / 结算挑战行）渲染无异常');
}

/* ============================================================
 * ㉓ V0.8.2 风格奖励 / 矿坑遗物收集
 * ============================================================ */
section('㉓ V0.8.2 风格奖励与矿坑遗物');
{
  freshStore();

  /* (a) 风格奖励：完成才发、只发一次、说明用途 */
  const rw1 = MM.State.createRun('REW-1');
  MM.Style.attach(rw1, 'explorer');
  ok(MM.Style.grantReward(rw1) === null, '未完成的风格不发奖励');
  rw1.roomsFound.push('spring', 'supply');
  MM.Style.check(rw1, null);
  const lampBefore = rw1.tools.lamp;
  rw1.stamina = 45;
  const gr1 = MM.Style.grantReward(rw1);
  ok(!!gr1 && rw1.tools.lamp === lampBefore + 1 && rw1.stamina === 49,
    '探险家奖励：探矿灯 +1、体力 +4（' + ((gr1 && gr1.text) || '') + '）');
  ok(MM.Style.grantReward(rw1) === null && rw1.tools.lamp === lampBefore + 1, '风格奖励只发一次');
  ok(MM.Style.rewardHint(rw1).indexOf('探矿灯') >= 0, '奖励用途提示说明怎么用（' + MM.Style.rewardHint(rw1) + '）');

  /* 体力上限截断 + 矿工奖励 */
  const rw2 = MM.State.createRun('REW-2');
  MM.Style.attach(rw2, 'racer');
  rw2.maxDepthReached = 30;
  MM.Style.check(rw2, null);
  rw2.stamina = 48;
  const gr2 = MM.Style.grantReward(rw2);
  ok(gr2.text === '体力 +2' && rw2.stamina === 50, '速降奖励按上限截断（48 → 50，文本 +2）');
  const rw3 = MM.State.createRun('REW-3');
  MM.Style.attach(rw3, 'miner');
  rw3.mineValue = 150;
  MM.Style.check(rw3, null);
  const gr3 = MM.Style.grantReward(rw3);
  ok(rw3.tools.powerPick === 2 && gr3.text.indexOf('强化矿镐') >= 0, '矿工奖励：强化矿镐 +1（开局 1 → 2）');

  /* (b) 页面级：风格完成 → 奖励入账 + 横幅 + 结算文本 */
  const mp = new MM.MiningMode('REW-PAGE', 'full', { style: 'racer' });
  mp.enter();
  pump(mp);
  MM.Tutorial.skip(mp.tutorial);
  mp.run.stamina = 20;
  mp.run.maxDepthReached = 30;
  mp.update(0.05);
  ok(mp.run.style.done && mp.run.style.rewardGranted && mp.run.stamina === 32,
    '页面级：速降完成立即 +12 体力（20 → 32）');
  const bannerText = mp.banner ? mp.banner.title + ' / ' + mp.banner.sub : '';
  ok(bannerText.indexOf('奖励') >= 0, '完成横幅说明奖励内容（' + bannerText.slice(0, 46) + '…）');
  mp.settle('direct');
  ok(mp.run.summary.styleText.indexOf('奖励') >= 0, '结算风格行包含奖励（' + mp.run.summary.styleText + '）');

  /* (c) 遗物池与掉落：未收集必掉、不重复、即时写档 */
  freshStore();
  ok(MM.RELICS.length === 6, '遗物池共 6 件');
  ok(new Set(MM.RELICS.map((r) => r.id)).size === 6, '遗物 id 唯一');
  MM.RELICS.forEach((relic) => {
    const source = MM.RELIC_SOURCES[relic.id];
    const generated = MM.Generator.generateValidated('TRACK-' + relic.id, 'oldMine', { relicTarget: relic.id });
    const map = generated.map;
    const room = map.rooms[source.roomId];
    const clue = room && room.clue;
    const clueCell = clue && map.get(clue.x, clue.y);
    const clueDistance = clueCell ? MM.Generator.routeDistance(map, clueCell.x, clueCell.y) : Infinity;
    ok(generated.report.ok && map.plan.rooms.indexOf(source.roomId) >= 0
        && map.roomCells(source.roomId).length > 0 && clueCell && clueCell.clueType
        && clueDistance <= MM.BALANCE.GENERATOR.CLUE_MAX_ROUTE_DIST,
      '追踪遗物 ' + relic.name + '：对应房间必生成且前置线索可见（距离 ' + clueDistance + '）');
  });
  freshStore();
  const rr = MM.State.createRun('RELIC-1');
  const relic1 = MM.Relics.collect(rr, 'oldLamp');
  ok(!!relic1 && rr.relicsFound.length === 1, '固定来源可收集对应遗物');
  ok(MM.Save.records().archive.relics.indexOf(relic1.id) >= 0, '遗物掉落即写入探索档案（不必等结算）');
  ok(MM.Relics.collect(rr, 'silverBell') === null, '同一局最多发现一件新遗物');
  ok(MM.Relics.roll(rr) === null, '未指定来源时不再随机掉落遗物');
  ['goldPick', 'crystalHeart', 'tornMap', 'carvedTag', 'silverBell'].forEach((id, i) => {
    MM.Relics.collect(MM.State.createRun('RELIC-' + (i + 2)), id);
  });
  ok(MM.Save.relicCount() === 6, '6 件全部收集');
  ok(MM.Relics.collect(MM.State.createRun('RELIC-FULL'), 'oldLamp') === null, '集齐后不再重复掉落');

  ['supplies', 'materials'].forEach((choice) => {
    freshStore();
    const warehouseMode = new MM.MiningMode('WAREHOUSE-' + choice);
    warehouseMode.enter();
    pump(warehouseMode);
    warehouseMode.modal = { type: 'warehouseChoice', salvage: {} };
    warehouseMode.chooseWarehouse(choice);
    ok(MM.Save.records().archive.relics.indexOf('carvedTag') >= 0,
      '仓库选择“' + (choice === 'supplies' ? '补给' : '拆取材料') + '”后均可获得刻纹矿牌');
    ok(warehouseMode.run.roomChoices.warehouse === choice && warehouseMode.modal === null,
      '仓库' + choice + '分支正常记录选择并关闭弹窗');
  });

  /* (d) 神秘宝箱集成：cache 事件携带遗物 */
  freshStore();
  const mapR = blankMap();
  const chestCell = mapR.get(4, 4);
  chestCell.specialType = 'mysteryChest';
  chestCell.roomId = 'mysteryRoom';
  const runR = MM.State.createRun('RELIC-CHEST');
  const evsR = [];
  MM.Rooms.onCellExcavated(runR, mapR, chestCell, evsR);
  const cacheEv = evsR.filter((e) => e.type === 'cache')[0];
  ok(!!cacheEv && !!cacheEv.relic, '神秘宝箱掉落遗物（事件携带 relic 字段）');
  ok(MM.Save.relicCount() === 1, '宝箱遗物立即写入档案');

  /* (e) 结算清单 + 挑战优先级 */
  const rsR = MM.Reward.settle(runR, MM.Save, 'direct');
  ok(rsR.newRelics.length === 1 && rsR.relicCount === 1, '结算返回本局遗物清单与总收集数');
  const aR = MM.Save.get().miningSave.archive;
  aR.rooms = MM.ROOM_ORDER.slice();
  aR.minerals = MM.RESOURCE_ORDER.slice();
  aR.styles = MM.BALANCE.STYLES.map((st) => st.id);
  aR.maxDepth = 33;
  MM.Save.get().miningSave.treasureReachCount = 1;
  MM.Save.get().miningSave.treasureFirstClear = true;
  MM.Save.get().miningSave.expedition.firstClearMines = ['oldMine', 'resonanceCave', 'clockworkMine'];
  MM.Save.get().miningSave.expedition.completedGoals = MM.JOURNAL_GOALS.map((g) => g.id);
  MM.Save.persist();
  MM.Save._dropCache();
  const chR = MM.Save.challenge();
  ok(chR.id === 'relics' && chR.relicId, '目标、矿区与风格完成后，挑战指向未收集遗物（' + chR.text + '）');
  const aR2 = MM.Save.get().miningSave.archive;
  aR2.relics = MM.RELICS.map((r) => r.id);
  aR2.maxDepth = 33;
  MM.Save.persist();
  MM.Save._dropCache();
  ok(MM.Save.challenge().id === 'daily', '遗物集齐后推荐每日或同图挑战，不提示超过 44m');

  /* (f) 渲染冒烟：标题页（遗物行）/ 结算页（遗物新发现） */
  let renderOk2 = true;
  try {
    const t2 = new MM.TitleScene();
    t2.enter();
    t2.draw(fakeCtx());
    const m2 = new MM.MiningMode('RELIC-REND');
    m2.enter();
    pump(m2);
    MM.Tutorial.skip(m2.tutorial);
    m2.run.relicsFound = ['oldLamp'];
    m2.settle('direct');
    m2.draw(fakeCtx());
  } catch (e) {
    renderOk2 = false;
    console.log('  ! 渲染异常：' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
  ok(renderOk2, '标题页遗物行 / 结算页遗物新发现渲染无异常');
}

/* ============================================================
 * ㉔ V0.8.3 低风险完善（情境提示 / 路线回顾 / 每日挑战 / 键盘 / 图鉴）
 * ============================================================ */
section('㉔ V0.8.3 情境提示 / 路线回顾 / 每日挑战 / 键盘 / 图鉴');
{
  freshStore();

  /* (a) 一次性情境提示：首次出现、之后不再打扰 */
  ok(MM.Tips && MM.Tips.seen('supply') === false, '提示系统初始为未读状态');
  const mTip = new MM.MiningMode('TIP-1');
  mTip.enter();
  pump(mTip);
  MM.Tutorial.skip(mTip.tutorial);
  ok(mTip.tipOnce('cart', '测试提示 A') === true, '首次提示返回 true 并写入');
  ok(mTip.tipOnce('cart', '测试提示 A') === false, '同一提示第二次不再出现');
  mTip.run.mineValue = 150;
  mTip.checkProgress();
  ok(mTip.messages.map((m) => m.text).join('|').indexOf('每档只发一次') >= 0,
    '首次打开三选一补给时出现情境提示');
  const supplyHintCount = mTip.messages.filter((m) => m.text.indexOf('每档只发一次') >= 0).length;
  mTip.modal = null;
  mTip.checkProgress();
  ok(mTip.messages.filter((m) => m.text.indexOf('每档只发一次') >= 0).length === supplyHintCount,
    '再次打开补给弹窗不重复提示');
  const mStyle = new MM.MiningMode('TIP-2', 'full', { style: 'racer' });
  mStyle.enter();
  ok(mStyle.messages.map((m) => m.text).join('|').indexOf('风格是可选目标') >= 0,
    '带风格开局首次出现"风格说明"提示');

  /* (b) 岔路记录：同一条支线只记一次 */
  const mRoute = new MM.MiningMode('ROUTE-1');
  mRoute.enter();
  pump(mRoute);
  MM.Tutorial.skip(mRoute.tutorial);
  const br0 = (mRoute.map.branches || [])[0];
  ok(!!br0, '测试地图含岔路');
  const bc0 = mRoute.map.get(br0.cells[0].x, br0.cells[0].y);
  const ex0 = MM.Dig.excavate(mRoute.run, mRoute.map, bc0, 'test');
  mRoute.processEvents(ex0.events);
  ok(mRoute.run.stats.branchLog.length === 1 && mRoute.run.stats.branchLog[0].branchId === bc0.branchId,
    '走进岔路会记录到本局取舍（tier=' + mRoute.run.stats.branchLog[0].tier + '）');
  const bc1 = mRoute.map.get(br0.cells[1].x, br0.cells[1].y);
  if (bc1 && !bc1.excavated) {
    const ex1 = MM.Dig.excavate(mRoute.run, mRoute.map, bc1, 'test');
    mRoute.processEvents(ex1.events);
  }
  ok(mRoute.run.stats.branchLog.length === 1, '同一条岔路不会重复计数');

  /* (c) 矿车跳过统计进入结算 route */
  mRoute.run.stats.skippedMineralCount = 2;
  mRoute.run.stats.skippedMineralValue = 30;
  mRoute.run.stats.cartRides = 1;
  mRoute.run.stats.bombsUsed = 2;
  const sumRoute = MM.Reward.settle(mRoute.run, null, 'direct');
  ok(sumRoute.route && sumRoute.route.branches.length === 1 && sumRoute.route.skippedCount === 2
    && sumRoute.route.skippedValue === 30 && sumRoute.route.cartRides === 1 && sumRoute.route.bombs === 2,
    '结算 route 汇总：岔路 / 跳过矿物 / 矿车 / 工具');

  /* (d) 每日挑战：日期固定 Seed + 本机成绩查询 */
  const dayA = new Date(Date.UTC(2026, 8, 28, 12));
  const dayB = new Date(Date.UTC(2026, 8, 29, 12));
  const dailyA = MM.Expedition.daily(dayA);
  const dailyB = MM.Expedition.daily(dayB);
  const dailyC = MM.Expedition.daily(new Date(Date.UTC(2026, 8, 30, 12)));
  const dailyAEnd = MM.Expedition.daily(new Date(Date.UTC(2026, 8, 28, 23, 59)));
  ok(dailyA.mineId === 'oldMine' && dailyA.seed === 'EXPEDITION-DAILY-20260928-oldMine', '每日 Seed 使用 UTC 日期与确定性矿区');
  ok(dailyA.seed === dailyAEnd.seed && dailyA.mineId === dailyAEnd.mineId, '同一 UTC 日期生成同一矿区与 Seed');
  ok(dailyB.mineId === 'resonanceCave' && dailyC.mineId === 'clockworkMine'
    && MM.Expedition.daily(new Date(Date.UTC(2026, 9, 1, 12))).mineId === 'oldMine', '每日挑战按 UTC 日期循环轮换三个普通矿区');
  ok(MM.dailySeed(dayA) !== MM.dailySeed(dayB), '不同 UTC 日期生成不同 Seed');
  freshStore();
  MM.Expedition.trackRelic('oldLamp');
  const mDaily = new MM.MiningMode(dailyB.seed, dailyB.mineId, {
    challengeMode: 'daily', challengeParams: { mode: 'daily' },
  });
  mDaily.enter();
  pump(mDaily);
  ok(mDaily.map.spec.mineId === 'resonanceCave' && mDaily.run.relicTarget === null,
    '每日可直接进入个人尚未解锁的轮换矿区，且不读取遗物追踪');
  ok(MM.UPGRADE_ORDER.every((id) => MM.Upgrades.canAcquire(Object.assign(MM.State.createRun('DAILY-UPGRADE-' + id), { challengeMode: 'daily' }), id).ok),
    '每日挑战不受个人配方解锁限制，六种改造都可用');
  mDaily.run.maxDepthReached = 25;
  MM.Reward.settle(mDaily.run, MM.Save, 'direct');
  const dailyBest = MM.Save.seedBestOf(dailyB.seed, dailyB.mineId, { mode: 'daily' });
  ok(dailyBest && dailyBest.bestDepth === 25 && dailyBest.runs === 1, '每日挑战成绩写入本机记录并可查询');
  ok(MM.Save.seedBestOf(MM.dailySeed(new Date(Date.UTC(2026, 8, 27, 12))), 'clockworkMine', { mode: 'daily' }) === null,
    '未玩过的日期没有记录');

  /* (e) 键盘：方向键行动 / Esc 取消 / 数字键选补给 / 教程期间不误触 */
  localStorage.removeItem(MM.Tutorial.KEY); // 仅此用例模拟首次进入
  const mKey = new MM.MiningMode('KEY-1');
  mKey.enter();
  pump(mKey);
  const beforeY = mKey.run.playerY;
  MM.Input.push({ type: 'key', key: 'ArrowDown' });
  mKey.update(0.05);
  ok(mKey.run.state === S.EXPLORING && mKey.run.playerY === beforeY && !mKey.run.action,
    '教程未完成时方向键不会误触挖矿（教程引导优先）');
  MM.Tutorial.skip(mKey.tutorial);
  const targetX = mKey.run.playerX, targetY = mKey.run.playerY + 1;
  const targetCell = mKey.map.get(targetX, targetY);
  ok(targetCell && !targetCell.excavated, '入口下方存在可挖的相邻格');
  MM.Input.push({ type: 'key', key: 's' });
  mKey.update(0.05);
  ok(mKey.run.state === S.DIGGING && mKey.run.action && mKey.run.action.x === targetX,
    'WASD 的 s 键开始挖掘下方岩块（等价于点击）');
  pump(mKey);
  ok(mKey.map.get(targetX, targetY).excavated, '键盘挖掘正常结算');

  mKey.toggleBomb();
  ok(mKey.armedTool === 'bomb', '炸药瞄准已开启');
  MM.Input.push({ type: 'key', key: 'Escape' });
  mKey.update(0.05);
  ok(mKey.armedTool === null, 'Esc 取消炸药瞄准');

  mKey.run.mineValue = 150;
  mKey.checkProgress();
  ok(mKey.modal && mKey.modal.type === 'supply', '键盘测试：补给弹窗已打开');
  MM.Input.push({ type: 'key', key: '2' });
  mKey.update(0.05);
  ok(!mKey.modal && mKey.run.supplies.t2 === 'bomb', '数字键 2 选择第二个补给选项');

  /* (f) 遗物图鉴：点击打开 / 任意点击关闭 / 渲染冒烟 */
  const tCodex = new MM.TitleScene();
  tCodex.enter();
  tCodex.draw(fakeCtx());
  ok(!!tCodex.hit.archive, '标题页有探索档案入口');
  MM.Input.push({ type: 'down', x: tCodex.hit.archive.x + 20, y: tCodex.hit.archive.y + 20 });
  tCodex.update();
  tCodex.draw(fakeCtx());
  ok(!!tCodex.hit.relics, '标题页有"矿坑遗物"图鉴入口热区');
  MM.Input.push({ type: 'down', x: tCodex.hit.relics.x + 10, y: tCodex.hit.relics.y + 10 });
  tCodex.update();
  ok(tCodex.codexOpen === true, '点击遗物行打开图鉴');
  let codexDrawOk = true;
  try { tCodex.draw(fakeCtx()); } catch (e) { codexDrawOk = false; }
  ok(codexDrawOk, '图鉴覆盖层渲染无异常');
  MM.Input.push({ type: 'down', x: tCodex.hit.codexClose.x + tCodex.hit.codexClose.w / 2,
    y: tCodex.hit.codexClose.y + tCodex.hit.codexClose.h / 2 });
  tCodex.update();
  ok(tCodex.codexOpen === false, '点击关闭按钮关闭图鉴');
}

/* ============================================================ */
/* ㉕ V1.0 矿脉远征收尾：遗物里程碑 / 改造贡献 / 封存矿库 */
section('㉕ V1.0 遗物里程碑 / 改造贡献 / 封存矿库路线');
{
  /* (a) 三个收藏里程碑严格按永久遗物数量解锁。 */
  freshStore();
  ok(MM.Relics.milestoneStatus().every((m) => !m.unlocked), '没有遗物时所有里程碑保持锁定');
  ['oldLamp', 'goldPick'].forEach((id, i) => MM.Relics.collect(MM.State.createRun('MILESTONE-' + i), id));
  ok(MM.Relics.milestoneUnlocked('crystalLamp') && MM.Relics.lampTint() === '#91d9ff'
    && !MM.Relics.milestoneUnlocked('minerBadge'), '收集 2 件解锁晶蓝矿灯，不提前解锁徽章');
  ['crystalHeart', 'tornMap'].forEach((id, i) => MM.Relics.collect(MM.State.createRun('MILESTONE-4-' + i), id));
  ok(MM.Relics.milestoneUnlocked('minerBadge') && !MM.Relics.milestoneUnlocked('keeperTitle'),
    '收集 4 件解锁矿工徽章，称号仍锁定');
  ['carvedTag', 'silverBell'].forEach((id, i) => MM.Relics.collect(MM.State.createRun('MILESTONE-6-' + i), id));
  const keeper = MM.Relics.milestone('keeperTitle');
  ok(MM.Relics.milestoneUnlocked('keeperTitle') && MM.Relics.milestoneStatus().every((m) => m.unlocked)
    && keeper.note.indexOf('最后一盏灯') >= 0, '收集 6 件解锁守藏人称号与完整矿工手记');

  /* (b) 余烬灯芯把实际恢复量记入结算，不把体力上限溢出算成贡献。 */
  freshStore();
  const glowRun = MM.State.createRun('AFTERGLOW-ACTUAL');
  glowRun.upgrades = ['afterglowWick'];
  glowRun.lampDigsRemaining = 6;
  glowRun.stamina = 48;
  const glowEvents = [];
  MM.Rooms.onCellExcavated(glowRun, blankMap(), { x: 2, y: 5, roomId: 'spring' }, glowEvents);
  ok(glowRun.stats.afterglowRooms === 1 && glowRun.stats.afterglowStaminaRestored === 2
    && glowEvents.some((e) => e.type === 'afterglowHeal' && e.amount === 2),
  '余烬灯芯按上限精确记录本次实际恢复 2 点体力');

  /* (c) 结算升级贡献字段逐项来自实际局内统计，并完整保留已装备改造。 */
  const contributionRun = MM.State.createRun('UPGRADE-CONTRIBUTIONS');
  contributionRun.upgrades = MM.UPGRADE_ORDER.slice();
  Object.assign(contributionRun.stats, {
    chainOreCells: 2, drillStaminaSaved: 3, recoveryPicks: 1, recoveryOreEvents: 2,
    afterglowRooms: 1, afterglowStaminaRestored: 2, lensHints: 3, directionalBlastWalls: 4,
  });
  const contributionSummary = MM.Reward.settle(contributionRun, null, 'direct');
  const contributions = contributionSummary.upgradeContributions;
  ok(contributionSummary.upgrades.length === 6 && contributions.chainPickOreCells === 2
    && contributions.hardRockDrillStaminaSaved === 3 && contributions.recoveryPicksGranted === 1
    && contributions.recoveryOreCells === 2 && contributions.afterglowStaminaRestored === 2
    && contributions.prospectingHints === 3 && contributions.directionalMaxWalls === 4,
  '结算快照覆盖六类装备改造的实际触发统计');

  /* (d) 两条不同纵向巷道与不同两槽装备都能通过真实挖掘/移动规则抵达矿库门口。 */
  const sealedMap = MM.Generator.generateValidated('EXPEDITION-SEALED-01', 'sealedVault').map;
  const simulateSealedRoute = (laneX, upgrades, seed) => {
    const work = sealedMap.clone();
    const run = MM.State.createRun(seed);
    run.mapId = 'sealedVault';
    run.sealedTrial = true;
    run.upgrades = upgrades.slice();
    const log = [];
    const supplies = [];
    const policy = { pick: true, bomb: true, supplyPref: 'stamina' };
    const route = MM.Simulator._moveTo(work, run, laneX, 42, policy, log, supplies);
    const entrance = route.ok
      ? MM.Simulator._moveTo(work, run, 4, 43, policy, log, supplies)
      : { ok: false, reason: 'route failed' };
    return { run, log, route, entrance, laneX, upgrades };
  };
  const west = simulateSealedRoute(3, ['chainPick', 'hardRockDrill'], 'SEALED-WEST');
  const east = simulateSealedRoute(5, ['directionalBomb', 'recoveryKit'], 'SEALED-EAST');
  ok(sealedMap.validated && west.route.ok && west.entrance.ok && west.run.playerX === 4 && west.run.playerY === 43
    && east.route.ok && east.entrance.ok && east.run.playerX === 4 && east.run.playerY === 43
    && west.laneX !== east.laneX && west.upgrades.join('|') !== east.upgrades.join('|'),
  '封存矿库西/东路线以不同改造组合均合法抵达藏宝库门口');

  /* (e) 纪念物只在首次封存矿库通关发放，重打不重复，普通藏宝库不触发。 */
  freshStore();
  const sealedFirst = MM.State.createRun('SEALED-FIRST-CLEAR');
  sealedFirst.runId = 'sealed-first-clear';
  sealedFirst.mapId = 'sealedVault';
  sealedFirst.sealedTrial = true;
  sealedFirst.treasureReached = true;
  sealedFirst.maxDepthReached = 43;
  const sealedFirstSummary = MM.Reward.settle(sealedFirst, MM.Save, 'treasure');
  const sealedProgress = MM.Save.get().miningSave.expedition;
  ok(sealedFirstSummary.sealedEnding && sealedFirstSummary.sealedMemorialGranted
    && sealedFirstSummary.sealedMemorial === '封存者铭牌' && sealedProgress.sealedMineCompleted
    && sealedProgress.sealedRewardClaimed, '首次封存矿库通关记录终局、陈列纪念物并领取一次性奖励');
  const currencyAfterFirst = MM.Save.currency();
  const sealedRepeat = MM.State.createRun('SEALED-REPEAT-CLEAR');
  sealedRepeat.runId = 'sealed-repeat-clear';
  sealedRepeat.mapId = 'sealedVault';
  sealedRepeat.sealedTrial = true;
  sealedRepeat.treasureReached = true;
  sealedRepeat.maxDepthReached = 43;
  const sealedRepeatSummary = MM.Reward.settle(sealedRepeat, MM.Save, 'treasure');
  const regular = MM.State.createRun('REGULAR-NO-SEALED-MEMORIAL');
  regular.runId = 'regular-no-sealed-memorial';
  regular.mapId = 'oldMine';
  regular.treasureReached = true;
  const regularSummary = MM.Reward.settle(regular, null, 'treasure');
  ok(!sealedRepeatSummary.sealedMemorialGranted && !regularSummary.sealedEnding
    && MM.Save.currency() === currencyAfterFirst + MM.BALANCE.META_REWARD.REPEAT_TREASURE,
  '再次通关与普通矿井均不重复发放封存纪念物/专属奖励');
}

/* ============================================================ */
/* ㉖ V1.0 规则闭环：矿区生成 / 共鸣石 / 闸门 / 改造上限 / 存档恢复 */
section('㉖ V1.0 矿区生成 / 共鸣石 / 闸门 / 改造上限 / 存档恢复');
{
  /* (a) 三个新矿区及封存矿库均使用正式 9×45 图并通过地图验证。 */
  const mineCases = [
    ['resonanceCave', '共鸣晶窟', true],
    ['clockworkMine', '机巧矿场', true],
    ['sealedVault', '封存矿库', true],
  ];
  mineCases.forEach(([id, name]) => {
    const generated = MM.Generator.generateValidated('EXPANSION-SMOKE-' + id, id);
    ok(generated.report.ok && generated.map.w === 9 && generated.map.h === 45
      && generated.map.spec.mineId === id && generated.map.validated,
    name + '生成 9×45 有效地图');
  });
  const resonanceMap = MM.Generator.generateValidated('EXPANSION-SMOKE-resonance', 'resonanceCave').map;
  const clockworkMap = MM.Generator.generateValidated('EXPANSION-SMOKE-clockwork', 'clockworkMine').map;
  ok((resonanceMap.resonanceStones || []).length >= 1
    && resonanceMap.resonanceStones.every((p) => resonanceMap.get(p.x, p.y).specialType === 'resonanceStone'),
  '共鸣晶窟在地图索引与实际格子中一致放置共鸣石');
  ok(!!clockworkMap.gate && !!clockworkMap.get(clockworkMap.gate.x, clockworkMap.gate.y)
    && clockworkMap.get(clockworkMap.gate.barrier.x, clockworkMap.gate.barrier.y).specialType === 'gateBarrier',
  '机巧矿场控制台和关闭的实体闸门均已生成');

  /* (b) 共鸣石付体力后只降低普通岩层成本，不直接产生矿物或制作材料。 */
  const resonanceRun = MM.State.createRun('RESONANCE-RULE');
  resonanceRun.playerX = 4; resonanceRun.playerY = 0;
  resonanceRun.stamina = 10;
  const rMap = blankMap();
  const stone = rMap.get(4, 1);
  stone.specialType = 'resonanceStone'; stone.excavated = false; stone.revealed = true;
  const ordinary = rMap.get(5, 1);
  ordinary.terrainType = 'rock'; ordinary.digCost = 3; ordinary.excavated = false;
  const mineral = rMap.get(3, 1);
  mineral.terrainType = 'rock'; mineral.digCost = 3; mineral.excavated = false;
  mineral.resourceType = 'copper'; mineral.resourceValue = MM.Resources.value('copper');
  const modeResonance = new MM.MiningMode('RESONANCE-MODE');
  modeResonance.run = resonanceRun; modeResonance.map = rMap; modeResonance.messages = [];
  modeResonance.effects = { ring() {}, floatText() {} };
  const beforeMaterials = Object.assign({}, resonanceRun.materials);
  ok(modeResonance.activateResonanceStone(stone) === true
    && resonanceRun.stamina === 8 && resonanceRun.stats.resonanceUses === 1
    && ordinary.digCost === 2 && ordinary.resonanceReduced
    && mineral.digCost === 3 && resonanceRun.mineValue === 0
    && JSON.stringify(resonanceRun.materials) === JSON.stringify(beforeMaterials),
  '共鸣石消耗体力并降普通岩成本；矿物仍需实际挖掘才会入账');
  ok(modeResonance.activateResonanceStone(stone) === false && resonanceRun.stamina === 8,
    '同一共鸣石不能重复启动或重复扣体力');

  /* (c) 闸门修复付铜开侧路且不造矿；拆解给银但保持关闭；两个选择都只能结算一次。 */
  const gateMap = MM.Generator.generateValidated('GATE-CHOICE-REPAIR', 'clockworkMine').map;
  const repairRun = MM.State.createRun('GATE-REPAIR');
  repairRun.materials = { copper: 2, silver: 0, gold: 0, crystal: 0 };
  const repairMode = new MM.MiningMode('GATE-REPAIR-MODE');
  repairMode.run = repairRun; repairMode.map = gateMap; repairMode.modal = { type: 'gateChoice' };
  repairMode.messages = [];
  repairMode.chooseGate('repair');
  const barrier = gateMap.get(gateMap.gate.barrier.x, gateMap.gate.barrier.y);
  const noResourceGrant = gateMap.gate.path.every((p) => {
    const c = gateMap.get(p.x, p.y);
    return c.excavated && c.resourceType === null && c.resourceValue === 0 && c.resourceGranted;
  });
  const copperAfterRepair = repairRun.materials.copper;
  repairMode.chooseGate('repair');
  ok(gateMap.gate.resolved && gateMap.gate.opened && barrier.gateOpen
    && repairRun.materials.copper === 0 && repairRun.materials.silver === 0
    && noResourceGrant && copperAfterRepair === repairRun.materials.copper,
  '修复闸门只扣铜、打开侧路、不生成矿物且不可重复领取');

  const dismantleMap = MM.Generator.generateValidated('GATE-CHOICE-DISMANTLE', 'clockworkMine').map;
  const dismantleRun = MM.State.createRun('GATE-DISMANTLE');
  dismantleRun.materials = { copper: 0, silver: 0, gold: 0, crystal: 0 };
  const dismantleMode = new MM.MiningMode('GATE-DISMANTLE-MODE');
  dismantleMode.run = dismantleRun; dismantleMode.map = dismantleMap;
  dismantleMode.modal = { type: 'gateChoice' }; dismantleMode.messages = [];
  dismantleMode.chooseGate('dismantle');
  dismantleMode.modal = { type: 'gateChoice' };
  dismantleMode.chooseGate('dismantle');
  ok(dismantleMap.gate.resolved && !dismantleMap.gate.opened
    && !dismantleMap.get(dismantleMap.gate.barrier.x, dismantleMap.gate.barrier.y).gateOpen
    && dismantleRun.materials.silver === 1 && dismantleRun.stats.gatesDismantled === 1,
  '拆解闸门保持封闭并且银料只发放一次');

  /* (d) 硬岩钻头仅对六次普通硬岩挖掘省 1 体力；强化矿镐不占钻头次数。 */
  const drillRun = MM.State.createRun('DRILL-LIMIT');
  drillRun.upgrades = ['hardRockDrill']; drillRun.tools.powerPick = 1;
  drillRun.stamina = 40;
  const drillMap = blankMap();
  const hard = drillMap.get(4, 1);
  hard.terrainType = 'hard'; hard.digCost = 3; hard.revealed = true;
  ok(MM.Tools.tryPowerPick(drillRun).ok, '强化矿镐可在钻头测试前正常启用');
  let freeAction = MM.Dig.begin(drillRun, drillMap, 4, 1);
  MM.Dig.resolve(drillRun, drillMap, freeAction);
  ok(drillRun.stamina === 40 && drillRun.stats.drillUses === 0 && !drillRun.freeDig,
    '强化矿镐免体力但不消耗硬岩钻头次数');
  for (let i = 0; i < 6; i++) {
    hard.excavated = false; hard.resourceGranted = false;
    const action = MM.Dig.begin(drillRun, drillMap, 4, 1);
    if (action.ok) MM.Dig.resolve(drillRun, drillMap, action);
  }
  hard.excavated = false; hard.resourceGranted = false;
  const seventhDrillAction = MM.Dig.begin(drillRun, drillMap, 4, 1);
  ok(drillRun.stats.drillUses === 6 && drillRun.stats.drillStaminaSaved === 6
    && seventhDrillAction.ok && seventhDrillAction.cost === 3 && !seventhDrillAction.usesDrill,
  '硬岩钻头前六次各省 1 体力，第七次恢复原始成本');

  /* (e) 连脉镐只触发一层额外矿格；余烬灯芯为 8 次挖掘、最多触发三间房。 */
  const chainRun = MM.State.createRun('CHAIN-ONCE');
  chainRun.upgrades = ['chainPick'];
  const chainMap = blankMap();
  [[4,1],[3,1],[2,1]].forEach(([x,y]) => {
    const c = chainMap.get(x,y); c.excavated = false; c.revealed = true;
    c.resourceType = 'copper'; c.resourceValue = MM.Resources.value('copper');
  });
  const chainAction = MM.Dig.begin(chainRun, chainMap, 4, 1);
  MM.Dig.resolve(chainRun, chainMap, chainAction);
  ok(chainRun.stats.chainOreCells === 1 && chainMap.get(3,1).excavated && !chainMap.get(2,1).excavated,
    '连脉镐额外挖一格相邻同类矿，不递归触发第二次');

  const lampRun = MM.State.createRun('AFTERGLOW-LIMIT');
  lampRun.upgrades = ['afterglowWick']; lampRun.tools.lamp = 1;
  ok(MM.Tools.tryLamp(lampRun).ok && lampRun.lampDigsRemaining === 8,
    '余烬灯芯把探矿灯延长到八次成功挖掘');
  const roomEvents = [];
  for (let i = 0; i < 4; i++) {
    const events = [];
    MM.Rooms.onCellExcavated(lampRun, blankMap(), {
      x: 2, y: 4 + i, roomId: 'afterglow-room-' + i,
    }, events);
    roomEvents.push.apply(roomEvents, events);
  }
  ok(lampRun.stats.afterglowRooms === 3 && lampRun.stats.afterglowStaminaRestored === 6
    && roomEvents.filter((e) => e.type === 'afterglowHeal').length === 3,
  '余烬灯芯最多触发三间房并按真实恢复量计数');

  /* (f) 恢复点保存完整地图、资源、改造、工具与弹窗；恢复后回到稳定探索状态。 */
  freshStore();
  const saveMap = MM.Generator.generateValidated('ACTIVE-RUN-ROUNDTRIP', 'clockworkMine').map;
  const saveRun = MM.State.createRun('ACTIVE-RUN-ROUNDTRIP');
  saveRun.runId = 'active-roundtrip-unique'; saveRun.mapId = 'clockworkMine';
  saveRun.state = S.EXPLORING; saveRun.currentDepth = 17; saveRun.maxDepthReached = 19;
  saveRun.stamina = 23; saveRun.materials = { copper: 4, silver: 2, gold: 1, crystal: 0 };
  saveRun.upgrades = ['directionalBomb', 'recoveryKit']; saveRun.tools.bomb = 2;
  saveRun.upgradeUses = { directionalBomb: 1 };
  saveRun.stats.recoveryPicks = 1;
  saveMap.gate.resolved = true; saveMap.gate.opened = false;
  const saveCell = saveMap.get(saveMap.gate.barrier.x, saveMap.gate.barrier.y);
  saveCell.gateOpen = false; saveCell.revealed = true;
  ok(MM.Save.saveActiveRun(saveRun, saveMap, { type: 'gateChoice' }), '稳定探索状态可写入活动存档');
  const restored = MM.Save.restoreActiveRun();
  const restoredCell = restored && restored.map.get(saveCell.x, saveCell.y);
  ok(restored && restored.run.mapId === 'clockworkMine' && restored.run.state === S.EXPLORING
    && restored.run.stamina === 23 && restored.run.materials.silver === 2
    && restored.run.upgrades.join('|') === 'directionalBomb|recoveryKit'
    && restored.run.tools.bomb === 2 && restored.run.stats.recoveryPicks === 1
    && restored.modal.type === 'gateChoice' && restored.map.gate.resolved
    && restoredCell.specialType === 'gateBarrier' && restoredCell.revealed && !restoredCell.gateOpen
    && restored.run.action === null && restored.run.move === null,
  '恢复保留地图机关、矿料、工具和改造并清空过渡动作');
  MM.Save.clearActiveRun('active-roundtrip-unique');

  /* (g) 同一局的藏宝库抵达检查幂等，应用恢复或结算兜底不会重复记数。 */
  freshStore();
  const arrivalRun = MM.State.createRun('ARRIVAL-IDEMPOTENCE');
  arrivalRun.runId = 'arrival-idempotence'; arrivalRun.mapId = 'sealedVault';
  const countBefore = MM.Save.get().miningSave.treasureReachCount;
  const arrivalA = MM.Save.markTreasureArrival(arrivalRun, null);
  const arrivalB = MM.Save.markTreasureArrival(arrivalRun, null);
  ok(arrivalA.firstSealedClear && arrivalB.firstSealedClear
    && MM.Save.get().miningSave.treasureReachCount === countBefore + 1,
  '同一局重复记录抵达仅计一次并保留首次封存通关身份');

  /* (h) 矿区解锁按实际里程碑串联；Seed 挑战不继承个人遗物追踪或配方锁。 */
  freshStore();
  let progression = MM.Save.get().miningSave;
  MM.Expedition.evaluateUnlocks(progression);
  ok(!MM.Expedition.canEnter('resonanceCave').ok && !MM.Expedition.canEnter('clockworkMine').ok
    && !MM.Expedition.canEnter('sealedVault').ok,
  '新档只开放旧矿井，其余矿区保持锁定');
  progression.archive.maxDepth = 30;
  MM.Expedition.evaluateUnlocks(progression);
  progression.expedition.firstClearMines.push('oldMine');
  MM.Expedition.evaluateUnlocks(progression);
  ok(MM.Expedition.canEnter('resonanceCave').ok && MM.Expedition.canEnter('clockworkMine').ok
    && !MM.Expedition.canEnter('sealedVault').ok,
  '到达 30m 开放共鸣晶窟，普通矿区首通开放机巧矿场');
  progression.expedition.firstClearMines.push('resonanceCave', 'clockworkMine');
  MM.Expedition.evaluateUnlocks(progression);
  ok(MM.Expedition.canEnter('sealedVault').ok,
  '完成三个普通矿区的首次藏宝库远征后开放封存矿库');

  freshStore();
  MM.Expedition.trackRelic('crystalHeart');
  const seedMode = new MM.MiningMode('STANDARD-SEED-IDENTITY', 'oldMine', {
    challengeMode: 'seed', challengeParams: { mode: 'seed' },
  });
  seedMode.enter();
  const seedExpected = MM.Generator.generateValidated('STANDARD-SEED-IDENTITY', 'oldMine').map;
  ok(seedMode.run.relicTarget === null && seedMode.map.digest() === seedExpected.digest()
    && seedMode.run.challengeParams.mode === 'seed',
  '个人遗物追踪不会改变标准 Seed 挑战地图或挑战参数');
  ok(MM.UPGRADE_ORDER.every((id) => MM.Upgrades.canAcquire(Object.assign(
    MM.State.createRun('STANDARD-SEED-UPGRADE-' + id), { challengeMode: 'seed' }), id).ok),
  '标准 Seed 挑战中六种改造的可用条件一致');
}

/* ============================================================ */
console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (failures.length) {
  console.log('\n失败列表：');
  failures.forEach((f) => console.log('  ✗ ' + f));
}
console.log(fail === 0 ? '\n✅ 全部验收项通过' : '\n❌ 存在未通过项，请先修复');
process.exit(fail === 0 ? 0 : 1);
