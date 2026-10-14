(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.RushGuide=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const KEY='zcyg_mechanism_guides_v1';
  const definitions={
    movement:{title:'移动与接力',icon:'checkpoint',intro:'按住战场空白处唤出移动轮盘，左右拖动移动，松手停下；右侧跳跃与互动。单人点左上角切换 1P / 2P；电脑版 AD、空格、E，Q 切人。',try:'长按跳跃可以跳得更高。先把一位角色送到安全位置，再切换伙伴。'},
    dash:{title:'1P · 冲刺破障',icon:'../coop-ruins/break-box.svg',intro:'1P 面向障碍，按互动发起冲刺。带裂纹的大箱可以撞碎，普通墙壁不能撞穿。',try:'站稳后面向裂纹大箱，按互动冲过去。冲刺结束后稍等冷却。'},
    doubleJump:{title:'2P · 二段跳与搭肩',icon:'checkpoint',intro:'2P 在空中再次点跳，可以二段跳。靠近 1P 按互动搭肩，跳跃离肩；1P 能背着伙伴移动。',try:'先跳起，再松开并第二次点跳。需要到高处时先搭肩，然后跳离伙伴。'},
    push:{title:'2P · 推箱',icon:'../coop-ruins/push-box.svg',intro:'小木箱由 2P 推动，可以垫脚，也会连带推动伙伴。大裂纹箱由 1P 冲刺破坏。',try:'贴住小箱持续移动，将它推到需要的落脚位置，注意边缘。'},
    lift:{title:'移动平台',icon:'../coop-ruins/mover.svg',intro:'带亮边的移动平台沿轨道自动往返。站稳后会随着平台移动，不需要开关。',try:'观察平台方向，等它靠近再起跳。头顶有障碍时注意挤压。'},
    patrol:{title:'巡逻机关',icon:'../coop-ruins/patrol.svg',intro:'巡逻机关碰到角色会让两人返回检查点。2P 靠近后互动可以暂停它两秒。',try:'先观察巡逻方向。2P 暂停机关后赶快通过，或从上方跳过。'},
    spikes:{title:'尖刺危险区',icon:'poison-sign',intro:'尖刺有明显的红色尖端，接触会让两人回到检查点。普通地面和移动平台可以安全落脚。',try:'从安全地面起跳，越过完整尖刺区域，留意头顶和侧面的尖刺。'},
    checkpoint:{title:'共同检查点',icon:'checkpoint',intro:'检查旗有 1P / 2P 的标记。触碰各自旗帜后，检查点保存当时的两人位置和机关。',try:'碰到标记后再前进。主动重置或失足，会让两人一起恢复最近检查点。'},
    pickup:{title:'遗迹徽记',icon:'chest',intro:'徽记与代币可以碰触收集，是探索记录，不会挡住出口，也不必看广告。',try:'优先保证伙伴安全；有余力再探索隐藏的徽记。'},
    sharedExit:{title:'共同出口',icon:'../coop-ruins/exit.svg',intro:'两位伙伴同时到出口才能通关。单人先把一人留在门边，再切换另一人。',try:'联机每关结束由房主直接点下一关，无需再次准备。普通与困难各36关，分别保存进度。'}
  };
  function candidates(world,G){
    const L=G.stageFor(world),out=[{kind:'movement',entity:world.players[0]}];
    const add=(kind,items)=>items.forEach(entity=>out.push({kind,entity}));
    add('dash',L.boxes.filter(b=>b.breakable));add('doubleJump',[world.players[1]]);
    add('push',L.boxes.filter(b=>b.movable));add('lift',world.lifts);add('patrol',world.enemies||[]);
    add('spikes',L.hazards);add('checkpoint',L.checkpoints);add('pickup',L.pickups);add('sharedExit',[L.exit]);return out;
  }
  const api={KEY,definitions,candidates};
  if(typeof document==='undefined')return api;
  const $=s=>document.querySelector(s),panel=$('#mechanismGuide');
  let seen=new Set(),active=null,step=0,lastState=null,slot=0,release=()=>{},onDismiss=()=>{},cooldown=0,stamp='',suppressed=new Set(),library=false;
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))seen=new Set(saved.filter(x=>definitions[x]));}catch(_){}
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify([...seen]));}catch(_){}};
  function close(){
    const restore=lastState?.solo||library||active?.manual;
    panel.hidden=true;$('#guideLibrary').hidden=true;active=null;library=false;step=0;cooldown=performance.now()+1000;
    if(restore){release();onDismiss();}
  }
  function show(item,manual=false){
    active={...item,manual,startX:lastState?.world.players[slot]?.x||0,startTick:lastState?.world.tick||0};step=0;library=false;
    $('#guideLibrary').hidden=true;panel.hidden=false;panel.classList.remove('practice');
    panel.setAttribute('role',lastState?.solo?'dialog':'region');panel.setAttribute('aria-modal',String(!!lastState?.solo));
    const d=definitions[item.kind];$('#guideTitle').textContent=d.title;$('#guideBody').textContent=d.intro;
    $('#guideImage').src='assets/pixel-v3/'+d.icon+(d.icon.endsWith('.svg')?'':'.png');$('#guideImage').alt=d.title;
    $('#guideMode').textContent=lastState?.solo?'初遇引导 · 单人已暂停':'初遇引导 · 联机继续进行';
    $('#guideConfirm').textContent='我来试试';$('#guideConfirm').hidden=false;
    if(lastState?.solo||manual)release();
    if(lastState?.solo)$('#guideConfirm').focus({preventScroll:true});
  }
  function acknowledge(){
    if(!active)return;seen.add(active.kind);save();step=1;panel.classList.add('practice');panel.setAttribute('aria-modal','false');panel.setAttribute('role','region');
    $('#guideBody').textContent=definitions[active.kind].try;$('#guideMode').textContent='试试看 · 可随时收起';$('#guideConfirm').textContent='收起提示';
    if(lastState?.solo||active.manual){release();onDismiss();}
  }
  function completed(w,G){
    const e=active?.entity,k=active?.kind;if(!e)return false;
    if(k==='movement')return Math.abs(w.players[slot].x-active.startX)>70;
    if(k==='dash')return w.players[0].dash>0;
    if(k==='doubleJump')return w.players[1].jumps===2;
    if(k==='push')return w.boxes.some(b=>b.id===e.id&&Math.abs(b.x-e.x)>20);
    if(k==='patrol')return w.enemies.some(p=>p.id===e.id&&p.paused>0);
    if(k==='pickup')return w.pickups.some(p=>p.id===e.id&&p.collected);
    if(k==='plate'||k==='dualSeal')return !!w.plates[e.id];
    if(k==='gate')return !G.activeGate(e,w);
    if(['rune','roleRune','sequence'].includes(k))return !!w.flags[e.key];
    if(k==='bridge')return G.bridgeIsActive(e,w);
    if(k==='crystal')return !!w.flags[e.key];
    if(k==='lift'){const l=w.lifts.find(x=>x.id===e.id);return !!l&&Math.abs(l.y-e.y)>25;}
    if(k==='sharedExit')return w.players.every(p=>G.rectsOverlap(G.bodyRect(p),e));
    if(k==='roleExit')return w.phase!=='playing';
    return false;
  }
  function update(state,own){
    lastState=state;slot=Math.max(0,own);const w=state?.world,G=window.RushGame;
    if(!w||state.phase!=='playing'||!document.body.classList.contains('in-game')){if(active||library)close();return;}
    const nextStamp=w.levelIndex+':'+(w.roomIndex||0)+':'+w.run;
    if(stamp!==nextStamp){if(active||library)close();stamp=nextStamp;suppressed.clear();}
    if(active&&step===1&&completed(w,G)){close();return;}
    if(active||library||w.fall||document.hidden||window.campPaused||!$('#cornerPanel').hidden||!$('#gameHelp').classList.contains('hidden')||performance.now()<cooldown)return;
    const p=w.players[slot];
    const items=candidates(w,G).filter(x=>!seen.has(x.kind)&&!suppressed.has(x.kind));
    const next=items.find(x=>{
      if(x.kind==='movement')return true;
      const e=x.entity,px=p.x+18,py=p.y+56;
      const dx=Math.max(e.x-px,0,px-(e.x+(e.w||36)));
      const dy=Math.max(e.y-py,0,py-(e.y+(e.h||56)));
      return dx<165&&dy<135;
    });
    if(next)show({...next,entity:{...next.entity}});
  }
  function openLibrary(){
    close();library=true;$('#guideLibrary').hidden=false;release();
    const list=$('#guideList');list.replaceChildren();
    const map=new Map(candidates(lastState.world,window.RushGame).map(x=>[x.kind,x]));
    Object.entries(definitions).forEach(([kind,d])=>{
      const button=document.createElement('button');button.type='button';button.textContent=(seen.has(kind)?'✓ ':'◇ ')+d.title;
      button.onclick=()=>show(map.get(kind)||{kind,entity:null},true);list.append(button);
    });$('#closeGuideLibrary').focus({preventScroll:true});
  }
  $('#guideConfirm').onclick=()=>step===0?acknowledge():close();
  $('#guideSkip').onclick=()=>{if(active){seen.add(active.kind);save();}close();};
  $('#guideClose').onclick=()=>{if(active){suppressed.add(active.kind);}close();};
  $('#mechanismHelp').onclick=openLibrary;
  $('#closeGuideLibrary').onclick=close;
  $('#resetGuides').onclick=()=>{seen.clear();save();close();};
  window.addEventListener('keydown',event=>{
    if(!(active||library))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(active)suppressed.add(active.kind);close();}
    else if(api.blocking&&!/INPUT|SELECT|TEXTAREA/.test(event.target?.tagName)&&[' ','ArrowLeft','ArrowRight','ArrowUp','a','d','e','q','Tab'].includes(event.key)&&event.target?.tagName!=='BUTTON'){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  Object.assign(api,{update,close,openLibrary,bind(callback,dismiss){release=callback;onDismiss=dismiss;},inspect:()=>({active:active?.kind||null,step,library,seen:[...seen],blocking:api.blocking,target:active?.entity||null})});
  Object.defineProperty(api,'blocking',{get:()=>!!lastState?.solo&&(library||!!active&&step===0)});
  Object.defineProperty(api,'target',{get:()=>active?.entity});
  return api;
});
