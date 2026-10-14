// Read only public/local game state; never touch physics, cards, or gameplay wallets.
const sum=v=>typeof v==='number'?v:Array.isArray(v)?v.reduce((n,x)=>n+sum(x),0):v&&typeof v==='object'?Object.values(v).reduce((n,x)=>n+sum(x),0):0;
const size=v=>Array.isArray(v)?v.length:Number(v)||0;
export function progressSnapshot(mode,w){
 const s=JSON.parse(w.render_game_to_text?.()||'{}');
 if(mode==='tower'){
  const g=w.MT?.Game?.G;if(!g)return null;
  const tiles=(g.grids?.[g.floor]||[]).flat().filter(x=>x!=='.'&&x!==0&&x!==' ').length;
  return {playing:!g.dead&&!g.won&&!g.busy&&!s.modal,key:g.campRunId,metrics:{floor:g.floor,tiles:-tiles,wealth:g.hero?.gold||0},area:g.floor,positions:[{x:(g.pos?.x||0)*32,y:(g.pos?.y||0)*32}]};
 }
 if(mode==='mine')return {playing:['EXPLORING','MOVING','DIGGING','ROOM_DISCOVERY','TREASURE_DISCOVERY'].includes(s.state)&&!s.settled&&!s.modal,metrics:{digs:s.stats?.digActions||0},key:s.runId,area:s.runId};
 if(mode==='evolve')return {playing:s.phase==='playing'&&!s.paused&&s.screen==='play'&&!s.orientationBlocked,key:s.id,metrics:{eaten:s.eaten||0},area:s.id};
 if(mode==='marble'){
  if(w.Marble?.run){const r=w.Marble.run;return {playing:!!w.CampEconomyState?.().playing,key:r.id,metrics:{kills:r.kills||0,shots:r.shot||0},area:r.id};}
  return {playing:!s.view&&['playing','play','aim','flight','aiming','flying'].includes(s.phase||s.screen),key:'puzzle',metrics:{level:s.level||s.index||0,shots:s.shotsUsed||0,removed:size(s.removed)},area:s.level||s.index||0};
 }
 if(mode==='nightwatch')return {playing:s.view==='battle'&&s.battle?.status==='playing'&&!s.battle.paused,key:s.battle?.runId,metrics:{kills:s.battle?.kills||0},area:s.battle?.runId};
 if(mode==='rush')return {playing:s.screen==='playing'&&s.battle?.status==='playing'&&!s.hostPaused,key:s.battle?.mode==='defense'?'rush-defense':s.battle?.stage,metrics:{kills:s.battle?.kills||0,passed:size(s.battle?.passed)},area:s.battle?.mode==='defense'?'rush-defense':s.battle?.stage};
 if(mode==='workshop')return {playing:s.screen==='play'&&!s.paused&&!s.tutorial?.active,key:'bakery',metrics:{crafted:sum(s.crafted),delivered:size(s.deliveries),served:s.shop?.served||0,trips:s.shop?.trips||0},area:'bakery'};
 if(mode==='coop'){
  const c=w.CampCoop?.snapshot?.();if(!c?.world)return null;const g=c.world;
  return {playing:c.phase==='playing'&&s.page==='game'&&!s.soloPaused&&!w.campPaused,key:'coop',metrics:{level:g.levelIndex,flags:Object.values(g.flags||{}).filter(Boolean).length},area:g.levelIndex,positions:g.players};
 }
 if(['chess','liars'].includes(mode)){
  const g=s.game;if(!g)return null;const own=g.players?.[s.seat];
  return {playing:['playing','bidding','potion','tribute','claim'].includes(g.phase),key:s.room||mode,metrics:{ownPlays:own?.plays||0,revision:g.revision||g.round||0},area:g.round||0,human:true};
 }
 return null;
}
export class EconomyObserver{
 constructor(mode,frame,options){this.mode=mode;this.frame=frame;this.options=options;this.id=crypto.randomUUID();this.seconds=0;this.units=0;this.last=performance.now();this.lastInput=-Infinity;this.paused=false;this.previous=null;this.bound=false;this.counted=new Set();this.visited=new Set();this.reward=0;this.input=()=>{this.lastInput=performance.now();};}
 start(){this.timer=setInterval(()=>this.sample(),2000);}
 sample(){
  const now=performance.now(),dt=Math.min(2.5,(now-this.last)/1000);this.last=now;
  try{
   const w=this.frame.contentWindow;if(!w||!this.options.onProgress)return;
   if(!this.bound){for(const name of ['pointerdown','pointermove','keydown','touchstart'])w.document.addEventListener(name,this.input,{passive:true});this.bound=true;}
   const current=progressSnapshot(this.mode,w);if(!current)return;
   const active=!this.paused&&!document.hidden&&current.playing&&now-this.lastInput<60000;
   if(!this.previous||current.area!==this.previous.area)for(const p of current.positions||[])this.visited.add(current.area+':'+Math.floor(p.x/32)+':'+Math.floor(p.y/32));
   if(this.previous&&active){
    this.seconds+=dt;
    for(const p of current.positions||[]){const key=current.area+':'+Math.floor(p.x/32)+':'+Math.floor(p.y/32);if(!this.visited.has(key)){this.visited.add(key);this.units++;}}
    if(current.area===this.previous.area){
     for(const [name,v] of Object.entries(current.metrics)){const delta=Math.max(0,v-(this.previous.metrics[name]||0));
      // A table revision counts only shortly after actual player interaction.
      if(current.human&&name==='revision'&&now-this.lastInput>3500)continue;
      this.units+=Math.min(20,Math.floor(delta));
     }
    }
   }
   this.previous=current;
   if(this.seconds>=30)this.save();
  }catch(error){this.options.onEconomyError?.(error);}
 }
 finish(result){this.sample();const key=result.runId;if(!this.counted.has(key)&&result.win){this.counted.add(key);this.units+=3;}
  if(this.seconds>=30)this.save();
  return {...result,reward:{...result.reward,sessionId:this.id}};
 }
 save(){const result=this.options.onProgress({id:this.id,mode:this.mode,seconds:Math.floor(this.seconds),units:this.units});this.reward=result.reward;this.frame.contentWindow?.postMessage({source:'camp-host',command:'wallet-progress',earned:this.reward,balance:this.options.getBalance?.()},location.origin);}
 setPaused(value){this.sample();this.paused=value;}
 stop(){this.sample();clearInterval(this.timer);try{for(const name of ['pointerdown','pointermove','keydown','touchstart'])this.frame.contentWindow?.document.removeEventListener(name,this.input);}catch{}}
}
