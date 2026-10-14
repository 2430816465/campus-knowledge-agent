class_name EstateScreen
extends VBoxContainer
## Dedicated estate controls. Every committed action crosses the application's
## GameStore transaction; visual previews never modify the economic dictionary.
const PAPER := GameTheme.PANEL
const INK := GameTheme.INK
const JADE := GameTheme.JADE
const GOLD := GameTheme.GOLD
const MUTED := GameTheme.MUTED
const CATEGORIES := {"经营":["farm","mine","warehouse"],"工坊":["alchemy","forge","relicworkshop"],"修行":["library","arena"]}
var app: Node
var view: EstateView
var mode := "inspect"
var category := "经营"
var chosen_type := ""
var chosen_building := ""
var chosen_plot := ""
var pending: Dictionary = {}
var summary_label: Label
var status_label: Label
var inspector: VBoxContainer
var catalogue: VBoxContainer
var expansion: VBoxContainer
var facility_list: VBoxContainer
var catalog_grid: GridContainer
var action_buttons: Dictionary = {}
var category_buttons: Dictionary = {}
var region_buttons: Array[Button] = []
var _catalog_signature := ""
var preview_bar: PanelContainer
var preview_controls: VBoxContainer
var catalogue_index := 0
var expansion_index := 0
var map_frame: PanelContainer
var heading_row: HBoxContainer
var camera_buttons: Array[Button] = []
var compact := false
var _density_busy := false

static func build(application: Node, parent: Node) -> EstateScreen:
	var screen := EstateScreen.new()
	screen.name = "IndependentEstateScreen"
	screen.app = application
	parent.add_child(screen)
	return screen

static func build_offer(state: Dictionary, kind: String, plot_id := "") -> Dictionary:
	var cfg := GameData.named(GameEconomy.get_building_types(),kind)
	var reason := ""
	var count := 0
	var plots: Array[String] = []
	for b in state.buildings:
		if b.type == kind: count += 1
	if cfg.is_empty(): reason = "未知设施"
	elif cfg.get("fixed",false): reason = "固定地标"
	elif not state.unlockedRegions.has(int(cfg.region)): reason = "融入章节核心后开放"
	elif count >= int(cfg.max): reason = "已达数量上限"
	for p in GameEconomy.get_all_plots():
		if not cfg.is_empty() and GameEconomy.check_plot(state,str(p.id),kind).is_empty(): plots.append(str(p.id))
	if reason.is_empty() and not plot_id.is_empty(): reason = GameEconomy.check_plot(state,plot_id,kind)
	if reason.is_empty() and plots.is_empty(): reason = "先开拓空地"
	if reason.is_empty() and not GameEconomy.can_afford(state,cfg.cost): reason = "资源不足"
	return {"ok":reason.is_empty(),"reason":reason,"cost":cfg.get("cost",{}),"count":count,"max":cfg.get("max",0),"duration":cfg.get("duration",0),"plots":plots,"cfg":cfg}

static func overview(state: Dictionary, now := -1) -> Dictionary:
	var available := 0
	var stock := 0
	var constructing := 0
	var producing := 0
	for p in GameEconomy.get_all_plots():
		if GameEconomy.plot_unlocked(state,str(p.id)): available += 1
	for b in state.buildings:
		var info := GameEconomy.get_building_status(state,str(b.id),now)
		stock += int(info.get("pendingCount",0))
		if info.get("construction")=="building": constructing += 1
		if info.get("production")=="producing": producing += 1
	return {"land":available,"buildings":state.buildings.size(),"stock":stock,"construction":constructing,"production":producing}

