const tones={select:[[680,0,.035,.012]],clear:[[360,0,.05,.015]],play:[[420,0,.07,.035],[660,.04,.09,.025]],pass:[[250,0,.07,.025]],bid:[[520,0,.08,.025],[740,.08,.09,.025]],turn:[[740,0,.07,.03],[990,.1,.09,.025]],warning:[[620,0,.09,.03]],bomb:[[100,0,.18,.07],[160,.05,.2,.04],[850,.1,.14,.025]],win:[[520,0,.14,.035],[660,.12,.14,.035],[780,.24,.24,.035]],lose:[[420,0,.14,.025],[320,.12,.22,.025]]};
export class Feedback{
 constructor(preferences){this.preferences=preferences;this.master=true;this.count=0;this.spoken=0;this.voiceAvailable=false;}
 unlock(){try{this.ctx??=new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});}catch{}this.voiceAvailable=!!window.speechSynthesis?.getVoices().some(v=>/^zh/i.test(v.lang));}
 play(kind,text=''){
  const p=this.preferences;if(!this.master)return;
  if(p.sound&&this.ctx?.state==='running')try{for(const [frequency,delay,duration,volume] of tones[kind]||tones.play){const time=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type=kind==='bomb'?'triangle':'sine';osc.frequency.setValueAtTime(frequency,time);if(kind==='play')osc.frequency.exponentialRampToValueAtTime(frequency*.8,time+duration);gain.gain.setValueAtTime(volume,time);gain.gain.exponentialRampToValueAtTime(.001,time+duration);osc.connect(gain);gain.connect(this.ctx.destination);osc.start(time);osc.stop(time+duration+.01);this.count++;}}catch{}
  if(p.haptic&&['turn','bomb','win'].includes(kind)&&navigator.vibrate)navigator.vibrate(kind==='bomb'?[20,20,30]:20);
  if(p.voice&&text&&window.speechSynthesis){const voice=speechSynthesis.getVoices().find(v=>/^zh/i.test(v.lang));this.voiceAvailable=!!voice;if(voice){speechSynthesis.cancel();const phrase=new SpeechSynthesisUtterance(text);phrase.voice=voice;phrase.lang='zh-CN';phrase.rate=1.15;phrase.volume=.8;speechSynthesis.speak(phrase);this.spoken++;}}
 }
 stop(){this.ctx?.suspend().catch(()=>{});window.speechSynthesis?.cancel();}
}
