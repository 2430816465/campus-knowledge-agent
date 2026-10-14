// Browser demo only. Replace this boundary with the target platform implementation.
const KEY='adventure-camp-demo-v1';
export const platform={
 load(){try{return JSON.parse(localStorage.getItem(KEY))}catch{return null}},
 save(data){localStorage.setItem(KEY,JSON.stringify(data))},
 async share(text){try{await navigator.clipboard.writeText(text);return '演示邀请已复制；不能连接真实好友'}catch{return text}},
 orientation(){return {canLock:false,current:innerWidth>innerHeight?'landscape':'portrait'}},
 vibrate(enabled){if(enabled)navigator.vibrate?.(15)},
 async ad(outcome,onState=()=>{},runId='camp-local'){
  if(!globalThis.CampAds)return 'unavailable';
  onState('开发模拟广告，不产生商业收入');
  if(outcome!=='complete')return outcome==='cancel'?'cancel':'unavailable';
  const result=await globalThis.CampAds.show('camp','wallet-bonus',runId);
  onState(result.reason||'模拟结束');
  return result.status==='completed'?'complete':result.status==='cancelled'?'cancel':'unavailable';
 }
};
