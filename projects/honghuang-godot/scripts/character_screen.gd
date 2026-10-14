class_name CharacterScreen
extends VBoxContainer
## Compact native character dossier. Tabs change presentation only; economic
## actions continue through the application's authoritative transactions.
const TABS := ["培养","神通","灵宝","装备","仙人志"]
var app: Control
var character_id := ""
var selected_tab := "培养"
var branch_page := "神通"
var lore_page := "配合"
var stage: PanelContainer
var panel: VBoxContainer
var tab_buttons: Dictionary = {}
var footer: HBoxContainer
var identity_stars: Label
var compact := false
var density_busy := false
var density_initialized := false

static func build(application: Control,parent: Node,id: String) -> CharacterScreen:
	var screen := CharacterScreen.new()
	screen.name="SingleScreenCharacter"
	screen.app=application
	screen.character_id=id
	parent.add_child(screen)
	return screen

func _ready() -> void:
	texture_filter=CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	size_flags_horizontal=Control.SIZE_EXPAND_FILL
	size_flags_vertical=Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation",5)
	selected_tab=str(app.get_meta("hero_tab","培养"))
	if not TABS.has(selected_tab): selected_tab="培养"
	branch_page=str(app.get_meta("hero_branch_page","神通"))
	lore_page=str(app.get_meta("hero_lore_page","配合"))
	var hero := GameData.character(character_id)
	var state: Dictionary=app.state()
	var owned: bool=state.owned.has(character_id)
	var cultivation: Dictionary=state.owned.get(character_id,{"level":1,"treasure":0})
	var top := HBoxContainer.new()
	add_child(top)
	var back := _button(top,"‹ 万仙录",app._back_characters)
	back.custom_minimum_size.y=32
	back.size_flags_horizontal=Control.SIZE_SHRINK_BEGIN
	back.custom_minimum_size.x=90
	_line(top,str(hero.faction)+" · %d星" % int(hero.get("stars",4)),14,GameTheme.JADE).horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT
	stage=PanelContainer.new()
	stage.name="CharacterArtAndIdentity"
	stage.clip_contents=true
	var art_style := GameTheme.box(Color("173b51"),Color("bba46c88"),4,6)
	stage.add_theme_stylebox_override("panel",art_style)
	add_child(stage)
	var composition := HBoxContainer.new()
	composition.add_theme_constant_override("separation",0)
	stage.add_child(composition)
	var info := VBoxContainer.new()
	info.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	info.size_flags_stretch_ratio=0.9
	info.add_theme_constant_override("separation",1)
	composition.add_child(info)
	identity_stars=_line(info,"★".repeat(int(hero.get("stars",4))),12,Color("e7c882"))
	_line(info,str(hero.name),28,Color("f4f0df")).tooltip_text=str(_guide().get("role",hero.skillDescription))
	_line(info,"修为 %d · 灵宝 %d阶" % [cultivation.level,cultivation.treasure] if owned else "尚未结缘 · 可完整试用",12,Color("b6cfda"))
	_line(info,"战力 %d" % GameEquipment.character_power(state,character_id) if owned else str(hero.skillName),19,Color("f1d895"))
	var formation: Button=_button(info,"调整上阵" if owned else "追踪心愿",app._quick_join.bind(character_id) if owned else app._set_wish.bind(character_id))
	formation.custom_minimum_size.y=38
	formation.add_theme_color_override("font_color",Color("eff1dc"))
	formation.add_theme_color_override("font_hover_color",Color("fff2bf"))
	formation.add_theme_color_override("font_pressed_color",Color("fff2bf"))
	var portrait := TextureRect.new()
	portrait.texture_filter=CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	portrait.name="PremiumCharacterPortrait"
	portrait.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_COVERED
	portrait.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	portrait.size_flags_stretch_ratio=1.1
	portrait.mouse_filter=Control.MOUSE_FILTER_IGNORE
	var path := "res://assets/portraits/%s-premium.webp" % character_id
	if ResourceLoader.exists(path):
		var texture: Texture2D=load(path)
		var atlas := AtlasTexture.new()
		atlas.atlas=texture
		# The upper portrait preserves the face and weapon in a short dossier.
		# Full original artwork stays available in its unchanged source asset.
		atlas.region=Rect2(0,0,texture.get_width(),texture.get_height()*0.62)
		portrait.texture=atlas
		# Feather only the display edge so the original artwork and its detail stay intact.
		var blend := Shader.new()
		blend.code="shader_type canvas_item; void fragment() { vec4 art = texture(TEXTURE, UV); art.a *= smoothstep(0.0, 0.18, UV.x); COLOR = art; }"
		var material := ShaderMaterial.new()
		material.shader=blend
		portrait.material=material
	composition.add_child(portrait)
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation",4)
	add_child(tabs)
	for title in TABS:
		var key := str(title)
		tab_buttons[key]=_button(tabs,key,_select_tab.bind(key),key==selected_tab)
		tab_buttons[key].add_theme_font_size_override("font_size",14)
	var sheet := PanelContainer.new()
	sheet.name="CharacterTabSheet"
	sheet.add_theme_stylebox_override("panel",GameTheme.box(Color("e7f0f2f2"),Color("9bbbc599"),4,8))
	sheet.size_flags_vertical=Control.SIZE_EXPAND_FILL
	add_child(sheet)
	panel=VBoxContainer.new()
	panel.add_theme_constant_override("separation",4)
	sheet.add_child(panel)
	footer=HBoxContainer.new()
	footer.add_theme_constant_override("separation",5)
	add_child(footer)
	_button(footer,"试用法相",app._try_character.bind(character_id))
	_button(footer,"结缘心愿",app._set_wish.bind(character_id))
	_button(footer,"法相试炼" if owned else "前往召请",_show_challenges if owned else app._go.bind(3))
	resized.connect(_resize_layout)
	get_viewport().size_changed.connect(_resize_layout,CONNECT_DEFERRED)
	minimum_size_changed.connect(_settle_content_bounds,CONNECT_DEFERRED)
	_fill_tab()
	_resize_layout()

