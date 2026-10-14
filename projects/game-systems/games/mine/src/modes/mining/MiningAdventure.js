/* 营地奇遇：保留免费三选一；续玩统一使用远征版的动作边界存档。 */
(function () {
  const MM = window.MT.MM, P = MM.MiningMode.prototype;
  const KEY = 'adventure-camp.mine.active.v1';
  const cards = [
    ...Object.values(MM.UPGRADES).map(u => ({id:u.id,name:u.name,desc:u.desc,upgrade:true})),
    {id:'bomb',name:'爆破补给',desc:'获得2份炸药，适合打开岔路。',count:2},
    {id:'powerPick',name:'硬岩克星',desc:'获得3把强化矿镐，节省坚硬岩石的体力。',count:3},
    {id:'lamp',name:'寻宝灯组',desc:'获得2盏探矿灯，先观察再决定路线。',count:2}
  ];
  let panel;
  function close(){if(panel)panel.remove();panel=null;}
  function stable(m){return m.run && !m.run.tutorialRun && (m.run.settled || (m.run.state==='EXPLORING'&&!m.modal&&!m.settingsOpen&&!m.run.pendingDiscovery&&!m.run.pendingRoomChoice&&!m.run.pendingWorkbench&&!(m.tutorial&&m.tutorial.open)));}
  function save(m){
    if(!stable(m))return;
    if(!m.run.settled)MM.Save.saveActiveRun(m.run,m.map,m.modal);
  }
  // 原合集存档保存的是 Mulberry32 的内部状态；恢复后继续同一条掉落随机流。
  const restoreRng=MM.RNG.restore;
  MM.RNG.restore=function(snapshot){
    if(snapshot?.legacyState==null)return restoreRng(snapshot);
    const rng=MM.RNG.create(snapshot.seed),state=Number(snapshot.legacyState)|0;
    rng._next=MM.RNG.mulberry32(state);rng.draws=0;
    rng.snapshot=()=>({seed:rng.seed,draws:rng.draws,legacyState:state});
    for(let i=0;i<(snapshot.draws||0);i++)rng.next();
    return rng;
  };
  function migrateLegacy(){
    try{
      if(localStorage.getItem(KEY+'.v4-migrated')||MM.Save.hasActiveRun())return;
      const s=JSON.parse(localStorage.getItem(KEY));
      if(!s||s.v!==1||!s.run?.campRunId||s.run.settled||s.run.tutorialRun||
        !Array.isArray(s.map?.cells)||s.map.cells.length!==s.map.w*s.map.h)return;
      const defaults=MM.State.createRun(s.seed),run=Object.assign(defaults,s.run);
      run.stats=Object.assign({},MM.State.createRun(s.seed).stats,s.run.stats);
      run.runId=run.campRunId;run.mapId='oldMine';
      run.rngLoot=MM.RNG.restore({seed:s.seed+'#loot',legacyState:s.rng});
      const map=Object.assign(new MM.MineMap(s.map.w,s.map.h,MM.mapSpec('oldMine')),s.map);
      map.spec=MM.mapSpec('oldMine');map.mainRouteSet=new Set(map.mainRoutePath.map(c=>c.x+','+c.y));
      if(MM.Save.saveActiveRun(run,map,null))localStorage.setItem(KEY+'.v4-migrated','1');
    }catch(e){console.warn('矿坑旧续玩记录无法迁移，历史成绩仍保留。',e);}
  }
  migrateLegacy();
  function show(m){
    if(panel)return;
    panel=document.createElement('section');panel.className='mine-draft';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','矿工工具箱');
    const heading=document.createElement('h2');heading.textContent='发现矿工工具箱';panel.append(heading);
    const tip=document.createElement('p');tip.textContent='免费三选一 · 只影响本局 · 改造占用现有槽位';panel.append(tip);
    m.run.campDraft.offer.forEach(id=>{
      const card=cards.find(c=>c.id===id),button=document.createElement('button');
      const name=document.createElement('strong'),desc=document.createElement('span');name.textContent=card.name;desc.textContent=card.desc;button.append(name,desc);
      button.onclick=()=>{if(!m.run.campDraft.offer.includes(id))return;
        if(card.upgrade&&!MM.Upgrades.acquire(m.run,id).ok)return;
        if(!card.upgrade)m.run.tools[id]+=card.count;
        m.run.campDraft.chosen.push(id);m.run.campDraft.offer=[];close();MM.Input.consume();save(m);m.addMessage('工具箱：'+card.name,'#f6d18c',4);
      };panel.append(button);
    });document.body.append(panel);panel.querySelector('button').focus();
  }
  const newRun=P.newRun;
  P.newRun=function(){close();newRun.apply(this,arguments);this.run.campRunId=this.run.runId;this.run.campDraft={chosen:[],offer:[]};this.campSaveSignature='';};
  const update=P.update;
  P.update=function(dt){
    if(window.campPaused)return;
    if(this.run.campDraft?.offer.length){MM.Input.consume();show(this);return;}
    update.call(this,dt);
    if(!stable(this))return;
    const d=this.run.campDraft;
    if(d&&!this.run.settled&&d.chosen.length<2&&this.run.maxDepthReached>=[5,15][d.chosen.length]){
      const pool=cards.filter(c=>!c.upgrade||MM.Upgrades.canAcquire(this.run,c.id).ok);
      d.offer=MM.RNG.create(this.seed+'#draft'+d.chosen.length).shuffle(pool).slice(0,3).map(c=>c.id);save(this);show(this);
    }
    const sig=JSON.stringify([this.run.playerX,this.run.playerY,this.run.stats,this.run.tools,this.run.upgrades,this.run.roomChoices,this.run.supplies,this.run.stamina,this.run.settled]);
    if(sig!==this.campSaveSignature){this.campSaveSignature=sig;save(this);}
  };
  const settle=P.settle;
  P.settle=function(){settle.apply(this,arguments);close();save(this);};
  const exit=P.exit;
  P.exit=function(){save(this);close();exit.apply(this,arguments);};
  const draw=P.draw;
  P.draw=function(ctx){draw.call(this,ctx);const equipped=window.CampCosmetics||[];
    if(!this.run||this.run.settled||!equipped.some(id=>id==='pick'||id==='mine-lamp'))return;
    const pos=MM.Player.renderPos(this.run),t=MM.UI.LAYOUT.TILE,p=this.worldToScreen((pos.x+.5)*t,(pos.y+.5)*t);
    if(p.y<MM.UI.LAYOUT.MAP_TOP||p.y>MM.UI.LAYOUT.MAP_BOTTOM)return;
    ctx.save();ctx.strokeStyle=equipped.includes('mine-lamp')?'#64e2e7':'#f3c35e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,t*.42,0,Math.PI*2);ctx.stroke();
    if(equipped.includes('pick')&&this.run.state==='DIGGING'){ctx.fillStyle='#ffe69c';for(let i=0;i<4;i++){const a=this.time*5+i*Math.PI/2;ctx.fillRect(p.x+Math.cos(a)*t*.5-2,p.y+Math.sin(a)*t*.5-2,4,4);}}ctx.restore();
  };
  MM.Adventure={cards,save,key:KEY};
})();
