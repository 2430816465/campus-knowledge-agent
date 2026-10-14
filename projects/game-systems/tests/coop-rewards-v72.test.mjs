import test from 'node:test';
import assert from 'node:assert/strict';
import {createServices,initial} from '../services.js';
const details=levelId=>({campaign:'slf-72-v1',levelId,difficulty:levelId<=86?'normal':'hard'});
function services(saved=null){return createServices({load:()=>saved,save:v=>{saved=v;}});}
test('all 36 normal and 36 hard map IDs award exactly once across solo and LAN receipts',()=>{
 const s=services(),start=s.get().coins;
 for(let id=51;id<=122;id++){
  assert.equal(s.finish('solo-'+id,'coop',true,id,details(id)).reward,8);
  assert.equal(s.finish('lan-'+id,'coop',true,id,details(id)).reward,0);
 }
 assert.equal(s.get().coins,start+576);
 assert.equal(s.get().economy.milestones.length,72);
});
test('old 50-level wallet preserves balance and ownership without blocking the new campaign',()=>{
 const old=initial();old.coins=321;old.owned=['flag'];old.economyVersion=2;
 old.economy={sessions:{},days:{},weeks:{},milestones:['coop-level-1']};
 old.runs=[{id:'old-clear',mode:'coop',win:true,score:1,reward:8}];
 const s=services(old);assert.equal(s.get().coins,321);assert.deepEqual(s.get().owned,['flag']);
 assert.equal(s.finish('new-first','coop',true,51,details(51)).reward,8);
 assert.equal(s.finish('repeat','coop',true,51,details(51)).reward,0);
});
test('mismatched map receipt cannot award new-campaign credit',()=>{
 const s=services();assert.equal(s.finish('bad','coop',true,52,details(51)).reward,0);
 assert.equal(s.finish('missing','coop',true,51,{}).reward,0);
});
