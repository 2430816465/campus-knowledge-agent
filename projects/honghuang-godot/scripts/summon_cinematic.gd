extends Control
## Presentation only: the caller has already atomically saved every draw.
## Standard timing is seven seconds, with rarity concealed until exactly t=5.
signal completed(skipped: bool)

const DURATION := 7.0
const REVEAL_DURATION := 2.0
const NEUTRAL := Color("e4f7f5")
const RARITY_COLORS := {3: Color("58b7ff"), 4: Color("c288ff"), 5: Color("ffcf66")}
const BACKDROP = preload("res://assets/summon-v05/summon-gate.png")
const SKY_SHADER = preload("res://assets/summon-v06/celestial_sky.gdshader")

var elapsed := 0.0
var rarity := 3
var draw_count := 1
var simplified := false
var sound_enabled := true
var finished := false
var playing := true
var suspended := false
var resume_frame := false
var gate: TextureRect
var sky: ColorRect
var sky_material: ShaderMaterial
var heading: Label
var caption: Label
var rarity_label: Label
var stars: Label
var batch_label: Label
var skip_button: Button
var sound_player: AudioStreamPlayer
var reveal_sound_played := false
var particle_seed: Array[Vector4] = []

func configure(records: Array, reduce_motion: bool=false, enable_sound: bool=true) -> void:
	draw_count=records.size()
	rarity=3
	for record: Dictionary in records:
		rarity=maxi(rarity,int(GameData.character(str(record.id)).get("stars",3)))
	simplified=reduce_motion
	sound_enabled=enable_sound

func duration() -> float:
	return REVEAL_DURATION if simplified else DURATION

func reveal_start() -> float:
	return duration()-REVEAL_DURATION

func rarity_is_visible(at: float=-1.0) -> bool:
	return (elapsed if at<0 else at)>=reveal_start()

func visible_color(at: float=-1.0) -> Color:
	return RARITY_COLORS[rarity] if rarity_is_visible(at) else NEUTRAL

func phase_at(at: float) -> String:
	if at>=reveal_start(): return "reveal"
	if at<1.6: return "gather"
	if at<3.15: return "gate"
	return "flight"

func _ready() -> void:
	name="SummonCinematic"
	z_index=150
	mouse_filter=Control.MOUSE_FILTER_STOP
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	clip_contents=true
	focus_mode=Control.FOCUS_ALL
	grab_focus()
	theme=GameTheme.create()
	var base := ColorRect.new()
	base.color=Color("061b2c")
	base.mouse_filter=Control.MOUSE_FILTER_IGNORE
	base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(base)
	gate=TextureRect.new()
	gate.texture=BACKDROP
	gate.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	gate.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_COVERED
	gate.mouse_filter=Control.MOUSE_FILTER_IGNORE
	add_child(gate)
	sky=ColorRect.new()
	sky.mouse_filter=Control.MOUSE_FILTER_IGNORE
	sky.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	sky_material=ShaderMaterial.new()
	sky_material.shader=SKY_SHADER
	sky.material=sky_material
	add_child(sky)
	# Drawing is above the textured environment, but below all typography.
	var strokes := DrawingLayer.new()
	strokes.name="CelestialTrails"
	strokes.host=self
	strokes.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	strokes.mouse_filter=Control.MOUSE_FILTER_IGNORE
	add_child(strokes)
	heading=GameTheme.label("万 仙 应 召",28,Color("f5ecd1"))
	heading.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	add_child(heading)
	caption=GameTheme.label("灵气汇聚　·　天门将启",14,NEUTRAL)
	caption.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	add_child(caption)
	rarity_label=GameTheme.label("",29,NEUTRAL)
	rarity_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	add_child(rarity_label)
	stars=GameTheme.label("",26,NEUTRAL)
	stars.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	add_child(stars)
	batch_label=GameTheme.label("",14,Color("d5dfcf"))
	batch_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	add_child(batch_label)
	skip_button=GameTheme.button("跳过  ›",skip)
	skip_button.name="SkipSummon"
	skip_button.custom_minimum_size=Vector2(88,42)
	skip_button.add_theme_font_size_override("font_size",14)
	skip_button.add_theme_stylebox_override("normal",GameTheme.box(Color("142f3fd9"),Color("a5bdbb80"),20,8))
	skip_button.add_theme_stylebox_override("hover",GameTheme.box(Color("285063ee"),Color("e0d4a4"),20,8))
	skip_button.add_theme_color_override("font_color",Color("f1ebd8"))
	skip_button.add_theme_color_override("font_hover_color",Color.WHITE)
	add_child(skip_button)
	# Deterministic decoration has no connection to the gameplay RNG stream.
	for i: int in 94:
		particle_seed.append(Vector4(fposmod(i*0.6180339887,1),fposmod(i*0.41421356,1),fposmod(i*0.7320508,1),fposmod(i*0.2360679,1)))
	resized.connect(_layout)
	get_window().focus_exited.connect(_suspend)
	get_window().focus_entered.connect(_resume)
	_layout()
	_update_presentation()
	if sound_enabled: _start_sound()

