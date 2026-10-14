import '../tools/build-phone-host.mjs';
import {cp,mkdir,readdir,rm,stat,readFile} from 'node:fs/promises';
import {join,resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const project=resolve(fileURLToPath(new URL('..',import.meta.url)));
const target=resolve(project,'android/app/src/main/assets/web');
if(!target.startsWith(resolve(project,'android')+sep))throw Error('Asset target is outside the Android project');
const allowed=new Set(['.html','.css','.js','.json','.svg','.png','.jpg','.jpeg','.webp','.woff','.woff2','.ttf','.otf','.mp3','.wav','.ogg','.txt']);
const roots=['assets','licenses','games/tower','games/marble','games/mine','games/coop','games/shared','games/liars','games/evolve','games/workshop','games/chess','games/nightwatch','games/rush'];
const policy=JSON.parse(await readFile(join(project,'runtime-pack-policy.json'),'utf8'));
const excludedPath=p=>policy.excludedFiles.includes(p)||policy.excludedPrefixes.some(prefix=>p.startsWith(prefix));
const allowedFile=name=>allowed.has(extname(name).toLowerCase())||/^(LICENSE|COPYING|NOTICE)$/i.test(name)||name.endsWith('.license');
let count=0,bytes=0;
await mkdir(target,{recursive:true});
// Windows may keep the root open as a preview server's working directory.
// Clear its verified children while retaining that directory itself.
for(const item of await readdir(target))await rm(join(target,item),{recursive:true,force:true,maxRetries:3,retryDelay:100});
async function copyTree(relative){
  for(const item of await readdir(join(project,relative),{withFileTypes:true})){
    if(item.name==='manifest.json'&&relative.replaceAll('\\','/')==='games/chess/assets')continue;
    if(['server','tests','test','artifacts','node_modules','output','.git','dev-wallets.json'].includes(item.name))continue;
    const path=join(relative,item.name);
    if(item.isDirectory()){await copyTree(path);continue}
    if(!item.isFile()||!allowedFile(item.name)||excludedPath(path.replaceAll('\\','/')))continue;
    const src=join(project,path),dest=join(target,path);
    await mkdir(resolve(dest,'..'),{recursive:true});
    await cp(src,dest);
    count++;bytes+=(await stat(src)).size;
  }
}
for(const root of roots)await copyTree(root);
await cp(join(project,'games/camp-bridge.js'),join(target,'games/camp-bridge.js'));
count++;bytes+=(await stat(join(project,'games/camp-bridge.js'))).size;
for(const item of await readdir(project,{withFileTypes:true})){
  if(item.isFile()&&!item.name.startsWith('交付校验-')&&allowed.has(extname(item.name).toLowerCase())){
    await cp(join(project,item.name),join(target,item.name));count++;bytes+=(await stat(join(project,item.name))).size;
  }
}
console.log(`Packed ${count} playable files, ${(bytes/1048576).toFixed(1)} MiB. Excluded server code, old guard game, tests and screenshots.`);
