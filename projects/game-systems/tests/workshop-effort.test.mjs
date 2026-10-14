import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,step,restore,furnaceAction} from '../games/workshop/economy.js';
import {assist} from '../games/workshop/effort.js';
const run=(s,n)=>{for(let i=0;i<n;i++)step(s,.05);};
test('Taps sustain acceleration, never instantly advance timers, and expire after stopping',()=>{
 const s=fresh();s.hand.raw[0]=2;furnaceAction(s);const t=s.job.t;
 assert(assist(s,'oven',20).ok);assert.equal(s.job.t,t);run(s,2);assert(Math.abs(s.job.t-(t-.1))<1e-6);
 assert(assist(s,'oven',20).active);run(s,2);assert(Math.abs(s.job.t-(t-.3))<1e-6);
 assert.equal(assist(s,'oven',100).ok,false);run(s,12);const stopped=s.job.t;run(s,2);assert(Math.abs(s.job.t-(stopped-.1))<1e-6);
 const saved=restore(s);assert.equal(saved.effort.until,0);assert.equal(saved.goods[0],0);
});
test('Repeated taps sustain doubled cow output; pause and full buffers reject assistance',()=>{
 const s=fresh();s.collectors[1]=1;s.beacons=1;
 for(let i=0;i<34;i++){if(i%4===0)assert(assist(s,'cow',30).ok);step(s,.05);}
 assert.equal(s.buffer[1],1);assert.equal(s.buffer[0],0);assert.equal(s.goods[0],0);
 s.paused=true;assert.equal(assist(s,'cow',20).ok,false);const clock=s.clocks[1];run(s,10);assert.equal(s.clocks[1],clock);
 s.paused=false;s.buffer[1]=6;assert.equal(assist(s,'cow',20).reason,'full');
});
