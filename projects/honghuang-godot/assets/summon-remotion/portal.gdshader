shader_type canvas_item;
uniform vec4 rarity_color : source_color = vec4(0.4, 0.75, 1.0, 1.0);
uniform float reveal = 0.0;
uniform float media_phase = 0.0;
// Set by the committed highest rarity; zero for mortal/immortal results.
uniform float mythic_power = 0.0;
varying vec4 canvas_tint;
void vertex() { canvas_tint = COLOR; }

// Broad, continuous cloud density, animated only by the actual media position.
float density_hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float cloud_density(vec2 p) {
    vec2 cell = floor(p);
    vec2 t = fract(p);
    t = t * t * (3.0 - 2.0 * t);
    return mix(mix(density_hash(cell), density_hash(cell + vec2(1.0, 0.0)), t.x),
               mix(density_hash(cell + vec2(0.0, 1.0)), density_hash(cell + vec2(1.0)), t.x), t.y);
}
float mist(vec2 p) {
    return cloud_density(p) * 0.64 + cloud_density(p * 2.03 + vec2(5.1, 2.7)) * 0.26
           + cloud_density(p * 4.11 + vec2(1.8, 9.2)) * 0.10;
}

void fragment() {
    vec4 source = texture(TEXTURE, UV);
    COLOR = source * canvas_tint;
    if (reveal > 0.0) {
    // Tracked against the supplied 768x1344 film, not the former Remotion camera.
    float media_time = media_phase + 4.65;
    vec2 scene_uv = UV;
    vec2 pixel = UV * vec2(768.0, 1344.0);
    float door_progress = clamp((media_time - 4.65) / 1.90, 0.0, 1.0);
    float center_x = mix(385.0, 386.5, door_progress);
    float half_width = mix(34.0, 64.0, door_progress);
    vec2 p = (pixel - vec2(center_x, 514.0)) / vec2(half_width, 173.0);

    float opening = 1.0 - smoothstep(half_width - 3.0, half_width + 0.5, abs(pixel.x - center_x));
    float arch_distance = length((pixel - vec2(386.0, 395.0)) / vec2(67.0, 66.0));
    float arch = pixel.y < 395.0 ? 1.0 - smoothstep(0.94, 1.015, arch_distance) : 1.0;
    float threshold = 1.0 - smoothstep(679.0, 688.0, pixel.y);
    float inside = opening * arch * threshold;

    float drift = media_phase * 0.10;
    vec3 lit = source.rgb;
    if (inside > 0.0) {
        vec2 volume_uv = p * vec2(1.35, 3.3) + vec2(drift * 0.45, -drift);
        vec2 curl = vec2(mist(volume_uv * 0.65 + vec2(4.2, 1.3)),
                         mist(volume_uv * 0.71 + vec2(1.5, 8.9)));
        float clouds = mist(volume_uv + curl * 1.35);
        float veil = smoothstep(0.24, 0.73, clouds);
        float edge = smoothstep(0.08, 0.97, abs(p.x));
        float white_core = exp(-pow(p.x + 0.18 * sin(p.y * 2.3 - drift), 2.0) * 5.0);
        // Colour the film's own luminous opening; keep moving door glyphs and stone.
        float luminance = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
        float luminous = smoothstep(0.86, 0.96, luminance);
        float hue_weight = (0.12 + 0.19 * edge + 0.24 * (1.0 - veil)) * (1.0 - 0.62 * white_core * veil);
        vec3 transmitted = vec3(luminance) * mix(vec3(1.0), rarity_color.rgb, hue_weight);
        // Warm ivory highlights remain a part of the original pale-jade scene.
        vec3 pearl = mix(vec3(0.99, 0.992, 1.0), rarity_color.rgb, 0.055);
        transmitted += (vec3(1.0) - transmitted) * pearl * (0.08 + 0.24 * veil + 0.13 * white_core);
        lit = mix(source.rgb, transmitted, inside * reveal * luminous);
    }

    // Bounce follows the actual steps and luminous circle already present in the film.
    vec2 stairs = (scene_uv - vec2(0.5, 0.568)) / vec2(0.090, 0.077);
    vec2 floor_light = (scene_uv - vec2(0.5, 0.743)) / vec2(0.24, 0.048);
    float bounce = exp(-dot(stairs, stairs) * 1.7) * 0.05
                 + exp(-dot(floor_light, floor_light) * 1.6) * 0.045;
    if (bounce > 0.0001) {
        float softness = 0.76 + 0.24 * mist(scene_uv * vec2(9.0, 12.0) + vec2(0.0, -drift));
        vec3 bounce_color = mix(vec3(1.0), rarity_color.rgb, 0.16);
        lit += (vec3(1.0) - lit) * bounce_color * bounce * softness * reveal;
    }
    if (mythic_power > 0.0) {
        // Light erupts from the existing opening, reaching neighbouring mist and stone.
        float charge = smoothstep(0.02, 0.60, media_phase);
        float burst = smoothstep(0.56, 0.72, media_phase)
                    * (1.0 - smoothstep(0.98, 1.47, media_phase));
        float afterglow = smoothstep(0.75, 1.36, media_phase);
        float energy = mythic_power * reveal * (0.12 * charge + 2.15 * burst + 0.15 * afterglow);
        vec2 local = pixel - vec2(386.0, 514.0);
        float expansion = 0.72 + smoothstep(0.57, 1.15, media_phase) * 0.55;
        vec2 near_gate = local / vec2(91.0, 182.0);
        vec2 middle = local / (vec2(158.0, 243.0) * expansion);
        vec2 broad = local / (vec2(245.0, 302.0) * expansion);
        float core = exp(-dot(near_gate, near_gate) * 1.8);
        float halo = exp(-dot(middle, middle) * 1.6);
        float far_halo = exp(-dot(broad, broad) * 1.8);
        vec2 flow_uv = local / vec2(115.0, 139.0) + vec2(media_phase * 0.04, -media_phase * 0.10);
        float vapor = mist(flow_uv * 1.65 + vec2(mist(flow_uv * 0.68), mist(flow_uv * 0.67 + vec2(5.4))) * 1.7);
        float wisps = smoothstep(0.34, 0.65, vapor);
        float radiance = energy * (core * 0.62 + halo * 0.85 + far_halo * (0.12 + wisps * 0.32));
        vec3 pearl_gold = mix(vec3(1.0, 0.87, 0.59), vec3(1.0, 0.985, 0.89),
                             clamp(core * 0.60 + halo * 0.42 + wisps * 0.28, 0.0, 1.0));
        vec3 scattered = vec3(1.0) - exp(-pearl_gold * radiance);
        lit += (vec3(1.0) - lit) * scattered;
        // Keep the interior nearly white at peak. Gold lives in softer, clouded edges.
        lit += (vec3(1.0) - lit) * vec3(1.0, 0.985, 0.92) * inside * burst * 0.50;
        float descent = clamp((pixel.y - 657.0) / 345.0, 0.0, 1.0);
        float cone = 1.0 - smoothstep(0.35, 1.0, abs(local.x) / (60.0 + descent * 210.0));
        float cone_fade = smoothstep(642.0, 696.0, pixel.y) * (1.0 - smoothstep(919.0, 1050.0, pixel.y));
        lit += (vec3(1.0) - lit) * vec3(1.0, 0.94, 0.78) * cone * cone_fade * burst * reveal * (0.14 + wisps * 0.22);
        float reflected = exp(-dot(floor_light, floor_light) * 0.85)
                        * energy * (0.25 + 0.05 * sin(media_phase * 1.5));
        lit += (vec3(1.0) - lit) * vec3(1.0, 0.93, 0.76) * (1.0 - exp(-reflected));
        // The source already contains a perspective-correct circle: light that ring,
        // without drawing a second invented circle across the scene.
        float luminous_ring = smoothstep(0.78, 0.95, dot(source.rgb, vec3(0.2126, 0.7152, 0.0722)));
        float circle_region = exp(-dot(floor_light, floor_light) * 0.85);
        lit = mix(lit, vec3(1.0, 0.985, 0.89), circle_region * luminous_ring * burst * reveal * 0.33);
    }
    COLOR = vec4(lit, source.a) * canvas_tint;
    }
}
