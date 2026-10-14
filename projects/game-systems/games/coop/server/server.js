'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const Game = require('../src/game-shared.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || '0.0.0.0';
const PLAYTEST_ALL_LEVELS_ENABLED = process.env.PLAYTEST_ALL_LEVELS === '1' || process.env.NODE_ENV !== 'production';
const ROOM_GRACE_MS = 30000;
const ROOM_EMPTY_MS = 60000;
const TICK_MS = 1000 / 60;
const BROADCAST_MS = 50;
const Contracts = require('./contracts.cjs');
const PRIVATE_DATA_DIR = process.env.CAMP_COOP_DATA_DIR || path.join(os.homedir(), '.adventure-camp-coop');
const WALLET_FILE = path.join(PRIVATE_DATA_DIR, 'dev-wallets.json');
const LEGACY_WALLET_FILE = path.join(ROOT, 'data', 'dev-wallets.json');
const rooms = new Map();
const clients = new Set();
let walletData = loadWallets();

function loadWallets() {
  try {
    fs.mkdirSync(PRIVATE_DATA_DIR, { recursive: true, mode: 0o700 });
    if (!process.env.CAMP_COOP_DATA_DIR && !fs.existsSync(WALLET_FILE) && fs.existsSync(LEGACY_WALLET_FILE)) {
      const legacy = fs.readFileSync(LEGACY_WALLET_FILE, 'utf8');
      JSON.parse(legacy);
      fs.writeFileSync(WALLET_FILE, legacy, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    }
    const data = fs.existsSync(WALLET_FILE)
      ? JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'))
      : { version: 1, accounts: Object.create(null) };
    if (!process.env.CAMP_COOP_DATA_DIR && fs.existsSync(LEGACY_WALLET_FILE)) fs.unlinkSync(LEGACY_WALLET_FILE);
    return data;
  } catch (_) {
    return { version: 1, accounts: Object.create(null) };
  }
}

function saveWallets() {
  fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true, mode: 0o700 });
  const temp = WALLET_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(walletData, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, WALLET_FILE);
}

function ensureAccount(accountId) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(accountId) || ['__proto__','constructor','prototype'].includes(accountId)) throw new Error('账户标识无效');
  if (!walletData.accounts[accountId]) {
    walletData.accounts[accountId] = {
      coins: 0, cleared: [], marks: {}, ownedSkins: ['default'], skin: 'default', ledger: []
    };
  }
  const wallet = walletData.accounts[accountId];
  if(wallet.campaignVersion!==Game.CAMPAIGN_VERSION){wallet.cleared=[];wallet.marks={};wallet.campaignVersion=Game.CAMPAIGN_VERSION;}
  wallet.cleared = Array.from(new Set((Array.isArray(wallet.cleared) ? wallet.cleared : []).map(Number).filter(function (level) { return Number.isInteger(level) && Game.LEVELS.some(l=>l.id===level); })));
  if (!wallet.marks || typeof wallet.marks !== 'object' || Array.isArray(wallet.marks)) wallet.marks = {};
  if (!Array.isArray(wallet.ownedSkins)) wallet.ownedSkins = ['default'];
  if (!Array.isArray(wallet.ledger)) wallet.ledger = [];
  return wallet;
}

function walletSnapshot(accountId) {
  const wallet = ensureAccount(accountId);
  return {
    coins: wallet.coins, cleared: wallet.cleared.slice(), marks: JSON.parse(JSON.stringify(wallet.marks)),
    ownedSkins: wallet.ownedSkins.slice(), skin: wallet.skin
  };
}

function unlockedLevelCount(accountId) {
  const completed = new Set((ensureAccount(accountId).cleared || []).map(Number));
  let count = 1;
  while (count < Game.LEVELS.length && completed.has(count)) count += 1;
  return count;
}

function requestedLevelIndex(accountId, rawValue, playtestAllLevels) {
  const value = Number(rawValue);
  const index = Number.isInteger(value) ? value : 0;
  const safe = Math.max(0, Math.min(Game.LEVELS.length - 1, index));
  if (!(PLAYTEST_ALL_LEVELS_ENABLED && playtestAllLevels) && !Game.isLevelUnlocked(safe, ensureAccount(accountId).cleared)) throw new Error('该关尚未解锁，请先完成前面的关卡');
  return safe;
}

