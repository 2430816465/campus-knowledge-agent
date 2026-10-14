const assert=require('node:assert/strict');
const G=require('../games/coop/src/game-shared.js');
const {Session}=require('../games/coop/src/solo.js');

function targetFor(level,task){
  if(task.kind==='exit')return level.roleExits[task.slot];
  return [...level.plates,...level.switches,...level.crystals].find(x=>x.id===task.id);
}
function navigate(world,slot,target,kind){
  const level=G.stageFor(world),p=world.players[slot],feet=p.y+56;
  let tx=target.x+target.w/2-18;
  const ty=kind==='crystal'?target.y+52:target.y+target.h;
  if(kind!=='waypoint'&&level.gallery&&ty<600&&feet>ty+10){
    const right=p.x>640;
    const base=p.grounded?feet:p.lastSupportY;
    const stage=Math.max(0,Math.min(4,Math.round((640-base)/80)));
    tx=(right?1240-stage*80:40+stage*80)-18;
    return navigate(world,slot,{x:tx,y:(560-stage*80)-56,w:36,h:56},'waypoint');
  }
  if(level.gallery&&ty>feet+100&&feet<590)tx=level.galleryLayout.gapX+level.galleryLayout.gapW/2-18;
  const dx=tx-p.x,dir=Math.sign(dx),input={left:dx<-3,right:dx>3};
  if(Math.abs(dx)<5&&Math.abs(feet-ty)<6){
    input.left=input.right=false;
    if(kind==='switch')input.interactPressed=true;
    return input;
  }
  if(p.grounded){
    const solids=G.solidRects(world,{playerIndex:slot});
    const wall=solids.some(s=>s.y<feet-8&&s.y>=feet-111&&s.y+s.h>p.y&&
      (dir>0?s.x-(p.x+33)>=-4&&s.x-(p.x+33)<(s.balcony?80:40):(p.x+3)-(s.x+s.w)>=-4&&(p.x+3)-(s.x+s.w)<(s.balcony?80:40)));
    const pool=level.hazards.some(h=>h.kind&&h.safeRole!==slot&&Math.abs(h.y+7-feet)<8&&
      (dir>0?h.x-(p.x+33)>=-4&&h.x-(p.x+33)<34:(p.x+3)-(h.x+h.w)>=-4&&(p.x+3)-(h.x+h.w)<34));
    const probe=dir>0?p.x+33+24:p.x+3-24;
    const support=solids.filter(s=>probe>=s.x&&probe<=s.x+s.w&&s.y>=feet-4).sort((a,b)=>a.y-b.y)[0];
    const drop=ty<=feet+4&&(level.gallery||Math.abs(dx)<240)&&(!support||support.y>feet+35);
    if(wall||pool||(level.gallery&&drop)||(ty<feet-8&&Math.abs(dx)<110))input.jumpPressed=true;
  }
  return input;
}
function solve(index,solo=false){
  let level=G.LEVELS[index];const storage=new Map();
  const s=new Session({getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)});
  s.start(index);const w=s.world;let taskIndex=0,lastTask=-1,taskTicks=0,room=0;
  for(let t=0;t<42000&&w.phase==='playing';t++){
    if((w.roomIndex||0)!==room){room=w.roomIndex;level=G.stageFor(w);taskIndex=0;lastTask=-1;}
    const task=level.solution[Math.min(taskIndex,level.solution.length-1)],target=targetFor(level,task);
    if(lastTask!==taskIndex){lastTask=taskIndex;taskTicks=0;}taskTicks++;
    const p=w.players[task.slot];
    const done=task.kind==='switch'||task.kind==='crystal'?w.flags[target.key]:
      task.kind==='plate'?w.plates[target.id]&&((p.grounded&&G.rectsOverlap({x:p.x+4,y:p.y+51,w:28,h:7},target))||w.boxes.some(b=>G.rectsOverlap(b,target))):G.rectsOverlap(G.bodyRect(p),target)&&p.grounded;
    if(done&&taskIndex<level.solution.length-1){taskIndex++;continue;}
    const input=navigate(w,task.slot,target,task.kind);
    if(solo){if(s.active!==task.slot)s.switchPlayer();s.setInput(input);s.step();}
    else{const pair=[{},{}];pair[task.slot]=input;G.stepWorld(w,pair,1/60);}
    if(taskTicks>2200||w.fall){
      throw Error(JSON.stringify({level:level.id,solo,taskIndex,task,target,players:w.players.map(p=>({x:p.x,y:p.y,grounded:p.grounded,vy:p.vy})),flags:w.flags,message:w.message,ticks:taskTicks}));
    }
  }
  assert.equal(w.phase,'intermission','authored route '+(index+1));
  assert.equal(w.safeRun,true,'no hidden deaths along solution '+(index+1));
  assert(level.exitRequires.every(key=>w.flags[key]));
  return Math.round(w.elapsed);
}
function regressions(){
  // Drop from the upper LEFT LEDGE, with the lower bridge open and upper bridge absent.
  for(const slot of[0,1])for(const leap of[false,true]){
    const w=G.createWorld(1,1);w.flags.lowerBridge=true;
    Object.assign(w.players[slot],{x:390,y:244,grounded:true,vy:0});
    for(let t=0;t<90;t++){const inputs=[{},{}];inputs[slot]={right:t<35,jumpPressed:leap&&t===0};G.stepWorld(w,inputs,1/60);}
    assert.equal(w.safeRun,true);assert.equal(w.fall,undefined);assert.equal(w.players[slot].y,484);assert(w.players[slot].grounded);
  }
  // Walking off the same ledge when BOTH bridges are absent really falls.
  {const w=G.createWorld(1,1);Object.assign(w.players[0],{x:390,y:244,grounded:true});
    for(let t=0;t<90&&!w.fall;t++)G.stepWorld(w,[{right:t<35},{}],1/60);
    assert.equal(w.fall?.slot,0);const cp=structuredClone(w.checkpointState.players);
    while(w.fall)G.stepWorld(w,[{},{}],1/60);assert.deepEqual(w.players.map(p=>[p.x,p.y]),cp.map(p=>[p.x,p.y]));}
  // Ignore titles, level IDs, flag names and decoration. Distinctness must come
  // from geometry, role ownership and dependency structure, not renamed data.
  const geometry=l=>JSON.stringify((l.rooms||[l]).map(stage=>{
    const groups=['platforms','hazards','bridges','gates','plates','switches','crystals','roleExits','boxes','lifts'];
    const keys=[...new Set(groups.flatMap(g=>(stage[g]||[]).flatMap(o=>[o.key,o.lockKey,...(o.requires||[])])).filter(Boolean))];
    const values=['x','y','w','h','role','kind','safeRole','oneWay','key','lockKey','requires','top','bottom','poweredBy'];
    return groups.map(g=>(stage[g]||[]).map(o=>Object.fromEntries(values.filter(k=>o[k]!=null).map(k=>[k,
      ['key','lockKey'].includes(k)?keys.indexOf(o[k]):k==='requires'?o[k].map(v=>keys.indexOf(v)):o[k]]))));
  }));
  assert.equal(new Set(G.LEVELS.map(geometry)).size,50,'no exact maps reused');
  assert.notEqual(geometry(G.LEVELS[1]),geometry(G.LEVELS[9]));
  assert.equal(require('../games/coop/src/campaign-catalog.js').length,50);
  // Old checkpoint migration keeps purchased progress and receipt IDs, starts new geometry.
  {const old=G.createWorld(9,7);delete old.campaignVersion;old.players[0].x=777;const saved={version:1,progress:{coins:123,cleared:[1,2,3,10],marks:{}},world:old,active:1,award:null};
    const restored=new Session({getItem:()=>JSON.stringify(saved),setItem:()=>{}});assert.equal(restored.progress.coins,123);assert.deepEqual(restored.progress.cleared,[1,2,3,10]);assert.equal(restored.world.players[0].x,G.LEVELS[9].spawns[0].x);}
}
if(require.main===module){
  regressions();const result=[];
  for(let i=3;i<50;i++){const seconds=solve(i),soloSeconds=solve(i,true);result.push({id:i+1,seconds,soloSeconds});console.log('PASS',i+1,G.LEVELS[i].title,seconds+'s',soloSeconds+'s solo');}
  require('node:fs').mkdirSync('artifacts/coop-remake',{recursive:true});require('node:fs').writeFileSync('artifacts/coop-remake/routes.json',JSON.stringify(result,null,2));
  console.log('PASS: upper-to-lower bridge drop, true abyss, 50 unique maps, save migration, 47 duo + 47 serial solo routes using normal inputs.');
}
const routes=new Map();
function controller(world,slot){
  const tag=world.run+':'+world.levelIndex;
  let route=routes.get(tag);
  if(!route||(world.roomIndex||0)!==route.room||world.tick<route.tick){route={room:world.roomIndex||0,task:0,tick:world.tick};routes.set(tag,route);}
  route.tick=world.tick;
  const level=G.stageFor(world);
  while(route.task<level.solution.length-1){
    const task=level.solution[route.task],target=targetFor(level,task),p=world.players[task.slot];
    const done=task.kind==='switch'||task.kind==='crystal'?world.flags[target.key]:
      task.kind==='plate'?world.plates[target.id]&&((p.grounded&&G.rectsOverlap({x:p.x+4,y:p.y+51,w:28,h:7},target))||world.boxes.some(b=>G.rectsOverlap(b,target))):G.rectsOverlap(G.bodyRect(p),target)&&p.grounded;
    if(!done)break;route.task++;
  }
  const task=level.solution[route.task];
  return task.slot===slot?navigate(world,slot,targetFor(level,task),task.kind):{};
}
function debugRoute(world){return routes.get(world.run+':'+world.levelIndex);}
module.exports={navigate,solve,regressions,targetFor,controller,debugRoute};
