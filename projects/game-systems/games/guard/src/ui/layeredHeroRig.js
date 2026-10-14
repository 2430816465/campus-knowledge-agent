/* Production image attachments. Pure presentation: never advances clocks or deals damage. */
(function () {
  const TD = window.MT.TD;
  const baseURL = typeof document !== 'undefined' ? new URL('../../assets/heroes/layered/', document.currentScript.src).href : '';
  const cache = {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = t => t * t * (3 - 2 * t);
  function sample(keys, t) {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], k = smooth(clamp((t - a[0]) / (b[0] - a[0]), 0, 1));
    return a.slice(1).map((v, j) => v + (b[j + 1] - v) * k);
  }
  function imageFor(id, name) {
    const key = id + '/' + name;
    if (!cache[key] && typeof Image !== 'undefined') {
      const im = new Image(); im.src = baseURL + key + '.png'; cache[key] = im;
    }
    return cache[key];
  }
  function part(ctx, cfg, name, x, y, angle, opts) {
    const p = cfg.parts[name], im = imageFor(cfg.id, name);
    if (!p || !im || !im.complete || !im.naturalWidth) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate((angle || 0)+(p.correction||0));
    ctx.drawImage(im, -p.pivot[0], -p.pivot[1], p.size[0], p.size[1]);
    if (opts.anchors) { ctx.fillStyle = '#ee6262'; ctx.fillRect(-1, -1, 2, 2); }
    ctx.restore();
  }
  function ik(a, b, l1, l2, bend) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = clamp(Math.hypot(dx, dy), 0.001, l1 + l2 - 0.001);
    const heading = Math.atan2(dy, dx);
    const offset = Math.acos(clamp((l1*l1 + d*d - l2*l2) / (2*l1*d), -1, 1));
    return [a[0] + Math.cos(heading + bend*offset)*l1, a[1] + Math.sin(heading + bend*offset)*l1];
  }
  function arm(ctx, cfg, shoulder, hand, drawing, o) {
    const elbow = ik(shoulder, hand, cfg.upperLength, cfg.foreLength, 1);
    part(ctx, cfg, 'upper', shoulder[0], shoulder[1], Math.atan2(elbow[1]-shoulder[1], elbow[0]-shoulder[0])-Math.PI/2, o);
    part(ctx, cfg, drawing ? 'drawFore' : 'fore', elbow[0], elbow[1], Math.atan2(hand[1]-elbow[1], hand[0]-elbow[0])-Math.PI/2, o);
    if (o.anchors) {
      ctx.save(); ctx.strokeStyle='#54ded9'; ctx.lineWidth=.65; ctx.beginPath(); ctx.moveTo(...shoulder); ctx.lineTo(...elbow); ctx.lineTo(...hand); ctx.stroke(); ctx.restore();
    }
  }
  const Rig = {
    configs: {},
    sample,
    register(cfg) { this.configs[cfg.id] = cfg; Object.keys(cfg.parts).forEach(n => imageFor(cfg.id, n)); },
    ready(id) { const c=this.configs[id]; return !!c && Object.keys(c.parts).every(n => { const im=imageFor(id,n); return im && im.complete && im.naturalWidth; }); },
    supported(id) { return !!this.configs[id]; },
    pose(hero, opts) {
      const o=opts||{}, c=this.configs[hero.classId], a=hero.attackState;
      const active=o.progress != null || (!o.idle && !hero.visualSuppressed && hero.animT>0);
      const p=o.progress != null ? o.progress : (active ? 1-hero.animT/(hero.animDuration||.54) : 0);
      const release=a ? a.releaseAt/a.duration : .56;
      // Retiming follows the action's release event; authored keys put release at .56.
      const t=p<=release ? p/release*.56 : .56+(p-release)/(1-release)*.44;
      const facing=o.facing === -1 ? -1 : (o.facing === 1 ? 1 : hero.visualFacing||1);
      const world=o.aim != null ? o.aim : hero.visualAim||0;
      const aim=Math.atan2(Math.sin(world), Math.cos(world)*facing);
      const k=sample(c.keys, active ? t : 0);
      const angle=aim+k[0];
      const u=[Math.cos(angle),Math.sin(angle)], v=[-u[1],u[0]];
      const grip=[c.aimPivot[0]+u[0]*k[1],c.aimPivot[1]+u[1]*k[1]];
      const nock=[grip[0]-u[0]*(c.stringRest+k[2]),grip[1]-u[1]*(c.stringRest+k[2])];
      return {active,p,t,facing,angle,u,v,grip,nock,k,released:o.progress!=null ? p>=release : !!(a&&a.released),release};
    },
    muzzle(hero, origin) {
      const cfg=this.configs[hero.classId]; if(!cfg) return origin;
      const state=this.pose(hero,{progress:.56}), s=.60*.88;
      return {x:origin.x+state.grip[0]*s*state.facing,y:origin.y+20+state.grip[1]*s};
    },
    drawArrow(ctx,x,y,angle,length) {
      const im=imageFor('archer','arrow'); if(!im||!im.complete||!im.naturalWidth) return;
      ctx.save(); ctx.translate(x,y); ctx.rotate(angle); const h=length*im.height/im.width;
      ctx.drawImage(im,-length*.7,-h/2,length,h); ctx.restore();
    },
    draw(ctx,hero,cx,cy,opts) {
      const o=opts||{}, c=this.configs[hero.classId]; if(!c) return false;
      if(!this.ready(hero.classId)) return true;
      const s=.60*(o.scale||1), z=this.pose(hero,o), k=z.k;
      ctx.save(); if(o.alpha!=null) ctx.globalAlpha*=o.alpha;
      ctx.translate(cx,cy); ctx.scale(s*z.facing,s);
      // Downsampled attachments are authored at 100 px body height. Smooth tiny rotations,
      // nearest-neighbour enlargement in the preview; no cumulative frame resampling.
      ctx.imageSmoothingEnabled=o.pixelated ? false : true;
      ctx.save(); ctx.globalAlpha*=.22; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(0,1,23,4,0,0,Math.PI*2); ctx.fill(); ctx.restore();
      part(ctx,c,'lower',0,0,0,o);
      part(ctx,c,'body',0,c.waist,k[3],o);
      if(hero.classId==='archer') {
        // Bow/string/arrow share a single grip transform. Fingers are drawn last.
        arm(ctx,c,c.bowShoulder,z.grip,false,o);
        part(ctx,c,'bow',z.grip[0],z.grip[1],z.angle,o);
        ctx.save(); ctx.translate(...z.grip); ctx.rotate(z.angle);
        const pull=c.stringRest+(z.released ? 0 : k[2]);
        const bounce=z.released && z.t<.72 ? Math.sin((z.t-.56)*Math.PI/.028)*Math.exp(-(z.t-.56)*30)*2 : 0;
        ctx.strokeStyle='#dfd4b9'; ctx.lineWidth=.75; ctx.beginPath(); ctx.moveTo(c.bowTipX,-c.bowHalf); ctx.lineTo(-pull+bounce,0); ctx.lineTo(c.bowTipX,c.bowHalf); ctx.stroke(); ctx.restore();
        if(!z.released) this.drawArrow(ctx,z.nock[0]+z.u[0]*c.arrowLength*.7,z.nock[1]+z.u[1]*c.arrowLength*.7,z.angle,c.arrowLength);
        const hand=z.released ? [z.nock[0]-z.u[0]*k[4],z.nock[1]-z.u[1]*k[4]+k[5]] : z.nock;
        arm(ctx,c,c.drawShoulder,hand,true,o);
        // Grip pixels overlay the wooden grip without a second independently moving hand.
        part(ctx,c,'grip',z.grip[0],z.grip[1],z.angle,o);
      } else {
        arm(ctx,c,c.drawShoulder,c.offHand,true,o);
        arm(ctx,c,c.bowShoulder,z.grip,false,o);
        part(ctx,c,'sword',z.grip[0],z.grip[1],z.angle+k[2],o);
        part(ctx,c,'grip',z.grip[0],z.grip[1],z.angle+k[2],o);
        if(o.fx!==false && z.active && z.t>.49 && z.t<.67) {
          ctx.save(); ctx.globalAlpha*=.30*Math.sin((z.t-.49)/.18*Math.PI); ctx.strokeStyle='#eee0bd'; ctx.lineWidth=2;
          ctx.beginPath(); const swordAngle=z.angle+k[2]-Math.PI/2; ctx.arc(z.grip[0],z.grip[1],c.swordLength,swordAngle-.7,swordAngle); ctx.stroke(); ctx.restore();
        }
      }
      if(hero.evolved) {ctx.fillStyle='#d9ba72';ctx.fillRect(-3,-106,6,3);}
      ctx.restore(); return true;
    }
  };
  TD.LayeredHeroRig=Rig;
})();
