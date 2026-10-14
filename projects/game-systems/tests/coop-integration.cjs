'use strict';

const assert = require('node:assert/strict');
const Game = require('../games/coop/src/game-shared.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
let serial = 0;

function Client(accountId) {
  this.accountId = accountId;
  this.ws = new WebSocket(WS_URL);
  this.history = [];
  this.latest = null;
  this.opened = new Promise((resolve, reject) => {
    this.ws.addEventListener('open', resolve, { once: true });
    this.ws.addEventListener('error', reject, { once: true });
  });
  this.ws.addEventListener('message', (event) => {
    const value = JSON.parse(event.data);
    this.history.push(value);
    if (value.type === 'snapshot') this.latest = value;
  });
}

Client.prototype.send = function (value) {
  this.ws.send(JSON.stringify(value));
};

Client.prototype.waitFor = async function (predicate, label, timeoutMs) {
  const timeout = timeoutMs || 5000;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const found = this.history.find(predicate);
    if (found) return found;
    await sleep(20);
  }
  throw new Error('等待超时：' + label);
};

Client.prototype.waitSnapshot = async function (predicate, label, timeoutMs) {
  const timeout = timeoutMs || 7000;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (this.latest && predicate(this.latest)) return this.latest;
    await sleep(20);
  }
  const world = this.latest && this.latest.world;
  const detail = world ? JSON.stringify({
    phase: this.latest.phase, elapsed: Math.round(world.elapsed), players: world.players.map(function (p) {
      return { x: Math.round(p.x), y: Math.round(p.y), grounded: p.grounded };
    }), flags: world.flags, boxes: world.boxes, lifts: world.lifts,
    inputs: world.players.map(function (p) { return p.input; }),
    firstStage: controller.firstStage, partnerStage: controller.partnerStage
  }) : '';
  throw new Error('等待快照超时：' + label + '；' + detail);
};

Client.prototype.close = function () {
  try { this.ws.close(); } catch (_) {}
};

function newAccount(label) {
  serial += 1;
  return 'it_' + Date.now().toString(36) + '_' + serial + '_' + label;
}

async function waitOpen(client) { await client.opened; }

async function launchRoom(levelIndex, accountIds) {
  const a = new Client(accountIds[0]);
  await waitOpen(a);
  a.send({ type: 'create', accountId: a.accountId, name: '测试房主', level: levelIndex, playtestAllLevels: true });
  const joinedA = await a.waitFor(function (m) { return m.type === 'joined'; }, '房主创建房间');
  const b = new Client(accountIds[1]);
  await waitOpen(b);
  b.send({ type: 'join', code: joinedA.code, accountId: b.accountId, name: '测试伙伴' });
  await b.waitFor(function (m) { return m.type === 'joined'; }, '伙伴加入房间');
  await Promise.all([
    a.waitSnapshot(function (s) { return s.phase === 'lobby' && s.players[1].joined; }, '房主看到伙伴'),
    b.waitSnapshot(function (s) { return s.phase === 'lobby' && s.players[0].joined; }, '伙伴看到房主')
  ]);
  const duplicateCursor = b.history.length;
  b.send({ type: 'join', code: joinedA.code, accountId: b.accountId, name: '重复请求' });
  const duplicate = await b.waitFor(function (m, i) { return i >= duplicateCursor && m.type === 'joined' && m.resumed; }, '重复加入请求幂等处理');
  assert.equal(duplicate.slot, 1, '重复加入仍是原玩家位');
  await b.waitSnapshot(function (s) { return s.phase === 'lobby' && s.players.filter(function (p) { return p.joined; }).length === 2; }, '重复加入不占用额外玩家位');
  return {
    a: a, b: b, code: joinedA.code, tokenA: joinedA.token,
    tokenB: b.history.find(function (m) { return m.type === 'joined'; }).token
  };
}

async function startRoom(room, levelIndex) {
  if (levelIndex !== 0) room.a.send({ type: 'level', value: levelIndex });
  room.a.send({ type: 'ready', value: true });
  room.b.send({ type: 'ready', value: true });
  await Promise.all([
    room.a.waitSnapshot(function (s) { return s.players.every(function (p) { return p.joined && p.ready; }); }, '两人准备'),
    room.b.waitSnapshot(function (s) { return s.players.every(function (p) { return p.joined && p.ready; }); }, '两人准备同步')
  ]);
  room.a.send({ type: 'start' });
  await Promise.all([
    room.a.waitSnapshot(function (s) { return s.phase === 'playing'; }, '开始游戏'),
    room.b.waitSnapshot(function (s) { return s.phase === 'playing'; }, '另一端开始游戏')
  ]);
}

