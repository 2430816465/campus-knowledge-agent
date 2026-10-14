extends SceneTree
var app: Control
func _initialize() -> void: _run.call_deferred()
func shot(name_value: String) -> void:
	for n in range(10): await process_frame
	await RenderingServer.frame_post_draw
	var image: Image = root.get_texture().get_image()
	print("ESTATE CAPTURE ",name_value," ",image.save_png("res://evidence/"+name_value+".png"))
func screen() -> EstateScreen: return app.body.get_node("IndependentEstateScreen")
func _run() -> void:
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	app._go(0)
	app.body_scroll.vertical_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	app.body.size_flags_vertical=Control.SIZE_EXPAND_FILL
	await shot("v05-estate-refined-initial")
	screen()._set_mode("build")
	screen()._choose_type("farm")
	screen()._select_plot("p2")
	await shot("v05-estate-build-preview")
	screen()._confirm_preview()
	screen()._set_mode("edit")
	screen()._select_building("farm-1")
	screen()._select_plot("p3")
	await shot("v05-estate-move-preview")
	screen()._cancel_preview()
	screen()._set_mode("expand")
	await shot("v05-estate-expand-mode")
	app._load_slot("demo:estate-complete")
	app._go(0)
	await shot("v05-estate-refined-complete")
	screen()._visit_region(1)
	await shot("v05-estate-second-courtyard")
	screen().view.reset_camera()
	await shot("v05-estate-full-overview")
	app._load_slot("normal")
	app._go(0)
	root.size=Vector2i(360,800)
	app.toast_time=0
	app.toast_label.visible=false
	await shot("v05-estate-narrow")
	screen()._set_mode("build")
	screen()._choose_type("farm")
	await shot("v05-estate-narrow-build")
	screen()._select_plot("p3")
	await shot("v05-estate-narrow-preview")
	app.queue_free()
	await process_frame
	quit()
