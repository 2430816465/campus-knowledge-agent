extends SceneTree
var app: Control
func _initialize() -> void: _run.call_deferred()
func shot(name: String) -> void:
	for n: int in 10: await process_frame
	await RenderingServer.frame_post_draw
	var image: Image=root.get_texture().get_image()
	print("CAPTURE ",name," ",image.save_png("res://evidence/"+name+".png"))
func _run() -> void:
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	for page: int in [5,0,1,2,3,4]:
		app._go(page)
		await shot("v05-page-%d" % page)
	if ResourceLoader.exists("res://scripts/community_screen.gd"):
		for page: int in [6,7]:
			app._go(page)
			await shot("v05-page-%d" % page)
	app._load_slot("demo:estate-complete")
	app._go(0)
	await shot("v05-estate-complete")
	app._go(3)
	app._summon(10)
	await shot("v05-summon-results")
	app._close_modal()
	app._open_character("nezha")
	await shot("v05-character")
	app.store.release()
	app.queue_free()
	await process_frame
	quit()
