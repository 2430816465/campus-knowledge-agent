/* 魔塔 50 层 · 解密机制内核（纯逻辑，游戏与验证器共用）
 *
 * 1) 符文封印阵 runeLock
 *    楼层数据里写死 glyphs（每枚符文刻的字）、order（正确顺序）、walls（封印墙坐标）。
 *    踩到符文：已经亮着的忽略；正好是下一枚就点亮；否则反噬（扣血）+ 全体复位。
 * 2) 密语门 lock 事件
 *    踩到机关弹出密码输入，输入 code 才打开 walls。
 */
(function () {
  const MT = (window.MT = window.MT || {});

  const P = {
    /* ── 符文阵 ─────────────────────────────────────────────── */
    newRuneState() { return { progress: 0, lit: [] }; },

    glyph(def, ch) { return (def && def.glyphs && def.glyphs[ch]) || '?'; },

    /** 正确顺序的可读形式，例如「风 → 林 → 火 → 山」 */
    orderText(def) { return def.order.map((c) => P.glyph(def, c)).join(' → '); },

    /** 下一枚该踩的符文（用于广告提示 / 日志） */
    nextGlyph(def, st) {
      if (!def || st.progress >= def.order.length) return null;
      return P.glyph(def, def.order[st.progress]);
    },

    /** 符文反噬伤害：当前生命的 10%，但不低于 20、也绝不致命（至少留 1 点） */
    backlash(hp) {
      const raw = Math.max(20, Math.floor(hp * 0.1));
      return Math.max(0, Math.min(raw, hp - 1));
    },

    /**
     * 踩到符文石 ch 的结算。会就地修改 st。
     * 返回 { ignore } | { ok, done, index, glyph } | { ok:false, reset:true }
     */
    stepRune(def, st, ch) {
      if (!def) return { ignore: true };
      if (st.progress >= def.order.length) return { ignore: true };
      if (st.lit.indexOf(ch) >= 0) return { ignore: true };
      if (def.order[st.progress] === ch) {
        st.lit.push(ch);
        st.progress++;
        return { ok: true, done: st.progress >= def.order.length, index: st.progress, glyph: P.glyph(def, ch) };
      }
      st.progress = 0;
      st.lit.length = 0;
      return { ok: false, reset: true };
    },

    /* ── 密语门 ─────────────────────────────────────────────── */
    normalizeCode(input) { return String(input == null ? '' : input).replace(/[^0-9]/g, ''); },
    checkCode(ev, input) {
      if (!ev || ev.code == null) return false;
      return P.normalizeCode(input) === String(ev.code);
    },

    /** 广告提示：第 n 次提示该说什么（n 从 0 开始），没有更多提示时返回 null */
    lockHint(ev, n) {
      const steps = (ev && ev.hintSteps) || [];
      return n >= 0 && n < steps.length ? steps[n] : null;
    }
  };

  MT.Puzzle = P;
})();
