class_name HomeScreen
extends RefCounted
## Native state-bound home: no baked UI text, simulated chat, or direct mutations.
const Art = preload("res://scripts/game_illustrated_icon.gd")
const HOME_ART := "res://assets/ui-v08/home-immortal.png"
const ACTIVITIES := [["chest","仙市补给","043"],["gift","福利活动","084"],["events","活动","083"],["friends","仙友","019"],["beast","灵兽","012"],["treasure","法宝","003"],["meditation","神通","008"],["guild","仙盟","056"],["battle","斗法","054"],["hunt","寻宝","026"],["tower","镇妖塔","049"],["festival","限时活动","067"],["lotus","开府庆典","083"],["checkin","每日签到","045"]]
const SIDE_ENTRIES := [["friends","神仙","085"],["beast","灵兽","012"],["treasure","本命法宝","023"],["meditation","神通","008"]]
const SLOT_FALLBACK := [{"id":"flower","name":"莲座"},{"id":"feather","name":"羽扇"},{"id":"sands","name":"铜铃"},{"id":"goblet","name":"葫芦"},{"id":"circlet","name":"冠"},{"id":"sword","name":"剑"},{"id":"robe","name":"甲"},{"id":"belt","name":"腰带"},{"id":"boots","name":"靴"},{"id":"bracelet","name":"手镯"},{"id":"pendant","name":"玉佩"},{"id":"mirror","name":"镜"}]

class Surface extends Control:
	var info_rect := Rect2()
	var gear_rect := Rect2()
	var chat_rect := Rect2()
	func _draw() -> void:
		if info_rect.size.y < 1: return
		draw_rect(info_rect,Color(0.045,0.16,0.23,0.71))
		draw_line(info_rect.position,info_rect.position+Vector2(info_rect.size.x,0),Color("c3b583"),1,true)
		draw_style_box(GameTheme.silk("panel",Color(0.035,0.14,0.20,0.87),0),gear_rect)
		draw_rect(chat_rect,Color(0.025,0.14,0.18,0.91))
		draw_line(chat_rect.position,chat_rect.position+Vector2(chat_rect.size.x,0),Color(0.78,0.83,0.74,0.38),1,true)

