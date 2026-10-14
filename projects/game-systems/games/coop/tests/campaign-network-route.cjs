'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { controller: familyController, debugRoute } = require('./campaign-family-routing.cjs');
const { controllers: chapterOneControllers } = require('./chapter-one-routing.cjs');

const ROOT = path.resolve(__dirname, '../../..');
const LEVEL_NUMBER = Number(process.argv[2] || 21);
const LEVEL_INDEX = LEVEL_NUMBER - 1;
// Levels 4–10 have dedicated first-chapter input routes; using the family
// controller for level 4 silently left the network harness without a route.
const controller = LEVEL_NUMBER <= 3 ? chapterOneControllers[LEVEL_INDEX] : familyController;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function availablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function waitForServer(child, base) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error('游戏服务提前退出，exit=' + child.exitCode);
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('测试用游戏服务启动超时');
}

class Client {
  constructor(url, accountId) {
    this.accountId = accountId;
    this.history = [];
    this.latest = null;
    this.ws = new WebSocket(url);
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      this.history.push(message);
      if (message.type === 'snapshot') this.latest = message;
    });
  }
  send(message) { this.ws.send(JSON.stringify(message)); }
  async waitFor(predicate, label, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const found = this.history.find(predicate);
      if (found) return found;
      await sleep(20);
    }
    throw new Error('等待超时：' + label);
  }
  async waitSnapshot(predicate, label, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.latest && predicate(this.latest)) return this.latest;
      await sleep(20);
    }
    const world = this.latest && this.latest.world;
  throw new Error('等待快照超时：' + label + (world ? '；' + JSON.stringify({
      phase: this.latest.phase,
      roomIndex: world.roomIndex,
      players: world.players.map(p => [Math.round(p.x), Math.round(p.y)]),
      flags: world.flags,
      boxes: world.boxes.map(box => [box.id, Math.round(box.x), Math.round(box.y)]),
      lifts: world.lifts.map(l => [Math.round(l.y), Math.round(l.target)])
    }) : ''));
  }
  close() { try { this.ws.close(); } catch (_) {} }
}