function newId(size) { return crypto.randomBytes(size || 18).toString('base64url'); }

function cleanName(value, fallback) {
  const name = String(value || '').trim().slice(0, 18);
  return name || fallback;
}

function sendFrame(socket, opcode, body) {
  if (socket.destroyed) return;
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, data.length]);
  } else if (data.length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  socket.write(Buffer.concat([header, data]));
}

function sendJson(socket, value) {
  sendFrame(socket, 1, Buffer.from(JSON.stringify(value), 'utf8'));
}

function sendError(socket, message) {
  sendJson(socket, { type: 'error', message: String(message || '请求无效') });
}

function onSocketData(socket, chunk) {
  socket._buffer = Buffer.concat([socket._buffer || Buffer.alloc(0), chunk]);
  while (socket._buffer.length >= 2) {
    const first = socket._buffer[0];
    const second = socket._buffer[1];
    let length = second & 127;
    let offset = 2;
    if (length === 126) {
      if (socket._buffer.length < 4) return;
      length = socket._buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (socket._buffer.length < 10) return;
      const big = socket._buffer.readBigUInt64BE(2);
      if (big > 1048576n) { socket.destroy(); return; }
      length = Number(big);
      offset = 10;
    }
    const masked = !!(second & 128);
    const maskLength = masked ? 4 : 0;
    if (socket._buffer.length < offset + maskLength + length) return;
    let body = socket._buffer.subarray(offset + maskLength, offset + maskLength + length);
    if (masked) {
      body = Buffer.from(body);
      const mask = socket._buffer.subarray(offset, offset + 4);
      for (let i = 0; i < body.length; i += 1) body[i] ^= mask[i % 4];
    }
    socket._buffer = socket._buffer.subarray(offset + maskLength + length);
    const opcode = first & 15;
    if (opcode === 8) { socket.end(); return; }
    if (opcode === 9) { sendFrame(socket, 10, body); continue; }
    if (opcode !== 1) continue;
    try {
      handleMessage(socket, JSON.parse(body.toString('utf8')));
    } catch (error) {
      console.error('Bad client message:', error.message);
      sendError(socket, error && error.message ? error.message : '消息格式不正确');
    }
  }
}

function roomForSocket(socket) {
  const ref = socket.playerRef;
  if (!ref) return null;
  const room = rooms.get(ref.roomId);
  if (!room) return null;
  const slot = room.slots[ref.slot];
  if (!slot || slot.token !== ref.token || slot.socket !== socket) return null;
  return { room: room, slot: slot, index: ref.slot };
}

function publicPlayer(slot, index) {
  if (!slot) return { slot: index, joined: false, ready: false, connected: false, name: '等待伙伴' };
  return {
    slot: index, joined: true, ready: !!slot.ready, connected: !!slot.connected,
    name: slot.name, skin: ensureAccount(slot.accountId).skin
  };
}

function publicWorld(world) {
  if (!world) return null;
  const copy = JSON.parse(JSON.stringify(world));
  delete copy.checkpointState;
  return copy;
}

function snapshot(room, socket) {
  const ref = socket.playerRef;
  const ownSlot = ref && ref.roomId === room.id ? ref.slot : -1;
  const accountId = ownSlot >= 0 && room.slots[ownSlot] ? room.slots[ownSlot].accountId : null;
  const award = accountId && room.settlement
    ? room.settlement.players.find(function (item) { return item.accountId === accountId; })
    : null;
  return {
    type: 'snapshot',
    code: room.code,
    roomId: room.id,
    host: room.host === ownSlot,
    phase: room.phase,
    nextReady: room.nextReady,
    phaseBeforePause: room.phaseBeforePause,
    pauseReason: room.pauseReason,
    selectedLevel: room.levelIndex,
    contracts: {offer: contractOffer(room), votes: room.contractVotes, selected: room.contractSelected},
    playtestAllLevels: !!room.playtestAllLevels,
    players: room.slots.map(publicPlayer),
    world: publicWorld(room.world),
    settlement: room.settlement,
    selfAward: award ? {
      id: room.settlement.id, level: room.settlement.level,
      base: award.base, adBonus: award.adBonus, first: award.first, adClaimed: award.adClaimed,
      marks: JSON.parse(JSON.stringify(award.marks))
    } : null,
    wallet: accountId ? walletSnapshot(accountId) : null,
    adMode: 'DEV_SIMULATION'
  };
}

