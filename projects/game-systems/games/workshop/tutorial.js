const KEY='demon-bakery-click-tutorial-v2';
const steps=[
 {title:'魔王的小小面包房',copy:'点地面走路，捡麦子烤面包。赚到第一笔金币，再扩建你的店。',action:'开始试试'},
 {title:'点击移动，走近就能捡',copy:'点麦田前的地面，捡起至少 2 份麦子。',travel:0,action:'前往麦田'},
 {title:'把麦子送进烤炉',copy:'点烤炉走过去，再点烤炉投料。',travel:'oven',action:'前往烤炉'},
 {title:'等待时，帮烤炉添把火',copy:'站在烤炉旁，不断点烤炉维持 2 倍速度；停手恢复正常。',travel:'oven',action:'前往烤炉'},
 {title:'面包烤好了',copy:'点烤炉取出面包。再捡麦子，做满 3 个。',travel:'oven',action:'前往烤炉'},
 {title:'做满三个面包',copy:'捡麦子 → 点烤炉投料 → 加速 → 取面包。',travel:0,action:'前往麦田'},
 {title:'给勇者送面包',copy:'走到右侧勇者旁，点“交付面包”赚取 90 金币。',travel:'customer',action:'前往勇者'},
 {title:'开通自动生产',copy:'进入设备页，用 50 金币建造流水线。',page:'production',action:'打开设备'},
 {title:'你的面包房开张了',copy:'流水线会自动生产。买奶牛后，站在奶牛旁连续点击，也能加速产奶。',action:'开始经营'},
 {title:'新功能：点设备帮忙',copy:'点设备先走过去，站在烤炉或奶牛旁连续点击，维持 2 倍生产速度；停手恢复正常。',action:'知道了'}
];
export function createTutorial({read,open,travel}){
 const $=id=>document.getElementById(id);let step=0,hidden=false,signature='';
 try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved){hidden=!!saved.done;step=Math.max(0,Math.min(9,saved.step||0));}else if(read().lineBuilt||JSON.parse(localStorage.getItem('demon-bakery-manual-tutorial-v1'))?.done)step=9;}catch{}
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({step,done:hidden}));}catch{}};
 function render(){
  const overlay=!$('management').hidden||$('dialog').open;
  $('guide').hidden=hidden||overlay;document.body.dataset.guide=String(!hidden&&!overlay);$('guide').dataset.step=step;document.body.dataset.guideSide='left';
  document.querySelectorAll('.tutorial-target').forEach(b=>b.classList.remove('tutorial-target'));if(hidden)return;
  const spec=steps[step],s=read(),progress=step===5?' 已完成 '+Math.min(s.goods[0],3)+' / 3。':'';
  const next=step+progress;if(signature!==next){signature=next;$('guide-step').textContent=step===0||step===9?'点击经营教学':step===8?'教学完成':'实操 '+step+' / 7';$('guide-title').textContent=spec.title;$('guide-copy').textContent=spec.copy+progress;$('guide-actions').innerHTML='<button id="guide-action">'+spec.action+'</button>';}
  if(step===7&&!overlay)document.querySelector('[data-open="production"]')?.classList.add('tutorial-target');
  if(step===7&&overlay)document.querySelector('#upgrade-3')?.classList.add('tutorial-target');
 }
 function update(){if(!hidden){const s=read();let next=step;if(step===1&&s.hand.raw[0]>=2)next=2;if(step===2&&s.job)next=3;if(step===3&&(s.hand.ready[0]||s.goods[0]>0))next=4;if(step===4&&s.goods[0]>0)next=5;if((step===4||step===5)&&s.goods[0]>=3)next=6;if(step>=1&&step<=7&&s.beacons>=1)next=s.lineBuilt?8:7;if(next!==step){step=next;save();}}render();}
 function finish(){hidden=true;save();render();}
 $('guide-skip').onclick=finish;
 $('guide-actions').addEventListener('click',e=>{if(!e.target.closest('button'))return;const spec=steps[step];if(step===0){step=read().beacons>0?(read().lineBuilt?8:7):1;save();update();}else if(step===8||step===9)finish();else if(spec.page)open(spec.page);else if(spec.travel!==undefined)travel(spec.travel);});
 return {update,notify(){update();},restart(){step=0;hidden=false;signature='';save();render();},snapshot:()=>({active:!hidden,step})};
}
