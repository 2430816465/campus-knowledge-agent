import {cost,collectorUnlocked,grantAd} from './economy.js';
export function rewardOffer(s,placement,machine=0){
 if(s.adCooldown>0||s.deliveries<1)return null;
 if(placement==='production')return {placement,value:30,label:'30 秒双倍生产'};
 if(placement==='offline')return s.offlineBonus>0?{placement,value:Math.floor(s.offlineBonus),label:`额外 ${Math.floor(s.offlineBonus)} 金币`}:null;
 if(placement==='coins'){
  if(!Number.isInteger(machine)||machine<0||machine>5)return null;
  const kind=machine<3?'collector':['rail','polish','storage'][machine-3],index=machine<3?machine:0,level=machine<3?s.collectors[index]:s.upgrades[kind];
  if(level>=8||(machine<3&&!collectorUnlocked(s,index)))return null;
  const price=cost(s,kind,index);if(s.coins>=price)return null;
  const value=Math.min(120,Math.max(30,Math.ceil(price*.5)));return {placement,machine,value,label:`补贴 ${value} 金币`};
 }
 return null;
}
export function claimReward(s,offer){
 if(!offer||s.adCooldown>0||s.deliveries<1)return false;
 const valid=rewardOffer(s,offer.placement,offer.machine);if(!valid||valid.value!==offer.value)return false;
 if(offer.placement==='production')return grantAd(s);
 s.coins+=offer.value;s.earned+=offer.value;s.adCooldown=120;if(offer.placement==='offline')s.offlineBonus=0;return true;
}
