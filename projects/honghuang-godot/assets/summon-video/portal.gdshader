shader_type canvas_item;
uniform vec4 rarity_color : source_color = vec4(0.4,0.75,1.0,1.0);
uniform float reveal : hint_range(0.0,1.0) = 0.0;
uniform float media_phase = 0.0;
void fragment() {
    vec4 source = texture(TEXTURE, UV);
    float luminance = dot(source.rgb,vec3(0.2126,0.7152,0.0722));
    float light = smoothstep(0.62,0.98,luminance);
    // White heart, translucent colored falloff. Uneven light, never a filled panel.
    vec2 portal = (UV-vec2(0.501,0.339))/vec2(0.081,0.157);
    float door = (1.0-smoothstep(0.65,1.08,length(portal)))
               * smoothstep(0.012,0.053,abs(UV.x-0.501));
    float flow = 0.64+0.19*sin(UV.y*33.0-media_phase*0.8)
                     +0.13*cos(UV.x*49.0+UV.y*17.0+media_phase*0.45);
    // Only the existing pale/cyan light marks receive color on the stone platform.
    float cyan = smoothstep(0.025,0.13,min(source.g,source.b)-source.r);
    vec2 floor_uv = (UV-vec2(0.5,0.727))/vec2(0.36,0.051);
    float ring = smoothstep(0.3,0.57,length(floor_uv))
               * (1.0-smoothstep(0.83,1.12,length(floor_uv)));
    float platform = ring*cyan*0.32;
    float mask = clamp((door*light*flow*0.52+platform)*reveal,0.0,0.60);
    vec3 pearl_color = mix(vec3(1.0),rarity_color.rgb,0.65);
    vec3 colored = mix(source.rgb,vec3(luminance)*pearl_color,mask);
    COLOR = vec4(colored,source.a);
}
