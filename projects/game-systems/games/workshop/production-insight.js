import {RECIPES,COLOR_NAMES,capacity,stockTotal,hasLine} from './economy.js';
export function productionInsight(s,recipe=s.recipe){
 const r=RECIPES[recipe],harvest=(s.resonance?.type==='harvest'?1.6:1)*(s.adBoost>0?2:1);
 const periods=s.collectors.map(lv=>lv?3/(1+.45*(lv-1))/harvest:Infinity);
 const oven=r.seconds/(1+.2*s.upgrades.polish)*(s.shop?.facilities.mill?.85:1);
 const raw=r.need.map((n,i)=>n*periods[i]||0),cycle=Math.max(oven,...raw);
 const bottleneck=raw.indexOf(Math.max(...raw));
 const missing=r.need.map((n,i)=>n>(s.dust[i]||0)+(i===0?(s.shop?.flour||0):0)?COLOR_NAMES[i]:null).filter(Boolean);
 const jamMissing=r.jam&&(s.shop?.jam||0)<r.jam;
 const state=stockTotal(s)>=capacity(s)?'仓库已满':s.job?'烘烤中':jamMissing?'缺少果酱':missing.length?'缺少 '+missing.join(' / '):'可以投料';
 return {cycle,oven,periods,bottleneck:Math.max(...raw)>oven?COLOR_NAMES[bottleneck]+'采集':'烤箱',state,manual:!hasLine(s)};
}