class DrawingLayer extends Control:
	var host: Control
	func _draw() -> void: host.draw_celestial(self)

func _layout() -> void:
	if not is_instance_valid(gate): return
	var safe: Rect2=GameSafeArea.rect_for(self)
	var width: float=minf(safe.size.x-40,680)
	var left: float=safe.position.x+(safe.size.x-width)/2.0
	heading.position=Vector2(left,safe.position.y+safe.size.y*0.10)
	heading.size=Vector2(width,50)
	caption.position=Vector2(left,safe.position.y+safe.size.y*0.17)
	caption.size=Vector2(width,32)
	rarity_label.position=Vector2(left,safe.position.y+safe.size.y*0.73)
	rarity_label.size=Vector2(width,48)
	stars.position=Vector2(left,safe.position.y+safe.size.y*0.685)
	stars.size=Vector2(width,44)
	batch_label.position=Vector2(left,safe.position.y+safe.size.y*0.795)
	batch_label.size=Vector2(width,28)
	skip_button.position=Vector2(safe.end.x-112,safe.position.y+16)
	skip_button.size=Vector2(92,42)

func _suspend() -> void:
	suspended=true
	if is_instance_valid(sound_player): sound_player.stream_paused=true

func _resume() -> void:
	suspended=false
	resume_frame=true
	if is_instance_valid(sound_player): sound_player.stream_paused=false

func _process(delta: float) -> void:
	if finished or suspended or not playing: return
	if resume_frame: resume_frame=false; return
	advance(delta)

func advance(delta: float) -> void:
	if finished: return
	elapsed=minf(duration(),elapsed+maxf(0,delta))
	_update_presentation()
	if elapsed>=duration(): _finish(false)

func seek_preview(at: float) -> void:
	# Used by native capture and timing tests; it never changes saved results.
	elapsed=clampf(at,0,duration())
	_update_presentation()

func _update_presentation() -> void:
	if not is_instance_valid(sky_material): return
	var reveal: bool=rarity_is_visible()
	var color: Color=visible_color()
	var flight: float=smoothstep(3.05,4.85,elapsed) if not simplified else 0.0
	var zoom: float=1.0+0.12*smoothstep(0,3.1,elapsed)+0.53*flight if not simplified else 1.10
	gate.size=size*zoom
	gate.position=(size-gate.size)/2.0+Vector2(0,35*flight)
	gate.modulate=Color(0.58,0.77,0.78,0.78-0.22*flight)
	sky_material.set_shader_parameter("elapsed",elapsed)
	sky_material.set_shader_parameter("reveal_start",reveal_start())
	sky_material.set_shader_parameter("reduced",simplified)
	sky_material.set_shader_parameter("rarity_color",Vector3(color.r,color.g,color.b))
	sky_material.set_shader_parameter("aspect",size.x/maxf(1,size.y))
	heading.modulate.a=1.0-smoothstep(1.5,2.6,elapsed) if not simplified else 0.0
	caption.text="灵气汇聚　·　天门将启" if elapsed<1.6 else "天门洞开　·　万仙赴约" if elapsed<3.15 else "星河引路　·　仙缘将至"
	caption.modulate.a=0.95 if not reveal else 0.0
	rarity_label.visible=reveal
	stars.visible=reveal
	batch_label.visible=reveal
	if reveal:
		rarity_label.text={3:"三星 · 人间英魂",4:"四星 · 仙道流光",5:"五星 · 神华降临"}[rarity]
		stars.text="  ".join("★".repeat(rarity).split("",false))
		rarity_label.add_theme_color_override("font_color",color.lightened(0.25))
		stars.add_theme_color_override("font_color",color)
		var reveal_progress: float=smoothstep(reveal_start(),reveal_start()+0.30,elapsed)
		rarity_label.modulate.a=reveal_progress
		stars.modulate.a=reveal_progress
		batch_label.text="十次结缘 · 最高品质" if draw_count>1 else "仙缘已至 · 即将揭晓"
		batch_label.modulate.a=reveal_progress
		# Stop neutral starlight from being mistaken for a rarity cue before t=5.
		set_meta("revealed_rarity",rarity)
	elif has_meta("revealed_rarity"): remove_meta("revealed_rarity")
	get_node("CelestialTrails").queue_redraw()

