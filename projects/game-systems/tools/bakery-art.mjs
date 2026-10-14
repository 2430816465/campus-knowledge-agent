import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),sharp=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root='games/workshop/assets/',source=root+'bakery-atlas-source.png',meta=await sharp(source).metadata();
const names=['wheat','cow','berries','oven','counter','crate','demon','demon-walk-1','demon-walk-2','knight','mage','ranger','bread','milk-bread','berry-bread','handcart'];
const rows=[0,.27,.535,.80,1];
const records=[];
for(let i=0;i<names.length;i++){
 const left=Math.round(i%4*meta.width/4),right=Math.round((i%4+1)*meta.width/4),top=Math.round(rows[Math.floor(i/4)]*meta.height),bottom=Math.round(rows[Math.floor(i/4)+1]*meta.height);
 const cell=await sharp(source).extract({left,top,width:right-left,height:bottom-top}).png().toBuffer();
 const buf=await sharp(cell).trim({threshold:8}).png().toBuffer();
 await sharp(buf).resize({width:144,height:144,fit:'inside',kernel:'nearest'}).webp({lossless:true}).toFile(root+'bakery-'+names[i]+'.webp');
 const info=await sharp(root+'bakery-'+names[i]+'.webp').metadata();records.push({name:names[i],width:info.width,height:info.height,alpha:info.hasAlpha});
}
await sharp(root+'bakery-background-source.png').resize(768,512,{kernel:'nearest'}).webp({quality:92}).toFile(root+'bakery-background.webp');
await fs.writeFile(root+'bakery-art-qc.json',JSON.stringify({source:{width:meta.width,height:meta.height,alpha:meta.hasAlpha},records},null,2));
console.log(JSON.stringify(records));
