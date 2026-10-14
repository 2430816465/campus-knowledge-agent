extends SceneTree

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	root.size=Vector2i(540,960)
	var viewport := SubViewport.new()
	viewport.size=Vector2i(1080,1920)
	viewport.size_2d_override=Vector2i(540,960)
	viewport.size_2d_override_stretch=true
	viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	viewport.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled=false
	app._go(3)
	for i in range(30): await process_frame
	var before: String=JSON.stringify(app.state())
	var bounds: Rect2=app.summon_scene_rect()
	var center: Vector2=app.summon_platform_center()*2.0
	var output: String="res://evidence/summon-video-v10/"
	await RenderingServer.frame_post_draw
	viewport.get_texture().get_image().save_png(output+"summon-page-1080x1920.png")
	# Alpha zero hides every UI descendant without triggering container reflow.
	app.frame.modulate.a=0.0
	app.summon_ui_shade.modulate.a=0.0
	app.toast_label.modulate.a=0.0
	if is_instance_valid(app.overlay): app.overlay.modulate.a=0.0
	for i in range(4): await process_frame
	await RenderingServer.frame_post_draw
	var clean: Image=viewport.get_texture().get_image()
	clean.save_png(output+"summon-first-frame-1080x1920.png")
	var unchanged: bool=bounds.is_equal_approx(app.summon_scene_rect()) and before==JSON.stringify(app.state())
	var metadata: Dictionary={"source":"live SummonScreen, main.tscn page=3", "asset":"assets/summon-video/first.png", "width":clean.get_width(), "height":clean.get_height(), "logical_viewport":[540,960], "scene_rect_logical":[bounds.position.x,bounds.position.y,bounds.size.x,bounds.size.y], "platform_center_px":[center.x,center.y], "platform_center_uv":[center.x/1080.0,center.y/1920.0], "center_method":"visual estimate of source platform surface ellipse, source UV (0.5,0.729), tolerance +/-10 source pixels", "origin":"top-left", "ui_hidden_by":"frame and separate UI shade alpha; no scene transform or container reflow", "scene_and_save_unchanged":unchanged}
	var file := FileAccess.open(output+"first-frame-metadata.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(metadata,"\t"))
	file.close()
	app.frame.modulate.a=1.0
	app.summon_ui_shade.modulate.a=1.0
	for i in range(4): await process_frame
	await RenderingServer.frame_post_draw
	viewport.get_texture().get_image().save_png(output+"summon-ui-restored.png")
	print("SUMMON_FIRST_FRAME ",JSON.stringify(metadata))
	quit(0 if unchanged and clean.get_size()==Vector2i(1080,1920) else 1)
