import {artURL,sprite,lamps} from './puzzle-art.js';
export const TUTORIALS={
 shoot:{title:'发射与出口',art:'launcher',effect:'拖动瞄准，松手发射。让弹珠碰到发光的金色出口，就能过关。',tip:'拖到右下角“取消”后松手可取消。左右滑动调整角度，松手发射。'},
 bounce:{title:'墙面反弹',art:'orb',effect:'弹珠撞到墙面会反射。沿墙面法线观察：入射角与反射角相等。',tip:'出口下方有几盏灯，就要求本发先反弹几次；教程不消耗发射次数。'},
 mirror:{title:'永久镜面',art:'mirror',effect:'蓝色长镜面会改变弹珠方向。斜放的镜面可以把弹珠送向另一条通道。',tip:'镜面不会被普通命中消耗，可以反复借它折返。'},
 stone:{title:'石墙与通道',art:'wall',effect:'蓝灰色石墙挡住直线，也能用来反弹。找通道，或借边墙绕到障碍另一侧。',tip:'灰色轨迹是上一发经过的位置，可以据此调整角度。'},
 switch:{title:'青色机关',art:'switch',effect:'碰到青色方形机关即可点亮。机关全部完成后，封闭的出口变为金色。',tip:'普通机关进度跨发射保留；已点亮的机关不再阻挡弹珠。'},
 break:{title:'裂纹石墙',art:'wall-break',effect:'橙褐色的大裂纹石墙一撞就碎，弹珠继续向前，下一发也可以穿过原位置。',tip:'破墙不算反弹。先开路，再规划剩余发射；免费重试会恢复石墙。'},
 direction:{title:'方向封印',art:'direction',effect:'必须在命中时沿箭头方向行进，才能点亮这枚封印。',tip:'箭头朝下时，需先借墙折回再向下命中；从错误方向撞上会弹开。'},
 hazard:{title:'尖刺障碍',art:'spikes',effect:'红边尖刺柱会结束碰到它的那颗弹珠。它不是可利用的反弹面。',tip:'注意针柱外侧的尖齿，找能避开整根柱子的路线。'},
 key:{title:'钥匙机关',art:'key',effect:'撞到金色钥匙会收集它，并打开对应的门或出口。',tip:'钥匙和开门进度保留到下一发；可以先取钥，再寻找出口路线。'},
 charge:{title:'反弹蓄能',art:'charge',effect:'金色晶体需要本发先完成指定次数的真实反弹，才能激活。下方灯条显示要求。',tip:'碰墙、石墙和镜面算反弹；取机关、碎墙、传送和分裂不算。'},
 rotate:{title:'转镜齿轮',art:'rotate',effect:'碰到青色齿轮后，对应镜面会转向，改变后续反射路线。',tip:'转镜结果跨发射保留。先看镜面改变后的方向，再决定下一发。'},
 relay:{title:'同发顺序星印',art:'relay',effect:'紫色星印要在同一发里按底座灯数从少到多点亮：一灯、二灯、三灯。',tip:'前一枚未点亮，后一枚会弹开；本发结束时未通关，星印会熄灭。'},
 rune:{title:'额外符文',art:'rune',effect:'紫色菱形符文是额外收集目标。碰到它会保存收集进度，帮助取得符文星。',tip:'留意出口条件：有的关卡也把符文列为开门要求；不用多次重复收集。'},
 portal:{title:'成对传送门',art:'portal-blue',effect:'穿入蓝色传送门，弹珠会从同样造型的另一扇门出现，方向和反弹次数保持。',tip:'传送不是反弹。正确路线虚线会在跳跃处断开，不表示弹珠穿过了石墙。'},
 fragile:{title:'一次性碎镜',art:'mirror-fragile',effect:'铜橙色端头的裂镜只反射一次，随后消失。消失的状态保留到下一发。',tip:'可以先借镜取机关，下一发再穿过原镜位；免费重试才会恢复镜面。'},
 split:{title:'分裂晶体',art:'splitter',effect:'命中三叉绿色晶体，主弹珠被替换为两颗子弹珠，分别向两侧飞行。',tip:'不递归分裂，最多两颗同时飞行；一颗回收后，另一颗仍可以继续。'},
 fork:{title:'同发分流印',art:'fork',effect:'双颗绿色宝石只接受分裂后的子弹珠。本发要点亮所有分流印，出口才会打开。',tip:'主弹珠直击无效；本发结束未通关会重置分流印，不能分两发慢慢收集。'},
 pairs:{title:'两组空间门',art:'portal-violet',effect:'蓝色四晶圆门是一对，紫色双晶八角门是另一对。按颜色和造型识别对应出口。',tip:'两组门不会互通；每颗弹珠传送最多6次，避免无尽绕门。'},
 compound:{title:'复合星印',art:'relay',effect:'星印的顺序、金色蓄能灯条和旁边的方向箭头可能同时出现，需要全部满足。',tip:'先按星印底座灯数规划顺序，再确认本发反弹次数和到达方向。'}
};
export function mechanisms(l,index=0){
 const ids=['shoot'];if(l.exit.minBounces||l.plates.length||l.walls.length)ids.push('bounce');if(l.plates.some(p=>!p.fragile))ids.push('mirror');
 if(l.walls.some(w=>!w.breakable&&!w.hazard&&!w.gate))ids.push('stone');
 if(l.nodes.some(n=>n.kind==='switch'&&n.rotate===undefined))ids.push('switch');
 if(l.walls.some(w=>w.breakable))ids.push('break');if(l.nodes.some(n=>n.direction))ids.push('direction');
 if(l.walls.some(w=>w.hazard))ids.push('hazard');if(l.nodes.some(n=>n.kind==='key'))ids.push('key');
 if(l.nodes.some(n=>n.minBounces))ids.push('charge');if(l.nodes.some(n=>n.rotate!==undefined))ids.push('rotate');
 if(l.nodes.some(n=>n.relay&&!n.forkOnly))ids.push('relay');if(l.nodes.some(n=>n.kind==='rune'))ids.push('rune');
 if(l.portals?.length)ids.push('portal');if(l.plates.some(p=>p.fragile))ids.push('fragile');
 if(l.splitters?.length)ids.push('split');if(l.nodes.some(n=>n.forkOnly))ids.push('fork');
 if(l.portals?.length>2)ids.push('pairs');if(l.nodes.some(n=>n.relay&&(n.minBounces||n.direction)))ids.push('compound');
 return ids;
}
export function tutorialBody(id,number,total,button){
 const t=TUTORIALS[id];return `<div class="tutorial-top"><span>机关手册 · ${number}/${total}</span>${button('稍后再看','tutorialSkip','small')}</div><h2>${t.title}</h2><div class="tutorial-art"><img src="${artURL(t.art)}" alt="${t.title}"/><span>关卡里的实际图案</span></div><canvas id="tutorialDemo" width="480" height="240" aria-label="${t.title}效果演示"></canvas><p class="tutorial-effect">${t.effect}</p><p class="tutorial-tip">${t.tip}</p><div class="row">${button(number<total?'下一个机制 →':'明白了 · 开始挑战','tutorialNext','gold')}</div><small class="tutorial-foot">免费教程 · 本关暂停 · 不消耗发射次数</small>`;
}
function poly(c,pts,color='#b5dae9'){c.strokeStyle=color;c.setLineDash([3,3]);c.lineWidth=1;c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();c.setLineDash([])}
function moving(c,pts,p,color='orb'){
 const lengths=pts.slice(1).map((q,i)=>Math.hypot(q[0]-pts[i][0],q[1]-pts[i][1]));let d=p*lengths.reduce((a,b)=>a+b,0);
 for(let i=0;i<lengths.length;i++){if(d<=lengths[i]||i===lengths.length-1){const f=Math.min(1,d/lengths[i]);sprite(c,color,pts[i][0]+(pts[i+1][0]-pts[i][0])*f,pts[i][1]+(pts[i+1][1]-pts[i][1])*f,10);return}d-=lengths[i]}
}
export function drawTutorial(canvas,id,time){
 if(!canvas)return;const c=canvas.getContext('2d');c.setTransform(2,0,0,2,0,0);c.imageSmoothingEnabled=false;c.fillStyle='#101d30';c.fillRect(0,0,240,120);
 const p=(time%5000)/5000,t=TUTORIALS[id];
 if(['portal','pairs'].includes(id)){
  sprite(c,'portal-blue',82,66,34);sprite(c,'portal-blue',174,78,34);
  if(id==='pairs'){sprite(c,'portal-violet',42,26,24);sprite(c,'portal-violet',210,28,24)}
  const a=[[25,104],[82,66]],b=[[174,78],[230,41]];poly(c,a);poly(c,b);moving(c,p<.5?a:b,p<.5?p*2:(p-.5)*2);
 }else if(['split','fork'].includes(id)){
  sprite(c,'splitter',120,72,38);sprite(c,'fork',90,20,28);sprite(c,'fork',150,20,28);
  const a=[[120,115],[120,72]],b=[[120,72],[90,20]],d=[[120,72],[150,20]];poly(c,a);poly(c,b,'#9bf0cb');poly(c,d,'#ffe59e');
  if(p<.35)moving(c,a,p/.35);else{moving(c,b,(p-.35)/.65,'orb-mint');moving(c,d,(p-.35)/.65)}
 }else if(['mirror','fragile','bounce'].includes(id)){
  const pts=id==='fragile'&&p>.5?[[32,105],[205,20]]:[[30,104],[116,33],[205,104]];
  if(id==='bounce')sprite(c,'wall',116,24,154,18);
  else if(id!=='fragile'||p<=.5)sprite(c,id==='fragile'?'mirror-fragile':'mirror',116,33,120,10);
  poly(c,pts);moving(c,pts,id==='fragile'?(p% .5)*2:p);
 }else if(id==='charge'){
  c.fillStyle='#597588';c.fillRect(20,14,206,6);c.fillRect(220,20,6,84);c.fillRect(50,100,155,7);
  sprite(c,'charge',199,40,30);lamps(c,199,62,3,p>.75?3:Math.floor(p*4));const pts=[[30,90],[100,20],[180,100],[220,60],[199,40]];poly(c,pts);moving(c,pts,p);
 }else if(['relay','compound'].includes(id)){
  const compound=id==='compound';sprite(c,'relay',75,63,35);sprite(c,'relay',163,63,35);lamps(c,75,85,1,p>(compound?.43:.3)?1:0,'#d2a1ff');lamps(c,163,85,2,p>(compound?.78:.7)?2:0,'#d2a1ff');
  if(compound){sprite(c,'charge',58,43,14);c.save();c.translate(180,43);c.rotate(Math.PI/2);sprite(c,'direction',0,0,14);c.restore();c.fillStyle='#597588';c.fillRect(8,16,6,88)}
  const pts=compound?[[60,63],[14,63],[75,63],[163,63],[220,63]]:[[23,63],[75,63],[163,63],[220,63]];poly(c,pts);moving(c,pts,p);
 }else if(id==='rotate'){
  sprite(c,'rotate',63,80,38);c.save();c.translate(165,53);c.rotate(p>.5?.5:-.5);sprite(c,'mirror',0,0,105,10);c.restore();const pts=[[20,105],[63,80]];poly(c,pts);moving(c,pts,Math.min(1,p*2));
 }else if(id==='direction'){
  sprite(c,'direction',120,56,38);const correct=p<.5,pts=correct?[[120,109],[120,56],[120,15]]:[[120,15],[120,36],[168,15]];
  poly(c,pts,correct?'#9bf0cb':'#ed8792');moving(c,pts,(p% .5)*2);
  c.fillStyle=correct?'#9bf0cb':'#ed8792';c.fillRect(113,81,14,3);
 }else if(id==='hazard'){
  sprite(c,'spikes',122,51,54,28);const pts=[[25,102],[122,51]];poly(c,pts,'#ed8792');if(p<.6)moving(c,pts,p/.6);
 }else if(['stone','break'].includes(id)){
  if(id!=='break'||p<.5)sprite(c,t.art,120,58,40,72);const pts=id==='break'?[[20,58],[220,58]]:[[30,104],[82,20],[207,104]];poly(c,pts);moving(c,pts,p);
 }else if(id==='shoot'){
  sprite(c,'launcher',120,103,32);sprite(c,'exit-open',120,25,36);const pts=[[120,103],[120,25]];poly(c,pts);moving(c,pts,p);
 }else{
  sprite(c,id==='shoot'?'launcher':t.art,90,72,36);sprite(c,p>.45?'exit-open':'exit-closed',205,72,36);const pts=[[20,72],[90,72],[205,72]];poly(c,pts);moving(c,pts,p);
 }
}
