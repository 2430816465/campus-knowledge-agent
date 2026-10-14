export const SPECIES=[
 {name:'芽芽团',color:'#83c995',legacy:1}, {name:'露芽蝌',color:'#88d5ca'},
 {name:'花鳍球',color:'#edbe56',legacy:2}, {name:'铃叶螺',color:'#adbecc'},
 {name:'潮尾灵',color:'#53baba',legacy:3}, {name:'珊瑚虾',color:'#eea58d'},
 {name:'桃绒螈',color:'#efa58f',legacy:4}, {name:'莲伞蛙',color:'#93ba77'},
 {name:'玉甲龟',color:'#83b79b',legacy:5}, {name:'琥珀蟹',color:'#d8ae64'},
 {name:'蓝泉獭',color:'#729fc7',legacy:6}, {name:'翠羽鳐',color:'#69b9aa'},
 {name:'紫翼龙',color:'#b5a1d5',legacy:7}, {name:'霜晶企鹅',color:'#9cbed3'},
 {name:'月角灵',color:'#b6dacc',legacy:8}, {name:'赤霞海马',color:'#dd9278'},
 {name:'夜澜龙',color:'#697baa',legacy:9}, {name:'云鬃麒麟',color:'#c8cba5'},
 {name:'曜纹玄鲸',color:'#727aaf'}, {name:'星冠巨兽',color:'#ddbf74',legacy:10}
];
export const WORLD={width:4200,height:3000,margin:66};
export const MAX_LEVEL=SPECIES.length;
export const POPULATION=180;
export const MAX_ENTITIES=260;
export const MERGE_COUNT=3;
export const MAX_FOLLOWERS=(MAX_LEVEL-1)*(MERGE_COUNT-1)+1;
export const PLAYER_SPEED=210;
export const SAVE_KEY='camp-evolve-v1';
export const LEGACY_LEVELS=[1,3,5,7,9,11,13,15,17,20];
const LEGACY_REQUIREMENTS=[5,5,6,6,7,7,8,9,10,11,12,13,14,14,15,15,16,16,16,16];
const RADII=[16,19,22,26,30,35,40,46,52,59,66,74,83,92,102,113,125,138,152,167];
export const legacyRequired=(level,version=2)=>version===1?6+Math.floor(level*.65):LEGACY_REQUIREMENTS[Math.max(0,Math.min(MAX_LEVEL-1,level-1))];
export const radius=level=>RADII[Math.max(0,Math.min(MAX_LEVEL-1,level-1))];
export const followerRadius=(level,bodyLevel)=>radius(level)*(level===bodyLevel?1:.78);
// Level one has no lower food: keep a starter pond, then preserve predominantly low tiers.
export const difficulty=level=>({same:level===1?.965:level<=4?.008:level<=12?.005:.003,sameCap:level===1?MAX_ENTITIES:2,foodInterval:level<=4?22:level<=12?32:45,foodNearby:0,threatShare:.035});
export const wanderSpeed=level=>46+level*2.3+Math.max(0,level-7)*2;
export const rewardFor=run=>{
 const source=run.legacyResult||run;
 if(source.eaten<5)return 0;
 const growth=run.legacyResult?(source.level-1)*2:Math.floor((source.level-1)*18/(MAX_LEVEL-1));
 return Math.min(36,Math.min(24,growth+Math.floor(source.eaten/4))+(source.win?12:0));
};
