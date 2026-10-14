extends SceneTree
## Visits every faction at four native window sizes and clicks real card controls.
var app: Control
var checks := 0
var failures: Array[String] = []
var observations: Array = []

func _initialize() -> void:
	_run.call_deferred()

func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures.append(message)
		push_error(message)

func settle() -> void:
	for index: int in 10: await process_frame

func click(control: Control) -> void:
	var center := control.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = center
	motion.global_position = center
	root.push_input(motion, true)
	for down: bool in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = center
		event.global_position = center
		event.button_index = MOUSE_BUTTON_LEFT
		event.button_mask = MOUSE_BUTTON_MASK_LEFT if down else 0
		event.pressed = down
		root.push_input(event, true)
	await settle()

func get_roster() -> Control:
	return app.body.get_node_or_null("FactionRoster")

func inspect(roster: Control, context: String) -> void:
	var page_rect: Rect2 = app.body_scroll.get_global_rect()
	check(page_rect.grow(1).encloses(roster.get_global_rect()), context + " roster fits the fixed page")
	check(not app.page_bar.visible, context + " has no page controls")
	check(app.body_scroll.scroll_horizontal == 0 and app.body_scroll.scroll_vertical == 0, context + " does not scroll")
	check(roster.get_node_or_null("RosterPages") == null, context + " has no roster pagination")
	for button: Button in roster.faction_buttons.values():
		check(page_rect.encloses(button.get_global_rect()), context + " faction tab fits " + button.text)
		check(button.size.y >= (24 if roster.size.y<440 else 32), context + " faction tab height " + button.text)
	var ids: Array[String] = []
	for item: Button in roster.cards:
		var id := str(item.get_meta("character_id"))
		ids.append(id)
		check(roster.board.get_global_rect().grow(0.1).encloses(item.get_global_rect()), context + " card fits " + id)
		check(item.size.x >= 44 and item.size.y >= 44, context + " card target at least 44 px " + id)
		check(item.visible and item.is_visible_in_tree(), context + " visible card " + id)
		check(str(GameData.character(id).faction) == roster.selected_faction, context + " card belongs to selected faction " + id)
		check(item.portrait != null, context + " portrait loaded " + id)
		check(item.rendered_name_width <= item.size.x - 7.9, context + " full name fits " + id)
		check(item.owned == app.state().owned.has(id), context + " ownership badge matches state " + id)
		check(item.in_team == app.state().team.has(id), context + " formation badge matches state " + id)
	var expected: Array[String] = []
	for hero: Dictionary in GameData.content("CHARACTERS"):
		if str(hero.faction) == roster.selected_faction: expected.append(str(hero.id))
	check(ids == expected, context + " every faction member present with no hidden filter")
	for action: Button in [roster.team_button, roster.synergy_button, roster.presets_button]:
		check(page_rect.grow(0.1).encloses(action.get_global_rect()), context + " action fits " + action.text)
	observations.append({"case": context, "faction": roster.selected_faction, "count": ids.size(), "columns": roster.columns, "page_rect": str(page_rect), "card_rect": str(roster.cards[0].get_global_rect())})

func _run() -> void:
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size = Vector2i.ZERO
	root.size = Vector2i(540, 960)
	app = load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test", true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled = false
	await settle()
	var original_owned: Dictionary = app.state().owned.duplicate(true)
	var original_resources: Dictionary = app.state().resources.duplicate(true)
	# Legacy filters must not make a faction appear incomplete on first entry.
	app.roster_query = "this is a stale search"
	app.rarity_filter = "五星"
	for dimensions: Vector2i in [Vector2i(540, 960), Vector2i(390, 844), Vector2i(360, 800), Vector2i(320, 844),Vector2i(360,640),Vector2i(320,568)]:
		root.size = dimensions
		app._go(1)
		await settle()
		var roster: Control = get_roster()
		check(is_instance_valid(roster), "integrated roster exists " + str(dimensions))
		if not is_instance_valid(roster): continue
		check(roster.factions.size() == 8, "all eight faction tabs " + str(dimensions))
		var visited: Dictionary = {}
		var factions: Array[String] = roster.factions.duplicate()
		for faction: String in factions:
			await click(roster.faction_buttons[faction])
			check(roster.selected_faction == faction and app.filter == faction, "real faction click selects " + faction)
			inspect(roster, str(dimensions) + " " + faction)
			for id: String in roster.current_ids: visited[id] = true
			var first_id: String = roster.current_ids[0]
			await click(roster.cards[0])
			check(app.selected_character == first_id, "real card click opens " + first_id)
			check(app.body.get_node_or_null("SingleScreenCharacter") != null, "character detail built for " + first_id)
			app._back_characters()
			await settle()
			roster = get_roster()
			check(is_instance_valid(roster) and roster.selected_faction == faction, "return preserves faction " + faction)
			check(roster.cards[0].selected, "return marks the last opened character " + first_id)
			for item: Button in roster.cards:
				check(item.selected == (str(item.get_meta("character_id")) == first_id), "only the last opened card is selected " + str(item.get_meta("character_id")))
		check(visited.size() == 50, "all 50 characters reachable through faction tabs " + str(dimensions))
		# Capture the densest faction in the real rendered app when requested.
		if DisplayServer.get_name() != "headless":
			roster.select_faction(factions[0])
			await settle()
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://evidence/roster-v06-%dx%d.png" % [dimensions.x, dimensions.y])
	check(app.state().owned == original_owned, "browsing and details do not mutate owned characters")
	check(app.state().resources == original_resources, "browsing and details do not charge resources")
	var output := FileAccess.open("res://evidence/roster-v06.json", FileAccess.WRITE)
	output.store_string(JSON.stringify({"checks": checks, "failures": failures, "observations": observations}, "  "))
	output.close()
	print("ROSTER V06: ", checks, " checks, ", failures.size(), " failures")
	app.queue_free()
	await settle()
	quit(0 if failures.is_empty() else 1)
