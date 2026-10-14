// A tap keeps a short boost alive. No timer or material is changed on tap.
export const EFFORT={speed:2,window:.35,cooldown:.08,radius:80};
export function assist(s,id,distance){
 if(s.paused||!Number.isFinite(distance)||distance>EFFORT.radius||distance<0)return {ok:false,reason:'range'};
 const index=['wheat','cow','berries'].indexOf(id);
 if(id==='oven'&&!s.job)return {ok:false,reason:'idle'};
 if(id!=='oven'&&(index<0||!s.collectors[index]))return {ok:false,reason:'locked'};
 if(index>=0&&s.buffer[index]>=(s.lineBuilt?24:6))return {ok:false,reason:'full'};
 const a=s.effort||(s.effort={id:null,until:0,last:-1,taps:0});
 if(s.elapsed-a.last<EFFORT.cooldown)return {ok:false,reason:'cooldown'};
 const continuing=a.id===id&&s.elapsed-a.last<=EFFORT.window;
 a.id=id;a.until=continuing?s.elapsed+EFFORT.window:0;a.last=s.elapsed;a.taps++;return {ok:true,id,active:continuing};
}
export function assistedTime(s,id,dt){return s.effort?.id===id?Math.min(dt,Math.max(0,s.effort.until-s.elapsed))*(EFFORT.speed-1):0;}
