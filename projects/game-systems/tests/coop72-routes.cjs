'use strict';
const assert=require('node:assert/strict'),G=require('../games/coop/src/game-shared');
const routes=new Map();
function controller(w,i){
 const key=w.levelIndex+':'+w.run+':'+w.respawns;
 if(!routes.has(key))routes.set(key,[{stage:0},{stage:0}]);
 const r=routes.get(key)[i],p=w.players[i],input={},box=w.boxes.find(b=>b.movable),toward=x=>{if(p.x<x-3)input.right=true;else if(p.x>x+3)input.left=true;};
 if(w.levelIndex===36)return hardController(w,i,r,p,input,box,toward);
 if(i===0){
  if(r.stage===0){toward(590);if(p.x>230&&!w.boxes[0].hidden&&p.cooldown<=0)input.interactPressed=true;if(p.x>=583)r.stage=1;return input;}
  if(r.stage===1){toward(730);if(p.grounded&&p.x<690)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.35;if(p.x>710&&p.grounded)r.stage=2;return input;}
  if(r.stage===2){toward(1190);if(p.x>1180&&box.x>1280&&box.y>700)r.stage=3;return input;}
  if(r.stage===3){toward(box.x-1);if(p.grounded&&p.y>box.y-57)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.35;if(p.grounded&&Math.abs(p.y+56-box.y)<1){r.stage=4;r.rest=w.tick;return {};}return input;}
  if(r.stage===4){if(w.tick-r.rest<6)return input;toward(1370);if(p.grounded&&p.y>540)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.35;if(p.grounded&&p.y<540)r.stage=5;return input;}
 }else{
  if(r.stage===0){toward(500);if(p.x>290&&p.grounded)input.jumpPressed=true;if(p.jumps===1&&p.vy>=-40)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.35;if(p.x>470&&p.grounded)r.stage=1;return input;}
  if(r.stage===1){input.right=true;if(box.x>=1285&&box.y>700){r.stage=2;r.rest=w.tick;}return input;}
  if(r.stage===2){toward(1380);if(p.grounded&&p.y>540)input.jumpPressed=true;if(p.jumps===1&&p.vy>=-40)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.35;if(p.grounded&&p.y<540)r.stage=5;return input;}
 }
 if(r.stage===5){
  const e=w.enemies[0];
  if(w.players.some(o=>o.y>540)){toward(1380);return input;}
  if(e&&e.paused<=0&&p.x<e.x+50){toward(e.x-72);if(i===1&&Math.abs(p.x-e.x)<80)input.interactPressed=true;return input;}
  toward(2430);return input;
 }
 return input;
}
function run(index,max=15000){routes.clear();const w=G.createWorld(index,1);for(let t=0;t<max&&w.phase==='playing';t++)G.stepWorld(w,w.players.map((p,i)=>controller(w,i)),1/60);return w;}
function hardController(w,i,r,p,input,box,toward){
 const jump=(limit=.35,second=false)=>{if(p.grounded)input.jumpPressed=true;if(second&&i===1&&p.jumps===1&&p.hold>.25)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<limit;};
 if(i===0){
  if(r.stage===0){if(p.dash<=0||p.x<510)toward(535);if(p.x>180&&!w.boxes[0].hidden&&p.cooldown<=0)input.interactPressed=true;if(p.x>528&&p.dash<=0)r.stage=1;return input;}
  if(r.stage===1){toward(735);if(p.grounded&&p.y>680&&p.x<600)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.1;if(p.x>714&&p.grounded)r.stage=2;return input;}
  if(r.stage===2){toward(1135);if(p.x>1125&&box.x>1155&&box.x<1175&&box.y>700&&Math.abs(box.vx)<1&&w.players[1].x>box.x+20)r.stage=3;return input;}
  if(r.stage===3){toward(box.x-1);if(p.grounded&&p.y>box.y-57)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.1;if(p.grounded&&Math.abs(p.y+56-box.y)<1){r.stage=4;r.rest=w.tick;return {};}return input;}
  if(r.stage===4){if(w.tick-r.rest<8)return input;toward(1350);if(p.grounded&&p.y>540)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.35;if(p.grounded&&p.y<540)r.stage=5;return input;}
 }else{
  if(r.stage===0){toward(500);if(p.x>290&&p.grounded)input.jumpPressed=true;if(p.jumps===1&&p.vy>=-40)input.jumpPressed=true;input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.35;if(p.x>470&&p.grounded)r.stage=1;return input;}
  if(r.stage===1){toward(1035);if(p.x>650&&p.x<815)jump(.15);if(p.x>1025&&box.x>1048){r.stage=2;r.rest=w.tick;}return input;}
  if(r.stage===2){toward(1280);jump(.35,true);if(p.x>1260){r.stage=3;}return input;}
  if(r.stage===3){toward(1280);if(p.grounded&&p.y>680)r.stage=4;return input;}
  if(r.stage===4){if(box.x>1165)input.left=true;else{r.stage=5;r.rest=w.tick;}return input;}
  if(r.stage===5){if(w.players[0].y>540)return input;if(w.tick-r.rest<8)return input;toward(box.x-1);if(p.grounded&&p.y>box.y-57)input.jumpPressed=true;if(p.y+56>box.y){delete input.left;delete input.right;}input.jump=!!input.jumpPressed||!p.grounded&&p.hold<.1;if(p.grounded&&Math.abs(p.y+56-box.y)<1){r.stage=6;r.rest=w.tick;return {};}return input;}
  if(r.stage===6){if(w.tick-r.rest<8)return input;toward(1350);jump(.35,true);if(p.grounded&&p.y<540)r.stage=7;return input;}
 }
 if(i===0&&r.stage===5||i===1&&r.stage===7){
  if(w.players.some(q=>q.y>540)){toward(1350);return input;}
  toward(1540);jump(.18);if(p.x>1510&&p.grounded)r.stage=8;return input;
 }
 if(r.stage===8){toward(1665);if(p.x>1650)r.stage=9;return input;}
 if(r.stage===9){if(p.x>1850&&p.grounded){r.stage=10;return {};}toward(1875);if(p.x<1800||!p.grounded)jump(.18,true);return input;}
 if(r.stage===10){const e=w.enemies[0];if(i===1&&Math.abs(p.x-e.x)<82)input.interactPressed=true;const partner=routes.get(w.levelIndex+':'+w.run+':'+w.respawns)[1-i];if(partner.stage!==10){toward(1875);return input;}if(e.paused<=0&&p.x<e.x+50){toward(e.x-75);if(i===1&&Math.abs(p.x-e.x)<82)input.interactPressed=true;}else toward(2430);return input;}
 return input;
}
module.exports={controller,run,routes};
if(require.main===module){const index=Number(process.argv[2]||0),w=run(index);console.log(JSON.stringify({phase:w.phase,elapsed:w.elapsed,players:w.players,box:w.boxes,routes:[...routes],respawns:w.respawns},null,2));assert.equal(w.phase,'intermission','ordinary-input route '+index);}




