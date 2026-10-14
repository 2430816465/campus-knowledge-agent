import {modes} from './services.js';
/** Game adapter contract. Host owns wallet and routing; games own local resources.
 * load({signal}), enter({container,progress,onProgress,onFinish,onExit,onError}),
 * pause(), resume(), exit(), destroy(). onFinish({runId,win,score}) must be idempotent.
 * destroy must detach input/listeners, cancel RAF/timers, audio and async requests.
 */
export const registry=Object.fromEntries(modes.map(m=>[m.id,{...m,connected:false,canResume:false,canPause:false,load:async()=>{},enter:()=>{},exit:()=>{},destroy:()=>{}}]));
export function registerGame(id,adapter){if(!registry[id])throw Error('Unknown mode');for(const key of ['load','enter','exit','destroy'])if(typeof adapter[key]!=='function')throw Error('Missing lifecycle: '+key);registry[id]={...registry[id],...adapter,connected:true}}
export class GameHost{
 async start(id,options){this.stop();const generation=this.generation;const controller=new AbortController();this.controller=controller;const adapter=registry[id];this.active=adapter;try{await adapter.load({signal:controller.signal});if(controller.signal.aborted||generation!==this.generation)return;await adapter.enter({...options,signal:controller.signal})}catch(error){if(!controller.signal.aborted){this.stop();options.onError?.(error)}}}
 stop(){this.generation=(this.generation||0)+1;this.controller?.abort();if(this.active){try{this.active.exit()}finally{this.active.destroy();this.active=null}}}
}