func _resize_layout() -> void:
	if density_busy or not is_instance_valid(stage): return
	density_busy=true
	var use_compact: bool=GameSafeArea.rect_for(app).size.y<680
	if not density_initialized or use_compact!=compact:
		compact=use_compact
		_apply_density(self)
		density_initialized=true
	# Star quality is also in the faction line. On a short screen the portrait
	# keeps its name, cultivation, power and real formation action together.
	identity_stars.visible=not compact
	stage.custom_minimum_size.y=90 if compact else clampf(size.y*0.26,156,194)
	density_busy=false

func _settle_content_bounds() -> void:
	# The shell's body lives in a drawing Control, not a sorting Container.
	# Wrapped labels briefly ask for a tall minimum before receiving their
	# final width. Return to the real viewport once that minimum settles.
	if is_instance_valid(app.body) and is_instance_valid(app.body_scroll):
		app.body.size=app.body_scroll.size
		app.body.queue_sort()

func _apply_density(node: Node) -> void:
	if node is Label or node is Button:
		if not node.has_meta("dossier_font"): node.set_meta("dossier_font",node.get_theme_font_size("font_size"))
		var original: int=int(node.get_meta("dossier_font"))
		var reduced: int=20 if original>=26 else 14 if original>=18 else 12 if original>=14 else 11
		node.add_theme_font_size_override("font_size",reduced if compact else original)
	if node is Button:
		if not node.has_meta("dossier_minimum"): node.set_meta("dossier_minimum",node.custom_minimum_size)
		var minimum: Vector2=node.get_meta("dossier_minimum")
		node.custom_minimum_size=Vector2(minimum.x,60 if minimum.y>=80 else 26) if compact else minimum
		for state_name: String in ["normal","hover","pressed","disabled"]:
			var style: StyleBox=node.get_theme_stylebox(state_name).duplicate()
			if not node.has_meta("dossier_padding_"+state_name): node.set_meta("dossier_padding_"+state_name,Vector2(style.content_margin_top,style.content_margin_bottom))
			var padding: Vector2=node.get_meta("dossier_padding_"+state_name)
			style.content_margin_top=1 if compact else padding.x
			style.content_margin_bottom=1 if compact else padding.y
			node.add_theme_stylebox_override(state_name,style)
	if node is BoxContainer:
		if not node.has_meta("dossier_separation"): node.set_meta("dossier_separation",node.get_theme_constant("separation"))
		node.add_theme_constant_override("separation",1 if compact else int(node.get_meta("dossier_separation")))
	if node is GridContainer:
		if not node.has_meta("dossier_v_gap"): node.set_meta("dossier_v_gap",node.get_theme_constant("v_separation"))
		node.add_theme_constant_override("v_separation",1 if compact else int(node.get_meta("dossier_v_gap")))
	if node is PanelContainer:
		var style: StyleBox=node.get_theme_stylebox("panel").duplicate()
		if not node.has_meta("dossier_panel_padding"): node.set_meta("dossier_panel_padding",Vector2(style.content_margin_top,style.content_margin_bottom))
		var padding: Vector2=node.get_meta("dossier_panel_padding")
		style.content_margin_top=3 if compact else padding.x
		style.content_margin_bottom=3 if compact else padding.y
		node.add_theme_stylebox_override("panel",style)
	if node is TextureRect and node.name!="PremiumCharacterPortrait":
		if not node.has_meta("dossier_minimum"): node.set_meta("dossier_minimum",node.custom_minimum_size)
		var minimum: Vector2=node.get_meta("dossier_minimum")
		node.custom_minimum_size=Vector2(minimum.x,22) if compact else minimum
	for child: Node in node.get_children(): _apply_density(child)

