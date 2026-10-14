import(new URL('legibility.js',document.currentScript.src)).catch(console.error);
const preferencesScript=document.createElement('script');preferencesScript.src=new URL('preferences.js',document.currentScript.src).href;document.head.append(preferencesScript);
/* Shared skin data: HTML and Canvas use the same palette. No game-state ownership. */
(() => {
  const root=document.documentElement;
  root.dataset.gameUi=location.pathname.split('/').at(-2);
  if(parent!==window&&new URLSearchParams(location.search).has('camp'))root.dataset.embedded='true';
  const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../shared/reference-game.css',document.currentScript.src).href;document.addEventListener('DOMContentLoaded',()=>document.body.append(style),{once:true});
  window.CampSkin=Object.freeze({paper:'#e5e8df',wood:'#c4d0c6',ink:'#253932',muted:'#45574e',line:'#748778',primary:'#d8ad58',green:'#366342',danger:'#963d36'});
  // DOM palettes are scoped by game-themes.css; canvas uses the palette above.
})();

if(new URLSearchParams(location.search).has('dev'))document.documentElement.dataset.dev='true';