static func build(app: Control,parent: Node) -> void:
	var root := Surface.new()
	root.name = "CultivationHome"
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.clip_contents = true
	parent.add_child(root)
	var background := TextureRect.new()
	background.name = "ImmortalHomeArt"
	background.texture = _texture(HOME_ART)
	background.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	background.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(background)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.show_behind_parent = true
	var top_shade := _gradient(root,PackedColorArray([Color(0.02,0.12,0.20,0.74),Color(0.02,0.12,0.20,0.12),Color(0.02,0.12,0.20,0)]))
	var avatar := Button.new()
	avatar.name = "HomeAvatar"
	avatar.tooltip_text = "府主与五人阵容"
	avatar.pressed.connect(app._framework_page.bind("阵容"))
	root.add_child(avatar)
	avatar.add_theme_constant_override("icon_max_width",58)
	for style in ["normal","hover","pressed"]: avatar.add_theme_stylebox_override(style,GameTheme.box(Color("254c63"),Color("d6bd7d"),30,3))
	var avatar_art := TextureRect.new()
	avatar_art.texture = _texture("res://assets/avatars/yangjian-premium.webp")
	avatar_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	avatar_art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	avatar_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var avatar_shader := Shader.new()
	avatar_shader.code = "shader_type canvas_item; void fragment(){ vec4 c=texture(TEXTURE,UV); if(distance(UV,vec2(0.5))>0.48){c.a=0.0;} COLOR=c; }"
	var avatar_material := ShaderMaterial.new()
	avatar_material.shader = avatar_shader
	avatar_art.material = avatar_material
	avatar.add_child(avatar_art)
	avatar_art.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	avatar_art.offset_left=3; avatar_art.offset_top=3; avatar_art.offset_right=-3; avatar_art.offset_bottom=-3
	var title := _label(root,"洪荒众仙府",23,Color("fff2cf"))
	title.add_theme_font_override("font",GameTheme.display_font())
	var player_level := _label(root,"",12,Color("ead5a3"))
	var resources: Array = []
	for key: String in ["stone","xp","material"]:
		var entry := Button.new()
		entry.name = "HomeResource_"+key
		entry.tooltip_text = str(app.RESOURCE_NAMES.get(key,key))
		entry.pressed.connect(_route.bind(app,"043"))
		root.add_child(entry)
		for style in ["normal","hover","pressed"]: entry.add_theme_stylebox_override(style,GameTheme.box(Color(0.02,0.13,0.22,0.65),Color(0.74,0.83,0.89,0.15),14,1))
		var icon := Art.icon(entry,key,false)
		var value := _label(entry,"",13,Color("fff7df"))
		resources.append({"key":key,"button":entry,"icon":icon,"label":value})
	var activity_buttons: Array[Button] = []
	for entry: Array in ACTIVITIES:
		var activity := Art.button(root,str(entry[1]),str(entry[0]),_route.bind(app,str(entry[2])),false,str(entry[0]) in ["gift","events","treasure","festival","lotus"])
		activity.set_meta("system_id",str(entry[2]))
		activity_buttons.append(activity)
	var summon := Art.button(root,"召唤","summon",func()->void: app._go(3))
	summon.name = "HomeSummon"
	var landscape_title := _label(root,"万仙归府\n共证长生",22,Color("173e56"))
	landscape_title.add_theme_color_override("font_outline_color",Color(0.93,0.98,1,0.72))
	landscape_title.add_theme_constant_override("outline_size",3)
	var power_label := _label(root,"战力",15,Color("f9dc9b"))
	var power := _label(root,"",30,Color("ffe5a5"))
	power.name = "HomePowerNumber"
	var realm := _label(root,"",17,Color("fff2d4"))
	var realm_button := _button(root,"渡劫",_route.bind(app,"005"),true)
	var progress := ProgressBar.new()
	progress.name = "HomeRealmProgress"
	progress.show_percentage = false
	progress.mouse_filter = Control.MOUSE_FILTER_IGNORE
	progress.add_theme_stylebox_override("background",GameTheme.box(Color("153745"),Color("9aab9f"),3,1))
	progress.add_theme_stylebox_override("fill",GameTheme.box(Color("dfb657"),Color("fae9a9"),2,0))
	root.add_child(progress)
	var xp_label := _label(root,"",12,Color("fff5d5"))
	xp_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var stats: Array[Label] = []
	for key in ["攻击","生命","防御","速度"]:
		var label := _label(root,key,12,Color("eff7e8"))
		label.name = "HomeStat"+key
		stats.append(label)
	var gear_label := _label(root,"法\n宝",19,Color("f2dfaf"))
	gear_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var gear_tiles: Array = []
	var equipment_api: Script = load("res://scripts/game_equipment.gd")
	var slot_rules: Array = equipment_api.call("shared_slots") if equipment_api.has_method("shared_slots") else SLOT_FALLBACK
	for slot: Dictionary in slot_rules:
		var tile := _button(root,"",_equipment_route.bind(app,str(slot.id)),false)
		tile.name = "SharedGear_"+str(slot.id)
		tile.set_meta("slot",str(slot.id))
		var art := Art.icon(tile,str(slot.id),false)
		var item_name := _label(tile,str(slot.name),12,Color("fff2d8"))
		item_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var level := _label(tile,"",12,Color("fff2b5"))
		level.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		gear_tiles.append({"slot":slot,"button":tile,"art":art,"caption":item_name,"level":level})
	var side_buttons: Array = []
	for entry: Array in SIDE_ENTRIES:
		var button := _button(root,"",_route.bind(app,str(entry[2])),false)
		button.name = "HomeSide_"+str(entry[0])
		var icon := Art.icon(button,str(entry[0]),false)
		var label := _label(button,"本命\n法宝" if str(entry[1])=="本命法宝" else str(entry[1]),15,Color("fff0c6"))
		side_buttons.append({"button":button,"icon":icon,"label":label})
	var chat := _button(root,"",_route.bind(app,"056"),false)
	chat.name = "HomeLocalChat"
	chat.add_theme_stylebox_override("normal",StyleBoxEmpty.new())
	var chat_label := _label(chat,"【仙盟】本地记录 · 查看仙盟事务",12,Color("dfede2"))
	chat_label.name="HomeLocalRecord"
	var refresh := func()->void:
		if not is_instance_valid(root) or not root.is_inside_tree(): return
		var unknown: bool="store" in app and app.get("store")!=null and bool(app.get("store").get("corruption"))
		for control: Node in root.get_children():
			if control is Button: control.disabled=unknown
		if unknown:
			player_level.text="府主 · 待恢复"
			for resource: Dictionary in resources:
				resource.label.text="—"
				resource.button.tooltip_text="档案待恢复；校验后显示真实余额。"
			power.text="—"; power.tooltip_text="存档待恢复，战力未知。"
			realm.text="存档待恢复"; xp_label.text="修为 —"; xp_label.tooltip_text="存档待恢复，修为未知。"
			progress.value=0
			for stat: Label in stats: stat.text="—"; stat.tooltip_text="档案待恢复，属性未知。"
			for tile: Dictionary in gear_tiles:
				tile.caption.text="待恢复"; tile.level.text=""; tile.button.tooltip_text="档案待恢复，装备未知。"
			chat_label.text="档案待恢复 · 请先校验存档"; chat.tooltip_text=chat_label.text
			avatar.tooltip_text="档案待恢复"
			activity_buttons[13].get_node("Notice").visible=false
			return
		var live: Dictionary = app.state()
		var cosmetic: String=GameActivities.cosmetic_name(live)
		chat_label.text="【仙盟】本地记录 · 查看仙盟事务" if cosmetic.is_empty() else "【名片】%s · 仙盟本地记录" % cosmetic
		chat.tooltip_text=chat_label.text
		avatar.tooltip_text="府主与设置" if cosmetic.is_empty() else "府主与设置\n已佩戴纪念名片："+cosmetic
		var live_realm: Dictionary = live.get("progression",{}).get("realm",{})
		player_level.text = ("测试免扣 · Lv.%d" if GameEconomy.free_currency() else "府主  Lv.%d") % (int(live_realm.get("level",0))+1)
		for resource: Dictionary in resources:
			var amount := int(live.get("resources",{}).get(resource.key,0))
			resource.label.text = _number(amount)
			resource.button.tooltip_text = "%s %d" % [str(app.RESOURCE_NAMES.get(resource.key,resource.key)),amount]
			_fit_text(resource.label,11 if root.size.y<620 else (12 if root.size.x<410 else 14))
		activity_buttons[13].get_node("Notice").visible = not bool(GameEconomy.check_in_status(live,GameData.now_ms()).get("claimed",false))
		var team: Array = live.get("team",[])
		power.text = _number(GameEquipment.team_power(live))
		power.tooltip_text = "阵容战力 %d" % GameEquipment.team_power(live)
		var requirement := 1
		var realm_text := "府主修行"
		if ResourceLoader.exists("res://scripts/game_progression.gd"):
			var progression: Script = load("res://scripts/game_progression.gd")
			if progression.has_method("realm_name"): realm_text = str(progression.call("realm_name",live))
			if progression.has_method("realm_requirement"): requirement = maxi(1,int(progression.call("realm_requirement",live).get("xp",1)))
		realm.text = realm_text
		var available_xp := int(live.get("resources",{}).get("xp",0))
		progress.max_value = requirement
		progress.value = mini(available_xp,requirement)
		xp_label.text = "修为 %s / %s" % [_number(available_xp),_number(requirement)]
		xp_label.tooltip_text = "现有修为 %d / 突破所需 %d" % [available_xp,requirement]
		if not team.is_empty():
			var detail := GameEquipment.character_stats(live,str(team[0]))
			for index in range(4):
				var key: String = ["atk","hp","def","speed"][index]
				stats[index].text = "%s %s" % [["攻击","生命","防御","速度"][index],_number(int(detail.get(key,0)))]
				stats[index].tooltip_text = "首位护府神仙 · %s %s" % [["攻击","生命","防御","速度"][index],str(detail.get(key,0))]
		for tile: Dictionary in gear_tiles:
			var item: Dictionary = equipment_api.call("shared_item",live,str(tile.slot.id)) if equipment_api.has_method("shared_item") else {}
			var rarity := int(item.get("rarity",0))
			var tint: Color = [Color("496b70"),Color("527e82"),Color("629f86"),Color("5da8c4"),Color("a891cf"),Color("d2af65")][clampi(rarity,0,5)]
			for style in ["normal","hover","pressed"]: tile.button.add_theme_stylebox_override(style,GameTheme.box(tint.darkened(0.56),tint.lightened(0.22),3,1))
			tile.art.modulate = Color(1,1,1,0.5 if item.is_empty() else 1.0)
			tile.level.text = "" if item.is_empty() else "%d级" % int(item.get("level",0))
			tile.caption.text = str(tile.slot.name) if item.is_empty() else ""
			tile.button.tooltip_text = "%s · %s" % [tile.slot.name,"未装备" if item.is_empty() else GameEquipment.display_name(item)]
	var arrange := func()->void:
		if not is_instance_valid(root): return
		var width := root.size.x
		var height := root.size.y
		if width < 1 or height < 1: return
		var narrow := width < 410
		var compact := height < 620
		var margin := 6.0 if narrow else 12.0
		var header_h := 50.0 if compact else (80.0 if narrow else 82.0)
		var activities_h := 92.0 if compact else (124.0 if narrow else 152.0)
		var chat_h := 26.0 if compact else 30.0
		var side_w := 86.0 if narrow else 128.0
		var rail_w := 0.0 if narrow else 20.0
		var tile_gap := 3.0 if narrow else 6.0
		var tiles_w := width-margin*2-rail_w-side_w-(16 if narrow else 24)
		var tile_side := (tiles_w-tile_gap*3)/4.0
		var gear_h := tile_side*3+20+tile_gap*2
		var info_h := 70.0 if compact else (102.0 if narrow else 108.0)
		var gear_y := height-chat_h-gear_h-4
		var info_y := gear_y-info_h-4
		root.info_rect = Rect2(0,info_y,width,info_h)
		root.gear_rect = Rect2(margin,gear_y,width-margin*2,gear_h)
		root.chat_rect = Rect2(0,height-chat_h,width,chat_h)
		root.queue_redraw()
		_rect(top_shade,0,0,width,header_h+activities_h+30)
		_rect(avatar,margin,8,54 if narrow else 64,54 if narrow else 64)
		var name_x := margin+(62 if narrow else 74)
		_rect(title,name_x,9,width-name_x-6,26)
		title.add_theme_font_size_override("font_size",18 if narrow else 23)
		_rect(player_level,name_x,35,100,20)
		var resource_x := name_x+88
		var resource_y := 36.0
		if width < 400: resource_x=name_x; resource_y=54
		var resource_end := width-margin-8
		player_level.visible = not compact
		if compact:
			_rect(avatar,4,4,42,42)
			_rect(title,54,1,width-108,23)
			title.add_theme_font_size_override("font_size",16)
			resource_x=51; resource_y=25; resource_end=width-55
		var resource_w := (resource_end-resource_x)/3.0
		for index in range(resources.size()):
			var entry: Dictionary=resources[index]
			_rect(entry.button,resource_x+index*resource_w,resource_y,resource_w-2,24)
			var small_icon := 18.0 if compact else 22.0
			_rect(entry.icon,0,1,small_icon,small_icon)
			_rect(entry.label,small_icon+1,0,resource_w-small_icon-4,22)
			entry.label.add_theme_font_size_override("font_size",11 if compact else (12 if narrow else 14))
			_fit_text(entry.label,11 if compact else (12 if narrow else 14))
		var activity_width := (width-margin*2)/7.0
		var activity_h := activities_h/2.0
		for index in range(activity_buttons.size()):
			_rect(activity_buttons[index],margin+(index%7)*activity_width,header_h+(index/7)*activity_h,activity_width,activity_h)
			var caption := activity_buttons[index].get_node("Caption") as Label
			var full_title := str(ACTIVITIES[index][1])
			caption.text = GameNames.text({"仙市补给":"补给","福利活动":"福利","限时活动":"限时","开府庆典":"庆典","每日签到":"签到"}.get(full_title,full_title) if narrow else full_title)
		var scene_start := header_h+activities_h
		_rect(summon,margin+3,scene_start+5,52 if narrow else 68,66 if narrow else 84)
		if compact: _rect(summon,width-50,1,46,47)
		_rect(landscape_title,margin+8,scene_start+(76 if narrow else 96),110,64)
		landscape_title.add_theme_font_size_override("font_size",17 if narrow else 22)
		landscape_title.visible = info_y-scene_start >= 166
		_rect(power_label,margin+5,info_y+(3 if compact else 9),32,22)
		_rect(power,margin+38,info_y+(0 if compact else 3),width*0.36-40,30 if compact else 36)
		power.add_theme_font_size_override("font_size",22 if compact else (25 if narrow else 32))
		_rect(realm,width*0.40,info_y+(1 if compact else 7),width*0.34-8,30)
		realm.add_theme_font_size_override("font_size",13 if compact else (14 if narrow else 18))
		_rect(realm_button,width-76-margin,info_y+1,76,31 if compact else 44)
		realm_button.add_theme_font_size_override("font_size",17 if compact else (18 if narrow else 22))
		_rect(progress,margin+10,info_y+(34 if compact else 47),width-margin*2-20,14 if compact else 18)
		_rect(xp_label,margin+12,info_y+(30 if compact else 44),width-margin*2-24,23)
		for index in range(4):
			_rect(stats[index],margin+3+index*(width-margin*2)/4.0,info_y+(50 if compact else 76),(width-margin*2)/4.0,20 if compact else 23)
			stats[index].add_theme_font_size_override("font_size",11 if narrow else 13)
		var tiles_x := margin+rail_w+7
		var tile_w := tile_side
		var tile_h := tile_side
		_rect(gear_label,margin+4,gear_y+15,rail_w,gear_h-30)
		gear_label.visible = not narrow
		for index in range(gear_tiles.size()):
			var tile: Dictionary=gear_tiles[index]
			_rect(tile.button,tiles_x+(index%4)*(tile_w+tile_gap),gear_y+10+(index/4)*(tile_h+tile_gap),tile_w,tile_h)
			_rect(tile.art,3,2,tile_w-6,tile_h-14)
			_rect(tile.caption,1,tile_h-20,tile_w-2,19)
			tile.caption.add_theme_font_size_override("font_size",11 if narrow else 13)
			_rect(tile.level,1,tile_h-20,tile_w-3,19)
		var side_x := width-margin-side_w-9
		var side_h := (gear_h-20-12)/4.0
		for index in range(side_buttons.size()):
			var side: Dictionary=side_buttons[index]
			_rect(side.button,side_x,gear_y+10+index*(side_h+4),side_w,side_h)
			_rect(side.icon,side_w*0.34,0,side_w*0.66,side_h)
			_rect(side.label,5,2,side_w*0.46,side_h-4)
			var is_two_lines := "\n" in str(side.label.text)
			side.label.add_theme_font_size_override("font_size",(11 if narrow else 13) if is_two_lines else (13 if narrow else 16))
			side.label.add_theme_constant_override("line_spacing",-3 if is_two_lines else 0)
		_rect(chat,margin,height-chat_h,width-margin*2,chat_h)
		_rect(chat_label,8,1,width-margin*2-16,chat_h-2)
	root.resized.connect(arrange)
	var timer := Timer.new()
	timer.wait_time = 0.7
	timer.timeout.connect(refresh)
	root.add_child(timer)
	timer.start()
	arrange.call_deferred()
	refresh.call_deferred()