func _guide() -> Dictionary:
	return GameData.content("CHARACTER_GUIDES",{}).get(character_id,{})

func _cultivation() -> Dictionary:
	return app.state().owned.get(character_id,{"level":1,"branch":"A","treasure":0})

func _owned() -> bool:
	return app.state().owned.has(character_id)

func _button(parent: Node,text: String,callback: Callable,primary := false,disabled := false) -> Button:
	var button: Button=app.button(parent,text,callback,primary,disabled)
	button.custom_minimum_size.y=44
	button.add_theme_font_size_override("font_size",14)
	if primary:
		for state_name: String in ["normal","hover","pressed","disabled"]:
			var fill := Color("2d6072") if state_name=="normal" else Color("39758a") if state_name=="hover" else Color("244d60")
			if state_name=="disabled": fill=Color("b9cdd1")
			button.add_theme_stylebox_override(state_name,GameTheme.box(fill,Color("d9c796aa"),3,6))
		button.add_theme_color_override("font_color",Color("f4edda"))
		button.add_theme_color_override("font_hover_color",Color("fff4c9"))
		button.add_theme_color_override("font_pressed_color",Color("fff4c9"))
	else: _style_secondary(button)
	return button

func _style_secondary(button: Button,selected := false) -> void:
	# Low-relief ink tabs and secondary actions leave the carved jade treatment
	# to the current page's main action. All retain native focus and hit targets.
	GameTheme.style_tab(button,selected,6)

func _heading(parent: Node,title: String,subtitle := "") -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation",8)
	parent.add_child(row)
	var label := _line(row,title,20,GameTheme.INK)
	if GameTheme.heading_font!=null: label.add_theme_font_override("font",GameTheme.heading_font)
	if not subtitle.is_empty():
		var note := _line(row,subtitle,12,GameTheme.MUTED)
		note.size_flags_horizontal=Control.SIZE_SHRINK_END
		note.custom_minimum_size.x=note.get_theme_font("font").get_string_size(subtitle,HORIZONTAL_ALIGNMENT_LEFT,-1,12).x
		note.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT
	var rule := HSeparator.new()
	var rule_style := StyleBoxLine.new()
	rule_style.color=Color(GameTheme.GOLD,0.28)
	rule_style.thickness=1
	rule.add_theme_stylebox_override("separator",rule_style)
	rule.add_theme_constant_override("separation",3)
	parent.add_child(rule)

func _line(parent: Node,text: String,font_size := 14,color := GameTheme.TEXT) -> Label:
	var label: Label=app.label(parent,text,font_size,color)
	label.autowrap_mode=TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	label.tooltip_text=text
	return label

func _text(parent: Node,text: String,font_size := 14,color := GameTheme.TEXT) -> Label:
	return app.label(parent,text,font_size,color)

func _clear(node: Node) -> void:
	for child in node.get_children(): node.remove_child(child); child.queue_free()

func _select_tab(value: String) -> void:
	selected_tab=value
	app.set_meta("hero_tab",value)
	_fill_tab()

func _fill_tab() -> void:
	_clear(panel)
	for key in tab_buttons:
		tab_buttons[key].disabled=key==selected_tab
		_style_secondary(tab_buttons[key],key==selected_tab)
	match selected_tab:
		"培养": _cultivation_panel()
		"神通": _skills_panel()
		"灵宝": _treasure_panel()
		"装备": _equipment_panel()
		"仙人志": _lore_panel()
	_resize_layout()
	_apply_density(panel)
	for button: Button in tab_buttons.values(): _apply_density(button)
	_settle_content_bounds.call_deferred()

