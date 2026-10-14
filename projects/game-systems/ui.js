import {referenceArt} from './reference-art.js';
import {pixelPaths} from './pixel-icons.js';
// Shared presentation primitives. The layout and all interface text remain live HTML.
export const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const woodIcons={music:'M8 1h6v9h-2V4H9v8H7v2H3v-1H2v-3h1V9h4V3h1Z',sound:'M1 6h3l5-4v12l-5-4H1Z M11 5h2v6h-2Z M14 3h2v10h-2Z',controller:'M3 4h10v2h2v6h-3l-2-2H6l-2 2H1V6h2Z M4 6v1H3v2h1v1h2V9h1V7H6V6Z M11 6v2h2V6Z M10 9v2h2V9Z',play:'M4 2h2v1h2v1h2v1h2v1h2v4h-2v1h-2v1H8v1H6v1H4Z'};
export const icon=(id,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path fill-rule="evenodd" d="${woodIcons[id]||pixelPaths[id==='mine'?'pick':id]||pixelPaths.compass}"/></svg>`;
export const btn=(label,action,cls='',extra='')=>`<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
export const art=(id,cls='')=>`<div class="scene ${id} ${cls}" aria-hidden="true">${referenceArt(id)}</div>`;
export const money=n=>`${icon('coin')}<b>${Number(n).toLocaleString('en-US')}</b>`;
export const avatarVariant=s=>s.equipped.find(x=>x.startsWith('avatar-'))||(s.equipped.includes('scarf')?'red':'');
export const portrait=(variant='')=>`<span class="avatar portrait ${variant}">${referenceArt(variant.startsWith('avatar-')?variant:'portrait')}${variant==='red'?'<span class="avatar-scarf"></span>':''}</span>`;
export const itemArt=id=>id==='evolve-lotus'?'<div class="item-art" style="position:relative;background:#b9d8c3"><img src="games/evolve/assets/creature-9.webp" alt="莲塘队伍外观示意" width="256" height="256"><span style="position:absolute;top:30%;left:45%;color:#a95e91;font-size:40px">✿</span></div>':id==='chess-bamboo'?'<div class="item-art" style="background:repeating-linear-gradient(90deg,#375d4b 0px,#375d4b 36px,#426955 37px,#426955 39px);color:#bfd5a2;display:grid;place-items:center;font-size:52px">❧ ♠ ❧</div>':id==='bakery-berry'?'<div class="item-art" style="position:relative;background:#d1b88d"><img src="games/workshop/assets/bakery-oven.webp" alt="莓果店铺主题示意" width="256" height="256"><span style="position:absolute;top:12%;left:18%;background:#85384f;color:#fff5e8;padding:4px">莓果甜品屋</span></div>':id.startsWith('avatar-')?`<div class="item-art avatar-item">${referenceArt(id)}</div>`:`<div class="item-art ${id}"><img src="assets/pixel/${id}.svg" alt="" width="256" height="256" loading="lazy"></div>`;
export const status=(label,tone='neutral',symbol='')=>`<span class="status ${tone}">${symbol?icon(symbol):'<i aria-hidden="true"></i>'}${label}</span>`;
export const banner=(theme,kicker,title,description)=>`<section class="page-banner ${theme}"><div class="banner-art" aria-hidden="true"></div><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${description}</p></div></section>`;
export const empty=(symbol,title,text,action='')=>`<div class="empty-state">${icon(symbol)}<div><h3>${title}</h3><p>${text}</p>${action}</div></div>`;