func _ready() -> void:
	compact = _compact_needed()
	add_theme_constant_override("separation",6)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	custom_minimum_size = Vector2.ZERO
	var head := _panel(self,GameTheme.PANEL,JADE,6)
	head.add_theme_constant_override("separation",3)
	heading_row = HBoxContainer.new()
	head.add_child(heading_row)
	var title := _label(heading_row,"云海仙府",22,INK)
	title.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	title.autowrap_mode = TextServer.AUTOWRAP_OFF
	title.custom_minimum_size.x = 128
	summary_label = _label(heading_row,"",12,MUTED)
	summary_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	summary_label.autowrap_mode=TextServer.AUTOWRAP_OFF
	summary_label.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	var region_row := HBoxContainer.new()
	head.add_child(region_row)
	for i in range(3):
		var index := i
		var btn := _button(region_row,["灵泉庭院","丹器别院","演法台地"][i],func() -> void: _visit_region(index))
		btn.add_theme_font_size_override("font_size",13)
		btn.custom_minimum_size.y = 36
		GameTheme.style_tab(btn,false,8)
		region_buttons.append(btn)
	map_frame = PanelContainer.new()
	map_frame.name = "EstateMapFrame"
	map_frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_frame.add_theme_stylebox_override("panel",GameTheme.box(Color("d4e4ed"),GOLD,16,3))
	add_child(map_frame)
	view = load("res://scenes/estate.tscn").instantiate()
	view.custom_minimum_size = Vector2(0,168)
	view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_frame.add_child(view)
	app.set("estate",view)
	view.set_state(_state())
	view.building_selected.connect(_select_building)
	view.plot_selected.connect(_select_plot)
	view.move_previewed.connect(_move_preview)
	view.move_cancelled.connect(_preview_cancelled)
	view.state_changed.connect(_refresh_live)
	view.progression_selected.connect(app._systems_page)
	preview_bar = PanelContainer.new()
	preview_bar.name = "PlacementConfirmationInMap"
	preview_bar.add_theme_stylebox_override("panel",GameTheme.skin("panel",10))
	view.add_child(preview_bar)
	preview_bar.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	preview_bar.offset_left = 8
	preview_bar.offset_right = -8
	preview_bar.offset_top = -100
	preview_bar.offset_bottom = -8
	preview_bar.mouse_filter = Control.MOUSE_FILTER_STOP
	preview_controls = VBoxContainer.new()
	preview_controls.add_theme_constant_override("separation",6)
	preview_bar.add_child(preview_controls)
	preview_bar.visible = false
	var camera_row := HBoxContainer.new()
	add_child(camera_row)
	status_label = _label(camera_row,"巡视仙府",13,JADE)
	status_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	for entry in [["−",func() -> void: view.zoom_by(0.85)],["全景",func() -> void: view.reset_camera()],["＋",func() -> void: view.zoom_by(1.18)]]:
		var camera_button := _button(camera_row,str(entry[0]),entry[1])
		camera_button.size_flags_horizontal = Control.SIZE_SHRINK_END
		camera_button.custom_minimum_size.x = 72 if str(entry[0])=="全景" else 44
		camera_button.custom_minimum_size.y = 36
		camera_button.add_theme_stylebox_override("normal",GameTheme.skin("button",8))
		camera_buttons.append(camera_button)
	var actions := HBoxContainer.new()
	add_child(actions)
	move_child(actions,1)
	for entry in [["build","建造"],["expand","扩地"],["edit","布局"],["harvest","收取"]]:
		var key := str(entry[0])
		action_buttons[key] = _button(actions,str(entry[1]),_action.bind(key),key=="harvest")
		action_buttons[key].add_theme_font_size_override("font_size",14)
		if key!="harvest": action_buttons[key].add_theme_stylebox_override("normal",GameTheme.skin("button",8))
	inspector = _panel(self,PAPER,GOLD,6)
	inspector.add_theme_constant_override("separation",4)
	inspector.name = "SelectionAndConfirmation"
	catalogue = _panel(self,GameTheme.PANEL,Color("9eb6c2"),6)
	catalogue.add_theme_constant_override("separation",4)
	catalogue.name = "ConstructionCatalogue"
	var categories := HBoxContainer.new()
	catalogue.add_child(categories)
	for name_value in CATEGORIES:
		var key := str(name_value)
		category_buttons[key] = _button(categories,key,func() -> void: category=key; catalogue_index=0; _catalog_signature=""; _render_catalogue())
		category_buttons[key].custom_minimum_size.y = 36
		GameTheme.style_tab(category_buttons[key],key==category)
	for direction in [-1,1]:
		var pager := _button(categories,"‹" if direction<0 else "›",_cycle_catalogue.bind(direction))
		pager.custom_minimum_size=Vector2(36,36)
		pager.size_flags_horizontal=Control.SIZE_SHRINK_END
	catalog_grid = GridContainer.new()
	catalogue.add_child(catalog_grid)
	expansion = _panel(self,PAPER,GOLD,6)
	expansion.name = "ExpansionEntrance"
	facility_list = VBoxContainer.new()
	add_child(facility_list)
	facility_list.visible = false
	facility_list.name = "EstateProductionOverview"
	resized.connect(_resize_layout)
	var page_area: Control = app.get("body_scroll")
	if page_area != null: page_area.resized.connect(_resize_layout,CONNECT_DEFERRED)
	_set_mode("edit" if app.get("estate_editing") else "inspect")
	_resize_layout()
	_refresh_live()

