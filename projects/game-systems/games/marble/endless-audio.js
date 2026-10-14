// Short procedural layers: transient + pitched body, with a shared compressor.
// Dense simultaneous impacts become one stronger chord, never a queue of delayed noises.
export class ImpactAudio{
 constructor(){this.enabled=true;this.voices=0;this.played=0;this.merged=0}
 unlock(){if(!this.enabled)return;try{if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value= .8;const compressor=this.ctx.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=14;compressor.ratio.value=5;compressor.attack.value=.002;compressor.release.value=.12;this.master.connect(compressor).connect(this.ctx.destination);this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate*.4,this.ctx.sampleRate);const a=this.noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length)}if(this.ctx.state==='suspended')this.ctx.resume()}catch{}}
 note(freq,duration,gain,type='sine',end=freq,delay=0){const c=this.ctx;if(!c||this.voices>=28)return;this.voices++;const o=c.createOscillator(),v=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,end),t+duration);v.gain.setValueAtTime(.0001,t);v.gain.exponentialRampToValueAtTime(gain*2.2,t+.003);v.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(v).connect(this.master);o.start(t);o.stop(t+duration+.008);o.onended=()=>{this.voices--;o.disconnect();v.disconnect()}}
 burst(duration,gain,frequency){const c=this.ctx;if(!c||this.voices>=28)return;this.voices++;const s=c.createBufferSource(),f=c.createBiquadFilter(),v=c.createGain(),t=c.currentTime;s.buffer=this.noise;f.type='lowpass';f.frequency.value=frequency;v.gain.setValueAtTime(gain*2.2,t);v.gain.exponentialRampToValueAtTime(.0001,t+duration);s.connect(f).connect(v).connect(this.master);s.start();s.stop(t+duration);s.onended=()=>{this.voices--;s.disconnect();f.disconnect();v.disconnect()}}
 consume(events,enabled=true){this.enabled=enabled;if(!enabled||!events.length){if(this.master)this.master.gain.value=enabled?.8:0;return}this.unlock();if(!this.ctx)return;this.master.gain.value= .8;const groups=new Map();for(const e of events){const q=groups.get(e.kind);if(q){q.count++;q.combo=Math.max(q.combo,e.combo||0);this.merged++}else groups.set(e.kind,{count:1,combo:e.combo||0})}for(const [kind,{count,combo}]of groups){this.played+=count;const lift=1+Math.min(count-1,5)*.06;if(kind==='hit'){const scale=[0,3,5,7,10],pitch=440*2**((scale[combo%5]+Math.min(12,Math.floor(combo/8)*3))/12);this.note(pitch,.055,.15*lift,'triangle',pitch*.78);this.burst(.018,.065*lift,4500);if(combo>=5)this.note(pitch*1.5,.085,.035,'sine');if(combo>=8&&combo%8<count)this.note(pitch*2,.14,.06,'sine')}
 else if(kind==='bounce'){this.note(260+Math.min(combo,20)*5,.032,.065,'triangle',180);this.burst(.012,.035,2600)}
 else if(kind==='explode'){this.note(110,.19,.20,'sine',38);this.burst(.14,.14*lift,1300)}
 else if(kind==='chain'){this.note(1150,.06,.075,'sawtooth',470);this.note(1720,.09,.045,'sine',800,.025)}
 else if(kind==='split'){this.note(700,.09,.065,'triangle',1200);this.note(1050,.11,.065,'triangle',1600,.02)}
 else if(kind==='pushback'){this.note(130,.22,.12,'triangle',520);this.note(260,.18,.06,'sine',780,.035);this.burst(.07,.045,1800)}
 else if(kind==='launch'){this.note(180,.13,.12,'triangle',680);this.burst(.035,.04,3000)}
 else if(kind==='hurt'){this.note(160,.24,.19,'sawtooth',45);this.burst(.12,.09,500)}
 else if(kind==='boss'){this.note(110,.3,.13,'triangle',55);this.note(165,.3,.1,'triangle',82,.1)}
 else if(kind==='reward'||kind==='upgrade'||kind==='bossKill'){[523,659,784,1046].forEach((f,i)=>this.note(f,.20,.09,'triangle',f,i*.065));if(kind==='bossKill')this.burst(.24,.13,1700)}
 else if(kind==='descend')this.note(160,.1,.04,'sine',100);
 }}
 suspend(){if(this.master)this.master.gain.value=0}
}
