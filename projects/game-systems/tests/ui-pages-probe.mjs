import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const b=await chromium.launch({headless:true});await fs.mkdir('artifacts/ui-pages',{recursive:true});
for(const size of [{width:390,height:844},{width:844,height:390}]){
const p=await b.newPage({viewport:size});await p.goto('http://127.0.0.1:4215');await p.waitForTimeout(1000);console.log(size,await p.evaluate(()=>ScreenPages.describe()));await p.screenshot({path:`artifacts/ui-pages/home-${size.width}.png`});for(const action of ['settings','wallet','nav:collection','nav:tasks','nav:profile']){await p.locator(`[data-action="${action}"]`).first().evaluate(e=>{ScreenPages.reveal(e);e.click()});await p.waitForTimeout(300);console.log(action,await p.evaluate(()=>ScreenPages.describe()));await p.screenshot({path:`artifacts/ui-pages/${action.replace(':','-')}-${size.width}.png`});if(await p.locator('dialog[open]').count())await p.locator('dialog [data-action="close"]').first().click();}await p.close();}
await b.close();
