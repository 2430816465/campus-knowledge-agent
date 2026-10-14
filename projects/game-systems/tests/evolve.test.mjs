import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EvolutionGame} from '../games/evolve/state.js';
import {PondRenderer} from '../games/evolve/render.js';
import {WORLD,radius,followerRadius,POPULATION,MAX_ENTITIES,MAX_FOLLOWERS,MAX_LEVEL,PLAYER_SPEED,difficulty,LEGACY_LEVELS,rewardFor} from '../games/evolve/data.js';
const CX=WORLD.width/2,CY=WORLD.height/2;
const game=(level=1)=>{const g=new EvolutionGame();g.newRun(4321,'test-run');g.run.level=level;g.run.entities=[];g.run.shield=0;g.run.spawnClock=0;return g;};
const food=(g,level,x=g.run.player.x,y=g.run.player.y)=>({id:++g.run.serial,level,x,y,angle:0,age:0,turn:0});
const mass=g=>3**(g.run.level-1)+g.run.followers.reduce((sum,f)=>sum+3**(f.level-1),0);
function fullSquad(){const g=game(19);for(let level=1;level<19;level++)for(let i=0;i<2;i++)g.eat(food(g,level));g.eat(food(g,19));g.placeFollowers(1);return g;}
test('body plus two equals evolve, keeping unused lower companions and removing XP',()=>{
 const g=game(5);g.eat(food(g,1));g.eat(food(g,5));assert.equal(g.run.level,5);assert.equal(g.describe().sameCollected,1);assert.equal(g.run.followers.length,2);g.eat(food(g,5));assert.equal(g.run.level,6);assert.deepEqual(g.run.followers.map(f=>f.level),[1]);assert.equal(g.run.sameEaten,2);assert.equal(g.run.xp,undefined);assert(!('required' in g.describe()));
});
test('three identical lower companions merge; mixed levels cannot replace missing material',()=>{
 const g=game(5);for(const level of [1,2,1])g.eat(food(g,level));assert.equal(g.run.level,5);assert.equal(g.run.followers.length,3);g.eat(food(g,1));assert.deepEqual(g.run.followers.map(f=>f.level),[2,2]);assert.equal(g.run.level,5);
});
test('lower triples cascade into same-tier material and then into the body',()=>{
 const g=game(3);for(const level of [2,2,1,1])g.eat(food(g,level));g.eat(food(g,1));assert.equal(g.run.level,3);assert.deepEqual(g.run.followers.map(f=>f.level),[3]);assert.equal(g.describe().sameCollected,1);for(let i=0;i<9;i++)g.eat(food(g,1));assert.equal(g.run.level,4);assert.equal(g.run.followers.length,0);
});
test('long mixed-food routes conserve material and keep every unfinished triple across reloads',()=>{
 const g=game(4);for(let i=0;i<500;i++){const level=1+i%Math.min(6,g.run.level),before=mass(g);g.eat(food(g,level));assert.equal(mass(g),before+3**(level-1));assert(g.run.followers.length<=MAX_FOLLOWERS);for(let lv=1;lv<g.run.level;lv++)assert(g.run.followers.filter(f=>f.level===lv).length<3);assert(g.describe().sameCollected<2);assert(new EvolutionGame(g.snapshot()).run);}
});
test('all nineteen transitions require two additional equals, with ten an intermediate form',()=>{
 const g=game();for(let level=1;level<MAX_LEVEL;level++){g.eat(food(g,level));assert.equal(g.run.level,level);g.eat(food(g,level));assert.equal(g.run.level,level+1);assert.equal(g.run.phase,level===19?'result':'playing');}assert.equal(g.run.eaten,38);assert(g.run.win);
});
test('predator below body level eats only a lower companion and preserves other material',()=>{
 const g=game(5);g.eat(food(g,1));g.eat(food(g,5));g.placeFollowers(1);const f=g.run.followers.find(f=>f.level===1);g.run.entities=[food(g,2,f.x-8,f.y)];g.update(.001);assert.equal(g.run.phase,'playing');assert.equal(g.run.level,5);assert.deepEqual(g.run.followers.map(f=>f.level),[5]);assert.equal(g.describe().sameCollected,1);assert.equal(g.run.revived,false);
});
test('equal or lower wild creatures cannot eat companions, and companions cannot actively eat',()=>{
 for(const enemyLevel of [1,2]){const g=game(5);g.eat(food(g,2));g.placeFollowers(1);const f=g.run.followers[0];g.run.entities=[food(g,enemyLevel,f.x-8,f.y)];g.update(.001);assert.equal(g.run.followers.length,1);assert.equal(g.run.eaten,1);assert.equal(g.run.entities.length,1);}
});
test('same-tier material may be consumed without body death, reducing the actual merge count',()=>{
 const g=game(5);g.eat(food(g,5));g.placeFollowers(1);const f=g.run.followers[0];g.run.entities=[food(g,6,f.x-25,f.y)];g.update(.001);assert.equal(g.run.phase,'playing');assert.equal(g.run.followers.length,0);assert.equal(g.describe().sameCollected,0);assert.equal(g.run.level,5);g.eat(food(g,5));assert.equal(g.run.level,5);
});
test('body still dies on a higher enemy; protection covers body and squad',()=>{
 const g=game(5);g.eat(food(g,1));g.placeFollowers(1);g.run.shield=4;g.run.entities=[food(g,6)];g.update(.001);assert.equal(g.run.phase,'playing');assert.equal(g.run.followers.length,1);g.run.shield=0;g.update(.001);assert.equal(g.run.phase,'fallen');assert.match(g.run.cause,/主角/);
});
test('one revival preserves remaining material, clears threats and persists the used opportunity',()=>{
 const g=game(5);g.eat(food(g,5));g.run.entities=[food(g,6)];g.fall(g.run.entities[0]);assert(g.revive());assert.equal(g.run.level,5);assert.equal(g.describe().sameCollected,1);assert.equal(g.run.entities.length,0);assert.equal(g.run.shield,4);const restored=new EvolutionGame(g.snapshot());assert(restored.run.revived);restored.run.shield=0;restored.fall(food(restored,6));assert.equal(restored.revive(),false);
});
test('starter pond has abundant ones, a few diverse higher tiers and safe spawns',()=>{
 assert.equal(WORLD.width*WORLD.height,1400*1000*9);for(let level=1;level<20;level++)assert(radius(level+1)>radius(level));assert(radius(20)>radius(1)*10);for(const seed of [1,42,92,792,4321]){const g=new EvolutionGame();g.newRun(seed,'density');assert.equal(g.run.entities.length,POPULATION);assert(g.run.entities.filter(e=>e.level===1).length>=170);assert(g.run.entities.filter(e=>e.level>1).length<=7);for(const level of [2,5,9,14,20])assert(g.run.entities.some(e=>e.level===level));assert(g.run.entities.every(e=>Math.hypot(e.x-g.run.player.x,e.y-g.run.player.y)>radius(1)+radius(e.level)+140));}
});
test('late ponds and repeated refills retain over ninety percent lower creatures, at most two equals',()=>{
 for(const level of [2,5,10,15,19])for(const seed of [1,42,792]){const g=game(level);g.run.seed=seed;g.fillPopulation(POPULATION);for(let cycle=0;cycle<8;cycle++){const es=g.run.entities;assert(es.filter(e=>e.level<level).length>=es.length*.9);assert(es.filter(e=>e.level===level).length<=2);assert(es.filter(e=>e.level>level).length<=9);g.run.entities=es.slice(8);g.run.elapsed+=20;g.run.foodClock=50;g.refreshPopulation();assert(g.run.entities.length<=MAX_ENTITIES);}assert(g.run.entities.filter(e=>e.level<=Math.min(4,level-1)).length>g.run.entities.length*.2);}
});
test('rare equals can refill a second material and are not deliberately placed beside the body',()=>{
 const g=game(19);g.fillPopulation(180);g.run.entities=g.run.entities.filter(e=>e.level!==19);g.run.foodClock=difficulty(19).foodInterval;g.refreshPopulation();assert.equal(g.run.entities.filter(e=>e.level===19).length,1);g.run.foodClock=difficulty(19).foodInterval;g.refreshPopulation();assert.equal(g.run.entities.filter(e=>e.level===19).length,2);assert(g.run.entities.filter(e=>e.level===19).every(e=>Math.hypot(e.x-CX,e.y-CY)>radius(19)*2+140));
});
test('crowded old populations rebalance remotely even at the absolute entity cap',()=>{
 const g=game(10);g.run.player={x:700,y:1500,angle:0};g.visibleArea={x:0,y:900,width:1200,height:1000};const visible={...food(g,20,950,1300),age:30};g.run.entities=[visible];for(let i=1;i<MAX_ENTITIES;i++)g.run.entities.push({...food(g,i%2?20:10,1800+i%20*105,300+Math.floor(i/20)*190),age:30});const high=g.run.entities.filter(e=>e.level>10).length,same=g.run.entities.filter(e=>e.level===10).length;g.refreshPopulation();assert(g.run.entities.includes(visible));assert(g.run.entities.filter(e=>e.level>10).length<high||g.run.entities.filter(e=>e.level===10).length<same);assert(g.run.entities.some(e=>e.level<10));assert.equal(g.run.entities.length,MAX_ENTITIES);
});
test('pause, seeded RNG, fixed movement speed and independent high-tier wandering remain intact',()=>{
 const a=new EvolutionGame(),b=new EvolutionGame();a.newRun(92,'same');b.newRun(92,'same');assert.deepEqual(a.snapshot(),b.snapshot());a.paused=true;const before=a.snapshot();a.update(.03);assert.deepEqual(a.snapshot(),before);const c=game(3),d=game(3);c.run.player={x:1200,y:900,angle:0};d.run.player={x:1750,y:900,angle:0};c.run.shield=d.run.shield=10;const enemy={id:1,level:10,x:1500,y:900,angle:Math.PI/2,age:0,turn:.6,alert:true};c.run.entities=[structuredClone(enemy)];d.run.entities=[structuredClone(enemy)];d.eat(food(d,1));for(let i=0;i<25;i++){c.update(.02);d.update(.02);}assert.deepEqual(c.run.entities,d.run.entities);assert.equal(c.run.entities[0].alert,false);for(const level of [1,6,11,16,19]){const g=game(level);if(level>1)g.eat(food(g,1));assert.equal(g.speed(),PLAYER_SPEED);const start=g.run.player.x;g.keys={x:1,y:0};for(let i=0;i<10;i++)g.update(.02);assert(Math.abs(g.run.player.x-start-PLAYER_SPEED*.2)<.001);}
});
test('maximum canonical squad fits every facing and retains distinct collision space',()=>{
 const g=fullSquad();assert.equal(g.run.followers.length,37);for(let i=0;i<16;i++){g.run.player.angle=i*Math.PI/8;const b=g.bounds();assert(b.minX<b.maxX);assert(b.minY<b.maxY);assert(b.minX<CX&&b.maxX>CX);assert(b.minY<CY&&b.maxY>CY);g.placeFollowers(1);for(let j=0;j<g.run.followers.length;j++)for(let k=j+1;k<g.run.followers.length;k++){const a=g.run.followers[j],b=g.run.followers[k];assert(Math.hypot(a.x-b.x,a.y-b.y)>=followerRadius(a.level,g.run.level)+followerRadius(b.level,g.run.level)-1);}}
});
test('camera contains maximum squad through turns and mouse targeting matches CSS scaling',()=>{
 const g=fullSquad(),renderer=Object.create(PondRenderer.prototype);renderer.width=800;renderer.height=360;renderer.canvas={getBoundingClientRect:()=>({left:10,top:20,width:400,height:180})};for(let i=0;i<16;i++){g.run.player.angle=i*Math.PI/8;g.placeFollowers(1);renderer.view(g);const c=renderer.camera,v=renderer.viewport;for(const member of [g.describe().player,...g.describe().followers]){assert(member.x-member.r>=c.x);assert(member.x+member.r<=c.x+c.width);assert(member.y-member.r>=c.y);assert(member.y+member.r<=c.y+c.height);}const p=g.run.player,world=renderer.toWorld(10+(v.x+(p.x-c.x)*v.scale)/2,20+(v.y+(p.y-c.y)*v.scale)/2);assert(Math.abs(world.x-p.x)<.001);assert(Math.abs(world.y-p.y)<.001);}
});
test('unfinished same-tier triple persists; reload never merges it a second time',()=>{
 const g=game(5);g.eat(food(g,1));g.eat(food(g,5));const saved=g.snapshot();assert.equal(saved.version,3);assert(!('xp' in saved));const restored=new EvolutionGame(saved);assert.deepEqual(restored.snapshot(),saved);assert.equal(restored.describe().sameCollected,1);restored.eat(food(restored,5));assert.equal(restored.run.level,6);assert.deepEqual(restored.run.followers.map(f=>f.level),[1]);
});
test('old twenty-tier XP migrates visible companions once without inventing XP material',()=>{
 const g=game(5),saved=g.snapshot();saved.version=2;saved.xp=6;saved.followers=[1,1,1,2].map(level=>({level,x:CX-100,y:CY}));saved.revived=true;const restored=new EvolutionGame(saved);assert.equal(restored.run.level,5);assert.deepEqual(restored.run.followers.map(f=>f.level),[2,2]);assert(!('xp' in restored.run));assert(restored.run.revived);assert.equal(restored.run.id,saved.id);assert.deepEqual(new EvolutionGame(restored.snapshot()).snapshot(),restored.snapshot());
});
test('old ten-tier identities, enlarged coordinates and pending rewards survive migration',()=>{
 for(let oldLevel=1;oldLevel<=10;oldLevel++){const g=game(oldLevel),saved=g.snapshot();saved.version=1;saved.xp=oldLevel>1?2:0;saved.phase=oldLevel===10?'result':'fallen';saved.win=oldLevel===10;saved.eaten=32;saved.revived=true;saved.claimed=oldLevel===10;saved.killerLevel=Math.min(10,oldLevel+1);if(oldLevel>1)saved.followers=[{level:oldLevel-1,x:CX-80,y:CY}];const restored=new EvolutionGame(saved);assert(restored.run);assert.equal(restored.run.level,LEGACY_LEVELS[oldLevel-1]);assert.equal(restored.run.killerLevel,LEGACY_LEVELS[saved.killerLevel-1]);assert(restored.run.revived);assert.equal(restored.run.claimed,saved.claimed);assert(!('xp' in restored.run));if(oldLevel>1)assert.equal(restored.run.followers[0].level,LEGACY_LEVELS[oldLevel-2]);if(saved.phase==='result'){assert.equal(restored.result().reward.rulesVersion,1);assert.equal(restored.result().reward.total,36);}assert.deepEqual(new EvolutionGame(restored.snapshot()).snapshot(),restored.snapshot());}const g=game(5),saved=g.snapshot();saved.version=2;saved.xp=2;saved.player={x:700,y:500,angle:0};delete saved.worldVersion;const restored=new EvolutionGame(saved);assert.equal(restored.run.player.x,CX);assert.equal(restored.run.player.y,CY);
});
test('victory, pending settlement, rewards and corrupt-save rejection remain valid',()=>{
 const g=game(19);g.run.eaten=20;g.eat(food(g,19));g.eat(food(g,19));assert.equal(g.run.level,20);assert.equal(g.run.phase,'result');assert(g.run.win);const result=g.result();assert.equal(result.reward.total,35);assert.equal(result.reward.rulesVersion,2);assert.equal(g.finish(false),false);assert.deepEqual(new EvolutionGame(g.snapshot()).result(),result);assert.equal(rewardFor({eaten:4,level:19,win:false}),0);assert.equal(rewardFor({eaten:500,level:20,win:true}),36);const corrupt=game(3).snapshot();corrupt.followers=[{level:99,x:20,y:20}];assert.equal(new EvolutionGame(corrupt).run,null);corrupt.followers=[];corrupt.player.x=Infinity;assert.equal(new EvolutionGame(corrupt).run,null);
});

