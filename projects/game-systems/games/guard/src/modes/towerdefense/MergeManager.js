/* 合成系统（§19 / §32）
 *
 * 规则：只能"相同职业 + 相同星级"合成；跨战斗区 / 备战区都可以（§7 / §58-⑥）。
 * 拖拽落点：
 *   拖到空位        → 换位
 *   拖到可合成英雄  → 合成（1★→2★→3★→4★）
 *   拖到其它英雄    → 不合成（只给轻微提示，不做交换，也不丢英雄）
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  TD.Merge = {
    check(a, b) {
      if (!a || !b) return { ok: false, reason: 'empty' };
      if (a === b) return { ok: false, reason: 'self' };
      if (a.evolved || b.evolved) return { ok: false, reason: 'final' };  // §21 最终英雄不能再合成
      if (a.classId !== b.classId) return { ok: false, reason: 'class' };
      if (a.star !== b.star) return { ok: false, reason: 'star' };
      if (a.star >= 4) return { ok: false, reason: 'max' };               // 4★ 只能走最终进化
      return { ok: true };
    },

    /* 执行合成：keep 留在原格子并升星，consume 消失 */
    merge(run, keep, consume) {
      const fromAt = TD.Heroes.findSlot(run, consume);
      const fromPos = fromAt ? TD.State.slotPos(run, fromAt.zone, fromAt.index) : null;
      TD.Heroes.remove(run, consume);
      keep.star += 1;
      keep.visualSuppressed = true;
      keep.cooldown = Math.min(keep.cooldown, 0.3);
      const at = TD.Heroes.findSlot(run, keep);
      if (at) {
        const pos = TD.State.slotPos(run, at.zone, at.index);
        TD.Effects.mergeBurst(run, pos.x, pos.y, fromPos ? fromPos.x : null, fromPos ? fromPos.y : null, keep.star);
      }
      TD.Sfx.merge();
      TD.Meta.add('merges');
      TD.Heroes.refreshBest(run);
      return keep;
    },

    /* 落点结算，返回 { action: 'move' | 'merge' | 'invalid' | 'none' } */
    tryDrop(run, from, to) {
      const srcArr = TD.State.slotArray(run, from.zone);
      const dstArr = TD.State.slotArray(run, to.zone);
      const hero = srcArr[from.index];
      if (!hero) return { action: 'none' };
      if (from.zone === to.zone && from.index === to.index) return { action: 'none' };

      const target = dstArr[to.index];
      if (!target) {
        hero.visualSuppressed = true;
        dstArr[to.index] = hero;
        srcArr[from.index] = null;
        return { action: 'move' };
      }

      const chk = this.check(hero, target);
      if (chk.ok) {
        this.merge(run, target, hero);
        return { action: 'merge', star: target.star };
      }
      return { action: 'invalid', reason: chk.reason };
    },
  };
})();
