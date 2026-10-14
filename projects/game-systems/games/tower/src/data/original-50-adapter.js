/* Flash/H5 50F static map adapter. Original layer data stays in original-50-maps.js.
 * Runtime event compatibility is implemented separately in game.js. */
(function () {
  const MT = window.MT;
  const source = MT.ORIGINAL50_MAPS;
  if (!source || source.length !== 51) throw new Error('Original 50F source maps missing');

  // Reuse the project's existing monster art, keeping the imported ID mapping explicit.
  const monsterGlyph = {
    100:'1',101:'2',102:'3',103:'4',104:'5',105:'6',106:'7',107:'8',
    108:'9',109:'A',110:'D',111:'C',112:'G',113:'E',114:'!',115:'H',
    116:'I',117:'K',118:'L',119:'J',120:'O',121:'M',122:'?',123:'N',
    124:'P',125:'T',126:'U',127:'Q',128:'S',129:'W',130:'V',131:'X',
    132:'~',133:'~'
  };
  const props = {
    1:'Y',2:'B',3:'R',4:'h',5:'(',6:'a',7:'e',8:'[',9:']',10:'{',11:'}',12:'\\',
    13:"'",14:';',15:':',16:',',17:'&',18:'\uE201',19:'n',20:'/',21:'_',22:'\uE202',
    23:'i',24:'^',25:'|',26:'x',27:'l',28:'c',29:'`',30:'+',31:'-',32:'='
  };
  const doors = {1001:'y',1002:'b',1003:'r',1004:'\uE101',1005:'\uE102',1006:'\uE103'};
  const T = MT.TILES, M = MT.MONSTERS;
  T['\uE101'] = {kind:'door', color:'red', originalType:'prison', name:'监狱门'};
  T['\uE102'] = {kind:'door', color:'blue', originalType:'monster', name:'怪物门'};
  T['\uE103'] = {kind:'wall', name:'墙门'};
  T['\uE201'] = {kind:'pickup', special:'monsterManual', name:'怪物手册', look:'tool', tint:'#d9c9a4'};
  T['\uE202'] = {kind:'pickup', special:'earthquake', name:'地震卷轴', look:'tool', tint:'#bd9c72'};

  for (const [id, glyph] of Object.entries(monsterGlyph)) {
    const src = MT.ORIGINAL50_MONSTERS[id];
    const original = M[glyph];
    if (!src || !original) throw new Error('Missing monster art mapping ' + id);
    if (id === '132' || id === '133') continue;
    Object.assign(original, {name:src.name, hp:src.hp, atk:src.attack, def:src.defence, gold:src.gold, exp:0, size:1});
    if (src.magicAttack != null) original.magicAttack = src.magicAttack;
    const traits = new Set(original.traits || []);
    if (src.firstAttack) traits.add('firstStrike');
    original.traits = [...traits];
  }
  const boss49 = MT.ORIGINAL50_MONSTERS['132'];
  const boss50 = MT.ORIGINAL50_MONSTERS['133'];
  Object.assign(M['~'], {
    name:'魔王', hp:800, atk:500, def:100, gold:boss49.gold, exp:0, size:1,
    unsealed:{hp:boss49.hp,atk:boss49.attack,def:boss49.defence},
    final:{hp:boss50.hp,atk:boss50.attack,def:boss50.defence,gold:boss50.gold}
  });
  MT.MONSTER_CHARS = Object.keys(M);

  // Original pickups scale by floor band, unlike this project's former fixed values.
  T.h.amount = 50; T['('].amount = 200; T.a.amount = 1; T.e.amount = 1;
  T['}'].amount = 50; T['\\'].amount = 100;
  T[','].amount = 50; T['&'].amount = 100;

  const floors = {};
  for (const floor of source) {
    const cells = Array.from({length:121}, () => []);
    // Only the source's explicitly listed passable wall cells are secret walls.
    // Other breakable stone remains a blocking wall (but can still be mined).
    const secretWallIndices = new Set(
      MT.ORIGINAL50_RULES?.passable_secret_walls?.floors?.[String(floor.level)] || []
    );
    const add = (layer, map) => floor.layers[layer].forEach(([index,id,tile,sprite]) => {
      const glyph = map(index,id,tile,sprite);
      if (glyph) cells[index].push(glyph);
    });
    add('wall', (index,_id,tile) => (tile === 2 || tile === 3) && secretWallIndices.has(index) ? '*' : '#');
    add('lava', () => '%');
    add('building', () => 'q');
    add('stair', (_i,_id,_tile,sprite) => sprite === 'stair_up' ? '>' : '<');
    add('prop', (_i,id) => props[id]);
    add('npc', (_i,_id,_tile,sprite) => sprite.startsWith('npc1') ? 't' : 'o');
    add('monster', (_i,id) => monsterGlyph[id]);
    add('door', (_i,id) => doors[id]);
    const hidden = {};
    const rows = [];
    for (let y=0; y<11; y++) {
      let row = '';
      for (let x=0; x<11; x++) {
        const index = y*11+x;
        const stack = cells[index];
        row += stack.pop() || '.';
        if (stack.length) hidden[x+','+y] = stack.reverse();
      }
      rows.push(row);
    }
    floors[floor.level] = {
      name: floor.level + 'F',
      note: '', rows, hidden,
      source: floor.source, sourceHash: floor.sha256,
      unbreakable: floor.layers.wall.filter(([_i,_id,_tile,_sprite,canBreak]) => canBreak === false).map(([index]) => index),
      v2Entry:[5,10], finalBoss:floor.level===50
    };
  }

  // Floor notes carry the terse orientation cues that were easy to miss in
  // the original event-heavy 21–30F stretch.
  const notes = {
    21:'智者：大法师在25层。先取得更高级的装备，再考虑挑战。',
    22:'连接走廊。沿中央空地继续上楼。',
    23:'智者说本层藏着确切消息。调查特殊墙砖；29层的小偷正等着这条消息。',
    24:'救下26层中央的洋娃娃后再回来，封墙会发生变化。',
    25:'大法师镇守此层。击败他可取得红钥匙，开启26层的红门。',
    26:'冰冻岩浆后，调查中央干地上的洋娃娃；它会改变24层的通路。',
    27:'智者会根据生命、攻防和钥匙，评价你目前的准备。',
    28:'商人回收黄钥匙：每把100金币。',
    29:'小偷正在挖暗道。23层的特殊墙没有全部调查完，他就无法完工。',
    30:'击败本层6只史莱姆后，怪物门会自动开启。'
  };
  Object.entries(notes).forEach(([floor, note]) => { floors[floor].note = note; });

  // Scripted people and the rescue doll were omitted from the exported static
  // NPC layer. Keep their cells walkable and render/interact through game.js.
  floors[21].storyNpc = { x:5, y:5, who:'elder' };
  floors[23].storyNpc = { x:5, y:5, who:'elder' };
  floors[26].storyNpc = { x:5, y:5, who:'doll' };
  floors[27].storyNpc = { x:5, y:0, who:'elder' };
  floors[28].storyNpc = { x:7, y:3, who:'merchant' };
  floors[29].storyNpc = { x:5, y:1, who:'thief' };

  // The 26F red door at (5,7) is a normal one-cell door. Extend the adjacent
  // wall line by one tile on either side instead of stretching the door art.
  const floor26DoorRow = floors[26].rows[7].split('');
  floor26DoorRow[4] = '#';
  floor26DoorRow[6] = '#';
  floors[26].rows[7] = floor26DoorRow.join('');

  // MT2.js keeps the prisoner's interactions in its event script rather than
  // the static NPC layer. Convert its initial position from the H5 13x13 map
  // (outer border included) to this adapter's 11x11 inner grid. The return
  // interaction is spawned by the runtime after visiting floor 35 (game.js).
  floors[2].rows[8] = 't' + floors[2].rows[8].slice(1);
  floors[2].rows[6] = floors[2].rows[6].slice(0, 10) + 'm';
  floors[2].rows[10] = floors[2].rows[10].slice(0, 9) + '.' + floors[2].rows[10].slice(10);
  MT.FLOORS = floors;
  MT.ORIGINAL50_GLYPHS = { monsters:monsterGlyph, props, doors };
  MT.ORIGINAL50_ACTIVE = true;
})();
