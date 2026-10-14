import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true});
for(const width of [390,470]){
 const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/games/marble/index.html?dev=1');
 await page.click('[data-action=debug]');
 await page.click('[data-action=debugStart]');
 await page.locator('#board').waitFor();
 await page.waitForTimeout(250);
 const data=await page.evaluate(()=>{
  const board=document.querySelector('#board').getBoundingClientRect();
  const wrap=document.querySelector('.board-wrap').getBoundingClientRect();
  return {viewport:[innerWidth,innerHeight],board:{width:board.width,height:board.height,left:board.left,top:board.top},wrap:{width:wrap.width,height:wrap.height},pageHeight:document.documentElement.scrollHeight};
 });
 await page.screenshot({path:`output/marble-size-${width}.png`,fullPage:true});
 console.log(width,JSON.stringify(data),'errors',JSON.stringify(errors));
 await page.close();
}
await browser.close();