function broadcast(room, extra) {
  room.slots.forEach(function (slot) {
    if (!slot || !slot.socket || slot.socket.destroyed) return;
    const message = snapshot(room, slot.socket);
    if (extra) Object.assign(message, extra);
    sendJson(slot.socket, message);
  });
}

function sendJoined(socket, room, index, resumed) {
  const slot = room.slots[index];
  socket.playerRef = { roomId: room.id, slot: index, token: slot.token };
  slot.socket = socket;
  slot.connected = true;
  slot.offlineAt = null;
  slot.lastInput = { left: false, right: false, jump: false, interact: false, jumpPressed: false, interactPressed: false };
  clients.add(socket);
  room.sockets.add(socket);
  sendJson(socket, {
    type: 'joined', code: room.code, roomId: room.id, slot: index,
    token: slot.token, resumed: !!resumed
  });
  if (room.phase === 'paused' && room.slots.every(function (item) { return item && item.connected; })) {
    room.phase = room.phaseBeforePause || (room.world ? room.world.phase : 'lobby');
    room.phaseBeforePause = null;
    room.pauseReason = '';
    if (room.world && room.world.phase === 'playing') {
      room.world.players.forEach(function (player) {
        player.input = { left: false, right: false, jump: false, interact: false };
      });
      room.slots.forEach(function (item) {
        if (item) item.lastInput = { left: false, right: false, jump: false, interact: false, jumpPressed: false, interactPressed: false };
      });
      room.world.message = '队友已返回，继续探险';
    }
  }
  broadcast(room);
}

function contractOffer(room) {
  room.contractOffers ||= {};
  return room.contractOffers[room.levelIndex] ||= Contracts.offer(Game.LEVELS[room.levelIndex],()=>crypto.randomInt(1000000)/1000000);
}
function resetContracts(room) {
  room.contractVotes=[null,null];room.contractSelected=null;
  room.slots.forEach(s=>{if(s)s.ready=false;});
}
function createRoom(socket, message) {
  const accountId = String(message.accountId || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(accountId)) throw new Error('开发账户标识无效，请刷新页面重试');
  ensureAccount(accountId);
  const playtestAllLevels = PLAYTEST_ALL_LEVELS_ENABLED && message.playtestAllLevels === true;
  const levelIndex = requestedLevelIndex(accountId, message.level, playtestAllLevels);
  let code;
  do { code = String(100000 + crypto.randomInt(900000)); } while (rooms.has('code:' + code));
  const room = {
    id: newId(), code: code, host: 0, levelIndex: levelIndex, playtestAllLevels: playtestAllLevels,
    contractVotes:[null,null],contractSelected:null,contractOffers:{},
    runSeq: 0, phase: 'lobby', phaseBeforePause: null, pauseReason: '', world: null,
    settlement: null, nextReady: [false, false], slots: [null, null], sockets: new Set(), createdAt: Date.now(), emptyAt: null,
    broadcastAt: 0
  };
  room.slots[0] = {
    token: newId(24), accountId: accountId, name: cleanName(message.name, '玩家 1'),
    ready: false, connected: true, socket: socket, offlineAt: null,
    lastInput: { left: false, right: false, jump: false, interact: false, jumpPressed: false, interactPressed: false }
  };
  rooms.set(room.id, room);
  rooms.set('code:' + code, room);
  socket.playerRef = { roomId: room.id, slot: 0, token: room.slots[0].token };
  room.sockets.add(socket);
  sendJson(socket, { type: 'joined', code: code, roomId: room.id, slot: 0, token: room.slots[0].token, resumed: false });
  broadcast(room);
}