func draw_celestial(layer: Control) -> void:
	var viewport_size: Vector2=layer.size
	if viewport_size.x<1 or viewport_size.y<1: return
	var scale_factor: float=minf(viewport_size.x/540.0,viewport_size.y/960.0)
	var center: Vector2=viewport_size*Vector2(0.5,0.47)
	var base_radius: float=minf(viewport_size.x*0.30,viewport_size.y*0.20)
	var reveal: bool=rarity_is_visible()
	var color: Color=visible_color()
	var flight: float=clampf((elapsed-3.15)/1.85,0,1) if not simplified else 0
	var gate_openness: float=smoothstep(1.6,2.9,elapsed) if not simplified else 1.0
	var reveal_progress: float=clampf((elapsed-reveal_start())/REVEAL_DURATION,0,1)
	# Drifting motes form two curved streams, then stretch into a star corridor.
	for i: int in particle_seed.size():
		var seed: Vector4=particle_seed[i]
		var phase: float=fposmod(seed.y+elapsed*(0.045 if simplified else 0.12),1.0)
		var angle: float=seed.x*TAU+elapsed*0.13
		var radius: float=lerpf(viewport_size.length()*0.64,base_radius*0.20,pow(phase,0.75))
		var point: Vector2=center+Vector2(cos(angle),sin(angle)*1.6)*radius
		if flight>0 and not reveal:
			radius=lerpf(12,viewport_size.length()*0.70,pow(fposmod(seed.y+flight*1.25,1),1.8))
			point=center+Vector2(cos(angle),sin(angle))*radius
		var fade: float=sin(phase*PI)*(0.38+seed.w*0.42)
		layer.draw_circle(point,(0.8+seed.z*1.5)*scale_factor,Color(color,fade))
		if not simplified and (flight>0 or seed.w>0.75):
			var direction: Vector2=(point-center).normalized()
			layer.draw_line(point,point-direction*(10+flight*48)*scale_factor,Color(color,fade*0.42),1.0,true)
	# Talismans rise along the opening celestial doorway, with gilded cloud curls.
	if elapsed<4.65 and not simplified:
		var alpha: float=(1.0-smoothstep(3.6,4.65,elapsed))*smoothstep(0.25,1.2,elapsed)
		var door_half: float=lerpf(4,base_radius*0.68,gate_openness)
		var door_height: float=base_radius*1.52
		for side: int in [-1,1]:
			var line_points := PackedVector2Array()
			for j: int in 50:
				var value: float=float(j)/49.0
				line_points.append(center+Vector2(side*(door_half+sin(value*PI)*base_radius*0.15),lerpf(-door_height,door_height,value)))
			layer.draw_polyline(line_points,Color(NEUTRAL,alpha*0.055),14*scale_factor,true)
			layer.draw_polyline(line_points,Color(NEUTRAL,alpha*0.14),5*scale_factor,true)
			layer.draw_polyline(line_points,Color(NEUTRAL,alpha*0.55),1.0*scale_factor,true)
			for j: int in 7:
				var ypos: float=fposmod(j/7.0+elapsed*0.085,1.0)*door_height*2-door_height
				var x: float=side*(door_half+24*scale_factor)
				var p: Vector2=center+Vector2(x,ypos)
				var s: float=4*scale_factor
				layer.draw_polyline(PackedVector2Array([p+Vector2(0,-s*2),p+Vector2(s,0),p+Vector2(0,s*2),p-Vector2(s,0),p+Vector2(0,-s*2)]),Color(NEUTRAL,alpha*0.40),1,true)
	# The meteor travels in a full curve, dragging several tapering silk ribbons.
	if elapsed>=3.15 and not simplified:
		var travel: float=clampf((elapsed-3.15)/1.85,0,1)
		var comet: Vector2=_comet_position(travel,viewport_size)
		for ribbon: int in 3:
			var trail := PackedVector2Array()
			for j: int in 42:
				var past: float=maxf(0,travel-j/100.0)
				var point: Vector2=_comet_position(past,viewport_size)
				point+=Vector2(sin(past*14+ribbon)*ribbon*9,cos(past*9+ribbon)*ribbon*5)*scale_factor
				trail.append(point)
			if not reveal: layer.draw_polyline(trail,Color(NEUTRAL,0.50-ribbon*0.12),(5-ribbon)*scale_factor,true)
		if not reveal:
			_star(layer,comet,18*scale_factor,NEUTRAL)
	# At t=5 a colored seal blossoms; all tiers use identical pre-reveal motion.
	if reveal:
		var crest: float=base_radius*(0.76+0.08*sin(reveal_progress*PI))
		for spoke: int in 12:
			var angle: float=spoke*TAU/12-PI/2+elapsed*0.035
			var tip: Vector2=center+Vector2(cos(angle),sin(angle))*crest
			var outer: Vector2=center+Vector2(cos(angle),sin(angle))*crest*(1.42+reveal_progress*0.22)
			layer.draw_line(tip,outer,Color(color,0.28*(1-reveal_progress*0.45)),2*scale_factor,true)
		var seal := PackedVector2Array()
		for i: int in 13:
			var angle: float=i*TAU/12-PI/2
			seal.append(center+Vector2(cos(angle),sin(angle))*crest*(1 if i%2==0 else 0.72))
		layer.draw_polyline(seal,Color(color,0.74),1.6*scale_factor,true)
		_star(layer,center,crest*0.46,color.lightened(0.22))
		for offset: float in [-1.0,1.0]:
			var line_y: float=center.y+crest*1.72
			layer.draw_line(Vector2(center.x+offset*20*scale_factor,line_y),Vector2(center.x+offset*130*scale_factor,line_y),Color(color,0.55),1,true)

