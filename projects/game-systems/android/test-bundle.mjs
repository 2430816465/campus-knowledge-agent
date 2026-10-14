import {createRequire} from 'node:module';
import {readFile,access} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import http from 'node:http';

const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const root=resolve(fileURLToPath(new URL('app/src/main/assets/web/',import.meta.url)));
const server=http.createServer(async(request,response)=>{
  const raw=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
  const file=resolve(root,'.'+raw);
  if(!file.startsWith(root+sep)){response.writeHead(404).end();return}
  try{const body=await readFile(file);const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff':'font/woff','.ttf':'font/ttf'};response.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(body)}
  catch{response.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(38473,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 AdventureCampAndroid/1.1'});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`)});
page.on('console',message=>{if(message.type()==='error')console.log('Console:',message.text())});
page.on('websocket',socket=>{console.log('Socket:',socket.url());socket.on('socketerror',error=>console.log('Socket error:',error));socket.on('close',()=>console.log('Socket closed'))});
const home='http://127.0.0.1:38473/index.html';
for(const id of ['tower','marble','mine','coop']){
  console.log('Checking '+id);
  await page.goto(home);
  await page.locator(`[data-action="mode:${id}"]`).click();
  await page.locator(`[data-action="${id==='coop'?'create-room':'preview'}"]`).click();
  try {await page.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.game-loading'),null,{timeout:8000});}
  catch(error){console.error('Host',await page.locator('body').innerText(),'Frames',page.frames().map(f=>f.url()),'Errors',errors);throw error}
  const game=page.frames().find(f=>f.url().includes(`/games/${id}/`));
  assert(game,`embedded ${id} frame`);
  if(id==='marble')await game.locator('[data-action=new]').click();
  if(id==='coop'){
    const setup=game.locator('#androidServerSetup:not([hidden])');
    await setup.waitFor();
    await setup.locator('input').fill('ws://127.0.0.1:4173/ws');
    await setup.locator('button[type=submit]').click();
    await game.waitForFunction(()=>document.querySelectorAll('#roomLevel option').length===50,null,{timeout:12000});
    try {await game.waitForFunction(()=>/^\d{6}$/.test(document.querySelector('#inviteCode')?.textContent||''),null,{timeout:12000});}
    catch(error){console.error('Coop',await game.locator('body').innerText(),'Status',await game.locator('#lobbyNetwork').textContent(),'Errors',errors);throw error}
  }
  assert(await page.locator('[data-action=menu]').count()===(id==='marble'?0:1),`shared menu for ${id}`);
  console.log(`PASS packaged ${id}`);
}
assert.deepEqual(errors,[]);
console.log('PASS packaged assets, four modes, Android room address, zero page errors');
await browser.close();
await new Promise(resolve=>server.close(resolve));