function joinRoom(socket, message) {
  const code = String(message.code || '').replace(/\s+/g, '');
  const room = rooms.get('code:' + code);
  if (!room || ['ended', 'closed'].includes(room.phase)) throw new Error('房间码无效或房间已结束');
  const accountId = String(message.accountId || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(accountId)) throw new Error('开发账户标识无效，请刷新页面重试');
  ensureAccount(accountId);
  const token = String(message.token || '');
  if (token) {
    const existingIndex = room.slots.findIndex(function (slot) { return slot && slot.token === token; });
    if (existingIndex >= 0) {
      const existing = room.slots[existingIndex];
      if (existing.accountId !== accountId) throw new Error('重连账户与原玩家不匹配');
      if (existing.socket && existing.socket !== socket && !existing.socket.destroyed) throw new Error('这个玩家位已经在线，请使用另一位玩家加入');
      return sendJoined(socket, room, existingIndex, true);
    }
  }
  if (room.phase === 'intermission') throw new Error('本局已结算，请房主回到大厅后重新创建房间');
  const freeIndex = room.slots.findIndex(function (slot) { return !slot; });
  if (freeIndex < 0) throw new Error('房间已满，两位玩家正在游戏');
  const slot = {
    token: newId(24), accountId: accountId, name: cleanName(message.name, '玩家 2'),
    ready: false, connected: true, socket: socket, offlineAt: null,
    lastInput: { left: false, right: false, jump: false, interact: false, jumpPressed: false, interactPressed: false }
  };
  room.slots[freeIndex] = slot;
  resetContracts(room);
  room.sockets.add(socket);
  if (room.phase === 'paused') {
    room.phaseBeforePause = room.phaseBeforePause || 'playing';
    if (room.world && room.world.phase === 'playing') {
      room.world.players.forEach(function (player) {
        player.input = { left: false, right: false, jump: false, interact: false };
      });
    }
    room.phase = 'lobby';
    room.world = null;
    room.settlement = null;
    room.slots.forEach(function (item) { if (item) item.ready = false; });
    room.phaseBeforePause = null;
    room.pauseReason = '';
  }
  sendJoined(socket, room, freeIndex, false);
}

function awardBase(room) {
  const world = room.world;
  if (!world || world.phase !== 'intermission' || room.settlement) return;
  const levelNumber = Game.LEVELS[world.levelIndex].id;
  const settlementId = room.id + '-' + levelNumber + '-' + world.run + '-' + newId(5);
  const perPlayer = [];
  room.slots.forEach(function (slot) {
    if (!slot) return;
    const wallet = ensureAccount(slot.accountId);
    const first = !wallet.cleared.includes(levelNumber);
    const amount = first ? Game.ECONOMY.firstClear : Game.ECONOMY.repeatClear;
    const ledgerId = settlementId + ':base:' + slot.accountId;
    let changed = false;
    if (!wallet.ledger.includes(ledgerId)) {
      wallet.coins += amount;
      wallet.ledger.push(ledgerId);
      changed = true;
    }
    if (!wallet.cleared.includes(levelNumber)) { wallet.cleared.push(levelNumber); changed = true; }
    const marks = wallet.marks[levelNumber] || (wallet.marks[levelNumber] = { cleared: false, safeArrival: false, keepsake: false, routes: {} });
    marks.contracts = marks.contracts || {};
    if(Contracts.achieved(room.contractSelected,world)&&!marks.contracts[room.contractSelected]){marks.contracts[room.contractSelected]=true;changed=true;}
    marks.routes = marks.routes || {};
    if (!marks.cleared) { marks.cleared = true; changed = true; }
    if (world.safeRun && !marks.safeArrival) { marks.safeArrival = true; changed = true; }
    if (levelNumber === 44) {
      if (world.flags.routeLocked && !marks.routes.upper) { marks.routes.upper = true; changed = true; }
      if (world.flags.c1Stable && world.flags.socketV && !marks.routes.energy) { marks.routes.energy = true; changed = true; }
      if (marks.routes.upper && marks.routes.energy && !marks.keepsake) { marks.keepsake = true; changed = true; }
    } else if (world.memorialFound && !marks.keepsake) {
      marks.keepsake = true; changed = true;
    }
    if (Game.nextLevelIndex(world.levelIndex) == null && !marks.finaleBadge) {
      marks.finaleBadge = true; changed = true;
    }
    if (changed) saveWallets();
    perPlayer.push({ accountId: slot.accountId, first: first, base: amount,
      adBonus: first ? Game.ECONOMY.firstAdBonus : Game.ECONOMY.repeatAdBonus,
      adClaimed: false, marks: JSON.parse(JSON.stringify(marks)) });
  });
  room.settlement = { id: settlementId, level: levelNumber, players: perPlayer, settled: true, contract:room.contractSelected,contractCompleted:Contracts.achieved(room.contractSelected,world),adMode: 'DEV_SIMULATION' };
  world.settlementId = settlementId;
  room.phase = 'intermission';
}