func _state() -> Dictionary:
	return app.call("state")

func _now() -> int:
	var store: GameStore = app.get("store")
	return store.now_ms()

func _label(parent: Node, text: String, font_size := 16, color := INK) -> Label:
	var label := GameTheme.label(text,font_size,color)
	parent.add_child(label)
	return label

func _button(parent: Node, text: String, callback: Callable, primary := false, disabled := false) -> Button:
	var button := GameTheme.button(text,callback,primary,disabled)
	button.custom_minimum_size.y = 44
	button.add_theme_font_size_override("font_size",15)
	GameTheme.style_button(button,primary,6)
	button.set_meta("estate_primary",primary)
	parent.add_child(button)
	return button

func _panel(parent: Node, color: Color, border: Color, pad: int) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel",GameTheme.box(color,border,14,pad))
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation",8)
	panel.add_child(box)
	return box

func _clear(parent: Node) -> void:
	for child in parent.get_children():
		parent.remove_child(child)
		child.queue_free()

func _resize_layout() -> void:
	if _density_busy or view == null: return
	_density_busy = true
	compact = _compact_needed()
	# Controls keep a bounded minimum; the map expands into all remaining space.
	# The whole estate stays one native page even in the 320 x 568 shell.
	if catalog_grid != null: catalog_grid.columns = 1
	heading_row.visible = not compact
	_density(self)
	view.custom_minimum_size.y = 100 if compact else 168
	map_frame.add_theme_stylebox_override("panel",GameTheme.box(Color("d4e4ed"),GOLD,8 if compact else 16,2 if compact else 3))
	for button: Button in camera_buttons:
		button.custom_minimum_size.x = (44 if button.text=="全景" else 28) if compact else (72 if button.text=="全景" else 44)
	preview_bar.offset_top = -64 if compact else -100
	preview_bar.offset_bottom = -4 if compact else -8
	preview_bar.offset_left = 4 if compact else 8
	preview_bar.offset_right = -4 if compact else -8
	if view._hint != null:
		view._hint.text = {"inspect":"拖动巡视 · 双指缩放 · 点选设施","build":"选建筑 → 点空地 → 确认开工","expand":"选下方地块 · 查看开拓成本","edit":"拖动建筑 → 确认搬迁"}.get(mode,"") if compact else {"inspect":"拖动空地巡视  ·  滚轮 / 双指缩放  ·  点选设施","build":"建造模式 · 选择建筑后点选绿色地块 · 确认开工","expand":"扩地模式 · 金色边框为可开拓地块 · 选择后查看成本","edit":"布局模式 · 拖动建筑到空地 · 确认后搬迁"}.get(mode,"")
	_update_region_text()
	_density_busy = false

func _compact_needed() -> bool:
	var area: Control = app.get("body_scroll")
	return app.get_viewport().get_visible_rect().size.x <= 360 or (area != null and area.size.y>0 and area.size.y<480)

