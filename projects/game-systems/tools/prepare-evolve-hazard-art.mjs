import {chromium} from 'file:///C:/Users/24308/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true}),p=await b.newPage();await p.goto('http://127.0.0.1:4194/games/evolve/index.html');
const meta=[];
for(const name of ['moving-rift','toxin-warning','toxin-active']){
 const source='data:image/png;base64,'+(await fs.readFile(`artifacts/evolve-hell-art/masters/${name}.png`)).toString('base64');
 const result=await p.evaluate(async source=>{const im=new Image();im.src=source;await im.decode();const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.drawImage(im,0,0,512,512);const pixels=ctx.getImageData(0,0,512,512).data;let transparent=0,partial=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;else if(pixels[i]<255)partial++;}return {data:c.toDataURL('image/webp',.88).split(',')[1],original:[im.naturalWidth,im.naturalHeight],transparent,partial,cornerAlpha:pixels[3]};},source);
 assert.equal(result.cornerAlpha,0);assert(result.transparent>512*512*.1);const buf=Buffer.from(result.data,'base64');await fs.writeFile(`games/evolve/assets/hazards/${name}.webp`,buf);delete result.data;meta.push({name,...result,runtime:[512,512],bytes:buf.length});
}
await fs.writeFile('artifacts/evolve-hell-art/image-audit.json',JSON.stringify(meta,null,2));await b.close();console.log(meta);
