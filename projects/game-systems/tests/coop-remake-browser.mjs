import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {returningPlayer} from './coop-guide-preferences.mjs';
const require=createRequire(import.meta.url),route=require('./coop-remake.cjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4199',dir='artifacts/coop-remake/browser';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[];
try{for(const [id,width,height] of [[13,844,390],[34,740,360],[50,1024,600]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,userAgent:'AdventureCampAndroid/1.13.0'});
 const page=await context.newPage(),errors=[];
 await returningPlayer(page);
 page.on('pageerror',e=>errors.push(e.stack));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 // Unlock selection for testing, but start the actual map with no puzzle flags earned.
 await page.addInitScript(()=>localStorage.setItem('zcyg_solo_v1',JSON.stringify({version:1,progress:{coins:0,cleared:Array.from({length:49},(_,i)=>i+1),marks:{}},world:null})));
 await page.goto(base+'/games/coop/index.html?solo=1');
 await page.locator('[data-level="'+(id-1)+'"]').tap();await page.locator('#startSolo').tap();
 await page.bringToFront();await page.evaluate(()=>CampCoop.resume());await page.waitForTimeout(100);
 await page.screenshot({path:dir+'/level-'+id+'-start.png'});
 const scripts={navigate:route.navigate.toString(),targetFor:route.targetFor.toString(),controller:route.controller.toString()};
 await page.evaluate(scripts=>{
  const G=window.RushGame,routes=new Map();
  const targetFor=eval('('+scripts.targetFor+')'),navigate=eval('('+scripts.navigate+')'),controller=eval('('+scripts.controller+')');
  const held=new Set();
  function key(k,on){if(held.has(k)===on)return;document.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{key:k,bubbles:true}));if(on)held.add(k);else held.delete(k);}
  window.testDrive=(stopAtRoom)=>{
   for(let n=0;n<42000;n++){
    const state=CampCoop.snapshot(),world=state.world;
    if(world.phase!=='playing'||stopAtRoom!=null&&(world.roomIndex||0)>=stopAtRoom){for(const k of [...held])key(k,false);return {phase:world.phase,room:world.roomIndex,elapsed:world.elapsed,safe:world.safeRun};}
    const a=controller(world,0),b=controller(world,1),slot=[a,b].findIndex(i=>Object.keys(i).length);
    const current=JSON.parse(render_game_to_text()).ownSlot;
    if(slot>=0&&slot!==current){key('q',true);key('q',false);held.clear();}
    const input=slot<0?{}:[a,b][slot];
    key('ArrowLeft',!!input.left);key('ArrowRight',!!input.right);
    if(input.jumpPressed){key(' ',false);key(' ',true);}else key(' ',false);
    if(input.interactPressed){key('e',false);key('e',true);}else key('e',false);
    advanceTime(1000/60);
    if(world.fall)throw Error('browser route fell '+JSON.stringify({slot,world}));
   }
   throw Error('browser route timed out '+JSON.stringify(render_game_to_text()));
  };
 },scripts);
 if(id===50){const middle=await page.evaluate(()=>testDrive(1));assert.equal(middle.room,1);await page.screenshot({path:dir+'/level-50-gallery.png'});}
 const result=await page.evaluate(()=>testDrive());assert.equal(result.phase,'intermission');assert.equal(result.safe,true);
 await page.waitForTimeout(80);await page.screenshot({path:dir+'/level-'+id+'-complete.png'});
 assert.deepEqual(errors,[]);results.push({id,width,height,...result,errors});await context.close();
}}finally{await browser.close();}
await writeFile(dir+'/report.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
