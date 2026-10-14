const bg=new Image();bg.src='assets/tavern-round.png';
// Seats, names and owned card piles share one DOM layer, so their positions
// stay together at every viewport. Canvas only paints the pixel environment.
export function drawTable(canvas,snapshot){
 const w=canvas.clientWidth,h=canvas.clientHeight,d=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}
 const c=canvas.getContext('2d');c.setTransform(d,0,0,d,0,0);c.imageSmoothingEnabled=false;c.fillStyle='#28483e';c.fillRect(0,0,w,h);
 if(bg.complete&&bg.naturalWidth){const ratio=Math.max(w/bg.width,h/bg.height);c.drawImage(bg,(w-bg.width*ratio)/2,(h-bg.height*ratio)/2,bg.width*ratio,bg.height*ratio);}
 if(!snapshot?.game){c.fillStyle='#11251f88';c.fillRect(0,0,w,h);return;}
 const dock=parseFloat(getComputedStyle(canvas).getPropertyValue('--dock-height'))||160;
 const sh=h-dock-18,cx=w*.5,cy=sh*.55,rx=w*.34,ry=sh*.35;
 // A UI-owned table shape can resize independently of the bitmap room.
 const oval=(dy,color,sx=1,sy=1)=>{c.fillStyle=color;c.beginPath();c.ellipse(cx,cy+dy,rx*sx,ry*sy,0,0,Math.PI*2);c.fill();};
 oval(10,'#241c16');oval(4,'#523827');oval(0,'#bc935d');oval(-3,'#7b5838',.98,.96);oval(-4,'#443d2d',.92,.82);
 c.strokeStyle='#b49b67';c.lineWidth=2;c.beginPath();c.ellipse(cx,cy-4,rx*.89,ry*.76,0,0,Math.PI*2);c.stroke();
}
