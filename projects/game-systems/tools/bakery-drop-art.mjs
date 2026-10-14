import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sharp=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const dir='games/workshop/assets',manifest=JSON.parse(await fs.readFile('games/workshop/drop-art-manifest.json','utf8')),qc=[];
for(const entry of manifest.entries){
 const source=dir+'/bakery-'+entry.name+'-source.png',target=dir+'/bakery-'+entry.name+'.webp';await fs.copyFile(entry.source,source);
 const input=await sharp(source).metadata();if(!input.hasAlpha)throw Error(entry.name+' needs alpha');
 const trimmed=await sharp(source).trim({threshold:8}).png().toBuffer();
 await sharp(trimmed).resize({width:96,height:96,fit:'inside',kernel:'nearest'}).webp({lossless:true}).toFile(target);
 const image=await sharp(target).ensureAlpha().raw().toBuffer({resolveWithObject:true});let transparent=0,solid=0;
 for(let i=3;i<image.data.length;i+=4){if(image.data[i]===0)transparent++;if(image.data[i]===255)solid++;}
 if(!transparent||!solid)throw Error(entry.name+' invalid transparency');qc.push({name:entry.name,target,width:image.info.width,height:image.info.height,transparent,solid});
}
await fs.writeFile(dir+'/bakery-drop-qc.json',JSON.stringify(qc,null,2));console.log(JSON.stringify(qc,null,2));
