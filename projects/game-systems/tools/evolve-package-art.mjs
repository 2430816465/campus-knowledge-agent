import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {SPECIES,radius} from '../games/evolve/data.js';
const require=createRequire(import.meta.url);
const sharp=require('C:/Users/24308/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const base=new URL('../games/evolve/assets/',import.meta.url);
const atlas=new URL('source/creatures-v2.png',base);
const meta=await sharp(fileURLToPath(atlas)).metadata();
const manifest=[];
for(let i=0;i<SPECIES.length;i++){
 const species=SPECIES[i],old=species.legacy-1;
 const file=new URL(`creature-${i+1}.webp`,base);
 let tile,source;
 if(species.legacy){const left=Math.round((old%5)*meta.width/5),right=Math.round((old%5+1)*meta.width/5),top=Math.floor(old/5)*meta.height/2;tile=await sharp(fileURLToPath(atlas)).extract({left,top,width:right-left,height:meta.height/2}).png().toBuffer();source='source/creatures-v2.png';}
 else{source=`source/new-${i+1}.png`;tile=await fs.readFile(new URL(source,base));}
 const {data,info}=await sharp(tile).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let minX=info.width,minY=info.height,maxX=-1,maxY=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>40){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 if(maxX<0||minX<2||minY<2||maxX>info.width-3||maxY>info.height-3)throw Error(`Empty or clipped source for level ${i+1}`);
 await sharp(tile).trim({threshold:30}).resize(224,224,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:92,alphaQuality:100}).toFile(fileURLToPath(file));
 manifest.push({level:i+1,name:species.name,radius:radius(i+1),source,file:`creature-${i+1}.webp`,bytes:(await fs.stat(file)).size,sourceBounds:{minX,minY,maxX,maxY,width:info.width,height:info.height}});
}
await sharp(fileURLToPath(new URL('source/pond.png',base))).resize(1400,1000,{fit:'fill'}).webp({quality:86}).toFile(fileURLToPath(new URL('pond.webp',base)));
await fs.writeFile(new URL('manifest.json',base),JSON.stringify({source:'Built-in image_gen; deterministic crop, trim, resize and WebP encoding only.',creatures:manifest},null,2));
console.log('Packaged',SPECIES.length,'transparent creatures and pond:',manifest.reduce((a,b)=>a+b.bytes,0),'sprite bytes');
