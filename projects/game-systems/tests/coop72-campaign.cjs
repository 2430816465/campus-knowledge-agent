'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const G=require('../games/coop/src/game-shared'),E=require('../games/coop/src/imported-engine');
const imported=G.LEVELS.filter(l=>l.imported),report={maps:[],mechanics:[]};
assert.equal(imported.length,72);assert.equal(G.modeIndices('normal').length,36);assert.equal(G.modeIndices('hard').length,36);
assert.equal(G.nextLevelIndex(35),null);assert.equal(G.nextLevelIndex(71),null);assert.equal(G.nextLevelIndex(71),null);
assert.equal(G.nextLevelIndex(0),1);assert.equal(G.nextLevelIndex(36),37);
assert.ok(G.isLevelUnlocked(0,[]));assert.ok(G.isLevelUnlocked(36,[]));assert.ok(!G.isLevelUnlocked(1,[]));assert.ok(G.isLevelUnlocked(1,[51]));assert.ok(!G.isLevelUnlocked(37,[51]));
for(const l of imported){
 const raw=fs.readFileSync(path.join(__dirname,'../games/coop/third_party/slf/maps',l.source.path));assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),l.source.sha256);
 for(const group of ['platforms','hazards','boxes','lifts','enemies','pickups','checkpoints']){
  const ids=new Set();for(const o of l[group]){for(const k of ['x','y','w','h'])assert.ok(Number.isFinite(o[k]),l.id+' '+group+' '+k);assert.ok(o.w>0&&o.h>0);if(o.id){assert.ok(!ids.has(o.id));ids.add(o.id);}if(o.path)assert.ok(o.path.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));}
 }
 const w=G.createWorld(G.LEVELS.indexOf(l),1);for(let t=0;t<600;t++)G.stepWorld(w,[{},{ }],1/60);
 assert.ok(w.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.equal(w.phase,'playing');
 report.maps.push({mode:l.mode,number:l.number,respawns:w.respawns,spawnGrounded:w.players.map(p=>p.grounded),width:l.width,height:l.height});
}
function L(extra={}){return Object.assign({imported:true,number:1,width:1280,height:720,spawns:[{x:100,y:644},{x:170,y:644}],platforms:[{x:0,y:700,w:1280,h:20}],boxes:[],lifts:[],enemies:[],pickups:[],checkpoints:[],hazards:[],exit:{x:1200,y:600,w:80,h:100}},extra);}
function run(l,w,a={},b={},n=1){for(let t=0;t<n;t++)E.step(w,[a,b],1/60,l);}
function checked(name,fn){fn();report.mechanics.push(name);}
checked('same normal speed; held jump; second jump only 2P',()=>{
 const l=L(),w=E.create(l,50,1);run(l,w,{}, {},3);run(l,w,{right:true},{right:true},10);assert.equal(w.players[0].vx,w.players[1].vx);
 run(l,w,{jump:true},{jump:true},12);assert.ok(w.players.every(p=>!p.grounded));run(l,w);const y=w.players[1].y;run(l,w,{jumpPressed:true},{jumpPressed:true});assert.equal(w.players[0].jumps,1);assert.equal(w.players[1].jumps,2);assert.ok(w.players[1].y<y);
});
checked('1P dash breaks; ordinary walk does not; 2P cannot dash',()=>{
 const l=L({boxes:[{id:'b',x:300,y:616,w:112,h:84,breakable:true,movable:false}]}),w=E.create(l,50,1);run(l,w,{right:true},{},70);assert.equal(w.boxes[0].hidden,false);run(l,w,{right:true,interactPressed:true},{},1);run(l,w,{right:true},{},20);assert.ok(w.boxes[0].hidden);assert.equal(w.players[1].dash,0);
});
checked('2P pushes small box; blocked teammate never teleports; 1P cannot push',()=>{
 const l=L({spawns:[{x:365,y:644},{x:240,y:644}],boxes:[{id:'b',x:300,y:667.8,w:33.6,h:32.2,movable:true}]}),w=E.create(l,50,1);run(l,w,{}, {right:true},60);assert.equal(w.players[0].y,644);assert.ok(w.boxes[0].x+w.boxes[0].w<=w.players[0].x+11+.01);const x=w.boxes[0].x;run(l,w,{left:true},{},25);assert.equal(w.boxes[0].x,x);
});
checked('carry consent, carrier movement, jump dismount',()=>{
 const l=L({spawns:[{x:100,y:644},{x:135,y:644}]}),w=E.create(l,50,1);run(l,w,{}, {},2);run(l,w,{}, {interactPressed:true});assert.equal(w.players[1].carriedBy,0);run(l,w,{right:true},{},10);assert.equal(w.players[1].x,w.players[0].x);assert.equal(w.players[1].y,w.players[0].y-56);run(l,w,{}, {jumpPressed:true});assert.equal(w.players[1].carriedBy,null);assert.ok(w.players[1].vy<0);assert.equal(w.players[1].jumps,1,'dismount consumes one jump, not two');run(l,w);run(l,w,{}, {jumpPressed:true});assert.equal(w.players[1].jumps,2,'another press can double-jump after dismount');
});
checked('moving path carries both riders; rendered platform state has absolute path position',()=>{
 const l=L({spawns:[{x:310,y:544},{x:360,y:544}],lifts:[{id:'m',x:300,y:600,w:140,h:28,speed:56,movementType:5,path:[{x:300,y:600},{x:300,y:200}]}]}),w=E.create(l,50,1);w.players.forEach(p=>p.grounded=true);run(l,w,{}, {},80);assert.equal(w.respawns,0);assert.ok(w.lifts[0].y<600);w.players.forEach(p=>assert.ok(Math.abs(p.y+56-w.lifts[0].y)<.01));
});
checked('patrol pause is authoritative, hazard resets pair and state',()=>{
 const l=L({enemies:[{id:'e',x:225,y:642.6,w:14,h:57.4,speed:56,minX:225,maxX:300}]}),w=E.create(l,50,1);run(l,w,{}, {interactPressed:true});assert.ok(w.enemies[0].paused>1.9);const x=w.enemies[0].x;run(l,w,{}, {},30);assert.equal(w.enemies[0].x,x);l.hazards.push({x:100,y:644,w:30,h:56});run(l,w);assert.equal(w.respawns,1);assert.equal(w.players[1].x,170);assert.deepEqual(w.players[0].input,{});
});
checked('common checkpoint snapshots; paired exit only once',()=>{
 const l=L({checkpoints:[{id:'a',slot:0,x:100,y:600,w:30,h:100},{id:'b',slot:1,x:170,y:600,w:30,h:100}]}),w=E.create(l,50,1);run(l,w,{}, {},3);assert.ok(w.checkpointId.startsWith('shared'));w.players[0].x=1100;E.respawn(w);assert.equal(w.players[0].x,100);w.players[0].x=1210;run(l,w);assert.equal(w.phase,'playing');w.players[1].x=1230;run(l,w);assert.equal(w.phase,'intermission');const tick=w.tick;run(l,w,{}, {},20);assert.equal(w.tick,tick);
});
fs.mkdirSync(path.join(__dirname,'../screenshots/imported-72'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../screenshots/imported-72/data-mechanics-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({maps:report.maps.length,mechanics:report.mechanics,unverified:'72 full routes are not covered by load or fixture tests'},null,2));