func _density(node: Node) -> void:
	if node == view: # Leave the native world and its picking geometry untouched.
		_density(preview_bar)
		return
	if node is BoxContainer:
		if not node.has_meta("estate_spacing"): node.set_meta("estate_spacing",node.get_theme_constant("separation"))
		node.add_theme_constant_override("separation",3 if compact else int(node.get_meta("estate_spacing")))
	if node is PanelContainer:
		var style: StyleBox = node.get_theme_stylebox("panel").duplicate()
		if not node.has_meta("estate_padding"): node.set_meta("estate_padding",style.content_margin_top)
		style.set_content_margin_all(3 if compact else float(node.get_meta("estate_padding")))
		node.add_theme_stylebox_override("panel",style)
	if node is Label:
		if not node.has_meta("estate_font"): node.set_meta("estate_font",node.get_theme_font_size("font_size"))
		node.add_theme_font_size_override("font_size",mini(12,int(node.get_meta("estate_font"))) if compact else int(node.get_meta("estate_font")))
	if node is Button:
		if not node.has_meta("estate_min"): node.set_meta("estate_min",node.custom_minimum_size)
		if not node.has_meta("estate_font"): node.set_meta("estate_font",node.get_theme_font_size("font_size"))
		node.custom_minimum_size = Vector2(minf(float(node.get_meta("estate_min").x),28),28) if compact else node.get_meta("estate_min")
		node.add_theme_font_size_override("font_size",12 if compact else int(node.get_meta("estate_font")))
		node.autowrap_mode = TextServer.AUTOWRAP_OFF
		node.clip_text = true
		if node.has_meta("silk_tab"):
			GameTheme.style_tab(node,node.disabled,3 if compact else 6)
		else:
			GameTheme.style_button(node,bool(node.get_meta("estate_primary",false)),3 if compact else 6)
			node.add_theme_stylebox_override("disabled",GameTheme.silk("ribbon",Color("d1dde5"),3 if compact else 6))
		if not node.size_flags_horizontal & Control.SIZE_EXPAND:
			var text_width: float = node.get_theme_font("font").get_string_size(node.text,HORIZONTAL_ALIGNMENT_LEFT,-1,node.get_theme_font_size("font_size")).x
			node.custom_minimum_size.x = maxf(node.custom_minimum_size.x,text_width+node.get_theme_stylebox("normal").get_minimum_size().x)
	if node is TextureRect:
		if not node.has_meta("estate_min"): node.set_meta("estate_min",node.custom_minimum_size)
		node.custom_minimum_size = Vector2(42,48) if compact else node.get_meta("estate_min")
	for child: Node in node.get_children(): _density(child)

func _update_region_text() -> void:
	for i: int in region_buttons.size():
		var unlocked: bool = _state().unlockedRegions.has(i)
		region_buttons[i].text = (["灵泉庭院","丹器别院","演法台地"][i] if unlocked else ["灵泉·待开","丹器·待开","演法·待开"][i]) if compact else ["灵泉庭院","丹器别院","演法台地"][i]+("" if unlocked else " · 待开")

func _action(key: String) -> void:
	if key=="harvest":
		var result := _commit("harvest",{})
		if result.get("ok",false): app.call("toast","实际收取："+str(app.call("_result_text",result.data))); _cue("harvest")
		return
	_set_mode("inspect" if mode==key else key)

func _set_mode(value: String) -> void:
	view.cancel_move(false)
	pending.clear()
	mode = value
	app.set("estate_editing",mode=="edit")
	view.set_editing(mode=="edit")
	view.set_construction_mode(mode=="build",mode=="expand")
	catalogue.get_parent().visible = mode=="build"
	expansion.get_parent().visible = mode=="expand"
	inspector.get_parent().visible = mode in ["inspect","edit"]
	for key in ["build","expand","edit"]:
		action_buttons[key].text = {"build":"退出建造","expand":"退出扩地","edit":"完成布局"}[key] if mode==key else {"build":"建造","expand":"扩地","edit":"布局"}[key]
	if mode=="build": _render_catalogue()
	if mode=="expand": _render_expansion()
	_render_inspector()
	_refresh_live()
	_resize_layout()

func _visit_region(index: int) -> void:
	if not _state().unlockedRegions.has(index):
		app.call("toast","此院尚待修复，完成主线并融入章节核心后开放。")
		return
	view.focus_region(index)

func _select_building(id: String) -> void:
	chosen_building = id
	chosen_plot = str(GameEconomy.building(_state(),id).get("plot",""))
	view.highlight_plot(chosen_plot)
	_render_inspector()

func _select_plot(id: String) -> void:
	chosen_plot = id
	view.highlight_plot(id)
	if mode=="edit" and not chosen_building.is_empty():
		if not view.preview_move(chosen_building,id): app.call("toast","请选择本院已开拓的空地；固定地标不可搬迁。")
	elif mode=="build" and not chosen_type.is_empty():
		var offer := build_offer(_state(),chosen_type,id)
		if view.preview_build(chosen_type,id):
			pending = {"action":"build","type":chosen_type,"plot":id}
		else: app.call("toast",str(offer.reason))
	elif mode=="inspect": chosen_building=""; view.select_building("")
	_render_inspector()

