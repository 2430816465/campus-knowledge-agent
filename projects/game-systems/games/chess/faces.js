// Original vector faces. No commercial game's images or fonts are embedded.
import {rankLabel} from './cards.js';
const suitShapes=[
 'M12 1C9 5 2 8 2 14a5 5 0 0 0 9 3c0 3-2 5-4 6h10c-2-1-4-3-4-6a5 5 0 0 0 9-3C22 8 15 5 12 1Z',
 'M12 1a5 5 0 0 0-4 8 5 5 0 1 0 3 8c0 3-2 5-4 6h10c-2-1-4-3-4-6a5 5 0 1 0 3-8 5 5 0 0 0-4-8Z',
 'M12 22C8 18 1 13 1 7a6 6 0 0 1 11-3A6 6 0 0 1 23 7c0 6-7 11-11 15Z',
 'M12 1 22 12 12 23 2 12Z'
];
const svg=(body,cls='',view='0 0 24 24')=>`<svg class="${cls}" viewBox="${view}" aria-hidden="true" focusable="false">${body}</svg>`;
const suit=(type,cls='')=>svg(`<path fill="currentColor" d="${suitShapes[type]||suitShapes[0]}"/>`,cls);
const spots={1:[[50,50]],2:[[50,20],[50,80]],3:[[50,20],[50,50],[50,80]],4:[[24,20],[76,20],[24,80],[76,80]],5:[[24,20],[76,20],[50,50],[24,80],[76,80]],6:[[24,20],[76,20],[24,50],[76,50],[24,80],[76,80]],7:[[24,20],[76,20],[50,35],[24,50],[76,50],[24,80],[76,80]],8:[[24,20],[76,20],[50,35],[24,50],[76,50],[50,65],[24,80],[76,80]],9:[[24,15],[76,15],[24,38],[76,38],[50,50],[24,62],[76,62],[24,85],[76,85]],10:[[24,15],[76,15],[50,27],[24,38],[76,38],[24,62],[76,62],[50,73],[24,85],[76,85]]};
export function pokerFace(c){
 const joker=c.value>=16,label=rankLabel(c.value),number=c.value===14?1:c.value===15?2:c.value;
 let art=number<=10?`<span class="pip-field">${spots[number].map(([x,y])=>`<span class="face-pip" style="left:${x}%;top:${y}%">${suit(c.type)}</span>`).join('')}</span>`:`<span class="court-medallion">${svg('<path fill="currentColor" d="m2 8 5 4 5-8 5 8 5-4-3 12H5Z"/><circle cx="12" cy="3" r="2" fill="currentColor"/>')}<b>${label}</b>${suit(c.type)}</span>`;
 if(joker)art=`<span class="joker-art">${svg('<path d="M3 13Q2 3 9 6L12 1l3 5q7-3 6 7l-4-3-5 5-5-5Z" fill="currentColor"/><circle cx="3" cy="14" r="2" fill="currentColor"/><circle cx="21" cy="14" r="2" fill="currentColor"/><path d="M7 16q5 10 10 0M9 17v1m6-1v1" fill="none" stroke="currentColor" stroke-width="1.5"/>')}<small>JOKER</small></span>`;
 return `<b class="card-rank ${joker?'joker':''}">${label}</b>${!joker?suit(c.type,'card-suit'):''}<span class="card-art">${art}</span>${!joker?`<span class="reverse-index"><b>${label}</b>${suit(c.type)}</span>`:''}`;
}
export function mahjongFace(c){
 const v=c.value,n=v%9+1,glyph=['一','二','三','四','五','六','七','八','九'][n-1];
 if(v<9)return `<span class="tile-glyph wan"><b>${glyph}</b><strong>萬</strong></span>`;
 if(v<27){const bamboo=v<18,color=n===1?'#b34033':n%3===0?'#2b3d72':'#217a50';let body;
  if(bamboo&&n===1)body='<path d="M31 11q-9 0-9 12l-9 7 11 1q0 10 13 13l-3 21 13-18q5-14-9-20l-2-10 8 2-8-5Z" fill="#217a50"/><circle cx="31" cy="17" r="1.8" fill="#fff"/><path d="m24 31 12 10m-6-4-12 4" stroke="#c99b4c" stroke-width="3"/>';
  else body=spots[n].map(([x,y],i)=>{x=12+x*.4;y=9+y*.6;if(bamboo)return `<path d="M${x-3} ${y-6}q3-2 6 0v12q-3 2-6 0Z" fill="${n===5&&i===2?'#b34033':'#217a50'}"/><path d="M${x-2} ${y}h4" stroke="#f4faf1" stroke-width="1.2"/>`;return `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="${n===1?color:i%3===0?'#b34033':i%3===1?'#217a50':'#2b3d72'}" stroke-width="2.3"/><circle cx="${x}" cy="${y}" r="1.2" fill="${color}"/>`;}).join('');
  return svg(body,'tile-pattern','0 0 64 80');
 }
 const label=['東','南','西','北','中','發','白'][v-27]||'花';return v===33?'<span class="white-dragon"></span>':`<b class="honor-glyph ${v===31?'red-honor':v===32?'green-honor':''}">${label}</b>`;
}
