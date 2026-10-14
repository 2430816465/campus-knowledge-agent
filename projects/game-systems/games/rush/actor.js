import {ANIMATIONS} from './animation.js';
export const actorType=type=>type==='skeleton_captain'?'skeleton_elite':type==='mage'?'mage_red':type;
const STRIDES={skeleton:28,orc_warrior:42,guard_mid:27,mage_red:27,ghost_warrior:32,rock_golem:32,skeleton_elite:34,mage_low:27,vampire:32,knight_black:33,dragon:40};
export function actorFrame(e){
 const type=actorType(e.type),attacking=!!(e.lock||e.melee||e.recover>0||e.dashTime>0);
 const key=type+(attacking||e.kind==='boss'&&e.y>=230&&!e.dashTime?'-attack':''),meta=ANIMATIONS[key];
 if(!meta)return null;
 let index=0;
 if(attacking){
  const release=e.kind==='boss'?.9:.28,age=e.attackElapsed||0;
  index=age<release?Math.min(meta.releaseFrame-1,Math.floor(age/release*meta.releaseFrame)):Math.min(7,meta.releaseFrame+Math.floor((age-release)/.26*(8-meta.releaseFrame)));
 }else if(!key.endsWith('-attack'))index=Math.floor((e.distance||0)/(STRIDES[type]||32)*8+(e.id||0)*1.7)%8;
 return {key,meta,index,bodyHeight:ANIMATIONS[type].bodyHeight};
}
export function drawActor(c,art,e){
 const frame=actorFrame(e);if(!frame)return false;
 const im=art['motion:'+frame.key];if(!im)return false;
 const {meta,index,bodyHeight}=frame,size=(e.kind==='boss'?96:48)/bodyHeight,footY=e.y+(e.kind==='boss'?48:24);
 c.drawImage(im,(index%meta.cols)*meta.cell,Math.floor(index/meta.cols)*meta.cell,meta.cell,meta.cell,
  Math.round(e.x-meta.origin[0]*size),Math.round(footY-meta.origin[1]*size),Math.round(meta.cell*size),Math.round(meta.cell*size));
 return true;
}