func _choose_type(kind: String) -> void:
	chosen_type = kind
	chosen_building = ""
	view.cancel_move(false)
	pending.clear()
	var offer := build_offer(_state(),kind)
	if not offer.plots.is_empty(): view.focus_plot(str(offer.plots[0]))
	_render_inspector()
	_catalog_signature=""
	_render_catalogue()

func _move_preview(id: String, plot_id: String) -> void:
	chosen_building = id
	chosen_plot = plot_id
	pending = {"action":"moveBuilding","id":id,"plot":plot_id}
	_render_inspector()

func _preview_cancelled() -> void:
	pending.clear()
	if is_instance_valid(inspector): _render_inspector()

func _cancel_preview() -> void:
	view.cancel_move()

func _confirm_preview() -> void:
	if pending.is_empty(): return
	var operation := pending.duplicate(true)
	var action := str(operation.action)
	operation.erase("action")
	var result := _commit(action,operation)
	if result.get("ok",false):
		view.cancel_move(false)
		pending.clear()
		if action=="build": _cue("build"); app.call("toast","已确认开工，施工完成后开始经营。")
		else: app.call("toast","搬迁已保存，等级、主持与生产队列已保留。")
		_render_inspector()

func _commit(action: String, args: Dictionary) -> Dictionary:
	var result: Dictionary = app.call("command",action,args,false)
	if result.get("ok",false):
		app.call("_update_wallet")
		view.set_state(_state())
	return result

func _cue(name_value: String) -> void:
	var audio: GameAudio = app.get("audio")
	if audio != null: audio.cue(name_value)

func _refresh_live() -> void:
	if summary_label==null: return
	var state := _state()
	var info := overview(state,_now())
	summary_label.text = "%d设施 · %d地块 · %d运转" % [info.buildings,info.land,info.production]
	status_label.text = {"inspect":"巡视仙府","build":"选择建筑 → 点选空地","expand":"开拓新地，拓展仙府","edit":"拖动建筑 → 确认搬迁"}.get(mode,"巡视仙府")
	action_buttons.harvest.text = "收取 %d" % info.stock if info.stock>0 else "收取"
	action_buttons.harvest.disabled = info.stock==0
	_update_region_text()
	if mode=="build": _render_catalogue()
	if mode=="expand": _render_expansion()
	_render_inspector()

func _render_inspector() -> void:
	_clear(inspector)
	_render_preview_bar()
	var state := _state()
	var b := GameEconomy.building(state,chosen_building)
	if not b.is_empty():
		var cfg := GameData.named(GameEconomy.get_building_types(),str(b.type))
		var info := GameEconomy.get_building_status(state,str(b.id),_now())
		var header_row := HBoxContainer.new()
		inspector.add_child(header_row)
		_line(header_row,"%s · %d阶" % [cfg.name,b.level],18)
		_line(header_row,_facility_status(b,info),13,JADE).horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT
		var controls := HBoxContainer.new()
		inspector.add_child(controls)
		_button(controls,"管理设施",func() -> void: app.call("_show_building",str(b.id)),true)
		if mode!="edit" and not cfg.get("fixed",false): _button(controls,"调整位置",func() -> void: _set_mode("edit"))
		if info.get("pending",false): _button(controls,"收取产物",func() -> void: _collect_one(str(b.id)),true)
		else: _button(controls,"生产管理",_show_production.bind(0))
	else:
		_line(inspector,"拖动建筑，或选建筑后点空地。" if mode=="edit" else "点选建筑管理经营，建造和扩地可添置设施。",13,MUTED)
		var controls := HBoxContainer.new()
		inspector.add_child(controls)
		_button(controls,"生产管理",_show_production.bind(0),true)
		_button(controls,"添置设施",func() -> void: _set_mode("build"))
		_button(controls,"府库与工程",_open_affairs)
	_resize_layout()