async function assertSynchronized(room, condition, label) {
  const first = await room.a.waitSnapshot(condition, label + '（房主）', 10000);
  const second = await room.b.waitSnapshot(condition, label + '（伙伴）', 10000);
  assert.equal(first.world.levelIndex, second.world.levelIndex, label + '关卡相同');
  first.world.players.forEach(function (player, i) {
    assert.ok(Math.abs(player.x - second.world.players[i].x) <= Game.PHYSICS.speed * 0.09, label + '角色坐标同步');
    assert.ok(Math.abs(player.y - second.world.players[i].y) <= 30, label + '角色高度同步');
  });
  assert.deepEqual(second.world.flags, first.world.flags, label + '机关同步');
  assert.deepEqual(second.world.boxes, first.world.boxes, label + '箱子同步');
  assert.deepEqual(second.world.lifts, first.world.lifts, label + '升降台同步');
  return first;
}

function controller(levelIndex, world, playerIndex) {
  const player = world.players[playerIndex];
  const x = player.x;
  let input = { left: false, right: false, jump: false, interact: false };

  if (levelIndex === 0) {
    if (!world.flags.latchMoonGate) {
      if (playerIndex === 0) input.right = x < 225;
      else {
        input.right = true;
        input.interact = !world.flags.switch && x >= 650 && x < 720;
      }
      return input;
    }
    input.right = x < 1140;
    input.jump = player.grounded && x >= 735 && x < 880;
    return input;
  }

  if (levelIndex === 1) {
    if (playerIndex === 0) {
      if (!world.flags.upperRune) {
        input.right = x < 330;
        input.interact = x >= 255 && x < 365;
      } else if (!world.flags.upperBridge) {
        input.right = x < 390;
      } else {
        input.right = x < 1140;
      }
      return input;
    }
    if (!world.flags.lowerBridge) {
      input.right = x < 390;
    } else if (!world.flags.lowerRune) {
      input.right = x < 775;
      input.interact = x >= 720 && x < 820;
    } else {
      input.right = x < 1140;
    }
    return input;
  }

  if (levelIndex === 2) {
    const lift = world.lifts[0];
    if (playerIndex === 0) {
      if (!world.flags.cratePower) {
        controller.firstStage = 'push';
        input.right = true;
        return input;
      }
      if (controller.firstStage === 'push') controller.firstStage = 'wait-up';
      if (controller.firstStage === 'wait-up') {
        if (lift.y < lift.bottom - 2) controller.firstStage = 'wait-bottom';
        return input;
      }
      if (controller.firstStage === 'wait-bottom') {
        if (world.flags.topSwitch && lift.target === lift.bottom && lift.y >= lift.bottom - 2) controller.firstStage = 'join-bottom';
        else return input;
      }
      if (controller.firstStage === 'join-bottom' && x < 640) {
        input.right = true;
        input.jump = player.grounded && ((x >= 300 && x < 390) || (x >= 570 && x < 625));
        return input;
      }
      if (controller.firstStage === 'join-bottom' && lift.y >= lift.bottom - 2 && lift.target === lift.bottom) {
        if (!controller.firstInteractTick || world.tick - controller.firstInteractTick > 12) {
          input.interact = true;
          controller.firstInteractTick = world.tick;
          controller.firstStage = 'press-up';
        }
        return input;
      }
      if (controller.firstStage === 'press-up') {
        if (lift.target === lift.top) controller.firstStage = 'ride-up';
        else if (world.tick - controller.firstInteractTick > 12) controller.firstStage = 'join-bottom';
        return input;
      }
      if (controller.firstStage === 'ride-up' && lift.y <= lift.top + 2) controller.firstStage = 'exit';
      if (controller.firstStage === 'exit') {
        input.right = x < 1140;
      }
      return input;
    }

    if (!world.flags.cratePower) return input;
    if (!controller.partnerStage) controller.partnerStage = 'approach';
    if (controller.partnerStage === 'approach') {
      input.right = x < 640;
      input.jump = player.grounded && ((x >= 300 && x < 390) || (x >= 570 && x < 625));
      if (x >= 625 && lift.y >= lift.bottom - 2 && !world.flags.topSwitch) {
        input.right = false;
        input.interact = true;
        controller.partnerStage = 'raise';
      }
      return input;
    }
    if (controller.partnerStage === 'raise') {
      if (lift.y <= lift.top + 2) controller.partnerStage = 'reach-switch';
      return input;
    }
    if (controller.partnerStage === 'reach-switch') {
      if (!world.flags.topSwitch) {
        input.right = x < 935;
        input.interact = x >= 900 && x < 990;
      } else {
        input.left = x > 680;
        if (x <= 700 && lift.y <= lift.top + 5 && lift.target !== lift.bottom) {
          input.left = false;
          input.interact = true;
          controller.partnerStage = 'lower';
        }
      }
      return input;
    }
    if (controller.partnerStage === 'lower') {
      if (lift.y >= lift.bottom - 2) controller.partnerStage = 'wait-for-second-ride';
      return input;
    }
    if (controller.partnerStage === 'wait-for-second-ride') {
      if (lift.target === lift.top || lift.y < lift.bottom - 2) controller.partnerStage = 'final-ride';
      return input;
    }
    if (controller.partnerStage === 'final-ride') {
      if (lift.y <= lift.top + 2) controller.partnerStage = 'exit';
      return input;
    }
    if (controller.partnerStage === 'exit') input.right = x < 1140;
    return input;
  }
  return input;
}

