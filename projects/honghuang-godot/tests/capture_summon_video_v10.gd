extends SceneTree
var app: Control
var recording: bool=false
var index: int=0
var last_time: int=0
var timeline: Array=[]
var out: String="res://evidence/summon-video-v10/recording"
func _initialize() -> void:
	auto_accept_quit=false
	run.call_deferred()
func _process(_delta: float) -> bool:
	if recording and Time.get_ticks_msec()-last_time>=65:
		last_time=Time.get_ticks_msec()
		capture.call_deferred()
	return false
func capture() -> void:
	await RenderingServer.frame_post_draw
	if not recording: return
	var img: Image=root.get_texture().get_image()
	img.save_jpg(out.path_join("frame-%04d.jpg" % index))
	var f: Variant=app.get_meta(SummonScreen.ACTIVE_CINEMATIC) if app.has_meta(SummonScreen.ACTIVE_CINEMATIC) else null
	timeline.append({"frame":index,"time":Time.get_ticks_msec(),"media":f.player.stream_position if is_instance_valid(f) else -1,"phase":f.phase if is_instance_valid(f) else -1})
	index+=1
func run() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	root.size=Vector2i(540,960)
	root.position=Vector2i(-2200,30)
	app=load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true)
	root.add_child(app); app.set_process(false); app.audio.sound_enabled=false
	for i: int in 8: await process_frame
	app._go(3)
	for i: int in 8: await process_frame
	recording=true
	await create_timer(0.6).timeout
	# Force only the isolated test save's pity for an actual guaranteed gold draw.
	app.store.state.pity=int(GameEconomy.gacha_config().fiveStarPity)-1
	SummonScreen.draw(app,1)
	await create_timer(11.0).timeout
	recording=false
	var f:=FileAccess.open(out.path_join("timeline.json"),FileAccess.WRITE)
	f.store_string(JSON.stringify(timeline)); f.close()
	root.get_texture().get_image().save_png("res://evidence/summon-video-v10/results.png")
	app._close_modal()
	app.store.release(); app.queue_free()
	await process_frame
	quit()
