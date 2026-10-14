import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServices,evolveReward,taskProgress} from '../services.js';
import {rewardFor} from '../games/evolve/data.js';
const memory=()=>{let value=null;return {load:()=>value,save:v=>{value=structuredClone(v)}};};
test('evolution settlement requires activity, caps rewards and persists an idempotent receipt',()=>{
 assert.equal(evolveReward({eaten:4,level:10},true),0);
 assert.equal(evolveReward({eaten:1000,level:999},true),36);
 assert.equal(evolveReward({eaten:1000,level:10},false),24);
 assert.equal(evolveReward({eaten:NaN,level:10},true),0);
 const storage=memory(),s=createServices(storage);s.progress({id:'play',mode:'evolve',seconds:120,units:10});s.finish('crown','evolve',true,20,{rulesVersion:2,eaten:32,level:20,sessionId:'play'});
 assert.equal(s.get().coins,174);s.finish('crown','evolve',true,10,{eaten:100,level:10});
 const restored=createServices(storage);restored.finish('crown','evolve',true,10,{eaten:100,level:10});assert.equal(restored.get().coins,174);assert.equal(restored.get().runs.length,2);
});
test('evolution qualifies for camp tasks while unknown modes and multiplayer do not count as solo',()=>{
 const run=(mode,id)=>({mode,id,reward:10});
 assert.equal(taskProgress({runs:['tower','marble','mine','evolve'].map(run)},'all').count,4);
 assert.equal(taskProgress({runs:['tower','marble','evolve','evolve','evolve','evolve'].map(run)},'all').count,4);
 assert.equal(taskProgress({runs:['tower','marble','liars','liars','liars','liars'].map(run)},'all').count,2);
 assert.equal(taskProgress({runs:['tower','marble','mine','unknown'].map(run)},'all').count,3);
 assert.equal(taskProgress({runs:[{mode:'evolve',reward:0}]},'first').count,0);
});
test('twenty-level reward version matches gameplay and final bonus only unlocks at twenty',()=>{
 for(let level=1;level<=20;level++)for(const eaten of [0,4,5,12,32,300]){
  const win=level===20;assert.equal(evolveReward({rulesVersion:2,level,eaten},win),rewardFor({level,eaten,win}));
 }
 assert.equal(evolveReward({rulesVersion:2,level:10,eaten:32},true),evolveReward({rulesVersion:2,level:10,eaten:32},false));
 const storage=memory(),s=createServices(storage);s.finish('twenty','evolve',true,20,{rulesVersion:2,eaten:32,level:20});assert.equal(s.get().coins,170);s.finish('twenty','evolve',true,20,{rulesVersion:2,eaten:300,level:20});assert.equal(createServices(storage).get().coins,170);
 // Legacy and current victories share one first-clear and cannot double-pay.
 s.finish('old-ten','evolve',true,20,{rulesVersion:1,eaten:32,level:10});assert.equal(s.get().coins,170);
});
