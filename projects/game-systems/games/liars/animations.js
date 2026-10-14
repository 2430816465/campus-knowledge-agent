import {CHARACTERS} from './rules.js';
import {actionState} from './feedback.js';
const frames={challenge:[0,170,360,600,950,1200],drink:[0,220,460,740,1250,1550]};
export const animationPath=(character,action,frame)=>`assets/animations/${character}/${action}/${frame}.png`;
export function actorPose(game,seat,now,reduced=false){
 const scene=actionState(game,now);if(!scene)return null;
 let action;if(game.phase==='reveal'&&seat===game.event.caller)action='challenge';
 else if(['potion','outcome'].includes(game.phase)&&seat===game.event.loser)action='drink';
 if(!action)return null;
 const frame=game.phase==='potion'?0:reduced?(action==='challenge'?3:scene.beat==='drinking'?2:5):frames[action].findLastIndex(at=>scene.age>=at);
 return {action,frame,path:animationPath(game.players[seat].character,action,frame)};
}
export function seatActionLabel(game,seat,now){
 const s=actionState(game,now),e=game.event;if(!s)return '';
 if(game.phase==='playing'){
  if(s.beat==='play'&&seat===game.last?.seat)return `打出${game.last.count}张`;
  if(seat===game.turn)return '正在出牌';
  if(seat===game.last?.seat)return `刚出${game.last.count}张`;
  return '';
 }
 if(game.phase==='reveal'){
  if(s.beat==='verdict'&&seat===e.loser)return '输了 · 喝药';
  if(seat===e.caller)return s.beat==='verdict'?'质疑成功':'开牌';
  if(seat===e.accused)return s.beat==='verdict'?'真牌':'被开牌';
 }
 if(seat===e.loser&&['potion','outcome'].includes(game.phase))return s.beat==='prepare'?'输了 · 喝药':s.beat==='drinking'?'喝药中':e.eliminated?'石化':'安全';
 return '';
}
export function preloadAnimations(){
 return CHARACTERS.flatMap(c=>Object.keys(frames).flatMap(action=>frames[action].map((_,i)=>{const img=new Image();img.src=animationPath(c.id,action,i);return img;})));
}
