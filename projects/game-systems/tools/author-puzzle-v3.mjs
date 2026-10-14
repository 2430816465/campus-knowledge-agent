// Fixed campaign authoring. Geometry is specified by hand; offline simulation places
// clear targets along candidate routes, checks tolerance and freezes the result.
import fs from 'node:fs';
import {PuzzleGame,clone} from '../games/marble/puzzle-state.js';
import {LEVELS as old} from '../output/puzzle-v3/previous-levels.js';
import {SOLUTIONS as oldSolutions} from '../output/puzzle-v3/previous-solutions.js';
const W=(id,x,y,w,h,extra={})=>({id,x,y,w,h,...extra});
const P=(x1,y1,x2,y2,extra={})=>({x1,y1,x2,y2,...extra});
const O=(x=320,y=320)=>({x,y});
const portal=(a,b,r=22)=>[{id:'p0',...a,r,pair:'p1',label:'A'},{id:'p1',...b,r,pair:'p0',label:'A'}];
const chapters=['初识弹道','石廊探路','机关进阶','连击回路','空间折跃','碎镜布局','双珠分流','交织机关','路线筹谋','终极遗迹'];
const levels=Array(50),reports=Array(50);
function make(l){const g=new PuzzleGame(0);g.level=clone(l);g.left=l.shots;return g}
function base(name,hint,extra={}){return {name,hint,objective:hint,origin:O(),walls:[],plates:[],portals:[],splitters:[],nodes:[],requires:[],exit:{x:-999,y:-999,r:23},shots:3,par:1,contacts:18,...extra}}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)}
function clear(p,l,r=27){
 if(p.x<50||p.x>590||p.y<65||p.y>295||Math.hypot(p.x-l.origin.x,p.y-l.origin.y)<60)return false;
 for(const w of l.walls){const x=Math.max(w.x,Math.min(w.x+w.w,p.x)),y=Math.max(w.y,Math.min(w.y+w.h,p.y));if(Math.hypot(p.x-x,p.y-y)<r)return false}
 for(const q of l.plates)if(distance(p,{x:q.x1,y:q.y1},{x:q.x2,y:q.y2})<r)return false;
 for(const q of [...l.portals,...l.splitters])if(Math.hypot(p.x-q.x,p.y-q.y)<q.r+r)return false;
 return true;
}
function points(g,l){const points=[];for(let ball=0;ball<g.lastPaths.length;ball++){const path=g.lastPaths[ball];for(let j=1;j<path.length;j++){
 if(path[j].jump)continue;const a=path[j-1],b=path[j],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<65)continue;
 for(const t of [.38,.62]){const p={x:Math.round(a.x+(b.x-a.x)*t),y:Math.round(a.y+(b.y-a.y)*t),ball,seg:j-1,dir:Math.abs(b.x-a.x)>Math.abs(b.y-a.y)?b.x>a.x?'right':'left':b.y>a.y?'down':'up'};if(clear(p,l))points.push(p)}
 }}return points;}