test('lower food shifts upward gradually while preserving early tiers and never reaching the body tier',()=>{
 let previousMean=0,previousEarly=1.1;
 for(const level of [5,10,15,19]){const g=game(level);g.run.seed=792;const tally=Array(21).fill(0),count=30000;for(let i=0;i<count;i++){const tier=g.lowerLevel();assert(tier>=1&&tier<level);tally[tier]++;}const mean=tally.reduce((sum,n,tier)=>sum+n*tier,0)/count,early=tally.slice(1,5).reduce((sum,n)=>sum+n,0)/count;assert(mean>previousMean+1);assert(early<previousEarly);assert(early>.3);assert(tally.slice(1,level).every(n=>n>0));previousMean=mean;previousEarly=early;}
 const g=game(10);g.fillPopulation(180);const existing=structuredClone(g.run.entities);g.run.level=19;g.fillPopulation(220);assert.deepEqual(g.run.entities.slice(0,180),existing);
});
test('same-tier follower has body-sized occupancy and corresponding predator collision',()=>{
 const g=game(5);g.eat(food(g,5));g.placeFollowers(1);const f=g.run.followers[0];assert.equal(g.describe().followers[0].r,g.describe().player.r);g.run.entities=[food(g,6,f.x-radius(6)-radius(5)+6,f.y)];g.update(0);assert.equal(g.run.followers.length,0);assert.equal(g.run.phase,'playing');
});

