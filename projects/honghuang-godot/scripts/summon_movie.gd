class_name SummonMovie
extends Control
## Only consumes a committed result. Never deducts, rolls, or awards.
signal completed(skipped: bool)
enum Phase {IDLE, REQUEST_RESULT, PREPARE_MEDIA, PLAYING, QUALITY_REVEAL, RESULTS, RETURN}
const FIRST = preload("res://assets/summon-remotion/first.png")
const LAST = preload("res://assets/summon-remotion/last.png")
const PORTAL = preload("res://assets/summon-remotion/portal.gdshader")
# User-provided MP4: 158 real frames / 24fps, retained at native 768x1344.
const DURATION: float = 158.0/24.0
const FRAME_STEP: float = 1.0/24.0
const REVEAL_AT: float = 4.65
const REVEAL_FULL: float = 5.28
const GOLD_IMPACT_AT: float = 5.28
var phase: Phase = Phase.IDLE
var clip: String = ""
var sound: bool = true
var simplified: bool = false
var done: bool = false
var backgrounded: bool = false
var player: VideoStreamPlayer
var scene_layer: Control
var still: TextureRect
var grade: ShaderMaterial
var glyphs: Control
var hero_layer: Control
var caption: Label
var status: Label
var skip: Button
var records: Array = []
var selected: Dictionary = {}
var rarity: String = "blue"
var elapsed: float = 0
var stall: float = 0
var last_position: float = -1
var ready_time: float = 0
var result_time: float = 0
var reveal_amount: float = 0
var presentation_media_time: float = 0
var quality_cued: bool = false
var audio_started: bool = false
var movie_visible: bool = false
var failure_reason: String = ""

static func quality(items: Array) -> String:
	var rank: int = 0
	for record: Dictionary in items:
		var value: String = str(GameData.character(str(record.get("id", ""))).get("rarity", "mortal"))
		rank = maxi(rank, {"mortal":0, "immortal":1, "divine":2}.get(value,0))
	return ["blue", "purple", "gold"][rank]
static func quality_color(value: String) -> Color:
	return {"blue":Color("56bbff"), "purple":Color("bf72ff"), "gold":Color("ffce58")}.get(value,Color.WHITE)
static func quality_name(value: String) -> String:
	return {"blue":"凡品", "purple":"仙品", "gold":"神品"}.get(value, "")
static func clip_for(_records: Array) -> String:
	return "res://assets/summon-remotion/neutral.ogv" if ResourceLoader.exists("res://assets/summon-remotion/neutral.ogv") else ""
static func scene_rect(view_size: Vector2) -> Rect2:
	var source: Vector2 = FIRST.get_size()
	var factor: float = maxf(view_size.x/source.x,view_size.y/source.y)
	return Rect2((view_size-source*factor)*0.5,source*factor)
func configure(items: Array,reduced: bool=false,with_sound: bool=true) -> void:
	records=items.duplicate(true); rarity=quality(records); clip=clip_for(records)
	sound=with_sound; simplified=reduced
	for record: Dictionary in records:
		if quality([record])==rarity:
			selected=record
			if not bool(record.get("duplicate",false)): break
func _ready() -> void:
	name="CompleteSummonMovie"; z_index=90
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter=Control.MOUSE_FILTER_STOP
	clip_contents=true
	phase=Phase.PREPARE_MEDIA
	grade=ShaderMaterial.new(); grade.shader=PORTAL
	grade.set_shader_parameter("rarity_color",quality_color(rarity))
	grade.set_shader_parameter("mythic_power",1.0 if rarity=="gold" else 0.0)
	# Only the world shakes. Video, painted light and motes share a single pivot.
	scene_layer=Control.new(); scene_layer.mouse_filter=Control.MOUSE_FILTER_IGNORE
	add_child(scene_layer)
	still=TextureRect.new(); still.texture=FIRST
	still.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	still.mouse_filter=Control.MOUSE_FILTER_IGNORE; still.material=grade
	scene_layer.add_child(still)
	player=VideoStreamPlayer.new(); player.expand=true
	# Video textures have no generated mip chain; never inherit a gallery's filter.
	player.texture_filter=CanvasItem.TEXTURE_FILTER_LINEAR
	player.mouse_filter=Control.MOUSE_FILTER_IGNORE
	player.volume_db=-80; player.material=grade; player.modulate.a=0
	scene_layer.add_child(player); player.finished.connect(_enter_portrait)
	glyphs=Control.new(); glyphs.mouse_filter=Control.MOUSE_FILTER_IGNORE
	glyphs.draw.connect(_draw_glyphs); scene_layer.add_child(glyphs)
	status=GameTheme.label("正在准备召唤演出…",17,Color("fff4d8"))
	status.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER; _readable(status); add_child(status)
	hero_layer=Control.new(); hero_layer.mouse_filter=Control.MOUSE_FILTER_IGNORE
	hero_layer.modulate.a=0; add_child(hero_layer)
	caption=GameTheme.label("",23,Color("fff4d8"))
	caption.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER; _readable(caption); add_child(caption)
	skip=GameTheme.button("跳过演出",_finish.bind(true)); skip.name="SkipSummon"
	skip.custom_minimum_size=Vector2(90,42); skip.add_theme_font_size_override("font_size",16)
	add_child(skip); resized.connect(_layout); _layout()
	get_window().focus_exited.connect(_set_backgrounded.bind(true))
	get_window().focus_entered.connect(_set_backgrounded.bind(false))
	modulate.a=0
	if records.is_empty(): fail_media("没有已提交的结果"); return
	if simplified: _enter_portrait(); return
	if OS.has_feature("web"): fail_media("当前网页构建未配置视频适配器"); return
	if clip.is_empty() or not ResourceLoader.exists(clip): fail_media("视频资源不可用"); return
	player.stream=load(clip); player.play()
