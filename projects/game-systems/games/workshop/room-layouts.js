// Fixed-camera solid scenery. Coordinates are approved-reference pixels / 1.672.
export const WORLD={width:1000,height:562.8};
const obj=(id,l,t,r,b,rise)=>({id,l,t,r,b,rise});
const perimeter=[obj('back-wall',0,0,1000,35,28),obj('left-wall',0,35,29,477,22),obj('right-wall',971,35,1000,477,22),obj('front-left',0,477,615,552,58),obj('front-right',733,477,1000,552,58),obj('left-counter',29,140,102,477,40),obj('right-counter',899,140,971,477,40),obj('front-desk',733,415,971,504,40)];
export const PLANS={
 bake:{objects:[...perimeter,obj('rear-left',29,35,225,185,95),obj('mill',225,26,342,185,110),obj('rear-bins',342,35,496,185,90),obj('oven',496,0,765,185,124),obj('jam',765,35,899,185,98),obj('island',264,262,656,407,60),{...obj('dough-tray',264,242,315,277,22),base:60},obj('island-bread-rack',656,237,772,407,89)],stations:{mill:[272,186,116,150,280,220],oven:[632,186,268,180,640,220],jam:[855,186,134,150,860,220]}},
 shop:{objects:[...perimeter,obj('rear-left',29,35,343,185,103),obj('rack',343,25,660,186,120),obj('rear-right',660,35,899,185,103),obj('counter',212,230,662,383,64),obj('table',731,235,879,383,58)],stations:{counter:[430,383,440,140,440,420],rack:[501,186,317,150,500,200],table:[805,383,148,140,800,420]}},
 raw:{objects:[...perimeter.map(o=>o.id.startsWith('front-')?{...o,t:454,b:544,rise:65}:o).filter(o=>o.id!=='front-desk'),obj('rear-left',29,35,367,140,83),obj('cow',367,0,634,175,122),obj('rear-right',634,35,899,140,83),obj('wheat',91,166,320,334,39),obj('berries',687,166,895,334,40),obj('depot',375,281,625,429,55)],stations:{wheat:[204,334,229,168,200,370],cow:[500,175,267,175,500,220],berries:[792,334,208,168,800,370],depot:[500,429,250,148,660,420]}},
 delivery:{objects:[...perimeter,obj('rear-storage',29,35,899,153,98),obj('pack',212,212,593,396,65),obj('wagon',692,170,914,386,117)],stations:{pack:[402,396,381,184,400,430],wagon:[803,386,222,216,800,420]}}
};
export const SPAWNS={raw:[680,450],bake:[680,440],shop:[680,440],delivery:[680,440]};
export const stationArt={};
export function solids(room){return PLANS[room].objects.map(o=>({left:o.l,right:o.r,top:['island','island-bread-rack','dough-tray','counter','table','pack','wagon','wheat','berries','depot'].includes(o.id)?o.t:o.t+o.rise+(o.base||0),bottom:o.b+(o.base||0),id:o.id}));}
