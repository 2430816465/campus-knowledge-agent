/* 2D articulated hero rig for the Canvas tower-defense scene.
 * The current pixel silhouettes are provisional. This renderer provides a
 * continuous joint-animation layer that can later take approved art layers.
 */
(function () {
  const MT = window.MT || (window.MT = {});
  const TD = (MT.TD = MT.TD || {});

  const SKIN = '#e8b98c';
  const SKIN_D = '#c99368';
  const STEEL = '#e6ecf6';
  const STEEL_D = '#9aa4b8';
  const WOOD = '#8a6a3a';
  const WOOD_D = '#5f4a28';
  const EYE = '#2b2b3a';
  const GOLD = '#e6c86a';
  const TAU = Math.PI * 2;

  /* Five editable key poses; each channel is interpolated with a Catmull-Rom
   * curve, so the rig moves continuously at the game's render rate. */
  const CLIPS = {
    swordsman: [
      {},
      { body: -0.05, rightArm: -0.5, rightElbow: -0.28, leftArm: 0.1 },
      { body: 0.10, rightArm: -1.12, rightElbow: -0.42, rootX: 0.48, leftArm: 0.18 },
      { body: -0.13, rightArm: 0.62, rightElbow: 0.18, rootX: -0.1, leftArm: -0.18 },
      { body: 0.03, rightArm: 0.12, rightElbow: -0.08 },
      {},
    ],
    archer: [
      {},
      { body: -0.04, leftArm: -0.24, leftElbow: 0.10, rightArm: -0.35, rightElbow: -0.18 },
      { body: 0.04, leftArm: -0.62, leftElbow: 0.16, rightArm: -0.78, rightElbow: -0.38, head: -0.04 },
      { body: -0.06, leftArm: -0.48, leftElbow: 0.08, rightArm: 0.26, rightElbow: -0.12, weaponL: 0.10 },
      { body: 0.02, leftArm: -0.12, rightArm: 0.06 },
      {},
    ],
    mage: [
      {},
      { body: -0.06, rightArm: -0.52, rightElbow: -0.24, leftArm: 0.08 },
      { body: -0.12, rightArm: -0.90, rightElbow: -0.30, leftArm: -0.10, head: -0.04 },
      { body: 0.10, rightArm: 0.24, rightElbow: 0.12, leftArm: 0.18, rootY: -0.20 },
      { body: 0.03, rightArm: 0.10, rightElbow: -0.06 },
      {},
    ],
    rogue: [
      {},
      { body: -0.04, leftArm: -0.38, leftElbow: -0.16, rightArm: 0.12 },
      { body: 0.08, leftArm: 0.50, leftElbow: 0.16, rightArm: -0.54, rightElbow: -0.24, rootX: 0.30 },
      { body: -0.07, leftArm: -0.12, rightArm: 0.52, rightElbow: 0.16, rootX: -0.12 },
      { body: 0.02, rightArm: 0.10, leftArm: -0.08 },
      {},
    ],
    knight: [
      {},
      { body: -0.04, leftArm: -0.32, rightArm: -0.38, rightElbow: -0.18 },
      { body: 0.06, leftArm: -0.56, rightArm: -1.00, rightElbow: -0.38, rootX: 0.35 },
      { body: -0.10, leftArm: -0.22, rightArm: 0.46, rightElbow: 0.12 },
      { body: 0.02, leftArm: -0.08, rightArm: 0.10 },
      {},
    ],
    spearman: [
      {},
      { body: -0.06, rightArm: 0.42, rightElbow: -0.12, leftArm: -0.10 },
      { body: -0.12, rightArm: 0.72, rightElbow: -0.38, rootX: -0.24 },
      { body: 0.12, rightArm: -0.62, rightElbow: 0.18, rootX: 0.60 },
      { body: 0.03, rightArm: -0.12, rightElbow: -0.06 },
      {},
    ],
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function catmull(a, b, c, d, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  }

  function samplePose(classId, progress) {
    const keys = CLIPS[classId] || CLIPS.swordsman;
    const span = (keys.length - 1) * clamp(progress, 0, 1);
    const index = Math.min(keys.length - 2, Math.floor(span));
    const t = span - index;
    const a = keys[Math.max(0, index - 1)];
    const b = keys[index];
    const c = keys[index + 1];
    const d = keys[Math.min(keys.length - 1, index + 2)];
    const pose = {};
    const channels = ['body', 'head', 'leftArm', 'leftElbow', 'rightArm', 'rightElbow',
      'leftLeg', 'leftKnee', 'rightLeg', 'rightKnee', 'weaponL', 'weaponR', 'rootX', 'rootY'];
    for (let i = 0; i < channels.length; i++) {
      const key = channels[i];
      pose[key] = catmull(a[key] || 0, b[key] || 0, c[key] || 0, d[key] || 0, t);
    }
    return pose;
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function polygon(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  function drawCape(ctx, pal, classId, sway) {
    if (classId !== 'archer' && classId !== 'swordsman' && classId !== 'knight') return;
    ctx.save();
    ctx.translate(8, 8);
    ctx.rotate(sway * 0.38);
    ctx.translate(-8, -8);
    const cape = classId === 'knight' ? '#624b47' : pal.dark;
    polygon(ctx, [[4, 8], [12, 8], [13, 14], [11, 18], [7, 15], [3, 17], [3, 12]], cape);
    rect(ctx, 4, 9, 1, 5, pal.darkest);
    ctx.restore();
  }

  function drawLeg(ctx, x, upperAngle, kneeAngle, pal) {
    ctx.save();
    ctx.translate(x, 13.5);
    ctx.rotate(upperAngle);
    rect(ctx, -1.45, 0, 2.9, 3.0, pal.dark);
    rect(ctx, -1.45, 0.2, 2.9, 0.55, pal.main);
    ctx.translate(0, 2.8);
    ctx.rotate(kneeAngle);
    rect(ctx, -1.35, 0, 2.7, 2.8, pal.dark);
    rect(ctx, -1.55, 1.85, 3.1, 1.15, pal.darkest);
    ctx.restore();
  }

  function drawTorso(ctx, pal, classId) {
    if (classId === 'mage') {
      polygon(ctx, [[4, 8], [12, 8], [14, 16], [2, 16]], pal.main);
      rect(ctx, 3, 9, 10, 1, pal.light);
      rect(ctx, 6, 9, 4, 5, pal.dark);
      rect(ctx, 3, 15, 10, 1, pal.light);
    } else {
      rect(ctx, 4, 8, 8, 6, pal.main);
      rect(ctx, 4, 8, 8, 1, pal.light);
      rect(ctx, 4, 12, 8, 1, pal.darkest);
      rect(ctx, 5, 9, 6, 2, classId === 'knight' ? STEEL_D : pal.dark);
      rect(ctx, 7, 9, 2, 3, pal.main);
    }
    rect(ctx, 4, 13, 8, 1, GOLD);
    rect(ctx, 7.4, 12.9, 1.2, 1.2, WOOD_D);
  }

  function drawBackGear(ctx, classId, pal) {
    if (classId === 'archer') {
      rect(ctx, 11.7, 7.5, 2.4, 6.2, WOOD_D);
      rect(ctx, 12.1, 6.8, 1.6, 1.3, WOOD);
      rect(ctx, 12.3, 6.1, 0.45, 2.5, STEEL);
      rect(ctx, 13.1, 6.1, 0.45, 2.2, STEEL);
    } else if (classId === 'swordsman') {
      rect(ctx, 3.1, 9.2, 1.1, 5.8, '#8b343d');
    }
  }

  function drawHead(ctx, classId, pal) {
    ctx.save();
    ctx.translate(8, 8);
    ctx.rotate(0);
    ctx.translate(-8, -8);
    rect(ctx, 5, 2, 6, 6, SKIN);
    rect(ctx, 5, 6, 6, 1, SKIN_D);
    rect(ctx, 6, 4, 1, 1, EYE);
    rect(ctx, 9, 4, 1, 1, EYE);
    if (classId === 'archer' || classId === 'rogue') {
      rect(ctx, 4, 0, 8, 2, pal.darkest);
      rect(ctx, 4, 1, 2, 5, pal.darkest);
      rect(ctx, 10, 1, 2, 4, pal.dark);
      rect(ctx, 5, 0, 6, 1, pal.main);
      if (classId === 'archer') {
        rect(ctx, 10, -1, 2, 1, GOLD);
        rect(ctx, 7, 5, 4, 1, '#b8674d');
      } else {
        rect(ctx, 5, 5, 6, 1, '#6f3135');
      }
    } else if (classId === 'mage') {
      polygon(ctx, [[4, 2], [8, -3], [12, 2]], pal.darkest);
      rect(ctx, 4, 1, 8, 1, pal.main);
      rect(ctx, 3, 2, 10, 1, pal.light);
    } else if (classId === 'knight') {
      rect(ctx, 5, 0, 6, 2, STEEL_D);
      rect(ctx, 4, 2, 8, 1, pal.main);
      rect(ctx, 6, 3, 4, 1, '#586275');
      rect(ctx, 7, -2, 2, 2, '#c85a5a');
    } else {
      rect(ctx, 5, 0, 6, 2, pal.light);
      rect(ctx, 4, 2, 8, 1, pal.dark);
    }
    ctx.restore();
  }

  function drawBow(ctx, pal, weaponAngle) {
    ctx.save();
    ctx.rotate(weaponAngle || 0);
    ctx.strokeStyle = WOOD;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.quadraticCurveTo(3.8, -4, 0, 2.8);
    ctx.stroke();
    ctx.strokeStyle = '#d6dce8';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 2.8);
    ctx.stroke();
    ctx.restore();
  }

  function drawWeapon(ctx, classId, side, pal, weaponAngle) {
    const isMain = side > 0;
    if (classId === 'archer') {
      if (!isMain) {
        drawBow(ctx, pal, weaponAngle);
      } else {
        ctx.save(); ctx.rotate(weaponAngle || 0);
        rect(ctx, -4.5, -1.6, 8, 0.45, WOOD);
        polygon(ctx, [[3.5, -1.9], [5.4, -1.4], [3.5, -0.9]], STEEL);
        polygon(ctx, [[-4.5, -1.6], [-6.1, -2.6], [-5.5, -1.5], [-6.1, -0.6]], '#e4eaf3');
        ctx.restore();
      }
      return;
    }
    if (classId === 'knight' && !isMain) {
      ctx.save(); ctx.rotate(weaponAngle || 0);
      polygon(ctx, [[-2.5, -0.5], [1.4, -0.2], [1.6, 3.0], [-0.5, 4.1], [-2.7, 2.9]], pal.dark);
      rect(ctx, -1.25, 0.2, 1.3, 2.4, pal.light);
      ctx.restore();
      return;
    }
    if (classId === 'rogue') {
      ctx.save(); ctx.rotate(weaponAngle || 0);
      polygon(ctx, [[-0.45, -0.6], [0.9, -6.4], [1.3, -0.4]], STEEL);
      rect(ctx, -0.6, -0.1, 1.6, 2.1, WOOD_D);
      ctx.restore();
      return;
    }
    if (classId === 'mage') {
      ctx.save(); ctx.rotate(weaponAngle || 0);
      rect(ctx, -0.45, -14, 0.9, 15, WOOD);
      rect(ctx, -0.7, -14.3, 1.4, 1.2, pal.glow);
      ctx.restore();
      return;
    }
    if (classId === 'spearman') {
      ctx.save(); ctx.rotate(weaponAngle || 0);
      rect(ctx, -0.42, -19, 0.84, 20, WOOD);
      polygon(ctx, [[-1.5, -18.8], [0, -21], [1.5, -18.8]], STEEL);
      ctx.restore();
      return;
    }
    ctx.save(); ctx.rotate(weaponAngle || 0);
    polygon(ctx, [[-0.55, -8.8], [0.75, -9.4], [1.1, -1], [-0.8, -1]], STEEL);
    rect(ctx, -1.8, -1, 3.6, 0.85, GOLD);
    rect(ctx, -0.6, -0.3, 1.2, 2.1, WOOD_D);
    ctx.restore();
  }

  function drawArm(ctx, side, shoulderAngle, elbowAngle, weaponAngle, pal, classId) {
    ctx.save();
    ctx.translate(side < 0 ? 4 : 12, 9);
    ctx.rotate(shoulderAngle);
    rect(ctx, -1, 0, 2, 3.0, pal.dark);
    rect(ctx, -1, 0.2, 2, 0.55, pal.light);
    ctx.translate(0, 2.8);
    ctx.rotate(elbowAngle);
    rect(ctx, -1, 0, 2, 2.7, pal.dark);
    rect(ctx, -1, 0.1, 2, 0.5, pal.main);
    rect(ctx, -0.8, 2.0, 1.7, 1.25, SKIN);
    drawWeapon(ctx, classId, side, pal, weaponAngle);
    ctx.restore();
  }

  function drawEvolution(ctx, hero, pal, time) {
    if (!hero.evolved) return;
    ctx.save();
    ctx.globalAlpha *= 0.13;
    ctx.fillStyle = pal.main;
    ctx.beginPath(); ctx.ellipse(8, 10, 8.2, 10.4, 0, 0, TAU); ctx.fill();
    ctx.restore();
    const pulse = Math.sin(time * 4 + (hero.uid % 5)) * 0.3;
    rect(ctx, 14, 1 + pulse, 1.1, 2.5, pal.glow);
    rect(ctx, 1, 2 - pulse, 1.1, 1.5, GOLD);
  }

  function idlePose(time, seed) {
    const a = time * 2.25 + seed;
    return {
      body: Math.sin(a) * 0.025,
      head: Math.sin(a * 0.73) * 0.018,
      leftArm: Math.sin(a + 0.7) * 0.018,
      rightArm: Math.sin(a + 1.3) * 0.018,
      leftElbow: 0,
      rightElbow: 0,
      leftLeg: Math.sin(a) * 0.012,
      rightLeg: -Math.sin(a) * 0.012,
      leftKnee: 0,
      rightKnee: 0,
      rootX: 0,
      rootY: Math.sin(a) * 0.12,
      weaponL: 0,
      weaponR: 0,
    };
  }

  const HeroRig = {
    samplePose: samplePose,

    draw(ctx, hero, cx, cy, opts) {
      if (TD.LayeredHeroRig && TD.LayeredHeroRig.draw(ctx, hero, cx, cy, opts)) return;
      const st = TD.Heroes.stats(hero);
      const o = opts || {};
      const scale = o.scale || 1;
      const p = 3 * scale;
      const time = o.time || 0;
      const facing = o.facing === -1 ? -1 : 1;
      const duration = hero.animDuration || 0.36;
      const attacking = hero.animT > 0;
      const pose = attacking
        ? samplePose(hero.classId, 1 - clamp(hero.animT / duration, 0, 1))
        : idlePose(time, (hero.uid || 0) % 7);
      const pal = {
        main: TD.Meta ? TD.Meta.skinColor(hero.classId, st.color) : st.color,
        dark: '', darkest: '', light: '', glow: '',
      };
      pal.dark = TD.U.shade(pal.main, -0.35);
      pal.darkest = TD.U.shade(pal.main, -0.58);
      pal.light = TD.U.shade(pal.main, 0.28);
      pal.glow = st.isFinal ? TD.U.shade(st.color, 0.35) : STEEL;

      ctx.save();
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.translate(cx, cy);
      ctx.scale(facing, 1);
      ctx.save();
      ctx.globalAlpha *= 0.28;
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(0, 0.6 * p, 6.5 * p, 1.8 * p, 0, 0, TAU); ctx.fill();
      ctx.restore();

      ctx.translate(pose.rootX * p, pose.rootY * p);
      ctx.scale(p, p);
      ctx.translate(-8, -19);

      drawEvolution(ctx, hero, pal, time);
      drawCape(ctx, pal, hero.classId, pose.body);
      drawLeg(ctx, 6, pose.leftLeg, pose.leftKnee, pal);
      drawLeg(ctx, 10, pose.rightLeg, pose.rightKnee, pal);

      ctx.save();
      ctx.translate(8, 8);
      ctx.rotate(pose.body);
      ctx.translate(-8, -8);
      drawBackGear(ctx, hero.classId, pal);
      drawTorso(ctx, pal, hero.classId);
      drawArm(ctx, -1, pose.leftArm, pose.leftElbow, pose.weaponL, pal, hero.classId);
      drawArm(ctx, 1, pose.rightArm, pose.rightElbow, pose.weaponR, pal, hero.classId);
      ctx.save();
      ctx.translate(8, 8);
      ctx.rotate(pose.head);
      ctx.translate(-8, -8);
      drawHead(ctx, hero.classId, pal);
      ctx.restore();
      ctx.restore();
      ctx.restore();
    },
  };

  TD.HeroRig = HeroRig;
})();