func _readable(label: Label) -> void:
	label.add_theme_color_override("font_outline_color",Color("102c3c"))
	label.add_theme_constant_override("outline_size",6)
	label.add_theme_color_override("font_shadow_color",Color("081923"))
	label.add_theme_constant_override("shadow_offset_y",2)
func _layout() -> void:
	var bounds: Rect2=scene_rect(size)
	scene_layer.size=size; scene_layer.pivot_offset=size*0.5
	still.position=bounds.position; still.size=bounds.size
	player.position=bounds.position; player.size=bounds.size
	hero_layer.position=Vector2(size.x*0.09,size.y*0.18)
	hero_layer.size=Vector2(size.x*0.82,size.y*0.58)
	status.position=Vector2(8,size.y*0.87); status.size=Vector2(size.x-16,34)
	caption.position=Vector2(8,size.y*0.79); caption.size=Vector2(size.x-16,70)
	skip.position=Vector2(size.x-106,20); skip.size=Vector2(90,42)
	_apply_gold_camera()
func _process(delta: float) -> void:
	if done or backgrounded: return
	var dt: float=minf(delta,0.1)
	elapsed+=dt
	modulate.a=1 if simplified else minf(1,elapsed/0.18)
	if phase==Phase.RESULTS:
		result_time+=dt
		hero_layer.modulate.a=1 if simplified else clampf(result_time/0.35,0,1)
		# No baked or embedded portrait stage. The result presenter owns the sequence.
		if result_time>=0.05: _finish(false)
		return
	var position: float=player.stream_position
	if phase==Phase.PREPARE_MEDIA:
		if player.is_playing() and position>0 and player.get_video_texture()!=null and player.get_video_texture().get_width()>0:
			phase=Phase.PLAYING; ready_time=elapsed; status.text=""; movie_visible=true
			_start_audio(position)
		elif elapsed>5: fail_media("视频未能开始播放"); return
	if phase in [Phase.PLAYING,Phase.QUALITY_REVEAL]:
		player.modulate.a=clampf((elapsed-ready_time)/0.12,0,1)
		if position<=last_position+0.0001: stall+=dt
		else: stall=0
		last_position=position
		if stall>3: fail_media("视频播放中断"); return
		_apply_media_position(position)
		var audio: Variant=get_parent().get("audio")
		if sound and is_instance_valid(audio) and audio.has_method("sync_summon_film"): audio.sync_summon_film(position)
		if position>=DURATION-FRAME_STEP: _enter_portrait()
	glyphs.queue_redraw()
func _apply_media_position(position: float) -> void:
	presentation_media_time=position
	_apply_gold_camera()
	if position<REVEAL_AT: return
	phase=Phase.QUALITY_REVEAL
	reveal_amount=smoothstep(REVEAL_AT,REVEAL_FULL,position)
	grade.set_shader_parameter("reveal",reveal_amount)
	grade.set_shader_parameter("media_phase",position-REVEAL_AT)
	caption.text="" # Quality is the opened gate's light, never a caption in the film.
	if not quality_cued and position>=REVEAL_FULL:
		quality_cued=true
		var audio: Variant=get_parent().get("audio")
		if sound and is_instance_valid(audio): audio.cue("summon_"+rarity)
func _apply_gold_camera() -> void:
	if scene_layer==null: return
	if rarity!="gold" or simplified:
		scene_layer.position=Vector2.ZERO; scene_layer.scale=Vector2.ONE; scene_layer.rotation=0
		return
	var t: float=presentation_media_time
	# Overscan is ready before the hit and returns smoothly after all shaking stops.
	var framing: float=smoothstep(GOLD_IMPACT_AT-0.25,GOLD_IMPACT_AT,t)*(1.0-smoothstep(6.14,6.48,t))
	scene_layer.scale=Vector2.ONE*(1.0+0.08*framing)
	var strength: float=smoothstep(GOLD_IMPACT_AT,GOLD_IMPACT_AT+0.06,t)*pow(1.0-smoothstep(GOLD_IMPACT_AT+0.11,6.14,t),2)
	var impact_time: float=maxf(0,t-GOLD_IMPACT_AT)
	var width: float=scene_rect(size).size.x
	# Two continuous frequencies give a sharp kick without random frame-to-frame noise.
	scene_layer.position=Vector2(
		sin(impact_time*79.0+0.35)*0.021+sin(impact_time*131.0+1.10)*0.009,
		sin(impact_time*88.0+1.00)*0.0125+sin(impact_time*142.0-0.80)*0.007
	)*width*strength
	scene_layer.rotation=sin(impact_time*94.0+0.6)*0.003*strength
