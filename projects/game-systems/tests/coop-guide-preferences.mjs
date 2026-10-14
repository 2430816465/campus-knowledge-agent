import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),guide=require('../games/coop/src/mechanism-guide.js');
// Existing gameplay regressions model a returning player; first-use behavior has its own suite.
export async function returningPlayer(page){
  await page.addInitScript(({key,kinds})=>localStorage.setItem(key,JSON.stringify(kinds)),{key:guide.KEY,kinds:Object.keys(guide.definitions)});
}
