// Read-only reference execution. Native build never imports or embeds JavaScript.
import {writeFileSync} from 'node:fs';
import {CHARACTERS,STAGES,BOONS,TRIAL_TEMPLATES} from '../../legacy-v03/src/content.ts';
import {createBattle,act,autoAct,currentActor,chooseAutoAction,useMethod,legalTargets,legalSources,combineAvailability} from '../../legacy-v03/src/battle.ts';
const fixtures=[];
const copy=x=>JSON.parse(JSON.stringify(x));
const guaranteed=['nezha','huangfeihu','bigan','leizhenzi','yangjian'];
const team=(ids=guaranteed,level=5,treasure=0,branch='A')=>ids.map(id=>({id,level,treasure,branch}));
const enemies=[{id:'front',name:'前排陪练',role:'soldier',row:'front',hp:50000,atk:80,def:20,speed:20},{id:'archer',name:'后排弓妖',role:'archer',row:'back',hp:50000,atk:100,def:20,speed:18}];
function fixture(name,stageId,members,options={},modify=()=>{},execute=(b,op)=>op('auto')) {
 const input={stageId,team:members,options:{...options,battleId:name}};
 const b=createBattle(stageId,members,input.options), created=copy(b);
 modify(b); const initial=copy(b), steps=[];
 const op=(kind,data)=>{
   let output;
   if(kind==='auto') {output=chooseAutoAction(b); const accepted=autoAct(b); if(!accepted)throw Error(name+' rejected auto');}
   if(kind==='act') output=act(b,data);
   if(kind==='method') output=useMethod(b);
   if(kind==='actor') output=currentActor(b)?.uid??null;
   if(kind==='combine') output=combineAvailability(b);
   if(kind==='set') {Object.assign(b.units.find(u=>u.id===data.id),data.patch);output=null;}
   if(kind==='focus') {focus(b,data);output=null;}
   if(kind==='nextRound') {b.cursor=b.order.length;output=currentActor(b)?.uid??null;}
   steps.push({kind,...(data!==undefined?{data}:{}),output});return output;
 };
 execute(b,op); fixtures.push({name,input,created,initial,steps,expected:copy(b)});
}
function focus(b,id) {const u=b.units.find(u=>u.id===id);b.order=[u.uid,...b.units.filter(x=>x!==u&&x.hp>0).map(x=>x.uid)];b.cursor=0;return u;}
function finish(methodRound=1) {return (b,op)=>{let n=0;while(!b.result&&n++<1000){if(b.round>=methodRound&&currentActor(b)?.side==='ally'&&!b.methodUses&&b.method)op('method');op('auto');}if(!b.result)throw Error('Unfinished');};}
// All twelve authentic progression stages and two distinct ordinary boss strategies, 20 seeds each.
for(const s of STAGES)fixture(`progression-${s.id}`,s.id,team(guaranteed.slice(0,s.id<=2?3:s.id===3?4:5),s.recommendedLevel,s.chapter>1?1:0),{seed:18,method:'break',...(s.chapter>1?{pill:'ward'}:{})},undefined,finish());
for(const stageId of [4,8,12])for(let seed=1;seed<=20;seed++){
 const level=stageId===4?3:stageId===8?7:11, treasure=stageId===4?0:1;
 fixture(`boss-${stageId}-burst-${seed}`,stageId,team(guaranteed,level,treasure),{seed,method:'break',...(stageId===4?{}:{pill:'ward'})},undefined,finish());
 const sustain=team(['nezha','huangfeihu','bigan','leizhenzi','zhaogongming'],level,treasure);sustain.find(t=>t.id==='bigan').branch='B';
 fixture(`boss-${stageId}-sustain-${seed}`,stageId,sustain,{seed,method:'ward'},undefined,finish(2));
}
// Every hero at pre-branch and unlocked levels, both branches, and treasure extremes.
for(const c of CHARACTERS)for(const branch of ['A','B'])for(const level of [1,3])for(const treasure of [0,3]){
 const companion=c.id==='bigan'?'huangfeihu':'bigan';
 fixture(`skill-${c.id}-${branch}-L${level}-T${treasure}`,12,team([c.id,companion],level,treasure,branch),{enemies,seed:163,method:'break'},b=>{
  const actor=focus(b,c.id);actor.formation=2;actor.morale=2;
  for(const u of b.units){if(u.side==='ally'){u.hp=Math.floor(u.maxHp*.3);u.statuses.push({id:'burn',name:'灼烧',turns:2,power:8});}else{u.charge=2;u.shield=1000;u.statuses.push({id:'weakened',name:'削弱',turns:2,power:.2});}}
  if(c.id==='xuandu')b.units[1].statuses.push({id:'atkUp',name:'战令',turns:2,power:.2});
 },(b,op)=>{const sourceId=c.id==='xuandu'?b.units[1].uid:undefined;op('act',{kind:'skill',...(sourceId?{sourceId}:{}),targetId:legalTargets(b,'skill',sourceId)[0]});op('nextRound');op('nextRound');});
}
for(const branch of ['A','B']){
 fixture(`combined-${branch}`,12,team(['yunxiao','qiongxiao','bixiao','tongtian','xuandu'],11,1,branch),{seed:182,method:'thunderward',boons:BOONS.map(x=>x.id)},b=>focus(b,'yunxiao'),(b,op)=>{op('combine');op('act',{kind:'skill',form:'combined'});finish()(b,op);});
 for(const blocked of ['yunxiao','qiongxiao','bixiao'])fixture(`blocked-${branch}-${blocked}`,12,team(['yunxiao','qiongxiao','bixiao'],5,0,branch),{enemies},b=>{focus(b,'yunxiao');b.units.find(x=>x.id===blocked).statuses.push({id:'stun',name:'牵制',turns:1,power:1});},(b,op)=>{op('combine');op('act',{kind:'skill',form:'combined'});op('act',{kind:'skill',form:'normal'});op('auto');});
 for(const copied of [false,true])fixture(`xuandu-copy-${branch}-${copied}`,12,team(['xuandu','bigan'],5,1,branch),{enemies},b=>{focus(b,'xuandu');b.units[1].statuses.push({id:'atkUp',name:'战令',turns:2,power:.2,copied},{id:'guard',name:'机缘护持',turns:2,power:.2,sourceKind:'boon',sourceId:'solidarity'});},(b,op)=>op('act',{kind:'skill',sourceId:b.units[1].uid,targetId:b.units[0].uid}));
 fixture(`xuandu-solo-${branch}`,12,team(['xuandu'],5,1,branch),{enemies},b=>{focus(b,'xuandu');b.units[0].statuses.push({id:'atkUp',name:'战令',turns:2,power:.2,sourceUid:b.units[0].uid});},(b,op)=>op('act',{kind:'skill',sourceId:b.units[0].uid,targetId:b.units[0].uid}));
}
for(const pill of ['cleanse','heal','ward','training'])for(const method of ['cleanse','ward','break','thunderward'])fixture(`boons-${pill}-${method}`,12,team(['zhouwang','zhaogongming','bixiao','bigan','nezha'],11,1),{seed:981,pill,method,boons:BOONS.map(x=>x.id)},undefined,finish(2));
fixture('invalid-target-no-consumption',4,team(['yangjian'],3),{seed:22},undefined,(b,op)=>op('act',{kind:'attack',targetId:b.units.find(u=>u.side==='enemy'&&u.row==='back').uid}));
fixture('dead-healer-periodic-provenance',12,team(['taiyi','bigan'],5),{enemies},b=>focus(b,'taiyi'),(b,op)=>{op('act',{kind:'skill'});op('set',{id:'taiyi',patch:{hp:0}});op('set',{id:'bigan',patch:{hp:10,shield:0,shieldLayers:[]}});op('nextRound');});
fixture('cleanse-pill-per-person-once',12,team(['nezha','huangfeihu','bigan'],5),{enemies,seed:182,pill:'cleanse',boons:['clarity']},b=>{focus(b,'archer');b.units.find(x=>x.id==='archer').role='burner';},(b,op)=>{op('act',{kind:'attack'});op('set',{id:'archer',patch:{cd:0}});op('focus','archer');op('act',{kind:'attack'});});
for(const treasure of [0,1])fixture(`nezha-follow-front-back-${treasure}`,12,team(['nezha'],5,treasure),{enemies,seed:163},b=>{focus(b,'nezha');for(const u of b.units.filter(x=>x.side==='enemy')){u.hp=u.row==='front'?1000:10000;u.statuses.push({id:'weakened',name:'削弱',turns:2,power:.1});}},(b,op)=>op('act',{kind:'attack',targetId:b.units[1].uid}));
fixture('lightning-normal-attack-limited',12,team(['leizhenzi','bigan'],5),{enemies,seed:163},b=>{focus(b,'leizhenzi');b.units.find(u=>u.id==='front').charge=2;},(b,op)=>{op('act',{kind:'attack'});op('focus','leizhenzi');op('act',{kind:'skill'});});
fixture('guard-protector-dies-no-buff',12,team(['huangfeihu','nezha','bigan'],5),{enemies,seed:163},b=>focus(b,'huangfeihu'),(b,op)=>{op('act',{kind:'skill'});op('set',{id:'huangfeihu',patch:{hp:1,maxHp:1,shield:0,shieldLayers:[]}});op('set',{id:'bigan',patch:{hp:Math.floor(b.units.find(x=>x.id==='bigan').maxHp*.4)}});op('set',{id:'archer',patch:{atk:500}});op('focus','archer');op('act',{kind:'attack'});});
fixture('method-overwrites-attribution',12,team(['yunxiao'],5),{enemies,method:'break'},b=>focus(b,'yunxiao'),(b,op)=>{op('act',{kind:'skill'});op('focus','yunxiao');op('method');});
for(const shield of [0,7])fixture(`actual-overkill-${shield}`,12,team(['yangjian'],5),{enemies},b=>{focus(b,'yangjian');Object.assign(b.units[1],{hp:5,shield,shieldLayers:[]});},(b,op)=>op('act',{kind:'attack',targetId:b.units[1].uid}));
for(const role of ['stone','shield','burner','healer','charger','furnace','dragon','archer','soldier'])fixture(`enemy-role-${role}`,12,team(['huangfeihu','bigan'],20,1),{enemies:[{...enemies[0],role,will:role==='dragon'?8:0}],seed:228},b=>{b.units.at(-1).hp=20000;focus(b,'front');},(b,op)=>{for(let n=0;n<25&&!b.result;n++)op('auto');});
// Full native trial roster: fourteen heroes through every standard isolated template.
for(const c of CHARACTERS)for(const t of TRIAL_TEMPLATES){
 const ids=[c.id,...t.defaultTeam.filter(id=>id!==c.id)].slice(0,5);
 fixture(`trial-${c.id}-${t.id}`,t.stageId,team(ids,t.level,t.treasure),{trial:true,enemies:t.enemies,method:'ward',seed:173},undefined,finish());
}
fixture('shield-FIFO-provider-heal-overflow',12,team(['nezha','huangfeihu','taiyi'],5),{enemies},b=>focus(b,'nezha'),(b,op)=>{
 const uid=b.units[0].uid;
 op('act',{kind:'guard',targetId:uid});op('focus','huangfeihu');op('act',{kind:'guard',targetId:uid});
 op('set',{id:'front',patch:{atk:700}});op('focus','front');op('act',{kind:'attack'});
 op('set',{id:'nezha',patch:{hp:b.units[0].maxHp-3}});op('focus','taiyi');op('act',{kind:'skill'});
});
fixture('xuandu-stronger-retains-source',12,team(['xuandu','jifa','bixiao'],5,0,'B'),{enemies},b=>{
 focus(b,'xuandu');b.units[1].statuses.push({id:'atkUp',name:'战令',turns:2,power:.1,sourceUid:b.units[1].uid});
 b.units[2].statuses.push({id:'atkUp',name:'战令',turns:3,power:.4,sourceUid:b.units[2].uid});
},(b,op)=>{op('act',{kind:'skill',sourceId:b.units[1].uid,targetId:b.units[2].uid});op('set',{id:'xuandu',patch:{cd:0}});op('set',{id:'bixiao',patch:{statuses:[]}});op('focus','xuandu');op('act',{kind:'skill',sourceId:b.units[1].uid,targetId:b.units[2].uid});op('focus','jifa');op('act',{kind:'skill',targetId:b.units[3].uid});});
fixture('boon-follow-pending-illegal-keeps-charge',12,team(['yangjian','nezha'],5),{enemies,boons:['initiative','victory']},b=>focus(b,'yangjian'),(b,op)=>{
 op('act',{kind:'skill',targetId:b.units[2].uid});op('set',{id:'front',patch:{hp:1}});op('focus','yangjian');op('act',{kind:'attack',targetId:b.units[2].uid});op('focus','nezha');op('act',{kind:'attack',targetId:'illegal'});op('act',{kind:'attack'});op('set',{id:'yangjian',patch:{cd:0}});op('focus','yangjian');op('act',{kind:'skill'});
});
fixture('boon-periodic-death-pending',12,team(['nezha','bigan'],5),{enemies,boons:['victory']},b=>{focus(b,'nezha');b.units[2].hp=1;b.units[2].statuses.push({id:'burn',name:'灼烧',turns:2,power:10,sourceUid:b.units[0].uid,sourceKind:'character',sourceId:'nezha',actionId:'old-burn'});},(b,op)=>{op('nextRound');op('act',{kind:'attack'});});
for(const seed of [0,1,2147483648,4294967295])fixture(`unsigned-seed-${seed}`,8,team(guaranteed,7,1),{seed,method:'cleanse',pill:'heal',boons:BOONS.map(x=>x.id)},undefined,finish(2));
for(let n=0;n<28;n++){
 const ids=Array.from({length:5},(_,i)=>CHARACTERS[(n+i*3)%14].id);
 fixture(`mixed-roster-${n}`,12,team(ids,9,n%3,n%2?'A':'B'),{seed:137*n+23,method:['ward','cleanse','break','thunderward'][n%4],pill:['heal','cleanse','ward','training'][n%4],boons:BOONS.map(x=>x.id)},undefined,finish(2));
}
const file=new URL('./fixtures/combat-reference.json',import.meta.url);
writeFileSync(file,JSON.stringify({reference:'legacy-v03/src/battle.ts',fixtures}));
console.log(`Exported ${fixtures.length} source-engine replay fixtures to ${file.pathname}`);
