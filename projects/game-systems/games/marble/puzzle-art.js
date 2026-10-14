export const ART_NAMES=['exit-open','portal-blue','portal-violet','splitter','switch','key','relay','charge','direction','rotate','rune','fork','exit-closed','launcher','orb','orb-mint','mirror','mirror-fragile','floor','wall','wall-break','wall-gate','spikes'];
export const images={};
export const artURL=name=>new URL('./assets/puzzle/'+name+'.png',import.meta.url).href;
export const artReady=Promise.all(ART_NAMES.map(name=>new Promise((resolve,reject)=>{const img=new Image();images[name]=img;img.onload=resolve;img.onerror=()=>reject(new Error('Missing puzzle art: '+name));img.src=artURL(name)})));
export function sprite(c,name,x,y,w,h=w){const img=images[name];if(img?.complete&&img.naturalWidth)c.drawImage(img,Math.round(x-w/2),Math.round(y-h/2),Math.round(w),Math.round(h))}
const orbColors={rose:'#f7a3b5',mint:'#9ce4bc',comet:'#bdd7ff',violet:'#c5a2f3',amber:'#ffc879',cyan:'#a4e9ed'},orbCache={};
export function orbSprite(c,skin,x,y){
 if(!skin||!orbColors[skin]){sprite(c,'orb',x,y,12);return}
 if(!orbCache[skin]){const a=document.createElement('canvas');a.width=a.height=64;const t=a.getContext('2d');t.drawImage(images.orb,0,0);t.globalCompositeOperation='multiply';t.fillStyle=orbColors[skin];t.fillRect(0,0,64,64);t.globalCompositeOperation='destination-in';t.drawImage(images.orb,0,0);orbCache[skin]=a}
 c.drawImage(orbCache[skin],Math.round(x-6),Math.round(y-6),12,12);
}
export function nodeArt(n){return n.forkOnly?'fork':n.rotate!==undefined?'rotate':n.relay?'relay':n.direction?'direction':n.minBounces?'charge':n.kind==='key'?'key':n.kind==='rune'?'rune':'switch'}
export function lamps(c,x,y,count,lit=0,color='#f9d978'){
 for(let i=0;i<count;i++){const px=Math.round(x-(count*6-2)/2+i*6);c.fillStyle='#101a27';c.fillRect(px-1,Math.round(y)-1,6,5);c.fillStyle=i<lit?color:'#475367';c.fillRect(px,Math.round(y),4,3)}
}