func _draw_glyphs() -> void:
	if reveal_amount<=0 or simplified: return
	var bounds: Rect2=scene_rect(size)
	# Match the provided film's gate. No second camera push or invented diamond icons.
	var camera_scale: float=1.0
	var gate_uv:=Vector2(386.0/768.0,516.0/1344.0)
	var center: Vector2=bounds.position+bounds.size*gate_uv
	if rarity=="gold":
		_draw_gold_motes(bounds,center,camera_scale)
		return
func _draw_gold_motes(bounds: Rect2,center: Vector2,camera_scale: float) -> void:
	var time: float=maxf(0,presentation_media_time-REVEAL_AT)
	var bloom: float=smoothstep(0.56,0.72,time)*(1.0-smoothstep(0.98,1.47,time))
	var arrived: float=smoothstep(0.64,1.0,time)
	var scale: float=bounds.size.x/768.0*camera_scale
	# Deterministic trajectories never use gameplay RNG or advance while media is paused.
	for i: int in 24:
		var seed: float=fmod(float(i)*0.61803398875,1.0)
		var angle: float=TAU*seed-PI/2
		var travel: float=1.0-exp(-maxf(0,time-0.67)*1.8)
		var radius: float=(56.0+fmod(float(i)*97.0,255.0))*travel
		var drift: Vector2=Vector2(sin(time*0.6+float(i))*9.0,-maxf(0,time-1.3)*(15.0+seed*14.0))
		var p: Vector2=center+(Vector2(cos(angle),sin(angle))*radius+drift)*scale
		var life: float=(0.40+0.60*pow(sin(float(i)*1.7+time*1.3),2))*arrived*reveal_amount
		var bright: Color=Color("fff6d3"); bright.a=life*(0.20+0.22*bloom)
		var haze: Color=Color("ffe5a2"); haze.a=life*0.035
		var mote_size: float=(0.8+seed*1.6)*scale
		glyphs.draw_circle(p,mote_size*6.0,haze*Color(1,1,1,0.35))
		glyphs.draw_circle(p,mote_size*3.5,haze)
		glyphs.draw_circle(p,mote_size,bright)
func _start_audio(position: float) -> void:
	if audio_started or not sound: return
	audio_started=true
	var audio: Variant=get_parent().get("audio")
	if is_instance_valid(audio) and audio.has_method("start_summon_film"): audio.start_summon_film(position)
func _enter_portrait() -> void:
	if done or phase==Phase.RESULTS: return
	phase=Phase.RESULTS; player.paused=true; player.visible=false
	still.texture=LAST; reveal_amount=1; grade.set_shader_parameter("reveal",1.0)
	presentation_media_time=DURATION-FRAME_STEP
	_apply_gold_camera()
	grade.set_shader_parameter("media_phase",DURATION-FRAME_STEP-REVEAL_AT)
	status.text=""; caption.text=""
	glyphs.queue_redraw()
func fail_media(reason: String) -> void:
	failure_reason=reason; _enter_portrait()
func _set_backgrounded(value: bool) -> void:
	backgrounded=value
	if player!=null: player.paused=value or phase==Phase.RESULTS
	var audio: Variant=get_parent().get("audio")
	if is_instance_valid(audio) and audio.has_method("pause_summon_film"): audio.pause_summon_film(value)
func _notification(what: int) -> void:
	if not is_node_ready(): return
	if what==NOTIFICATION_APPLICATION_PAUSED: _set_backgrounded(true)
	elif what==NOTIFICATION_APPLICATION_RESUMED: _set_backgrounded(false)
func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled(); _finish(true)
func _restore_host() -> void:
	var host: Node=get_parent()
	if not is_instance_valid(host): return
	if host.get("frame") is Control:
		host.frame.modulate.a=1; host.frame.z_index=0
		if host.get("summon_ui_shade") is Control: host.summon_ui_shade.modulate.a=1; host.summon_ui_shade.z_index=0
	var audio: Variant=host.get("audio")
	if is_instance_valid(audio) and audio.has_method("stop_summon_film"): audio.stop_summon_film()
func _finish(skipped: bool) -> void:
	if done: return
	done=true; phase=Phase.RETURN; _restore_host()
	if player!=null: player.stop()
	completed.emit(skipped or not failure_reason.is_empty() or simplified); queue_free()
func dismiss_without_results() -> void:
	done=true; _restore_host()
	if player!=null: player.stop()
	queue_free()
func _exit_tree() -> void:
	if not done:
		done=true; _restore_host(); completed.emit(true)
