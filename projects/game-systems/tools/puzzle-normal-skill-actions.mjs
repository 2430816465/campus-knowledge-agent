import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import {SOLUTIONS} from '../games/marble/puzzle-solutions.js';
const b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1280,height:720}}),steps=[];
try{
 await p.goto('http://127.0.0.1:4173/games/marble/puzzle.html?review=1');await p.locator('[data-action="level:0"]').click();
 while(await p.locator('[data-action=tutorialNext]').count()){
  const r=await p.locator('[data-action=tutorialNext]').boundingBox();steps.push({buttons:['left_mouse_button'],frames:1,mouse_x:Math.round(r.x+r.width/2),mouse_y:Math.round(r.y+r.height/2)},{buttons:[],frames:2});await p.locator('[data-action=tutorialNext]').click();
 }
 const r=await p.locator('#board').boundingBox(),angle=SOLUTIONS[0][0]*Math.PI/180;
 steps.push({buttons:['left_mouse_button'],frames:1,mouse_x:Math.round(r.x+(320+Math.sin(angle)*200)*r.width/640),mouse_y:Math.round(r.y+(320-Math.cos(angle)*200)*r.height/360)},{buttons:[],frames:240});
 await fs.writeFile('output/puzzle-normal-v2/skill-actions.json',JSON.stringify({steps}));console.log('Prepared live tutorial and bank-shot actions for original skill client.');
}finally{await b.close()}
