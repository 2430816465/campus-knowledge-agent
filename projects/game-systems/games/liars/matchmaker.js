export const MATCH_WAIT_MS=8000;
export class Matchmaker {
 constructor({now,form,send,max=128}){this.now=now;this.form=form;this.send=send;this.max=max;this.entries=[];}
 add(peer,profile){if(this.entries.some(e=>e.peer===peer.id))throw Error('你已经在匹配队列中');if(this.entries.length>=this.max)throw Error('匹配人数已满，请稍后重试');this.entries.push({peer:peer.id,profile,at:this.now()});this.update();if(this.entries.length>=4)this.tick();}
 remove(id){const before=this.entries.length;this.entries=this.entries.filter(e=>e.peer!==id);if(this.entries.length!==before)this.update();return before!==this.entries.length;}
 update(){for(const e of this.entries)this.send(e.peer,{type:'queue',waiting:this.entries.length,serverTime:this.now(),deadline:this.entries[0].at+MATCH_WAIT_MS,waitMs:MATCH_WAIT_MS});}
 tick(){const now=this.now();while(this.entries.length>=4||this.entries.length&&now-this.entries[0].at>=MATCH_WAIT_MS){const group=this.entries.splice(0,4);this.form(group);this.update();}}
}
