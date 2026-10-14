const definitions = [
 {id:'safe',name:'平安同行',text:'不坠落、不重置，携手过关。'},
 {id:'keepsake',name:'寻迹搭档',text:'找到本关纪念物后过关。'},
 {id:'perfect',name:'完整旅程',text:'不坠落、不重置，并找到本关纪念物。'},
 {id:'lead0',name:'1P 先锋',text:'1P 玩家先踏入最后一段的出口，再一起过关。'},
 {id:'lead1',name:'2P 先锋',text:'2P 玩家先踏入最后一段的出口，再一起过关。'},
 {id:'together',name:'默契到站',text:'首位玩家踏入最终出口后3秒内，两人共同过关。'},
 {id:'steady',name:'稳稳同行',text:'不坠落、不重置，并在首人入最终出口后3秒内共同过关。'}
];
function offer(level,random=Math.random){
 const rooms=level.rooms||[level],hasKeepsake=rooms.some(r=>r.memorials?.length);
 const pool=definitions.filter(d=>hasKeepsake||!['keepsake','perfect'].includes(d.id)).slice();
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool.slice(0,3);
}
function track(world,Game){
 const rooms=Game.LEVELS[world.levelIndex].rooms;
 if(rooms&&(world.roomIndex||0)!==rooms.length-1)return;
 if(world.contractFirstExit!==undefined)return;
 const stage=Game.stageFor(world),exit=stage.exit;
 const entered=world.players.map((p,i)=>Game.rectsOverlap(Game.bodyRect(p),stage.roleExits?.[i]||exit)?i:-1).filter(i=>i>=0);
 if(entered.length){world.contractFirstExit=entered.length===1?entered[0]:-1;world.contractExitTime=world.elapsed;}
}
function achieved(id,w){
 if(!w||w.phase!=='intermission')return false;
 const together=Number.isFinite(w.contractExitTime)&&w.elapsed-w.contractExitTime<=3;
 return id==='safe'?w.safeRun:id==='keepsake'?w.memorialFound:id==='perfect'?w.safeRun&&w.memorialFound:id==='lead0'?w.contractFirstExit===0:id==='lead1'?w.contractFirstExit===1:id==='together'?together:id==='steady'?w.safeRun&&together:false;
}
module.exports={definitions,offer,track,achieved};
