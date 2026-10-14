import {createMatch,publicMatch,play,challenge,step} from '../games/liars/rules.js';
import {chooseAction,adaptiveStrength} from '../games/liars/bots.js';
import {mkdir,writeFile} from 'node:fs/promises';
export function rng(seed){return n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};}
export function simulation(seed,humanStrength,botStrength){const random=rng(seed),g=createMatch(Array.from({length:4},(_,i)=>({name:'旅人'+i,character:'hero'})),random,0);let actions=0;while(g.phase!=='finished'&&actions++<1000){if(g.phase==='playing'){const s=g.turn,a=chooseAction(publicMatch(g,s),s===0?humanStrength:botStrength,random,s===0?{}:{protectedSeat:0});if(a.type==='challenge')challenge(g,s,0);else play(g,s,a.cards,random,0);}else step(g,random,g.deadline);}if(g.phase!=='finished')throw Error('nonterminating match');return g.winner===0;}
if(process.argv[1]?.endsWith('liars-match-balance.mjs')){
 const n=3000,curve=[];for(const strength of [.02,.2,.4,.6,.8,.98]){let wins=0;for(let i=1;i<=n;i++)wins+=simulation(i*7919,.75,strength);curve.push({strength,matches:n,winRate:wins/n});}
 const adaptive=[];for(const human of [.35,.55,.75,.95]){let outcomes=[],wins=0,strengthSum=0;for(let i=1;i<=n;i++){const strength=adaptiveStrength({outcomes}),win=simulation(i*7919,human,strength);outcomes=[...outcomes,win].slice(-20);if(i>500){wins+=win;strengthSum+=strength;}}adaptive.push({humanModel:human,matches:n-500,winRate:wins/(n-500),meanBotStrength:strengthSum/(n-500)});}
 const result={note:'Seeded automated public-information policy benchmark, not real human win-rate evidence; no RNG outcome modification.',curve,adaptive};await mkdir('artifacts/liars-match',{recursive:true});await writeFile('artifacts/liars-match/balance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
