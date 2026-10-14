from pathlib import Path
R=Path(__file__).resolve().parents[1]
def edit(path,a,b):
 p=R/path;s=p.read_text(encoding='utf-8');assert a in s,(path,a);p.write_text(s.replace(a,b),encoding='utf-8')
server='games/coop/server/server.js'
edit(server,"const PRIVATE_DATA_DIR = path.join(os.homedir(), '.adventure-camp-coop');","const Contracts = require('./contracts.cjs');\nconst PRIVATE_DATA_DIR = process.env.CAMP_COOP_DATA_DIR || path.join(os.homedir(), '.adventure-camp-coop');")
edit(server,'    selectedLevel: room.levelIndex,','    selectedLevel: room.levelIndex,\n    contracts: {offer: contractOffer(room), votes: room.contractVotes, selected: room.contractSelected},')
edit(server,'function createRoom(socket, message) {','''function contractOffer(room) {
  room.contractOffers ||= {};
  return room.contractOffers[room.levelIndex] ||= Contracts.offer(Game.LEVELS[room.levelIndex],()=>crypto.randomInt(1000000)/1000000);
}
function resetContracts(room) {
  room.contractVotes=[null,null];room.contractSelected=null;
  room.slots.forEach(s=>{if(s)s.ready=false;});
}
function createRoom(socket, message) {''')
edit(server,"    runSeq: 0, phase: 'lobby'", "    contractVotes:[null,null],contractSelected:null,contractOffers:{},\n    runSeq: 0, phase: 'lobby'")
edit(server,"  if (message.type === 'ready') {", """  if (message.type === 'contract') {
    if(room.phase!=='lobby')return;
    if(message.value!==null&&!contractOffer(room).some(c=>c.id===message.value))return;
    room.contractVotes[index]=message.value;
    room.slots.forEach(s=>{if(s)s.ready=false;});
    broadcast(room);
  } else if (message.type === 'ready') {""")
edit(server,"    broadcast(room);\n  } else if (message.type === 'start')", "    resetContracts(room);\n    broadcast(room);\n  } else if (message.type === 'start')")
edit(server,"    room.world = Game.createWorld(room.levelIndex, room.runSeq);", """    if(room.contractVotes[0]!==room.contractVotes[1])return sendError(socket,'请先商量好同一份契约，或双方选择普通探索');
    room.contractSelected=room.contractVotes[0];
    room.world = Game.createWorld(room.levelIndex, room.runSeq);""")
edit(server,"      room.levelIndex += 1;", "      room.levelIndex += 1;\n      resetContracts(room);")
edit(server,"      Game.stepWorld(room.world, inputs, TICK_MS / 1000);", "      Game.stepWorld(room.world, inputs, TICK_MS / 1000);\n      Contracts.track(room.world,Game);")
edit(server,"    marks.routes = marks.routes || {};", """    marks.contracts = marks.contracts || {};
    if(Contracts.achieved(room.contractSelected,world)&&!marks.contracts[room.contractSelected]){marks.contracts[room.contractSelected]=true;changed=true;}
    marks.routes = marks.routes || {};""")
edit(server,"settled: true, adMode: 'DEV_SIMULATION'", "settled: true, contract:room.contractSelected,contractCompleted:Contracts.achieved(room.contractSelected,world),adMode: 'DEV_SIMULATION'")
client='games/coop/src/client.js'
edit(client,'  function renderLobbySlots() {','''  function renderContracts(){
    let box=document.getElementById('contractChoices');
    if(!box){box=document.createElement('section');box.id='contractChoices';box.className='contract-choices';$('.lobby-panel').append(box);}
    const c=state.contracts;if(!c)return;
    box.replaceChildren();const title=document.createElement('h3');title.textContent='旅途契约 · 免费三选一';box.append(title);
    const hint=document.createElement('p');hint.textContent='双方选同一项，再准备出发。完成收藏印记；失败仍正常结算。';box.append(hint);
    [...c.offer,{id:null,name:'普通探索',text:'暂不挑战契约'}].forEach(item=>{
      const button=document.createElement('button');button.type='button';button.className=c.votes[ownSlot]===item.id?'selected':'';
      button.textContent=item.name+' · '+item.text+(c.votes[1-ownSlot]===item.id?' 【队友选择】':'');
      button.onclick=()=>send({type:'contract',value:item.id});box.append(button);
    });
  }
  function renderLobbySlots() {''')
edit(client,'    const players = state.players || [];','    renderContracts();\n    const players = state.players || [];')
edit(client,"    el.start.disabled = !host ||", "    el.start.disabled = state.contracts?.votes[0]!==state.contracts?.votes[1] || !host ||")
edit(client,"      $('#gameHelpText').textContent =", "      if(state.contracts?.selected){const c=state.contracts.offer.find(c=>c.id===state.contracts.selected);if(c)el.stageHint.textContent='契约：'+c.name+' · '+el.stageHint.textContent;}\n      $('#gameHelpText').textContent =")
edit(client,"    const award = state.selfAward ||", """    let contractResult=document.getElementById('contractResult');
    if(!contractResult){contractResult=document.createElement('p');contractResult.id='contractResult';el.result.append(contractResult);}
    const contract=state.contracts?.offer.find(c=>c.id===state.settlement?.contract);
    contractResult.textContent=contract?(state.settlement.contractCompleted?'契约完成 · 已收藏印记：':'契约未完成 · 可下次再试：')+contract.name:'';
    const award = state.selfAward ||""")
with (R/'games/coop/css/room.css').open('a',encoding='utf-8') as f:f.write('''
.contract-choices{margin-top:16px;padding:12px;border:1px solid #b8a47c;border-radius:12px}.contract-choices h3{margin:0}.contract-choices p{font-size:12px;line-height:1.5}.contract-choices button{display:block;width:100%;padding:10px;margin:7px 0;text-align:left;white-space:normal;line-height:1.5;min-height:44px}.contract-choices button.selected{outline:2px solid #9b7535;background:#eee0bb;color:#263337}#contractResult{padding:12px;color:#705325;background:#f7e9c8;border-radius:8px}
''')
