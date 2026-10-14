extends SceneTree
var app: Control
func _initialize() -> void:
	capture.call_deferred()
func shot(name: String) -> void:
	app.toast_time=0
	app.toast_label.hide()
	for frame: int in 12: await process_frame
	await RenderingServer.frame_post_draw
	var image: Image=root.get_texture().get_image()
	print("NATIVE_UI_CAPTURE ",name," ",image.get_size()," error=",image.save_png("res://docs/"+name+".png"))
func capture() -> void:
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	await shot("ui-estate-polished")
	app._load_slot("demo:roster")
	app._go(1)
	await shot("ui-roster-polished")
	app._open_character("yangjian")
	await shot("ui-character-polished")
	app._go(3)
	await shot("ui-summon-polished")
	app._go(4)
	app.subpage="任务"
	app._render()
	await shot("ui-affairs-polished")
	app._start_trial("break")
	await shot("ui-battle-polished")
	app._leave_battle()
	app._load_slot("normal")
	app._mock_menu()
	await shot("ui-mock-login-polished")
	app.queue_free()
	await process_frame
	quit()