async function runAutomatedLevel(room, levelIndex, timeoutMs) {
  controller.firstStage = 'push';
  controller.firstInteractTick = 0;
  controller.partnerStage = null;
  const timer = setInterval(function () {
    const state = room.a.latest;
    if (!state || !state.world || state.phase !== 'playing') return;
    room.a.send(Object.assign({ type: 'input' }, controller(levelIndex, state.world, 0)));
    room.b.send(Object.assign({ type: 'input' }, controller(levelIndex, state.world, 1)));
  }, 25);
  try {
    const result = await room.a.waitSnapshot(function (s) { return s.phase === 'intermission'; }, '第 ' + (levelIndex + 1) + ' 关完整通关', timeoutMs || 60000);
    await assertSynchronized(room, function (s) { return s.phase === 'intermission'; }, '关卡结算状态');
    return result;
  } finally {
    clearInterval(timer);
    room.a.send({ type: 'input', left: false, right: false, jump: false, interact: false });
    room.b.send({ type: 'input', left: false, right: false, jump: false, interact: false });
  }
}

async function deathAndResetCheck(room) {
  room.a.send({ type: 'input', right: true });
  room.b.send({ type: 'input', right: true });
  await sleep(320);
  room.a.send({ type: 'input', left: false, right: false, jump: false, interact: false });
  room.b.send({ type: 'input', left: false, right: false, jump: false, interact: false });
  const before = room.a.latest.world.players[0].x;
  room.a.send({ type: 'input', right: true });
  await room.a.waitSnapshot(function (s) { return s.world.players[0].x > before + 20; }, '玩家输入更新');
  const aligned = room.a.latest;
  const synced = await room.b.waitSnapshot(function (s) { return s.world.tick >= aligned.world.tick; }, '第二端收到相同帧');
  assert.ok(Math.abs(aligned.world.players[0].x - synced.world.players[0].x) < 3, '位置由同一权威状态同步');
  room.a.send({ type: 'reset' });
  const reset = await room.a.waitSnapshot(function (s) {
    return s.phase === 'playing' && s.world.run > aligned.world.run && !s.world.flags.latchMoonGate;
  }, '重置人物和机关');
  assert.equal(reset.world.players[0].x, Game.LEVELS[0].spawns[0].x, '重置回共同检查点');

  const active = setInterval(function () {
    const state = room.a.latest;
    if (!state || !state.world || state.phase !== 'playing') return;
    if (state.world.message.includes('失足')) {
      room.a.send({ type: 'input', left: false, right: false, jump: false, interact: false });
      room.b.send({ type: 'input', left: false, right: false, jump: false, interact: false });
      return;
    }
    const p0 = state.world.players[0], p1 = state.world.players[1];
    room.a.send({ type: 'input', right: !state.world.flags.latchMoonGate && p0.x < 225 });
    room.b.send({
      type: 'input', right: !state.world.flags.latchMoonGate || p1.x < 850,
      jump: false,
      interact: !state.world.flags.switch && p1.x >= 650 && p1.x < 720
    });
  }, 25);
  try {
    const fallen = await room.a.waitSnapshot(function (s) {
      return s.phase === 'playing' && s.world.message.includes('失足') &&
        Math.abs(s.world.players[0].x - Game.LEVELS[0].spawns[0].x) < 16 &&
        Math.abs(s.world.players[1].x - Game.LEVELS[0].spawns[1].x) < 16;
    }, '失足后两人回共同检查点', 13000);
    assert.equal(fallen.world.players[0].x, Game.LEVELS[0].spawns[0].x, '队友也回到检查点');
  } finally {
    clearInterval(active);
    room.a.send({ type: 'input', left: false, right: false, jump: false, interact: false });
    room.b.send({ type: 'input', left: false, right: false, jump: false, interact: false });
  }
}