static func _route(app: Control,id: String) -> void:
	if app.has_method("_systems_page"): app.call("_systems_page",id)
	else:
		match id:
			"003","023","008","085": app._team()
			"056": app._go(6)
			"054","049": app._go(2)
			"043": app._shop()
			"045": app._activities()
			_: app._activities()

static func _equipment_route(app: Control,slot: String) -> void:
	if app.has_method("_shared_gear_choices"): app.call("_shared_gear_choices",slot)
	else: _route(app,"003")

static func _texture(path: String) -> Texture2D:
	if ResourceLoader.exists(path): return load(path)
	var image := Image.load_from_file(ProjectSettings.globalize_path(path))
	return ImageTexture.create_from_image(image) if image != null else null

static func _number(value: int) -> String:
	if value >= 100000000: return "%.1f亿" % (float(value)/100000000.0)
	if value >= 10000: return "%.1f万" % (float(value)/10000.0)
	return str(value)

static func _fit_text(label: Label,preferred: int) -> void:
	var font := label.get_theme_font("font")
	var fitted := preferred
	while fitted>9 and font.get_string_size(label.text,HORIZONTAL_ALIGNMENT_LEFT,-1,fitted).x>label.size.x: fitted-=1
	label.add_theme_font_size_override("font_size",fitted)

