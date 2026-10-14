import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
async function edit(name,fn){const path=new URL(name,root),before=await fs.readFile(path,'utf8'),after=fn(before);if(before===after)return;if(await fs.readFile(path,'utf8')!==before)throw Error('File changed concurrently; retry '+name);await fs.writeFile(path,after);console.log('Integrated',name);}
await edit('services.js',s=>{
 if(!s.includes("id:'evolve'"))s=s.replace("export const productCategory",`modes.push({id:'evolve',slot:6,name:'再进化一次',tag:'吞噬进化',people:'单人',color:'#82bba8',line:'带着小伙伴，游向星冠之巅。',description:'吃同级直接进化，低级生物结伴并占据走位空间；避开强敌追击与移动水流，挑战十级星冠巨兽。',choices:['池塘冒险 · 开始或继续','开启一段新旅程'],unit:'级',hud:['等级 1','随行队伍 0','十级进化'],orientation:'portrait'});\nexport const productCategory`);
 if(!s.includes('export function evolveReward'))s=s.replace('export function taskProgress',`export function evolveReward(details,win=false){\n const eaten=Number.isFinite(details?.eaten)?Math.max(0,Math.floor(details.eaten)):0;\n const level=Number.isFinite(details?.level)?Math.max(1,Math.min(10,Math.floor(details.level))):1;\n return eaten<5?0:Math.min(36,Math.min(24,(level-1)*2+Math.floor(eaten/4))+(win&&level===10?12:0));\n}\nexport function taskProgress`);
 if(!s.includes("mode==='evolve'?evolveReward"))s=s.replace("const amount=mode==='mine'?","const amount=mode==='evolve'?evolveReward(details,win):mode==='mine'?");
 const previous="const modes=new Set(runs.map(r=>r.mode));\n return {count:modes.size===4?4:Math.min(4,['tower','marble','mine'].filter(m=>modes.has(m)).length+(runs.filter(r=>r.mode!=='coop').length>=6?1:0)),target:4,reward:100};";
 const next="const valid=new Set(modes.map(m=>m.id)),visited=new Set(runs.filter(r=>valid.has(r.mode)).map(r=>r.mode));\n const solo=[...visited].filter(id=>id!=='coop'),soloRuns=runs.filter(r=>valid.has(r.mode)&&r.mode!=='coop').length;\n return {count:visited.size>=4?4:Math.min(4,solo.length+(soloRuns>=6&&solo.length>=3?1:0)),target:4,reward:100};";
 s=s.replace(previous,next).replace(previous.replaceAll('\n','\r\n'),next);return s;
});
await edit('app.js',s=>{
 if(!s.includes("import './evolve-host.js'"))s=s.replace("import './live-games.js';","import './live-games.js';\nimport './evolve-host.js';");
 if(!s.includes("evolve:'鼠标"))s=s.replace("${{tower:'先观察", "${{evolve:'鼠标跟随、触屏按住拖动或方向键移动。吃同级直接进化；低级生物留在身边占位，进度满合并。主角或队员碰到强敌就失败；完整观看模拟广告可复活一次，升到10级胜利。',tower:'先观察");
 if(!s.includes("evolve:[['pause'"))s=s.replace("function gameActions(){const items={","function gameActions(){const items={evolve:[['pause','队伍、存档与本局结算']],");
 s=s.replace("${mode.id==='tower'?'登塔使用", "${mode.id==='evolve'?'进化旅程自动保存等级、队伍与复活次数；返回后可继续。需要在游戏内结束并领取才能入账。':mode.id==='tower'?'登塔使用");
 s=s.replace("show('四条路，四种冒险'","show('玩法与冒险'").replace('四个入口已连接真实游戏。','${modes.length}个入口已连接真实游戏。');return s;
});
await edit('views.js',s=>{
 if(!s.includes("evolve:['十级进化'"))s=s.replace('const modeFacts={',"const modeFacts={evolve:['十级进化','队伍占位','水流走位'],");
 s=s.replace('modeFacts[mode.id].map','(modeFacts[mode.id]||[mode.tag]).map');
 if(!s.includes("低级生物会占位"))s=s.replace("${mode.id==='marble'?'无尽与闯关", "${mode.id==='evolve'?'低级生物会占位并减速，进化后收拢。每局一次模拟广告复活；等级、队伍、复活次数自动保存。':mode.id==='marble'?'无尽与闯关");
 s=s.replace('完成四种有效冒险；或体验三种单人玩法并累计六次单人有效结算。','完成任意四种有效冒险；或体验三种单人玩法并累计六次单人有效结算。');return s;
});
await edit('reference-art.js',s=>{
 if(s.includes("if(id==='evolve')"))return s;
 return s.replace("export function referenceArt(id,cls=''){",`export function referenceArt(id,cls=''){\n if(id==='evolve')return \`<span class="evolve-scene \${cls}" aria-hidden="true"><img class="evolve-small" src="games/evolve/assets/creature-1.webp" alt=""><img class="evolve-middle" src="games/evolve/assets/creature-4.webp" alt=""><img class="evolve-crown" src="games/evolve/assets/creature-10.webp" alt=""></span>\`;`);
});
await edit('pixel-home.js',s=>{
 if(s.includes('function orderedPortals'))return s;
 const helpers=`function orderedPortals(){const list=modes.filter(m=>m.id!=='evolve'),evolution=modes.find(m=>m.id==='evolve');if(evolution){while(list.length<5)list.push(null);list.splice(5,0,evolution);}return list;}\nconst reservedPortal='<button class="adventure-portal portal-reserved" disabled aria-label="第五个玩法正在制作"><span class="reserved-picture">✦<small>第五段冒险</small></span><span class="portal-copy"><span><strong>新玩法制作中</strong><small>为下一段旅程留个位置</small></span><span class="portal-go">…</span></span></button>';\n`;
 s=s.replace('export function pixelHome(s){',helpers+'export function pixelHome(s){');
 s=s.replace('<div class="mode-grid">${modes.map(m=>`','<div class="mode-grid">${orderedPortals().map(m=>m?`');
 s=s.replace("</button>`).join('')}</div><button class=\"reference-shop\"", "</button>`:reservedPortal).join('')}</div><button class=\"reference-shop\"");return s;
});
await edit('index.html',s=>s.includes('evolve-camp.css')?s:s.replace('<link rel="stylesheet" href="unified.css">','<link rel="stylesheet" href="unified.css"><link rel="stylesheet" href="evolve-camp.css">'));
