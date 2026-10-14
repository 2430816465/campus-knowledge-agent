import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const sharp=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const base=new URL('../games/workshop/assets/',import.meta.url);
await sharp(await fs.readFile(new URL('observatory-source.png',base))).resize(1200,800,{kernel:'nearest'}).webp({quality:88}).toFile(fileURLToPath(new URL('observatory.webp',base)));
const source=await fs.readFile(new URL('machines-source.png',base)),meta=await sharp(source).metadata();
const names=['collector','polisher','courier','storage','artisan','lighthouse'];
for(let i=0;i<6;i++){
 const left=Math.round(i%3*meta.width/3),top=Math.round((i===3?.58:i===4?.55:Math.floor(i/3)/2)*meta.height),right=Math.round((i%3+1)*meta.width/3),bottom=Math.round((Math.floor(i/3)+1)*meta.height/2);
 const cell=await sharp(source).extract({left,top,width:right-left,height:bottom-top}).png().toBuffer();
 await sharp(cell).resize(220,250,{fit:'inside',kernel:'nearest'}).webp({quality:93}).toFile(fileURLToPath(new URL(names[i]+'.webp',base)));
}
console.log(JSON.stringify({width:meta.width,height:meta.height,alpha:meta.hasAlpha,sprites:names}));
