/* 魔塔 · 战斗规则内核（纯函数，浏览器与 Node 验证器共用一份） */
(function () {
  const MT = (window.MT = window.MT || {});

  /** 勇者每回合对怪物造成的伤害 */
  function heroHit(hero, mon, specials) {
    let dmg = hero.atk - mon.def;
    if (dmg <= 0) return 0;
    const t = mon.traits || [];
    if (t.indexOf('undead') >= 0 && specials.cross) dmg *= 2;
    if (t.indexOf('dragon') >= 0 && specials.dragonDagger) dmg *= 2;
    return dmg;
  }

  /** 怪物每回合对勇者造成的伤害 */
  function monHit(hero, mon, specials) {
    const t = mon.traits || [];
    if (mon.magicAttack != null && mon.magicAttack > 0) {
      if (specials.holyShield) return 0;
      return mon.magicAttack <= 1 ? Math.ceil(hero.hp * mon.magicAttack) : mon.magicAttack;
    }
    if (t.indexOf('magic') >= 0 && !specials.holyShield) {
      // 魔法攻击无视防御
      return Math.max(0, mon.atk);
    }
    return Math.max(0, mon.atk - hero.def);
  }

  function pierceOf(mon, hp) {
    const t = mon.traits || [];
    for (let i = 0; i < t.length; i++) {
      const m = /^pierce(\d+)$/.exec(t[i]);
      if (m) return Math.floor((hp * parseInt(m[1], 10)) / 100);
    }
    return 0;
  }

  /** 领域伤害：怪物每回合固定多咬你 auraN 点，防御挡不住。写法 aura:100 / aura100 都认。 */
  function auraOf(mon) {
    const t = mon.traits || [];
    for (let i = 0; i < t.length; i++) {
      const m = /^aura:?(\d+)$/.exec(t[i]);
      if (m) return parseInt(m[1], 10);
    }
    return 0;
  }

  /** 夹击：上下左右还站着同伴时，它的出手更狠（×1.5，向上取整）。 */
  function flankedHit(base, flanked) {
    return flanked ? Math.ceil(base * 1.5) : base;
  }

  /**
   * 战斗预演。勇者先手；先攻怪物先打一轮。
   * @returns {{win:boolean, rounds:number, loss:number, pierce:number, field:number, need:number, reason:string, heroHit:number, monHit:number}}
   */
  function predict(hero, mon, specials) {
    specials = specials || {};
    const hh = heroHit(hero, mon, specials);
    const pierce = pierceOf(mon, hero.hp);
    const hpAfterPierce = hero.hp - pierce;
    const mh = flankedHit(monHit(hero, mon, specials), !!specials.flanked);
    if (hh <= 0) {
      return { win: false, rounds: 0, loss: 0, pierce, field: 0, need: Infinity, reason: 'atk', heroHit: 0, monHit: mh };
    }
    const rounds = Math.ceil(mon.hp / hh);
    const t = mon.traits || [];
    const first = t.indexOf('firstStrike') >= 0;
    // 先攻怪物多打一轮；勇者先手则少挨一轮。领域伤害按勇者的每一轮出刀结算，防御无效。
    const field = auraOf(mon) * rounds;
    const incomingHits = first ? rounds : rounds - 1;
    let loss = 0;
    if (mon.magicAttack != null && mon.magicAttack > 0 && mon.magicAttack <= 1 && !specials.holyShield) {
      let remaining = hpAfterPierce;
      for (let i = 0; i < incomingHits; i++) {
        const hit = flankedHit(Math.ceil(remaining * mon.magicAttack), !!specials.flanked);
        loss += hit;
        remaining -= hit;
      }
    } else loss = incomingHits * mh;
    loss += field;
    const win = hpAfterPierce > loss;
    return {
      win,
      rounds,
      loss,
      pierce,
      field,
      need: pierce + loss + 1,
      reason: win ? 'ok' : (hpAfterPierce <= loss ? 'hp' : 'atk'),
      heroHit: hh,
      monHit: mh
    };
  }

  MT.Rules = { predict, heroHit, monHit, pierceOf, auraOf, flankedHit };
})();
