from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def edit(name,old,new):
 p=ROOT/name;s=p.read_text(encoding='utf-8');assert old in s,(name,old[:80]);p.write_text(s.replace(old,new),encoding='utf-8')

edit('services.js',"export function initial()", """export function mineReward(details){
 const n=v=>Number.isFinite(v)?Math.max(0,Math.floor(v)):0;
 const digs=n(details?.digActions),depth=n(details?.maxDepth),rooms=n(details?.rooms);
 if(digs<5)return 0;
 return Math.min(30,Math.min(10,Math.floor(digs/5)*2)+Math.min(10,Math.floor(depth/5)*2)+Math.min(4,rooms*2)+(details?.treasureReached?6:0));
}
export function taskProgress(s,id){
 const runs=s.runs.filter(r=>r.reward>0);
 if(id==='first')return {count:runs.length,target:1,reward:50};
 const modes=new Set(runs.map(r=>r.mode));
 return {count:modes.size===4?4:Math.min(4,['tower','marble','mine'].filter(m=>modes.has(m)).length+(runs.filter(r=>r.mode!=='coop').length>=6?1:0)),target:4,reward:100};
}
export function initial()""")
edit('services.js',"const amount=marble?", "const amount=mode==='mine'?mineReward(details):marble?")
edit('services.js',"const count=id==='first'?s.runs.length:new Set(s.runs.map(r=>r.mode)).size;const target=id==='first'?1:4;", "if(!['first','all'].includes(id))throw Error('任务不存在');const {count,target}=taskProgress(s,id);")
edit('services.js',"s.equipped=s.equipped.includes(id)?s.equipped.filter(x=>x!==id):[...s.equipped,id]", "s.equipped=s.equipped.includes(id)?s.equipped.filter(x=>x!==id):[...s.equipped.filter(x=>!(id.endsWith('-orb')&&x.endsWith('-orb'))),id]")
edit('services.js',"export const products=[", """export const products=[
 {id:'camp-lights',name:'星夜灯串',mode:'营地布置',price:100,effect:'在营地主场景点亮暖色灯串，永久拥有。',type:'永久装饰',icon:'star'},
 {id:'camp-shelf',name:'旅途展示架',mode:'营地布置',price:180,effect:'营地展示四条路线的实际游玩记录；尚未探索的路线保留空位。',type:'永久装饰',icon:'book'},
 {id:'mine-lamp',name:'青辉矿灯',mode:'再挖一层',price:140,effect:'为矿工脚下添加青色灯环与十字光点；不改变视野和挖掘成本。',type:'永久外观',icon:'star'},""")
