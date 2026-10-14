extends SceneTree
## Native GPU captures, using an isolated profile and no summon transactions.
var app: Control
var captures: Array = []
var resource_checks: Array = []
var home_stat_checks: Array = []
var failures: Array[String] = []
const OUTPUT := "res://evidence/ui-v06/"

func _initialize() -> void:
	_run.call_deferred()

func settle() -> void:
	for frame_index: int in 14: await process_frame

func shot(name: String) -> void:
	await settle()
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var path := OUTPUT + name + ".png"
	var status := image.save_png(path)
	if status != OK: failures.append("Could not save " + path)
	var controls: Array = []
	_collect_controls(app.body, controls)
	captures.append({"name": name, "path": path, "dimensions": [image.get_width(), image.get_height()], "body": str(app.body_scroll.get_global_rect()), "page_controls_visible": app.page_bar.visible, "scroll": [app.body_scroll.scroll_horizontal, app.body_scroll.scroll_vertical], "controls": controls})
	print("CAPTURE ", name, " ", status)

func _collect_controls(node: Node, result: Array) -> void:
	if node is Control and not node.is_visible_in_tree(): return
	if node is Button:
		result.append({"type": "button", "name": str(node.name), "text": node.text, "rect": str(node.get_global_rect())})
	elif node is Label:
		result.append({"type": "label", "text": node.text, "rect": str(node.get_global_rect()), "font_size": node.get_theme_font_size("font_size"), "visible_lines": node.get_visible_line_count(), "lines": node.get_line_count()})
	for child: Node in node.get_children(): _collect_controls(child, result)

func inspect_resources(context: String) -> void:
	for key: String in app.resource_labels:
		var label: Label = app.resource_labels[key]
		var font: Font = label.get_theme_font("font")
		var font_size := label.get_theme_font_size("font_size")
		var widest := 0.0
		for line: String in label.text.split("\n"):
			widest = maxf(widest, font.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x)
		var fits := widest <= label.size.x + 0.1 and label.get_visible_line_count() == label.get_line_count()
		var exact := label.tooltip_text == "%s %d" % [app.RESOURCE_NAMES[key], app.state().resources[key]]
		resource_checks.append({"case": context, "resource": key, "shown": label.text, "tooltip": label.tooltip_text, "width": label.size.x, "text_width": widest, "fits": fits, "exact_tooltip": exact})
		if not fits: failures.append(context + " header clips " + key)
		if not exact: failures.append(context + " header tooltip omits exact " + key)

func inspect_home_stats(context: String) -> void:
	var home: Node = app.body.find_child("CultivationHome", true, false)
	if home == null:
		failures.append(context + " home root missing")
		return
	var found: Array[String] = []
	for node: Node in home.find_children("*", "Label", true, false):
		var label: Label = node as Label
		for stat_name: String in ["生命", "攻击", "防御", "速度"]:
			if not label.text.begins_with(stat_name + " "): continue
			found.append(stat_name)
			var font: Font = label.get_theme_font("font")
			var font_size := label.get_theme_font_size("font_size")
			var text_width := font.get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
			var fits := text_width <= label.size.x + 0.1 and label.get_visible_line_count() == label.get_line_count() and label.is_visible_in_tree()
			home_stat_checks.append({"case": context, "stat": stat_name, "shown": label.text, "width": label.size.x, "text_width": text_width, "font_size": font_size, "fits": fits})
			if not fits: failures.append(context + " home clips " + stat_name)
	if found.size() != 4:
		failures.append(context + " expected four home stat labels, got " + str(found.size()))

func _run() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("capture_v06.gd requires native GPU rendering")
		quit(2)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT))
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size = Vector2i.ZERO
	root.size = Vector2i(540, 960)
	app = load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test", true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled = false
	await settle()
	var resources_before: Dictionary = app.state().resources.duplicate(true)
	var summon_before: Dictionary = app.state().summon.duplicate(true) if app.state().has("summon") else {}
	for dimensions: Vector2i in [Vector2i(540, 960), Vector2i(360, 800), Vector2i(320, 844)]:
		root.size = dimensions
		var prefix := "%dx%d-" % [dimensions.x, dimensions.y]
		for entry: Array in [[5, "home"], [1, "roster"], [3, "summon"], [0, "estate"], [6, "guild"], [7, "ranking"]]:
			app._go(int(entry[0]))
			await shot(prefix + str(entry[1]))
			if int(entry[0]) == 5: inspect_home_stats(prefix + "home")
			if int(entry[0]) == 1: inspect_resources(prefix + "normal")
		for tab: String in ["培养", "装备"]:
			app.set_meta("hero_tab", tab)
			app._open_character("nezha")
			await shot(prefix + ("character-cultivation" if tab == "培养" else "character-equipment"))
	# An isolated presentation probe covers large balances without any transaction.
	app.state().resources.stone = 99999999
	app.state().resources.xp = 123456789
	app.state().resources.material = 99999
	app.state().resources.herb = 9999999
	app.state().resources.ticket = 999999
	app.state().resources.fate = 999999999
	app._go(1)
	await shot("320x844-header-large-values")
	inspect_resources("320x844-large-values")
	app.state().resources = resources_before
	if app.state().has("summon") and app.state().summon != summon_before:
		failures.append("Capture unexpectedly changed the summon state")
	var report := FileAccess.open(OUTPUT + "capture-report.json", FileAccess.WRITE)
	report.store_string(JSON.stringify({"captures": captures, "resources": resource_checks, "home_stats": home_stat_checks, "failures": failures}, "  "))
	report.close()
	print("V06 CAPTURES: ", captures.size(), " screenshots, ", resource_checks.size(), " resource checks, ", home_stat_checks.size(), " home stat checks, ", failures.size(), " failures")
	app.queue_free()
	await settle()
	quit(0 if failures.is_empty() else 1)