async function tapJumpPulseCheck(room) {
  const grounded = await room.a.waitSnapshot(function (s) { return s.world.players[0].grounded; }, '跳跃脉冲前落地');
  const startY = grounded.world.players[0].y;
  room.a.send({ type: 'input', left: false, right: false, jump: false, interact: false, jumpPressed: true });
  room.a.send({ type: 'input', left: false, right: false, jump: false, interact: false, jumpPressed: false });
  const jumped = await room.a.waitSnapshot(function (s) { return s.world.players[0].y < startY - 12; }, '短按跳跃跨过网络帧间隙');
  assert.ok(jumped.world.players[0].vy < 0 || jumped.world.players[0].y < startY - 12, '释放后仍消费已缓存的跳跃按下事件');
  room.a.send({ type: 'input', left: false, right: false, jump: false, interact: false });
}

function verifyCratePowerTracksPlate() {
  const world = Game.createWorld(2, 999);
  world.players[0].x = 430;
  world.players[0].y = 524;
  world.players[0].grounded = true;
  Game.stepWorld(world, [{}, {}], 1 / 60);
  assert.equal(world.flags.cratePower, true, '踩住圆盘可临时供电');
  world.players[0].x = 520;
  Game.stepWorld(world, [{}, {}], 1 / 60);
  assert.equal(world.flags.cratePower, false, '离开圆盘后立即断电');
  world.boxes[0].x = 421;
  Game.stepWorld(world, [{}, {}], 1 / 60);
  assert.equal(world.flags.cratePower, true, '石箱替代玩家持续压板');
  world.boxes[0].x = 350;
  Game.stepWorld(world, [{}, {}], 1 / 60);
  assert.equal(world.flags.cratePower, false, '石箱离开后恢复断电');
}

async function reconnectCheck(room) {
  const oldB = room.b;
  oldB.close();
  await room.a.waitSnapshot(function (s) { return s.phase === 'paused'; }, '断线暂停');
  const b = new Client(oldB.accountId);
  room.b = b;
  await waitOpen(b);
  b.send({ type: 'join', code: room.code, token: room.tokenB, accountId: b.accountId, name: '重连伙伴' });
  await b.waitFor(function (m) { return m.type === 'joined' && m.resumed; }, '同一玩家位重连');
  await Promise.all([
    room.a.waitSnapshot(function (s) { return s.phase === 'playing'; }, '房主恢复对局'),
    room.b.waitSnapshot(function (s) { return s.phase === 'playing'; }, '重连端恢复对局')
  ]);
}

