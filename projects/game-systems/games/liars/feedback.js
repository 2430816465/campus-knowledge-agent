import {TIMING} from './rules.js';
export const REVEAL_CUES={flip:1400,verdict:2900};

// Authoritative timestamps drive presentation only; no rule clock or RNG is changed here.
export function actionState(game,now){
 if(!game)return null;
 const age=Math.max(0,now-game.phaseAt),e=game.event;
 if(game.phase==='playing')return {age,actor:game.last&&age<1400?game.last.seat:game.turn,subject:game.turn,beat:game.last&&age<1400?'play':'turn'};
 if(game.phase==='reveal')return {age,actor:e.caller,subject:e.accused,beat:age<REVEAL_CUES.flip?'challenge':age<REVEAL_CUES.verdict?'flip':'verdict'};
 if(game.phase==='potion')return {age,actor:e.loser,beat:'prepare'};
 if(game.phase==='outcome')return {age,actor:e.loser,beat:age<TIMING.drink?'drinking':e.eliminated?'stone':e.effect};
 return null;
}

export class Feedback {
 constructor({sound=()=>true,haptics=()=>true,reduced=()=>false,vibrate=pattern=>navigator.vibrate?.(pattern),context=()=>new (window.AudioContext||window.webkitAudioContext)()}={}){
  Object.assign(this,{sound,haptics,reduced,vibrate,context});this.fired=new Set();this.audio=null;this.shakeAt=-Infinity;this.shakeSize=0;this.lastCue=null;
 }
 unlock(){try{this.audio??=this.context();if(!this.master){this.master=this.audio.createGain();this.master.connect(this.audio.destination);}if(this.audio.state==='suspended')this.audio.resume().catch(()=>{});}catch{}}
 note(hz,duration=.12,delay=0,type='triangle',volume=.045,end=hz){
  if(!this.sound()||!this.audio||this.audio.state!=='running')return;
  const at=this.audio.currentTime+delay,o=this.audio.createOscillator(),gain=this.audio.createGain();o.type=type;o.frequency.setValueAtTime(hz,at);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+duration);
  gain.gain.setValueAtTime(.001,at);gain.gain.linearRampToValueAtTime(volume,at+.012);gain.gain.exponentialRampToValueAtTime(.001,at+duration);o.connect(gain);gain.connect(this.master);o.start(at);o.stop(at+duration+.02);o.onended=()=>{o.disconnect();gain.disconnect();};
 }
 noise(duration=.16,volume=.04){
  if(!this.sound()||!this.audio||this.audio.state!=='running')return;
  const a=this.audio,at=a.currentTime,b=a.createBuffer(1,Math.ceil(a.sampleRate*duration),a.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
  const n=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();n.buffer=b;f.type='lowpass';f.frequency.value=1500;g.gain.value=volume;n.connect(f);f.connect(g);g.connect(this.master);n.start(at);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();};
 }
 cue(name,now){
  this.lastCue=name;
  if(name==='play'){this.noise(.09,.025);this.note(230,.07,0,'square',.016,110);this.pulse([10]);}
  if(name==='turn'){this.note(440,.11);this.note(660,.15,.1);this.pulse([18]);}
  if(name==='warning'){this.note(880,.12,0,'triangle',.035);this.pulse([20]);}
  if(name==='tick')this.note(720,.06,0,'triangle',.025);
  if(name==='challenge'){this.note(180,.2,0,'sawtooth',.023,400);this.note(360,.12,.15,'triangle',.03);this.pulse([22,35,22]);}
  if(name==='flip'){this.noise(.2,.035);this.note(680,.08,0,'triangle',.025);}
  if(name==='truth'){this.note(523,.22);this.note(784,.3,.12);this.impact(now,2,[18]);}
  if(name==='lie'){this.note(280,.25,0,'sawtooth',.025,95);this.impact(now,4,[25,45,25]);}
  if(name==='bottle'){this.note(940,.15,0,'sine',.04,700);}
  if(name==='glug'){this.note(160,.14,0,'sine',.07,65);this.note(230,.13,.12,'sine',.05,80);}
  if(name==='stone'){this.noise(.38,.065);this.note(100,.5,0,'sawtooth',.04,35);this.note(65,.55,.12,'triangle',.055);this.impact(now,7,[65,45,90]);}
  if(name==='hiccup'){this.note(135,.14,0,'triangle',.07,310);this.note(190,.12,.17,'triangle',.04,90);this.impact(now,3,[25]);}
  if(name==='smoke'){this.noise(.45,.03);this.note(420,.3,0,'sine',.025,750);this.impact(now,2,[15]);}
  if(name==='spark'){this.note(660,.1,0,'square',.02);this.note(880,.12,.09,'square',.02);this.note(1320,.2,.19,'triangle',.03);this.impact(now,2,[15,30,15]);}
 }
 pulse(pattern){if(this.haptics()&&!this.reduced())try{this.vibrate(pattern);}catch{}}
 impact(now,size,pattern){this.shakeAt=now;this.shakeSize=size;this.pulse(pattern);}
 update(snapshot,now){
  if(this.master)this.master.gain.value=this.sound()&&!document.hidden?1:0;
  const g=snapshot?.game;if(!g||snapshot.phase==='paused')return {x:0,y:0};
  const age=now-g.phaseAt;
  const cues=g.phase==='reveal'?[[0,'challenge'],[REVEAL_CUES.flip,'flip'],[REVEAL_CUES.verdict,g.event.lied?'lie':'truth']]:g.phase==='outcome'?[[0,'bottle'],[740,'glug'],[1100,'glug'],[TIMING.drink,g.event.effect]]:g.phase==='playing'?[...(g.last?[[0,'play']]:[]),...(snapshot.seat===g.turn?[[g.last?900:0,'turn']]:[])]:[];
  for(let i=0;i<cues.length;i++){const [at,name]=cues[i],key=`${g.id}:${g.revision}:${i}`;if(age>=at&&!this.fired.has(key)){this.fired.add(key);if(age-at<600&&!document.hidden)this.cue(name,now);}}
  if(g.phase==='playing'&&snapshot.seat===g.turn&&g.deadline){
   const seconds=Math.ceil((g.deadline-now)/1000),key=`${g.id}:${g.revision}:clock:${seconds}`;
   if(seconds>0&&seconds<=5&&!this.fired.has(key)){this.fired.add(key);if(!document.hidden)this.cue(seconds===5?'warning':'tick',now);}
  }
  if(this.fired.size>256)this.fired=new Set([...this.fired].slice(-128));
  const t=Math.max(0,now-this.shakeAt),amp=this.reduced()?0:this.shakeSize*Math.max(0,1-t/500)**2;
  if(!amp)return {x:0,y:0};
  return {x:Math.sin(t*.072)*amp,y:Math.sin(t*.091)*amp*.65};
 }
 close(){this.audio?.close().catch(()=>{});}
}
