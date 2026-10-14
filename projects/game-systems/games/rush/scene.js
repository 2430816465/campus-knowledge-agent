import {ANIMATIONS} from './animation.js';
import {drawActor} from './actor.js';
import {drawEnvironment,drawWarning} from './environment.js';
const reduceMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
import {choiceLabel,GROWTH,REALMS,COLORS} from './choice.js';
import {W,H,CHAPTERS,STAGES,gateLabel,EFFECTS} from './data.js';
import {members,castDelay,gateValue,bossSeal} from './battle.js';
export const assets={skeletonWalk:'assets/skeleton-walk/sheet.png',ghost_warrior:'../nightwatch/assets/ghost_warrior.webp',vampire:'../nightwatch/assets/vampire.webp',guard_mid:'../nightwatch/assets/guard_mid.webp',mage_red:'../nightwatch/assets/mage_red.webp',mage_low:'../nightwatch/assets/mage_low.webp',skeleton_elite:'../nightwatch/assets/skeleton_elite.webp',hero:'assets/apprentice/sheet-transparent.png',sword:'assets/flying-sword/sheet-transparent.png',skeleton:'../nightwatch/assets/skeleton.webp',skeleton_captain:'../nightwatch/assets/skeleton_captain.webp',orc_warrior:'../nightwatch/assets/orc_warrior.webp',knight_black:'../nightwatch/assets/knight_black.webp',mage:'../nightwatch/assets/mage_red.webp',rock_golem:'../nightwatch/assets/rock_golem.webp',dragon:'../nightwatch/assets/dragon.webp'};
Object.assign(assets,{environment:'assets/environments-v7/atlas.png'},Object.fromEntries(Object.entries(ANIMATIONS).map(([id,m])=>['motion:'+id,m.url])));
export async function loadAssets(){const art={};await Promise.all(Object.entries(assets).map(async([id,url])=>{const im=new Image();im.src=url;await im.decode();art[id]=im;}));return art;}
function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function sprite(ctx,im,x,y,h){if(!im)return;const w=h*im.width/im.height;ctx.drawImage(im,Math.round(x-w/2),Math.round(y-h/2),Math.round(w),h);}
function frame(ctx,im,x,y,cell,index=0,size=cell){if(!im)return;ctx.drawImage(im,(index%2)*cell,Math.floor(index/2)*cell,cell,cell,Math.round(x-size/2),Math.round(y-size/2),size,size);}
function tree(c,x,y,tone){rect(c,x-3,y,7,28,'#5d6550');rect(c,x-21,y-21,42,25,tone);rect(c,x-15,y-31,30,18,tone);rect(c,x-10,y-38,20,12,tone);}
function label(c,text,x,y,size=17,color='#fff6d7'){c.font=`bold ${size}px 'Microsoft YaHei',sans-serif`;c.textAlign='center';c.fillStyle='#284038';c.fillText(text,x+1,y+2);c.fillStyle=color;c.fillText(text,x,y);}
function bossLabel(c,e){
 const hp=Math.ceil(e.hp).toLocaleString();c.font="bold 24px 'Microsoft YaHei',sans-serif";
 const w=Math.max(66,c.measureText(hp).width+20),x=Math.max(w/2+8,Math.min(W-w/2-8,e.x));
 rect(c,x-w/2,e.y-108,w,32,'#223830f2');rect(c,x-w/2,e.y-108,w,3,e.tint||'#e7c579');
 label(c,hp,x,e.y-83,24,e.flash?'#ffffff':'#fff0bd');
 if(e.name){c.font="bold 16px 'Microsoft YaHei',sans-serif";const nw=c.measureText(e.name).width+16;
  rect(c,e.x-nw/2,e.y+55,nw,24,'#223830e8');label(c,e.name,e.x,e.y+73,16,'#fff3d0');}
}
function runeSprite(c,x,y,type,scale=1){
 const w=14*scale,h=20*scale;rect(c,x-w/2-2,y-h/2-2,w+4,h+4,'#40565b');rect(c,x-w/2,y-h/2,w,h,'#ffedbf');
 if(type==='lightning'){rect(c,x-2*scale,y-7*scale,4*scale,7*scale,'#597fba');rect(c,x-4*scale,y-1*scale,8*scale,3*scale,'#597fba');rect(c,x-2*scale,y+2*scale,3*scale,6*scale,'#597fba');}
 else{rect(c,x-2*scale,y-7*scale,4*scale,13*scale,'#c96643');rect(c,x-4*scale,y-1*scale,8*scale,8*scale,'#c96643');rect(c,x-1*scale,y+2*scale,2*scale,4*scale,'#ffd67c');}
}
function terrain(c,s,time,paintFloor=true){
 const t=s.terrain,shift=time*90,scroll=(y,period=256)=>((y+shift)%period+period)%period-64;
 const floors={brook:'#aca787',bridge:'#8e775c',thorns:'#a59673',grove:'#929d74',shrine:'#afa791',rails:'#a6a29a',scree:'#99958a',crystals:'#a294b4',pillars:'#a4a49c',cargo:'#aba188',forge:'#8e8a85',bastion:'#a8a3a1',clock:'#b1a99f',ruins:'#a39891',prison:'#92939d',runes:'#9698ae',throne:'#a89a9c'};
 if(paintFloor&&floors[t])rect(c,46,0,388,H,floors[t]);
 if(t==='thorns')for(let i=0;i<16;i++){const yy=scroll(i*66,1056);for(const x of [52,418]){rect(c,x,yy,10,3,'#71654f');rect(c,x+3,yy-6,3,15,'#c0ab88');}}
 if(t==='grove')for(let i=0;i<16;i++){const yy=scroll(i*67,1072),x=i%2?414:56;rect(c,x,yy,8,3,'#c2bc82');rect(c,x+3,yy-3,3,9,'#d8ca9d');}
 if(t==='scree')for(let i=0;i<9;i++)for(let j=0;j<20;j++)rect(c,50+j*19,scroll(i*116+j*7,1044),12,3,'#d0cab03b');
 if(t==='cargo')for(let i=0;i<7;i++)for(let j=0;j<11;j++){const yy=scroll(i*148+j*9,1036),x=130+(i%2?10-j:j)*14;for(const offset of [0,90])rect(c,x+offset,yy,3,5,'#756b5145');}
 if(t==='pillars')for(let i=0;i<5;i++){const yy=scroll(i*190,950);for(const x of [142,330]){rect(c,x-17,yy,34,3,'#d2cdb766');rect(c,x-17,yy+34,34,3,'#d2cdb766');rect(c,x-17,yy,3,37,'#d2cdb766');rect(c,x+14,yy,3,37,'#d2cdb766');}}
 if(t==='bastion'){for(const x of [46,422])rect(c,x,0,12,H,'#767576');for(let i=0;i<18;i++){const yy=scroll(i*51,918);rect(c,58,yy,10,20,'#767576');rect(c,412,yy,10,20,'#767576');}}
 if(t==='brook'||t==='bridge'){for(const x of [0,442]){rect(c,x,0,38,H,'#4c8d98');for(let y=0;y<H;y+=36)rect(c,x+5,scroll(y,864),26,3,'#91bbc2');}}
 if(t==='bridge')for(let y=-32;y<H;y+=32){const yy=(y+shift)%832;rect(c,46,yy,388,5,'#594f43');for(const x of [66,410])rect(c,x,yy+14,4,4,'#d4b28a');}
 if(['shrine','bastion','prison','throne','pillars'].includes(t))for(let y=-72;y<H;y+=72){const yy=(y+shift)%864;rect(c,46,yy,388,3,'#645f6138');for(let x=46;x<430;x+=78)rect(c,x+(Math.floor(y/72)%2?39:0),yy,2,72,'#645f6138');}
 if(t==='rails'){for(const x of [132,348]){for(let y=0;y<H;y+=36)rect(c,x-27,(y+shift)%828,54,7,'#6a69604a');rect(c,x-18,0,4,H,'#dad0b7');rect(c,x+15,0,4,H,'#dad0b7');}}
 if(t==='scree'||t==='ruins')for(let i=0;i<16;i++){const x=64+(i*83)%320,yy=scroll(i*87,960);rect(c,x,yy,28+(i%3)*12,5,'#68696645');rect(c,x+12,yy+5,4,21,'#68696635');}
 if(t==='cargo')for(let i=0;i<6;i++){const yy=scroll(i*149,960),x=i%2?450:4;rect(c,x,yy,26,32,'#806c50');rect(c,x+2,yy+3,22,4,'#c0a47d');rect(c,x+11,yy,4,32,'#574f44');}
 if(t==='forge'){for(const x of [0,446])rect(c,x,0,34,H,'#564e49');for(let y=0;y<H;y+=85){const yy=(y+shift)%850;for(const x of [7,452]){rect(c,x,yy,20,28,'#c9804f');rect(c,x+5,yy+6,10,16,'#e7b866');}rect(c,56,yy+36,368,4,'#665e5240');}}
 if(t==='prison')for(let y=0;y<H;y+=58){const yy=(y+shift)%870;for(const x of [9,456]){rect(c,x,yy,6,35,'#4e5968');rect(c,x-4,yy+11,14,5,'#bec0bb');}}
 if(t==='throne'){rect(c,140,0,200,H,'#7f5d704a');rect(c,140,0,4,H,'#d3b67a');rect(c,336,0,4,H,'#d3b67a');}
 if(t==='clock'||t==='runes'||t==='shrine'){for(let i=0;i<4;i++){const yy=scroll(i*230,920);c.strokeStyle=t==='runes'?'#655e9b66':'#8a795166';c.lineWidth=3;c.beginPath();c.arc(240,yy, t==='clock'?94:52,0,Math.PI*2);c.stroke();rect(c,238,yy-35,4,70,'#c8c19a55');rect(c,205,yy-2,70,4,'#c8c19a55');}}
 if(t==='crystals')for(let i=0;i<8;i++){const x=i%2?455:15,yy=scroll(i*125,1000);rect(c,x-8,yy-22,17,36,'#70668d');rect(c,x-4,yy-29,9,31,'#baa5d2');}
 if(['pillars','bastion','shrine','throne'].includes(t))for(let i=0;i<8;i++){const x=i%2?449:6,yy=scroll(i*122,976);rect(c,x,yy,25,46,'#797b7c');rect(c,x-2,yy-4,29,8,'#cfccbb');rect(c,x+6,yy+5,5,33,'#b7b8ac');}
 if(['trail','thorns','grove'].includes(t))for(let i=0;i<11;i++){const yy=scroll(i*94,1034),x=i%2?16:464;tree(c,x,yy,t==='thorns'?'#635d55':t==='grove'?'#667a48':'#45675b');if(t==='thorns'){rect(c,x-11,yy+27,25,5,'#877161');rect(c,x-5,yy+20,4,17,'#a99575');}}
}
export function draw(canvas,b,art,selected=1){const c=canvas.getContext('2d');c.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);c.imageSmoothingEnabled=false;
 const stage=STAGES[(b?.stage||selected)-1],chapter=CHAPTERS[stage.chapter];rect(c,0,0,W,H,chapter.color);rect(c,38,0,404,H,chapter.road);rect(c,38,0,8,H,'#ccc2a0');rect(c,434,0,8,H,'#ccc2a0');
 const sceneTime=b?.mode==='defense'?0:(b?.arenaTime??b?.time??0);
 const mapped=drawEnvironment(c,art.environment,stage.chapter,sceneTime);
 if(!mapped)terrain(c,stage,sceneTime);else {c.save();c.globalAlpha=.38;terrain(c,stage,sceneTime,false);c.restore();}
 rect(c,42,595,392,4,'#b8af8940');
 if(!b)return;
 if(b.mode==='defense'){rect(c,42,599,396,8,'#eadbb4');label(c,'灵阵 '+Math.ceil(b.core)+' / 100 · 护盾 '+b.shield,240,592,16);for(let i=0;i<3;i++){rect(c,46+i*132,180,124,5,i===b.aimLane?'#ffdf8b':'#82957c');}}
 c.save();if(b.shake&&!reduceMotion?.matches)c.translate(Math.sin(b.time*130)*3,0);
 for(const e of b.entities)drawWarning(c,e);
 for(const e of b.entities){if(e.kind==='gates'&&e.choices){
   const width=396/e.choices.length;
   for(const [i,g] of e.choices.entries()){const x=42+i*width+3,w=width-6;colorGate(c,x,e.y,w,g,e.hit);}
   continue;
  }if(e.kind==='gates'){
  for(const [i,g]of [e.left,e.right].entries()){const split=e.split||240,x=i?split+8:46,w=i?434-x:split-54,result=gateValue(e.hit?(e.before??b.count):b.count,g.op,g.value),color=g.effect?EFFECTS[g.effect].color:result===0?'#993f43':g.op==='÷'?'#6c608e':result<b.count?'#a05b51':'#3c8a78';c.globalAlpha=e.hit?.32:1;rect(c,x,e.y-42,w,78,color);rect(c,x,e.y-42,w,4,'#efe2b3');rect(c,x,e.y+32,w,4,'#efe2b3');rect(c,x,e.y-42,4,78,'#efe2b3');rect(c,x+w-4,e.y-42,4,78,'#efe2b3');c.globalAlpha=1;}
 }else if(e.kind==='rock'){c.fillStyle='#4e645330';c.beginPath();c.ellipse(e.x,e.y+18,43,13,0,0,Math.PI*2);c.fill();rect(c,e.x-29,e.y-24,58,44,'#7c817b');rect(c,e.x-21,e.y-33,35,14,'#9b9f90');rect(c,e.x-33,e.y-12,12,24,'#686e68');rect(c,e.x-8,e.y-18,24,7,'#b8b7a4');}
 else if(e.kind==='supply'){
 c.fillStyle='#293b3a55';c.beginPath();c.ellipse(e.x,e.y+23,29,8,0,0,Math.PI*2);c.fill();
 rect(c,e.x-26,e.y-22,52,45,'#324743');rect(c,e.x-23,e.y-19,46,39,e.loot==='recruit'?'#63978c':'#5b82a3');
 rect(c,e.x-23,e.y-19,46,5,'#f2d89f');rect(c,e.x-23,e.y+13,46,6,'#e6be77');rect(c,e.x-4,e.y-3,8,11,'#ffedb1');
 if(e.loot==='recruit'){frame(c,art.hero,e.x-12,e.y-2,40,0,26);frame(c,art.hero,e.x+12,e.y-2,40,0,26);}else{rect(c,e.x-9,e.y-10,18,17,'#b0e6eb');rect(c,e.x-6,e.y+7,12,6,'#b0e6eb');}
 rect(c,e.x-40,e.y-47,80,21,'#213b35ee');label(c,e.name,e.x,e.y-31,13,'#fff0b8');
 rect(c,e.x-24,e.y+25,48,4,'#354e48');rect(c,e.x-24,e.y+25,48*Math.max(0,e.hp/e.maxHp),4,'#f3d187');
 }
 else if(e.kind==='chest'){
 const trap=e.loot==='trap',army=['rescue','army'].includes(e.loot),rune=['lightning','flame'].includes(e.loot),color=trap?'#ad4e46':army?'#669fa9':rune?(e.loot==='lightning'?'#6b78ac':'#c2804a'):'#af8155';
 rect(c,e.x-27,e.y-25,54,48,'#3b4c46');rect(c,e.x-24,e.y-22,48,42,color);rect(c,e.x-24,e.y-22,48,5,trap?'#ef9d74':'#ebd099');rect(c,e.x-24,e.y+16,48,4,'#805d45');
 if(trap){rect(c,e.x-11,e.y-13,22,19,'#fff0d0');rect(c,e.x-8,e.y-8,5,5,'#623c37');rect(c,e.x+3,e.y-8,5,5,'#623c37');rect(c,e.x-6,e.y+5,12,5,'#fff0d0');rect(c,e.x+10,e.y-29,3,8,'#ecd28c');rect(c,e.x+11,e.y-32,5,4,'#ffce72');}
 else if(army){frame(c,art.hero,e.x-10,e.y,40,0,28);frame(c,art.hero,e.x+10,e.y,40,0,28);if(!e.open&&e.delivery!=='break')for(let x=-20;x<=20;x+=10)rect(c,e.x+x,e.y-22,3,43,'#465d63');}
 else if(rune)runeSprite(c,e.x,e.y,e.loot,1.4);
 else frame(c,art.sword,e.x,e.y,24,0,36);
 label(c,e.open?'靠近拾取':trap?'爆裂 −'+(e.amount||4):army?'伙伴 +'+(e.amount||5):e.loot==='lightning'?'雷符 · 连锁':e.loot==='flame'?'炎符 · 范围':'剑诀 +1',e.x,e.y-42,12,trap?'#ffded1':'#fff6d7');
 }
 else {c.fillStyle='#26382926';c.beginPath();c.ellipse(e.x,e.y+23,e.kind==='boss'?39:20,9,0,0,Math.PI*2);c.fill();if(e.warning&&!e.lock){c.strokeStyle='#f4ce81';c.lineWidth=4;c.beginPath();c.arc(e.x,e.y,56,0,Math.PI*2);c.stroke();}if(e.kind==='boss'&&b.layoutVersion>=6){if(e.skill==='shield'&&Math.floor(e.age)%6<2){c.strokeStyle='#aedceb';c.lineWidth=3;c.beginPath();c.ellipse(e.x,e.y,54,57,0,0,Math.PI*2);c.stroke();}for(let j=0;j<e.crown+2;j++)rect(c,e.x-22+j*14,e.y-64-(j%2)*7,10,14,e.tint);}
 if(b.layoutVersion>=7&&drawActor(c,art,e)){}else if(e.type==='skeleton'&&art.skeletonWalk){
   const frame=Math.floor(e.age*12+(e.id||0)*1.7)%8,scale=48/93.75;
   c.drawImage(art.skeletonWalk,(frame%4)*128,Math.floor(frame/4)*128,128,128,
     e.x-64*scale,e.y+24-116*scale,128*scale,128*scale);
 }else sprite(c,art[e.type],e.x,e.y+Math.sin(e.age*9)*2,e.kind==='boss'?100:48);if(e.kind==='boss'&&b.layoutVersion<6&&['broken','pending'].includes(bossSeal(b))){c.strokeStyle=bossSeal(b)==='broken'?'#e58c92':'#e8c77e';c.lineWidth=4;c.beginPath();c.arc(e.x,e.y,58,0,Math.PI*2);c.stroke();label(c,bossSeal(b)==='broken'?'封印无法解除':'等待符印齐备',e.x,e.y+100,13);}}
 if(e.hp>0&&e.kind!=='boss'&&e.kind!=='supply'&&b.layoutVersion>=6){label(c,Math.ceil(e.hp).toLocaleString(),e.x,e.y-29,19,e.flash?'#fff':'#fff0bd');if(e.role!=='walk')label(c,e.name,e.x,e.y+36,11,'#fff7e0');}else if(e.hp>0&&b.layoutVersion<6){const w=e.kind==='boss'?100:46;rect(c,e.x-w/2,e.y-(e.kind==='boss'?63:31),w,5,'#596659');rect(c,e.x-w/2,e.y-(e.kind==='boss'?63:31),w*Math.max(0,e.hp/e.maxHp),5,'#bf695b');}
 }
 for(const p of b.bullets){if(p.phase==='summon'&&p.age<p.delay)continue;
 if(['lightning','flame'].includes(p.weaponType)){if(p.phase!=='summon')rect(c,p.x-1,p.y+9,2,10,p.weaponType==='lightning'?'#9ae7f2':'#ffbc73');runeSprite(c,p.x,p.y,p.weaponType,.55);}
 else{if(p.phase!=='summon')rect(c,p.x-1,p.y+8,2,p.burst?18:b.weapon>=2?10:5,p.burst?'#ffd986':b.weapon>=2?'#76d7d1':'#bbd8c2');frame(c,art.sword,p.x,p.y,24,Math.floor((p.age||0)*12)%4);if(b.weapon>0)rect(c,p.x-1,p.y-6,2,8,b.weapon>=2?'#6ee0e1':'#d9e9c5');}
 }
 const squad=members(b);
 for(const m of squad){c.fillStyle='#354b4744';c.beginPath();c.ellipse(m.x,m.y+17,10,3,0,0,Math.PI*2);c.fill();if(m.leader||b.burstTime>0){c.strokeStyle=b.burstTime>0?'#ffda88':'#e9c973';c.lineWidth=2;c.stroke();}const age=b.time-(b.lastCast??-1)-castDelay(m.index);if(b.growth?.realm){const color=COLORS[b.growth.realm];rect(c,m.x-13,m.y+17,26,3,color);rect(c,m.x-13,m.y-9,4,22,color);rect(c,m.x+9,m.y-9,4,22,color);if(b.growth.realm>=2&&m.leader){rect(c,m.x-21,m.y-5,9,5,color);rect(c,m.x+12,m.y-5,9,5,color);}if(b.growth.realm>=3&&m.leader){rect(c,m.x-23,m.y-12,6,9,color);rect(c,m.x+17,m.y-12,6,9,color);}if(b.growth.realm>=4&&m.leader){rect(c,m.x-9,m.y-24,18,3,color);rect(c,m.x-4,m.y-29,8,4,color);}}
 frame(c,art.hero,m.x,m.y,40,age>=0&&age<.20?Math.min(3,Math.floor(age/.05)):0);}
 // 让门上的决策信息位于飞行特效前方。
 for(const e of b.entities.filter(e=>e.kind==='gates'&&!e.choices)){c.globalAlpha=e.hit?.32:1;for(const [i,g]of [e.left,e.right].entries()){const split=e.split||240,x=i?split+8:46,w=i?434-x:split-54;if(b.layoutVersion>=4&&(b.layoutVersion<5||b.stage<=2)&&e.correctSide===(i?'right':'left'))label(c,'◆ 破阵',x+w/2,e.y-26,12,'#ffe29c');if(g.effect){label(c,EFFECTS[g.effect].name,x+w/2,e.y-10,22);label(c,'+'+EFFECTS[g.effect].percent*g.value+'%',x+w/2,e.y+16,26);}else label(c,gateLabel(g),x+w/2,e.y+8,Math.min(30,w/3.6));if(g.shoot)label(c,'射击提高人数',x+w/2,e.y+28,10);}c.globalAlpha=1;}
 for(const e of b.entities.filter(e=>e.choices)){const width=396/e.choices.length;for(const [i,g]of e.choices.entries()){const x=42+(i+.5)*width;c.globalAlpha=e.hit?.35:1;label(c,choiceLabel(g),x,e.y+(g.upgrade?-4:9),g.upgrade?20:28);if(g.upgrade){label(c,({sword:'伤害 +30%',art:'射速 +12%',realm:'伤害 +35% · 盾 +8',haste:'射速 +15%',damage:'伤害 +20%',range:'射程 +60',chain:'增加连锁目标',blast:'扩大爆炸范围',recruit:'伙伴 +6',shield:'护盾 +12'})[g.upgrade],x,e.y+13,12);if(GROWTH[g.upgrade].max)label(c,'当前 '+(b.growth[g.upgrade]||0)+' / '+GROWTH[g.upgrade].max,x,e.y+29,11);}c.globalAlpha=1;}}
 for(const p of b.enemyBullets){rect(c,p.x-5,p.y-5,10,10,'#a866bb');rect(c,p.x-2,p.y-2,4,4,'#f6c1ef');}
 for(const p of b.effects){c.globalAlpha=Math.min(1,p.life*5);if(p.kind==='spark'){rect(c,p.x,p.y,4,4,p.color);}else if(p.kind==='arc'){c.strokeStyle=p.color;c.lineWidth=3;c.beginPath();c.moveTo(p.x,p.y);c.lineTo((p.x+p.toX)/2+7,(p.y+p.toY)/2);c.lineTo(p.toX,p.toY);c.stroke();}else if(p.kind==='blast'){c.strokeStyle=p.color;c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,p.radius*(1-p.life/.25),0,Math.PI*2);c.stroke();}else rect(c,p.x,p.y,4,4,p.color);}c.globalAlpha=1;
 // Health follows each boss and stays legible above projectiles and effects.
 for(const e of b.entities)if(e.kind==='boss'&&e.hp>0&&!e.dead)bossLabel(c,e);
 c.restore();
}

function colorGate(c,x,y,w,g,hit){c.globalAlpha=hit?.32:1;rect(c,x,y-39,w,76,g.upgrade?'#284942':'#286951');for(const [xx,yy,ww,hh]of [[x,y-39,w,4],[x,y+33,w,4],[x,y-39,3,76],[x+w-3,y-39,3,76]])rect(c,xx,yy,ww,hh,g.upgrade?GROWTH[g.upgrade].color:'#f5dfad');c.globalAlpha=1;}
