class_name RosterScreen
extends Control
## One faction, one screen: collection cards never create a page or scroll area.
var app: Control
var factions: Array[String] = []
var selected_faction := ""
var faction_buttons: Dictionary = {}
var cards: Array[Button] = []
var heading: Label
var progress_label: Label
var faction_label: Label
var hint: Label
var team_button: Button
var synergy_button: Button
var presets_button: Button
var board: Control
var columns := 4
var current_ids: Array[String] = []
var heading_art: Control
var section_line_y := 151.0
var cloud_backdrop: Texture2D

static func build(application: Control, parent: Node) -> RosterScreen:
	var screen := RosterScreen.new()
	screen.name = "FactionRoster"
	screen.app = application
	parent.add_child(screen)
	return screen

func _ready() -> void:
	texture_filter=CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_PASS
	for hero: Dictionary in GameData.content("CHARACTERS", []):
		var faction := str(hero.faction)
		if not factions.has(faction): factions.append(faction)
	selected_faction = str(app.filter)
	if not factions.has(selected_faction): selected_faction = factions[0]
	app.filter = selected_faction
	# A previous version's search and rarity choice must not silently hide heroes.
	app.roster_query = ""
	app.rarity_filter = "全部"
	cloud_backdrop=load("res://assets/terrain/distant-cloud-mountains.png")
	heading = _line("", 23, GameTheme.INK)
	heading.hide()
	heading_art = GameIllustratedIcon.icon(self,"friends",false)
	progress_label = _line("已拥有 %d / %d" % [app.state().owned.size(), GameData.content("CHARACTERS").size()], 13, GameTheme.TEXT)
	team_button = _action("编队", app._team, true)
	team_button.name = "RosterTeam"
	for faction: String in factions:
		var button := FactionTab.new()
		button.text = faction
		button.member_count = _heroes(faction).size()
		button.pressed.connect(func() -> void:
			app.audio.cue()
			select_faction(faction))
		add_child(button)
		button.name = "Faction_" + faction
		button.set_meta("faction", faction)
		button.tooltip_text = faction + " · " + str(_heroes(faction).size()) + "位"
		faction_buttons[faction] = button
	faction_label = _line("", 12, GameTheme.TEXT)
	board = Control.new()
	board.name = "FactionCardWall"
	board.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(board)
	hint = _line("点选神仙查看详情 · 未拥有亦可试用", 11, GameTheme.TEXT)
	synergy_button = _action("阵容配合", app._synergy)
	presets_button = _action("阵容预设", app._presets)
	resized.connect(_layout)
	select_faction(selected_faction)

func _line(text: String, font_size: int, color: Color) -> Label:
	var line := GameTheme.label(text, font_size, color)
	line.autowrap_mode = TextServer.AUTOWRAP_OFF
	line.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	add_child(line)
	return line

func _action(text: String, callback: Callable, primary := false) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2.ZERO
	button.add_theme_font_size_override("font_size", 14)
	GameTheme.style_button(button,primary,0)
	button.pressed.connect(func() -> void:
		app.audio.cue()
		callback.call())
	add_child(button)
	return button

func _heroes(faction: String) -> Array[Dictionary]:
	var found: Array[Dictionary] = []
	for hero: Dictionary in GameData.content("CHARACTERS", []):
		if str(hero.faction) == faction: found.append(hero)
	return found

func select_faction(faction: String) -> void:
	if not factions.has(faction): return
	selected_faction = faction
	app.filter = faction
	for node: Button in cards:
		board.remove_child(node)
		node.queue_free()
	cards.clear()
	current_ids.clear()
	var owned_count := 0
	for hero: Dictionary in _heroes(faction):
		var owned: bool = app.state().owned.has(hero.id)
		if owned: owned_count += 1
		var item := RosterCard.new()
		item.hero = hero
		item.owned = owned
		item.in_team = app.state().team.has(str(hero.id))
		item.selected = str(app.get_meta("roster_selected", "")) == str(hero.id)
		item.name = "Card_" + str(hero.id)
		item.set_meta("character_id", str(hero.id))
		item.set_meta("faction", faction)
		item.tooltip_text = "%s · %s · %s\n点击查看详情" % [hero.name, faction, "已上阵" if item.in_team else "已结缘" if owned else "未结缘，可试用"]
		item.pressed.connect(_open_hero.bind(str(hero.id)))
		board.add_child(item)
		cards.append(item)
		current_ids.append(str(hero.id))
	faction_label.text = "%s · 拥有 %d / %d" % [faction, owned_count, cards.size()]
	for key: String in faction_buttons:
		var button: FactionTab = faction_buttons[key]
		var selected := key == faction
		button.set_meta("selected", selected)
		button.active = selected
		button.queue_redraw()
	_layout()
	queue_redraw()

