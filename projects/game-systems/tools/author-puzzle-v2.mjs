// Offline level authoring: fixed geometry, trajectory placement, then freeze to data.
// No random layout generation or solver runs in the shipped game.
import fs from 'node:fs';
import {PuzzleGame,clone} from '../games/marble/puzzle-state.js';
import {LEVELS as old} from '../output/puzzle-v2/previous-levels.js';
const W=(id,x,y,w,h,extra={})=>({id,x,y,w,h,...extra});
const P=(x1,y1,x2,y2)=>({x1,y1,x2,y2});
const specs=[
 {name:'错层双廊',type:'route',origin:{x:95,y:320},walls:[W('a',200,55,24,190),W('b',400,145,24,180),W('c',270,82,95,18)],plates:[],goal:'绕过错层石墙，寻找两次以上反弹的出口路线。'},
 {name:'三镜折返',type:'charge',origin:{x:320,y:320},walls:[W('a',250,70,140,18),W('b',90,220,150,18),W('c',455,145,22,160)],plates:[P(100,100,200,200),P(390,240,470,320),P(370,125,440,55)],goal:'借三次反弹蓄能，再击中晶体绕出镜室。'},
 {name:'背面封印',type:'direction',origin:{x:90,y:320},walls:[W('a',220,140,180,20),W('b',470,80,22,180),W('c',110,80,60,18)],plates:[P(300,250,370,300)],goal:'箭头是弹珠命中时的行进方向；从错误方向命中会反弹。'},
 {name:'单发双星',type:'relay',count:2,origin:{x:320,y:320},walls:[W('a',175,65,20,145),W('b',435,150,20,155),W('c',270,205,100,18)],plates:[P(265,110,335,65)],goal:'同一发按 ①→② 点亮紫色星点，再进出口；回收后星点熄灭。'},
 {name:'回声蓄能',type:'charge',origin:{x:100,y:320},walls:[W('a',250,90,20,200),W('b',405,50,20,190),W('c',65,135,105,18)],plates:[P(445,240,540,175)],goal:'先反弹至少 3 次，再命中蓄能晶体；直击晶体无效。'},
 {name:'针塔回旋',type:'route',origin:{x:535,y:320},walls:[W('a',300,70,35,175,{hazard:true}),W('b',120,175,110,22),W('c',455,95,105,18),W('d',390,235,22,70)],plates:[P(145,85,225,130)],goal:'避开中央针塔，从外圈连续折返到达出口。'},
 {name:'十字迷宫',type:'direction',origin:{x:90,y:320},walls:[W('a',295,70,25,100),W('b',295,215,25,100),W('c',120,180,130,20),W('d',365,180,145,20)],plates:[P(480,65,550,125)],goal:'穿过十字间隙，再按箭头方向命中封印。'},
 {name:'长短双轨',type:'relay',count:2,origin:{x:320,y:320},walls:[W('a',140,80,180,18),W('b',300,220,200,18),W('c',85,160,20,140),W('d',530,45,20,140)],plates:[P(365,100,435,160)],goal:'同发按编号串联两颗星；留意长墙与短墙造成的不同回路。'},
 {name:'斜镜夹层',type:'route',origin:{x:100,y:320},walls:[W('a',190,200,220,18),W('b',290,80,200,18),W('c',510,145,20,145)],plates:[P(110,100,195,160),P(360,280,440,230)],goal:'在上下夹层间借斜镜折返，不能直接穿过石梁。'},
 {name:'逆向取印',type:'direction',count:2,origin:{x:530,y:320},walls:[W('a',170,55,22,160),W('b',350,145,22,175),W('c',440,75,115,18)],plates:[P(100,255,175,300),P(390,100,460,145)],goal:'两枚封印入口方向不同；找到各自的反射入口，再进入出口。'},
 {name:'三点共振',type:'relay',count:3,origin:{x:320,y:320},walls:[W('a',200,60,20,155),W('b',420,140,20,180),W('c',285,110,75,18)],plates:[P(80,180,160,125),P(280,240,360,280)],goal:'同发依次穿过 ①②③，再进入出口；分开发射不能累积星点。'},
 {name:'针阵蓄光',type:'charge',origin:{x:80,y:320},walls:[W('a',210,110,20,180),W('b',420,55,20,160),W('c',65,90,90,18,{hazard:true}),W('d',495,250,65,18,{hazard:true})],plates:[P(280,235,350,165)],goal:'绕过两组针阵，反弹至少 3 次后激活晶体。'},
 {name:'镜室回环',type:'relay',count:2,origin:{x:320,y:320},walls:[W('a',105,115,100,18),W('b',435,230,100,18),W('c',300,105,24,140)],plates:[P(430,65,515,120),P(110,240,195,285)],goal:'围绕中央立柱折返，同发连续点亮两个星点。'},
 {name:'逆流三印',type:'direction',count:3,origin:{x:100,y:320},walls:[W('a',240,70,20,120),W('b',385,190,20,120),W('c',95,215,100,18),W('d',440,90,115,18)],plates:[P(295,100,355,160)],goal:'三个方向封印分散在障碍后；方向正确才会激活，进度保留。'},
 {name:'四折连星',type:'relay',count:3,origin:{x:520,y:320},walls:[W('a',170,120,20,175),W('b',320,55,20,185),W('c',470,145,100,18)],plates:[P(85,100,140,55),P(355,280,425,220)],goal:'先找反射顺序，再同发串联三个星点；不能靠逐个瞄准完成。'},
 {name:'终极折光阵',type:'final',count:2,origin:{x:320,y:320},walls:[W('a',145,70,24,125),W('b',460,185,24,120),W('c',235,170,160,18),W('d',480,75,95,18)],plates:[P(85,240,155,295),P(360,85,430,135)],goal:'同发按序点亮两颗星，首星需要 3 次反弹，末星还需按箭头方向命中。'}
];
function make(level){const g=new PuzzleGame(0);g.level=clone(level);g.left=level.shots;return g}
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)}
function clear(p,l,r=26){if(p.x<45||p.x>595||p.y<62||p.y>298||Math.hypot(p.x-l.origin.x,p.y-l.origin.y)<65)return false;for(const w of l.walls){const x=Math.max(w.x,Math.min(w.x+w.w,p.x)),y=Math.max(w.y,Math.min(w.y+w.h,p.y));if(Math.hypot(p.x-x,p.y-y)<r)return false}for(const q of l.plates)if(segmentDistance(p,{x:q.x1,y:q.y1},{x:q.x2,y:q.y2})<r)return false;return true}
const generated=[],report=[];
for(let si=0;si<specs.length;si++){
 const s=specs[si],base={...clone(s),shots:s.type==='direction'&&s.count>1?3:2,par:1,contacts:12,nodes:[],requires:[],exit:{x:-999,y:-999,r:18},chapter:'折光机关'};
 let candidates=[];
 for(let a=-79;a<=79;a+=.5){const g=make(base);g.fireComplete(a*Math.PI/180);const points=[];for(let j=1;j<g.path.length;j++){const start=g.path[j-1],end=g.path[j],distance=Math.hypot(end.x-start.x,end.y-start.y);if(distance<75)continue;const p={x:Math.round((start.x+end.x)/2),y:Math.round((start.y+end.y)/2),seg:j-1,dir:Math.abs(end.x-start.x)>Math.abs(end.y-start.y)?end.x>start.x?'right':'left':end.y>start.y?'down':'up'};if(clear(p,base))points.push(p)}
 const count=s.type==='route'?0:s.count||1;
 if(points.length<count+1)continue;
 for(let end=points.length-1;end>=count;end--){const exit=points[end];if(exit.seg<3||exit.seg>7)continue;const prior=points.slice(0,end).filter(p=>p.seg>=((s.type==='charge'||s.type==='final')?3:1)&&Math.hypot(p.x-exit.x,p.y-exit.y)>60);if(prior.length<count)continue;const nodes=prior.slice(-count||prior.length).slice(0,count);if(nodes.some((p,i)=>nodes.slice(0,i).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<58)))continue;const l=clone(base);l.exit={x:exit.x,y:exit.y,r:18};l.nodes=nodes.map((p,i)=>({id:'n'+i,x:p.x,y:p.y,r:s.type==='charge'?18:14,kind:s.type==='charge'?'charge':s.type==='direction'?'lock':'relay',label:String(i+1),relay:['relay','final'].includes(s.type),needs:['relay','final'].includes(s.type)&&i?['n'+(i-1)]:[],...((s.type==='charge'||s.type==='final'&&i===0)?{minBounces:Math.min(p.seg,3)}:{}),...(s.type==='direction'||s.type==='final'&&i===count-1?{direction:p.dir}:{})}));l.requires=l.nodes.map(n=>n.id);l.hint=s.goal;l.objective=s.goal;const test=make(l);if(!test.fireComplete(a*Math.PI/180))continue;const surfaces=new Set(test.trace.filter(t=>['rect','plate'].includes(t.kind)).map(t=>t.kind+t.id));if(surfaces.size<2)continue;candidates.push({l,a,score:surfaces.size*10+exit.seg*2-Math.abs(a)*.02});break}
 }
 candidates.sort((a,b)=>b.score-a.score);let chosen=null;
 for(const candidate of candidates.slice(0,100)){const {l,a}=candidate;let lo=a,hi=a;while(lo>a-8&&make(l).fireComplete((lo-.25)*Math.PI/180))lo-=.25;while(hi<a+8&&make(l).fireComplete((hi+.25)*Math.PI/180))hi+=.25;if(hi-lo<1.5)continue;if(s.type==='route'){let shortcut=false;for(let d=-86;d<=86;d+=1){const t=make(l);if(t.fireComplete(d*Math.PI/180)&&(t.trace.at(-1)?.bounces||0)<2){shortcut=true;break}}if(shortcut)continue}chosen={l,a:(lo+hi)/2,window:[lo,hi]};break}
 if(!chosen){console.log('NO ROBUST DESIGN',s.name,'candidates',candidates.length);continue}
 generated.push(chosen.l);report.push({name:s.name,angles:[chosen.a],windows:[chosen.window]});console.log('AUTHORED',s.name,chosen.a,chosen.window);
}
// Retain and deepen the four themes the player found promising.
const retained=[clone(old[5]),clone(old[6]),clone(old[8]),clone(old[9])];
retained[0].name='钥匙暗室';retained[0].walls.push(W('guard',430,250,115,18));
retained[1].name='旋镜密道';retained[1].walls.push(W('overhang',160,75,120,18));
retained[2].name='针墙折返';retained[2].plates.push(P(345,240,410,285));
retained[3].name='碎壁折光';retained[3].requires=['plate:0','plate:1','rune'];retained[3].hint='拆开裂纹墙，借两面斜板反射，拾取符文后进入出口。';retained[3].walls.push(W('needle',70,70,20,90,{hazard:true}));
for(const l of retained){l.shots=3;l.contacts=12;l.objective=l.hint;l.revision=2}
const levels=[generated[0],retained[0],retained[1],retained[2],retained[3],...generated.slice(1)].filter(Boolean);
// Widen the second relay slightly so trajectories on either side of the lower-wall reflection connect continuously.
levels[11].nodes[1].r=17;
levels.forEach((l,i)=>{l.id=i+1;l.chapter=['曲折入门','机关组合','多段回路','终极试炼'][Math.floor(i/5)];l.plates??=[];l.nodes??=[];l.requires??=[];l.revision=2;delete l.type;delete l.count});
fs.writeFileSync('output/puzzle-v2/author-report.json',JSON.stringify(report,null,2));
if(levels.length!==20)throw Error('Need 20 distinct authored rooms, got '+levels.length);
fs.writeFileSync('games/marble/puzzle-levels.js','// Campaign revision 2: fixed, offline-authored geometry. See tools/author-puzzle-v2.mjs.\nexport const LEVELS = '+JSON.stringify(levels,null,2)+';\n');