static func _label(parent: Node,text: String,font_size: int,color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size",font_size)
	label.add_theme_color_override("font_color",color)
	label.add_theme_color_override("font_outline_color",Color(0.02,0.12,0.17,0.75))
	label.add_theme_constant_override("outline_size",2)
	parent.add_child(label)
	return label

static func _button(parent: Node,text: String,callback: Callable,gold: bool) -> Button:
	var button := Button.new()
	button.text = text
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.pressed.connect(callback)
	button.add_theme_font_size_override("font_size",16)
	button.add_theme_color_override("font_color",Color("543711") if gold else Color("fff0cf"))
	for style in ["normal","hover","pressed"]: button.add_theme_stylebox_override(style,GameTheme.box(Color("d9b46a") if gold else Color(0.06,0.22,0.29,0.76),Color("b9a67c"),4,0))
	button.add_theme_stylebox_override("focus",GameTheme.box(Color.TRANSPARENT,Color("fff0ad"),4,0))
	parent.add_child(button)
	return button

static func _gradient(parent: Node,colors: PackedColorArray) -> TextureRect:
	var gradient := Gradient.new()
	gradient.colors = colors
	gradient.offsets = PackedFloat32Array([0,0.65,1])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill_from = Vector2.ZERO
	texture.fill_to = Vector2(0,1)
	var node := TextureRect.new()
	node.texture = texture
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(node)
	return node

static func _rect(node: Control,x: float,y: float,width: float,height: float) -> void:
	node.position = Vector2(x,y)
	node.size = Vector2(maxf(1,width),maxf(1,height))
