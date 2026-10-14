from pathlib import Path
root=Path(__file__).resolve().parent.parent
p=root/'games/marble/puzzle-state.js'
s=p.read_text(encoding='utf-8').replace('start(index){this.trace=[];', 'start(index){this.routeHint=false;this.trace=[];')
p.write_text(s,encoding='utf-8')
p=root/'games/marble/puzzle-main.js'
s=p.read_text(encoding='utf-8')
s=s.replace("if(a==='retry'){start(g.index);return}","if(a==='retry'){const hint=g.routeHint;start(g.index);if(hint){g.routeHint=true;g.assistUsed=true;save();ui(true)}return}")
s=s.replace("else if(view==='help'){body=", "else if(view==='help'){body=")
s=s.replace("<h2>需要一点帮助？</h2>","<h2>需要一点帮助？</h2><div class=\"help\"><b>正确路线 · 全程虚线</b><p>每次显示当前一发的完整正确路线与角度，多发关逐步更新。若当前机关或剩余发数无法沿参考路线通关，可免费重置并保留提示。</p>${btn(g.routeHint?'正确路线已解锁':'模拟广告 · 显示正确路线','ad:route','gold',!!g.routeHint)}${g.routeHint&&!g.route()?btn('免费重置并显示路线','retry'):''}</div>")
s=s.replace('教学关提供免费提示，不开放广告帮助。','教学关保留免费文字提示，也可选择广告解锁完整路线。')
s=s.replace('本次挑战两种帮助共享一次。','补发与延长预测共享一次；正确路线可单独解锁，免费重试保留，离开本关后重新解锁。')
s=s.replace("adKind==='extra'?'保留机关，增加 1 发':'下一发显示 3 次碰撞路径'","adKind==='route'?'显示正确路线的完整虚线':adKind==='extra'?'保留机关，增加 1 发':'下一发显示 3 次碰撞路径'")
s=s.replace('观看完成才占用本次帮助次数。失败后仍可免费重试。','观看完成才获得对应帮助。路线提示可随免费重试保留；取消和加载失败不会发奖。')
s=s.replace("if(g.index<3||g.assistUsed||!['aim','failed'].includes(g.phase)||id==='preview'&&g.phase!=='aim')return;adKind=id;view='ad'", "if(!['aim','failed'].includes(g.phase))return;if(id==='route'){if(g.routeHint)return}else if(!['extra','preview'].includes(id)||g.index<3||g.assistUsed||id==='preview'&&g.phase!=='aim')return;adKind=id;view='ad'")
s=s.replace("g.help(adKind,outcome);view=outcome==='complete'?'':'help';", "if(adKind==='route')g.unlockRoute(outcome);else g.help(adKind,outcome);view=outcome==='complete'?(g.routeHint&&!g.route()?'help':''):'help';")
s=s.replace("g.longPreview?'下一发：三段预测已启用':objective()", "g.routeHint?(g.route()?`正确路线：按青色虚线瞄准 ${g.route().angle.toFixed(2)}° · 剩余 ${g.route().remaining} 步`:'路线已偏离或发数不足 · 在帮助中免费重置并保留提示'):g.longPreview?'下一发：三段预测已启用':objective()")
s=s.replace('第 4 关起可选模拟广告：','全部关卡可通过模拟广告解锁完整正确路线虚线，多发关逐步显示，免费重试保留提示。第 4 关起还可选模拟广告：')
p.write_text(s,encoding='utf-8')
p=root/'games/marble/puzzle-render.js'
s=p.read_text(encoding='utf-8').replace(" line(g.lastPath,", " if(g.routeHint&&g.phase==='aim'){const route=g.route();if(route){line(route.points,'#061820',4,[6,4]);line(route.points,'#76ffeb',2,[6,4]);for(const p of route.points.slice(1))disk(p.x,p.y,2,'#76ffeb')}}\n line(g.lastPath,")
p.write_text(s,encoding='utf-8')
p=root/'tools/sync-marble-endless.py'
s=p.read_text(encoding='utf-8').replace("'puzzle.html',", "'puzzle-solutions.js', 'puzzle.html',")
p.write_text(s,encoding='utf-8')