function valid(l,angles){const g=make(l);for(const a of angles)g.fireComplete(a*Math.PI/180);return g.phase==='won'}
function window(l,a,min){let lo=a,hi=a;while(lo>a-10&&valid(l,[lo-.2]))lo-=.2;while(hi<a+10&&valid(l,[hi+.2]))hi+=.2;if(hi-lo<min)return null;const center=(lo+hi)/2;for(let d=lo;d<=hi;d+=.05)if(!valid(l,[d]))return null;return {angles:[center],windows:[[lo,hi]]};}
function put(slot,l,r){levels[slot-1]=l;reports[slot-1]={level:slot,name:l.name,...r};console.log('AUTHORED',slot,l.name,r.angles)}
function authored(slot,name,hint,geometry,rule={}){
 const l=base(name,hint,geometry),count=rule.count||0,minWidth=rule.width||2.2;
 let candidates=[];
 for(let angle=-76;angle<=76;angle+=1){const g=make(l);g.fireComplete(angle*Math.PI/180);
  if(rule.portal&&!g.trace.some(t=>t.id==='p0'))continue;
  if(rule.fragile&&!g.brokenPlates.length)continue;
  if(rule.split&&!g.splitUsed.length)continue;
  const ps=points(g,l);
  // Try farther exits first, constrained by chapter reflection complexity.
  for(const exit of ps.filter(p=>p.seg>=(rule.exitSeg??2)&&p.seg<=(rule.maxSeg??7)&&(!rule.split||p.ball>0)).reverse())for(const variant of (count?[0,1,2,3]:[0])){
   let choices=ps.filter(p=>Math.hypot(p.x-exit.x,p.y-exit.y)>65&&p.seg>=1);
   let selected=[];
   if(rule.split){for(const id of [1,2]){const p=choices.filter(p=>p.ball===id&&p.seg>=(rule.nodeSeg||0))[variant];if(p)selected.push(p)}}
   else {let arr=choices.filter(p=>p.ball===exit.ball&&p.seg<exit.seg&&p.seg>=(rule.charge?3:0));if(variant>=2)arr=arr.filter((p,i)=>i%2===variant%2);selected=variant%2?arr.slice(0,count):arr.slice(-count);}
   if(selected.length<count||selected.some((p,i)=>selected.slice(0,i).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<58)))continue;
   const q=clone(l);q.exit={x:exit.x,y:exit.y,r:rule.exitRadius||23,minBounces:rule.minBounces||0};
   q.nodes=selected.map((p,i)=>({id:'n'+i,x:p.x,y:p.y,r:rule.radius||20,kind:rule.split?'fork':rule.direction?'lock':rule.charge?'charge':rule.relay?'relay':'switch',label:String(i+1),...(rule.relay?{relay:true,needs:i?['n'+(i-1)]:[]}:{relay:!!rule.split}),...(rule.direction?{direction:p.dir}:{}),...(rule.charge?{minBounces:3}:{}),...(rule.split?{forkOnly:true}:{} )}));
   q.requires=[...q.nodes.map(n=>n.id),...(rule.portal?['p0']:[]),...(rule.fragile?['plate:0']:[]),...(rule.split?['split']:[])];
   if(!valid(q,[angle]))continue;const solved=make(q);solved.fireComplete(angle*Math.PI/180);
   const reflections=solved.trace.at(-1)?.bounces||0;if(reflections<(rule.minBounces??0))continue;
   candidates.push({l:q,angle,score:Math.abs(reflections-(rule.preferredBounces??rule.minBounces??3))*5+Math.abs(angle)*.02});
  }
 }
 candidates.sort((a,b)=>a.score-b.score);
 for(const c of candidates){const r=window(c.l,c.angle,minWidth);if(r){put(slot,c.l,r);return}}
 throw Error('No tolerant authored room '+slot+' '+name+' candidates '+candidates.length);
}
// Eight introductory rooms teach one rule at a time, with broad target radii.
put(1,base('第一束光','拖动瞄准，松手发射。命中金色出口即可过关。',{exit:{x:320,y:105,r:30}}),{angles:[0],windows:[[-7,7]]});
authored(2,'借墙一弹','借一面边墙折返，观察入射角与反射角。',{origin:O(140),walls:[]},{exitSeg:1,maxSeg:1,minBounces:1,width:6,exitRadius:30});
authored(3,'斜镜转角','青色斜镜改变方向；找准一面镜子的反射角。',{plates:[P(230,170,360,270)]},{exitSeg:1,maxSeg:2,minBounces:1,width:5,exitRadius:28});
authored(4,'石梁绕行','石梁挡住直线，需要从侧面绕行。',{origin:O(120),walls:[W('beam',210,160,260,22)]},{exitSeg:1,maxSeg:2,minBounces:1,width:4,exitRadius:28});
authored(5,'两次折返','先借边墙，再借石梁；尝试把两次反弹连起来。',{origin:O(100),walls:[W('beam',265,100,200,22)]},{exitSeg:2,maxSeg:3,minBounces:2,width:4,exitRadius:28});
put(6,base('点亮门锁','先命中青色开关，再进入上方出口。机关进度保留。',{nodes:[{id:'key',x:320,y:190,r:24,kind:'switch'}],requires:['key'],exit:{x:320,y:80,r:28}}),{angles:[0],windows:[[-4,4]]});
put(7,base('裂石开路','裂纹石墙一撞即碎。打穿石墙后继续进入出口。',{walls:[W('crack',230,195,180,22,{breakable:true})],requires:['wall:crack'],exit:{x:320,y:80,r:28}}),{angles:[0],windows:[[-4,4]]});
authored(8,'双廊初探','两面错开的石墙构成通道，寻找连续折返路线。',{origin:O(100),walls:[W('a',220,90,22,155),W('b',425,150,22,170)]},{exitSeg:2,maxSeg:4,minBounces:2,width:3.5,exitRadius:26});
// Retained designs are spread across the campaign instead of front-loading mechanisms.
const slots=[16,12,14,15,20,19,9,17,13,10,18,23,11,25,30,35,40,45,46,47];
for(let i=0;i<old.length;i++){
 const l=clone(old[i]);l.nodes.forEach(n=>n.r=Math.max(n.r,19));l.exit.r=23;l.shots=Math.max(l.shots,3);l.contacts=18;
 l.portals=[];l.splitters=[];l.retainedFrom=i+1;
 // Keep valid verified old angles; widths will be recomputed with the broader targets.
 if(!valid(l,oldSolutions[i])){l.nodes=clone(old[i].nodes);l.exit=clone(old[i].exit)}
 if(!valid(l,oldSolutions[i]))throw Error('Retained solution failed '+i);
 put(slots[i],l,{angles:oldSolutions[i],retained:true});
}
// Reposition the most precise legacy targets while retaining their maze geometry.
for(const [slot,source,rule] of [[10,9,{minBounces:3,exitSeg:3,width:3}],
 [13,8,{charge:true,count:1,exitSeg:4,width:2.5}],
 [16,0,{minBounces:3,exitSeg:3,width:2.5}],
 [17,7,{relay:true,count:2,exitSeg:4,width:2.5}],
 [19,5,{charge:true,count:1,exitSeg:4,width:2.5}],
 [25,13,{direction:true,count:2,exitSeg:4,width:2.5}],
 [40,16,{relay:true,count:2,exitSeg:4,maxSeg:9,width:2.2,radius:24,exitRadius:28}],
 [45,17,{direction:true,count:3,exitSeg:5,maxSeg:9,width:2.2,radius:24,exitRadius:28}]]){
 const l=old[source];authored(slot,l.name,l.hint,{origin:l.origin,walls:l.walls,plates:l.plates},rule);levels[slot-1].retainedFrom=source+1;
}
// Portal introduction: different starting sides, room partitions and mirror arrangements.
authored(21,'门中有路','同字母传送门成对连接，穿门后保留弹珠方向。',{origin:O(120),walls:[W('divider',295,35,25,300)],portals:portal({x:120,y:220},{x:480,y:220})},{portal:true,exitSeg:2,maxSeg:4,width:4,preferredBounces:1});
authored(22,'隔墙折跃','先借斜镜进入传送门，再在另一侧折返。',{origin:O(110),walls:[W('divider',290,35,24,300),W('ledge',395,135,150,18)],plates:[P(65,170,155,230)],portals:portal({x:220,y:110},{x:490,y:260})},{portal:true,exitSeg:3,maxSeg:6,width:2.8});
authored(24,'折跃取印','穿门并按箭头方向命中封印；入口角度决定出口走向。',{origin:O(510),walls:[W('divider',315,35,24,290),W('shelf',85,195,155,18)],plates:[P(395,140,480,90)],portals:portal({x:510,y:225},{x:150,y:120})},{portal:true,direction:true,count:1,exitSeg:3,width:2.4});
// Fragile mirror puzzles change the board between shots; authored solutions are searched below.
const fragileRooms=[
 [26,'碎镜初识','橙色虚线镜面只反射一次，碎裂后通路保持开放。',{origin:O(320),plates:[P(220,160,380,260,{fragile:true})],walls:[W('shelf',450,125,90,18)]}],
 [27,'先折后穿','先用碎镜取印；镜面消失后，下一发可以穿过原位置。',{origin:O(120),plates:[P(90,190,230,270,{fragile:true}),P(400,125,490,70)],walls:[W('post',295,90,22,190)]}],
 [28,'破镜换路','两面镜子，一面会碎。先判断该保留哪条折返路线。',{origin:O(520),plates:[P(395,215,530,135,{fragile:true}),P(130,105,235,165)],walls:[W('beam',260,110,160,18),W('pillar',100,205,22,100)]}],
 [29,'碎镜取钥','借一次性镜面取钥，借永久镜面寻找出口。',{origin:O(280),plates:[P(225,200,330,125,{fragile:true}),P(455,185,550,250)],walls:[W('a',110,125,110,18),W('b',365,240,22,75)]}]
];
for(const [id,name,hint,l] of fragileRooms)authored(id,name,hint,l,{fragile:true,count:id===26?0:1,direction:id===28,exitSeg:id===26?2:3,width:id===26?4:2.5});
// Splitters replace one ball with two; fork-only targets must be reached by the branches.
authored(31,'一珠两路','命中绿色分裂晶体，产生两颗子弹珠。点亮两侧分流印，再进出口。',{origin:O(320),splitters:[{id:'split',x:320,y:220,r:24,spread:32}]},{split:true,count:2,exitSeg:2,maxSeg:6,width:4,preferredBounces:2});
authored(32,'双廊分流','两颗子弹珠分走左右石廊，同发点亮分流印。',{origin:O(320),splitters:[{id:'split',x:320,y:245,r:23,spread:36}],walls:[W('a',180,115,95,18),W('b',390,190,125,18)],plates:[P(430,85,505,125)]},{split:true,count:2,exitSeg:3,width:2.5});
authored(33,'分镜合印','左右镜面各负责一条路线；两个分流印需要同发激活。',{origin:O(160),splitters:[{id:'split',x:175,y:215,r:23,spread:34}],walls:[W('beam',280,170,160,18)],plates:[P(65,120,155,170),P(465,235,555,165)]},{split:true,count:2,exitSeg:3,width:2.5});
authored(34,'针廊双珠','两条支路都要避开针柱，失败的子弹珠不会提前收回另一颗。',{origin:O(480),splitters:[{id:'split',x:465,y:235,r:23,spread:30}],walls:[W('needle',290,120,24,120,{hazard:true}),W('beam',70,160,150,18)],plates:[P(400,80,490,140)]},{split:true,count:2,exitSeg:3,width:2.5});
authored(36,'门镜接力','进入传送门后借镜折返，再依次点亮两颗星。',{origin:O(100),portals:portal({x:160,y:215},{x:465,y:160}),walls:[W('a',290,35,22,200),W('b',390,240,155,18)],plates:[P(435,80,535,125)]},{portal:true,relay:true,count:2,exitSeg:4,width:2.3});
authored(37,'碎镜折跃','先借一次性镜面进入传送门，穿门后的方向保持不变。',{origin:O(110),plates:[P(420,120,520,180,{fragile:true})],portals:portal({x:110,y:220},{x:470,y:220}),walls:[W('a',295,35,22,300),W('b',485,270,95,18)]},{portal:true,fragile:true,count:1,exitSeg:4,width:2.3});
authored(38,'跃门双流','分裂之后两路各自绕行，其中一路借传送门跳过石墙。',{origin:O(110),splitters:[{id:'split',x:470,y:155,r:30,spread:33}],portals:portal({x:110,y:235},{x:470,y:245},30),walls:[W('post',285,85,22,195)],plates:[P(90,150,185,90)]},{split:true,portal:true,count:2,exitSeg:3,width:2.3,radius:25,exitRadius:28});
authored(39,'碎镜双印','分流后利用一次性镜面，改变另一颗子弹珠可走的路线。',{origin:O(170),splitters:[{id:'split',x:190,y:235,r:23,spread:35}],plates:[P(90,120,195,175,{fragile:true}),P(460,235,550,165)],walls:[W('beam',300,110,145,18)]},{split:true,fragile:true,count:2,exitSeg:4,width:2.3});
authored(41,'双门迷廊','两对传送门分别连接不同石廊，字母标识帮助你规划入口。',{origin:O(100),portals:[...portal({x:170,y:225},{x:420,y:105}),...portal({x:495,y:215},{x:210,y:105}).map(p=>({...p,id:p.id==='p0'?'p2':'p3',pair:p.pair==='p0'?'p2':'p3',label:'B'}))],walls:[W('a',290,45,22,150),W('b',330,240,22,85),W('c',80,160,130,18)],plates:[P(460,85,555,145)]},{portal:true,relay:true,count:2,exitSeg:4,maxSeg:9,width:2.3});
authored(42,'镜后定向','一次性镜面与方向封印组合；看清命中封印时的行进方向。',{origin:O(530),plates:[P(390,210,510,125,{fragile:true}),P(90,110,200,185)],walls:[W('a',265,75,22,180),W('b',350,265,110,18)]},{fragile:true,direction:true,count:2,exitSeg:4,maxSeg:9,width:2.3});
authored(43,'跨室蓄能','跨越传送门后仍保留反弹次数；先蓄能再解封。',{origin:O(130),portals:portal({x:190,y:175},{x:470,y:265}),walls:[W('a',295,35,22,285),W('b',395,125,150,18)],plates:[P(60,125,155,80),P(390,230,475,175)]},{portal:true,charge:true,count:1,exitSeg:5,maxSeg:9,width:2.3});
authored(44,'三镜双流','先找主弹珠的分裂角，再规划两条支路的三镜折返。',{origin:O(320),splitters:[{id:'split',x:330,y:235,r:22,spread:38}],walls:[W('a',220,95,115,18),W('b',380,180,22,110)],plates:[P(70,205,165,145),P(455,90,550,155),P(230,265,300,215)]},{split:true,count:2,exitSeg:5,maxSeg:9,width:2.3});
authored(48,'门镜终局','进入传送门、借碎镜蓄能，再按序串联目标。',{origin:O(110),portals:portal({x:185,y:225},{x:470,y:180}),plates:[P(420,95,520,145,{fragile:true}),P(110,125,190,195)],walls:[W('a',295,35,22,215),W('b',385,245,145,18)]},{portal:true,fragile:true,relay:true,count:2,exitSeg:5,maxSeg:9,width:2.2});
authored(49,'双流钥阵','分裂、跨门与双目标同时成立，出口只有两路完成后才开启。',{origin:O(510),splitters:[{id:'split',x:490,y:240,r:23,spread:34}],portals:portal({x:370,y:100},{x:140,y:240}),plates:[P(440,80,550,150),P(100,150,200,90)],walls:[W('a',285,95,22,185),W('b',350,195,95,18)]},{split:true,portal:true,count:2,exitSeg:5,maxSeg:9,width:2.2});
authored(50,'遗迹总机关','完整规划：分裂两路、穿门换位、碎镜改道，同发完成两枚分流印。',{origin:O(110),splitters:[{id:'split',x:470,y:155,r:30,spread:33}],portals:portal({x:110,y:235},{x:470,y:245},30),plates:[P(450,80,550,120,{fragile:true}),P(90,150,185,90)],walls:[W('post',285,85,22,195),W('ledge',360,290,150,18)]},{split:true,portal:true,fragile:true,count:2,exitSeg:4,maxSeg:10,width:2.2,radius:25,exitRadius:28});
// Two genuinely different shots: the first uses a mirror, the second crosses its
// old position. The reference sequence is broad rather than pixel-perfect.
const prepare=base('先折后穿','先借橙色碎镜取得右侧钥匙；下一发穿过镜面原位置，进入上方出口。',{
 origin:O(200),plates:[P(150,230,250,130,{fragile:true})],walls:[W('pillar',455,85,22,205)],
 nodes:[{id:'key',x:380,y:171,r:25,kind:'key'}],requires:['plate:0','key'],exit:{x:200,y:80,r:27},par:2});
if(!valid(prepare,[0,0]))throw Error('Two-step mirror reference invalid');
put(27,prepare,{angles:[0,0],windows:[[-2,2],[-3,3]]});
if(levels.some(l=>!l)||levels.filter(Boolean).length!==50)throw Error('Missing campaign rooms');
levels.forEach((l,i)=>{l.id=i+1;l.chapter=chapters[Math.floor(i/5)];l.revision=3;l.difficulty=Math.floor(i/5)+1;});
fs.writeFileSync('games/marble/puzzle-levels.js','// Campaign 3: 50 fixed authored rooms, no runtime procedural layouts.\nexport const LEVELS = '+JSON.stringify(levels,null,2)+';\n');
fs.writeFileSync('games/marble/puzzle-solutions.js','// Verified reference angles in degrees.\nexport const SOLUTIONS = '+JSON.stringify(reports.map(r=>r.angles))+';\n');
fs.writeFileSync('output/puzzle-v3/author-report.json',JSON.stringify(reports,null,2));