function tryClaimAd(room, slot, index, message) {
  if (room.phase !== 'intermission' || !room.settlement || message.settlementId !== room.settlement.id) {
    sendError(slot.socket, '奖励已过期或本局尚未结算');
    return;
  }
  const playerResult = room.settlement.players.find(function (item) { return item.accountId === slot.accountId; });
  if (!playerResult || playerResult.adClaimed) {
    sendJson(slot.socket, { type: 'ad-result', status: 'duplicate', mode: 'DEV_SIMULATION' });
    return;
  }
  if (message.status !== 'completed') {
    sendJson(slot.socket, { type: 'ad-result', status: message.status === 'cancelled' ? 'cancelled' : 'failed', mode: 'DEV_SIMULATION' });
    return;
  }
  const wallet = ensureAccount(slot.accountId);
  const ledgerId = room.settlement.id + ':ad:' + slot.accountId;
  if (wallet.ledger.includes(ledgerId)) {
    playerResult.adClaimed = true;
    sendJson(slot.socket, { type: 'ad-result', status: 'duplicate', mode: 'DEV_SIMULATION' });
    return;
  }
  wallet.coins += playerResult.adBonus;
  wallet.ledger.push(ledgerId);
  playerResult.adClaimed = true;
  saveWallets();
  sendJson(slot.socket, { type: 'ad-result', status: 'completed', mode: 'DEV_SIMULATION', amount: playerResult.adBonus, wallet: walletSnapshot(slot.accountId) });
  broadcast(room);
}

function buyCosmetic(slot, socket) {
  const wallet = ensureAccount(slot.accountId);
  if (wallet.ownedSkins.includes('ember-mark')) {
    sendJson(socket, { type: 'shop-result', ok: false, reason: '已拥有「余烬围巾」', wallet: walletSnapshot(slot.accountId) });
    return;
  }
  if (wallet.coins < Game.ECONOMY.scarfPrice) {
    sendJson(socket, { type: 'shop-result', ok: false, reason: '协作币不足', wallet: walletSnapshot(slot.accountId) });
    return;
  }
  const purchaseId = 'shop:' + slot.accountId + ':ember-mark';
  if (!wallet.ledger.includes(purchaseId)) {
    wallet.coins -= Game.ECONOMY.scarfPrice;
    wallet.ledger.push(purchaseId);
    wallet.ownedSkins.push('ember-mark');
  }
  wallet.skin = 'ember-mark';
  saveWallets();
  sendJson(socket, { type: 'shop-result', ok: true, wallet: walletSnapshot(slot.accountId) });
  const room = roomForSocket(socket);
  if (room) broadcast(room.room);
}

function clearInput(slot) {
  slot.lastInput = { left: false, right: false, jump: false, interact: false, jumpPressed: false, interactPressed: false };
}

