import {icon} from './ui.js';

// Keep the badge type stable when dated daily/weekly task IDs change.
export function questBadge(q){
 const type=q.id.split(':')[0],symbol={first:'flag',all:'compass','daily-play':'guard','daily-progress':'star','weekly-play':'book'}[type]||'star';
 const state=q.claimed?'claimed':q.count>=q.target?'ready':'pending';
 const label={claimed:'已领取',ready:'可领取',pending:'进行中'}[state];
 return `<span class="quest-badge ${state}" aria-hidden="true"><span class="badge-ribbon"></span><span class="badge-face">${icon(symbol)}</span>${state==='pending'?'':`<span class="badge-check">${icon('check')}</span>`}</span><span class="quest-state ${state}">${label}</span>`;
}
