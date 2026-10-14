import fs from 'node:fs';
import {PuzzleGame} from '../games/marble/puzzle-state.js';
import {LEVELS} from '../games/marble/puzzle-levels.js';
const sol=JSON.parse(fs.readFileSync('output/puzzle/solutions.json','utf8'));
for(const s of sol){const g=new PuzzleGame(s.level-1);let bounces=0;for(const angle of s.angles){g.fireComplete(angle*Math.PI/180);bounces+=g.trace.at(-1)?.bounces||0}console.log(s.level,LEVELS[s.level-1].name,'shots',s.angles.length,'bounces',bounces,'obstacles',g.level.walls.length+g.level.plates.length,'targets',g.level.nodes.length)}