async function rewardBranchChecks(room, expectedBase) {
  let settlement = room.a.latest.settlement;
  assert.ok(settlement && settlement.settled, '服务端结算完成');
  const firstA = room.a.latest.selfAward;
  const awardB = room.b.latest.selfAward;
  assert.equal(firstA.base, expectedBase, '房主基础奖励符合首通/重复配置');
  assert.equal(awardB.base, expectedBase, '伙伴基础奖励符合首通/重复配置');

  const previousA = room.a;
  previousA.close();
  await room.b.waitSnapshot(function (s) { return s.phase === 'paused'; }, '结算后刷新导致暂停');
  const reloadedA = new Client(previousA.accountId);
  room.a = reloadedA;
  await waitOpen(reloadedA);
  reloadedA.send({ type: 'join', code: room.code, token: room.tokenA, accountId: reloadedA.accountId, name: '刷新后房主' });
  await reloadedA.waitFor(function (m) { return m.type === 'joined' && m.resumed; }, '结算后刷新重连');
  const resumed = await reloadedA.waitSnapshot(function (s) {
    return s.phase === 'intermission' && s.settlement && s.settlement.id === settlement.id;
  }, '结算状态恢复');
  settlement = resumed.settlement;
  assert.equal(resumed.selfAward.base, expectedBase, '刷新后仍读取原结算');
  reloadedA.send({ type: 'wallet' });
  const balanceAfterReload = await reloadedA.waitFor(function (m) { return m.type === 'wallet'; }, '刷新后查询钱包');
  assert.equal(balanceAfterReload.wallet.coins, expectedBase, '结算后刷新没有重复发基础奖励');

  const awardA = reloadedA.latest.selfAward;
  assert.equal(awardA.base, expectedBase, '房主基础奖励符合首通/重复配置');
  assert.equal(awardB.base, expectedBase, '伙伴基础奖励符合首通/重复配置');

  const cursorA = reloadedA.history.length;
  reloadedA.send({ type: 'ad-claim', settlementId: settlement.id, status: 'completed' });
  const completed = await reloadedA.waitFor(function (m, i) { return i >= cursorA && m.type === 'ad-result' && m.status === 'completed'; }, '完成广告奖励');
  assert.equal(completed.amount, Game.ECONOMY.firstAdBonus, '完成广告只发配置奖励');
  const cursorDuplicate = reloadedA.history.length;
  reloadedA.send({ type: 'ad-claim', settlementId: settlement.id, status: 'completed' });
  await reloadedA.waitFor(function (m, i) { return i >= cursorDuplicate && m.type === 'ad-result' && m.status === 'duplicate'; }, '重复广告结算去重');
  const cursorWalletA = reloadedA.history.length;
  reloadedA.send({ type: 'wallet' });
  const walletA = await reloadedA.waitFor(function (m, i) { return i >= cursorWalletA && m.type === 'wallet'; }, '查询房主钱包');
  assert.equal(walletA.wallet.coins, expectedBase + Game.ECONOMY.firstAdBonus, '重复领取没有重复加币');

  const cursorCancel = room.b.history.length;
  room.b.send({ type: 'ad-claim', settlementId: settlement.id, status: 'cancelled' });
  await room.b.waitFor(function (m, i) { return i >= cursorCancel && m.type === 'ad-result' && m.status === 'cancelled'; }, '取消广告分支');
  const cursorFail = room.b.history.length;
  room.b.send({ type: 'ad-claim', settlementId: settlement.id, status: 'failed' });
  await room.b.waitFor(function (m, i) { return i >= cursorFail && m.type === 'ad-result' && m.status === 'failed'; }, '广告失败分支');
  room.b.send({ type: 'wallet' });
  const walletB = await room.b.waitFor(function (m) { return m.type === 'wallet'; }, '查询伙伴钱包');
  assert.equal(walletB.wallet.coins, expectedBase, '取消和失败保留基础奖励且不发额外币');
}

async function endRoom(room) {
  room.b.send({ type: 'leave' });
  await room.b.waitFor(function (m) { return m.type === 'left'; }, '伙伴退出');
  room.a.send({ type: 'leave' });
  await room.a.waitFor(function (m) { return m.type === 'left'; }, '房主退出');
  room.a.close();
  room.b.close();
}

