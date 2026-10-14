/* Development provider only. No production SDK and no commercial impressions. */
(function(root){
 try{if(parent!==root&&parent.CampAds){const shared=parent.CampAds;root.CampAds=Object.freeze({...shared,async show(...args){try{return await shared.show(...args);}finally{if(!document.hidden&&root.frameElement?.isConnected&&!root.CampHostOverlayOpen)root.focus();}}});return;}}catch{}
 const KEY='adventure-camp.test-ads.v1',POLICY={daily:6,perRun:2,cooldownMs:120000};let pending=null,dismiss=null;
 function read(){try{const s=JSON.parse(localStorage.getItem(KEY));return Array.isArray(s?.receipts)?s:{receipts:[]};}catch{return {receipts:[]};}}
 const day=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 function reserve(mode,placement,runId){
  runId=String(runId||'local');const s=read(),today=s.receipts.filter(r=>r.day===day());
  const reason=pending?'已有模拟广告进行中':today.length>=POLICY.daily?'今天的模拟广告已达6次':today.filter(r=>r.mode===mode&&r.runId===runId).length>=POLICY.perRun?'本局模拟广告已达2次':Date.now()-(s.last||0)<POLICY.cooldownMs?'两次模拟广告之间需间隔2分钟':'';
  if(reason)return {ok:false,reason};
  const ticket={id:crypto.randomUUID(),mode,placement,runId:String(runId||'local'),at:Date.now()};pending=ticket;return {ok:true,ticket};
 }
 function complete(ticket,outcome){
  if(!pending||pending.id!==ticket?.id)return false;pending=null;
  if(outcome!=='complete'&&outcome!=='completed')return false;
  const s=read();s.last=Date.now();s.receipts.push({...ticket,day:day(),completedAt:s.last});s.receipts=s.receipts.slice(-100);
  try{localStorage.setItem(KEY,JSON.stringify(s));}catch{return false;}return true;
 }
 function cancel(ticket){if(pending?.id===ticket?.id)pending=null;}
 async function show(mode,placement,runId){
  const permit=reserve(mode,placement,runId);if(!permit.ok)return {status:'failed',reason:permit.reason};
  const opener=document.activeElement;
  const layer=document.createElement('dialog');layer.setAttribute('aria-label','开发模拟广告');layer.style.cssText='position:fixed;inset:0;margin:0;width:100dvw;height:100dvh;max-width:none;max-height:none;box-sizing:border-box;border:0;z-index:20000;background:#fff0dc;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#563d28;padding:24px;text-align:center';
  const title=document.createElement('h2');title.textContent='开发模拟广告';const label=document.createElement('p');label.textContent='模拟剩余5秒 · 切后台暂停计时';const button=document.createElement('button');button.textContent='提前关闭 · 不领取奖励';button.style.minHeight='44px';layer.append(title,label,button);document.body.append(layer);
  return new Promise(resolve=>{
   let elapsed=0,last=performance.now(),finished=false,timer=null;
   const finish=outcome=>{
    if(finished)return;finished=true;dismiss=null;clearInterval(timer);root.removeEventListener('pagehide',cancelView);
    let granted=false;try{granted=complete(permit.ticket,outcome);}catch{cancel(permit.ticket);}
    try{if(layer.open)layer.close();}catch{}finally{layer.remove();}
    try{if(!document.hidden&&opener?.isConnected){opener.focus({preventScroll:true});if(!opener.contentWindow?.CampHostOverlayOpen)opener.contentWindow?.focus();}}catch{}
    resolve({status:granted?'completed':outcome==='cancel'?'cancelled':'failed'});
   };
   const cancelView=()=>finish('cancel');dismiss=cancelView;button.onclick=cancelView;
   layer.addEventListener('cancel',e=>{e.preventDefault();cancelView();});layer.addEventListener('close',cancelView);root.addEventListener('pagehide',cancelView);
   try{layer.showModal();button.focus();timer=setInterval(()=>{if(!layer.isConnected||!layer.open){cancelView();return;}const now=performance.now(),dt=Math.min(250,now-last);last=now;if(!document.hidden)elapsed+=dt;label.textContent='模拟剩余'+Math.max(0,Math.ceil(5-elapsed/1000))+'秒 · 切后台暂停计时';if(elapsed>=5000)finish('complete');},100);}catch{finish('failed');}
  });
 }
 root.CampAds=Object.freeze({environment:'development-simulation',policy:POLICY,reserve,complete,cancel,show,dismiss(){if(!dismiss)return false;dismiss();return true;},cancelAll(){dismiss?.();pending=null;}});
})(window);
