extends SceneTree
## Real GPU/video playback and committed results in an isolated test save.
var app: Control
var failures: Array=[]
var checks: int=0
var samples: Array=[]
const OUTPUT="res://video-production/output/user-video"
func _initialize() -> void: run.call_deferred()
func frames(n: int=4) -> void:
	for i: int in n: await process_frame
func check(ok: bool,note: String) -> void:
	checks+=1
	if not ok: failures.append(note); push_error(note)
func wait_media(film: SummonMovie,target: float) -> bool:
	var deadline: int=Time.get_ticks_msec()+18000
	while is_instance_valid(film) and not film.done and film.player.stream_position<target and Time.get_ticks_msec()<deadline:
		if film.backgrounded: film._set_backgrounded(false)
		await process_frame
	return is_instance_valid(film) and not film.done and film.player.stream_position>=target
func snapshot(film: SummonMovie,name: String) -> Image:
	film._set_backgrounded(true); await frames(2); await RenderingServer.frame_post_draw
	var img: Image=root.get_texture().get_image()
	img.save_png(OUTPUT+"/"+name+".png")
	samples.append({"image":name+".png","rarity":film.rarity,"media":film.player.stream_position,"reveal":film.reveal_amount,"offset":[film.scene_layer.position.x,film.scene_layer.position.y],"scale":film.scene_layer.scale.x,"roll":film.scene_layer.rotation})
	return img