func _line(parent: Node, text: String, font_size := 14, color := INK) -> Label:
	var label := _label(parent,text,font_size,color)
	label.autowrap_mode=TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	label.tooltip_text=text
	return label

func _open_affairs() -> void:
	app.set("subpage","背包")
	app.call("_go",4)

func _render_preview_bar() -> void:
	if preview_bar==null: return
	preview_bar.visible = not pending.is_empty()
	_clear(preview_controls)
	if pending.is_empty(): return
	var b := GameEconomy.building(_state(),str(pending.get("id","")))
	var kind := str(pending.get("type",b.get("type","")))
	var cfg := GameData.named(GameEconomy.get_building_types(),kind)
	_label(preview_controls,"预览 · %s → %s" % [cfg.get("name",kind),str(pending.plot).to_upper()],14)
	var controls := HBoxContainer.new()
	preview_controls.add_child(controls)
	var disabled: bool = not build_offer(_state(),kind,str(pending.plot)).ok if pending.action=="build" else false
	_button(controls,"确认开工" if pending.action=="build" else "确认搬迁",_confirm_preview,true,disabled)
	_button(controls,"取消",_cancel_preview)

func _facility_status(b: Dictionary, info: Dictionary) -> String:
	var text := "运转中" if info.get("production")=="producing" else "待命"
	if info.get("construction")=="building": text = "施工中 · 约%d秒" % maxi(0,int(ceil((int(b.readyAt)-_now())/1000.0)))
	elif info.get("production")=="storage-full": text="满仓暂停 · 请及时收取"
	elif info.get("production")=="missing-materials": text="材料不足 · 补充后安排工序"
	if info.get("pending",false): text += " · 待领%d" % int(info.pendingCount)
	if b.get("pendingPlacement",false): text="待安置 · 请选择合法地块"
	return text

func _collect_one(id: String) -> void:
	var result := _commit("harvestBuilding",{"id":id})
	if result.get("ok",false): _cue("harvest"); app.call("toast","实际收取："+str(app.call("_result_text",result.data)))

func _render_catalogue() -> void:
	var state := _state()
	var signature := JSON.stringify([category,catalogue_index,chosen_type,state.resources,state.unlockedRegions,state.get("expandedPlots",[]),state.buildings])
	if signature==_catalog_signature: return
	_catalog_signature = signature
	_clear(catalog_grid)
	var entries: Array = CATEGORIES[category]
	catalogue_index=posmod(catalogue_index,entries.size())
	var kind := str(entries[catalogue_index])
	var offer := build_offer(state,kind)
	var cfg: Dictionary = offer.cfg
	var card := HBoxContainer.new()
	card.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	catalog_grid.add_child(card)
	var image := TextureRect.new()
	var meta := BuildingView.visual_metadata(kind,1)
	image.texture = load(str(meta.get("path","res://assets/buildings/"+str(BuildingView.ASSETS.get(kind,"")))))
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	image.custom_minimum_size=Vector2(68,80)
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(image)
	var details := VBoxContainer.new()
	details.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	details.add_theme_constant_override("separation",3)
	card.add_child(details)
	_line(details,"%s · %d/%d　%d/%d" % [cfg.name,offer.count,offer.max,catalogue_index+1,entries.size()],16)
	_line(details,"%s · %d秒" % [str(app.call("cost",offer.cost)),int(offer.duration/1000)],13,JADE)
	var selected := chosen_type==kind
	_button(details,("已选 · 点选空地" if selected else "选择落点") if offer.ok else str(offer.reason),_choose_type.bind(kind),offer.ok,not offer.ok)
	for key in category_buttons:
		category_buttons[key].disabled = key==category
		GameTheme.style_tab(category_buttons[key],key==category,3 if compact else 6)
	_resize_layout()

func _cycle_catalogue(direction: int) -> void:
	catalogue_index=posmod(catalogue_index+direction,CATEGORIES[category].size())
	_catalog_signature=""
	_render_catalogue()