func _open_hero(id: String) -> void:
	app.audio.cue()
	app.set_meta("roster_selected", id)
	app._open_character(id)

func _layout() -> void:
	if not is_instance_valid(board): return
	var inset := 10.0
	var width := maxf(1.0, size.x - inset * 2.0)
	var compact := size.x < 480.0
	var short := size.y < 440
	heading_art.position=Vector2(inset,2)
	heading_art.size=Vector2(28,28) if short else Vector2(34,34)
	progress_label.position = Vector2(inset + 38, 3)
	progress_label.size = Vector2(width - 108, 28)
	progress_label.add_theme_font_size_override("font_size",11 if short else 13)
	team_button.position = Vector2(size.x - inset - 66, 2)
	team_button.size = Vector2(66, 26 if short else 32)
	var gap := 4.0
	var tab_columns: int=4 if compact else 8
	var tab_width := width / tab_columns
	var tabs_y := 30.0 if short else 39.0
	var tab_step := 26.0 if short else 36.0
	for index: int in factions.size():
		var tab: Button = faction_buttons[factions[index]]
		tab.position = Vector2(inset + (index % tab_columns) * tab_width, tabs_y + (index / tab_columns) * tab_step)
		tab.size = Vector2(tab_width, tab_step)
		tab.queue_redraw()
	var tabs_end: float=tabs_y+tab_step*(2 if compact else 1)
	faction_label.position = Vector2(inset + 3, tabs_end+4)
	faction_label.size = Vector2(width, 22)
	faction_label.visible=not short
	var footer_y := maxf(240.0, size.y - (31.0 if short else 42.0))
	board.position = Vector2(inset, tabs_end+(5 if short else 30))
	board.size = Vector2(width, maxf(64.0, footer_y - board.position.y - (6.0 if short else 24.0)))
	section_line_y=board.position.y-5
	hint.position = Vector2(inset, footer_y - 22)
	hint.size = Vector2(width, 18)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.visible=not short
	synergy_button.position = Vector2(inset, footer_y)
	synergy_button.size = Vector2((width - gap) / 2.0, 27 if short else 34)
	presets_button.position = Vector2(inset + (width + gap) / 2.0, footer_y)
	presets_button.size = synergy_button.size
	# Fixed-density gallery: 17 heroes occupy 6×3 at 540 or 5×4 on narrow
	# screens. Sparse factions preserve the same card scale and never stretch.
	columns = 5 if compact else 6
	var rows := 4 if compact else 3
	var card_gap := 3.0 if short else (5.0 if compact else 7.0)
	var cell_width := (board.size.x - (columns - 1) * card_gap) / columns
	var cell_height := minf(cell_width*1.58,(board.size.y - (rows - 1) * card_gap) / rows)
	# Sparse factions remain a gallery of collectible cards, never stretch into banners.
	var gallery_width := columns * cell_width + (columns - 1) * card_gap
	var start_x := (board.size.x - gallery_width) / 2.0
	for index: int in cards.size():
		var item: Button = cards[index]
		item.position = Vector2(start_x + (index % columns) * (cell_width + card_gap), (index / columns) * (cell_height + card_gap))
		item.size = Vector2(cell_width, maxf(44.0, cell_height))
		item.set_meta("compact_name",true)
		item.queue_redraw()
	queue_redraw()

func _draw() -> void:
	if cloud_backdrop: draw_texture_rect(cloud_backdrop,Rect2(Vector2.ZERO,size),false,Color("cde5ef"))
	draw_rect(Rect2(Vector2.ZERO,size),Color("e6eff3b8"))
	draw_line(Vector2(10,section_line_y),Vector2(size.x-10,section_line_y),Color("d9c08a44"),1,true)
	var footer_line: float=size.y-(36 if size.y<440 else 48)
	draw_line(Vector2(10,footer_line),Vector2(size.x-10,footer_line),Color("a7c4d033"),1,true)