func _cultivation_panel() -> void:
	if not _owned():
		_heading(panel,"仙缘未至")
		_text(panel,"结缘后可以培养、修复灵宝和穿戴五件装备。演武可先试用完整机制。",15,GameTheme.JADE)
		_text(panel,str(_guide().get("role",GameData.character(character_id).skillDescription)),14)
		_button(panel,"前往常驻召请",app._go.bind(3),true)
		return
	var state: Dictionary=app.state()
	var cultivation := _cultivation()
	var stats := GameEquipment.character_stats(state,character_id)
	_heading(panel,"修为 %d / 20" % cultivation.level,"当前属性")
	var grid := GridContainer.new()
	grid.columns=2
	grid.add_theme_constant_override("v_separation",5)
	grid.add_theme_constant_override("h_separation",20)
	panel.add_child(grid)
	for pair in [["生命",stats.hp],["攻击",stats.atk],["防御",stats.def],["速度",stats.speed]]:
		var stat := HBoxContainer.new()
		stat.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		stat.add_theme_constant_override("separation",6)
		grid.add_child(stat)
		_line(stat,str(pair[0]),12,GameTheme.MUTED)
		_line(stat,str(pair[1]),19,GameTheme.INK).horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT
	_line(panel,"暴击 %.1f%% · 暴伤 %.1f%%" % [stats.critRate*100,stats.critDamage*100],13)
	var level := int(cultivation.level)
	_line(panel,"下一阶："+app.cost(GameEconomy.upgrade_cost(level)) if level<20 else "已达修为上限",13,GameTheme.MUTED)
	var actions := HBoxContainer.new()
	panel.add_child(actions)
	_button(actions,"提升修为",app._train.bind(character_id),true,level>=20)
	_button(actions,"返还培养投入",app._reset_character.bind(character_id),false,level<=1)
	_line(panel,"可返还："+app.cost(cultivation.get("spent",{})),12,GameTheme.MUTED)

func _branch_view(value: String) -> void:
	branch_page=value
	app.set_meta("hero_branch_page",value)
	_fill_tab()

func _skills_panel() -> void:
	var hero := GameData.character(character_id)
	var options := HBoxContainer.new()
	panel.add_child(options)
	for key in ["神通","A","B"]:
		var choice := _button(options,key if key=="神通" else "分支 "+key,_branch_view.bind(key))
		choice.custom_minimum_size.y=36
		_style_secondary(choice,key==branch_page)
	if branch_page=="神通":
		_heading(panel,str(hero.skillName))
		_text(panel,str(hero.skillDescription),14,GameTheme.JADE)
		_line(panel,"普攻 · "+str(hero.attackName),14)
		_text(panel,"被动 · "+str(hero.passiveDescription),14)
	else:
		var cultivation := _cultivation()
		var index := 0 if branch_page=="A" else 1
		_heading(panel,"神通分支 "+branch_page)
		_text(panel,str(hero.branches[index]),16,GameTheme.JADE)
		if _owned():
			var locked: bool=int(cultivation.level)<3 and not app.state().branchUnlocks.has(character_id)
			_line(panel,"当前领悟 · 分支 "+str(cultivation.branch),14,GameTheme.MUTED)
			_button(panel,"修为3级解锁" if locked else "当前分支" if cultivation.branch==branch_page else "领悟此分支",app._switch_branch.bind(character_id,branch_page),true,locked or cultivation.branch==branch_page)
		else: _text(panel,"结缘并达到修为3级后，可免费切换已开放神通分支。",14,GameTheme.MUTED)

func _treasure_panel() -> void:
	var hero := GameData.character(character_id)
	var cultivation := _cultivation()
	_heading(panel,str(hero.treasure))
	_text(panel,str(hero.treasureEffect),15,GameTheme.JADE)
	_line(panel,"当前修复 %d / 3阶" % cultivation.treasure if _owned() else "结缘后开启灵宝修复",18)
	if _owned():
		var level := int(cultivation.treasure)
		_line(panel,"修复投入："+app.cost(GameEconomy.treasure_cost(level)) if level<3 else "三阶已全部修复",13,GameTheme.MUTED)
		_button(panel,"修复下一阶",app._repair.bind(character_id),true,level>=3)
	_text(panel,"历练与仙府生产可积累材料；每阶修复确定生效。",13,GameTheme.MUTED)

