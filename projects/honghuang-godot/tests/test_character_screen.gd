extends SceneTree
var app: Control
var checks := 0
var failures: Array[String] = []
func _initialize() -> void: _run.call_deferred()
func check(value: bool,message: String) -> void:
	checks+=1
	if not value:
		failures.append(message)
		if failures.size()<=12: push_error(message)
func settle() -> void:
	for n in range(4): await process_frame
func visible_buttons(node: Node) -> Array[Button]:
	var result: Array[Button]=[]
	if node is Button and node.is_visible_in_tree(): result.append(node)
	for child in node.get_children(): result.append_array(visible_buttons(child))
	return result
func screen() -> CharacterScreen:
	return app.body.find_child("SingleScreenCharacter",true,false)
func find_button(node: Node,text: String) -> Button:
	for b in visible_buttons(node):
		if b.text==GameNames.text(text): return b
	return null
func click(button: Button) -> void:
	var point := button.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position=point
	motion.global_position=point
	root.push_input(motion,true)
	for held in [true,false]:
		var event := InputEventMouseButton.new()
		event.position=point
		event.global_position=point
		event.button_index=MOUSE_BUTTON_LEFT
		event.button_mask=MOUSE_BUTTON_MASK_LEFT if held else 0
		event.pressed=held
		root.push_input(event,true)
	await settle()
func _run() -> void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await settle()
	app.set_process(false)
	app.audio.sound_enabled=false
	app.body_scroll.vertical_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	app.body.size_flags_vertical=Control.SIZE_EXPAND_FILL
	for dimensions in [Vector2i(540,960),Vector2i(360,800),Vector2i(320,568)]:
		root.size=dimensions
		await settle()
		for hero: Dictionary in GameData.content("CHARACTERS"):
			var before := JSON.stringify(app.state())
			app._open_character(str(hero.id))
			await settle()
			var page := screen()
			check(page!=null,"native character page exists "+str(hero.id))
			for tab in CharacterScreen.TABS:
				page._select_tab(str(tab))
				await settle()
				var rect: Rect2=app.body_scroll.get_global_rect()
				var label := "%s/%s/%d" % [hero.id,tab,dimensions.x]
				check(page.get_combined_minimum_size().y<=580,label+" minimum fits smallest page")
				check(rect.grow(1).encloses(page.get_global_rect()),label+" actual dossier fits available viewport")
				check(not app.page_bar.visible,label+" all sections fit without a page bar")
				for button in visible_buttons(page):
					check(rect.grow(1).encloses(button.get_global_rect()),label+" visible action fits: "+button.text)
				if tab=="神通":
					for branch in ["A","B"]:
						page._branch_view(branch)
						await settle()
						check(rect.grow(1).encloses(page.get_global_rect()),label+" branch "+branch+" fits")
				if tab=="仙人志":
					page._lore_view("身世")
					await settle()
					check(rect.grow(1).encloses(page.get_global_rect()),label+" biography fits")
			check(JSON.stringify(app.state())==before,"presentation tabs preserve real assets "+str(hero.id))
	var hero_id := str(app.state().owned.keys()[0])
	root.size=Vector2i(540,960)
	app._open_character(hero_id)
	await settle()
	screen()._select_tab("培养")
	await settle()
	var before_character: Dictionary=app.state().owned[hero_id].duplicate(true)
	var before_wallet: Dictionary=app.state().resources.duplicate(true)
	var cost := GameEconomy.upgrade_cost(int(before_character.level))
	var train := find_button(screen(),"提升修为")
	check(train!=null and not train.disabled,"owned character exposes cultivation action")
	if train!=null:
		await click(train)
		check(app.state().owned[hero_id].level==before_character.level+1,"visible cultivation button performs one real upgrade")
		for key in cost: check(app.state().resources[key]==before_wallet[key]-cost[key],"cultivation deducts exact "+str(key))
	var before_tabs := JSON.stringify(app.state())
	screen()._select_tab("装备")
	await settle()
	check(screen().panel.find_children("*","Button",true,false).size()>=8,"five native slot choices and equipment actions remain accessible")
	screen()._select_tab("神通")
	screen()._branch_view("B")
	await settle()
	if int(app.state().owned[hero_id].level)<3:
		check(find_button(screen(),"修为3级解锁").disabled,"locked branch cannot be committed")
	check(JSON.stringify(app.state())==before_tabs,"equipment and branch previews consume no resources or RNG")
	app.queue_free()
	await process_frame
	var file := FileAccess.open("res://evidence/character-v05-layout-checks.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks":checks,"failures":failures,"verification":"Real native rectangles and viewport-routed cultivation input at 540x960, unscaled 360x800 and 320x568; every catalog character and five tabs remain on one page."},"  "))
	file.close()
	print("CHARACTER SCREEN CHECKS: ",checks," failures: ",failures.size())
	quit(0 if failures.is_empty() else 1)