class FactionTab extends Button:
	var active := false
	var member_count := 0

	func _ready() -> void:
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		focus_mode = Control.FOCUS_ALL
		add_theme_color_override("font_color", Color.TRANSPARENT)
		add_theme_color_override("font_hover_color", Color.TRANSPARENT)
		add_theme_color_override("font_pressed_color", Color.TRANSPARENT)
		for state: String in ["normal", "hover", "pressed", "disabled", "focus"]:
			add_theme_stylebox_override(state, StyleBoxEmpty.new())
		mouse_entered.connect(queue_redraw)
		mouse_exited.connect(queue_redraw)
		focus_entered.connect(queue_redraw)
		focus_exited.connect(queue_redraw)
		resized.connect(queue_redraw)

	func _draw() -> void:
		if active or is_hovered() or has_focus(): draw_rect(Rect2(0,0,size.x,size.y),Color("d7b57118"))
		var font := GameTheme.display_font()
		var count_text := str(member_count)
		var font_size := 14 if size.x >= 80 else 12
		var label_width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		var count_width := font.get_string_size(count_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x
		var start_x := (size.x - label_width - count_width - 5) / 2.0
		var baseline := size.y*0.5+5
		draw_string(font, Vector2(start_x, baseline), text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, GameTheme.INK if active else GameTheme.TEXT)
		draw_string(font, Vector2(start_x + label_width + 5, baseline-1), count_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, GameTheme.TEXT)
		if active:
			draw_line(Vector2(7, size.y - 2), Vector2(size.x - 7, size.y - 2), Color("e5c27e"), 1.3, true)
			var center := Vector2(size.x / 2, size.y - 2)
			draw_colored_polygon(PackedVector2Array([center + Vector2(-3, 0), center + Vector2(0, -3), center + Vector2(3, 0), center + Vector2(0, 2)]), GameTheme.GOLD)

class RosterCard extends Button:
	var hero: Dictionary = {}
	var owned := false
	var in_team := false
	var selected := false
	var portrait: Texture2D
	var full_portrait: Texture2D
	var shade: GradientTexture2D
	var name_font_size := 13
	var rendered_name_width := 0.0

	func _ready() -> void:
		texture_filter=CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		custom_minimum_size = Vector2(44, 44)
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		focus_mode = Control.FOCUS_ALL
		for state: String in ["normal", "hover", "pressed", "disabled", "focus"]:
			add_theme_stylebox_override(state, StyleBoxEmpty.new())
		var path := str(hero.get("avatarPath", "res://assets/avatars/%s-premium.webp" % hero.id))
		if ResourceLoader.exists(path): portrait = load(path)
		var full_path: String=str(hero.get("portraitPath","res://assets/portraits/%s-premium.webp" % hero.id))
		if ResourceLoader.exists(full_path): full_portrait=load(full_path)
		var gradient := Gradient.new()
		gradient.offsets = PackedFloat32Array([0, 0.25, 0.55, 1])
		gradient.colors = PackedColorArray([Color("16374a00"), Color("16374a99"), Color("16374aee"), Color("102b3fff")])
		shade = GradientTexture2D.new()
		shade.gradient = gradient
		shade.fill_from = Vector2(0, 0)
		shade.fill_to = Vector2(0, 1)
		mouse_entered.connect(queue_redraw)
		mouse_exited.connect(queue_redraw)
		focus_entered.connect(queue_redraw)
		focus_exited.connect(queue_redraw)
		resized.connect(queue_redraw)

	func _draw() -> void:
		var stars := int(hero.get("stars", 5 if hero.get("rarity") == "divine" else 4))
		var rarity := Color("cdb477") if stars >= 5 else Color("aba8cc") if stars == 4 else Color("8bb6c9")
		var active := selected or is_hovered() or has_focus()
		var frame := GameTheme.box(Color("183b51"), Color("ffe9a8") if active else Color(rarity,0.7), 2, 0)
		frame.shadow_color = Color(0.03, 0.09, 0.07, 0.17)
		frame.shadow_size = 1
		frame.shadow_offset = Vector2(0, 1)
		draw_style_box(frame, Rect2(Vector2.ZERO, size))
		var art_rect := Rect2(Vector2(2, 2), Vector2(maxf(1, size.x - 4), maxf(1, size.y - 18)))
		var art_texture: Texture2D=full_portrait if full_portrait!=null and size.y>size.x*1.9 else portrait
		if art_texture:
			var source := Vector2(art_texture.get_size())
			var ratio := art_rect.size.x / art_rect.size.y
			var crop := source
			if source.x / source.y > ratio: crop.x = source.y * ratio
			else: crop.y = source.x / ratio
			var origin := Vector2((source.x - crop.x) * 0.50, (source.y - crop.y) * 0.22)
			draw_texture_rect_region(art_texture, art_rect, Rect2(origin, crop), Color.WHITE if owned else Color("b7c9d4"))
		# A shared ink-blue silk strip keeps every name readable over the art.
		if shade: draw_texture_rect(shade, Rect2(2, size.y - 33, size.x - 4, 31), false)
		draw_line(Vector2(5, 2), Vector2(size.x - 5, 2), Color("f9edc7"), 1, true)
		draw_line(Vector2(4, size.y - 2), Vector2(size.x - 4, size.y - 2), Color(rarity, 0.75), 1, true)
		var font := get_theme_font("font")
		name_font_size = 14 if size.x >= 110 else 12 if size.x >= 80 else 11
		var display_name := str(hero.get("name", ""))
		if bool(get_meta("compact_name",false)):
			display_name=str({"文殊广法天尊":"文殊天尊","清虚道德真君":"清虚真君"}.get(display_name,display_name))
		while name_font_size > 9 and font.get_string_size(display_name, HORIZONTAL_ALIGNMENT_LEFT, -1, name_font_size).x > size.x - 8:
			name_font_size -= 1
		rendered_name_width = font.get_string_size(display_name, HORIZONTAL_ALIGNMENT_LEFT, -1, name_font_size).x
		draw_string(font, Vector2((size.x - rendered_name_width) / 2.0, size.y - 14), display_name, HORIZONTAL_ALIGNMENT_LEFT, -1, name_font_size, Color("f5eee0") if owned else Color("c9dce6"))
		for star_index: int in stars:
			_star(Vector2(size.x / 2.0 + (star_index - (stars - 1) / 2.0) * 7.5, size.y - 7), 3.0, Color("e8cb85"))
		_status_badge(Vector2(size.x - 10, 10))
		if active:
			draw_rect(Rect2(Vector2(1, 1), size - Vector2(2, 2)), Color("e3c786aa"), false, 1)
			for corner: Vector2 in [Vector2(0, 0), Vector2(size.x, size.y)]:
				var direction := Vector2.ONE if corner == Vector2.ZERO else -Vector2.ONE
				draw_line(corner + Vector2(1, 1) * direction, corner + Vector2(9, 1) * direction, GameTheme.GOLD, 1.5, true)
				draw_line(corner + Vector2(1, 1) * direction, corner + Vector2(1, 9) * direction, GameTheme.GOLD, 1.5, true)
		if selected:
			draw_colored_polygon(PackedVector2Array([Vector2(2, 2), Vector2(17, 2), Vector2(2, 17)]), GameTheme.JADE)
			draw_polyline(PackedVector2Array([Vector2(4, 7), Vector2(6, 9), Vector2(10, 5)]), GameTheme.LIGHT, 1.2, true)

	func _star(center: Vector2, radius: float, color: Color) -> void:
		var points := PackedVector2Array()
		for index: int in 10:
			var angle := -PI / 2.0 + index * PI / 5.0
			points.append(center + Vector2(cos(angle), sin(angle)) * radius * (1.0 if index % 2 == 0 else 0.44))
		draw_colored_polygon(points, color)

	func _status_badge(center: Vector2) -> void:
		draw_circle(center, 7, Color(GameTheme.DEEP, 0.78) if not owned else Color("e4dcc0"), true, -1, true)
		draw_arc(center, 6.8, 0, TAU, 24, Color("d6c994"), 0.65, true)
		if not owned:
			draw_arc(center + Vector2(0, -1.7), 2.25, PI, TAU, 12, Color("e6e6d5"), 1, true)
			draw_style_box(GameTheme.box(Color("e6e6d5"), Color.TRANSPARENT, 1, 0), Rect2(center + Vector2(-3, -1), Vector2(6, 4.5)))
			draw_line(center + Vector2(0, 0), center + Vector2(0, 2), GameTheme.DEEP, 1, true)
		elif in_team:
			draw_polyline(PackedVector2Array([center + Vector2(-3, 0), center + Vector2(-1, 2), center + Vector2(3, -2)]), GameTheme.JADE, 1.5, true)
		else:
			draw_colored_polygon(PackedVector2Array([center + Vector2(0, -3), center + Vector2(3, 0), center + Vector2(0, 3), center + Vector2(-3, 0)]), GameTheme.JADE)