function handleMessage(socket, message) {
  if (!message || typeof message.type !== 'string') return sendError(socket, '缺少消息类型');
  if (message.type === 'create') return createRoom(socket, message);
  if (message.type === 'join') {
    const requestedCode = String(message.code || '').replace(/\s+/g, '');
    const current = roomForSocket(socket);
    if (current) {
      if (current.room.code !== requestedCode) return sendError(socket, '此页面已加入其他房间');
      return sendJoined(socket, current.room, current.index, true);
    }
    return joinRoom(socket, message);
  }
  const found = roomForSocket(socket);
  if (!found) {
    if (message.type === 'wallet') {
      const id = String(message.accountId || '');
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return sendError(socket, '账户标识无效');
      sendJson(socket, { type: 'wallet', wallet: walletSnapshot(id) });
      return;
    }
    if (message.type === 'buy') {
      const id = String(message.accountId || '');
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return sendError(socket, '账户标识无效');
      return buyCosmetic({ accountId: id }, socket);
    }
    return sendError(socket, '你已离开房间，请重新创建或加入');
  }
  const room = found.room;
  const slot = found.slot;
  const index = found.index;
  room.lastActive = Date.now();
  if (message.type === 'contract') {
    if(room.phase!=='lobby')return;
    if(message.value!==null&&!contractOffer(room).some(c=>c.id===message.value))return;
    room.contractVotes[index]=message.value;
    room.slots.forEach(s=>{if(s)s.ready=false;});
    broadcast(room);
  } else if (message.type === 'ready') {
    if (room.phase !== 'lobby') return;
    slot.ready = !!message.value;
    broadcast(room);
  } else if (message.type === 'level') {
    if (room.phase !== 'lobby' || index !== room.host) return;
    try { room.levelIndex = requestedLevelIndex(slot.accountId, message.value, room.playtestAllLevels); }
    catch (error) { return sendError(socket, error.message); }
    resetContracts(room);
    broadcast(room);
  } else if (message.type === 'start') {
    if (index !== room.host || room.phase !== 'lobby') return;
    if (!room.slots.every(function (item) { return item && item.connected && item.ready; })) {
      sendError(socket, '两位玩家都准备好后，房主才能开始');
      return;
    }
    room.runSeq += 1;
    if(room.contractVotes[0]!==room.contractVotes[1])return sendError(socket,'请先商量好同一份契约，或双方选择普通探索');
    room.contractSelected=room.contractVotes[0];
    room.world = Game.createWorld(room.levelIndex, room.runSeq);
    room.settlement = null;
    room.nextReady = [false, false];
    room.phase = 'playing';
    broadcast(room);
  } else if (message.type === 'input') {
    if (!room.world || room.phase !== 'playing') return;
    slot.lastInput = {
      left: !!message.left, right: !!message.right, jump: !!message.jump, interact: !!message.interact,
      jumpPressed: !!slot.lastInput.jumpPressed || !!message.jumpPressed,
      interactPressed: !!slot.lastInput.interactPressed || !!message.interactPressed
    };
  } else if (message.type === 'reset') {
    if (!room.world || !['playing', 'intermission'].includes(room.phase)) return;
    room.runSeq += 1;
    room.world = Game.createWorld(room.levelIndex, room.runSeq, false);
    room.settlement = null;
    room.nextReady = [false, false];
    room.phase = 'playing';
    room.slots.forEach(function (item) { if (item) clearInput(item); });
    broadcast(room, { notice: '本关已重置，两人回到共同检查点' });
  } else if (message.type === 'ad-claim') {
    tryClaimAd(room, slot, index, message);
  } else if (message.type === 'next-level') {
    if (room.phase !== 'intermission' || !room.settlement || Game.nextLevelIndex(room.levelIndex) == null) return;
    if (index !== room.host) { sendError(socket, '由房主点击进入下一关'); return; }
    if (message.settlementId !== room.settlement.id) return;
    if (!room.slots.every(function (item) { return item && item.connected; })) { sendError(socket, '等待队友重新连接后继续'); return; }
    room.levelIndex = Game.nextLevelIndex(room.levelIndex);
    room.runSeq += 1;
    resetContracts(room);
    room.contractSelected = 'none';
    room.world = Game.createWorld(room.levelIndex, room.runSeq);
    room.settlement = null;
    room.nextReady = [false, false];
    room.phase = 'playing';
    room.slots.forEach(function (item) { item.ready = true; clearInput(item); });
    broadcast(room, { notice: '房主已带队进入下一关' });
  } else if (message.type === 'buy') {
    buyCosmetic(slot, socket);
  } else if (message.type === 'wallet') {
    sendJson(socket, { type: 'wallet', wallet: walletSnapshot(slot.accountId) });
  } else if (message.type === 'leave') {
    leaveRoom(room, slot, index, socket);
  }
}

function leaveRoom(room, slot, index, socket) {
  clearInput(slot);
  slot.connected = false;
  slot.offlineAt = Date.now();
  slot.socket = null;
  socket.playerRef = null;
  room.sockets.delete(socket);
  if (room.phase === 'playing') {
    room.phaseBeforePause = 'playing';
    room.phase = 'paused';
    room.pauseReason = '一位玩家回到大厅，本局已暂停';
  }
  if (room.slots.every(function (item) { return !item || !item.connected; })) room.emptyAt = Date.now();
  broadcast(room);
  sendJson(socket, { type: 'left' });
}

