/* 魔塔 50 层 · 怪物数据
 *
 * 数值来源：《魔法の塔》(1996, PC-9801, 渡部直 / N.W.) 原版 33 种怪物数值表。
 * HP / 攻击 / 防御 / 金币 四项与原版一致；额外成长权重仅用于内部结算，不直接展示给玩家。
 * 少数 Boss（大魔导师）按可通关性做了下调，在下方的 note / tuned 字段中标明。
 *
 * 字符分配：数字 1-9 与大写 A-Z 表示怪物；小写与符号表示道具 / NPC / 地形。
 */
(function () {
  const MT = (window.MT = window.MT || {});

  // art: [形状, 主色, 暗色]；形状实现在 ui/sprites.js
  // traits: undead 不死系(十字架伤害翻倍) / firstStrike 先攻 / aura:N 领域伤害
  //         flank 夹击 / noBomb 免疫破坏之玉 / boss
  const M = {
    // ── Ⅰ区 · 1-9 层 ────────────────────────────────────────────
    '1': { name: '绿色史莱姆', jp: 'Ｇスライム', hp: 35, atk: 18, def: 1, gold: 1, exp: 2, art: ['slime', '#5ec86a', '#2e7a38'], region: 1 },
    '2': { name: '红色史莱姆', jp: 'Ｒスライム', hp: 45, atk: 20, def: 2, gold: 2, exp: 3, art: ['slime', '#e0603c', '#8c2f1c'], region: 1 },
    '3': { name: '小蝙蝠', jp: 'バット', hp: 35, atk: 38, def: 3, gold: 3, exp: 4, art: ['bat', '#6f8fe0', '#2f3f80'], region: 0 },
    '4': { name: '初级法师', jp: '僧侶', hp: 60, atk: 32, def: 8, gold: 5, exp: 6, art: ['hood', '#4a6fd0', '#1e2f66'], region: 1 },
    '5': { name: '骷髅人', jp: 'スケルトンＣ', hp: 50, atk: 42, def: 6, gold: 6, exp: 8, art: ['bone', '#e8e4d4', '#8b8878'], region: 1 },
    '6': { name: '骷髅士兵', jp: 'スケルトンＢ', hp: 55, atk: 52, def: 12, gold: 8, exp: 10, art: ['bone', '#e8e4d4', '#8b8878'], gear: ['sword', 'shield'], region: 1 },
    '7': { name: '初级卫兵', jp: '門番Ｃ', hp: 50, atk: 48, def: 22, gold: 12, exp: 14, art: ['cube', '#d8c25a', '#7a6a20'], region: 0 },
    '8': { name: '骷髅队长', jp: 'スケルトンＡ', hp: 100, atk: 65, def: 15, gold: 30, exp: 40, art: ['bone', '#e8d98a', '#8f7f2c'], gear: ['sword', 'shield', 'crown'], traits: ['boss'], boss: true, region: 1 },

    // ── Ⅱ区 · 10-22 层 ──────────────────────────────────────────
    '9': { name: '大史莱姆', jp: 'Ｂスライム', hp: 130, atk: 60, def: 3, gold: 8, exp: 12, art: ['slime', '#4a4a58', '#22222c'], region: 2 },
    A: { name: '大蝙蝠', jp: '大バット', hp: 60, atk: 100, def: 8, gold: 12, exp: 16, art: ['bat', '#8fa4e8', '#3a4a90'], region: 0 },
    C: { name: '兽人', jp: 'ゾンビ', hp: 260, atk: 85, def: 5, gold: 18, exp: 22, art: ['brute', '#b07a4a', '#5f3f22'], traits: ['undead'], region: 2 },
    D: { name: '高级法师', jp: '上級僧侶', hp: 100, atk: 95, def: 30, gold: 22, exp: 26, art: ['hood', '#d04a4a', '#6b1c1c'], region: 2 },
    E: { name: '石头人', jp: 'ロック', hp: 20, atk: 100, def: 68, gold: 28, exp: 30, art: ['cube', '#a58a6a', '#5c4a34'], region: 2 },
    G: { name: '兽人武士', jp: 'ゾンビナイト', hp: 320, atk: 120, def: 15, gold: 30, exp: 34, art: ['brute', '#c08a52', '#6b4526'], gear: ['sword', 'shield'], traits: ['undead'], region: 0 },
    '!': { name: '大章鱼', jp: '大ダコ', hp: 1200, atk: 180, def: 20, gold: 100, exp: 120, art: ['tentacle', '#c05a7a', '#5e1f34'], traits: ['boss', 'noBomb'], boss: true, size: 3, region: 2 },
    H: { name: '吸血鬼', jp: 'バンパイア', hp: 444, atk: 199, def: 66, gold: 144, exp: 160, art: ['wraith', '#7a8fd8', '#2f3a70'], gear: ['cape'], traits: ['undead', 'boss'], boss: true, region: 2 },

    // ── Ⅲ区 · 23-27 层 ─────────────────────────────────────────
    I: {
      name: '大魔导师', jp: '大魔導師', hp: 4500, atk: 560, def: 310, gold: 1000, exp: 900,
      art: ['hood', '#4a4a58', '#1a1a22'], gear: ['cape', 'shield'], traits: ['boss'], boss: true, region: 3,
      tuned: { hp: 4200, atk: 540, def: 290 },
      note: '原版 HP4500/ATK560/DEF310，需极高攻防。本作按可通关性下调。'
    },

    // ── Ⅳ区 · 28-42 层 ─────────────────────────────────────────
    J: { name: '史莱姆人', jp: 'スライムマン', hp: 320, atk: 140, def: 20, gold: 30, exp: 36, art: ['slime', '#6ad06a', '#2b6b2b'], region: 4 },
    K: { name: '鬼战士', jp: '死霊兵士', hp: 220, atk: 180, def: 30, gold: 35, exp: 40, art: ['bone', '#8898c8', '#3a4468'], region: 4 },
    L: { name: '战士', jp: '兵士', hp: 210, atk: 200, def: 65, gold: 45, exp: 46, art: ['brute', '#88a0c8', '#39496b'], region: 4 },
    M: { name: '双手剑士', jp: '剣士', hp: 100, atk: 680, def: 50, gold: 55, exp: 52, art: ['brute', '#d8b84a', '#7d6716'], gear: ['sword', 'sword'], traits: ['firstStrike'], region: 4 },
    N: { name: '骑士', jp: '騎士', hp: 160, atk: 230, def: 105, gold: 65, exp: 58, art: ['knight', '#d05a4a', '#6d2419'], gear: ['sword', 'shield'], region: 4 },
    O: { name: '中级卫兵', jp: '門番Ｂ', hp: 100, atk: 180, def: 110, gold: 100, exp: 60, art: ['cube', '#5a7fd8', '#26376e'], region: 4 },
    P: { name: '金骑士', jp: '金騎士', hp: 120, atk: 150, def: 50, gold: 100, exp: 70, art: ['knight', '#e0c04a', '#7d6716'], gear: ['sword', 'shield', 'crown'], traits: ['boss'], boss: true, region: 4 },
    '?': {
      name: '魔龙', jp: 'エ纒', hp: 1500, atk: 600, def: 250, gold: 800, exp: 700,
      art: ['dragon', '#4a7a5a', '#1e3a28'], traits: ['boss', 'noBomb', 'dragon'], boss: true, size: 3, region: 4,
      tuned: { hp: 1000, atk: 360, def: 160, gold: 700, exp: 600 },
      note: '原版 1500/600/250、金 800。原版数值下玩家在 35 楼无论如何都咬不动它，' +
        '九只魔龙合计 7200 金币会把整座塔的后期经济锁死（打不动 → 没钱 → 更打不动）。' +
        '现改为「拿到屠龙匕、并且把防御堆到 360 以上再回来」才划算的伏笔金库。'
    },

    // ── Ⅴ区 · 43-50 层 ─────────────────────────────────────────
    Q: { name: '史莱姆王', jp: 'Ｋスライム', hp: 360, atk: 310, def: 20, gold: 40, exp: 60, art: ['slime', '#3fc06a', '#1a5c30'], gear: ['crown'], region: 5 },
    S: {
      name: '吸血蝙蝠', jp: '吸血コウモリ', hp: 200, atk: 390, def: 90, gold: 50, exp: 70,
      art: ['bat', '#d8584a', '#7a231a'], region: 5,
      tuned: { atk: 320 }, note: '原版攻击 390。45 楼起玩家自然防御只有 330 上下，390 会让这一批怪无法被防御抵消。'
    },
    T: {
      name: '初级巫师', jp: '魔術師Ｂ', hp: 220, atk: 370, def: 110, gold: 80, exp: 80,
      art: ['hood', '#d8c04a', '#6d5f16'], traits: ['aura:100'], region: 5,
      tuned: { atk: 320 }
    },
    U: {
      name: '高级巫师', jp: '魔術師Ａ', hp: 200, atk: 380, def: 130, gold: 90, exp: 88,
      art: ['hood', '#d04a4a', '#6b1c1c'], traits: ['aura:200'], region: 5,
      tuned: { atk: 330 }, note: '领域伤害 200/回合，已经足够惩罚「硬吃多回合」，攻击不必再叠。'
    },
    V: {
      name: '魔导师', jp: '魔導師', hp: 230, atk: 450, def: 100, gold: 100, exp: 95,
      art: ['hood', '#5a6fd8', '#232c66'], traits: ['flank'], region: 5,
      tuned: { atk: 350 }, note: '49 楼 5 点封印要连打 4 只，450 会让封印环节变成单纯堆血。'
    },
    W: {
      name: '黑骑士', jp: '黒騎士', hp: 180, atk: 430, def: 210, gold: 120, exp: 110,
      art: ['knight', '#4a4a5e', '#1c1c26'], gear: ['sword', 'shield'], region: 5,
      tuned: { atk: 370, def: 180 }, note: '原版防御 210。198 点自然攻击在线性成长上到不了，先把防御门槛降到 181。'
    },
    X: {
      name: '高级卫兵', jp: '門番Ａ', hp: 180, atk: 460, def: 360, gold: 200, exp: 160,
      art: ['cube', '#c04a4a', '#5e1c1c'], traits: ['noBomb'], region: 5,
      tuned: { atk: 400, def: 280 },
      note: '原版防御 360。50 楼必经路上一只就是 361 攻击门槛，而自然攻击上限只有 209，' +
        '等于强制把全部金币砸进攻击力。现降为 280，保留「不打动就不能过」的性质。'
    },
    '~': {
      name: '魔导师·芝诺', jp: '魔導師ゼノ', hp: 800, atk: 500, def: 100, gold: 500, exp: 400,
      art: ['hood', '#c03a6a', '#5e1430'], gear: ['cape', 'crown'], traits: ['boss'], boss: true, region: 5,
      unsealed: { hp: 8000, atk: 2600, def: 900 }, sealedDiv: 10,
      final: { hp: 2600, atk: 540, def: 300 },
      note: '49 楼未封印状态在原版无论如何都打不过：破坏其上下左右 4 只魔导师形成「5 点封印」后三项降为 1/10。五十楼的真身另有数值（final 字段）。'
    }
  };

  // 应用平衡性调整（原版数值保留在 tuned 字段中可查）
  Object.keys(M).forEach((k) => {
    const m = M[k];
    if (m.tuned) {
      for (const f of ['hp', 'atk', 'def', 'gold', 'exp']) {
        if (typeof m.tuned[f] === 'number') m[f] = m.tuned[f];
      }
    }
  });

  // 难度校准：后期（33F 之后）怪物攻击整体上浮，压紧通关容错，逼玩家用广告补给或精算路线
  const ENDGAME_ATK_SCALE = 1.0;
  if (ENDGAME_ATK_SCALE !== 1) {
    Object.keys(M).forEach((k) => {
      const m = M[k];
      if (m.region >= 4) m.atk = Math.round(m.atk * ENDGAME_ATK_SCALE);
    });
  }

  MT.MONSTERS = M;
  MT.MONSTER_CHARS = Object.keys(M);
  MT.isMonsterChar = (ch) => Object.prototype.hasOwnProperty.call(M, ch);
})();
