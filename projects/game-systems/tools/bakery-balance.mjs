import {fresh,upgrade,advance,sweep,deliver,currentOrder,RECIPES,hasLine,furnaceAction,handTotal} from '../games/workshop/economy.js';
import {FACILITIES,buildFacility,businessAction,stockShelf,shopGoal} from '../games/workshop/shop.js';
export function simulate({active=true,upgradeLimit=8,limit=10800}={}){
 const s=fresh(),milestones=[];
 for(let second=0;second<limit&&!shopGoal(s);second++){
  if(!hasLine(s)&&s.beacons>0)upgrade(s,'rail');
  if(!hasLine(s)&&second%3===0){
   if(s.hand.ready.some(n=>n>0))furnaceAction(s);
   else if(!s.job&&(handTotal(s)>=2||s.dust[0]>=2))furnaceAction(s);
   else if(!s.job)sweep(s);
  }
  for(let i=1;i<3;i++)if(s.beacons>=i&&!s.collectors[i])upgrade(s,'collector',i);
  const order=currentOrder(s);s.recipe=Math.max(0,order.need.findIndex((n,i)=>s.goods[i]<n));
  if(active&&s.sweepCooldown<=0){const r=RECIPES[s.recipe];let color=0,best=-Infinity;r.need.forEach((n,i)=>{if(n&&s.collectors[i]){const deficit=n-s.dust[i];if(deficit>best){best=deficit;color=i;}}});sweep(s,color);}
  for(const f of FACILITIES)if(!s.shop.facilities[f.id])buildFacility(s,f.id);
  if(second%5===0){
   const b=s.shop;
   if(b.facilities.rack&&b.facilities.pack&&b.trips<3)for(let i=0;i<3;i++)if(b.stock[i]<3)stockShelf(s,i);
   if(b.carry?.kind==='bread')businessAction(s,'table',RECIPES);
   else if(b.carry?.kind==='parcel')businessAction(s,'wagon',RECIPES);
   else if(b.facilities.table&&b.guests&&b.served<8&&b.stock.some(n=>n>0))businessAction(s,'rack',RECIPES);
   else if(b.facilities.wagon&&!b.trip&&b.trips<3)businessAction(s,'pack',RECIPES);
  }
  if(s.beacons>=2){
   if(s.upgrades.polish<upgradeLimit)upgrade(s,'polish');
   for(let i=0;i<3;i++)if(s.collectors[i]<upgradeLimit)upgrade(s,'collector',i);
   if(s.upgrades.storage<Math.min(3,upgradeLimit))upgrade(s,'storage');
   if(s.upgrades.rail<Math.min(3,upgradeLimit))upgrade(s,'rail');
  }
  advance(s,1);if(s.beacons<6&&deliver(s))milestones.push(second+1);
 }
 return {active,upgradeLimit,completed:shopGoal(s),milestones,seconds:Math.round(s.elapsed),minutes:Number((s.elapsed/60).toFixed(1)),facilities:s.shop.facilities,served:s.shop.served,trips:s.shop.trips,collectors:s.collectors,upgrades:s.upgrades,adBoost:s.adBoost};
}
if(process.argv[1]?.endsWith('bakery-balance.mjs'))console.log(JSON.stringify([simulate(),simulate({active:false}),simulate({upgradeLimit:6})],null,2));
