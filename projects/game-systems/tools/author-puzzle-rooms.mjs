import fs from 'node:fs';
import {nextCollision,reflect} from '../games/marble/physics.js';
import {PuzzleGame,clone} from '../games/marble/puzzle-state.js';
// Individually authored structures, not translated chapter templates.
const chapters=['借墙入门','转角试炼','错层空间','深处回环','两路点亮','分叉与汇合','三点寻路','绕行石阵','连环折返','最后的试炼'];
// Name, launcher x, walls [x,y,w,h], target regions [cx,cy,rx,ry], clue.
const ROOMS=[
 ['挡在前面的柱',320,[[292,142,56,92]],[[320,92,40,15]],'先往侧面发射，借边墙绕过中柱。'],
 ['左口横梁',410,[[145,186,385,20]],[[275,110,85,30]],'横梁左侧留了入口；直射会被挡回。'],
 ['右口与石台',220,[[80,184,360,20],[485,96,55,75]],[[380,110,55,25]],'从右边宽口绕进去，留意上方石台。'],
 ['开口朝上的凹槽',380,[[230,143,18,115],[392,143,18,115],[230,240,180,18]],[[320,195,37,17]],'凹槽只能从上方进入，先借顶墙回落。'],
 ['转角背后的光',130,[[268,115,20,157],[268,115,165,20]],[[365,185,30,32]],'目标藏在拐角后，观察竖墙的背面。'],
 ['两柱与侧袋',450,[[190,90,24,171],[367,164,24,118]],[[118,124,40,24]],'两根柱子高度不同，选择能越过两柱的路线。'],
 ['阶梯向左',300,[[190,248,155,18],[135,184,100,18],[65,118,105,18]],[[95,80,26,12]],'逐层错开的石台会改变折返点。'],
 ['长墙的小侧门',110,[[255,72,22,210],[442,208,155,18]],[[470,125,48,34]],'先穿过长墙上方，再回到右侧。'],
 ['高台与低檐',500,[[115,100,280,18],[335,205,205,18],[200,225,22,55]],[[220,157,56,18]],'两道横梁错层，找中间那条绕行通道。'],
 ['向左开的壁龛',350,[[342,102,150,18],[474,102,18,142],[342,226,150,18]],[[414,170,27,25]],'壁龛只有左侧入口；从侧面把球送进去。'],
 ['十字石岛',170,[[276,82,22,171],[195,160,180,20]],[[380,93,40,16]],'十字把地图分成几块；路线需要绕过两条轴。'],
 ['双层错门',360,[[60,112,330,18],[230,226,360,18]],[[470,85,46,10]],'下门偏左、上门偏右；不要沿同一条直线找入口。'],
 ['右岸连廊',120,[[185,75,20,122],[185,180,268,18],[435,180,18,104]],[[500,110,39,26]],'先进入上侧通道，再绕到右岸。'],
 ['逆向三级台',450,[[400,257,165,18],[310,195,130,18],[205,123,145,18]],[[200,83,35,10]],'台阶朝反方向排布，利用边界调整行进方向。'],
 ['石拱内侧',530,[[205,95,20,160],[410,95,20,160],[205,95,225,18]],[[320,169,46,26]],'石拱从下方开放；两侧回弹比正面撞顶更有用。'],
 ['折返的窄湾',510,[[96,88,225,18],[96,88,18,172],[96,242,148,18],[260,177,18,113]],[[177,176,30,35]],'先找到湾口，再把球折回左侧的内部。'],
 ['漏斗两翼',130,[[65,100,170,18],[175,170,105,18],[410,125,162,18],[359,205,120,18]],[[325,93,32,13]],'四块石台形成斜向漏斗，穿口后要回弹。'],
 ['三根高低柱',430,[[128,115,22,175],[296,70,22,140],[461,164,22,126]],[[220,111,45,24]],'三柱分隔出四条通道，选对首个折返点。'],
 ['两间相连的房',540,[[245,82,18,170],[410,195,18,95],[85,155,115,18],[455,100,130,18]],[[160,110,30,20]],'两个房间的开口一上一下，路线不能只走一侧。'],
 ['内环缺口',370,[[155,90,285,18],[155,90,18,147],[155,219,180,18],[422,90,18,194],[288,163,65,18]],[[335,128,30,10]],'大环留了两个缺口，内侧短墙会改变第二次反弹。'],
 ['左灯右门',300,[[272,120,22,147],[100,178,100,18],[395,94,160,18],[400,244,140,18]],[[149,114,34,20],[475,197,40,28]],'左侧点灯、右侧进门；先规划两条不同路线。'],
 ['上下两岸',115,[[175,177,305,18],[430,77,18,120],[85,245,155,18]],[[333,100,45,17],[360,249,50,20]],'灯在横梁上方、门在下方，两次路线需要方向切换。'],
 ['双口对望',445,[[94,92,18,125],[94,92,160,18],[376,168,18,125],[376,275,165,18]],[[173,155,30,26],[470,223,32,20]],'两个开口朝向不同，分别找到能进入的反弹面。'],
 ['中央高墙',320,[[300,73,20,186],[150,151,98,18],[396,214,150,18],[65,80,64,18]],[[190,97,28,14],[478,140,33,27]],'中柱隔开左右目标，先看横向通道。'],
 ['一横两竖',190,[[240,180,260,18],[240,122,18,76],[482,180,18,80],[90,228,84,18]],[[358,125,45,24],[550,209,24,30]],'点亮横梁内侧，再绕到外侧出口。'],
 ['断开的回廊',495,[[92,82,212,18],[92,82,18,158],[245,218,172,18],[399,130,18,106]],[[168,151,24,30],[340,169,27,20]],'上下两段回廊不相连，不能把同一条路线照搬。'],
 ['石桥两端',250,[[92,165,130,20],[280,165,280,20],[220,98,20,85],[505,220,18,64]],[[151,114,24,24],[415,109,35,20]],'桥中央有缺口，两端的进入方向不同。'],
 ['低谷与高窗',395,[[120,247,230,18],[120,145,18,120],[400,83,150,18],[532,83,18,160]],[[242,198,38,17],[471,161,24,31]],'一个目标藏在低谷，另一个藏在高窗内。'],
 ['绕岛分流',110,[[242,114,114,18],[242,114,18,130],[338,114,18,130],[444,200,130,18]],[[294,188,25,18],[510,123,27,21]],'中间石岛和右侧横梁构成两条独立绕行线。'],
 ['折角双室',470,[[115,91,190,18],[287,91,18,153],[165,226,140,18],[386,151,155,18],[386,151,18,139]],[[212,161,29,22],[477,229,26,20]],'先点亮左室，再从右室侧口进入终点。'],
 ['三路汇合',320,[[205,108,18,160],[425,155,18,126],[278,91,140,18]],[[125,119,26,24],[529,214,25,26],[326,180,30,20]],'左右两灯、中间出口；三条路线都要找到。'],
 ['两层书架',140,[[75,122,325,18],[240,225,330,18],[518,80,18,117]],[[464,111,24,18],[142,189,27,15],[391,276,30,12]],'亮点分布在不同楼层，不要只盯着上半场。'],
 ['开口朝外',420,[[170,86,18,170],[170,86,160,18],[170,238,100,18],[376,156,18,130],[376,268,110,18]],[[252,172,24,23],[479,215,23,21],[480,100,24,15]],'两个凹槽入口相反，最后目标在外侧。'],
 ['四角台与中门',250,[[86,102,128,18],[444,81,126,18],[80,217,125,18],[423,239,151,18],[291,152,24,82]],[[156,152,25,20],[503,180,24,25],[350,83,26,10]],'四角石台都参与反弹，中柱遮住出口直线。'],
 ['横桥下的三个口',500,[[135,163,370,18],[135,163,18,105],[315,163,18,88],[487,163,18,105],[225,77,115,18]],[[220,226,26,16],[410,225,27,17],[352,122,26,12]],'桥下分成三个口，先完成两侧再越桥。'],
 ['回廊与孤岛',170,[[90,79,18,180],[90,79,240,18],[90,241,160,18],[285,168,18,120],[421,120,84,70]],[[183,166,24,21],[365,242,24,14],[500,80,25,12]],'回廊、断墙、孤岛分别改变三条路线。'],
 ['交错四梁',360,[[60,90,230,18],[390,145,190,18],[105,217,195,18],[422,270,118,18]],[[411,93,24,13],[184,174,24,16],[448,219,24,16]],'上下交错的四梁，每个空隙都通向不同目标。'],
 ['双柱拱与侧窗',500,[[214,83,18,185],[378,83,18,124],[214,83,182,18],[470,190,118,18],[570,110,18,98]],[[306,159,23,22],[520,139,23,19],[327,261,24,12]],'点亮石拱和侧窗，再回到低处出口。'],
 ['断齿向上',470,[[95,259,142,18],[175,194,126,18],[264,131,125,18],[366,74,100,18],[518,175,18,100]],[[155,126,23,20],[425,133,23,16],[500,256,23,16]],'阶梯有断齿，可以借边界越过，也可以利用齿面。'],
 ['偏心双环',285,[[105,84,195,18],[105,84,18,159],[105,225,135,18],[360,134,190,18],[532,134,18,145],[430,261,120,18]],[[209,160,22,21],[447,207,22,20],[330,89,24,10]],'两个环的缺口偏心，正对目标并不能直接进去。'],
 ['四点与长脊',125,[[260,110,20,186],[90,152,118,18],[330,206,132,18],[510,115,18,118]],[[174,100,22,13],[403,130,22,21],[475,261,22,13],[565,119,20,23]],'长脊分开四个目标，需要利用顶部横穿。'],
 ['折桥四港',455,[[80,133,203,18],[283,133,18,119],[283,234,212,18],[477,161,18,91],[97,247,99,18]],[[167,85,21,10],[153,194,21,20],[384,167,21,18],[559,217,21,24]],'折桥围成四个港口，入口的高度各不相同。'],
 ['三柱与两段顶棚',215,[[114,104,18,184],[277,72,18,173],[440,141,18,107],[145,92,113,18],[462,92,112,18]],[[206,160,21,20],[363,122,21,17],[511,215,21,25],[335,279,21,9]],'每根柱子的高度不同，横向穿越必须先找空间。'],
 ['错位回字',380,[[84,82,268,18],[84,82,18,164],[84,228,120,18],[334,82,18,109],[408,148,155,18],[545,148,18,140],[427,270,136,18]],[[198,151,20,18],[471,216,20,15],[267,269,21,12],[445,96,21,12]],'回字开口错位，左右房间和外侧出口需要不同折返。'],
 ['双井连桥',100,[[165,91,18,183],[327,91,18,183],[165,256,180,18],[419,125,18,106],[565,73,18,158],[419,213,104,18],[347,148,72,18]],[[258,170,20,24],[499,147,20,22],[383,245,21,15],[113,89,21,11]],'两口井朝上开口，中间桥梁会阻挡横穿。'],
 ['石阵里的十字路',485,[[112,88,80,55],[273,78,78,62],[432,87,85,51],[181,196,90,62],[367,193,96,64],[83,265,86,18]],[[226,131,20,18],[402,131,20,18],[321,243,20,14],[542,242,20,18]],'五个石岛留下十字通路，先选好第一次撞面。'],
 ['四室错层门',310,[[230,72,18,203],[418,138,18,116],[76,161,154,18],[248,221,115,18],[436,100,144,18],[79,268,96,18]],[[145,105,20,11],[340,158,20,21],[520,177,20,22],[520,265,20,12]],'四个房间门位不同，目标逐个点亮即可。'],
 ['两座回旋塔',320,[[94,81,18,176],[94,81,206,18],[282,81,18,108],[171,171,129,18],[365,128,18,166],[365,128,198,18],[545,128,18,166],[441,276,122,18]],[[190,128,19,12],[162,226,19,15],[463,202,19,24],[340,271,20,9]],'两座塔都有内外折返，留意内侧短墙。'],
 ['环绕的断桥',440,[[90,77,257,18],[90,77,18,182],[90,241,120,18],[329,77,18,93],[242,166,105,18],[402,188,177,18],[561,90,18,116],[398,188,18,106]],[[193,153,19,21],[284,115,19,10],[485,134,19,20],[503,272,19,11]],'断桥和外环共同构成四条曲折通路。'],
 ['终点前的回环',260,[[108,80,210,18],[108,80,18,180],[108,242,145,18],[300,80,18,95],[220,160,98,18],[395,121,177,18],[395,121,18,157],[489,260,83,18]],[[196,113,18,10],[183,202,18,19],[490,190,18,20],[354,270,19,10]],'先拆解三个点亮路线，再找外环通向终点的折返。'],
];
function rays(level,step=.2){
 const room={width:640,height:360,walls:level.walls,columns:[],enemies:[],plates:[]},result=[];
 for(let degrees=-89;degrees<=89.0001;degrees+=step){
  const a=degrees*Math.PI/180,b={...level.origin,vx:Math.sin(a)*390,vy:-Math.cos(a)*390,r:5};let time=0,bounces=0;const segments=[];
  while(time<8&&bounces<12){const h=nextCollision(room,b,8-time);if(!h)break;segments.push({x:b.x,y:b.y,x2:h.x,y2:h.y,bounces});time+=h.t;b.x=h.x;b.y=h.y;if(h.kind==='bottom')break;Object.assign(b,reflect(b.vx,b.vy,h.nx,h.ny));b.x+=b.vx/390*.025;b.y+=b.vy/390*.025;bounces++;}
  result.push({angle:+degrees.toFixed(4),segments});
 }
 return result;
}
function hit(s,p){const dx=s.x2-s.x,dy=s.y2-s.y,t=Math.max(0,Math.min(1,((p.x-s.x)*dx+(p.y-s.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(s.x+dx*t-p.x,s.y+dy*t-p.y)<=p.r+5;}
function measure(rs,p){let bands=[],band=null,minBounces=99,hits=0;
 for(const ray of rs){const segment=ray.segments.find(s=>hit(s,p));if(segment){hits++;minBounces=Math.min(minBounces,segment.bounces);if(!band){band={lo:ray.angle,hi:ray.angle};bands.push(band)}else band.hi=ray.angle;}else band=null;}
 bands.sort((a,b)=>(b.hi-b.lo)-(a.hi-a.lo));return {band:bands[0],width:bands[0]?bands[0].hi-bands[0].lo:0,coverage:hits*.2,minBounces};
}
const inside=(p,w,margin=p.r+6)=>p.x>w.x-margin&&p.x<w.x+w.w+margin&&p.y>w.y-margin&&p.y<w.y+w.h+margin;
function scan(game,point,step=.1){let bands=[],band=null,coverage=0,minBounces=99;
 for(let a=-89;a<=89.0001;a+=step){
  const sim=Object.assign(Object.create(PuzzleGame.prototype),clone(game));sim.shoot(a*Math.PI/180);while(sim.phase==='flight'&&!(point.id&&sim.flags.includes(point.id)))sim.step(.3);
  const ok=point.id?sim.flags.includes(point.id):sim.phase==='won';
  if(ok){coverage+=step;const contact=sim.trace.find(t=>point.id?t.id===point.id:t.kind==='target');if(contact)minBounces=Math.min(minBounces,contact.bounces);if(!band){band={lo:a,hi:a};bands.push(band)}else band.hi=a;}else band=null;
 }
 bands.sort((a,b)=>(b.hi-b.lo)-(a.hi-a.lo));return {band:bands[0],width:bands[0]?bands[0].hi-bands[0].lo:0,coverage,minBounces};
}
const levels=[],solutions=[],report=[];
for(let i=0;i<ROOMS.length;i++){
 const [name,x,rects,zones,intent]=ROOMS[i],chapter=Math.floor(i/5),count=zones.length;
 const l={id:i+1,revision:'normal-2',name,chapter:chapters[chapter],origin:{x,y:320},walls:rects.map(([x,y,w,h],j)=>({id:'stone-'+j,x,y,w,h})),plates:[],nodes:[],portals:[],splitters:[],requires:[],contacts:12+count-1,shots:count+1,par:count};
 const rs=rays(l),chosen=[],pools=[],start=count===1?0:count===2?20:count===3?30:40;
 const widthGoal=count===1?10-(i-start)*.19:count===2?8-(i-start)*.16:count===3?6.8-(i-start)*.12:5.6-(i-start)*.105;
 for(let n=0;n<count;n++){
  const [cx,cy,rx,ry]=zones[n],pool=[],all=[];
  for(let dx=-rx;dx<=rx;dx+=Math.max(6,rx/5))for(let dy=-ry;dy<=ry;dy+=Math.max(5,ry/4))for(const r of [18,20,22,24,26,28,30]){
   const p={x:Math.round(cx+dx),y:Math.round(cy+dy),r};if(p.y-r<56||p.x-r<22||p.x+r>618||p.y+r>302||l.walls.some(w=>inside(p,w))||chosen.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<p.r+q.r+20))continue;
   const m=measure(rs,p);all.push({...p,...m});if(!m.band||m.width<3.19||(count===1&&m.minBounces<1))continue;
   pool.push({...p,...m,score:Math.abs(m.width-widthGoal)*3+Math.max(0,m.coverage-widthGoal*2)*.1+Math.hypot(dx,dy)*.003+(m.minBounces===0?5:0)});
  }
  pool.sort((a,b)=>a.score-b.score);if(!pool.length)throw Error('No legal bounce target for '+(i+1)+' region '+n+' '+JSON.stringify(all.sort((a,b)=>b.width-a.width).slice(0,2)));chosen.push(pool[0]);pools.push(pool);
 }
 const e=chosen.pop();l.exit={x:e.x,y:e.y,r:e.r};l.nodes=chosen.map((p,j)=>({id:'light-'+j,kind:'switch',x:p.x,y:p.y,r:p.r}));l.requires=l.nodes.map(n=>n.id);
 l.hint=intent+(count>1?' 青色亮点无需顺序，点亮进度保留。':'');l.objective=count===1?'借墙反弹，碰到金色光环':`点亮 ${count-1} 个青色圆点，再碰到金色光环`;
 const g=new PuzzleGame(0);g.level=clone(l);g.left=l.shots;const angles=[],metrics=[];
 for(const [n,p] of [...l.nodes,l.exit].entries()){
  let m=scan(g,p);
  if(!m.band||m.width<3.19){
   for(const q of pools[n].slice(0,100)){
    if([...l.nodes,l.exit].some(other=>other!==p&&Math.hypot(other.x-q.x,other.y-q.y)<other.r+q.r+20))continue;
    Object.assign(p,{x:q.x,y:q.y,r:q.r});Object.assign(p.id?g.level.nodes.find(v=>v.id===p.id):g.level.exit,p);
    m=scan(g,p);if(m.band&&m.width>=3.5)break;
   }
  }
  if(!m.band||m.width<3.19)throw Error(`Narrow reference at ${i+1}/${p.id||"exit"}: ${m.width} ${JSON.stringify(p)}`);
  const angle=(m.band.lo+m.band.hi)/2;angles.push(+angle.toFixed(4));metrics.push({width:+m.width.toFixed(2),coverage:+m.coverage.toFixed(2),minBounces:m.minBounces});g.fireComplete(angle*Math.PI/180);
  if(p.id){g.phase='aim';const done=l.nodes.slice(0,l.nodes.indexOf(p)+1).map(n=>n.id);g.flags=g.flags.filter(id=>!id.startsWith('light-')||done.includes(id));}
 }
 if(g.phase!=='won')throw Error('Cannot win '+(i+1));levels.push(l);solutions.push(angles);report.push({level:i+1,name,intent,walls:l.walls.length,targets:count,shots:l.shots,solutions:angles,metrics,widthGoal});console.log(i+1,name,metrics.map(m=>`${m.width}°/${m.minBounces}b/${m.coverage}°`).join(', '));
}
// Compute the complete-room success probability of uniformly sampled aiming,
// including persistent lights, opportunistic chains and the real shot budget.
// This is a reproducible ordering aid, NOT a human completion-rate claim.
function blindWinChance(level,step=.25){
 const states=2**level.nodes.length,transitions=[],samples=Math.round(178/step)+1;
 for(let mask=0;mask<states;mask++){
  const row=Array(states+1).fill(0),base=new PuzzleGame(0);base.level=clone(level);base.left=level.shots;
  base.flags=level.nodes.filter((_,j)=>mask&(1<<j)).map(n=>n.id);
  for(let j=0;j<samples;j++){
   const sim=Object.assign(Object.create(PuzzleGame.prototype),clone(base));sim.fireComplete((-89+j*step)*Math.PI/180);
   const target=sim.phase==='won'?states:level.nodes.reduce((m,n,k)=>m|(sim.flags.includes(n.id)?1<<k:0),0);row[target]++;
  }
  transitions.push(row.map(v=>v/samples));
 }
 let probability=Array(states+1).fill(0);probability[0]=1;
 for(let shot=0;shot<level.shots;shot++){
  const next=Array(states+1).fill(0);next[states]=probability[states];
  for(let from=0;from<states;from++)for(let to=0;to<=states;to++)next[to]+=probability[from]*transitions[from][to];
  probability=next;
 }
 return probability[states];
}
const ordered=levels.map((level,i)=>({level,solution:solutions[i],report:report[i],chance:blindWinChance(level)})).sort((a,b)=>b.chance-a.chance);
function solve(level){
 const game=new PuzzleGame(0);game.level=clone(level);game.left=level.shots;const angles=[],metrics=[];
 for(const point of [...level.nodes,level.exit]){
  const m=scan(game,point);if(!m.band||m.width<3.19)return null;
  const degrees=+(m.band.lo/2+m.band.hi/2).toFixed(4);angles.push(degrees);metrics.push({width:+m.width.toFixed(2),coverage:+m.coverage.toFixed(2),minBounces:m.minBounces});game.fireComplete(degrees*Math.PI/180);
  if(point.id){game.phase='aim';const done=level.nodes.slice(0,level.nodes.indexOf(point)+1).map(n=>n.id);game.flags=game.flags.filter(id=>!id.startsWith('light-')||done.includes(id));}
 }
 return game.phase==='won'?{angles,metrics}:null;
}
for(let i=1;i<ordered.length;i++){
 const item=ordered[i];let limit=ordered[i-1].chance*.98,changes=0;
 while(item.chance>limit+1e-10){
  const points=[...item.level.nodes,item.level.exit];let accepted=false;
  // Geometry stays unique; fine calibration removes neighboring near-ties.
  // Keep an actual >=3.2-degree contiguous reference route, no exact-angle gate.
  for(const [n,p] of points.entries()){
   if(p.r<=12)continue;
   // A sampled angle grid has plateaus: try past an unchanged half-pixel step.
   for(const reduction of [.5,1,1.5,2,3,4]){
    const candidate=clone(item.level),target=[...candidate.nodes,candidate.exit][n];target.r=Math.max(12,p.r-reduction);
    const solved=solve(candidate);if(!solved)continue;
    const chance=blindWinChance(candidate);if(chance>=item.chance-1e-7)continue;
    item.level=candidate;item.solution=solved.angles;item.report.metrics=solved.metrics;item.chance=chance;changes++;accepted=true;break;
   }
   if(accepted)break;
  }
  if(!accepted){
   for(const [n,p] of points.entries()){
    const zone=ROOMS[item.report.level-1][3][n];
    for(const [dx,dy] of [[-2,0],[2,0],[0,-2],[0,2],[-4,0],[4,0],[0,-4],[0,4],[-2,-2],[2,2]]){
     const candidate=clone(item.level),target=[...candidate.nodes,candidate.exit][n];target.x+=dx;target.y+=dy;
     if(Math.abs(target.x-zone[0])>zone[2]||Math.abs(target.y-zone[1])>zone[3]||candidate.walls.some(w=>inside(target,w,target.r+5)))continue;
     const solved=solve(candidate);if(!solved||candidate.nodes.length===0&&solved.metrics[0].minBounces===0)continue;
     const chance=blindWinChance(candidate);if(chance>=item.chance-1e-7)continue;
     item.level=candidate;item.solution=solved.angles;item.report.metrics=solved.metrics;item.chance=chance;changes++;accepted=true;break;
    }
    if(accepted)break;
   }
  }
  if(!accepted){
   // Escape a local placement minimum without changing the authored wall plan.
   const rs=rays(item.level),options=[];
   for(const [n,p] of points.entries()){
    const [cx,cy,rx,ry]=ROOMS[item.report.level-1][3][n],old=measure(rs,p).coverage;
    for(let x=cx-rx;x<=cx+rx;x+=6)for(let y=cy-ry;y<=cy+ry;y+=5)for(const r of [...new Set([p.r,12,16,20,24,28])]){
     const q={x:Math.round(x),y:Math.round(y),r};
     if(q.y-r<56||q.y+r>302||item.level.walls.some(w=>inside(q,w,r+5))||points.some((other,j)=>j!==n&&Math.hypot(other.x-q.x,other.y-q.y)<other.r+r+20))continue;
     const m=measure(rs,q);if(m.width<3.3||m.coverage>=old||item.level.nodes.length===0&&m.minBounces===0)continue;
     const estimated=item.chance*(m.coverage/old);options.push({n,q,score:Math.abs(estimated-limit)+(estimated>limit?.1:0)});
    }
   }
   options.sort((a,b)=>a.score-b.score);
   for(const option of options.slice(0,40)){
    const candidate=clone(item.level);Object.assign([...candidate.nodes,candidate.exit][option.n],option.q);
    const solved=solve(candidate);if(!solved)continue;
    const chance=blindWinChance(candidate);if(chance>=item.chance-1e-7)continue;
    item.level=candidate;item.solution=solved.angles;item.report.metrics=solved.metrics;item.chance=chance;changes++;accepted=true;break;
   }
  }
  if(!accepted){
   const previous=ordered[i-1],ceiling=i>1?ordered[i-2].chance*.98:1;
   for(const [n,p] of [...previous.level.nodes,previous.level.exit].entries()){
    for(const extra of [.5,1,1.5,2,3,4]){
     const candidate=clone(previous.level),target=[...candidate.nodes,candidate.exit][n];target.r+=extra;
     if(target.r>32||target.y-target.r<56||target.y+target.r>302||candidate.walls.some(w=>inside(target,w,target.r+5))||[...candidate.nodes,candidate.exit].some(q=>q!==target&&Math.hypot(q.x-target.x,q.y-target.y)<q.r+target.r+20))continue;
     const solved=solve(candidate);if(!solved)continue;
     const chance=blindWinChance(candidate);if(chance<=previous.chance+1e-7||chance>ceiling+1e-10)continue;
     previous.level=candidate;previous.solution=solved.angles;previous.report.metrics=solved.metrics;previous.chance=chance;limit=chance*.98;changes++;accepted=true;break;
    }
    if(accepted)break;
   }
  }
  if(!accepted||changes>100)throw Error('Cannot separate adjacent difficulty at '+(i+1)+' '+item.level.name+' '+item.chance+' > '+limit+' '+JSON.stringify(item.level.exit)+' metrics '+JSON.stringify(item.report.metrics));
 }
 console.log('Tuned',i+1,item.level.name,changes,'adjustments',item.chance);
}
const orderedChapters=['第一次绕行','折返点选择','转角与石台','错层空间','分路挑战','目标规划','多点绕行','回环通道','连环反射','深处试炼'];
for(const [i,item] of ordered.entries()){
 item.level.id=i+1;item.level.chapter=orderedChapters[Math.floor(i/5)];
 item.level.difficulty={rank:i+1,blindWinChance:+item.chance.toFixed(9),minBounces:item.report.metrics.map(m=>m.minBounces)};
 item.report={...item.report,authoredRoom:item.report.level,level:i+1,chapter:item.level.chapter,solutions:item.solution,shots:item.level.shots,blindWinChance:item.level.difficulty.blindWinChance};
 console.log('Ordered',i+1,item.level.name,(100*item.chance).toFixed(4)+'%');
}
fs.writeFileSync('games/marble/puzzle-levels.js','// Normal v2: 50 independently authored structures, ordered by actual full-room angle scan.\nexport const LEVELS = '+JSON.stringify(ordered.map(v=>v.level),null,2)+';\n');
fs.writeFileSync('games/marble/puzzle-solutions.js','export const SOLUTIONS = '+JSON.stringify(ordered.map(v=>v.solution))+';\n');
fs.mkdirSync('output/puzzle-normal-v2',{recursive:true});fs.writeFileSync('output/puzzle-normal-v2/angles.json',JSON.stringify(ordered.map(v=>v.report),null,2));
