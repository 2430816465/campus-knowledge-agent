shader_type canvas_item;
varying vec4 canvas_tint;
void vertex(){ canvas_tint=COLOR; }
void fragment(){
    vec4 s=texture(TEXTURE,UV);
    float a=smoothstep(0.0,0.075,UV.x)*smoothstep(0.0,0.075,1.0-UV.x);
    a*=smoothstep(0.0,0.025,UV.y)*smoothstep(0.0,0.12,1.0-UV.y);
    COLOR=vec4(s.rgb,s.a*a)*canvas_tint;
}
