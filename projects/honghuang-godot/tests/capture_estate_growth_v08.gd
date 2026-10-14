extends SceneTree
## Actual shell/layout and native callback checks in the isolated ui_test save.
var app: Control
var failures: Array[String] = []
var observations: Array = []
var checks := 0
func _initialize() -> void: _run.call_deferred()
func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok: failures.append(message); push_error(message)
func settle() -> void:
	for frame: int in 20: await process_frame
func _button(root_node: Node, text: String) -> Button:
	for node: Node in root_node.find_children("*","Button",true,false):
		if node.text==text and node.is_visible_in_tree(): return node
	return null
func inspect(screen: EstateScreen, context: String) -> void:
	var area: Rect2=app.body_scroll.get_global_rect()
	check(not app.page_bar.visible and app.page_pager.pages.size()<=1,context+" estate split by pager")
	check(app.body_scroll.scroll_vertical==0 and app.body_scroll.scroll_horizontal==0,context+" requires scrolling")
	check(screen.view.is_visible_in_tree(),context+" map hidden")
	check(screen.view.size.y>=99,context+" map too short")
	check(area.grow(1).encloses(screen.view.get_global_rect()),context+" map outside body")
	check(screen.get_combined_minimum_size().y<=area.size.y+1,context+" minimum exceeds body")
	for node: Node in screen.find_children("*","Button",true,false):
		if not node.is_visible_in_tree(): continue
		check(area.grow(1).encloses(node.get_global_rect()),context+" button outside body: "+node.text+" "+str(node.get_global_rect()))
		check(node.get_parent().get_global_rect().grow(1).encloses(node.get_global_rect()),context+" button outside parent: "+node.text)
		var width: float=node.get_theme_font("font").get_string_size(node.text,HORIZONTAL_ALIGNMENT_LEFT,-1,node.get_theme_font_size("font_size")).x
		var style: StyleBox=node.get_theme_stylebox("disabled" if node.disabled else "normal")
		check(width+style.get_minimum_size().x<=node.size.x+1,context+" button text clipped: "+node.text)
	observations.append({"case":context,"body":str(area),"minimum":screen.get_combined_minimum_size().y,"map":str(screen.view.get_global_rect()),"pages":app.page_pager.pages.size()})
func capture(path: String) -> void:
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(path)
func _run() -> void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled=false
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/estate-v08"))
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(320,568)]:
		root.size=dimensions
		await settle()
		for grown: bool in [false,true]:
			var fixture: Dictionary=GameEconomy.create_state(1800014400000)
			if grown:
				fixture.progression.monument.level=2
				fixture.progression.grotto.regions={"mountain":2,"river":1,"stars":3}
				fixture.progression.grotto.level=6
			app.store.state=fixture
			app._go(0)
			app.toast_time=0
			app.toast_label.hide()
			await settle()
			var screen: EstateScreen=app.body.find_child("IndependentEstateScreen",true,false)
			var before: String=JSON.stringify(app.state())
			for mode: String in ["inspect","build","expand","edit"]:
				if mode!="inspect": screen.action_buttons[mode].pressed.emit()
				await settle()
				check(screen.mode==mode,"native action callback selected "+mode)
				var context: String="%dx%d-%s-%s" % [dimensions.x,dimensions.y,"growth-fixture" if grown else "new-save",mode]
				inspect(screen,context)
				await capture("res://evidence/estate-v08/"+context+".png")
				if mode=="inspect": await capture("res://evidence/estate-v08/%dx%d-%s.png" % [dimensions.x,dimensions.y,"growth-fixture" if grown else "new-save"])
			check(JSON.stringify(app.state())==before,"mode/preview changes mutated save")
			var zoom_before: float=screen.view.zoom_factor
			_button(screen,"−").pressed.emit()
			check(screen.view.zoom_factor<zoom_before,"native zoom callback disconnected")
			_button(screen,"全景").pressed.emit()
			screen.action_buttons.build.pressed.emit()
			await settle()
			_button(screen,"选择落点").pressed.emit()
			screen.view.plot_selected.emit("p2")
			await settle()
			check(screen.pending.get("action")=="build","native plot callback failed")
			inspect(screen,"%dx%d-build-confirm" % [dimensions.x,dimensions.y])
			await capture("res://evidence/estate-v08/%dx%d-build-confirm.png" % [dimensions.x,dimensions.y])
			_button(screen,"取消").pressed.emit()
			await settle()
			check(screen.pending.is_empty() and screen.view._ghost==null,"cancel callback failed")
			check(JSON.stringify(app.state())==before,"cancelled preview charged resources")
	var report:=FileAccess.open("res://evidence/estate-v08/layout-report.json",FileAccess.WRITE)
	report.store_string(JSON.stringify({"checks":checks,"failures":failures,"observations":observations},"  "))
	report.close()
	app.store.release()
	app.queue_free()
	await settle()
	print("ESTATE V08 LAYOUT: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
