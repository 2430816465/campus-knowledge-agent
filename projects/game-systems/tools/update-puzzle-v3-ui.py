from pathlib import Path
root=Path(__file__).resolve().parent.parent
p=root/'games/marble/puzzle-main.js';s=p.read_text(encoding='utf-8')
s=s.replace('marble.ruins.v2','marble.ruins.v3').replace('marble-ruins-v2-level-','marble-ruins-level-')
s=s.replace('四章 · 二十关','十章 · 五十关').replace('/ 20</b>','/ 50</b>').replace('/ 60</span>','/ 150</span>').replace('二十关完成','五十关完成')
s=s.replace("['曲折入门','机关组合','多段回路','终极试炼']", "[...new Set(LEVELS.map(l=>l.chapter))]")
s=s.replace('每发最多 12 次碰撞、8 秒飞行。','每发飞行最多 8 秒，复杂关增加碰撞额度。')
s=s.replace('一星：通关；', '同字母圆环是传送门：穿过后保持方向，不连线穿墙。橙色虚线镜面反射一次后消失，变化保留到下一发。绿色晶体将弹珠分为两颗；绿色分流印须由子弹珠在同一发内全部点亮，分裂不递归。<br>一星：通关；')
s=s.replace('多发关逐步更新。','多发关逐步更新；传送跳跃留空，分裂后显示两条支路。')
# Round reference angle only for display; route simulation retains full precision.
p.write_text(s,encoding='utf-8')
p=root/'games/marble/ui-endless.js';s=p.read_text(encoding='utf-8').replace('20 道机关','50 道机关');p.write_text(s,encoding='utf-8')
p=root/'games/marble/puzzle.css';s=p.read_text(encoding='utf-8')
s+='\n/* Ten chapters in two compact rows; five rooms remain visible per chapter. */\n.chapters{grid-template-columns:repeat(5,minmax(0,1fr))}.chapters button{min-height:44px}\n@media(orientation:portrait){.chapters{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(orientation:landscape) and (max-height:450px){.chapters{gap:5px;margin:6px 0}.chapters button{min-height:38px;font-size:11px;padding:4px 2px}}\n'
p.write_text(s,encoding='utf-8')
p=root/'games/marble/puzzle-render.js';s=p.read_text(encoding='utf-8')
s=s.replace("points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y))", "points.forEach((p,i)=>i&&!p.jump?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y))")
s=s.replace("line([{x:p.x1,y:p.y1},{x:p.x2,y:p.y2}],'#85cfdb',5);", "line([{x:p.x1,y:p.y1},{x:p.x2,y:p.y2}],p.fragile?'#ffbc66':'#85cfdb',5,p.fragile?[7,4]:[]);")
s=s.replace("for(const n of g.level.nodes){", """for(const p of g.level.portals||[]){disk(p.x,p.y,p.r+4,'#3b3048');c.strokeStyle=p.label==='B'?'#e5a4f4':'#9bdcff';c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.stroke();c.fillStyle=c.strokeStyle;c.font='bold 16px sans-serif';c.textAlign='center';c.fillText(p.label||'A',p.x,p.y+5);c.font='9px sans-serif';c.fillText('传送',p.x,p.y+p.r+12)}
 for(const q of g.level.splitters||[]){const used=g.splitUsed.includes(q.id);disk(q.x,q.y,q.r+4,used?'#607455':'#355f49');c.strokeStyle='#b8f5b0';c.lineWidth=2;c.beginPath();c.moveTo(q.x,q.y-q.r);c.lineTo(q.x+q.r,q.y);c.lineTo(q.x,q.y+q.r);c.lineTo(q.x-q.r,q.y);c.closePath();c.stroke();c.fillStyle='#dcffcf';c.font='bold 15px sans-serif';c.textAlign='center';c.fillText('⑂',q.x,q.y+5);c.font='9px sans-serif';c.fillText(used?'本发已分裂':'一珠两路',q.x,q.y+q.r+12)}
 for(const n of g.level.nodes){""")
s=s.replace("n.relay?'#d3a0ff'", "n.forkOnly?'#b8f5b0':n.relay?'#d3a0ff'")
s=s.replace("n.relay?n.label:arrow", "n.forkOnly?'⑂':n.relay?n.label:arrow")
s=s.replace("const label=n.relay?", "const label=n.forkOnly?'同发分流印':n.relay?")
s=s.replace("line(route.points,'#061820',4,[6,4]);line(route.points,'#76ffeb',2,[6,4]);for(const p of route.points.slice(1))disk(p.x,p.y,2,'#76ffeb')", "for(const [i,path] of (route.paths||[route.points]).entries()){const color=i===2?'#ffdf83':'#76ffeb';line(path,'#061820',4,[6,4]);line(path,color,2,[6,4]);for(const p of path.slice(1))disk(p.x,p.y,2,color)}")
s=s.replace("line(g.lastPath,'#62472d66',1,[3,5]);", "for(const path of g.lastPaths||[g.lastPath])line(path,'#62472d66',1,[3,5]);")
s=s.replace("if(g.ball){line(g.path.slice(-4).concat([{x:g.ball.x,y:g.ball.y}]),orb+'55',3);c.shadowColor=orb;c.shadowBlur=15;disk(g.ball.x,g.ball.y,5,orb);c.shadowBlur=0}", "for(const b of g.balls.filter(b=>!b.dead)){const color=b.id===2?'#ffdf83':orb;line(g.paths[b.id].slice(-3).concat([{x:b.x,y:b.y}]),color+'88',2);c.shadowColor=color;c.shadowBlur=12;disk(b.x,b.y,5,color);c.shadowBlur=0}")
p.write_text(s,encoding='utf-8')