edit('services.js',"装备后，在挖矿游戏的营地顶栏展示矿镐徽记；不增加挖掘能力。", "装备后，挖掘落点绽放星辉，矿工脚下显示金色光环；保留营地徽记，不增加挖掘能力。")
edit('views.js',"{modes,products}","{modes,products,taskProgress}")
edit('views.js',"'五房远征'","'组合进化'")
edit('views.js',"count=achievement?new Set(s.runs.map(r=>r.mode)).size:s.runs.length,target=achievement?4:1", "count=taskProgress(s,id).count,target=taskProgress(s,id).target")
edit('views.js',"完成全部四种真实冒险的结算，认识营地之外的世界。", "完成四种有效冒险；或体验三种单人玩法并累计六次单人有效结算。")
edit('views.js',"完成任意一次真实游戏结算，写下旅途的第一笔。", "完成一次获得冒险币的有效结算，写下旅途的第一笔。")
edit('views.js',"}[p.id]}</p>","}[p.id]||p.effect}</p>")
edit('pixel-home.js',"const claimable=s.runs.length", "const claimable=s.runs.some(r=>r.reward>0)")
edit('pixel-home.js','<div class="camp-greeting">', '''${s.equipped.includes('camp-lights')?'<div class="camp-lights" aria-label="已装备星夜灯串">✦ · ✦ · ✦ · ✦ · ✦ · ✦</div>':''}${s.equipped.includes('camp-shelf')?`<div class="camp-shelf" aria-label="旅途展示架">${modes.map(m=>`<span title="${m.name}">${icon(m.id)} ${s.runs.filter(r=>r.mode===m.id&&r.reward>0).length}</span>`).join('')}</div>`:''}<div class="camp-greeting">''')
edit('app.js',"1.5.0 · 平衡版","1.6.0 · 奇遇版")
edit('app.js',"与塔内金币、招募资源、矿物材料独立。", "冒险币用于营地与游戏外观。塔内金币、矿物材料、合作协作币和矿坑旧纪念积分分别记录，不自动兑换。挖矿须至少挖掘5次，按深度、探索与藏宝库结算；零贡献不发币。")
edit('games/camp-bridge.js',"const idFor=run=>{if(!ids.has(run))", "const idFor=run=>{if(run.campRunId)return run.campRunId;if(!ids.has(run))")
edit('games/camp-bridge.js',"const finish=(runId,win,score)=>", "const mineDetails=run=>({digActions:run.stats?.digActions||0,maxDepth:run.maxDepthReached||0,rooms:run.roomsFound?.length||0,treasureReached:!!run.treasureReached});\n  const finish=(runId,win,score,reward=null)=>")
edit('games/camp-bridge.js',"result:{runId,win,score}","result:{runId,win,score,reward}")
edit('games/camp-bridge.js',"mine.summary?.finalValue||0)","mine.summary?.finalValue||0,mineDetails(mine))")
edit('games/camp-bridge.js',"if(command==='enter')window.CampCoop?.enter(data);", "if(command==='enter'){window.CampCosmetics=data.cosmetics||[];window.CampCoop?.enter(data);}")
edit('games/mine/src/scenes/TitleScene.js',"抵达藏宝库后获得，可用于《再上一层》的长期成长。", "矿坑历史纪念积分；保留记录，不用于登塔或营地消费。")
for f in ['games/mine/src/scenes/TitleScene.js','games/mine/src/modes/mining/MiningUI.js']:
 edit(f,'通用货币','矿坑纪念积分')

edit('games/marble/endless-data.js',"export const POWERS=[", """export const EVOLUTIONS={
 net:{requires:['chain','split'],effect:'首次分裂额外连锁3个邻近目标；每颗主弹珠一次，不递归。'},
 iceburst:{requires:['frost','fire'],effect:'爆炸击中冻结目标时，以其中一个目标为中心追加一次碎冰波，不递归。'},
 rail:{requires:['bounce','core'],effect:'主弹珠碰墙或障碍两次后，下一次Boss直击伤害翻倍，命中后重置。'}
};
export const POWERS=[
 {id:'net',name:'雷网分裂',max:1,hint:'组合进化 · 连锁＋分裂'},
 {id:'iceburst',name:'寒霜冰爆',max:1,hint:'组合进化 · 寒霜＋爆裂'},
 {id:'rail',name:'轨道重炮',max:1,hint:'组合进化 · 回响＋重芯'},""")
