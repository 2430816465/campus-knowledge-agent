const TRACK_HEIGHT=960;
export function drawEnvironment(c,atlas,chapter,time=0){
 if(!atlas)return false;
 const width=atlas.width/3,offset=(time*70)%(TRACK_HEIGHT*2),shift=offset%TRACK_HEIGHT,cycle=Math.floor(offset/TRACK_HEIGHT);
 // Alternating mirrored tiles meet at exactly the same edge pixels; no seam strip.
 for(let i=-1;i<=1;i++){
  const y=i*TRACK_HEIGHT+shift,flip=(i+cycle+2)%2===1;
  c.save();c.translate(0,y+(flip?TRACK_HEIGHT:0));if(flip)c.scale(1,-1);
  c.drawImage(atlas,chapter*width,0,width,atlas.height,0,0,480,TRACK_HEIGHT);c.restore();
 }
 return true;
}
export function drawWarning(c,e){
 if(!e.lock)return;
 c.save();c.strokeStyle='#ed5a58';c.fillStyle='#c13b4038';c.lineWidth=3;
 if(e.skill==='charge'){c.fillRect(e.lock.x-52,e.y,104,e.lock.y-e.y+30);c.strokeRect(e.lock.x-52,e.y,104,e.lock.y-e.y+30);}
 else if(e.skill==='quake')for(const x of e.lock.targets){c.beginPath();c.arc(x,e.lock.y,42,0,Math.PI*2);c.fill();c.stroke();c.beginPath();c.moveTo(x-12,e.lock.y);c.lineTo(x+12,e.lock.y);c.moveTo(x,e.lock.y-12);c.lineTo(x,e.lock.y+12);c.stroke();}
 else if(e.skill==='summon'){for(const x of [140,340]){c.beginPath();c.arc(x,e.y+40,28,0,Math.PI*2);c.fill();c.stroke();}}
 else if(e.role!=='healer')for(const x of e.lock.targets){c.beginPath();c.moveTo(e.x,e.y);c.lineTo(x,e.lock.y);c.stroke();c.beginPath();c.arc(x,e.lock.y,14,0,Math.PI*2);c.stroke();}
 c.restore();
}
