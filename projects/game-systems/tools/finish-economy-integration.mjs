import fs from 'node:fs';
const edit=(file,fn)=>fs.writeFileSync(file,fn(fs.readFileSync(file,'utf8')));
for(const mode of ['tower','marble','mine','coop','liars','evolve','workshop','chess','nightwatch','rush'])for(const file of mode==='marble'?['index.html','puzzle.html']:['index.html']){
 const p='games/'+mode+'/'+file;edit(p,s=>{if(s.includes('camp-wallet.js'))return s;fs.mkdirSync('artifacts/economy-v2/backup/games/'+mode,{recursive:true});fs.copyFileSync(p,'artifacts/economy-v2/backup/'+p);return s.replace('</body>','<script type="module" src="../shared/camp-wallet.js"></script></body>');});
}
edit('services.js',s=>s.replace("export function mineReward",`products.push(
 {id:'evolve-lotus',name:'莲塘花冠队伍',mode:'再进化一次',game:'evolve',price:300,effect:'主角与全部随行佩戴莲花冠，二十级均适用。保留物种轮廓、同级大小与吞噬判定。',type:'永久队伍外观',icon:'star'},
 {id:'chess-bamboo',name:'竹林牌桌',mode:'勇者棋牌',game:'chess',price:120,effect:'替换为竹绿色牌桌与竹叶桌边装饰；牌面、暗牌信息和计分不变。',type:'永久桌面',icon:'book'},
 {id:'bakery-berry',name:'莓果甜品屋',mode:'魔王面包房',game:'workshop',price:600,effect:'烤箱与柜台增加莓果装饰、织物桌旗和甜品店招；不改变角色、设施占地、配方或生产收益。',type:'永久店铺主题',icon:'flag'}
);
export function mineReward`).replace('营地展示四条路线的实际游玩记录','营地展示十条路线的实际游玩记录').replace('吃同级直接进化，低级生物结伴并占据走位空间','主角加两只同级进化，低级随行三合一并占据走位空间'));
edit('evolve-host.js',s=>s.replace("pause(){if(frame", "pause(){economy?.setPaused(true);if(frame").replace("resume(){if(frame","resume(){economy?.setPaused(false);if(frame"));
edit('games/evolve/render.js',s=>s.replace('sprite(level,x,y,size,facing=1)', 'sprite(level,x,y,size,facing=1,cosmetic=false)').replace('ctx.restore();}\n draw(game',`ctx.restore();if(cosmetic&&globalThis.CampCosmetics?.includes('evolve-lotus'))this.flower(x,y-size*.29,size*.12);}
 flower(x,y,r){const ctx=this.ctx;ctx.save();ctx.translate(x,y);ctx.fillStyle='#a95e91';for(let i=0;i<5;i++){ctx.save();ctx.rotate(i*Math.PI*2/5);ctx.beginPath();ctx.ellipse(0,-r*.55,r*.42,r*.65,0,0,Math.PI*2);ctx.fill();ctx.restore();}ctx.fillStyle='#ffe9a0';ctx.beginPath();ctx.arc(0,0,r*.35,0,Math.PI*2);ctx.fill();ctx.restore();}
 draw(game`).replace('Math.cos(r.player.angle));}', 'Math.cos(r.player.angle),true);}').replace('Math.cos(p.angle));','Math.cos(p.angle),true);'));
edit('games/workshop/scene.js',s=>s.replace('if(hasLine(s))belt(L.conveyor,t);',`if(globalThis.CampCosmetics?.includes('bakery-berry')){ctx.save();ctx.fillStyle='#bd6681';ctx.fillRect(L.counter.x-44,L.counter.y-12,88,13);ctx.fillStyle='#fff0d6';for(let i=0;i<8;i++)ctx.fillRect(L.counter.x-40+i*11,L.counter.y-12,5,13);ctx.fillStyle='#aa4d75';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText('莓果甜品屋',L.oven.x,L.oven.y-75);for(const p of [L.oven,L.counter]){for(let i=0;i<3;i++){ctx.fillStyle='#b5577a';ctx.beginPath();ctx.arc(p.x-16+i*16,p.y-44,5,0,Math.PI*2);ctx.fill();}}ctx.restore();}
  if(hasLine(s))belt(L.conveyor,t);`));
const css='html[data-camp-theme="bamboo"] body{background:linear-gradient(135deg,#233d31,#3c6150)!important}html[data-camp-theme="bamboo"] .table,html[data-camp-theme="bamboo"] .game-table{background:repeating-linear-gradient(90deg,#375d4b 0px,#375d4b 36px,#426955 37px,#426955 39px)!important;border-color:#b8bc83!important}';
fs.writeFileSync('games/shared/economy-cosmetics.css',css);
edit('games/chess/index.html',s=>s.replace('</head>','<link rel="stylesheet" href="../shared/economy-cosmetics.css"></head>'));
edit('app.js',s=>s.replace("const s=api.get();show('冒险币'", "const s=api.get();show('冒险币'").replace('挖矿须至少挖掘5次，按深度、探索与藏宝库结算；零贡献不发币。','十款玩法按有效目标分段入账；暂停、离线生产和挂机不赚冒险币。基础收益目标约每分钟2币，首通另有奖励。每日两项10币、每周累计奖励60币。').replace('仅改变营地肖像。','仅改变营地肖像。'));
// Keep original game estimates clearly separate from the actual wallet.
for(const file of ['games/evolve/main.js','games/marble/main.js','games/marble/ui-endless.js','games/marble/ui-v3.js']){
 if(!fs.existsSync(file))continue;
 edit(file,s=>s.replaceAll('本局冒险币','本局目标积分').replaceAll('基础合计','目标积分合计').replaceAll('本局基础收益','本局目标积分').replaceAll('营地奖励 +','目标参考分 +'));
}
for(const file of ['live-games.js','evolve-host.js'])edit(file,s=>s.replace('balance:options.getBalance?.()})','balance:options.getBalance?.(),earned:result?.reward??0})').replace('earned:result?.reward??0','earned:0'));
// Actual awards are shown in the shared wallet chip, not the game's historical estimate.
fs.appendFileSync('progress.md','\n\n## 货币系统 v2 · 2026-10-01\nUser request: 按分析方案完善货币系统；登塔与合作角色只提供母版供判断，不制作动作帧。保留1.16界面、余额、购买、局内成长；新增分段收益、独立首次目标、每日/周任务、广告比例与次数限制、场内外观。测试与交付记录见artifacts/economy-v2。\n');
