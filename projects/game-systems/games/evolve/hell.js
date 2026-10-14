import {EvolutionGame} from './state.js';
import {WORLD,MAX_LEVEL,radius,followerRadius} from './data.js';
export const HELL_SAVE_KEY='camp-evolve-hell-v1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Independent challenge layer. Base eating, merging, formation and speed stay inherited.
export class HellEvolutionGame extends EvolutionGame{
 constructor(saved=null){super(saved);if(this.run){this.run.mode='hell';this.run.hell??={nextPulse:this.run.elapsed+8,pulses:[],lost:0};const h=this.run.hell;if(!Number.isFinite(h.nextPulse)||!Array.isArray(h.pulses)||h.pulses.some(z=>![z.x,z.y,z.r,z.start,z.end].every(Number.isFinite))){h.nextPulse=this.run.elapsed+8;h.pulses=[];}h.lost=Number.isFinite(h.lost)?Math.max(0,h.lost):0;}}
 newRun(seed,id){const r=super.newRun(seed,id);r.mode='hell';r.hell={nextPulse:8,pulses:[],lost:0};this.refreshPopulation();return r;}
 chooseLevel(){if(!this.run.hell)return super.chooseLevel();const r=this.run,n=this.random();if(r.level<MAX_LEVEL&&n<.12)return this.threatLevel();if(r.level>1&&n<.995)return this.lowerLevel();return r.level;}
 refreshPopulation(){super.refreshPopulation();const r=this.run;if(!r.hell)return;
  // Only replace distant/offscreen animals. Food never disappears at the player's mouth.
  let same=r.entities.filter(e=>e.level===r.level).length,high=r.entities.filter(e=>e.level>r.level).length,target=Math.ceil(r.entities.length*.1),changed=0;
  for(const e of [...r.entities]){if(changed>=16)break;if(!this.canRefresh(e))continue;
   if(r.level>1&&same>1&&e.level===r.level&&this.replaceRemote(e,this.lowerLevel())){same--;changed++;}
   else if(r.level<MAX_LEVEL&&high<target&&(e.level<r.level||r.level===1)&&this.replaceRemote(e,this.threatLevel())){high++;changed++;}
  }
 }
 currentZones(){const zones=super.currentZones(),r=this.run;if(!r?.hell)return zones;const t=r.elapsed,storm=t%28>=18;
  if(storm)for(let i=0;i<4;i++)zones.push({x:700+i*950+Math.sin(t*.14+i)*220,y:850+(i%2)*1400+Math.cos(t*.13+i)*240,r:520,angle:t*.17+i*1.7,force:170,hell:true});return zones;
 }
 hazards(){const r=this.run;if(!r?.hell)return [];const t=r.elapsed;
  const moving=Array.from({length:5},(_,i)=>({kind:'rift',x:WORLD.width/2+Math.sin(t*.095+i*1.7)*WORLD.width*.33,y:WORLD.height/2+Math.cos(t*.13+i*1.9)*WORLD.height*.32,r:95+i%2*25,active:true}));
  return [...moving,...r.hell.pulses.map(z=>({...z,kind:'pulse',active:t>=z.start,warning:Math.max(0,z.start-t)}))];
 }
 update(dt){const r=this.run;if(!r||this.paused||r.phase!=='playing')return;super.update(dt);if(r.phase!=='playing')return;const h=r.hell;
  h.pulses=h.pulses.filter(z=>z.end>r.elapsed);
  if(r.elapsed>=h.nextPulse){h.nextPulse=r.elapsed+Math.max(9,17-r.level*.35);const size=radius(r.level),warn=2.8+size/160;
   for(let i=0;i<3;i++){const a=i*Math.PI*2/3+r.elapsed*.3,d=i?size+210:0;h.pulses.push({x:clamp(r.player.x+Math.cos(a)*d,180,WORLD.width-180),y:clamp(r.player.y+Math.sin(a)*d,180,WORLD.height-180),r:110+size*.65,start:r.elapsed+warn,end:r.elapsed+warn+5});}this.events.push('hellWarning');
  }
  if(r.shield>0)return;
  for(const z of this.hazards().filter(z=>z.active)){
   if(Math.hypot(z.x-r.player.x,z.y-r.player.y)<z.r+radius(r.level)-5){this.fall({level:r.level});r.cause=z.kind==='rift'?'主角碰到了移动裂隙':'主角被爆发毒潮吞没';r.killerLevel=null;return;}
   for(const f of [...r.followers])if(Math.hypot(z.x-f.x,z.y-f.y)<z.r+followerRadius(f.level,r.level)-5){r.followers=r.followers.filter(x=>x!==f);h.lost++;this.effects.push({type:'lost',x:f.x,y:f.y,t:.6});this.events.push('companionLost');}
  }
 }
 revive(){const ok=super.revive();if(ok){this.run.hell.pulses=[];this.run.hell.nextPulse=this.run.elapsed+8;}return ok;}
 describe(){return {...super.describe(),mode:'hell',hell:this.run?{storm:this.run.elapsed%28>=18,stormIn:Math.max(0,18-this.run.elapsed%28),nextPulse:Math.max(0,this.run.hell.nextPulse-this.run.elapsed),lost:this.run.hell.lost,hazards:this.hazards()}:null};}
}
export function drawHellHazards(renderer,game){
 if(!game.run?.hell)return;const ctx=renderer.ctx,t=game.run.elapsed;
 for(const z of game.hazards()){
  const key=z.kind==='rift'?'rift':z.active?'active':'warning',im=renderer.hazardImages?.[key];
  ctx.save();ctx.fillStyle=key==='rift'?'#574ebc20':z.active?'#9a34692b':'#f5bd391a';
  ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,Math.PI*2);ctx.fill();
  // The art is clipped to the existing collision circle. Rotation never moves its boundary.
  if(im?.complete&&im.naturalWidth){ctx.save();ctx.clip();ctx.translate(z.x,z.y);ctx.rotate(key==='rift'?t*.22:key==='active'?-t*.12:0);ctx.globalAlpha=key==='rift'?.8:key==='active'?.78:.55+Math.sin(t*7)*.12;ctx.drawImage(im,-z.r,-z.r,z.r*2,z.r*2);ctx.restore();}
  ctx.strokeStyle=key==='rift'?'#6462ca':z.active?'#922b60':'#bd7919';ctx.lineWidth=z.active?3:2;ctx.setLineDash(z.active?[]:[12,9]);ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  renderer.label(z.kind==='rift'?'移动裂隙':z.active?'毒潮爆发':`毒潮预警 ${z.warning.toFixed(1)}秒`,z.x,z.y-z.r-8,key==='rift'?'#484692':z.active?'#842649':'#966318','#fff3de');ctx.restore();
 }
}
