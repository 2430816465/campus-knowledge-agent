extends SceneTree
var app: Control
var recording: bool=false
var busy_capture: bool=false
var clock_ms: int=0
var recordings: Array=[]
func _process(_delta: float) -> bool:
	if recording and not busy_capture and Time.get_ticks_msec()-clock_ms>=100:
		clock_ms=Time.get_ticks_msec(); busy_capture=true; record_frame.call_deferred()
	return false
func record_frame() -> void:
	await RenderingServer.frame_post_draw
	if recording:
		var out: String="res://video-production/output/screen-recording/frame-%04d.jpg" % recordings.size()
		root.get_texture().get_image().save_jpg(out,.88)
		recordings.append({"ms":Time.get_ticks_msec(),"file":out.get_file()})
	busy_capture=false
func _initialize() -> void: run.call_deferred()
func frames(n: int=5) -> void:
	for i: int in n: await process_frame
func capture(filename: String) -> void:
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://video-production/output/"+filename)
func run() -> void:
	root.size=Vector2i(540,960); root.position=Vector2i(-2000,40)
	app=load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true); root.add_child(app); app.set_process(false)
	app.audio.sound_enabled=false; await frames(); app._go(3); await frames()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://video-production/output/screen-recording"))
	recording=true; await create_timer(.4).timeout
	# This isolated visual fixture still commits through the production transaction.
	app.store.state.pity=89; app.store.state.resources.ticket=20
	SummonScreen.draw(app,10)
	var film: SummonMovie=app.get_meta(SummonScreen.ACTIVE_CINEMATIC)
	var deadline: int=Time.get_ticks_msec()+40000
	while film.player.stream_position<8.9 and Time.get_ticks_msec()<deadline:
		if film.backgrounded: film._set_backgrounded(false)
		await process_frame
	await capture("game-gate-quality.png")
	var position: float=film.player.stream_position
	while app.has_meta(SummonScreen.ACTIVE_CINEMATIC) and Time.get_ticks_msec()<deadline:
		if film.backgrounded: film._set_backgrounded(false)
		await process_frame
	await frames(8); await create_timer(.45).timeout
	if not is_instance_valid(app.modal_box):
		push_error("Capture timed out before results"); app.store.release(); quit(1); return
	var ui: SummonResults=app.modal_box.get_node("SummonResults")
	await capture("game-first-portrait.png")
	ui.show_cards(); await create_timer(.8).timeout
	await capture("game-ten-results.png")
	recording=false
	var record_file:=FileAccess.open("res://video-production/output/screen-recording/timing.json",FileAccess.WRITE)
	record_file.store_string(JSON.stringify(recordings)); record_file.close()
	ui.show_detail(0); await create_timer(.35).timeout
	await capture("game-card-detail.png")
	ui.show_cards(); root.content_scale_size=Vector2i(540,1200); root.size=Vector2i(540,1200); await frames(6); await create_timer(.8).timeout
	await capture("game-tall-results.png")
	root.content_scale_size=Vector2i(324,576); root.size=Vector2i(324,576); await frames(6); await create_timer(.8).timeout
	await capture("game-short-results.png")
	var f:=FileAccess.open("res://video-production/docs/native-playback.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"engine":Engine.get_version_info(),"driver":"OpenGL Compatibility","observedPosition":position,"duration":11,"naturalPortraitSequence":true,"viewportSizes":[[540,960],[540,1200],[324,576]]},"  ")); f.close()
	app._close_modal(); app.store.release(); app.queue_free(); await frames(); quit()
