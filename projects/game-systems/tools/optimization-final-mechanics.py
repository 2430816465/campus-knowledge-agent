# -*- coding: utf-8 -*-
from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'games/marble/main.js';s=f.read_text(encoding='utf-8');a=s.index('function completeAd(){');b=s.index('\n',a)
s=s[:a]+'''async function completeAd(){
 if(busy)return;const kind=g.adKind,runId=g.adRunId,serial=g.adSerial,target=g.adTarget,outcome=document.querySelector('#ad-result')?.value||'fail';
 busy=true;g.paused=true;overlay='busy';lastUI='';ui();let result={status:'failed'};
 try{if(outcome==='complete')result=await window.CampAds.show('marble',kind,runId);}catch{}
 busy=false;g.paused=hostPaused;g.log('ad_outcome',{runId,kind,outcome:result.status});
 if(result.status==='completed'){
  const source='ad';if(kind==='pushback'){if(g.grantAssist(kind,source,runId,serial))g.panelOpen=false;}
  else if(['freeze','extraChoice','tier'].includes(kind))g.grantAssist(kind,source,target,serial);
  else if(kind==='adUndo')g.undo(true,source);else if(kind==='rescue')g.rescue(source);else if(kind==='relic')g.upgradeRelic(source);
  else if(kind==='bonus'&&!bonusPending){bonusPending=true;bonusSource=source;g.run.help.pendingBonus={source,amount:g.bonusValue()};g.persist();send('bonus',{runId:g.run.id,amount:g.bonusValue()});if(!camp){bonusPending=false;delete g.run.help.pendingBonus;g.bonusClaimed(source);}}
 }else g.notice=result.reason||((outcome==='cancel'||result.status==='cancelled')?'已提前关闭 · 原有奖励保留':'模拟广告失败 · 未发放帮助，免费选项仍可使用');
 overlay='';showScene();
}'''+s[b:];f.write_text(s,encoding='utf-8')
f=p/'games/tower/src/game.js';s=f.read_text(encoding='utf-8');s=s.replace("localStorage.setItem(SAVE_KEY, serialize());","const data=serialize();localStorage.setItem(SAVE_KEY,data);if(!silent)localStorage.setItem(SAVE_KEY+'.checkpoint',data);");s=s.replace('function load() {','function load(checkpoint=false) {').replace('raw = localStorage.getItem(SAVE_KEY);',"raw = localStorage.getItem(checkpoint?SAVE_KEY+'.checkpoint':SAVE_KEY);")
s=s.replace("$('btnLoad').onclick = () => load();","$('btnLoad').onclick = () => load(true);").replace("toast('没有存档');","toast(checkpoint?'尚未手动存档，自动进度仍保留':'没有存档');")
s=s.replace('现在是「点一下直接发奖励」的测试实现','开发版使用统一模拟广告')
f.write_text(s,encoding='utf-8')
f=p/'games/tower/index.html';s=f.read_text(encoding='utf-8').replace('data-icon="▣">存档','data-icon="▣" title="免费保存独立检查点，自动进度仍继续">存档').replace('data-icon="📖">读档','data-icon="📖" title="恢复手动保存的检查点">读档');f.write_text(s,encoding='utf-8')
