(function () {
  'use strict';
  const Game = window.RushGame;
  const $ = function (selector) { return document.querySelector(selector); };
  const $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };
  const canvas = $('#board');
  const ctx = canvas.getContext('2d', { alpha: false });
  const H = Game.VIEW.height;
  // Match the screen's aspect ratio without stretching the authored map or physics.
  function resizeBoard() {
    const rect = $('#stage').getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const width = Math.max(1, Math.round(H * rect.width / rect.height));
    if (canvas.width !== width || canvas.height !== H) {
      canvas.width = width; canvas.height = H;
      ctx.imageSmoothingEnabled = false;
    }
  }
  new ResizeObserver(resizeBoard).observe($('#stage'));
  const compactLandscape = window.matchMedia('(orientation: landscape) and (max-height: 520px)');
  const el = {
    home: $('#home'), lobby: $('#lobby'), game: $('#game'), result: $('#result'),
    adModal: $('#adModal'), coins: $('#coinCount'), code: $('#inviteCode'),
    start: $('#startButton'), ready: $('#readyButton'), roomLevel: $('#roomLevel'),
    pause: $('#pauseBanner'), pauseText: $('#pauseText'), stageHint: $('#stageHint'),
    toast: $('#toast'), globalToast: $('#toastGlobal'), adOutcome: $('#adOutcome')
  };
  function setCornerMenu(open){
    $('#cornerPanel').hidden=!open;
    $('#cornerMenu').setAttribute('aria-expanded',String(open));
    if(open){window.RushGuide?.close();$('#gameHelp').classList.add('hidden');clearControls();$('#helpButton').focus({preventScroll:true});}
    else if(page==='game'){window.focus();canvas.focus({preventScroll:true});}
  }
  $('#cornerMenu').onclick=()=>setCornerMenu($('#cornerPanel').hidden);
  $('#cornerPanel').append(el.stageHint);
  $('#campMenuButton').hidden=parent===window;
  $('#campMenuButton').onclick=()=>{setCornerMenu(false);parent.postMessage({source:'camp-game',mode:'coop',type:'menu'},location.origin);};
  ['helpButton','resetButton','leaveGame'].forEach(id=>$('#'+id).addEventListener('click',()=>setCornerMenu(false)));
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&page==='game'){e.preventDefault();if(!$('#gameHelp').classList.contains('hidden'))$('#closeHelp').click();else setCornerMenu($('#cornerPanel').hidden);}});

  const androidPackage = navigator.userAgent.includes('AdventureCampAndroid/');
  const accountStore = androidPackage ? localStorage : sessionStorage;
  let accountId = accountStore.getItem('zcyg_dev_account') || (androidPackage ? sessionStorage.getItem('zcyg_dev_account') : null);
  if (!accountId) {
    accountId = 'tab_' + (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36));
  }
  accountStore.setItem('zcyg_dev_account', accountId);
  let savedRoom = null;
  try { savedRoom = JSON.parse(sessionStorage.getItem('zcyg_room') || 'null'); } catch (_) {}
  let socket = null;
  let reconnectTimer = 0;
  let joinRetryTimer = 0;
  let joinTimeoutTimer = 0;
  let joinPending = false;
  let pendingJoinMessage = null;
  let joinRequestSent = false;
  let rejoinCount = 0;
  let selectedLevel = 0;
  let selectedMode = 'normal';
  localStorage.removeItem('zcyg_solo_v1');
  if(localStorage.getItem('zcyg_campaign_version')!==Game.CAMPAIGN_VERSION){sessionStorage.removeItem('zcyg_room');localStorage.removeItem('camp.phone-host.wallets');localStorage.setItem('zcyg_campaign_version',Game.CAMPAIGN_VERSION);savedRoom=null;}
  let playtestAvailable = false;
  let playtestAllLevels = false;
  let ownSlot = -1;
  let walletState = { coins: 0, cleared: [], marks: {}, ownedSkins: ['default'], skin: 'default' };
  let connectionWanted = true;
  let state = null;
  let page = 'home';
  let controls = { left: false, right: false, jump: false, interact: false };
  const pressedKeys = new Set();
  let touchPointers = new Map();
  let lastInputSend = 0;
  let lastToastText = '';
  let toastTimer = 0;
  let globalToastTimer = 0;
  let lastPhase = '';
  let assetsReady = false;
  let audioContext = null;
  let lastSelfAwardId = '';
  let soloMode = false;
  let soloSession = null;
  let networkWallet = walletState;
  let previousFrame = 0;
  let soloAccumulator = 0;
  let soloHudTicks = 0;
  let joystickPointer = null;
  let joystickDirection = '';

  window.RushArt.ready.then(function () { assetsReady = true; });

  function wsUrl() {
    if(window.PhoneLan)return PhoneLan.url;
    const custom=localStorage.getItem('adventure-camp.coop.ws-url');
    if (custom) return custom;
    if (androidPackage) return '';
    // A file:// page has no host; use the local development server by default.
    if (!location.host) return 'ws://127.0.0.1:4174/ws';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws';
  }
  function send(message) {
    if (soloMode) {
      if (message.type === 'leave') { leaveSolo(); return; }
      if (message.type === 'reset') { clearControls(); soloSession?.reset(); refreshSolo(); return; }
      if (message.type === 'next-level') { clearControls(); if (soloSession?.next()) refreshSolo(); return; }
      return;
    }
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    else showGlobal('连接中，请稍等片刻。');
  }
  function unlockAudio() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audioContext) audioContext = new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(function () {});
    } catch (_) {}
  }
  window.addEventListener('pointerdown', unlockAudio, { capture: true, once: true });
  window.addEventListener('keydown', unlockAudio, { capture: true, once: true });
  function playSfx(kind) {
    if(window.campMuted)return;
    unlockAudio();
    if (!audioContext) return;
    const notes = { plate: [390], switch: [560, 790], lift: [250, 345], fall: [175], clear: [520, 660, 790] }[kind] || [];
    const now = audioContext.currentTime;
    notes.forEach(function (frequency, index) {
      const start = now + index * .075;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.018, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .105);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start); oscillator.stop(start + .11);
    });
  }
  function sendPendingJoin() {
    if (!joinPending || !pendingJoinMessage || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(pendingJoinMessage));
    joinRequestSent = true;
  }
  function saveRoom(credentials) {
    savedRoom = credentials;
    if (credentials) sessionStorage.setItem('zcyg_room', JSON.stringify(credentials));
    else sessionStorage.removeItem('zcyg_room');
  }
  function connect() {
    if (!connectionWanted || (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))) return;
    if (!wsUrl()) { setNetwork('请设置联机服务器', false); return; }
    socket = new WebSocket(wsUrl());
    const activeSocket=socket;
    socket.addEventListener('open', function () {
      if(socket!==activeSocket)return;
      updateLanInfo();
      setNetwork('已连接', true);
      send({ type: 'wallet', accountId: accountId });
      rejoinCount = 0;
      if (joinPending && pendingJoinMessage) {
        sendPendingJoin();
      } else if (savedRoom && savedRoom.code && savedRoom.token) {
        rejoinCount += 1;
        send({ type: 'join', code: savedRoom.code, token: savedRoom.token, accountId: accountId, name: '探险者' });
      }
    });
    socket.addEventListener('message', function (event) {
      if(socket!==activeSocket)return;
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      handleMessage(message);
    });
    socket.addEventListener('close', function () {
      if(socket!==activeSocket)return;
      clearControls();
      if (joinPending) joinRequestSent = false;
      setNetwork('重新连接…', false);
      if (savedRoom && connectionWanted) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 700);
      } else if (connectionWanted) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 1400);
      }
    });
    socket.addEventListener('error', function () {
      setNetwork('连接异常', false);
    });
  }

  function setNetwork(text, online) {
    $('#networkStatus').textContent = text;
    $('#lobbyNetwork').textContent = text;
    const dots = $$('.network-pill .status-dot,.connection-tag .status-dot');
    dots.forEach(function (dot) {
      dot.style.background = online ? '#83c3a0' : '#db966d';
      dot.style.boxShadow = online ? '0 0 10px rgba(131,195,160,.48)' : '0 0 9px rgba(219,150,109,.35)';
    });
  }

  function handleMessage(message) {
    if (soloMode) return;
    if (message.wallet) networkWallet = message.wallet;
    if (message.type === 'error') {
      if (joinPending) {
        joinPending = false;
        pendingJoinMessage = null;
        joinRequestSent = false;
        clearTimeout(joinTimeoutTimer);
        $('#joinRoom').disabled = false;
      }
      if (savedRoom && String(message.message || '').includes('房间码无效或房间已结束')) {
        clearTimeout(joinRetryTimer);
        saveRoom(null);
        ownSlot = -1;
        state = null;
        lastPhase = '';
        showPage('home');
        showGlobal('上次房间已结束，请创建新房间或重新输入房间码。');
        return;
      }
      showGlobal(message.message || '请求没有完成。');
      if (String(message.message || '').includes('玩家位已经在线') && savedRoom) {
        clearTimeout(joinRetryTimer);
        joinRetryTimer = setTimeout(function () {
          if (socket && socket.readyState === WebSocket.OPEN && savedRoom) send({ type: 'join', code: savedRoom.code, token: savedRoom.token, accountId: accountId, name: '探险者' });
        }, 650);
      }
      return;
    }
    if (message.type === 'joined') {
      joinPending = false;
      pendingJoinMessage = null;
      joinRequestSent = false;
      clearTimeout(joinTimeoutTimer);
      $('#joinRoom').disabled = false;
      ownSlot = message.slot;
      saveRoom({ code: message.code, token: message.token });
      selectedLevel = Math.max(0, Math.min(Game.LEVELS.length - 1, state ? state.selectedLevel : selectedLevel));
      showGlobal(message.resumed ? '已回到原来的同行位置' : '已加入好友房');
      return;
    }
    if (message.type === 'left') {
      if(window.PhoneLan){PhoneLan.stop();resetPhoneConnection();return;}
      ownSlot = -1;
      saveRoom(null);
      state = null;
      lastPhase = '';
      showPage('home');
      send({ type: 'wallet', accountId: accountId });
      return;
    }
    if (message.type === 'wallet') {
      updateWallet(message.wallet);
      return;
    }
    if (message.type === 'shop-result') {
      updateWallet(message.wallet);
      $('#buyCosmetic').classList.toggle('owned', !!(message.wallet && message.wallet.ownedSkins.includes('ember-mark')));
      $('#buyCosmetic').innerHTML = message.wallet && message.wallet.ownedSkins.includes('ember-mark') ? '已拥有 <span>已装备</span>' : '45 ✦ <span>购买</span>';
      showGlobal(message.ok ? '「余烬围巾」已购买并装备' : message.reason);
      return;
    }
    if (message.type === 'ad-result') {
      if (message.wallet) updateWallet(message.wallet);
      const text = message.status === 'completed' ? '模拟看完：额外冒险币已入账。'
        : message.status === 'cancelled' ? '模拟取消：基础奖励保留，没有扣币。'
          : message.status === 'duplicate' ? '本局额外奖励已经领取过。'
            : '模拟加载失败：基础奖励保留，没有扣币。';
      el.adOutcome.textContent = text + '（开发模拟，不是实际广告）';
      el.adOutcome.classList.remove('hidden');
      $('#adModal').classList.add('hidden');
      if (state && message.status !== 'duplicate') send({ type: 'wallet' });
      return;
    }
    if (message.type === 'snapshot') {
      acceptSnapshot(message);
    }
  }

  function updateWallet(wallet) {
    if (!wallet) return;
    walletState = wallet;
    el.coins.textContent = String(wallet.coins || 0);
    const hasSkin = (wallet.ownedSkins || []).includes('ember-mark');
    $('#buyCosmetic').classList.toggle('owned', hasSkin);
    $('#buyCosmetic').innerHTML = hasSkin ? '已拥有 <span>已装备</span>' : '45 ✦ <span>购买</span>';
    renderCampaignLevels();
  }

  function unlocked(index) { return playtestAvailable && playtestAllLevels || Game.isLevelUnlocked(index, walletState.cleared); }
  function maxUnlockedLevel() { return Game.modeIndices(selectedMode).filter(unlocked).length; }
  function renderCampaignLevels() {
    const container = $('#campaignList'); if(!container) return;
    const indices = Game.modeIndices(selectedMode);
    if(!indices.includes(selectedLevel) || !unlocked(selectedLevel)) selectedLevel = indices.filter(unlocked).at(-1) ?? indices[0];
    $('#normalMode').setAttribute('aria-pressed',String(selectedMode==='normal'));
    $('#hardMode').setAttribute('aria-pressed',String(selectedMode==='hard'));
    container.innerHTML = indices.map(index=>{
      const level=Game.LEVELS[index],cleared=(walletState.cleared||[]).includes(level.id),open=unlocked(index);
      return '<button class="level-card '+(index===selectedLevel?'selected ':'')+(cleared?'cleared ':'')+(!open?'locked':'')+'" data-level="'+index+'" aria-pressed="'+(index===selectedLevel)+'" '+(open?'':'disabled')+'><span class="level-number">'+String(level.number).padStart(2,'0')+'</span><span class="level-info"><b>'+escapeHtml(level.title)+'</b><small>'+escapeHtml(open?level.chapterTitle:'先通关上一关')+'</small></span><span class="level-symbol" aria-hidden="true">'+(cleared?'✓':open?'◇':'🔒')+'</span></button>';
    }).join('');
    const choice = (selectedMode==='hard'?'困难':'普通')+' '+String(Game.LEVELS[selectedLevel].number).padStart(2,'0')+' 关';
    $('#chooseLevel').textContent = choice+' · 换关卡 ▾';
    $('#startSolo').textContent = '开始 · '+choice;
    $('#campaignNote').textContent = (selectedMode==='hard'?'困难':'普通')+' · 已通关 '+indices.filter(i=>(walletState.cleared||[]).includes(Game.LEVELS[i].id)).length+' / 36 · 可重玩已解锁关卡，两种难度分别解锁';
    const toggle=$('#playtestToggle');if(toggle){toggle.hidden=!playtestAvailable;toggle.setAttribute('aria-pressed',String(playtestAllLevels));toggle.textContent=playtestAllLevels?'开发试玩 · 全72关':'按进度解锁';}
    container.querySelectorAll('.level-card:not(:disabled)').forEach(button=>button.onclick=()=>{selectedLevel=Number(button.dataset.level);renderCampaignLevels();document.dispatchEvent(new CustomEvent('coop-level-selected'));});
    renderRoomLevelOptions();
  }
  ['normal','hard'].forEach(mode=>$('#'+mode+'Mode').onclick=()=>{selectedMode=mode;selectedLevel=Game.modeIndices(mode)[0];renderCampaignLevels();});
  $('#mapButton').onclick=()=>{window.RushImportedRenderer.toggleOverview();setCornerMenu(false);};

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function renderRoomLevelOptions(current, allowAllLevels) {
    if(!el.roomLevel)return;
    const keep=current==null?selectedLevel:Number(current);
    const indices=Game.LEVELS.map((_,i)=>i).filter(i=>allowAllLevels||unlocked(i)||i===keep);
    el.roomLevel.innerHTML=indices.map(i=>'<option value="'+i+'">'+(Game.modeFor(i)==='hard'?'困难':'普通')+' '+Game.LEVELS[i].number+' · '+escapeHtml(Game.LEVELS[i].title)+'</option>').join('');
    el.roomLevel.value=String(keep);
  }

  function acceptSnapshot(next) {
    const previous = state;
    if (previous && ((previous.phase === 'playing' && next.phase !== 'playing') ||
      (previous.world && next.world && (previous.world.run !== next.world.run || !!previous.world.fall !== !!next.world.fall)))) clearControls();
    state = next;
    if (next.wallet) updateWallet(next.wallet);
    if (previous && previous.world && next.world) {
      const before = previous.world;
      const after = next.world;
      if (before.message !== after.message && after.message) {
        showToast(after.message);
        if (after.message.includes('失足')) playSfx('fall');
        else if (after.message.includes('升降台')) playSfx('lift');
        else if (after.message.includes('已开启')) playSfx('switch');
      }
      const plateIds = Object.keys(after.plates || {});
      if (plateIds.some(function (id) { return !!after.plates[id] && !before.plates[id]; })) playSfx('plate');
      if (previous.phase !== 'intermission' && next.phase === 'intermission') playSfx('clear');
    }
    if (next.notice) showGlobal(next.notice);
    if (next.selectedLevel != null) {selectedLevel = next.selectedLevel; selectedMode = Game.modeFor(selectedLevel);}
    if (next.code) el.code.textContent = next.code;
    if (next.phase === 'lobby') {
      lastPhase = 'lobby';
      renderLobby();
    } else if (next.phase === 'paused' && !next.world) {
      lastPhase = 'lobby';
      renderLobby();
    } else if (next.phase === 'playing' || next.phase === 'paused') {
      lastPhase = next.phase;
      renderGameShell();
    } else if (next.phase === 'intermission') {
      lastPhase = 'intermission';
      renderResults();
    } else if (next.phase === 'ended') {
      showGlobal(next.notice || '房间已结束');
      state = null;
      saveRoom(null);
      showPage('home');
    }
    if (!next.solo) renderLobbySlots();
  }

  function showPage(name) {
    const changed=page!==name;
    if(name!=='game')window.RushGuide?.close();
    if(changed){
      window.CampOrientation?.setLandscape(name==='game' && !!state?.world);
      setCornerMenu(false);
      $('#gameHelp').classList.add('hidden');
      el.adModal.classList.add('hidden');
      if(parent!==window)parent.postMessage({source:'camp-game',mode:'coop',type:'playfield',active:name==='game'},location.origin);
    }
    page = name;
    el.home.classList.toggle('hidden', name !== 'home');
    el.lobby.classList.toggle('hidden', name !== 'lobby');
    el.game.classList.toggle('hidden', name !== 'game');
    if (name !== 'game') el.result.classList.add('hidden');
    document.body.classList.toggle('in-game', name === 'game');
    if (name === 'game') resizeBoard();
    if(changed&&name!=='game')window.scrollTo(0,0);
  }
  function renderLobby() {
    showPage('lobby');
    renderLobbySlots();
  }
  function renderContracts(){
    let box=document.getElementById('contractChoices');
    if(!box){box=document.createElement('section');box.id='contractChoices';box.className='contract-choices';$('.lobby-content').append(box);}
    const c=state.contracts;if(!c)return;
    box.replaceChildren();const title=document.createElement('h3');title.textContent='旅途契约 · 免费三选一';box.append(title);
    const hint=document.createElement('p');hint.textContent='双方选同一项，再准备出发。完成收藏印记；失败仍正常结算。';box.append(hint);
    [...c.offer,{id:null,name:'普通探索',text:'暂不挑战契约'}].forEach(item=>{
      const button=document.createElement('button');button.type='button';button.className=c.votes[ownSlot]===item.id?'selected':'';
      button.dataset.contract=item.id||'none';
      button.textContent=item.name+' · '+item.text+(c.votes[1-ownSlot]===item.id?' 【队友选择】':'');
      button.onclick=()=>send({type:'contract',value:item.id});box.append(button);
    });
  }
  function renderLobbySlots() {
    if (!state) return;
    renderContracts();
    const players = state.players || [];
    players.forEach(function (player, i) {
      $('#slotName' + i).textContent = player.name || (i === 0 ? '房主' : '等待伙伴');
      $('#slotStatus' + i).textContent = !player.joined ? '把房间码发给朋友' : (!player.connected ? '连接中断' : (player.ready ? '准备就绪' : '已连接，等待准备'));
      const dot = $('#readyDot' + i);
      dot.textContent = player.ready ? '准备' : (!player.joined ? '等待' : '未准备');
      dot.classList.toggle('ready', !!player.ready);
    });
    const host = !!state.host;
    $('#roomLevelSelect').classList.toggle('hidden', !host);
    renderRoomLevelOptions(state.selectedLevel || 0, !!state.playtestAllLevels);
    const own = players[ownSlot];
    const ready = !!(own && own.ready);
    el.ready.textContent = ready ? '取消准备' : '我准备好了';
    el.start.disabled = state.contracts?.votes[0]!==state.contracts?.votes[1] || !host || !players.length || !players.every(function (p) { return p.joined && p.connected && p.ready; });
    el.start.textContent = el.start.disabled ? (host ? '等待两位玩家准备' : '等待房主开始') : '开始这一关';
    $('#partnerStatus').textContent = players[1 - ownSlot] && players[1 - ownSlot].connected ? '队友在线' : '等待队友';
  }
  function renderGameShell() {
    showPage('game');
    el.result.classList.add('hidden');
    const paused = state.phase === 'paused';
    el.pause.classList.toggle('hidden', !paused);
    el.pauseText.textContent = state.pauseReason || '正在等待队友重连…';
    $('#partnerStatus').textContent = paused ? '等待重连' : '队友在线';
    $('#switchPlayer').hidden = !state.solo;
    if (state.solo) {
      $('#switchPlayer').innerHTML = '<b>正在控制 ' + (ownSlot + 1) + 'P</b><span>切换至 ' + (2 - ownSlot) + 'P ⇄</span>';
      $('#switchPlayer').dataset.slot = String(ownSlot);
      $('#switchPlayer').dataset.element = state.world && Game.stageFor(state.world).revision ? (ownSlot===0?'sun':'moon') : '';
      $('#switchPlayer').setAttribute('aria-label', '正在控制 ' + (ownSlot + 1) + 'P，切换至 ' + (2 - ownSlot) + 'P');
      setNetwork('单人 · 离线', true);
      $('#partnerStatus').textContent = (2 - ownSlot) + 'P 待命';
    }
    const world = state.world;
    if (world) {
      const level = Game.LEVELS[world.levelIndex];
      const room = Game.stageFor(world);
      const roomCount = level.rooms ? level.rooms.length : 1;
      $('#levelCount').textContent = (level.mode==='hard'?'困难':'普通') + ' ' + level.number + ' / 36' + (roomCount > 1 ? ' · ' + (world.roomIndex + 1) + '/' + roomCount + ' 段' : '');
      $('#levelTitle').textContent = level.title;
      const campaign = level.design || {};
      el.stageHint.textContent = level.hint || level.subtitle;
      if(state.contracts?.selected){const c=state.contracts.offer.find(c=>c.id===state.contracts.selected);if(c)el.stageHint.textContent='契约：'+c.name+' · '+el.stageHint.textContent;}
      $('#gameHelpText').textContent = (room.hint || window.RushArtConfig.help[world.levelIndex] || campaign.thinking || level.hint) + (navigator.maxTouchPoints > 0 || compactLandscape.matches ? ' 左侧按住任意位置生成摇杆，左右拖动移动；右侧跳跃与互动。' : ' AD / 方向键移动，空格跳跃，E 互动，R 重置。') + ' 1P 冲刺破障；2P 二段跳、推箱、搭肩，互动可暂停附近巡逻。两位角色共同抵达出口。';
      if (room.revision) $('#gameHelpText').textContent += ' 1P 是日纹，2P 是月纹；只可操作、收集自己的颜色。日池伤害 2P，月池伤害 1P，绿池伤害双方；危险池可以跳过。双压印需同时压住两个 ⊕ 压板，再由 2P 互动锁定；角色或箱子都能压板。所有永久机关与晶石完成后，各进自己的门。';
      if (state.solo) $('#gameHelpText').textContent += ' 单人：点击左上角或按 Q / Tab 切换角色。待命角色仍能压住机关；打开菜单、帮助或切后台会暂停。两位角色都到达出口才通关。';
    }
    updateInteractButton();
  }
  function renderResults() {
    showPage('game');
    setCornerMenu(false);$('#gameHelp').classList.add('hidden');window.RushGuide?.close();
    $('#result').classList.remove('hidden');
    $('#pauseBanner').classList.add('hidden');
    let contractResult=document.getElementById('contractResult');
    if(!contractResult){contractResult=document.createElement('p');contractResult.id='contractResult';$('#resultMarks').after(contractResult);}
    const contract=state.contracts?.offer.find(c=>c.id===state.settlement?.contract);
    contractResult.textContent=contract?(state.settlement.contractCompleted?'契约完成 · 已收藏印记：':'契约未完成 · 可下次再试：')+contract.name:'';
    const award = state.selfAward || { base: 0, adBonus: 0, first: false, adClaimed: false };
    const nextButton = $('#resultNext');
    const finalLevel = state.world && Game.nextLevelIndex(state.world.levelIndex) == null;
    const marks = award.marks || {};
    nextButton.classList.toggle('hidden', !!finalLevel);
    const partnerConnected = state.players.every(player => player && player.connected);
    nextButton.disabled = !state.host || !partnerConnected;
    nextButton.textContent = state.host ? '进入第 ' + (Game.LEVELS[state.world.levelIndex].number + 1) + ' 关' : '等待房主进入下一关';
    let nextStatus=$('#nextStatus');
    if(!nextStatus){nextStatus=document.createElement('p');nextStatus.id='nextStatus';nextStatus.setAttribute('role','status');nextButton.before(nextStatus);}
    nextStatus.textContent=finalLevel?'冒险完成，感谢一路同行。':!partnerConnected?'等待队友重新连接后继续。':'房主点击即可带队继续，无需再次准备；保持当前难度继续挑战。';
    $('#result').classList.toggle('finale-result', !!finalLevel);
    $('#resultKicker').textContent = finalLevel ? '归途之门 · 终章' : '两个人都抵达了';
    $('#resultTitle').textContent = finalLevel ? '36 / 36 · 伙伴归来' : award.first ? '首通地牢，默契满分。' : '两个人，都抵达了。';
    $('#resultDescription').textContent = finalLevel ? '营火重新点亮 · 纪念徽记已收入你的开发测试账户。' : '基础奖励已由服务器结算并入账。房间内只有你能领取自己的额外奖励。';
    $('#switchPlayer').hidden = true;
    $('#showAdChoices').classList.toggle('hidden', !!state.solo);
    $('.dev-ad-label').classList.toggle('hidden', !!state.solo);
    if (state.solo) {
      nextButton.disabled = false;
      nextButton.textContent = '进入第 ' + (Game.LEVELS[state.world.levelIndex].number + 1) + ' 关';
      nextStatus.textContent = finalLevel ? '当前难度36关旅程完成，回营地看看新的足迹。' : '单人接力完成 · 点击即可继续，无需房间或队友确认。';
      $('#resultKicker').textContent = '单人接力 · 两位勇者抵达';
      $('#resultTitle').textContent = finalLevel ? '36 / 36 · 旅人归来' : '一个人，也能同行。';
      $('#resultDescription').textContent = award.first ? '本关单人首通 +30 冒险币；单人进度独立保存。' : '本关已通关，重复挑战不重复领取首通奖励。';
    }
    const markItems = [];
    Object.keys(marks.contracts||{}).forEach(id=>{const names={safe:'平安同行',keepsake:'寻迹搭档',perfect:'完整旅程',lead0:'1P 先锋',lead1:'2P 先锋',together:'默契到站',steady:'稳稳同行'};if(names[id])markItems.push('<span class="result-mark keepsake">契 · '+names[id]+'</span>');});
    if (marks.cleared) markItems.push('<span class="result-mark complete">✓ 通关</span>');
    if (marks.safeArrival) markItems.push('<span class="result-mark safe">◇ 平安抵达</span>');
    if (marks.keepsake) markItems.push('<span class="result-mark keepsake">✦ 协作留念</span>');
    if (state.world && state.world.levelIndex === 43 && marks.routes) {
      if (marks.routes.upper) markItems.push('<span class="result-mark route">↟ 上路记录</span>');
      if (marks.routes.energy) markItems.push('<span class="result-mark route">◉ 能源路记录</span>');
    }
    if (marks.finaleBadge) markItems.push('<span class="result-mark keepsake">✧ 归营徽记</span>');
    $('#resultMarks').innerHTML = markItems.join('');
    $('#baseReward').innerHTML = '+' + award.base + ' <small>冒险币' + (award.first ? ' · 首通' : ' · 重复通关') + '</small>';
    $('#showAdChoices').disabled = !!award.adClaimed;
    $('#showAdChoices').innerHTML = award.adClaimed ? '本局额外奖励已领取 ✓' : '领取额外奖励 <span id="adRewardAmount">+' + award.adBonus + ' 冒险币</span>';
    if (lastSelfAwardId !== award.id) {
      lastSelfAwardId = award.id || '';
      el.adOutcome.textContent = '';
      el.adOutcome.classList.add('hidden');
    }
    if (award.adClaimed && !el.adOutcome.textContent) {
      el.adOutcome.textContent = '本局额外奖励已领取。';
      el.adOutcome.classList.remove('hidden');
    }
    $('#result').classList.remove('hidden');
  }

  function showToast(text) {
    if (lastToastText === text) return;
    lastToastText = text;
    el.toast.textContent = text;
    el.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.add('hidden');
      lastToastText = '';
    }, 1700);
  }
  function showGlobal(text) {
    if (!text) return;
    el.globalToast.textContent = text;
    el.globalToast.classList.remove('hidden');
    clearTimeout(globalToastTimer);
    globalToastTimer = setTimeout(function () { el.globalToast.classList.add('hidden'); }, 2400);
  }

  function joinByCode() {
    if(!wsUrl()){showServerSetup(joinByCode);return;}
    if (joinPending) return;
    const code = $('#roomCode').value.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) { showGlobal('请输入完整的 6 位房间码。'); return; }
    joinPending = true;
    $('#joinRoom').disabled = true;
    joinTimeoutTimer = setTimeout(function () {
      if (!joinPending) return;
      const requestWasSent = joinRequestSent;
      joinPending = false;
      pendingJoinMessage = null;
      joinRequestSent = false;
      $('#joinRoom').disabled = false;
      showGlobal(requestWasSent
        ? '加入请求超时：' + wsUrl() + '。请确认服务已启动后重试。'
        : '尚未连接：' + wsUrl() + '。加入请求未发送，请确认地址和服务。');
    }, 10000);
    pendingJoinMessage = { type: 'join', code: code, accountId: accountId, name: '探险者' };
    if (socket && socket.readyState === WebSocket.OPEN) sendPendingJoin();
    else {
      showGlobal('正在连接服务器，连接成功后会自动加入。');
      connect();
    }
  }
  $('#createRoom').addEventListener('click', function () {
    if(!wsUrl()){showServerSetup(()=>window.CampCoop.enter({choice:selectedLevel}));return;}
    send({ type: 'create', accountId: accountId, name: '房主', level: selectedLevel, playtestAllLevels: playtestAvailable && playtestAllLevels });
  });
  $('#joinRoom').addEventListener('click', joinByCode);
  $('#roomCode').addEventListener('keydown', function (event) { if (event.key === 'Enter') joinByCode(); });
  $('#roomCode').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
  $('#playtestToggle').addEventListener('click', function () {
    if (!playtestAvailable) return;
    playtestAllLevels = !playtestAllLevels;
    try { localStorage.setItem('zcyg_playtest_all_levels', playtestAllLevels ? '1' : '0'); } catch (_) {}
    renderCampaignLevels();
  });
  async function loadCampaignConfig() {
    if (soloMode || new URLSearchParams(location.search).get('solo') === '1') { playtestAvailable = false; playtestAllLevels = false; renderCampaignLevels(); return; }
    if(window.PhoneLan){playtestAvailable=false;playtestAllLevels=false;renderCampaignLevels();return;}
    let configUrl='/api/config';
    if(location.protocol==='file:'||androidPackage) {
      const endpoint=wsUrl();
      if(!endpoint) { playtestAvailable=false; playtestAllLevels=false; renderCampaignLevels(); return; }
      const url=new URL(endpoint); url.protocol=url.protocol==='wss:'?'https:':'http:'; url.pathname='/api/config'; url.search=''; url.hash=''; configUrl=url.href;
    }
    try {
      const response=await fetch(configUrl,{cache:'no-store'});
      if(!response.ok) throw new Error('开发配置不可用');
      const config=await response.json();
      if (soloMode) return;
      playtestAvailable=!!config.playtestAllLevels;
      let preference=null;
      try { preference=localStorage.getItem('zcyg_playtest_all_levels'); } catch (_) {}
      playtestAllLevels=playtestAvailable&&preference!=='0';
    } catch (_) { playtestAvailable=false; playtestAllLevels=false; }
    renderCampaignLevels();
  }
  loadCampaignConfig();
  renderCampaignLevels();
  el.roomLevel.addEventListener('change', function () { send({ type: 'level', value: Number(this.value), playtestAllLevels: !!(state && state.playtestAllLevels) }); });
  el.ready.addEventListener('click', function () {
    const own = state && state.players[ownSlot];
    send({ type: 'ready', value: !(own && own.ready) });
  });
  el.start.addEventListener('click', function () { send({ type: 'start' }); });
  $('#copyCode').addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(el.code.textContent);
      this.textContent = '已复制';
      setTimeout(function () { $('#copyCode').textContent = '复制'; }, 1000);
    } catch (_) { showGlobal('请手动记下房间码。'); }
  });
  $('#leaveLobby').addEventListener('click', function () { send({ type: 'leave' }); });
  $('#resultHome').addEventListener('click', function () { send({ type: 'leave' }); });
  $('#resultNext').addEventListener('click', function () { send({ type: 'next-level', settlementId: state?.settlement?.id }); });
  $('#leaveGame').addEventListener('click', function () { send({ type: 'leave' }); });
  $('#brandHome').addEventListener('click', function (event) { event.preventDefault(); if (page === 'lobby') send({ type: 'leave' }); else showPage('home'); });
  $('#resetButton').addEventListener('click', function () { send({ type: 'reset' }); });
  $('#buyCosmetic').addEventListener('click', function () {
    if ($('#buyCosmetic').classList.contains('owned')) { showGlobal('「余烬围巾」已装备。'); return; }
    send({ type: 'buy', accountId: accountId });
  });
  $('#showAdChoices').addEventListener('click', function () {
    if (!state || !state.selfAward) return;
    const button = $('#showAdChoices');
    button.disabled = true;
    const settlementId = state.selfAward.id;
    window.RushAds.requestRewardedVideo().then(function (status) {
      if (state?.selfAward?.id !== settlementId) return;
      send({ type: 'ad-claim', settlementId, status });
    }).catch(function () {
      showGlobal('广告暂不可用，原有奖励保留，可再次尝试。');
    }).finally(function () { button.disabled = false; });
  });

  function soloIsPaused() {
    return !!(soloSession && page === 'game' && (document.hidden || !document.hasFocus() || window.campPaused || window.RushGuide?.blocking || !$('#cornerPanel').hidden || !$('#gameHelp').classList.contains('hidden')));
  }
  function choosePlayMode(solo) {
    if (state?.world && page === 'game') return;
    if (!solo && soloSession) { soloSession.save(); soloSession = null; }
    soloMode = solo;
    $('#soloMode').setAttribute('aria-pressed', String(solo));
    $('#duoMode').setAttribute('aria-pressed', String(!solo));
    $('.solo-departure').hidden = !solo;
    $('.room-panel').classList.toggle('hidden', solo);
    document.body.classList.toggle('solo-mode', solo);
    if (solo) {
      clearTimeout(reconnectTimer); clearTimeout(joinTimeoutTimer); clearTimeout(joinRetryTimer);
      joinPending = false; pendingJoinMessage = null; joinRequestSent = false;
      connectionWanted = false;
      if (socket) { const old = socket; socket = null; if (old.readyState === WebSocket.OPEN) old.send(JSON.stringify({ type: 'leave' })); old.close(); }
      saveRoom(null);
      playtestAvailable = false; playtestAllLevels = false;
      soloSession = soloSession || new window.RushSolo.Session(localStorage, () => showGlobal('本机存储空间不足，本次进度未能保存。'));
      selectedLevel = soloSession.world?.levelIndex ?? Game.modeIndices(selectedMode)[0];
      selectedMode = Game.modeFor(selectedLevel);
      updateWallet(soloSession.progress);
      $('#resumeSolo').hidden = !soloSession.world;
      if (soloSession.world) $('#resumeSolo').textContent = '继续第 ' + (Game.LEVELS[soloSession.world.levelIndex].number) + ' 关 · ' + (soloSession.active + 1) + 'P';
      $('.currency small').textContent = '单人首通币';
    } else {
      state = null; ownSlot = -1; connectionWanted = true;
      const url = new URL(location.href);url.searchParams.delete('solo');history.replaceState(null,'',url);
      updateWallet(networkWallet);
      $('.currency small').textContent = '冒险币';
      loadCampaignConfig(); connect();
    }
    showPage('home');
  }
  function refreshSolo() {
    if (!soloSession?.world) return;
    ownSlot = soloSession.active;
    acceptSnapshot(soloSession.snapshot());
    if (soloSession.award?.id) window.CampBridge?.coopAward(soloSession.award.id, Game.LEVELS[soloSession.world.levelIndex].id);
  }
  function leaveSolo() {
    clearControls(); soloSession?.save();
    state = null; lastPhase = ''; ownSlot = -1;
    showPage('home'); $('#gameHelp').classList.add('hidden'); $('#switchPlayer').hidden = true;
    choosePlayMode(true);
  }
  function switchSoloPlayer() {
    if (!soloSession || state?.phase !== 'playing' || soloIsPaused()) return;
    clearControls(); soloSession.switchPlayer(); ownSlot = soloSession.active;
    soloSession.save(); renderGameShell();
  }
  function stepSolo() {
    const roomBefore = soloSession.world.roomIndex;
    const messageBefore = soloSession.world.message;
    const wasFalling = !!soloSession.world.fall;
    soloSession.step();
    if (wasFalling !== !!soloSession.world.fall) { clearControls(); if (soloSession.world.fall) playSfx('fall'); }
    if (soloSession.world.message !== messageBefore && soloSession.world.message) showToast(soloSession.world.message);
    if (soloSession.world.phase !== state.phase || roomBefore !== soloSession.world.roomIndex) {
      refreshSolo(); resetWorldRender();
      if (state.phase === 'intermission') { clearControls(); playSfx('clear'); }
    } else if (++soloHudTicks % 6 === 0) updateInteractButton();
  }
  $('#soloMode').onclick = () => choosePlayMode(true);
  $('#duoMode').onclick = () => choosePlayMode(false);
  $('#startSolo').onclick = () => { clearControls(); soloSession.start(selectedLevel); refreshSolo(); };
  $('#resumeSolo').onclick = () => { clearControls(); refreshSolo(); };
  $('#switchPlayer').onclick = switchSoloPlayer;
  window.addEventListener('pagehide', () => { clearControls(); soloSession?.save(); });

  function resetJoystick() {
    const oldPointer = joystickPointer;
    joystickPointer = null; joystickDirection = '';
    $('#joystickKnob').style.transform = 'translate(0px, 0px)';
    $('#moveJoystick').classList.remove('pressed');
    $('#moveJoystick').style.removeProperty('left'); $('#moveJoystick').style.removeProperty('top');
    if (oldPointer !== null && $('#moveZone').hasPointerCapture(oldPointer)) $('#moveZone').releasePointerCapture(oldPointer);
  }
  const joystick = $('#moveJoystick');
  const moveZone = $('#moveZone');
  let joystickOrigin = { x: 0, y: 0 };
  function moveJoystick(event) {
    const rect = joystick.getBoundingClientRect();
    const radius = rect.width * .33;
    let x = event.clientX - joystickOrigin.x;
    let y = event.clientY - joystickOrigin.y;
    const scale = Math.min(1, radius / (Math.hypot(x, y) || 1));
    x *= scale; y *= scale;
    $('#joystickKnob').style.transform = 'translate(' + x + 'px,' + y + 'px)';
    joystickDirection = Math.abs(x) < radius * .22 ? '' : x < 0 ? 'left' : 'right';
    updateControls();
  }
  moveZone.addEventListener('pointerdown', event => {
    if (event.button !== 0 || joystickPointer !== null || state?.phase !== 'playing' || state.world?.fall || soloIsPaused()) return;
    event.preventDefault(); joystickPointer = event.pointerId;
    joystickOrigin = { x: event.clientX, y: event.clientY };
    const zone = moveZone.getBoundingClientRect();
    // The wheel centre matches the touch origin, including near screen edges.
    joystick.style.left = (event.clientX - zone.left) + 'px';
    joystick.style.top = (event.clientY - zone.top) + 'px';
    moveZone.setPointerCapture(event.pointerId); joystick.classList.add('pressed'); moveJoystick(event);
  });
  moveZone.addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) { event.preventDefault(); moveJoystick(event); } });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => moveZone.addEventListener(type, event => {
    if (event.pointerId !== joystickPointer) return;
    resetJoystick(); updateControls();
  }));
  moveZone.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('resize', clearControls);

  function clearControls() {
    pressedKeys.clear();
    touchPointers.clear();
    resetJoystick();
    soloSession?.release();
    $$('.touch-controls button').forEach(function (button) { button.classList.remove('pressed'); });
    controls = { left: false, right: false, jump: false, interact: false };
    sendInputPacket(false, false);
  }
  function keyboardControl(event, down) {
    const target = event.target;
    if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
    const key = event.key.toLowerCase();
    if (soloMode && page === 'game' && (key === 'q' || key === 'tab') && !soloIsPaused()) {
      event.preventDefault();
      if (down && !event.repeat) switchSoloPlayer();
      return;
    }
    let prop = '';
    if (key === 'arrowleft' || key === 'a') prop = 'left';
    else if (key === 'arrowright' || key === 'd') prop = 'right';
    else if (key === ' ' || key === 'arrowup' || key === 'w') prop = 'jump';
    else if (key === 'e' || key === 'x') prop = 'interact';
    if (prop && page === 'game') {
      event.preventDefault();
      if (down && soloIsPaused()) return;
      if (down) pressedKeys.add(key);
      else pressedKeys.delete(key);
      updateControls();
    }
    if (down && !event.repeat && page === 'game' && key === 'r') { event.preventDefault(); send({ type: 'reset' }); }
    if (down && !event.repeat && page === 'lobby' && key === 'enter') {
      const own = state && state.players[ownSlot];
      if (own && !own.ready) send({ type: 'ready', value: true });
    }
  }
  window.addEventListener('keydown', function (event) { keyboardControl(event, true); });
  window.addEventListener('keyup', function (event) { keyboardControl(event, false); });
  window.addEventListener('blur', function () { clearControls(); soloSession?.save(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearControls(); soloSession?.save(); } });
  $$('.touch-controls [data-control]').forEach(function (button) {
    button.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || page !== 'game' || state?.phase !== 'playing' || state.world?.fall || soloIsPaused()) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touchPointers.set(event.pointerId, button.dataset.control);
      button.classList.add('pressed');
      updateTouchControls();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
      button.addEventListener(type, function (event) {
        touchPointers.delete(event.pointerId);
        button.classList.remove('pressed');
        updateTouchControls();
      });
    });
    button.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  });
  function updateTouchControls() {
    updateControls();
  }
  function updateControls() {
    const heldKeys = {
      left: pressedKeys.has('a') || pressedKeys.has('arrowleft'),
      right: pressedKeys.has('d') || pressedKeys.has('arrowright'),
      jump: pressedKeys.has(' ') || pressedKeys.has('arrowup') || pressedKeys.has('w'),
      interact: pressedKeys.has('e') || pressedKeys.has('x')
    };
    touchPointers.forEach(function (control) { heldKeys[control] = true; });
    if (joystickDirection) heldKeys[joystickDirection] = true;
    if (soloIsPaused()) return;
    const previous = controls;
    const changed = ['left', 'right', 'jump', 'interact'].some(function (name) { return heldKeys[name] !== previous[name]; });
    if (!changed) return;
    controls = heldKeys;
    sendInputPacket(controls.jump && !previous.jump, controls.interact && !previous.interact);
  }
  function sendInputPacket(jumpPressed, interactPressed) {
    if (soloSession && state?.phase === 'playing') { soloSession.setInput({ ...controls, jumpPressed, interactPressed }); return; }
    if (!socket || socket.readyState !== WebSocket.OPEN || !state || state.phase !== 'playing') return;
    socket.send(JSON.stringify({
      type: 'input', left: controls.left, right: controls.right,
      jump: controls.jump, interact: controls.interact,
      jumpPressed: !!jumpPressed, interactPressed: !!interactPressed
    }));
    lastInputSend = performance.now();
  }
  function updateInteractButton() {
    const button = $('[data-control="interact"]');
    if (!button) return;
    let available = false;
    const world = state && state.world;
    const player = world && world.players && world.players[ownSlot];
    if (page === 'game' && state.phase === 'playing' && player) {
      const level = Game.stageFor(world);
      const px = player.x + Game.PHYSICS.playerWidth / 2;
      const py = player.y + Game.PHYSICS.playerHeight;
      available = level.imported || level.switches.some(function (sw) {
        return (sw.role==null || sw.role===ownSlot) && (!sw.requires || sw.requires.every(k=>world.flags[k])) &&
          (!sw.key || !world.flags[sw.key] || sw.type === 'bridgeToggle') && Math.abs(px - (sw.x + sw.w / 2)) <= (level.revision?56:82) && Math.abs(py - (sw.y + sw.h)) <= (level.revision?65:82);
      }) || world.lifts.some(function (lift) {
        return (!lift.poweredBy || !!world.flags[lift.poweredBy]) && Math.abs(px - (lift.x + lift.w / 2)) < 98 && Math.abs(py - (lift.y + 8)) < 90;
      });
      available = available || (level.charges || []).some(function (node) {
        const charge = world.charges[node.id];
        return charge && !charge.stable && Math.abs(px - (node.x + node.w / 2)) <= 82 && Math.abs(py - (node.y + node.h)) <= 82;
      }) || (level.oneWayGates || []).some(function (gate) {
        return !world.flags[gate.unlockKey] && Math.abs(px - (gate.x + gate.w / 2)) <= 72 && Math.abs(py - (gate.y + gate.h)) <= 82;
      });
    }
    button.classList.toggle('ready', available);
    button.title = available ? '附近有可互动机关' : '互动';
    button.setAttribute('aria-label', available ? '互动，附近有机关' : '互动');
  }

  let animationTime = 0, animationStamp = 0;
  function drawWorld(now) {
    if (state && state.world) {
      window.RushGuide?.update(state,ownSlot);
      const elapsed = animationStamp ? Math.max(0, Math.min(50, now - animationStamp)) : 0;
      animationStamp = now;
      if (state.phase === 'playing' && !soloIsPaused() && !window.campPaused && !document.hidden) animationTime += elapsed;
      window.RushArt.draw(ctx, state, ownSlot, animationTime, navigator.maxTouchPoints > 0 || compactLandscape.matches);
    }
  }

  function frame(timestamp) {
    const delta = previousFrame ? Math.min(.1, (timestamp - previousFrame) / 1000) : 0;
    previousFrame = timestamp;
    if (soloSession && page === 'game' && state?.phase === 'playing' && !soloIsPaused()) {
      soloAccumulator += delta;
      while (soloAccumulator >= 1 / 60 && state.phase === 'playing') { stepSolo(); soloAccumulator -= 1 / 60; }
    } else soloAccumulator = 0;
    if (page === 'game') {
      if (state && state.world) drawWorld(timestamp);
      else {
        ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (timestamp - lastInputSend >= 52) {
        if (state && state.phase === 'playing') sendInputPacket(false, false);
        lastInputSend = timestamp;
      }
    } else {
      drawHomePreview(timestamp);
    }
    requestAnimationFrame(frame);
  }
  function drawHomePreview(now) {
    if (page !== 'home' || assetsReady) return;
    const preview = $('#heroPreview');
    if (!preview) return;
  }
  window.render_game_to_text = function () {
    const world = state && state.world;
    return JSON.stringify({
      coordinateSystem: 'Authored map coordinates; origin top-left; x rightward, y downward',
      viewport: { width: canvas.width, height: canvas.height, camera: window.RushImportedRenderer.inspect() },
      selectedLevel: {index:selectedLevel,number:Game.LEVELS[selectedLevel].number,mode:Game.modeFor(selectedLevel)},
      page: page,
      playMode: soloMode ? 'solo' : 'duo',
      soloPaused: soloIsPaused(),
      tutorial: window.RushGuide?.inspect(),
      joystick: joystickDirection,
      fall: world?.fall || null,
      connected: !!(socket && socket.readyState === WebSocket.OPEN),
      phase: state && state.phase,
      level: world ? Game.LEVELS[world.levelIndex].number : null,
      difficulty: world ? Game.modeFor(world.levelIndex) : selectedMode,
      title: world ? Game.LEVELS[world.levelIndex].title : null,
      room: world ? (world.roomIndex || 0) + 1 : null,
      ownSlot: ownSlot,
      players: world ? world.players.map(function (player, index) {
        return { slot: index, x: Math.round(player.x), y: Math.round(player.y), vx: Math.round(player.vx), vy: Math.round(player.vy), grounded: player.grounded };
      }) : [],
      controls: controls,
      campaignVersion: Game.CAMPAIGN_VERSION,
      crystals: world ? (Game.stageFor(world).crystals || []).map(g=>({...g,collected:!!world.flags[g.key]})) : [],
      roleExits: world ? Game.stageFor(world).roleExits || [] : [],
      flags: world ? world.flags : {},
      plates: world ? world.plates : {},
      boxes: world ? world.boxes : [],
      lifts: world ? world.lifts : [],
      elapsed: world ? Math.round(world.elapsed * 10) / 10 : 0,
      adMode: state && state.adMode || 'DEV_SIMULATION',
      currency: $('#coinCount').textContent,
      art: window.RushArt.inspect()
    });
  };
  window.RushGuide?.bind(clearControls,()=>{window.focus();canvas.focus({preventScroll:true});});
  $('#mechanismHelp').addEventListener('click',()=>setCornerMenu(false));
  requestAnimationFrame(frame);

  function resetWorldRender() { window.RushArt.reset(); setCornerMenu(false); $('#gameHelp').classList.add('hidden'); el.adModal.classList.add('hidden'); window.RushGuide?.close(); clearControls(); }
  const acceptSnapshotOriginal = acceptSnapshot;
  acceptSnapshot = function (next) {
    const changedWorld = state && state.world && next.world && state.world.levelIndex !== next.world.levelIndex;
    const changedRoom = state && state.world && next.world && state.world.roomIndex !== next.world.roomIndex;
    const changedRun = state?.world && next.world && state.world.run !== next.world.run;
    const startedPlaying = state?.phase !== 'playing' && next.phase === 'playing';
    acceptSnapshotOriginal(next);
    if (changedWorld || changedRoom || changedRun || startedPlaying) resetWorldRender();
  };

  $('#helpButton').addEventListener('click', function () { $('#gameHelp').classList.toggle('hidden'); if(soloMode)clearControls(); });
  $('#closeHelp').addEventListener('click', function () { $('#gameHelp').classList.add('hidden'); });

  function watchServer() {
    if (soloMode || new URLSearchParams(location.search).get('solo') === '1') return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    connect();
  }
  function resetPhoneConnection(){
    connectionWanted=false;clearTimeout(reconnectTimer);clearTimeout(joinTimeoutTimer);clearTimeout(joinRetryTimer);
    joinPending=false;pendingJoinMessage=null;joinRequestSent=false;saveRoom(null);clearControls();
    if(socket){const old=socket;socket=null;old.close();}state=null;ownSlot=-1;showPage('home');
  }
  function showPhoneSetup(afterSave){
    let layer=$('#phoneLanSetup');
    if(!layer){layer=document.createElement('div');layer.id='phoneLanSetup';layer.style.cssText='position:fixed;inset:0;z-index:9999;background:#000b;display:grid;place-items:center;padding:16px;overflow:auto';
      layer.innerHTML='<form class="server-setup-card" role="dialog" aria-modal="true"><h2>手机局域网联机</h2><p>两部安卓手机安装同版本游戏，连接同一 Wi-Fi，无需电脑或互联网。</p><button type="button" data-host>用这部手机开房</button><p>房主需保持游戏前台，切后台会关闭房间。</p><label>房主手机地址<input name="address" inputmode="decimal" placeholder="192.168.1.20" autocomplete="off"></label><label>六位房间码<input name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="房主开房后显示"></label><p role="alert" data-error></p><button type="submit">加入好友房间</button><button type="button" data-cancel>返回</button></form>';document.body.append(layer);}
    layer.style.display='grid';layer.querySelector('[name=code]').value=$('#roomCode').value||'';
    layer.querySelector('[data-cancel]').onclick=()=>layer.style.display='none';
    const activate=(host)=>{try{
      const ip=layer.querySelector('[name=address]').value,code=layer.querySelector('[name=code]').value;
      if(!host&&!/^\d{6}$/.test(code))throw Error('请填写房主显示的六位房间码');
      resetPhoneConnection();if(host)PhoneLan.host();else PhoneLan.join(ip);
      layer.style.display='none';connectionWanted=true;connect();updateLanInfo();
      window.CampCoop.enter(host?{choice:selectedLevel}:{roomCode:code});
    }catch(e){layer.querySelector('[data-error]').textContent=e.message;}};
    layer.querySelector('[data-host]').onclick=()=>activate(true);
    layer.querySelector('form').onsubmit=e=>{e.preventDefault();activate(false);};
  }
  window.addEventListener('phone-host-ended',()=>{resetPhoneConnection();setNetwork('房间已关闭，请重新开房',false);showGlobal('房主离开前台或连接异常，房间已关闭，请重新开房。');});
  function showServerSetup(afterSave) {
    if(window.PhoneLan){showPhoneSetup(afterSave);return;}
    let layer = $('#androidServerSetup');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'androidServerSetup';
      layer.innerHTML = '<form class="server-setup-card" role="dialog" aria-modal="true" aria-labelledby="serverTitle"><h2 id="serverTitle">连接局域网</h2><p>两台设备连接同一 Wi-Fi。电脑启动游戏服务后，填写电脑显示的局域网地址；浏览器直接打开该地址也能加入。</p><label for="serverAddress">电脑地址</label><input id="serverAddress" type="text" inputmode="url" placeholder="192.168.1.20:4173" autocomplete="off"><small id="serverAddressError" role="alert">不要填写手机自身的 127.0.0.1</small><div><button type="button" id="serverCancel">返回</button><button type="submit">连接</button></div></form>';
      document.body.append(layer);
    }
    const input=layer.querySelector('#serverAddress');
    input.value=localStorage.getItem('adventure-camp.coop.ws-url') || (androidPackage?'':location.host);
    layer.hidden=false;
    layer.querySelector('#serverCancel').onclick=()=>{layer.hidden=true;};
    layer.querySelector('form').onsubmit=event=>{
      event.preventDefault();
      let url;
      try { const value=input.value.trim();url=new URL(value.includes('://')?value:'ws://'+value);if(url.protocol==='http:')url.protocol='ws:';if(url.protocol==='https:')url.protocol='wss:';url.pathname='/ws';url.search='';url.hash=''; } catch (_) {}
      if (!url || !['ws:','wss:'].includes(url.protocol) || !url.hostname || url.username || url.password || (location.protocol==='https:'&&url.protocol==='ws:')) {
        layer.querySelector('#serverAddressError').textContent='地址无效；例如 192.168.1.20:4173。HTTPS 页面需要 WSS 连接。';
        return;
      }
      localStorage.setItem('adventure-camp.coop.ws-url',url.href);
      if(socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'leave'}));
      saveRoom(null);
      joinPending=false;pendingJoinMessage=null;joinRequestSent=false;
      clearTimeout(joinTimeoutTimer);clearTimeout(joinRetryTimer);
      clearTimeout(reconnectTimer);
      if (socket) { const old=socket;socket=null;old.close(); }
      state=null;ownSlot=-1;showPage('home');
      layer.hidden=true;
      connectionWanted=true;
      connect();
      updateLanInfo();
      loadCampaignConfig();
      if (afterSave) afterSave();
    };
    input.focus();
  }
  {
    const change=document.createElement('button');
    change.type='button';change.className='server-settings-button';change.textContent='局域网连接设置';
    $('.room-panel').insertBefore(change,$('.room-help'));
    change.addEventListener('click',()=>showServerSetup());
  }
  const lanInfo=document.createElement('div');lanInfo.className='lan-info';
  lanInfo.innerHTML='<b>同一 Wi-Fi · 好友联机</b><span class="lan-instruction"></span><code></code><button class="server-settings-button" type="button">切换服务器</button>';
  $('.invite-code').after(lanInfo);
  lanInfo.querySelector('button').onclick=()=>showServerSetup();
  async function updateLanInfo(){
    if(window.PhoneLan){lanInfo.querySelector('code').textContent=PhoneLan.address;lanInfo.querySelector('.lan-instruction').textContent=PhoneLan.hosting?'好友在同版本 APK 中填写此手机地址和上方房间码。房主保持前台，切后台会关闭房间。':'已连接房主手机；断线后 30 秒内可自动重连。';return;}
    const endpoint=wsUrl();if(!endpoint)return;
    const url=new URL(endpoint);url.protocol=url.protocol==='wss:'?'https:':'http:';url.pathname='/';
    let address=url.href;
    if(['127.0.0.1','localhost'].includes(url.hostname)&&!androidPackage){try{const r=await fetch('/lan-info');const data=await r.json();address=data.urls?.[0]||address;}catch{}}
    lanInfo.querySelector('code').textContent=address;
    lanInfo.querySelector('.lan-instruction').textContent=' · 好友打开下方地址，再输入房间码。电脑需保持运行。';
  }
  updateLanInfo();
  window.CampCoop = { async enter(options = {}) {
    if(options.solo){choosePlayMode(true);return;}
    if(soloMode){state=null;showPage('home');choosePlayMode(false);}
    if(Number.isInteger(options.choice) && Game.LEVELS[options.choice]) {
      selectedLevel=options.choice; selectedMode=Game.modeFor(selectedLevel);
    }
    connectionWanted=true;connect();
    if(options.roomCode)$('#roomCode').value=options.roomCode;
    if(androidPackage&&!wsUrl()){showServerSetup(()=>window.CampCoop.enter({...options,choice:selectedLevel}));return;}
    await loadCampaignConfig();
    if(options.roomCode){$('#roomCode').value=options.roomCode;joinByCode();}
    else { const start=Date.now();const wait=setInterval(function(){if(socket&&socket.readyState===WebSocket.OPEN){clearInterval(wait);$('#createRoom').click();}else if(Date.now()-start>10000){clearInterval(wait);showGlobal('连接失败，请检查联机服务器地址');}},100); }
  }, exit(){clearControls();soloSession?.save();if(window.PhoneLan&&!soloMode)PhoneLan.stop();connectionWanted=false;clearControls();if(socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'leave'}));saveRoom(null);socket&&socket.close();}, snapshot(){return state;}, pause(){if(soloMode){window.campPaused=true;clearControls();soloSession?.save();}}, resume(){if(soloMode){window.campPaused=false;clearControls();window.focus();}}, mute(value){window.campMuted=value;} };
  if(new URLSearchParams(location.search).get('solo')==='1')choosePlayMode(true);
  window.advanceTime = function(ms){const canStep=()=>soloMode&&page==='game'&&soloSession?.world&&state?.phase==='playing'&&!soloIsPaused();if(canStep()){for(let i=0;i<Math.round(Math.max(0,Math.min(60000,Number(ms)||0))/(1000/60))&&canStep();i++)stepSolo();drawWorld(performance.now());}return Promise.resolve();};
  watchServer();
  window.addEventListener('online', watchServer);
})();
