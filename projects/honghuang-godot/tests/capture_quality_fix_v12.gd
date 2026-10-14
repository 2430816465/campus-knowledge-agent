extends SceneTree
## Read actual decoder texture and framebuffer throughout the full clip.
var app: Control
func _initialize() -> void: run.call_deferred()
func frames(n: int=6) -> void:
	for i: int in n: await process_frame
func run() -> void:
	root.size=Vector2i(540,960); root.position=Vector2i(-2000,40)
	app=load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true); root.add_child(app); app.set_process(false)
	app.audio.sound_enabled=false; await frames(); app._go(3); await frames()
	app.store.state.pity=89; app.store.state.resources.ticket=20; SummonScreen.draw(app,10)
	var movie: SummonMovie=app.get_meta(SummonScreen.ACTIVE_CINEMATIC)
	var samples: Array=[]; var next_sample: float=.20
	var deadline: int=Time.get_ticks_msec()+40000
	var directory: String="res://video-production/output/quality-fix"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
	while is_instance_valid(movie) and not movie.done and Time.get_ticks_msec()<deadline:
		await RenderingServer.frame_post_draw
		if not is_instance_valid(movie) or movie.done: break
		# Capture is an isolated test window; another app taking focus must not
		# leave the test waiting for user input. Production pause behavior is intact.
		if movie.backgrounded: movie._set_backgrounded(false)
		if movie.player.stream_position>=next_sample and movie.phase in [SummonMovie.Phase.PLAYING,SummonMovie.Phase.QUALITY_REVEAL]:
			var position: float=movie.player.stream_position
			var image: Image=movie.player.get_video_texture().get_image()
			var file: String="native-%03d.png" % samples.size()
			image.save_png(directory+"/"+file)
			if samples.is_empty() or (position>1.9 and position<2.6) or (position>8.7 and position<9.3):
				root.get_texture().get_image().save_png(directory+"/screen-%03d.png" % samples.size())
			samples.append({"position":position,"width":image.get_width(),"height":image.get_height(),"file":file})
			next_sample+=1.0
	await frames(10)
	if not is_instance_valid(app.modal_box):
		push_error("Timed out before natural result transition"); app.store.release(); quit(1); return
	var ui: SummonResults=app.modal_box.get_node("SummonResults")
	var natural: bool=ui.view==SummonResults.View.PORTRAIT and ui.sequential
	ui.show_cards(); await create_timer(.8).timeout; await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(directory+"/results.png")
	var f:=FileAccess.open("res://video-production/docs/quality-native.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"engine":Engine.get_version_info(),"samples":samples,"naturalPortraitSequence":natural,"runtimeDimensions":[1080,1920]},"  ")); f.close()
	app._close_modal(); app.store.release(); app.queue_free(); await frames()
	print("NATIVE QUALITY: ",samples.size()," actual decoder textures; natural portraits: ",natural)
	quit(0 if natural and samples.size()>=10 else 1)
