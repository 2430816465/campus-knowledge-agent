const LIMIT=89.5*Math.PI/180;
export const clampAngle=a=>Math.max(-LIMIT,Math.min(LIMIT,a));
// 65% of the board covers the hemisphere. Sensitivity never changes with time.
export class AimGesture{
 constructor(point,origin,previous=0){
  this.start={...point};this.last={...point};this.moved=false;
  this.direct=point.y<origin.y-40&&Math.hypot(point.x-origin.x,point.y-origin.y)>55;
  this.base=this.direct?Math.atan2(point.x-origin.x,origin.y-point.y):previous;
  this.angle=clampAngle(this.base);
 }
 move(point){
  if(Math.hypot(point.x-this.start.x,point.y-this.start.y)>3)this.moved=true;
  // Clamp each movement so dragging past the edge does not delay reversal.
  this.angle=clampAngle(this.angle+(point.x-this.last.x)*Math.PI/(640*.65));this.last={...point};return this.angle;
 }
 get canFire(){return this.direct||this.moved;}
}