func _comet_position(value: float,viewport_size: Vector2) -> Vector2:
	var from := viewport_size*Vector2(0.96,-0.12)
	var control := viewport_size*Vector2(0.17,0.21)
	var to := viewport_size*Vector2(0.5,0.47)
	return from*(1-value)*(1-value)+control*2*value*(1-value)+to*value*value

func _star(layer: Control,center: Vector2,radius: float,color: Color) -> void:
	for glow: int in [5,3,1]:
		layer.draw_circle(center,radius*(0.38+glow*0.17),Color(color,0.035 if glow>1 else 0.2))
	var points := PackedVector2Array()
	for i: int in 8:
		var angle: float=i*PI/4-PI/2
		points.append(center+Vector2(cos(angle),sin(angle))*radius*(1.0 if i%2==0 else 0.20))
	layer.draw_colored_polygon(points,color)

func skip() -> void: _finish(true)

func dismiss_without_results() -> void:
	finished=true
	_stop_sound()
	queue_free()

func _finish(skipped: bool) -> void:
	if finished: return
	finished=true
	_stop_sound()
	mouse_filter=Control.MOUSE_FILTER_IGNORE
	hide()
	completed.emit(skipped)
	queue_free()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode==KEY_ESCAPE:
		skip()
		accept_event()

func _exit_tree() -> void:
	_stop_sound()
	# Unexpected removal still releases the application-level presentation lock.
	if not finished:
		finished=true
		completed.emit(true)

func _stop_sound() -> void:
	if is_instance_valid(sound_player): sound_player.stop()

func _start_sound() -> void:
	# Original pentatonic rising wind/chimes. No third-party audio or RNG usage.
	var sample_rate := 22050
	var frames := int(duration()*sample_rate)
	var bytes := PackedByteArray()
	bytes.resize(frames*2)
	var notes: Array[float]=[261.6256,293.6648,329.6276,391.9954,440.0]
	for i: int in frames:
		var t: float=float(i)/sample_rate
		var opening: float=smoothstep(0,1.7,t)*(1-smoothstep(reveal_start()-0.35,reveal_start(),t)) if not simplified else 0
		var wind: float=(sin(t*193.7+sin(t*3.1)*6)+sin(t*283.13+sin(t*4.9)*4))*0.016*opening
		var wave: float=wind
		if not simplified:
			for j: int in 5:
				var age: float=t-(0.25+j*0.63)
				if age>0 and age<1.4:
					wave+=(sin(TAU*notes[j]*2*age)+sin(TAU*notes[j]*4.002*age)*0.17)*sin(minf(age*25,PI/2))*exp(-age*4.4)*0.048
		var reveal_age: float=t-reveal_start()
		if reveal_age>=0:
			var envelope: float=minf(reveal_age*35,1.0)*exp(-reveal_age*1.8)
			for tone: float in [523.2511,659.2551,783.9909]:
				wave+=(sin(TAU*tone*reveal_age)+0.14*sin(TAU*tone*2.001*reveal_age))*envelope*0.042
		wave*=1.0-smoothstep(duration()-0.20,duration(),t)
		bytes.encode_s16(i*2,int(clampf(wave,-1,1)*32767))
	var stream := AudioStreamWAV.new()
	stream.format=AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate=sample_rate
	stream.data=bytes
	sound_player=AudioStreamPlayer.new()
	sound_player.name="SummonScore"
	sound_player.stream=stream
	add_child(sound_player)
	sound_player.play()
