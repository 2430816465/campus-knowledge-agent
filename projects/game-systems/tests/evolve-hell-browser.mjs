import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),p=await browser.newPage({viewport:{width:1000,height:600}}),errors=[],out='artifacts/evolve-hell/browser';await fs.mkdir(out,{recursive:true});
p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
const read=()=>p.evaluate(()=>JSON.parse(render_game_to_text()));
await p.goto((process.env.BASE_URL||'http://127.0.0.1:4194')+'/games/evolve/index.html');await p.locator('[data-action="new"]').click();await p.keyboard.press('ArrowRight');await p.locator('[data-action="pause"]').click();
const ordinary=await p.evaluate(()=>localStorage.getItem('camp-evolve-v1'));await p.reload();await p.locator('[data-action="modeHell"]').click();assert.equal((await read()).mode,'hell');await p.locator('[data-action="new"]').click();
await p.keyboard.down('ArrowRight');await p.evaluate(()=>advanceTime(300));await p.keyboard.up('ArrowRight');assert.equal((await read()).mode,'hell');assert.equal((await read()).player.speed,210);await p.screenshot({path:out+'/playing.png'});
await p.locator('[data-action="pause"]').click();const paused=(await read()).elapsed;await p.evaluate(()=>advanceTime(1000));assert.equal((await read()).elapsed,paused);await p.screenshot({path:out+'/pause.png'});
assert.equal(await p.evaluate(()=>localStorage.getItem('camp-evolve-v1')),ordinary);
// A deterministic isolated hazard fixture avoids random animal contact hiding the warning under test.
const fixture=await p.evaluate(()=>JSON.parse(localStorage.getItem('camp-evolve-hell-v1')));fixture.level=1;fixture.elapsed=0;fixture.entities=[];fixture.followers=[];fixture.player={x:2100,y:1500,angle:0};fixture.shield=10;fixture.spawnClock=-100;fixture.hell={nextPulse:8,pulses:[],lost:0};
await p.addInitScript(s=>localStorage.setItem('camp-evolve-hell-v1',JSON.stringify(s)),fixture);
await p.reload();await p.locator('[data-action="modeHell"]').click();await p.locator('[data-action="continue"]').click();assert.equal((await read()).mode,'hell');
await p.evaluate(()=>advanceTime(8200));await p.screenshot({path:out+'/warning.png'});const warning=await read();assert(warning.hell.hazards.some(z=>z.kind==='pulse'&&!z.active));await fs.writeFile(out+'/warning.json',JSON.stringify(warning,null,2));
await p.evaluate(()=>advanceTime(5000));assert.equal((await read()).phase,'fallen');await p.screenshot({path:out+'/active-fallen.png'});await p.locator('[data-action="revive"]').click();await p.evaluate(()=>advanceTime(5100));assert.equal((await read()).revived,true);assert.equal((await read()).phase,'playing');await p.screenshot({path:out+'/revived.png'});
await fs.writeFile(out+'/errors.json',JSON.stringify(errors));assert.deepEqual(errors,[]);await browser.close();console.log('PASS selection, movement, independent saves, reload, pause, warning, death and single revive');
