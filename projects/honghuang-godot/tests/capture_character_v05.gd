extends SceneTree
var app: Control
func _initialize() -> void: capture.call_deferred()
func page() -> CharacterScreen: return app.body.find_child("SingleScreenCharacter",true,false)
func shot(filename: String) -> void:
	for n in range(8): await process_frame
	await RenderingServer.frame_post_draw
	var image: Image=root.get_texture().get_image()
	print("CHARACTER CAPTURE ",filename," ",image.save_png("res://evidence/"+filename+".png"))
func capture() -> void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	app._open_character("nezha")
	app.toast_time=0
	app.toast_label.visible=false
	for tab in CharacterScreen.TABS:
		page()._select_tab(str(tab))
		await shot("v05-character-"+{"培养":"cultivation","神通":"skills","灵宝":"treasure","装备":"equipment","仙人志":"lore"}[tab])
	page()._select_tab("神通")
	page()._branch_view("B")
	await shot("v05-character-branch-b")
	page()._select_tab("仙人志")
	page()._lore_view("身世")
	await shot("v05-character-biography")
	app._open_character("yangjian")
	page()._select_tab("培养")
	await shot("v05-character-unowned")
	app._open_character("nezha")
	root.size=Vector2i(360,800)
	page()._select_tab("培养")
	await shot("v05-character-narrow-cultivation")
	page()._select_tab("装备")
	await shot("v05-character-narrow-equipment")
	page()._select_tab("神通")
	page()._branch_view("神通")
	await shot("v05-character-narrow-skills")
	app.queue_free()
	await process_frame
	quit()
