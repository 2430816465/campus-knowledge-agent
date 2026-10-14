extends SceneTree
## Actual runtime capture; no re-rendered video or altered animation timer.
var app: Control
var recording: bool=false
var capturing: bool=false
var last_tick: int=0
var timeline: Array=[]
const OUTPUT="res://.runtime/user-video-recording"
func _initialize() -> void: run.call_deferred()
func _process(_delta: float) -> bool:
	if recording and not capturing and Time.get_ticks_msec()-last_tick>=33:
		capturing=true; capture.call_deferred()
	return false
func capture() -> void:
	await RenderingServer.frame_post_draw
	if recording:
		var tick: int=Time.get_ticks_msec(); last_tick=tick
		root.get_texture().get_image().save_jpg(OUTPUT+"/frame-%04d.jpg" % timeline.size(),0.99)
		var film: SummonMovie=app.get_meta(SummonScreen.ACTIVE_CINEMATIC) if app.has_meta(SummonScreen.ACTIVE_CINEMATIC) else null
		timeline.append({"time":tick,"media":film.presentation_media_time if is_instance_valid(film) else -1,"phase":film.phase if is_instance_valid(film) else -1,"shake":[film.scene_layer.position.x,film.scene_layer.position.y] if is_instance_valid(film) else [0,0],"overscan":film.scene_layer.scale.x if is_instance_valid(film) else 1})
	capturing=false
func run() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT))
	root.size=Vector2i(720,1280); root.position=Vector2i(-2400,40)
	root.grab_focus()
	app=load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true)
	root.add_child(app); app.set_process(false); app.audio.sound_enabled=false
	for i: int in 10: await process_frame
	app._go(3)
	app.toast_time=0; app.toast_label.visible=false
	# Only the isolated recording save guarantees gold via the real pity rule.
	app.store.state.pity=int(GameEconomy.gacha_config().fiveStarPity)-1
	recording=true; await create_timer(0.6).timeout
	SummonScreen.draw(app,1)
	var film: SummonMovie=app.get_meta(SummonScreen.ACTIVE_CINEMATIC,null)
	if film==null or film.rarity!="gold": push_error("Expected committed divine result"); quit(1); return
	var deadline: int=Time.get_ticks_msec()+18000
	while app.has_meta(SummonScreen.ACTIVE_CINEMATIC) and Time.get_ticks_msec()<deadline:
		if film.backgrounded: film._set_backgrounded(false)
		await process_frame
	root.grab_focus()
	await create_timer(1.0).timeout
	recording=false
	while capturing: await process_frame
	var f:=FileAccess.open(OUTPUT+"/timeline.json",FileAccess.WRITE)
	f.store_string(JSON.stringify(timeline)); f.close()
	app._close_modal(); app.store.release(); app.queue_free(); await process_frame
	print("USER VIDEO RECORDING: ",timeline.size()," frames")
	for i: int in 6: await process_frame
	quit(0 if timeline.size()>40 else 1)
