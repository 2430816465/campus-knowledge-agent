/* 魔塔 50 层 · 地形 / 门 / 钥匙 / 道具 / NPC 图例
 *
 * 字符分配：
 *   地形     # . > < % * 0
 *   机关地形 w ) F        （落石单向地 / 守卫之锁 / 道具封印门）
 *   门       y b r        （黄 / 蓝 / 红门）
 *   钥匙     Y B R
 *   怪物     1-9 与 A-Z 中除 Y B R 之外的字母，另有 ! ? ~
 *   道具/NPC 小写字母与符号
 */
(function () {
  const MT = (window.MT = window.MT || {});

  MT.TILES = {
    '#': { kind: 'wall', name: '墙' },
    '.': { kind: 'floor', name: '地面' },
    '@': { kind: 'floor', name: '入口' },
    '>': { kind: 'stairs', dir: 1, name: '上楼楼梯' },
    '<': { kind: 'stairs', dir: -1, name: '下楼楼梯' },
    '0': { kind: 'seal', name: '传送阵' },
    '%': { kind: 'lava', name: '岩浆', need: 'ice' },
    '*': { kind: 'secret', name: '暗墙' },

    // 落石地：踩上去的那一刻，你身后那格被塌方封死。整层唯一的「单向」地形。
    w: { kind: 'rock', name: '落石地' },
    // 守卫之锁：一面会自己长回去的封墙。打死本层指定的「守卫」，它才会永久裂开。
    ')': { kind: 'guardwall', name: '守卫之锁' },
    // 道具封印门：不认钥匙，只认道具（需要什么写在本层的 gates 表里）。
    F: { kind: 'gate', name: '道具封印门' },

    // 符文石：踩上去会点亮，顺序错了会反噬。字形由楼层的 runeLock.glyphs 决定。
    g: { kind: 'rune', name: '符文石' },
    j: { kind: 'rune', name: '符文石' },
    k: { kind: 'rune', name: '符文石' },
    s: { kind: 'rune', name: '符文石' },
    u: { kind: 'rune', name: '符文石' },

    y: { kind: 'door', color: 'yellow', name: '黄门' },
    b: { kind: 'door', color: 'blue', name: '蓝门' },
    r: { kind: 'door', color: 'red', name: '红门' },

    Y: { kind: 'pickup', key: 'yellow', amount: 1, name: '黄钥匙', look: 'key', tint: '#e8c73a' },
    B: { kind: 'pickup', key: 'blue', amount: 1, name: '蓝钥匙', look: 'key', tint: '#4a7fe8' },
    R: { kind: 'pickup', key: 'red', amount: 1, name: '红钥匙', look: 'key', tint: '#d8483a' },

    a: { kind: 'pickup', stat: 'atk', amount: 3, name: '红宝石', look: 'gem', tint: '#e04a4a' },
    e: { kind: 'pickup', stat: 'def', amount: 3, name: '蓝宝石', look: 'gem', tint: '#4a86e0' },
    h: { kind: 'pickup', stat: 'hp', amount: 200, name: '红血瓶', look: 'potion', tint: '#d1403a' },
    '(': { kind: 'pickup', stat: 'hp', amount: 500, name: '蓝血瓶', look: 'potion', tint: '#3f74d8' },
    '"': { kind: 'pickup', stat: 'gold', amount: 100, name: '金币', look: 'coin', tint: '#e0b83a' },
    $: { kind: 'pickup', stat: 'gold', amount: 500, name: '钱袋', look: 'coin', tint: '#e8c73a' },

    '[': { kind: 'pickup', stat: 'atk', amount: 10, name: '铁剑', look: 'sword', tint: '#b8c0c8' },
    ']': { kind: 'pickup', stat: 'atk', amount: 20, name: '银剑', look: 'sword', tint: '#e2e8f0' },
    '{': { kind: 'pickup', stat: 'atk', amount: 40, name: '骑士剑', look: 'sword', tint: '#e8c04a' },
    '}': { kind: 'pickup', stat: 'atk', amount: 80, name: '圣剑', look: 'sword', tint: '#9fe0ff' },
    '\\': { kind: 'pickup', stat: 'atk', amount: 150, name: '神圣剑', look: 'sword', tint: '#ffe9a8' },
    "'": { kind: 'pickup', stat: 'def', amount: 10, name: '铁盾', look: 'shield', tint: '#b8c0c8' },
    ';': { kind: 'pickup', stat: 'def', amount: 20, name: '银盾', look: 'shield', tint: '#e2e8f0' },
    ':': { kind: 'pickup', stat: 'def', amount: 40, name: '骑士盾', look: 'shield', tint: '#e8c04a' },
    ',': { kind: 'pickup', stat: 'def', amount: 80, special: 'holyShield', name: '圣盾', look: 'shield', tint: '#9fe0ff' },
    '&': { kind: 'pickup', stat: 'def', amount: 150, name: '神圣盾', look: 'shield', tint: '#ffe9a8' },

    x: { kind: 'pickup', special: 'holyWater', name: '圣水', look: 'holyWater', tint: '#7fe0d0' },
    l: { kind: 'pickup', special: 'luckyCoin', name: '幸运金币', look: 'coin', tint: '#ffe98a' },
    '|': { kind: 'pickup', special: 'magicKey', name: '魔法钥匙', look: 'key', tint: '#f0a83a' },
    c: { kind: 'pickup', special: 'cross', name: '十字架', look: 'cross', tint: '#f2e2b0' },
    _: { kind: 'pickup', special: 'pickaxe', name: '破墙镐', look: 'tool', tint: '#c08a4a' },
    '^': { kind: 'pickup', special: 'bomb', name: '破坏之玉', look: 'tool', tint: '#8a5ad0' },
    '/': { kind: 'pickup', special: 'teleporter', name: '楼层传送器', look: 'tool', tint: '#6ad0e0' },
    '=': { kind: 'pickup', special: 'flyer', name: '中心对称飞行器', look: 'tool', tint: '#c0c8e0' },
    '+': { kind: 'pickup', special: 'upOrb', name: '上楼器', look: 'tool', tint: '#9ad0a0' },
    '-': { kind: 'pickup', special: 'downOrb', name: '下楼器', look: 'tool', tint: '#d0a09a' },
    '`': { kind: 'pickup', special: 'dragonDagger', name: '屠龙匕', look: 'sword', tint: '#ff8a5a' },
    i: { kind: 'pickup', special: 'ice', name: '雪之结晶', look: 'gem', tint: '#bfeaff' },
    n: { kind: 'pickup', special: 'notebook', name: '记事本', look: 'tool', tint: '#d8d0b8' },
    d: { kind: 'pickup', special: 'gemPick', name: '宝石魔镐', look: 'tool', tint: '#c07ad0' },

    z: { kind: 'npc', who: 'fairy', name: '仙子' },
    t: { kind: 'npc', who: 'thief', name: '小偷' },
    o: { kind: 'npc', who: 'elder', name: '老人' },
    m: { kind: 'npc', who: 'merchant', name: '商人' },
    q: { kind: 'npc', who: 'shop', name: '贪婪之神' },
    p: { kind: 'npc', who: 'princess', name: '公主' },
    // 石碑：只给线索，不给答案。读过的线索会进「笔记」。
    v: { kind: 'npc', who: 'stele', name: '石碑' }
  };

  // 商店：金币换能力。原作商店随楼层涨价，本作改为全国统一价（见 README「与原版的差异」）。
  // 难度调整：统一价在原价基础上上调（生命 250→320，能力 400→480，钥匙 200→260），
  // 玩家用同一笔金币换到的能力更少，逼着做取舍。
  MT.SHOP_OPTIONS = [
    { id: 'hp', label: '生命 +800', cost: 320, apply: (s) => { s.hp += 800; } },
    { id: 'atk', label: '攻击 +5', cost: 480, apply: (s) => { s.atk += 5; } },
    { id: 'def', label: '防御 +5', cost: 480, apply: (s) => { s.def += 5; } },
    { id: 'key', label: '黄钥匙 ×2', cost: 260, apply: (s) => { s.keys.yellow += 2; } }
  ];
})();
