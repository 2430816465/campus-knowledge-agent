import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true});
for(const [name,url] of [['camp','http://127.0.0.1:4173/games/marble/index.html'],['desktop','http://127.0.0.1:4180/']]){
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const failed=[];page.on('requestfailed',r=>failed.push(r.url()));
 await page.goto(url);await page.click('[data-action=new]');await page.waitForTimeout(150);
 const board=await page.locator('#board').boundingBox();
 assert.ok(board.width>340&&board.height>520,`${name} board is still too small: ${JSON.stringify(board)}`);
 const assets=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>/bat|skeleton|ghost/.test(x.name)).map(x=>({url:x.name,size:x.transferSize})));
 assert.equal(assets.length,3,`${name} monster art missing`);
 await page.screenshot({path:`output/marble-${name}-phone.png`,fullPage:true});
 const start={x:board.x+board.width*.5,y:board.y+board.height*.91};
 const end={x:board.x+board.width*.58,y:board.y+board.height*.72};
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
 const phase=JSON.parse(await page.evaluate(()=>window.render_game_to_text())).mode;
 assert.equal(phase,'flight',`${name} aiming did not launch`);
 await page.evaluate(()=>window.advanceTime(8500));
 const state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
 assert.ok(['aim','reward','result'].includes(state.mode),`${name} volley did not settle`);
 assert.deepEqual(errors,[],`${name} browser errors`);assert.deepEqual(failed,[],`${name} failed assets`);
 console.log(name,JSON.stringify({board:{width:board.width,height:board.height},phaseAfterVolley:state.mode,assets:assets.length,errors:errors.length}));
 await page.close();
}
await browser.close();
