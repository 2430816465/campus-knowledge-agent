// Actual production canvas captures for visual review, with explicit test HP.
import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import {fresh} from '../games/nightwatch/profile.js';
import {Battle,createBattle} from '../games/nightwatch/battle.js';
import {monsterById,WORLD} from '../games/nightwatch/data.js';
const base=process.env.BASE_URL||'http://127.0.0.1:4211',out=process.env.AUDIT_OUT||'C:/Users/24308/Documents/ChatGPT/游戏/nightwatch-v4/recordings';
const browser=await chromium.launch({headless:true});await fs.mkdir(out,{recursive:true});
try{for(const id of ['orc_warrior','mage_red','rock_golem','dragon']){
 const p=fresh();p.settings={sound:false,damageNumbers:false,guides:false};const s=p.active=createBattle(p);s.waiting=1000;s.wave=1;s.partnerClock=s.wallClock=1000;s.stats.health=s.wall=1e8;s.abilities={bolt:{level:1,damage:0,cooldown:0}};s.cooldowns.bolt=.2;
 const engine=new Battle(s,p),d=monsterById[id];for(const [x,y,clock]of [[150,d.ranged?295:230,d.ranged?.1:1000],[300,WORLD.wallY-d.radius,.24]]){const e=engine.spawn(id,x,y);e.hp=e.maxHp=1e9;e.special=1000;e.attackClock=clock;}
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.addInitScript(p=>localStorage.setItem('camp-nightwatch-v1',JSON.stringify(p)),p);await page.goto(base+'/games/nightwatch/index.html');await page.waitForFunction(()=>document.querySelector('#loading')?.hidden&&window.render_game_to_text);await page.evaluate(()=>advanceTime(0));await page.locator('[data-action="resume"]').click();
 const dir=out+'/'+id;await fs.mkdir(dir,{recursive:true});const states=[];
 for(let i=0;i<60;i++){await page.evaluate(()=>advanceTime(1000/30));await page.locator('#board').screenshot({path:`${dir}/${String(i).padStart(3,'0')}.png`});states.push(await page.evaluate(()=>JSON.parse(render_game_to_text())));}
 await fs.writeFile(dir+'/states.json',JSON.stringify(states,null,2));await context.close();console.log(id+' recorded 60 frames');
}}finally{await browser.close();}
