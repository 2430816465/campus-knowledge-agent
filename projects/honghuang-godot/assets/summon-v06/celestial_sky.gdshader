shader_type canvas_item;
render_mode unshaded;
uniform float elapsed = 0.0;
uniform float reveal_start = 5.0;
uniform float aspect = 0.5625;
uniform bool reduced = false;
uniform vec3 rarity_color = vec3(0.89, 0.97, 0.96);

float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float noise(vec2 p) {
  vec2 cell=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(cell),hash(cell+vec2(1.0,0.0)),f.x),mix(hash(cell+vec2(0.0,1.0)),hash(cell+vec2(1.0,1.0)),f.x),f.y);
}
float cloud(vec2 p) {
  float n=noise(p)*0.55;
  n+=noise(p*2.03+7.2)*0.27;
  n+=noise(p*4.12+3.4)*0.13;
  return n;
}
void fragment() {
  vec2 uv=UV;
  vec2 p=(uv-vec2(0.5,0.47))*vec2(aspect,1.0);
  float t=elapsed;
  float revealed=step(reveal_start,t);
  float reveal_t=max(0.0,t-reveal_start);
  float flight=reduced ? 0.0 : smoothstep(3.05,4.9,t);
  float gate=reduced ? 0.0 : smoothstep(1.6,2.9,t)*(1.0-smoothstep(3.2,4.7,t));
  vec3 tint=rarity_color;
  float r=length(p);
  vec2 drift=vec2(t*0.045,-t*0.058);
  vec2 flow=uv*vec2(4.1,6.0)+drift;
  flow+=normalize(p+vec2(0.001))*flight*(1.4+t*0.25);
  float mist=cloud(flow);
  float foreground=cloud(uv*vec2(2.4,4.0)-drift*1.4+vec2(12.0,4.0));
  float cloud_mask=smoothstep(0.10,0.62,r)*(0.10+foreground*0.33);
  vec3 midnight=mix(vec3(0.017,0.058,0.092),vec3(0.036,0.17,0.23),mist);
  vec3 rgb=midnight;
  float alpha=0.38+cloud_mask;
  rgb+=vec3(0.05,0.18,0.23)*pow(mist,3.0)*1.8;
  float aperture=exp(-abs(p.x)*mix(95.0,28.0,gate))*exp(-pow(abs(p.y)*3.6,3.0))*gate;
  rgb+=vec3(0.54,0.83,0.88)*aperture*0.75;
  alpha+=aperture*0.10;
  float halo=exp(-r*r*30.0)*(0.05+gate*0.28);
  rgb+=vec3(0.33,0.69,0.78)*halo;
  // The white travel scene uses no rarity-dependent value until the last 2 s.
  float rays=pow(max(0.0,sin(atan(p.y,p.x)*19.0+t*0.9)),22.0);
  rays*=smoothstep(0.04,0.25,r)*(1.0-smoothstep(0.3,0.8,r))*flight*(1.0-revealed);
  rgb+=vec3(0.33,0.62,0.69)*rays*0.13;
  float bloom=exp(-r*r*16.0)*revealed;
  float seal=exp(-pow((r-(0.03+reveal_t*0.24))*45.0,2.0))*exp(-reveal_t*1.8)*revealed;
  float reveal_rays=pow(max(0.0,sin(atan(p.y,p.x)*8.0-t*0.12)),14.0);
  rgb+=tint*(bloom*(0.40+0.14*sin(reveal_t*2.4))+seal*0.58+reveal_rays*bloom*0.17*revealed);
  alpha+=revealed*0.28;
  float vignette=smoothstep(0.21,0.71,r);
  rgb*=1.0-vignette*0.55;
  COLOR=vec4(rgb,clamp(alpha,0.0,0.93));
}
