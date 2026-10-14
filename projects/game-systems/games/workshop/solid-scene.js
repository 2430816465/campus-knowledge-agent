import * as T from './vendor/three.module.js';
import {WORLD,PLANS} from './room-layouts.js';
import {FACILITIES,constructionTarget} from './active-state.js';
const K=Math.SQRT2;
const CHEF_FRAMES=['walk', 'walk-up', 'walk-down'].flatMap(name=>[1,2,3,4].map(i=>`${name}-${i}`));
// Fixed camera projection baking: each furnishing is a closed solid mesh with
// real depth and the reference's baked pixel texture. No painter's-order sort.
export function createSolidRenderer(canvas){
 const renderer=new T.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));renderer.outputColorSpace=T.SRGBColorSpace;renderer.setClearColor('#372b28');
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-500,500,WORLD.height/2,-WORLD.height/2,1,5000);
 camera.position.set(500,1200,WORLD.height*K/2+1200);camera.lookAt(500,0,WORLD.height*K/2);camera.updateMatrixWorld();
 const textures={},materials={},emptyMaterials={},plateUniforms={},actorTextures={};let group=new T.Group(),actor,shadow,ring,room='raw',width=1,height=1,ox=0,oy=0,scale=1,stock=[],meshes=[],highlights=[],sites=[],rail=[],ready=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 scene.add(group);
 const toWorld=(x,v,e=0)=>new T.Vector3(x,e,v*K);
 function texture(path){return new Promise((resolve,reject)=>new T.TextureLoader().load(path,t=>{t.colorSpace=T.SRGBColorSpace;t.magFilter=T.NearestFilter;t.minFilter=T.LinearFilter;t.generateMipmaps=false;resolve(t);},undefined,reject));}
 async function load(){await Promise.all(Object.keys(PLANS).map(async id=>{textures[id]=await texture(`assets/faithful/${id}.png`);materials[id]=new T.MeshBasicMaterial({map:textures[id],side:T.DoubleSide});if(id!=='raw'){
  emptyMaterials[id]=new T.MeshBasicMaterial({map:await texture(`assets/faithful/${id}-empty.png`),side:T.DoubleSide});
  const objects=PLANS[id].objects.filter(o=>FACILITIES.some(f=>f.id===o.id));plateUniforms[id]=Object.fromEntries(objects.map(o=>[o.id,{value:1}]));
  // Neighbouring meshes also contain baked edges/shadows of these objects.
  // Replace those texels too, so an unbuilt table cannot leave detached legs.
  materials[id].onBeforeCompile=shader=>{
   shader.uniforms.emptyPlate={value:emptyMaterials[id].map};for(const o of objects)shader.uniforms['hide_'+o.id]=plateUniforms[id][o.id];
   shader.fragmentShader='uniform sampler2D emptyPlate;\n'+objects.map(o=>`uniform float hide_${o.id};`).join('\n')+'\n'+shader.fragmentShader;
   const masks=objects.map(o=>`cleanMask=max(cleanMask,hide_${o.id}*step(${((o.l-22)/1000).toFixed(6)},vMapUv.x)*step(vMapUv.x,${((o.r+22)/1000).toFixed(6)})*step(${(1-(o.b+16)/WORLD.height).toFixed(6)},vMapUv.y)*step(vMapUv.y,${(1-(o.t-5)/WORLD.height).toFixed(6)}));`).join('\n');
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`float cleanMask=0.0;\n${masks}\ndiffuseColor*=mix(texture2D(map,vMapUv),texture2D(emptyPlate,vMapUv),cleanMask);`);
  };materials[id].customProgramCacheKey=()=>`clean-plate-${id}`;
 }}));await Promise.all([...CHEF_FRAMES,'bread','parcel','berry-drop'].map(async id=>actorTextures[id]=await texture(id.startsWith('walk-')?`assets/faithful/${id}.png`:`assets/bakery-${id}.webp`)));ready=true;build(room);return true;}
 function geometry(positions,indices){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));const uv=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i]/1000,1-(positions[i+2]-positions[i+1])/K/WORLD.height);geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;}
 function surface(l,t,r,b,e=0){const y=e,z0=t*K,z1=b*K;return geometry([l,y,z0,r,y,z0,r,y,z1,l,y,z1],[0,2,1,0,3,2]);}
 function solid(o){const {l,t,r,b,rise}=o,base=o.base||0,H=(rise+base)*K,B=base*K,z0=(t+rise+base)*K,z1=(b+base)*K;
  const geo=geometry([l,B,z0,r,B,z0,r,B,z1,l,B,z1,l,H,z0,r,H,z0,r,H,z1,l,H,z1],[4,6,5,4,7,6,3,2,6,3,6,7,0,4,5,0,5,1,0,3,7,0,7,4,1,5,6,1,6,2,0,1,2,0,2,3]);const mesh=new T.Mesh(geo,materials[room]);mesh.userData={id:o.id,solid:true,bounds:{left:l,right:r,top:t+rise+base,bottom:b+base}};group.add(mesh);meshes.push(mesh);
 }
 function sprite(name,w,h){const m=new T.Mesh(new T.PlaneGeometry(w,h*K),new T.MeshBasicMaterial({map:actorTextures[name],transparent:false,alphaTest:.45,side:T.DoubleSide}));m.position.y=h*K/2;m.userData.h=h;return m;}
 function dispose(){for(const child of group.children){if(child.geometry)child.geometry.dispose();if(child.material&&![...Object.values(materials),...Object.values(emptyMaterials)].includes(child.material))child.material.dispose();}scene.remove(group);group=new T.Group();scene.add(group);}
 function box(x,v,w,h,d,color,e=0){const geo=new T.BoxGeometry(w,h*K,d*K),colors=[],base=new T.Color(color);for(let i=0;i<geo.attributes.position.count;i++){const face=Math.floor(i/4),shade=[.8,.7,1,.65,.88,.75][face];colors.push(base.r*shade,base.g*shade,base.b*shade);}geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));const m=new T.Mesh(geo,new T.MeshBasicMaterial({vertexColors:true}));m.position.set(x,(e+h/2)*K,v*K);group.add(m);return m;}
 function constructionSite(o,mesh){
  const facility=FACILITIES.some(f=>f.id===o.id),parts=[],plot=[],dust=[];
  let patch=null;
  if(facility){
   patch=new T.Mesh(surface(o.l,o.t,o.r,o.b),emptyMaterials[room]);group.add(patch);
   // Three separately moving, texture-registered sections: base, body, then top.
   for(let i=0;i<3;i++){
    const mat=materials[room].clone(),lo=1-(o.b-(o.b-o.t)*i/3)/WORLD.height,hi=1-(o.b-(o.b-o.t)*(i+1)/3)/WORLD.height;
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\nif(vMapUv.y < ${lo.toFixed(8)} || vMapUv.y > ${hi.toFixed(8)}) discard;`);};mat.customProgramCacheKey=()=>`build-${o.id}-${i}`;
    const part=new T.Mesh(mesh.geometry.clone(),mat);part.visible=false;group.add(part);parts.push(part);
   }
   const t=Math.max(o.t+10,o.b-Math.min(65,o.b-o.t-16)),l=o.l+8,r=o.r-8,b=o.b-8;
   for(const v of [t,b])plot.push(box((l+r)/2,v,r-l,3,4,'#b88a4f'));
   for(const x of [l,r])plot.push(box(x,(t+b)/2,4,3,b-t,'#775333'));
   for(const x of [l,r])for(const v of [t,b])plot.push(box(x,v,6,10,6,'#deb875'));
  }
  const bar=box((o.l+o.r)/2,o.b+12,Math.min(90,o.r-o.l-20),3,3,'#ffe3a0',5);bar.visible=false;
  for(let i=0;i<8;i++){const m=box(0,0,3+i%3,3+i%2,3,i%2?'#ffe6aa':'#b68b60');m.visible=false;dust.push(m);}
  sites.push({id:o.id,o,mesh,facility,patch,parts,plot,dust,bar,phase:'built'});
 }
 function build(id){room=id;if(!ready)return;dispose();meshes=[];stock=[];highlights=[];sites=[];rail=[];const objects=PLANS[id].objects;
  // Only uncovered foundation pixels become floor triangles. Furnishings use
  // separate textured top/front/back/side faces and share collision footprints.
  const xs=[...new Set([0,1000,...objects.flatMap(o=>[o.l,o.r])])].sort((a,b)=>a-b),ys=[...new Set([0,WORLD.height,...objects.flatMap(o=>[o.t,o.b])])].sort((a,b)=>a-b);const pos=[],idx=[];
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2;if(objects.some(o=>x>o.l&&x<o.r&&y>o.t&&y<o.b))continue;const n=pos.length/3;pos.push(xs[i],0,ys[j]*K,xs[i+1],0,ys[j]*K,xs[i+1],0,ys[j+1]*K,xs[i],0,ys[j+1]*K);idx.push(n,n+2,n+1,n,n+3,n+2);}
  group.add(new T.Mesh(geometry(pos,idx),materials[id]));objects.forEach(solid);
  for(const m of meshes.filter(m=>PLANS[room].stations[m.userData.id]))constructionSite(objects.find(o=>o.id===m.userData.id),m);
  // A compact solid roller attachment remains on the warehouse footprint.
  if(id==='raw'){
   for(const v of [398,417])rail.push(box(516,v,170,3,3,'#815731',56));
   for(let i=0;i<12;i++)rail.push(box(439+i*14,407.5,12,3,17,'#b3a88c',57));
   rail.forEach(m=>m.userData.baseY=m.position.y);
  }
  // Extend only perimeter timber into ultrawide viewport gutters.
  for(const l of Array.from({length:26},(_,i)=>i<13?-520+i*40:1000+(i-13)*40)){const r=l+40,u0=.004,u1=.017;const geo=surface(l,0,r,WORLD.height);geo.setAttribute('uv',new T.Float32BufferAttribute([u0,1,u1,1,u1,0,u0,0],2));group.add(new T.Mesh(geo,materials[id]));}
  if(globalThis.CampCosmetics?.includes('bakery-berry')){const badge=sprite('berry-drop',21,26);badge.position.set(860,85*K,170*K);group.add(badge);}
  actor=sprite('walk-1',93,93);group.add(actor);
  for(const m of meshes.filter(m=>PLANS[room].stations[m.userData.id])){const light=new T.Mesh(m.geometry.clone(),new T.MeshBasicMaterial({color:'#ffdc77',transparent:true,opacity:.13,depthWrite:false,depthFunc:T.EqualDepth,side:T.DoubleSide}));light.renderOrder=2;group.add(light);highlights.push({id:m.userData.id,light});}

  shadow=new T.Mesh(new T.CircleGeometry(16,20),new T.MeshBasicMaterial({color:'#2b2026',transparent:true,opacity:.3,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.y=.48;group.add(shadow);
  ring=new T.Mesh(new T.RingGeometry(15,18,28),new T.MeshBasicMaterial({color:'#ecd598',side:T.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));ring.rotation.x=-Math.PI/2;group.add(ring);
  for(const [id,v] of Object.entries(PLANS[room].stations)){const icon=sprite(['pack','wagon'].includes(id)?'parcel':'bread',21,22);icon.position.set(v[0]+40,30*K,v[1]*K);icon.visible=false;group.add(icon);stock.push({id,icon});}
 }
 function resize(w,h){width=w;height=h;renderer.setSize(w,h,false);scale=Math.min(w/1000,h/WORLD.height);ox=(w-1000*scale)/2;oy=(h-WORLD.height*scale)/2;camera.left=-w/scale/2;camera.right=w/scale/2;camera.top=h/scale/2;camera.bottom=-h/scale/2;camera.updateProjectionMatrix();}
 function project(x,z,y=0){return {x:ox+x*scale,y:oy+(z-y/K)*scale};}
 const ray=new T.Raycaster(),floor=new T.Plane(new T.Vector3(0,1,0),0);
 function ground(x,y){ray.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),camera);const p=new T.Vector3();return ray.ray.intersectPlane(floor,p)?{x:p.x,y:p.z/K}:null;}
 function draw(player,selected,layout,state,availability=()=>'available'){if(!ready)return;actor.position.set(player.x,(93/2-6)*K,player.y*K);
  for(const [id,u] of Object.entries(plateUniforms[room]||{}))u.value=state.facilities[id]>0?0:1;
  for(const site of sites){
   const {id,o,mesh,facility,patch,parts,plot,dust,bar}=site,jobs=Object.values(state.construction||{}).filter(j=>constructionTarget(j.kind,j.index).id===id),j=jobs.find(j=>!j.applied)||jobs[0],built=!facility||state.facilities[id]>0,assembling=!!j?.first&&!j.applied;
   mesh.visible=built; if(patch)patch.visible=!built;plot.forEach(m=>m.visible=!built);
   const progress=j?Math.min(1,(j.duration-j.t)/(j.duration-.65)):0;
   site.phase=j?j.applied?'complete':j.first?'assembling':'upgrading':built?'built':'plot';site.progress=j?progress:built?1:0;
   parts.forEach((m,i)=>{const p=Math.max(0,Math.min(1,(progress-.08-i*.27)/.22));m.visible=assembling&&p>0;m.position.y=reduced.matches?0:(1-p)**2*16*K;});
   bar.visible=!!j&&!j.applied;bar.scale.x=Math.max(.02,progress);
   dust.forEach((m,i)=>{m.visible=!!j&&!reduced.matches; if(!m.visible)return;const p=j.applied?1-j.t/.65:(progress*4+i*.13)%1,x=o.l+12+(o.r-o.l-24)*(i/7);m.position.set(x,(4+Math.sin(p*Math.PI)*9)*K,(o.b+16+(i%3)*3)*K);m.scale.setScalar(Math.max(.05,1-p));m.material.color.set(j.applied?'#ffffff':'#e9dcc9');});
  }
  const railJob=state.construction?.rail,railP=railJob?.first?Math.min(1,(railJob.duration-railJob.t)/3):state.lineBuilt?1:0;
  rail.forEach((m,i)=>{m.visible=state.lineBuilt||railP>(i+1)/rail.length*.9;m.position.y=m.userData.baseY+(!reduced.matches&&railJob&&!railJob.applied?Math.max(0,1-railP)*8*K:0);});
  const direction=player.direction||(player.facing<0?'left':'right'),phase=player.moving?1+Math.floor(player.distance/24)%4:1;
  const frame=`${direction==='up'||direction==='down'?'walk-'+direction:'walk'}-${phase}`;
  actor.material.map=actorTextures[frame];actor.scale.x=direction==='left'?-1:1;actor.userData.animation={direction,frame,mirrored:direction==='left'};
  for(const {id,light} of highlights){const available=availability(id),site=sites.find(s=>s.id===id),buildable=available==='buildable';light.visible=available!=='locked'&&site.mesh.visible;light.material.color.set(site.phase==='complete'?'#e0ffc6':available==='constructing'?'#ffd092':buildable?'#8de5ee':'#ffdc77');light.material.opacity=site.phase==='complete'?.38:id===selected?(buildable?.24:.34):(buildable?.15:.19)+(reduced.matches?0:Math.sin(state.elapsed*2)*.025);}
  shadow.position.set(player.x,.3,player.y*K);ring.visible=!!selected;const p=layout.find(p=>p.id===selected);if(p)ring.position.set(p.foot.x,.5,p.foot.y*K);
  for(const item of stock){item.icon.visible=item.id==='oven'?state.ovenReady.some(Boolean):item.id==='pack'?!!state.packReady.length:item.id==='wagon'?!!state.receipt:false;}
  renderer.render(scene,camera);
 }
 return {load,build,resize,project,ground,draw,stats:()=>({renderer:'three-webgl-projected-solids',meshes:meshes.length,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,depthTest:true,construction:sites.map(s=>({id:s.id,phase:s.phase,progress:s.progress,visible:s.mesh.visible,sections:s.parts.filter(m=>m.visible).length})),railVisible:rail.filter(m=>m.visible).length,chef:actor?.userData.animation||null,occlusionAid:'navigation keeps feet outside furniture silhouettes',highlighted:highlights.filter(h=>h.light.visible).map(h=>h.id),textureMode:'fixed-camera-reference-bake',projection:{scale,ox,oy},solids:meshes.map(m=>({id:m.userData.id,...m.userData.bounds}))})};
}