async function main() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-level21-network-'));
  const walletDir = path.join(tempHome, '.adventure-camp-coop');
  fs.mkdirSync(walletDir, { recursive: true });
  const accountIds = process.env.ROUTE_IDENTITY_SWAP === '1'
    ? ['campaign_net_b', 'campaign_net_a']
    : ['campaign_net_a', 'campaign_net_b'];
  const accounts = Object.create(null);
  accountIds.forEach(id => {
    accounts[id] = { coins: 0, cleared: Array.from({ length: 50 }, (_, i) => i + 1), ownedSkins: ['default'], skin: 'default', ledger: [] };
  });
  fs.writeFileSync(path.join(walletDir, 'dev-wallets.json'), JSON.stringify({ version: 1, accounts }));

  const port = await availablePort();
  const base = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, USERPROFILE: tempHome, HOME: tempHome, HOST: '127.0.0.1', PORT: String(port), CAMP_COOP_DATA_DIR: walletDir },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverOutput = '';
  child.stdout.on('data', data => { serverOutput += data.toString(); });
  child.stderr.on('data', data => { serverOutput += data.toString(); });
  const clients = [];
  let interval = null;
  let routePoll = 0;
  try {
    await waitForServer(child, base);
    const a = new Client(base.replace(/^http/, 'ws') + '/ws', accountIds[0]);
    clients.push(a);
    await a.opened;
    a.send({ type: 'create', accountId: a.accountId, name: '测试房主', level: LEVEL_INDEX });
    const joined = await a.waitFor(message => message.type === 'joined', '创建第 ' + LEVEL_NUMBER + ' 关测试房');
    const b = new Client(base.replace(/^http/, 'ws') + '/ws', accountIds[1]);
    clients.push(b);
    await b.opened;
    b.send({ type: 'join', code: joined.code, accountId: b.accountId, name: '测试伙伴' });
    await b.waitFor(message => message.type === 'joined', '另一客户端加入');
    await Promise.all([
      a.waitSnapshot(state => state.phase === 'lobby' && state.players[1].joined, '房主看到伙伴'),
      b.waitSnapshot(state => state.phase === 'lobby' && state.players[0].joined, '伙伴看到房主')
    ]);
    a.send({ type: 'ready', value: true });
    b.send({ type: 'ready', value: true });
    await Promise.all([
      a.waitSnapshot(state => state.players.every(player => player.ready), '双方准备'),
      b.waitSnapshot(state => state.players.every(player => player.ready), '双方准备同步')
    ]);
    a.send({ type: 'start' });
    await Promise.all([
      a.waitSnapshot(state => state.phase === 'playing', '开始第 ' + LEVEL_NUMBER + ' 关'),
      b.waitSnapshot(state => state.phase === 'playing', '第二端收到开始状态')
    ]);

    interval = setInterval(() => {
      const state = a.latest;
      if (!state || state.phase !== 'playing' || !state.world) return;
      const inputs = [controller(state.world, 0, state.world.tick), controller(state.world, 1, state.world.tick)];
      if (process.env.ROUTE_TRACE && (process.env.ROUTE_TRACE === 'all' || routePoll++ % 20 === 0)) console.log('network route', LEVEL_NUMBER, state.world.tick,
        state.world.players.map(player => [Math.round(player.x), Math.round(player.y), player.grounded]),
        state.world.flags, inputs,
        LEVEL_NUMBER === 50 ? debugRoute(state.world) : undefined,
        LEVEL_NUMBER === 50 ? { lifts: state.world.lifts, boxes: state.world.boxes, plates: state.world.plates, transits: state.world.transits } : undefined);
      a.send({ type: 'input', ...inputs[0] });
      b.send({ type: 'input', ...inputs[1] });
    }, 25);
    const result = await a.waitSnapshot(state => state.phase === 'intermission', '双客户端完成第 ' + LEVEL_NUMBER + ' 关', Number(process.env.ROUTE_TIMEOUT) || 60000);
    const peerResult = await b.waitSnapshot(state => state.phase === 'intermission', '第二端收到共同结算', 10000);
    assert.equal(result.world.levelIndex, LEVEL_INDEX);
    assert.equal(peerResult.world.levelIndex, LEVEL_INDEX);
    assert.deepEqual(peerResult.world.flags, result.world.flags, '两端机关状态一致');
    assert.deepEqual(peerResult.world.lifts, result.world.lifts, '两端升降台状态一致');
    assert.deepEqual(peerResult.world.players.map(p => [Math.round(p.x), Math.round(p.y)]),
      result.world.players.map(p => [Math.round(p.x), Math.round(p.y)]), '两端角色位置一致');
    const Game=require('../src/game-shared.js');
    const level=Game.LEVELS[LEVEL_INDEX],stage=Game.stageFor(result.world);
    assert.equal(result.world.roomIndex||0,(level.rooms?.length||1)-1);
    for(const key of stage.exitRequires||[])assert.equal(result.world.flags[key],true,'earned '+key);
    assert.equal(result.world.safeRun,true,'normal inputs complete without deaths');
    assert.deepEqual(peerResult.world.boxes,result.world.boxes);
    assert.equal(peerResult.selfAward.id,result.selfAward.id);
    if(LEVEL_NUMBER<50){
      clearInterval(interval);interval=null;
      a.send({type:'next-level',settlementId:result.selfAward.id});
      await Promise.all([a.waitSnapshot(s=>s.phase==='playing'&&s.world.levelIndex===LEVEL_INDEX+1,'host next'),
        b.waitSnapshot(s=>s.phase==='playing'&&s.world.levelIndex===LEVEL_INDEX+1,'guest next without ready')]);
    }else assert.equal(result.world.finale,true);
    console.log('真实双 WebSocket 客户端通过第 ' + LEVEL_NUMBER + ' 关：加入房间、分别输入、权威机关状态、双端结算同步。' +
      (process.env.ROUTE_IDENTITY_SWAP === '1' ? '（账户身份与房主/访客槽位互换）' : ''));
  } finally {
    if (interval) clearInterval(interval);
    clients.forEach(client => client.close());
    child.kill();
    await new Promise(resolve => {
      if (child.exitCode != null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1500).unref();
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