async function run() {
  verifyCratePowerTracksPlate();
  const response = await fetch(BASE + '/health');
  assert.equal(response.status, 200, 'HTTP 健康检查');
  assert.equal((await response.json()).websocket, true, 'WebSocket 服务已启动');
  const exposedWallet = await fetch(BASE + '/data/dev-wallets.json');
  assert.equal(exposedWallet.status, 404, '开发钱包不再由静态文件服务公开');
  assert.ok(typeof WebSocket === 'function', '运行时内置 WebSocket 可用');

  if (process.env.ONLY_LEVEL3 === '1') {
    const soloRoom = await launchRoom(2, [newAccount('l3a'), newAccount('l3b')]);
    await startRoom(soloRoom, 2);
    await runAutomatedLevel(soloRoom, 2, 45000);
    console.log('单独关卡 3 通过');
    await endRoom(soloRoom);
    return;
  }

  const accountIds = [newAccount('a'), newAccount('b')];
  const first = await launchRoom(0, accountIds);
  const extra = new Client(newAccount('third'));
  await waitOpen(extra);
  extra.send({ type: 'join', code: first.code, accountId: extra.accountId });
  const full = await extra.waitFor(function (m) { return m.type === 'error' && m.message.includes('房间已满'); }, '满员拒绝第三人');
  assert.match(full.message, /房间已满/);
  extra.close();
  await startRoom(first, 0);
  await tapJumpPulseCheck(first);
  await deathAndResetCheck(first);
  await reconnectCheck(first);
  const result1 = await runAutomatedLevel(first, 0, 30000);
  await assertSynchronized(first, function (s) { return s.phase === 'intermission'; }, '通关双方看到共同宝箱结算');
  await rewardBranchChecks(first, Game.ECONOMY.firstClear);
  await endRoom(first);
  console.log('关卡 1：双客户端联机、满员、移动同步、失足检查点、重置、重连、双人出口、奖励/广告分支通过。');

  const repeat = await launchRoom(0, accountIds);
  await startRoom(repeat, 0);
  await runAutomatedLevel(repeat, 0, 30000);
  assert.equal(repeat.a.latest.selfAward.base, Game.ECONOMY.repeatClear, '重复通关奖励金额正确');
  await endRoom(repeat);
  console.log('重复通关：首通之后的重复奖励为 25 协作币，未复发首通奖励。');

  const level2 = await launchRoom(1, [newAccount('c'), newAccount('d')]);
  await startRoom(level2, 1);
  await runAutomatedLevel(level2, 1, 30000);
  assert.ok(level2.a.latest.world.flags.upperBridge && level2.a.latest.world.flags.lowerBridge, '两路符文均开通队友对应石桥');
  const level2Snapshots = level2.a.history.filter(function (m) { return m.type === 'snapshot' && m.world; });
  const lowerBridgeOnly = level2Snapshots.findIndex(function (m) { return m.world.flags.lowerBridge && !m.world.flags.upperBridge; });
  const bothBridges = level2Snapshots.findIndex(function (m) { return m.world.flags.lowerBridge && m.world.flags.upperBridge; });
  assert.ok(lowerBridgeOnly >= 0 && bothBridges > lowerBridgeOnly, '先开下桥，队友过桥后再开上桥');
  await endRoom(level2);
  console.log('关卡 2：先助队友过桥，再由队友接应；双路交换、汇合出口通过。');

  const level3 = await launchRoom(2, [newAccount('e'), newAccount('f')]);
  await startRoom(level3, 2);
  await runAutomatedLevel(level3, 2, 45000);
  assert.ok(level3.a.latest.world.flags.cratePower, '推箱成功给升降台供能');
  assert.ok(level3.a.latest.world.flags.topSwitch, '顶层开关开启终门');
  const plate = Game.LEVELS[2].plates[0];
  const handedOff = level3.a.history.some(function (m) {
    if (m.type !== 'snapshot' || !m.world || !m.world.flags.cratePower) return false;
    const box = m.world.boxes[0];
    const boxOnPlate = box && box.x < plate.x + plate.w && box.x + box.w > plate.x && box.y < plate.y + plate.h && box.y + box.h > plate.y;
    const playersOffPlate = m.world.players.every(function (p) {
      const feet = { x: p.x + 4, y: p.y + Game.PHYSICS.playerHeight - 5, w: Game.PHYSICS.playerWidth - 8, h: 7 };
      return !(feet.x < plate.x + plate.w && feet.x + feet.w > plate.x && feet.y < plate.y + plate.h && feet.y + feet.h > plate.y);
    });
    return boxOnPlate && playersOffPlate;
  });
  assert.ok(handedOff, '箱子接替踩板者后仍持续供电');
  await endRoom(level3);
  console.log('关卡 3：踩板送队友、箱子接替供电、升降台、终门与共同宝箱通过。');
  console.log('全部集成验证通过。');
}

module.exports = { controller };
if (require.main === module) run().catch(function (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});