func _render_expansion() -> void:
	_clear(expansion)
	var state := _state()
	var candidates: Array[Dictionary] = []
	for plot in GameEconomy.get_all_plots():
		if not plot.get("expansion",false) or state.get("expandedPlots",[]).has(plot.id): continue
		if not state.unlockedRegions.has(int(plot.region)): continue
		candidates.append(plot)
	if candidates.is_empty():
		_line(expansion,"当前区域已开拓完毕",17)
		_line(expansion,"融入章节核心可开放下一座别院。",13,MUTED)
		_button(expansion,"前往府库融入成果",_open_affairs)
		_resize_layout()
		return
	expansion_index=posmod(expansion_index,candidates.size())
	var plot: Dictionary = candidates[expansion_index]
	var heading := HBoxContainer.new()
	expansion.add_child(heading)
	_line(heading,"开拓 %s · %d/%d" % [str(plot.id).to_upper(),expansion_index+1,candidates.size()],17)
	for direction in [-1,1]:
		var pager := _button(heading,"‹" if direction<0 else "›",_cycle_expansion.bind(direction))
		pager.custom_minimum_size=Vector2(36,36)
		pager.size_flags_horizontal=Control.SIZE_SHRINK_END
	var info := GameEconomy.expansion_info(state,str(plot.id))
	var row := HBoxContainer.new()
	expansion.add_child(row)
	var details := VBoxContainer.new()
	details.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	details.add_theme_constant_override("separation",3)
	row.add_child(details)
	_line(details,EstateView.REGION_NAMES[int(plot.region)]+(" · 滋养位" if plot.get("nourished",false) else " · 新建筑用地"),14)
	_line(details,str(app.call("cost",info.cost)),13,JADE)
	var button := _button(row,"选择开拓" if info.ok else "资源不足",_expand_confirm.bind(str(plot.id)),info.ok,not info.ok)
	button.size_flags_horizontal=Control.SIZE_SHRINK_END
	_resize_layout()

func _cycle_expansion(direction: int) -> void:
	expansion_index+=direction
	_render_expansion()

func _expand_confirm(id: String) -> void:
	chosen_plot = id
	view.highlight_plot(id)
	view.focus_plot(id)
	var info := GameEconomy.expansion_info(_state(),id)
	app.call("_confirm","开拓 "+id.to_upper(),"消耗 "+str(app.call("cost",info.cost))+"\n开拓后立即形成真实地面，可用于建设和搬迁。",func() -> void:
		var result := _commit("expandPlot",{"plot":id})
		if result.get("ok",false): _cue("build"); app.call("toast","新地块已开拓，仙府疆域扩大。"))

func _show_production(page_index: int) -> void:
	var box: VBoxContainer = app.call("_modal","仙府生产与设施")
	var buildings: Array = _state().buildings
	var pages := maxi(1,int(ceil(buildings.size()/3.0)))
	page_index=posmod(page_index,pages)
	for b in buildings.slice(page_index*3,mini(buildings.size(),page_index*3+3)):
		var info := GameEconomy.get_building_status(_state(),str(b.id),_now())
		var cfg := GameData.named(GameEconomy.get_building_types(),str(b.type))
		var r := HBoxContainer.new()
		box.add_child(r)
		var text := VBoxContainer.new()
		text.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		r.add_child(text)
		_line(text,"%s · %d阶" % [cfg.name,b.level],15)
		_line(text,_facility_status(b,info),13,MUTED)
		var id := str(b.id)
		var button := _button(r,"管理",func() -> void: app.call("_show_building",id),true)
		button.size_flags_horizontal=Control.SIZE_SHRINK_END
		if b.get("pendingPlacement",false): _button(r,"安置",_restore_placement.bind(id))
	var controls := HBoxContainer.new()
	box.add_child(controls)
	_button(controls,"上一页",_show_production.bind(page_index-1),false,pages<=1)
	_line(controls,"%d / %d" % [page_index+1,pages],15).horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	_button(controls,"下一页",_show_production.bind(page_index+1),false,pages<=1)
	_button(box,"收取全部产物",func() -> void: _action("harvest"); _show_production(page_index),true,overview(_state(),_now()).stock==0)

func _restore_placement(id: String) -> void:
	app.call("_close_modal")
	chosen_building=id
	_set_mode("edit")

func _focus_facility(id: String) -> void:
	view.select_building(id)
	_select_building(id)
	view.focus_plot(chosen_plot)
	var scroll: ScrollContainer = app.get("body_scroll")
	if scroll != null: scroll.scroll_vertical=0