func run() -> void:
	root.size=Vector2i(1080,1920); root.position=Vector2i(-2400,40)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT))
	app=load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true)
	root.add_child(app); app.set_process(false); app.audio.sound_enabled=false
	check(SummonMovie.FIRST.get_size()==Vector2(768,1344),"actual provided video native dimensions")
	check(is_equal_approx(SummonMovie.DURATION,158.0/24.0),"actual provided video timing")
	await frames(); app._go(3); await frames()
	# The host process is disabled for ledger comparisons, so expire its boot toast here.
	app.toast_time=0; app.toast_label.visible=false
	check(GameEconomy.free_currency(),"free currency testing remains enabled")
	for q: String in ["blue","purple","gold"]:
		app.store.load_slot("demo:roster"); app.store.state.pity=0; app.store.state.fourStarPity=0
		app.store.state.resources.ticket=0
		var config: Dictionary=GameEconomy.gacha_config()
		var chance: float=0.95 if q=="blue" else float(config.fiveStarChance)+float(config.fourStarChance)*0.5 if q=="purple" else 0.001
		var result: Dictionary=app.store.transact("summon",{"count":1,"txid":"user-video-v16-"+q,"rng":func() -> float: return chance})
		check(result.ok,"actual zero-ticket transaction "+q)
		var saved: String=JSON.stringify(app.state())
		var film:=SummonMovie.new(); film.configure(result.data,false,false); app.add_child(film)
		check(film.rarity==q,"real result grade "+q)
		check(is_equal_approx(float(film.grade.get_shader_parameter("mythic_power")),1.0 if q=="gold" else 0.0),"burst reserved for divine "+q)
		check(app.summon_scene_rect().is_equal_approx(SummonMovie.scene_rect(app.size)),"unchanged scene transform "+q)
		check(film.scene_layer.scale.is_equal_approx(Vector2.ONE) and film.scene_layer.position.is_zero_approx(),"entrance framing unchanged "+q)
		if not await wait_media(film,4.3): check(false,"decode timeout "+q); film.dismiss_without_results(); break
		film._set_backgrounded(true); await frames(); await RenderingServer.frame_post_draw
		var neutral: PackedByteArray=root.get_texture().get_image().get_data()
		film.player.modulate.a=0.45
		await frames(); await RenderingServer.frame_post_draw
		check(root.get_texture().get_image().get_data()!=neutral,"video shader respects entrance opacity "+q)
		film.player.modulate.a=1.0
		await frames(); await RenderingServer.frame_post_draw
		film.grade.set_shader_parameter("mythic_power",0.0 if q=="gold" else 1.0)
		await frames(); await RenderingServer.frame_post_draw
		check(root.get_texture().get_image().get_data()==neutral,"gold cannot reveal before 70% "+q)
		film.grade.set_shader_parameter("mythic_power",1.0 if q=="gold" else 0.0)
		film._set_backgrounded(false)
		var moments: Array=[4.75,5.4,5.75,6.0,6.5] if q=="gold" else [5.75]
		for moment: float in moments:
			if not await wait_media(film,moment): check(false,"reveal timeout "+q); break
			var img: Image=await snapshot(film,"%s-%04d" % [q,roundi(moment*100)])
			# SceneTree's process_frame signal precedes node processing by one frame.
			check(absf(film.presentation_media_time-film.player.stream_position)<0.05 and is_equal_approx(float(film.grade.get_shader_parameter("media_phase")),film.presentation_media_time-SummonMovie.REVEAL_AT),"lights use actual media "+q+str(moment))
			if q=="gold" and is_equal_approx(moment,5.4):
				check(film.scene_layer.position.length()>5.0 and film.scene_layer.scale.x>1.07,"strong divine camera kick on actual media")
				var skip_origin: Vector2=film.skip.get_global_rect().position
				var position: float=film.presentation_media_time
				await create_timer(0.22).timeout; await frames(); await RenderingServer.frame_post_draw
				check(is_equal_approx(position,film.presentation_media_time) and img.get_data()==root.get_texture().get_image().get_data(),"paused film freezes original video, light and shake exactly")
				check(film.skip.get_global_rect().position.is_equal_approx(skip_origin),"skip is stable during paused impact")
				film.grade.set_shader_parameter("mythic_power",0.0); await frames(); await RenderingServer.frame_post_draw
				var prior: Image=root.get_texture().get_image(); prior.save_png(OUTPUT+"/gold-before-same-frame.png")
				check(img.get_data()!=prior.get_data(),"gold burst changes the actual rendered frame")
				check(img.get_pixel(30,100).is_equal_approx(prior.get_pixel(30,100)),"no gold filter across the outer sky")
				film.grade.set_shader_parameter("mythic_power",1.0)
			film._set_backgrounded(false)
		check(JSON.stringify(app.state())==saved,"visuals leave rewards and save intact "+q)
		check(film.scene_layer.position.is_zero_approx() and is_zero_approx(film.scene_layer.rotation),"shake decays to rest "+q)
		if q=="gold":
			film._set_backgrounded(true); root.size=Vector2i(720,1600)
			await frames(); await snapshot(film,"gold-tall")
			check(Rect2(Vector2.ZERO,film.size).encloses(film.skip.get_rect()),"tall screen skip visible")
			check(film.glyphs.get_parent()==film.scene_layer and film.skip.get_parent()==film and film.get_children().find(film.skip)>film.get_children().find(film.scene_layer),"skip is outside the shaken world and above gold motes")
			check(film.still.size.is_equal_approx(film.player.size),"still and video share tall crop")
			for viewport_size: Vector2i in [Vector2i(1080,1920),Vector2i(720,1600)]:
				root.size=viewport_size; await frames()
				var covered: bool=true
				var fixed_skip: Vector2=film.skip.get_global_rect().position
				for step: int in 120:
					film.presentation_media_time=5.03+float(step)*0.0122
					film._apply_gold_camera()
					var bounds: Rect2=SummonMovie.scene_rect(film.size)
					var transform: Transform2D=film.scene_layer.get_transform()
					var polygon:=PackedVector2Array([transform*bounds.position,transform*Vector2(bounds.end.x,bounds.position.y),transform*bounds.end,transform*Vector2(bounds.position.x,bounds.end.y)])
					for corner: Vector2 in [Vector2(1,1),Vector2(film.size.x-1,1),film.size-Vector2.ONE,Vector2(1,film.size.y-1)]:
						covered=covered and Geometry2D.is_point_in_polygon(corner,polygon)
				check(covered,"overscan covers viewport across entire impact "+str(viewport_size))
				check(film.skip.get_global_rect().position.is_equal_approx(fixed_skip),"shake never moves skip "+str(viewport_size))
			film.presentation_media_time=6.5; film._apply_gold_camera()
		film.dismiss_without_results(); await frames()
	app.store.release(); app.queue_free(); await frames()
	var f:=FileAccess.open("res://video-production/docs/user-video-native.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"date":"2026-10-08","checks":checks,"failures":failures,"renderer":RenderingServer.get_video_adapter_name(),"engine":Engine.get_version_info(),"samples":samples,"sizes":[[1080,1920],[720,1600]]},"  ")); f.close()
	print("USER VIDEO V16: ",checks," checks, ",failures.size()," failures")
	quit(0 if failures.is_empty() and samples.size()==8 else 1)