edit('games/marble/endless-data.js',"export function offerEffect(id,n,tier){", "export function offerEffect(id,n,tier){if(EVOLUTIONS[id])return EVOLUTIONS[id].effect;")
edit('games/marble/endless-data.js',"const paths={", "const paths={net:'M3 3 21 21M21 3 3 21M3 12h18M12 3v18',iceburst:'M12 2v20M2 12h20M4 4l16 16M20 4 4 20',rail:'M4 21 20 5M4 5V2h16v3M8 17l5-1-1-5',")
edit('games/marble/state-endless.js',"xpThreshold} from", "xpThreshold,EVOLUTIONS} from")
edit('games/marble/state-endless.js',"return POWERS.filter(p=>this.level(p.id)<p.max", "return POWERS.filter(p=>(!EVOLUTIONS[p.id]||EVOLUTIONS[p.id].requires.every(id=>this.level(id)>0))&&this.level(p.id)<p.max")
edit('games/marble/state-endless.js',"this.sound('reward');return true}", "const evo=pool.filter(p=>EVOLUTIONS[p.id]);if(evo.length&&(kind==='boss'||r.selections%3===0)&&!r.offer.some(p=>EVOLUTIONS[p.id]))r.offer[r.offer.length-1]={id:evo[Math.floor(this.random()*evo.length)].id,tier:2};this.sound('reward');return true}")
edit('games/marble/state-endless.js'," canRaise(item){", " reroll(){const r=this.run;if(!this.isEndless()||r.phase!=='reward'||r.rerolled||r.tierAdUsed)return false;const selections=r.selections,kind=r.offerType;r.rerolled=true;this.makeOffer(kind);r.selections=selections;this.notice='本局免费重选已使用';this.persist();return true}\n canRaise(item){")
edit('games/marble/state-endless.js',"return item.tier<3&&", "return !EVOLUTIONS[item.id]&&item.tier<3&&")
edit('games/marble/state-endless.js',"stats('core',this.level('core'))*(b?.child ? .45 : 1)", "stats('core',this.level('core'))*(b?.child ? .45 : 1)*(this.level('rail')&&!b?.child&&(b?.wallBounces||0)>=2?2:1)")
edit('games/marble/state-endless.js',"e.hp=Math.max(0,e.hp-amount);", "if(source==='direct'&&b&&this.level('rail')&&!b.child&&(b.wallBounces||0)>=2){b.wallBounces=0;this.effect('blast',e.x,e.y,{radius:36,color:'#f8d678'});}e.hp=Math.max(0,e.hp-amount);")
edit('games/marble/state-endless.js',"explode(x,y,radius){const v=this.run.volley;", "explode(x,y,radius){const frozen=this.level('iceburst')?this.run.room.enemies.find(e=>live(e)&&e.frozen&&Math.hypot(e.x-x,e.y-y)<=radius+e.r):null;const v=this.run.volley;")
edit('games/marble/state-endless.js',"this.damage(e,'blast')}}", "this.damage(e,'blast')}if(frozen){this.effect('frost',frozen.x,frozen.y,{radius:48});for(const q of this.run.room.enemies)if(live(q)&&Math.hypot(q.x-frozen.x,q.y-frozen.y)<48)this.damage(q,'iceburst');}}")
edit('games/marble/state-endless.js',"this.sound('split')}}", "if(this.level('net'))this.chain(e,3);this.sound('split')}}")
edit('games/marble/state-endless.js',"else{if(h.kind==='obstacle'){", "else{b.wallBounces=(b.wallBounces||0)+1;if(h.kind==='obstacle'){")
edit('games/marble/ui-endless.js',"ENDLESS as C}","ENDLESS as C,EVOLUTIONS}")
edit('games/marble/ui-endless.js',"${t.name}<b>${p.name}","${EVOLUTIONS[item.id]?'组合进化':t.name}<b>${p.name}")
edit('games/marble/ui-endless.js',"</small></header><div class=\"inline-cards\">", "</small>${!r.rerolled&&!r.tierAdUsed?btn('免费重选 · 本局一次','reroll','quiet'):''}</header><div class=\"inline-cards\">")
edit('games/marble/main.js',"case 'new':", "case 'reroll':g.reroll();break;case 'new':")
edit('games/marble/render-endless.js',"const color=r.powers.fire?", "const skinColor={amber:'#f5bd66',violet:'#bf8cff',comet:'#ffe685'}[g.orbSkin];const color=skinColor|| (r.powers.fire?")
edit('games/marble/render-endless.js',"'#ffe7a0';for(const b", "'#ffe7a0');for(const b")
edit('games/marble/render-endless.js',"9,'#e2bc73'", "9,skinColor||'#e2bc73'")

with (ROOT/'unified.css').open('a',encoding='utf-8') as f:f.write('\n.camp-lights{position:absolute;top:12px;left:5%;width:90%;text-align:center;color:#ffe59c;letter-spacing:12px;text-shadow:0 0 12px #ffc450;pointer-events:none}.camp-shelf{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:12px;background:#563e2ce8;color:#fff0cc;padding:8px 14px;border:3px solid #be9460;border-radius:8px}.camp-shelf span{display:flex;gap:4px;align-items:center}.camp-shelf .icon{width:16px}\n')
for name,color,symbol in [('camp-lights','#efbc59','✦'),('camp-shelf','#98663d','▤'),('mine-lamp','#63cbe0','✧')]:
 (ROOT/'assets/pixel'/f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect x="16" y="20" width="96" height="88" rx="12" fill="#f5e6c5"/><path d="M24 94h80M32 100h64" stroke="{color}" stroke-width="6"/><text x="64" y="78" text-anchor="middle" font-size="66" fill="{color}">{symbol}</text></svg>',encoding='utf-8')
print('economy, cosmetics and marble updated')