test('companions occupy all sides in stable rings and stay inside the shore at every corner',()=>{
 const small=game(10);for(const level of [1,2,3,4])small.eat(food(small,level));small.placeFollowers(1);const slots=small.formation();assert(slots.some(o=>o.x<0)&&slots.some(o=>o.x>0)&&slots.some(o=>o.y<0)&&slots.some(o=>o.y>0));const angles=slots.map(o=>Math.atan2(o.y,o.x)).sort((a,b)=>a-b);for(let i=0;i<angles.length;i++){const gap=(angles[(i+1)%angles.length]-angles[i]+Math.PI*2)%(Math.PI*2);assert(gap>Math.PI/3&&gap<Math.PI*2/3);}small.run.player.angle=Math.PI;assert.deepEqual(small.formation(),slots);
 const g=fullSquad(),counts=[0,0,0,0];for(const o of g.formation()){counts[(o.x<0?1:0)+(o.y<0?2:0)]++;assert(Math.hypot(o.x,o.y)>=radius(g.run.level)+o.r+24);}assert(counts.every(n=>n>=5));
 for(const x of [WORLD.margin,WORLD.width-WORLD.margin])for(const y of [WORLD.margin,WORLD.height-WORLD.margin]){const b=g.bounds();g.run.player.x=Math.max(b.minX,Math.min(b.maxX,x));g.run.player.y=Math.max(b.minY,Math.min(b.maxY,y));g.placeFollowers(1);const squad=[g.describe().player,...g.describe().followers];for(const m of squad){assert(m.x-m.r>=WORLD.margin-.01);assert(m.x+m.r<=WORLD.width-WORLD.margin+.01);assert(m.y-m.r>=WORLD.margin-.01);assert(m.y+m.r<=WORLD.height-WORLD.margin+.01);}for(let i=0;i<squad.length;i++)for(let j=i+1;j<squad.length;j++)assert(Math.hypot(squad[i].x-squad[j].x,squad[i].y-squad[j].y)>=squad[i].r+squad[j].r+23);}
});