func _equipment_panel() -> void:
	if not _owned():
		_heading(panel,"五件装备")
		_text(panel,"结缘后可穿戴五件装备，强化等级与套装属性计入真实战力。",15,GameTheme.JADE)
		_button(panel,"先在演武试用",app._try_character.bind(character_id),true)
		return
	_heading(panel,"五件装备","战力 %d" % GameEquipment.character_power(app.state(),character_id))
	var grid := GridContainer.new()
	grid.columns=5
	grid.add_theme_constant_override("h_separation",4)
	panel.add_child(grid)
	for cfg: Dictionary in GameEquipment.slots():
		var slot := str(cfg.id)
		var artifact_id := str(app.state().equipment.equipped.get(character_id,{}).get(slot,""))
		var item := GameEquipment.item(app.state(),artifact_id)
		var button := _button(grid,"",app._gear_choices.bind(character_id,slot))
		button.custom_minimum_size=Vector2(0,90)
		button.set_meta("equipment_slot",slot)
		var content := VBoxContainer.new()
		content.mouse_filter=Control.MOUSE_FILTER_IGNORE
		content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		content.offset_top=5
		content.offset_bottom=-5
		content.add_theme_constant_override("separation",1)
		button.add_child(content)
		var icon: TextureRect=app.picture(content,"res://assets/ui/%s.svg" % slot,34)
		var title := _line(content,str(cfg.name),12,GameTheme.TEXT)
		title.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
		var note := _line(content,"未装备" if item.is_empty() else "+%d · %d★" % [item.level,item.rarity],11,GameTheme.MUTED if item.is_empty() else GameTheme.GOLD)
		note.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
		button.tooltip_text="选择"+str(cfg.name) if item.is_empty() else GameEquipment.describe_item(item)
	var actions := HBoxContainer.new()
	panel.add_child(actions)
	_button(actions,"一键搭配",func() -> void: app.command("equipBestArtifacts",{"characterId":character_id}),true)
	_button(actions,"装备背包",app._gear_bag)
	_button(actions,"属性与套装",_equipment_details)

func _equipment_details() -> void:
	var box: VBoxContainer=app._modal("装备属性与套装")
	var stats := GameEquipment.character_stats(app.state(),character_id)
	_text(box,"生命%d · 攻击%d · 防御%d · 速度%s\n暴击率%.1f%% · 暴伤%.1f%%" % [stats.hp,stats.atk,stats.def,str(stats.speed),stats.critRate*100,stats.critDamage*100],16,GameTheme.JADE)
	for bonus: Dictionary in GameEquipment.set_bonuses(app.state(),character_id):
		_text(box,"%s %d件 · %s" % [bonus.name,bonus.pieces,bonus.description],15,GameTheme.GOLD)
	for cfg: Dictionary in GameEquipment.slots():
		var artifact_id := str(app.state().equipment.equipped.get(character_id,{}).get(cfg.id,""))
		if not artifact_id.is_empty():
			var item := GameEquipment.item(app.state(),artifact_id)
			_button(box,GameEquipment.display_name(item),app._gear_detail.bind(artifact_id))

func _lore_view(value: String) -> void:
	lore_page=value
	app.set_meta("hero_lore_page",value)
	_fill_tab()

func _lore_panel() -> void:
	var hero := GameData.character(character_id)
	var guide := _guide()
	var choices := HBoxContainer.new()
	panel.add_child(choices)
	var biography := _button(choices,"仙人身世",_lore_view.bind("身世"))
	biography.custom_minimum_size.y=36
	_style_secondary(biography,lore_page=="身世")
	var synergy := _button(choices,"阵容配合",_lore_view.bind("配合"))
	synergy.custom_minimum_size.y=36
	_style_secondary(synergy,lore_page!="身世")
	if lore_page=="身世":
		_heading(panel,str(hero.name),str(hero.faction))
		_text(panel,str(hero.background),16,GameTheme.JADE)
		_text(panel,str(guide.get("role",hero.skillDescription)),14)
	else:
		_text(panel,str(guide.get("role",hero.skillDescription)),15,GameTheme.JADE)
		_text(panel,str(guide.get("tip","先了解神通与被动，再按当前真实阵容选择配合。")),14)
		var names: PackedStringArray=[]
		for id in guide.get("partners",[]): names.append(app.char_name(id))
		if not names.is_empty(): _line(panel,"推荐配合："+ "、".join(names),13,GameTheme.GOLD)
		_button(panel,"查看四条协同路线",app._synergy)

func _show_challenges() -> void:
	var box: VBoxContainer=app._modal("法相试炼 · "+app.char_name(character_id))
	app._character_challenges(box,character_id)
