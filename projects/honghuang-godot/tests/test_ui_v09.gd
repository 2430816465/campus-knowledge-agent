extends SceneTree
## Native presentation regression. Isolated profile; viewing pages must never spend assets.
var checks:=0
var failures: Array[String]=[]
func _initialize()->void: _run.call_deferred()
func check(value: bool,message: String)->void:
	checks+=1
	if not value: failures.append(message)
func inspect(node: Node,bounds: Rect2,context: String)->void:
	if node is Control and not node.is_visible_in_tree(): return
	if node is Button: check(bounds.grow(1).encloses(node.get_global_rect()),context+" outside "+str(node.name))
	for child in node.get_children(): inspect(child,bounds,context)
func capture(app: Control,context: String)->void:
	for frame in range(20): await process_frame
	inspect(app.body,app.body_scroll.get_global_rect(),context)
	check(app.body_scroll.scroll_vertical==0 and app.body_scroll.scroll_horizontal==0,context+" scroll offset")
	for tab in app.nav.get_children():
		if tab.has_node("Art"): check(not tab.get_node("Art").halo,context+" bottom halo")
	if DisplayServer.get_name()!="headless" and "--visual-capture" in OS.get_cmdline_user_args():
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://evidence/ui-v09/"+context+".png")
func _run()->void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled=false
	var resources: String=JSON.stringify(app.state().resources)
	var history: String=JSON.stringify(app.state().get("drawHistory",[]))
	check(GameTheme.display_font() is FontFile,"native heading font")
	check(GameTheme.skin("button") is GameSilkStyle,"shared ribbon material")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/ui-v09"))
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(360,800),Vector2i(320,568)]:
		root.size=dimensions
		for page in [5,0,1,2,3,4,6,7,8]:
			app.set_meta("summon_v05_mode","permanent")
			app.system_view=""
			app._go(page)
			var context: String="%dx%d-%s" % [dimensions.x,dimensions.y,{5:"home",0:"estate",1:"roster",2:"adventure",3:"summon",4:"affairs",6:"guild",7:"ranking",8:"systems"}[page]]
			await capture(app,context)
			if page in [1,3,5]: check(not app.page_bar.visible,context+" unexpected pager")
			if page!=5:
				var shortcut: Node=app.header.find_child("HomeShortcut",true,false)
				check(shortcut!=null and shortcut.is_visible_in_tree(),context+" home shortcut")
			if page==1:
				app._open_character("nezha")
				await capture(app,"%dx%d-character" % [dimensions.x,dimensions.y])
				app.body.get_node("SingleScreenCharacter")._select_tab("装备")
				await capture(app,"%dx%d-equipment" % [dimensions.x,dimensions.y])
				var dossier: Control=app.body.get_node("SingleScreenCharacter")
				check(dossier.tab_buttons["装备"].get_theme_stylebox("disabled").role=="tab","character selection material survives layout")
				check(dossier.panel.get_parent().get_theme_stylebox("panel").role=="panel","character sheet material survives layout")
				app.set_meta("hero_tab","培养")
			if page==3:
				app.body.get_node("SummonScreen")._set_mode("exchange")
				await capture(app,"%dx%d-exchange" % [dimensions.x,dimensions.y])
		app._systems_page("005")
		await capture(app,"%dx%d-growth" % [dimensions.x,dimensions.y])
	# The central navigation action must go home before allowing forging there.
	app._go(1)
	for frame in range(8): await process_frame
	app.nav.get_child(2).pressed.emit()
	check(app.page==5,"central navigation returns home")
	check(resources==JSON.stringify(app.state().resources),"presentation spent resources")
	check(history==JSON.stringify(app.state().get("drawHistory",[])),"presentation drew characters")
	for failure in failures: print("FAIL ",failure)
	print("UI_V09 checks=",checks," failures=",failures.size())
	quit(0 if failures.is_empty() else 1)
