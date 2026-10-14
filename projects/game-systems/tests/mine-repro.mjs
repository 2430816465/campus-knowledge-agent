import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.stack));
await p.goto('http://127.0.0.1:4186/games/mine/index.html?start=1&seed=fuzz');await p.waitForFunction(()=>window.MT?.MM?.Game.scene?.run);
console.log(await p.evaluate(()=>{
const MM=MT.MM,results=[];for(let seed=0;seed<25;seed++){
const m=MM.Game.scene;m.newRun('repro-'+seed);m.tutorial.open=false;m.tutorial.guided=false;m.run.tutorialRun=false;
try{for(let i=0;i<220;i++){
 advanceTime(1200);
 if(m.run.campDraft?.offer.length){document.querySelector('.mine-draft button')?.click();continue}
 if(m.modal){if(m.modal.type==='supply')m.chooseSupply(0);else if(m.modal.type==='warehouseChoice')m.chooseWarehouse('supplies');else m.modal=null;continue}
 if(m.run.settled)break;
 if(m.run.state!=='EXPLORING'){results.push({seed,i,state:m.run.state,action:m.run.action,move:m.run.move,modal:m.modal});break}
 m.run.stamina=100;const x=m.run.playerX,y=m.run.playerY;
 const candidates=[[x,y+1],[x-1,y],[x+1,y],[x,y-1]].filter(([x,y])=>m.map.inBounds(x,y));
 const target=candidates.find(([x,y])=>!m.map.get(x,y).excavated)||candidates[(i+seed)%candidates.length];if(target)m.onCellClick(...target);
}}catch(e){results.push({seed,error:e.stack,state:m.run.state});break}
}return results
}));console.log(errors);await b.close();