function closeSocket(socket) {
  clients.delete(socket);
  const found = roomForSocket(socket);
  if (!found) return;
  const room = found.room;
  const slot = found.slot;
  clearInput(slot);
  slot.connected = false;
  slot.socket = null;
  slot.offlineAt = Date.now();
  socket.playerRef = null;
  room.sockets.delete(socket);
  if (room.phase !== 'paused') {
    room.phaseBeforePause = room.phase;
    room.phase = 'paused';
    room.pauseReason = '队友连接中断，等待重连（最多 30 秒）';
  }
  if (room.slots.every(function (item) { return !item || !item.connected; })) room.emptyAt = Date.now();
  broadcast(room);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function serveFile(request, response) {
  const requestUrl = new URL(request.url, 'http://localhost');
  if (requestUrl.pathname === '/api/config') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    response.end(JSON.stringify({ playtestAllLevels: PLAYTEST_ALL_LEVELS_ENABLED }));
    return;
  }
  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, rooms: Math.floor(rooms.size / 2), websocket: true }));
    return;
  }
  if (/^\/data(?:\/|$)/i.test(requestUrl.pathname)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(requestUrl.pathname); }
  catch (_) { response.writeHead(400); response.end('Bad path'); return; }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(ROOT, '.' + pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  fs.readFile(filePath, function (error, content) {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); response.end(error.code === 'ENOENT' ? 'Not found' : 'Read error'); return; }
    response.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache', 'x-content-type-options': 'nosniff'
    });
    response.end(content);
  });
}

module.exports = function attachCoop(server) {
server.on('upgrade', function (request, socket) {
  if(['/liars-ws','/chess-ws'].includes(new URL(request.url,'http://local').pathname))return;
  if (request.url !== '/ws' || !request.headers['sec-websocket-key']) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket._buffer = Buffer.alloc(0);
  socket.on('data', function (chunk) { onSocketData(socket, chunk); });
  socket.on('error', function () {});
  socket.on('close', function () { closeSocket(socket); });
  socket.on('end', function () { closeSocket(socket); });
});

let lastBroadcast = 0;
let previousTick = Date.now();
setInterval(function () {
  const now = Date.now();
  const dt = Math.max(0.001, Math.min(0.05, (now - previousTick) / 1000));
  previousTick = now;
  for (const room of new Set(rooms.values())) {
    if (room.phase === 'playing' && room.world) {
      const inputs = room.slots.map(function (slot) { return slot ? Object.assign({}, slot.lastInput) : {}; });
      const before = room.world.phase;
      Game.stepWorld(room.world, inputs, TICK_MS / 1000);
      Contracts.track(room.world,Game);
      room.slots.forEach(function (slot) {
        if (!slot || !slot.lastInput) return;
        slot.lastInput.jumpPressed = false;
        slot.lastInput.interactPressed = false;
      });
      if (before === 'playing' && room.world.phase === 'intermission') awardBase(room);
    }
    if (room.phase === 'paused') {
      const offlineExpired = room.slots.some(function (slot) { return slot && !slot.connected && slot.offlineAt && now - slot.offlineAt > ROOM_GRACE_MS; });
      if (offlineExpired) {
        room.phase = 'ended';
        room.world = null;
        broadcast(room, { notice: '重连时限已结束，本房间安全关闭' });
        room.slots.forEach(function (slot) {
          if (!slot || !slot.socket) return;
          slot.socket.playerRef = null;
          slot.socket = null;
          slot.connected = false;
        });
        room.emptyAt = now;
      }
    }
    const noConnected = room.slots.every(function (slot) { return !slot || !slot.connected; });
    if ((noConnected || room.phase === 'ended') && room.emptyAt && now - room.emptyAt > ROOM_EMPTY_MS) {
      rooms.delete(room.id);
      rooms.delete('code:' + room.code);
      continue;
    }
    if (room.phase !== 'paused' && room.phase !== 'ended' && now - (room.broadcastAt || 0) >= BROADCAST_MS) {
      room.broadcastAt = now;
      broadcast(room);
    }
  }
}, TICK_MS);

};
