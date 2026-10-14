extends Control
## All game-facing mutations use GameStore's atomic transaction boundary.
const NAV: Array[String] = ["仙府", "神仙", "炼器", "历练", "商城"]
const NAV_PAGES: Array[int] = [0, 1, 5, 2, 8]
var foundation_home: Control
const RESOURCE_NAMES: Dictionary = {"stone":"灵石", "xp":"修为", "material":"灵材", "herb":"灵药", "ticket":"召唤符", "fate":"仙缘"}
const Art = preload("res://scripts/game_illustrated_icon.gd")
var system_view: String = ""
var system_area: String = "修行"
var system_category: String = ""
var store: GameStore
var audio: GameAudio
var page: int = 5
var subpage: String = "主线"
var community_board: String = "power"
var selected_character: String = ""
var filter: String = "全部"
var roster_query: String = ""
var rarity_filter: String = "全部"
var roster_sort: String = "图鉴顺序"
var roster_scroll: int=0
var frame: VBoxContainer
var header: VBoxContainer
var wallet: Label
var resource_labels: Dictionary={}
var body_scroll: ScrollContainer
var body: VBoxContainer
var page_bar: HBoxContainer
var page_pager: PagePager
var modal_pager: PagePager
var nav: HBoxContainer
var overlay: Control
var modal_box: VBoxContainer
var toast_label: Label
var toast_time: float = 0.0
var estate: Control
var estate_editing: bool = false
var battle_view: Control
var battle_context: String = "main"
var last_battle: Dictionary = {}
var settlement: Dictionary = {}
var framework_auto_set: bool = false
var framework_auto_args: Dictionary = {}
var team_draft: Array = []
var trial_ids: Array = ["nezha", "huangfeihu", "bigan", "leizhenzi", "yangjian"]
var trial_current: bool = false
var trial_template: String = "break"
var import_dialog: FileDialog
var export_dialog: FileDialog
var production_timer: float = 0.0
var mock_service: GameOnlineMock
var mock_account: String="test_a"
var mock_device: String="device_1"
var mock_realm: String="normal"
var mock_revision: int=0
var offline_report: Variant
var presentation_suspended: bool=false
var ignore_resume_delta: bool=false
var safe_area_elapsed: float=0.0
var last_safe_rect: Rect2
var mountain_backdrop: Texture2D
var summon_courtyard: Texture2D = SummonMovie.FIRST
var summon_ui_shade: TextureRect

func summon_scene_rect() -> Rect2:
	var source: Vector2=summon_courtyard.get_size()
	var factor: float=maxf(size.x/source.x,size.y/source.y)
	return Rect2((size-source*factor)*0.5,source*factor)

func summon_platform_center() -> Vector2:
	var bounds: Rect2=summon_scene_rect()
	return bounds.position+Vector2(0.5,0.729)*bounds.size

func _ready() -> void:
	DisplayServer.window_set_title("洪荒众仙府 · V0.10 框架测试版"+(" · 货币无消耗" if GameEconomy.free_currency() else ""))
	theme = GameTheme.create()
	get_tree().node_added.connect(GameTheme.refine_node.call_deferred)
	mountain_backdrop=load("res://assets/terrain/distant-cloud-mountains.png")
	store = GameStore.new("user://ui-tests-%s-%s" % [GameData.now_ms(),Time.get_ticks_usec()] if OS.get_cmdline_user_args().has("--ui-test") or get_meta("ui_test",false) else "user://saves")
	var loaded: Variant = store.load_slot("normal")
	var offline: Dictionary=store.transact("advance",{}) if not store.corruption else {"ok":false}
	audio = GameAudio.new()
	add_child(audio)
	audio.configure(state().get("settings", {}))
	_build_shell()
	get_window().focus_exited.connect(_suspend_presentation)
	get_window().focus_entered.connect(_resume_presentation)
	_render()
	if loaded is Dictionary and not loaded.get("ok", true):
		_save_load_error.call_deferred(loaded)
	var args: PackedStringArray = OS.get_cmdline_user_args()
	for arg: String in args:
		if arg.begins_with("--demo="): _load_slot("demo:" + arg.trim_prefix("--demo="))
		if arg.begins_with("--page="):
			page = clampi(int(arg.trim_prefix("--page=")), 0, 8)
			_render()
	if store.slot=="normal" and offline.get("ok",false) and int(offline.get("data",{}).get("elapsedMs",0))>=60000:
		_show_offline(offline.data)
	for arg: String in args:
		if arg=="--battle-trial": _start_trial("break")
		if arg.begins_with("--capture="): _capture_later.call_deferred(arg.trim_prefix("--capture="))
	if state().get("mainBattle") != null:
		toast("有未完成的历练，可在历练页继续锁定战前。")
	elif state().get("characterChallenges",{}).get("active")!=null: toast("有未完成的法相试炼，可在历练页继续或结束本次试炼。")
	elif not state().get("progression",{}).get("realm",{}).get("pending",{}).is_empty(): toast("有未完成的修行试炼，可在百宝阁继续挑战。")
	SummonScreen.recover_pending.call_deferred(self)
	if GameEconomy.free_currency(): toast("测试版：货币免扣，零余额可用；专用材料仍按规则消耗。")

func state() -> Dictionary:
	return store.state

func _process(delta: float) -> void:
	if GameSafeArea.uses_device_safe_area():
		safe_area_elapsed+=minf(delta,0.25)
		if safe_area_elapsed>=0.5:
			safe_area_elapsed=0.0
			if not GameSafeArea.rect_for(self).is_equal_approx(last_safe_rect): _resize_shell()
	var presentation_delta: float=0.0 if presentation_suspended or ignore_resume_delta else minf(delta,0.25)
	ignore_resume_delta=false
	if toast_time > 0:
		toast_time -= presentation_delta
		toast_label.visible = toast_time > 0
	# Production is settled by the authoritative wall clock inside GameStore.
	# A large resumed frame must never accelerate UI timers or loop the economy.
	production_timer += minf(delta,0.25)
	if production_timer >= 5.0:
		production_timer = 0.0
		var before: int = int(state().get("lastTime", 0))
		var constructing_before: Dictionary=_constructing_ids()
		store.heartbeat()
		if store.has_method("tick"): store.call("tick")
		elif store.has_method("advance"): store.call("advance")
		else:
			var advance_result: Dictionary=store.transact("advance", {})
			if advance_result.ok: _construction_feedback(constructing_before)
		if wallet: _update_wallet()
		if is_instance_valid(foundation_home): foundation_home.refresh()
		if is_instance_valid(estate): estate.call("set_state", state())
		if before > int(state().get("lastTime", 0)): toast("时钟校验：本次未追加收益。")

func _suspend_presentation() -> void:
	if presentation_suspended: return
	presentation_suspended=true
	get_viewport().gui_release_focus()
	if is_instance_valid(estate) and estate.has_method("abort_interaction"):
		var had_preview: bool=not str(estate.get("_preview_id")).is_empty()
		estate.call("abort_interaction")
		if had_preview: _close_modal()
	if is_instance_valid(battle_view): battle_view.set_backgrounded(true)
	if is_instance_valid(audio): audio.set_backgrounded(true)

func _resume_presentation() -> void:
	if not presentation_suspended: return
	presentation_suspended=false
	ignore_resume_delta=true
	_resize_shell()
	if is_instance_valid(battle_view): battle_view.set_backgrounded(false)
	if is_instance_valid(audio): audio.set_backgrounded(false)

func _draw() -> void:
	if page==3:
		# This scene is independent of all UI containers. Clean captures use
		# exactly the same viewport and texture transform as the playable page.
		draw_texture_rect(summon_courtyard,summon_scene_rect(),false)
		return
	draw_rect(Rect2(Vector2.ZERO, size), GameTheme.PAPER)
	if mountain_backdrop:
		draw_texture_rect(mountain_backdrop,Rect2(Vector2.ZERO,size),false,Color(0.78,0.92,1,1))
	draw_rect(Rect2(Vector2.ZERO,size),Color(Color("deedf4"),0.52))
	if is_instance_valid(header) and header.visible:
		var bounds: Rect2=header.get_global_rect()
		draw_line(Vector2(bounds.position.x,bounds.end.y+1),Vector2(bounds.end.x,bounds.end.y+1),Color(GameTheme.GOLD,0.45),1,true)
	if is_instance_valid(nav):
		var bounds: Rect2=nav.get_global_rect()
		# A cloud terrace supports free-standing painted icons, without a framed bar.
		var clouds := PackedVector2Array()
		clouds.append(Vector2(0,size.y))
		for n: int in range(33):
			var x: float=size.x*float(n)/32.0
			var y: float=bounds.position.y+25+sin(float(n)*0.65)*7+cos(float(n)*1.4)*3
			clouds.append(Vector2(x,y))
		clouds.append(Vector2(size.x,size.y))
		draw_colored_polygon(clouds,Color("285367"))
		var rim := PackedVector2Array()
		for point: Vector2 in clouds.slice(1,34): rim.append(point)
		draw_polyline(rim,Color(0.8,0.83,0.7,0.65),1.5,true)
		for n: int in range(6):
			var x: float=(n+0.4)*size.x/6.0
			draw_arc(Vector2(x,size.y+12),36+n%3*15,PI*1.1,PI*1.9,24,Color(0.75,0.86,0.9,0.18),2,true)

func _build_shell() -> void:
	summon_ui_shade=TextureRect.new()
	summon_ui_shade.name="SummonUIShade"
	summon_ui_shade.mouse_filter=Control.MOUSE_FILTER_IGNORE
	summon_ui_shade.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	var gradient := Gradient.new()
	gradient.offsets=PackedFloat32Array([0,0.09,0.17,0.65,0.74,1])
	gradient.colors=PackedColorArray([Color("123643e6"),Color("123643c7"),Color("12364300"),Color("12364300"),Color("123643b8"),Color("123643f0")])
	var shade_texture := GradientTexture2D.new()
	shade_texture.gradient=gradient
	shade_texture.fill_from=Vector2(0.5,0); shade_texture.fill_to=Vector2(0.5,1)
	summon_ui_shade.texture=shade_texture
	add_child(summon_ui_shade)
	summon_ui_shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame = VBoxContainer.new()
	add_child(frame)
	frame.add_theme_constant_override("separation", 0)
	resized.connect(_resize_shell)
	header = VBoxContainer.new()
	header.item_rect_changed.connect(queue_redraw)
	header.add_theme_constant_override("separation", 4)
	frame.add_child(header)
	var banner: HBoxContainer = row(header)
	banner.add_theme_constant_override("separation",4)
	var home_shortcut: Button=Art.button(banner,"主页","estate",_go.bind(5),false,false)
	home_shortcut.name="HomeShortcut"
	home_shortcut.custom_minimum_size=Vector2(42,48)
	home_shortcut.size_flags_horizontal=Control.SIZE_SHRINK_BEGIN
	var title: Label = label(banner, "洪荒众仙府", 25, GameTheme.GOLD)
	title.name = "PageTitle"
	title.custom_minimum_size.y = 42
	var summon_shortcut: Button=Art.button(banner,"召唤","summon",_go.bind(3),false,false)
	summon_shortcut.custom_minimum_size=Vector2(36,48)
	summon_shortcut.add_theme_font_size_override("font_size",14)
	summon_shortcut.size_flags_horizontal=Control.SIZE_SHRINK_END
	var system_shortcut: Button=Art.button(banner,"百宝","treasure",_systems_page,false,false)
	system_shortcut.custom_minimum_size=Vector2(36,48)
	system_shortcut.add_theme_font_size_override("font_size",14)
	system_shortcut.size_flags_horizontal=Control.SIZE_SHRINK_END
	var settings_button: Button=button(banner,"",_settings,false)
	settings_button.custom_minimum_size=Vector2(30,40)
	settings_button.icon=load(GameTheme.art_path("res://assets/ui/settings.svg"))
	settings_button.expand_icon=true
	settings_button.add_theme_constant_override("icon_max_width",24)
	settings_button.custom_minimum_size.x=30
	for setting_state: String in ["normal","hover","pressed"]: settings_button.add_theme_stylebox_override(setting_state,StyleBoxEmpty.new())
	settings_button.size_flags_horizontal=Control.SIZE_SHRINK_END
	wallet = label(header, "", 14, GameTheme.JADE)
	wallet.visible=false
	var resources_grid: GridContainer=GridContainer.new()
	resources_grid.columns=3
	resources_grid.add_theme_constant_override("h_separation",6)
	resources_grid.add_theme_constant_override("v_separation",5)
	header.add_child(resources_grid)
	for resource_id: String in RESOURCE_NAMES:
		var cell: HBoxContainer=row(resources_grid)
		cell.add_theme_constant_override("separation",5)
		cell.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		var glyph: TextureRect=picture(cell,"res://assets/ui/%s.svg" % resource_id,26)
		glyph.custom_minimum_size.x=26
		glyph.size_flags_horizontal=Control.SIZE_SHRINK_CENTER
		var value: Label=label(cell,"",12,GameTheme.JADE)
		value.autowrap_mode=TextServer.AUTOWRAP_OFF
		value.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
		resource_labels[resource_id]=value
	body_scroll = ScrollContainer.new()
	body_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body_scroll.resized.connect(_sync_page_content_height, CONNECT_DEFERRED)
	frame.add_child(body_scroll)
	body = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 8)
	var page_canvas: Control=Control.new()
	page_canvas.name="PageCanvas"
	page_canvas.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	page_canvas.size_flags_vertical=Control.SIZE_EXPAND_FILL
	body_scroll.add_child(page_canvas)
	page_canvas.add_child(body)
	body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	page_bar = row(frame)
	page_bar.hide()
	nav = HBoxContainer.new()
	nav.item_rect_changed.connect(queue_redraw)
	nav.custom_minimum_size.y = 108
	nav.add_theme_constant_override("separation", 4)
	frame.add_child(nav)
	toast_label = GameTheme.label("", 15, GameTheme.LIGHT)
	toast_label.autowrap_mode=TextServer.AUTOWRAP_OFF
	toast_label.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.add_theme_stylebox_override("normal", GameTheme.box(GameTheme.JADE, Color("d8bc78"),8,6))
	toast_label.visible = false
	toast_label.z_index = 100
	add_child(toast_label)
	_resize_shell()

func _resize_shell() -> void:
	if not frame: return
	var safe: Rect2=GameSafeArea.rect_for(self)
	last_safe_rect=safe
	var width: float = maxf(1,minf(safe.size.x - (0.0 if page==5 else 24.0), 720.0))
	frame.position = safe.position+Vector2((safe.size.x - width) / 2.0, 8.0)
	frame.size = Vector2(width, maxf(1,safe.size.y - 16.0))
	var short_header: bool=safe.size.y<680
	for key: String in resource_labels:
		var resource_label: Label=resource_labels[key]
		resource_label.add_theme_font_size_override("font_size",10 if short_header else 12)
		var resource_icon: Control=resource_label.get_parent().get_child(0)
		resource_icon.custom_minimum_size=Vector2.ONE*(20 if short_header else 26)
	if is_instance_valid(store): _update_wallet()
	_sync_page_content_height.call_deferred()
	if toast_label:
		toast_label.position = Vector2(frame.position.x,safe.position.y+8.0)
		toast_label.size = Vector2(maxf(1,width-58), 36.0)
	if is_instance_valid(overlay): _resize_modal()
	if is_instance_valid(battle_view): battle_view.call("_resize_safe_layout")
	queue_redraw()

func _sync_page_content_height() -> void:
	if not is_instance_valid(body_scroll) or not is_instance_valid(body) or body_scroll.size.y<=0: return
	# Canvas pages must use the same settled budget as native-container pages.
	# In particular, keep demo/read-only notices outside their drawing area.
	var canvas: Control
	for child: Node in body.get_children():
		if child is Control and (child.has_method("_layout_page") or str(child.name).begins_with("ActivitiesScreen_")):
			canvas=child
			break
	var available: float=body_scroll.size.y
	if is_instance_valid(canvas):
		for sibling: Node in body.get_children():
			if sibling!=canvas and sibling is Control and sibling.visible:
				available-=sibling.get_combined_minimum_size().y+body.get_theme_constant("separation")
	available=maxf(1,available)
	if is_equal_approx(float(get_meta("page_content_height",-1)),available): return
	set_meta("page_content_height",available)
	if is_instance_valid(canvas):
		if canvas.has_method("_layout_page"): canvas.call("_layout_page")
		else: canvas.call("_layout")

func _clear(node: Node) -> void:
	for child: Node in node.get_children():
		node.remove_child(child)
		child.queue_free()

func label(parent: Node, text: String, fs: int = 17, color: Color = GameTheme.TEXT) -> Label:
	var node: Label = GameTheme.label(text, fs, color)
	parent.add_child(node)
	return node

func button(parent: Node, text: String, callback: Callable, primary: bool = false, disabled: bool = false) -> Button:
	var node: Button = GameTheme.button(text, func() -> void: audio.cue(); callback.call(), primary, disabled)
	var glyphs: Dictionary={"仙府来信":"mail","成长活动":"rank","派遣委托":"stages","仙府商店":"affairs","联机内测模拟":"cloud","模拟云档":"cloud","模拟聊天":"mail","模拟公会":"guild","模拟榜单":"rank","模拟支付":"fate","查看与整理灵装":"gear"}
	if glyphs.has(text):
		node.icon=load(GameTheme.art_path("res://assets/ui/%s.svg" % glyphs[text]))
		node.expand_icon=true
		node.add_theme_constant_override("icon_max_width",28)
	parent.add_child(node)
	return node

func row(parent: Node) -> HBoxContainer:
	var node: HBoxContainer = HBoxContainer.new()
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(node)
	return node

func column(parent: Node) -> VBoxContainer:
	var node: VBoxContainer = VBoxContainer.new()
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(node)
	return node

func card(parent: Node, title: String = "", subtitle: String = "") -> VBoxContainer:
	var panel: PanelContainer = PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(panel)
	var inner: VBoxContainer = column(panel)
	if not title.is_empty(): label(inner, title, 21, GameTheme.GOLD)
	if not subtitle.is_empty(): label(inner, subtitle, 15, GameTheme.MUTED)
	return inner

func picture(parent: Node, path: String, height: float, mode: int = TextureRect.STRETCH_KEEP_ASPECT_CENTERED) -> TextureRect:
	var image: TextureRect = TextureRect.new()
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = mode
	image.custom_minimum_size.y = height
	image.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var art: String=GameTheme.art_path(path)
	if path.begins_with("res://assets/ui/"): image.texture=Art.texture(path.get_file().get_basename())
	elif ResourceLoader.exists(art): image.texture = load(art)
	parent.add_child(image)
	return image

func portrait(parent: Node, id: String, height: float = 220) -> TextureRect:
	return picture(parent, "res://assets/portraits/%s-premium.webp" % id, height)

func cost(resources: Dictionary) -> String:
	var parts: PackedStringArray = []
	for key: String in RESOURCE_NAMES:
		if float(resources.get(key, 0)) != 0:
			parts.append("%s %s" % [RESOURCE_NAMES[key], str(int(resources[key]))])
	return " · ".join(parts) if not parts.is_empty() else "无"

func char_name(id: Variant) -> String:
	return str(GameData.character(str(id)).get("name", "未指定"))

func item_name(id: String) -> String:
	var names: Dictionary = {"training":"聚气丹", "ward":"护元丹", "heal":"回春丹", "cleanse":"清心丹", "refine":"灵材淬炼", "thunder-component":"引雷构件", "relic-essence":"淬灵精华", "xp-scroll":"修为卷", "herb-crate":"灵药匣", "essence-pack":"淬灵包"}
	return str(names.get(id, id))

func _update_wallet() -> void:
	if store.corruption:
		for key: String in resource_labels:
			resource_labels[key].text="%s —" % RESOURCE_NAMES[key]
			resource_labels[key].tooltip_text="档案待恢复；通过校验后显示实际数量。"
		wallet.text="资源待恢复"
		return
	var r: Dictionary = state().get("resources", {})
	for live: Node in get_tree().get_nodes_in_group("home_resources"):
		if is_instance_valid(live): live.text=str(r.get(str(live.get_meta("resource","stone")),0))
	for key: String in resource_labels:
		var amount: int=int(r.get(key,0))
		var compact: bool=GameSafeArea.rect_for(self).size.y<680
		var shown: String=str(amount) if amount<(10000 if compact else 100000) else ("%.1f万" % (float(amount)/10000.0) if amount<100000000 else "%.1f亿" % (float(amount)/100000000.0))
		resource_labels[key].text=("%s %s" if compact else "%s\n%s") % [RESOURCE_NAMES[key],shown]
		resource_labels[key].tooltip_text="%s %d" % [RESOURCE_NAMES[key],amount]
	wallet.text = "灵石 %d　修为 %d　灵材 %d\n灵药 %d　召请符 %d　道缘 %d" % [r.get("stone",0),r.get("xp",0),r.get("material",0),r.get("herb",0),r.get("ticket",0),r.get("fate",0)]

func _go(index: int) -> void:
	page = index
	selected_character = ""
	_close_modal()
	_render()
	body_scroll.scroll_vertical = 0

func _systems_page(id: String="") -> void:
	_close_modal()
	var framework_routes: Dictionary = {"010":"阵容","012":"灵兽","014":"灵兽","023":"本命","040":"弟子","042":"弟子","049":"挑战","050":"挑战","087":"仙府","088":"挑战"}
	if framework_routes.has(id):
		var selection: Dictionary = get_meta("framework_selection",{})
		var challenge_routes: Dictionary = {"049":"tower","050":"beast","088":"mountain"}
		if challenge_routes.has(id): selection["challenge-kind"] = challenge_routes[id]; set_meta("framework_selection",selection)
		_framework_page(framework_routes[id]); return
	if id=="053": id="035"
	if id=="085": _go(1); return
	if id=="086":
		_go(1)
		if not state().team.is_empty(): _open_character(str(state().team[0]))
		return
	if id=="087": _go(0); return
	if id=="088": page=2; subpage="秘境"; _render(); return
	if id=="047":
		var selection: Dictionary = get_meta("framework_selection",{})
		selection["challenge-kind"] = "story"; set_meta("framework_selection",selection)
		_framework_page("挑战"); return
	if id=="056": _go(6); return
	if id=="045": _go(4); return
	system_view=id
	page=8
	_render()

func _system_content() -> void:
	if system_view.begins_with("framework:"):
		load("res://scripts/framework_screen.gd").build(self,body,system_view.trim_prefix("framework:"))
	elif system_view.is_empty():
		load("res://scripts/system_hub.gd").build(self,body)
	elif int(system_view)<=46:
		load("res://scripts/progression_screen.gd").build(self,body,system_view)
	else:
		load("res://scripts/activities_screen.gd").build(self,body,system_view)

func _system_action(cmd: String,args: Dictionary={}) -> void:
	var result: Dictionary=command(cmd,args,false)
	if not result.get("ok",false): return
	var data: Dictionary=result.get("data",{}) if result.get("data") is Dictionary else {}
	if data.has("battleRequest"):
		_enter_battle(data.battleRequest,"framework" if cmd == "challengePrepare" else "progression")
		return
	if data.has("text"):
		var detail: VBoxContainer=_modal(str(data.get("name","仙友来信")))
		label(detail,str(data.text),17)
		return
	_render()
	toast(str(data.get("message","已完成并保存。")))

func _framework_page(tab: String = "阵容") -> void:
	_close_modal(); system_view = "framework:"+tab; page = 8; _render()

func _framework_action(cmd: String, args: Dictionary = {}) -> void:
	var request: Dictionary = args.duplicate(true)
	request.txid = "ui-fw-%d-%d-%d" % [int(state().get("revision",0)),Time.get_ticks_usec(),randi()]
	var result: Dictionary = command(cmd,request,false)
	if not result.ok: framework_auto_set = false; return
	if result.get("data") is Dictionary and result.data.has("battleRequest"):
		_enter_battle(result.data.battleRequest,"framework"); return
	_render()
	var data: Dictionary = result.data if result.get("data") is Dictionary else {}
	toast("；".join(data.warnings) if not data.get("warnings",[]).is_empty() else str(data.get("message","已完成并保存")))

func _framework_reset(cmd: String, id: String, refund: Dictionary) -> void:
	var box: VBoxContainer = _modal("确认返还与重置")
	label(box,"本次仅退还实际投入："+str(refund)+"\n保留星级、固定资质、工作专长、强化历史与首次记录。",16)
	button(box,"确认",func() -> void: _close_modal(); _framework_action(cmd,{"id":id}))
	button(box,"取消",_close_modal)

func _forge() -> void:
	if is_instance_valid(foundation_home): foundation_home.forge()

func _shared_gear_choices(slot_id: String) -> void:
	var selections: Dictionary=get_meta("progression_selections",{})
	selections["003"]={"slot":slot_id}
	set_meta("progression_selections",selections)
	_systems_page("003")

func _render() -> void:
	if is_instance_valid(battle_view): return
	if is_instance_valid(foundation_home):
		remove_child(foundation_home)
		foundation_home.queue_free()
	foundation_home = null
	frame.visible = page != 5 or store.corruption
	if page_pager: page_pager.dispose()
	_clear(page_bar)
	page_bar.hide()
	_clear(body)
	_clear(nav)
	estate = null
	header.visible=page!=5 and page!=3
	nav.visible=page!=3
	summon_ui_shade.visible=page==3
	var page_title: Node=header.find_child("PageTitle",true,false)
	if page_title: page_title.text={0:"仙府",1:"神仙图鉴",2:"历练",3:"神仙召唤",4:"仙府事务",6:"仙盟",7:"三界仙榜",8:"百宝阁"}.get(page,"洪荒众仙府")
	if page_title and GameEconomy.free_currency(): page_title.text += " · 测试"
	_update_wallet()
	for i: int in NAV.size():
		var action: Callable=_go.bind(NAV_PAGES[i])
		if i==4: action=_systems_page.bind("043")
		if i==2: action=func()->void:
			if page==5: _forge()
			else: _go(5)
		var tab: Button=Art.button(nav,NAV[i] if i!=2 or page==5 else "主页",["estate","friends","forge","adventure","chest"][i],action,false,false)
		tab.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		tab.custom_minimum_size.y=108 if i==2 else 91
		tab.size_flags_vertical=Control.SIZE_SHRINK_END
		tab.get_node("Art").set("selected",NAV_PAGES[i]==page)
		if NAV_PAGES[i]==page: tab.get_node("Caption").add_theme_color_override("font_color",Color("ffe9a6"))
	if store.corruption:
		_recovery_content(body)
		return
	if state().has("mockAccount"):
		var mock_bar: HBoxContainer=row(body)
		label(mock_bar,"内测模拟 · %s / %s" % [state().mockAccount,state().get("mockDevice","")],14,GameTheme.GOLD)
		button(mock_bar,"模拟服务",_mock_menu)
	elif state().get("demo") != null:
		var demo: String = str(state().get("demo", ""))
		var note: HBoxContainer = row(body)
		label(note, "隔离展示档 · " + str(GameData.named(GameData.economy("DEMO_PRESETS"),demo).get("name",demo)), 14, GameTheme.GOLD)
		var leave_demo: Button=button(note, "回普通档", _load_slot.bind("normal"))
		leave_demo.size_flags_horizontal=Control.SIZE_SHRINK_END
		leave_demo.custom_minimum_size.x=106
	if store.readonly:
		var read_only: VBoxContainer=card(body,"当前存档只读",store.last_error if not store.last_error.is_empty() else "存档未通过校验，或另一个窗口正在写入。本窗口不会覆盖资产。")
		button(read_only,"检查存档与恢复",_settings)
	match page:
		0: _estate_page()
		1: _characters_page()
		2: _stages_page()
		3: _summon_page()
		4: _affairs_page()
		5:
			foundation_home = load("res://scenes/ui/forge_home.tscn").instantiate()
			add_child(foundation_home)
			foundation_home.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			foundation_home.configure(self,OS.get_cmdline_user_args().has("--reference-fixture"))
		6: load("res://scripts/community_screen.gd").build_guild(self,body)
		7: load("res://scripts/community_screen.gd").build_ranking(self,body)
		8: _system_content()
	page_pager=PagePager.new()
	page_pager.setup(body,body_scroll,page_bar)
	_resize_shell()
	queue_redraw()

func command(name: String, args: Dictionary = {}, refresh: bool = true) -> Dictionary:
	var constructing_before: Dictionary=_constructing_ids()
	var result: Dictionary = store.transact(name, args)
	if not result.get("ok", false):
		toast(str(result.get("error", "操作未提交，请重试。")))
		return result
	audio.configure(state().get("settings", {}))
	_construction_feedback(constructing_before)
	if refresh:
		_render()
		if is_instance_valid(estate) and estate.has_method("play_completion"):
			for building: Dictionary in state().get("buildings",[]):
				if constructing_before.has(building.id) and int(building.get("readyAt",0))==0: estate.call("play_completion",str(building.id))
	return result

func toast(message: String) -> void:
	toast_label.text = message
	toast_label.tooltip_text = message
	toast_label.visible = true
	toast_time = 4.0

func _modal(title: String,preserve_preview: bool=false) -> VBoxContainer:
	_close_modal(not preserve_preview)
	overlay = Control.new()
	overlay.name = "ModalOverlay"
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.z_index = 30
	add_child(overlay)
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.025, 0.08, 0.055, 0.72)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(shade)
	var panel: PanelContainer = PanelContainer.new()
	panel.name = "Sheet"
	overlay.add_child(panel)
	var content: VBoxContainer = column(panel)
	var crest: PanelContainer=PanelContainer.new()
	crest.add_theme_stylebox_override("panel",GameTheme.skin("jade-panel",7))
	content.add_child(crest)
	var top: HBoxContainer = row(crest)
	label(top, title, 22, GameTheme.LIGHT)
	var close_button: Button = button(top, "关闭", _close_modal)
	GameTheme.style_button(close_button,true)
	close_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	close_button.custom_minimum_size.x = 66
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.add_child(scroll)
	var modal_canvas: Control=Control.new()
	modal_canvas.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	modal_canvas.size_flags_vertical=Control.SIZE_EXPAND_FILL
	scroll.add_child(modal_canvas)
	modal_box = column(modal_canvas)
	modal_box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var controls: HBoxContainer=row(content)
	modal_pager=PagePager.new()
	modal_pager.setup(modal_box,scroll,controls)
	_resize_modal()
	_fit_modal.call_deferred()
	return modal_box

func _resize_modal() -> void:
	var panel: Control = overlay.get_node("Sheet")
	var safe: Rect2=GameSafeArea.rect_for(self)
	var width: float = maxf(1,minf(safe.size.x - 32.0, 680.0))
	panel.position = safe.position+Vector2((safe.size.x - width) / 2.0, 55.0)
	panel.size = Vector2(width, maxf(1,safe.size.y - 110.0))

func _close_modal(clear_preview: bool=true) -> void:
	if modal_pager: modal_pager.dispose(); modal_pager=null
	if clear_preview and is_instance_valid(estate): estate.call("cancel_move")
	if is_instance_valid(overlay):
		remove_child(overlay)
		overlay.queue_free()
	overlay = null
	modal_box = null

func _confirm(title: String, description: String, callback: Callable,preserve_preview: bool=false) -> void:
	var box: VBoxContainer = _modal(title,preserve_preview)
	label(box, description)
	button(box, "确认", func() -> void: _close_modal(); callback.call(), true)
	button(box, "取消", _close_modal)

func _estate_page() -> void:
	EstateScreen.build(self, body)

func _harvest() -> void:
	var result: Dictionary = command("harvest")
	if result.get("ok", false):
		audio.cue("harvest")
		toast("府库收取已保存。" + _result_text(result.get("data")))

func _result_text(data: Variant) -> String:
	if data == null: return ""
	if data is String: return data
	if data is Dictionary:
		if data.has("reward"): return cost(data.reward)
		if data.has("resources"): return cost(data.resources)
		if data.has("message"): return str(data.message)
	return ""

func _building_list() -> void:
	var box: VBoxContainer = _modal("仙府设施")
	for b: Dictionary in state().get("buildings", []):
		var cfg: Dictionary = GameData.named(GameEconomy.get_building_types(), b.type)
		button(box, "%s · %d阶　%s" % [cfg.get("name",b.type), b.level, "建造中" if float(b.get("readyAt",0)) > float(state().lastTime) else "管理"], _show_building.bind(str(b.id)))
	label(box, "新建设施", 22, GameTheme.GOLD)
	for cfg: Dictionary in GameEconomy.get_building_types():
		if cfg.get("fixed", false): continue
		var count: int = 0
		for b: Dictionary in state().buildings:
			if b.type == cfg.id: count += 1
		var c: VBoxContainer = card(box, str(cfg.name), str(cfg.description))
		label(c, "%s · 即时建造 · %d / %d" % [cost(cfg.cost),count,cfg.max], 14)
		button(c, "选择建设地块", _build_sites.bind(str(cfg.id)), true, count >= int(cfg.max))

func _show_plot(plot_id: String) -> void:
	var box: VBoxContainer = _modal("建设地块 " + plot_id.to_upper())
	var plot: Dictionary = GameData.named(GameEconomy.get_all_plots(), plot_id)
	if not state().unlockedRegions.has(plot.get("region", 0)):
		label(box, "该区域尚未开放。丹器别院需融入灵脉核心；演法台地需融入炉心。")
		return
	if not GameEconomy.plot_unlocked(state(),plot_id):
		var info: Dictionary=GameEconomy.expansion_info(state(),plot_id)
		label(box,"可拓展地块 · "+str(info.get("reason","")),18,GameTheme.GOLD)
		label(box,"开拓成本："+cost(info.get("cost",{})),16)
		button(box,"开拓此地块",func() -> void: _command_then("expandPlot",{"plot":plot_id},func() -> void: _show_plot(plot_id)),true,not info.get("ok",false))
		return
	label(box, "滋养位：灵田产出 +20%" if plot.get("nourished", false) else "普通地块 · 搬迁免费")
	for cfg: Dictionary in GameEconomy.get_building_types():
		if cfg.get("fixed", false): continue
		button(box, "建设%s · %s" % [cfg.name, cost(cfg.cost)], _build_at.bind(str(cfg.id), plot_id))

func _build_sites(type: String) -> void:
	var cfg: Dictionary = GameData.named(GameEconomy.get_building_types(), type)
	var box: VBoxContainer = _modal("为%s选址" % cfg.get("name",type))
	for plot: Dictionary in GameEconomy.get_all_plots():
		if plot.has("fixed") or not state().unlockedRegions.has(plot.region): continue
		var occupied: bool = false
		for b: Dictionary in state().buildings:
			if b.plot == plot.id: occupied = true
		if not occupied and GameEconomy.plot_unlocked(state(),str(plot.id)): button(box, "%s · %s" % [str(plot.id).to_upper(), "灵泉滋养" if plot.nourished else "普通地块"], _build_at.bind(type, str(plot.id)), true)
	label(box, "区域地块已满时，可融入章节核心开放后续区域。", 14, GameTheme.MUTED)

func _build_at(type: String, plot: String) -> void:
	var result: Dictionary = command("build", {"type":type, "plot":plot})
	if result.get("ok", false):
		_close_modal()
		audio.cue("build")
		toast("建设已开始，完成时间会按真实时钟结算。")

func _show_building(id: String) -> void:
	var b: Dictionary = GameData.named(state().buildings, id)
	if b.is_empty(): return
	var cfg: Dictionary = GameData.named(GameEconomy.get_building_types(), b.type)
	var box: VBoxContainer = _modal("%s · %d阶" % [cfg.name, b.level])
	label(box, str(cfg.description), 16, GameTheme.JADE)
	var art: Dictionary = {"hall":"wanxian", "spring":"spring", "farm":"farm", "alchemy":"alchemy", "forge":"forge", "library":"library", "arena":"arena", "warehouse":"warehouse", "mine":"mine", "relicworkshop":"relicworkshop"}
	var visual: Dictionary=BuildingView.visual_metadata(str(b.type),int(b.level))
	picture(box,str(visual.get("path","res://assets/buildings/%s-premium.webp" % art.get(b.type,"forge"))),180)
	var remaining: int = maxi(0, int(b.get("readyAt",0)) - int(state().lastTime))
	var status: Dictionary=GameEconomy.get_building_status(state(),id,store.now_ms())
	label(box,"生产：%s · 待领%d" % [{"idle":"空闲","producing":"生产中","storage-full":"仓库已满","missing-materials":"缺少原料"}.get(status.get("production"),"空闲"),status.get("pendingCount",0)],16,GameTheme.JADE)
	label(box, "%s · 地块 %s\n主持：%s" % [("建设尚余 %d秒" % ceili(remaining/1000.0)) if remaining > 0 else "已建成", str(b.plot).to_upper(), char_name(b.get("assigned")) if b.get("assigned") != null else "无人主持"], 16)
	var controls: HBoxContainer = row(box)
	button(controls, "收取产物", func() -> void: _command_then("harvestBuilding",{"id":id},func() -> void: _show_building(id)))
	button(controls, "升级 · "+cost(GameEconomy.building_upgrade_cost(int(b.level))), func() -> void: _command_then("upgradeBuilding",{"id":id},func() -> void: _show_building(id)), true, b.type=="hall" or int(b.level)>=3 or remaining>0)
	if remaining > 0: button(box, "灵材助建 · 缩短工期", func() -> void: _command_then("accelerateBuilding",{"id":id},func() -> void: _show_building(id)))
	var controls2: HBoxContainer = row(box)
	button(controls2, "安排驻府", _assign_staff.bind(id),false,b.type=="hall")
	if not cfg.get("fixed", false): button(controls2, "搬迁到空地", _move_sites.bind(id))
	match str(b.type):
		"hall": button(box, "前往常驻召请", _go.bind(3), true)
		"arena": button(box, "进入无消耗演武", func() -> void: _close_modal(); page=2; subpage="演武"; _render(), true)
		"library": _method_controls(box, true)
		"alchemy", "forge", "relicworkshop":
			label(box, "生产队列 · 排队时预扣材料", 20, GameTheme.GOLD)
			for job: Dictionary in b.get("queue", []):
				var j: VBoxContainer = card(box, item_name(str(job.get("recipeId", job.get("recipe", "工序")))))
				label(j, "已执行部分不会重复退料。未开始队列可取消。", 13)
				button(j, "取消此工序", func() -> void: _command_then("cancelQueue",{"id":id,"jobId":job.get("id")},func() -> void: _show_building(id)))
			for recipe: Dictionary in GameEconomy.get_recipes():
				if recipe.building != b.type: continue
				var rc: VBoxContainer = card(box, str(recipe.name), str(recipe.get("description","排队时预扣所列材料；完成后进入府库，收取后用于灵装强化。")))
				label(rc, "%s · %d秒" % [cost(recipe.cost), int(recipe.duration)/1000], 14)
				button(rc, "加入队列", func() -> void: _command_then("queueRecipe",{"id":id,"recipeId":recipe.id},func() -> void: _show_building(id)), true)
			if b.type == "forge" and state().thunderProject.get("direction") == "forge":
				button(box, "雷淬灵宝修复", _thunder_repairs.bind(id))
	label(box, "已开工工序使用锁定配方。驻府、移动、升级先结算旧条件；不追溯历史产出。", 13, GameTheme.MUTED)

func _assign_staff(building_id: String) -> void:
	var box: VBoxContainer = _modal("选择驻府主持")
	label(box, "同一神仙只能主持一座设施；仍可正常上阵。专长只提供效率增益。", 15)
	button(box, "撤下主持", func() -> void: _command_then("assign",{"id":building_id,"characterId":null},func() -> void: _show_building(building_id)))
	for id: String in state().owned:
		button(box, char_name(id), func() -> void: _command_then("assign",{"id":building_id,"characterId":id},func() -> void: _show_building(building_id)))

func _move_sites(id: String) -> void:
	var box: VBoxContainer = _modal("选择迁入地块")
	for plot: Dictionary in GameEconomy.get_all_plots():
		if plot.has("fixed") or not state().unlockedRegions.has(plot.region): continue
		var occupied: bool = false
		for b: Dictionary in state().buildings:
			if b.plot == plot.id: occupied = true
		if not occupied and GameEconomy.plot_unlocked(state(),str(plot.id)): button(box, str(plot.id).to_upper() + (" · 滋养位" if plot.nourished else " · 普通地块"), _move_preview.bind(id,str(plot.id)))

func _move_preview(id: String, plot_id: String) -> void:
	_confirm("确认迁移", "将设施移至 %s。移动免费，等级、队列、待领产物全部保留。" % plot_id.to_upper(), func() -> void:
		var result: Dictionary = command("moveBuilding", {"id":id,"plot":plot_id})
		if result.ok: toast("建筑已落在新地块。")
	,true)

func _thunder_repairs(building_id: String) -> void:
	var box: VBoxContainer = _modal("雷淬工坊 · 确定修复")
	label(box, "以较多灵药换取较少灵材，正常直接修复依然保留。成本由当前灵宝段数决定。")
	for id: String in state().owned:
		button(box, "%s · 当前灵宝%d段" % [char_name(id),state().owned[id].treasure], func() -> void: _command_then("queueThunderRepair",{"buildingId":building_id,"id":id},func() -> void: _show_building(building_id)))

func _characters_page() -> void:
	if not selected_character.is_empty():
		_character_detail(body, selected_character)
		return
	load("res://scripts/roster_screen.gd").build(self,body)

func _open_character(id: String) -> void:
	if page==1 and selected_character.is_empty(): roster_scroll=body_scroll.scroll_vertical
	_close_modal()
	page = 1
	selected_character = id
	_render()
	body_scroll.scroll_vertical = 0

func _character_detail(parent: Node, id: String) -> void:
	CharacterScreen.build(self,parent,id)

func _train(id: String) -> void:
	var before: int=GameEquipment.character_power(state(),id)
	var result: Dictionary=command("upgradeCharacter",{"id":id})
	if result.ok: toast("%s修为提升 · 战力 %d → %d" % [char_name(id),before,GameEquipment.character_power(state(),id)])

func _repair(id: String) -> void:
	var before: int=GameEquipment.character_power(state(),id)
	var result: Dictionary=command("repairTreasure",{"id":id})
	if result.ok: toast("灵宝修复 · 战力 %d → %d" % [before,GameEquipment.character_power(state(),id)])

func _switch_branch(id: String, branch: String) -> void:
	command("switchBranch",{"id":id,"branch":branch})

func _reset_character(id: String) -> void:
	_confirm("免费重置" + char_name(id), "退还该角色实际记录的修为与灵石投入。神通解锁与灵宝修复保留。", func() -> void: command("resetCharacter",{"id":id}))

func _set_wish(id: String) -> void:
	var result: Dictionary=command("setWishlist",{"id":id})
	if result.ok: toast("心愿已设定，不改变抽取概率。")

func _quick_join(id: String) -> void:
	var ids: Array = state().team.duplicate()
	if ids.has(id): toast("该角色已在队伍中。")
	elif ids.size() < int(state().slots):
		ids.append(id)
		var result: Dictionary=command("setTeam",{"ids":ids})
		if result.ok: toast("已加入当前队伍。")
	else:
		_team()
		toast("队伍已满，请先选择要替换的阵位。")

func _team() -> void:
	team_draft = state().team.duplicate()
	_team_editor()

func _team_editor() -> void:
	var box: VBoxContainer = _modal("编队 · 两前排，三后排")
	label(box, "先移除要替换的角色，再按顺序选择。前两个位置承受更多普通攻击。", 15)
	for i: int in team_draft.size():
		var index: int = i
		button(box, "%s位 %d · %s　移除" % ["前排" if i<2 else "后排",i+1,char_name(team_draft[i])], func() -> void: team_draft.remove_at(index); _team_editor())
	label(box, "可上阵 %d / %d" % [team_draft.size(), state().slots], 19, GameTheme.GOLD)
	for id: String in state().owned:
		if not team_draft.has(id): button(box, "+ %s · 修为%d" % [char_name(id),state().owned[id].level], func() -> void: team_draft.append(id); _team_editor(), false, team_draft.size()>=int(state().slots))
	button(box, "保存当前队伍", func() -> void: _command_then("setTeam",{"ids":team_draft},func() -> void: _close_modal()), true, team_draft.is_empty())
	button(box, "阵容预设", _presets)
	button(box, "战前法门与丹药", _preparation)

func _presets() -> void:
	var box: VBoxContainer = _modal("三份阵容方案")
	label(box, "记录位置、神通分支和法门；应用时使用当前真实培养，不复制法相与资产。", 15)
	for i: int in 3:
		var slot: int = i
		var preset: Variant = state().teamPresets[i]
		var p: VBoxContainer = card(box,"方案 %d" % (i+1))
		var names: PackedStringArray = []
		if preset is Dictionary:
			for member: Dictionary in preset.get("team",[]): names.append(char_name(member.id)+"·"+str(member.branch))
		label(p," → ".join(names) if not names.is_empty() else "尚未保存",15)
		var actions: HBoxContainer=row(p)
		button(actions,"保存当前配置",func() -> void: command("saveTeamPreset",{"slot":slot}); _presets())
		button(actions,"应用",func() -> void: _command_then("applyTeamPreset",{"slot":slot},func() -> void: _presets()),true,preset==null)

func _synergy() -> void:
	var box: VBoxContainer = _modal("四条配合路线")
	for route_cfg: Dictionary in GameData.content("SYNERGY_ROUTES"):
		var c: VBoxContainer=card(box,str(route_cfg.name),str(route_cfg.description))
		for id: String in route_cfg.characters: button(c,char_name(id),_open_character.bind(id))
	label(box,str(GameData.content("COMBINED_FORM").description),16,GameTheme.JADE)

func _preparation() -> void:
	var box: VBoxContainer = _modal("战前准备")
	label(box,"最多携带一种丹药与一项法门。丹药在战前事务中扣除；同一重试节点不重复扣药。",15)
	_method_controls(box,false)
	label(box,"丹药 · " + item_name(str(state().get("chosenPill","未携带"))),20,GameTheme.GOLD)
	button(box,"不携带丹药",func() -> void: command("selectPill",{"id":null}); _preparation())
	for pill: Dictionary in GameData.content("PILLS"):
		button(box,"%s ×%d · %s" % [pill.name,state().items.get(pill.id,0),pill.description],func() -> void: command("selectPill",{"id":pill.id}); _preparation(),state().chosenPill==pill.id,int(state().items.get(pill.id,0))<=0)

func _method_controls(parent: Node, research: bool) -> void:
	label(parent,"通用法门 · 既有单槽",20,GameTheme.GOLD)
	if not research: button(parent,"不携带法门",func() -> void: command("selectMethod",{"id":null}); _preparation())
	for method: Dictionary in GameData.economy("METHODS"):
		var known: bool=state().methods.has(method.id)
		var panel: VBoxContainer=card(parent,str(method.name),str(method.description))
		if known: button(panel,"当前携带" if state().chosenMethod==method.id else "携带法门",func() -> void: command("selectMethod",{"id":method.id}); _preparation(),state().chosenMethod==method.id)
		elif research: button(panel,"研究 · " + cost(method.cost),func() -> void: _command_then("researchMethod",{"id":method.id},func() -> void: _preparation()))
		else: label(panel,"前往藏经阁研究" if method.id!="thunderward" else "引雷工程选择雷泽传法开放",14,GameTheme.MUTED)

func _stages_page() -> void:
	var tabs: HBoxContainer=row(body)
	for name: String in ["主线","秘境","演武"]:
		button(tabs,name,func() -> void: subpage=name; _render(),subpage==name)
	_active_challenge_card(body)
	var actions: HBoxContainer=row(body)
	button(actions,"调整阵容",_team)
	button(actions,"法门与丹药",_preparation)
	match subpage:
		"主线": _main_stages()
		"秘境": _expeditions()
		"演武": _trials()

func _main_stages() -> void:
	if state().has("framework") and int(state().framework.storyNode) > 12:
		label(body,"前十二节已经完成，可继续后续主线。",16,GameTheme.JADE)
		button(body,"继续第%d节" % int(state().framework.storyNode),_systems_page.bind("047"),true)
	var adventure: Control=AdventureScreen.build_main(self,body)
	adventure.set_meta("page_content","SingleScreenContent")

func _stage_preview(stage_id: int) -> void:
	var stage: Dictionary=GameData.stage(stage_id)
	var box: VBoxContainer=_modal("%02d · %s" % [stage_id,stage.name])
	label(box,str(stage.description),18)
	label(box,"敌方阵容",21,GameTheme.GOLD)
	for enemy: Dictionary in stage.enemies:
		label(box,"%s　%s · 生命%d · 攻击%d%s" % [enemy.name,"前排" if enemy.row=="front" else "后排",enemy.hp,enemy.atk," · 初始盾%d" % enemy.shield if enemy.shield else ""],15)
	label(box,"当前阵容："+_team_names(state().team),16,GameTheme.JADE)
	button(box,"调整阵容",_team)
	button(box,"进入真实回合战斗",_start_main.bind(stage_id),true)
	if state().cleared.has(stage_id):
		button(box,"材料扫荡 · 60秒",func() -> void: command("startMaterialSweep",{"stageId":stage_id}); _close_modal())
		label(box,"已首通关卡的普通材料收益；需完成实际等待，不重复发放首通奖励。",14,GameTheme.MUTED)

func _team_names(ids: Array) -> String:
	var names: PackedStringArray=[]
	for id: Variant in ids: names.append(char_name(id if id is String else id.get("id","")))
	return " · ".join(names)

func _gift() -> void:
	var box: VBoxContainer=_modal("结缘自选 · 非随机抽取")
	label(box,"第3节点首通奖励。选择一位加入万仙录，已拥有按公开重复规则转换。",16)
	for id: String in GameData.economy("GIFT_CHOICES"):
		button(box,char_name(id),func() -> void: _command_then("chooseGift",{"id":id},func() -> void: _open_character(id)),true)

func _trials() -> void:
	var note: VBoxContainer=card(body,"演武试阵 · 无消耗，无经济奖励","标准化试用：全图鉴角色，修为5、灵宝1段。当前培养：只用已结缘角色的真实修为。两种模式明确分开。")
	var modes: HBoxContainer=row(note)
	button(modes,"标准化试用",func() -> void: trial_current=false; _render(),not trial_current)
	button(modes,"当前培养",func() -> void: trial_current=true; trial_ids=state().team.duplicate(); _render(),trial_current)
	label(note,"试阵阵容："+_team_names(trial_ids),16,GameTheme.JADE)
	button(note,"选择试阵角色",_trial_team)
	for template: Dictionary in GameData.content("TRIAL_TEMPLATES"):
		var c: VBoxContainer=card(body,str(template.name),str(template.description))
		button(c,"开始演武",_start_trial.bind(str(template.id)),true)
	button(body,"查看四条协同路线",_synergy)

func _try_character(id: String) -> void:
	trial_current=false
	if not trial_ids.has(id):
		if trial_ids.size()>=5: trial_ids[4]=id
		else: trial_ids.append(id)
	_close_modal()
	selected_character=""
	page=2
	subpage="演武"
	_render()
	toast(char_name(id)+"已加入标准化试阵阵容。")

func _trial_team() -> void:
	var box: VBoxContainer=_modal("试阵队伍 · 最多五位")
	label(box,_team_names(trial_ids),19,GameTheme.GOLD)
	for character: Dictionary in GameData.content("CHARACTERS"):
		var id: String=str(character.id)
		if trial_current and not state().owned.has(id): continue
		button(box,("✓ " if trial_ids.has(id) else "+ ")+str(character.name),func() -> void:
			if trial_ids.has(id): trial_ids.erase(id)
			elif trial_ids.size()<5: trial_ids.append(id)
			else: toast("最多五位，请先移除一位。")
			_trial_team()
		,trial_ids.has(id))
	button(box,"完成选择",func() -> void: _close_modal(); _render(),true,trial_ids.is_empty())

func _expeditions() -> void:
	var run: Variant=state().expeditions.get("active")
	if state().has("framework") and run == null:
		label(body,"每周仙山：分岔路线、战前整备、本轮增益。",18,GameTheme.JADE)
		button(body,"进入每周仙山秘境",_systems_page.bind("088"),true)
		return
	if run is Dictionary:
		var cfg: Dictionary=GameData.named(GameData.expedition("ROUTES"),run.routeId)
		var active: VBoxContainer=card(body,"本趟 · "+str(cfg.get("name",run.routeId)),"阵容已锁定，回府养成只影响下一趟。每场满生命、初始冷却。")
		label(active," → ".join(PackedStringArray(cfg.get("nodes",[]))),15,GameTheme.JADE)
		label(active,"节点 %d / 5 · %s" % [mini(int(run.node),5),{"ready":"待出发","battle":"战前已锁定","choice":"选择机缘","failed":"可免费重试","complete":"完成待结算"}.get(str(run.status),str(run.status))],20,GameTheme.GOLD)
		label(active,"快照："+_team_names(run.snapshot.get("team",[])),15)
		for id: String in run.selectedBoons:
			var boon: Dictionary=GameData.named(GameData.content("BOONS"),id)
			label(active,str(boon.name)+" · "+str(boon.description),14)
		button(active,"领取本趟成果" if run.status=="complete" else "选择机缘" if run.status=="choice" else "免费重试当前节点" if run.status=="failed" else "继续本趟",_continue_expedition,true)
		button(active,"结算已完成节点并结束",_close_expedition)
	if state().has("framework"): return # Finish an admitted legacy journey before opening the weekly replacement.
	for route_cfg: Dictionary in GameData.expedition("ROUTES"):
		var c: VBoxContainer=card(body,str(route_cfg.name),str(route_cfg.description))
		label(c,"建议修为%d · 三战两次选择\n首通成果：%s" % [route_cfg.recommendedLevel,cost(route_cfg.firstReward)],15,GameTheme.JADE)
		var unlocked: bool=state().cleared.has(route_cfg.unlockStage)
		button(c,"锁定当前阵容入场" if unlocked else "首通主线第%d节点开放" % route_cfg.unlockStage,_start_expedition.bind(str(route_cfg.id)),true,not unlocked or run!=null)

func _start_expedition(id: String) -> void:
	var result: Dictionary=command("startExpedition",{"routeId":id})
	if result.ok: _continue_expedition()

func _continue_expedition() -> void:
	var run: Variant=state().expeditions.get("active")
	if not run is Dictionary: return
	if run.status=="complete":
		var result: Dictionary=command("closeExpedition",{})
		if result.ok: toast("本趟成果已结算并保存。")
	elif run.status=="choice":
		var box: VBoxContainer=_modal("机缘三选一 · 本趟生效")
		var candidates: Array=GameExpedition.expedition_candidates(state())
		for entry: Variant in candidates:
			var boon: Dictionary=entry if entry is Dictionary else GameData.named(GameData.content("BOONS"),entry)
			var c: VBoxContainer=card(box,str(boon.name),str(boon.description))
			button(c,"选择此机缘",func() -> void: _command_then("chooseBoon",{"id":boon.id},func() -> void: _close_modal()),true)
	else:
		var result: Dictionary=command("prepareExpeditionBattle",{},false)
		if result.ok: _enter_battle(result.data,"expedition")

func _close_expedition() -> void:
	_confirm("结束本趟秘境","仅结算已经完成的节点；未击败首领不给首领奖励。返回后可以开始新的一趟。",func() -> void: command("closeExpedition",{}))

func _summon_page() -> void:
	SummonScreen.build(self,body)

func _summon(count: int) -> void:
	SummonScreen.draw(self,count)

func _show_summon_results(records: Array,count: int) -> void:
	SummonScreen.show_results(self,records,count)

func _pool_rules() -> void:
	var box: VBoxContainer=_modal("常驻召请 · 公开规则")
	var e: Dictionary=GameEconomy.gacha_config()
	label(box,"五星基础概率 %.1f%%；四星 %.1f%%；三星 %.1f%%。各档内部等权。这是基础概率，不是含保底综合概率。" % [float(e.fiveStarChance)*100,float(e.fourStarChance)*100,float(e.threeStarChance)*100],18)
	label(box,"五星最多%d抽，四星或以上最多%d抽。五星优先判定；获得对应星级后重置计数。单抽、十连共享保底。" % [e.fiveStarPity,e.fourStarPity],16)
	label(box,"每抽获得1道缘。重复五星额外%d、四星额外%d、三星额外%d。兑换五星%d、四星%d、三星%d道缘。" % [e.duplicateExtra.divine,e.duplicateExtra.immortal,e.duplicateExtra.mortal,e.redeemCost.divine,e.redeemCost.immortal,e.redeemCost.mortal],16)
	label(box,str(e.get("description","常驻角色池，无武器混池或UP。")),15,GameTheme.JADE)
	label(box,"当前为离线内测参数。本地时钟与档案可修改，不宣称服务端防作弊。旧召请历史保留其原规则标记。",14,GameTheme.MUTED)
	for c: Dictionary in GameData.content("CHARACTERS"): label(box,"%s · %s" % [c.name,{"divine":"五星","immortal":"四星","mortal":"三星"}.get(c.rarity,c.rarity)],16)

func _draw_history() -> void:
	var box: VBoxContainer=_modal("召请记录")
	var history: Array=state().get("drawHistory",[]).duplicate()
	history.reverse()
	if history.is_empty(): label(box,"尚未进行召请。")
	for transaction: Dictionary in history.slice(0,50):
		label(box,Time.get_datetime_string_from_unix_time(int(float(transaction.get("at",0))/1000)),14,GameTheme.MUTED)
		for d: Dictionary in transaction.get("results",[]):
			label(box,"%s · %s · 道缘+%d" % [char_name(d.id),"重复转化" if d.get("duplicate",false) else "结缘",d.get("fate",1)],17)

func _exchange() -> void:
	var box: VBoxContainer=_modal("道缘定向兑换")
	label(box,"当前道缘 %d。每抽与重复法相转化是稳定来源。" % state().resources.fate,18,GameTheme.JADE)
	for c: Dictionary in GameData.content("CHARACTERS"):
		var price: int=int(GameEconomy.gacha_config().redeemCost[c.rarity])
		button(box,"%s · %s%s" % [c.name,"测试免费" if GameEconomy.free_currency() else "%d道缘" % price," · 已得" if state().owned.has(c.id) else ""],func() -> void: _command_then("redeem",{"id":c.id},func() -> void: _open_character(str(c.id))),false,state().owned.has(c.id) or not GameEconomy.can_afford(state(),{"fate":price}))

func _wish_choices() -> void:
	var box: VBoxContainer=_modal("心愿只追踪兑换目标")
	for c: Dictionary in GameData.content("CHARACTERS"):
		button(box,str(c.name),func() -> void: command("setWishlist",{"id":c.id}); _close_modal())

func _affairs_page() -> void:
	label(body,"府中事务",27,GameTheme.GOLD)
	var tabs: HBoxContainer=row(body)
	var names: Array[String]=["任务","背包","工程","设置"]
	if subpage not in names: subpage="任务"
	for name: String in names: button(tabs,name,func() -> void: subpage=name; _render(),subpage==name)
	match subpage:
		"任务": _tasks()
		"背包": _inventory()
		"工程": _project()
		"设置": _settings_content(body)

func _tasks() -> void:
	_live_affairs(body)
	var daily: Dictionary=state().get("daily",{})
	label(body,"今日功课 · "+str(daily.get("day","")),23,GameTheme.GOLD)
	label(body,"自然日更新，不惩罚断签。三项自然完成后可领汇总奖励。",15,GameTheme.MUTED)
	for task: Dictionary in GameData.economy("DAILY_TASKS"):
		var c: VBoxContainer=card(body,str(task.name),str(task.description))
		var progress: int=int(daily.get("progress",{}).get(task.id,0))
		var claimed: bool=daily.get("claimed",[]).has(task.id)
		label(c,"%d / %d　·　%s" % [mini(progress,int(task.goal)),task.goal,cost(task.reward)],15)
		button(c,"已领取" if claimed else "领取功课奖励",func() -> void: command("claimDailyTask",{"id":task.id}),true,claimed or progress<int(task.goal))
	button(body,"领取今日汇总 · 召请符1",func() -> void: command("claimDailyTask",{"id":"summary"}),true)
	label(body,"重建记事",23,GameTheme.GOLD)
	for task: Dictionary in GameData.economy("TASKS"):
		var c: VBoxContainer=card(body,str(task.name),str(task.description))
		var progress: int=int(state().stats.get(task.stat,0))
		var claimed: bool=state().claimedTasks.has(task.id)
		label(c,"%d / %d　·　%s" % [mini(progress,int(task.goal)),task.goal,cost(task.reward)],15)
		button(c,"已领取" if claimed else "领取任务奖励",func() -> void: command("claimTask",{"id":task.id}),true,claimed or progress<int(task.goal))
	var sweep: Variant=state().get("materialSweep")
	if sweep is Dictionary:
		var c: VBoxContainer=card(body,"材料扫荡","实际完成后领取，奖励只结算一次。")
		label(c,"本次第%d节点 · 结束时间 %s" % [sweep.get("stageId",1),Time.get_datetime_string_from_unix_time(int(float(sweep.get("readyAt",0))/1000))],15)
		button(c,"领取扫荡成果",func() -> void: command("claimMaterialSweep"),true)

func _inventory() -> void:
	for resource: Dictionary in GameData.economy("ECONOMY").resources:
		var c: VBoxContainer=card(body,"%s  %d" % [resource.name,state().resources.get(resource.id,0)],"来源：%s\n用途：%s" % [resource.source,resource.sink])
		label(c,"容量 %d" % resource.cap,14,GameTheme.MUTED)
	var items: VBoxContainer=card(body,"丹药与工程构件")
	if state().items.is_empty(): label(items,"背包暂无丹药或构件，可在丹坊与炼器坊加工。",15)
	for id: String in state().items:
		label(items,"%s ×%d" % [item_name(id),state().items[id]],18)
		if id in ["xp-scroll","herb-crate","essence-pack"]: button(items,"使用一份"+item_name(id),func() -> void: command("useItem",{"id":id,"count":1}),true,int(state().items[id])<1)
	button(items,"选择战前丹药",_preparation)
	button(items,"前往设施生产",_building_list)
	if ResourceLoader.exists("res://scripts/game_equipment.gd"): _gear_inventory(body)
	if not state().cores.is_empty():
		var cores: VBoxContainer=card(body,"待融入成果")
		for id: String in state().cores: button(cores,"融入"+str(GameData.economy("CORE_NAMES").get(id,id)),func() -> void: command("integrateCore",{"id":id}),true)

func _project() -> void:
	var project: Dictionary=state().thunderProject
	var unlocked: bool=state().cleared.has(12) or state().integratedCores.has("thunder")
	var c: VBoxContainer=card(body,"引雷入府","让雷泽成果在演法台地生根。工程和秘境独立开放，不需要第二枚核心。")
	picture(c,"res://assets/buildings/engineering-%s-v02.webp" % ("teaching" if project.get("direction")=="teaching" else "forge"),210)
	for stage: Dictionary in GameData.economy("THUNDER_PROJECT").stages:
		label(c,("✓ " if project.completedStages.has(stage.id) else "○ ")+str(stage.name)+" · "+str(stage.description),16,GameTheme.JADE if project.completedStages.has(stage.id) else GameTheme.TEXT)
	if not unlocked:
		label(c,"完成第12节点，或已有雷泽核心合法融入记录后开放。",18,GameTheme.GOLD)
		return
	match str(project.stage):
		"unstarted": button(c,"开始勘定",func() -> void: command("beginThunderProject"),true)
		"survey": button(c,"确认勘定成果",func() -> void: command("submitThunderStage",{"stage":"survey"}),true)
		"prepare":
			button(c,"在炼器坊加工构件",_building_list)
			button(c,"提交已收取的引雷构件",func() -> void: command("submitThunderStage",{"stage":"prepare"}),true)
		"stabilize":
			button(c,"前往短秘境",func() -> void: page=2; subpage="秘境"; _render())
			button(c,"确认秘境稳脉成果",func() -> void: command("submitThunderStage",{"stage":"stabilize"}),true)
	if project.completedStages.has("stabilize"):
		for direction: Dictionary in GameData.economy("THUNDER_PROJECT").directions:
			var d: VBoxContainer=card(body,str(direction.name),str(direction.description))
			button(d,"当前主要方向" if project.get("direction")==direction.id else "选择此方向",func() -> void: command("chooseThunderDirection",{"direction":direction.id}),true,project.get("direction")==direction.id)
	label(c,"已投入："+cost(project.get("invested",{})),15,GameTheme.MUTED)
	label(c,"成形后非战斗且相关工序完成可免费改建，同时只启用一个方向。既有合法修复与研究记录保留。",14,GameTheme.MUTED)

func _settings() -> void:
	if store.corruption:
		_recovery_content(_modal("存档待恢复"))
		return
	var box: VBoxContainer=_modal("设置与存档")
	_settings_content(box)

func _recovery_content(parent: Node) -> void:
	var recovery: VBoxContainer=card(parent,"存档待恢复","当前档案尚未通过校验，资产、主线进度、角色与仙府布局暂不显示。没有创建新档覆盖已有进度。")
	if not store.last_error.is_empty(): label(recovery,store.last_error,15,GameTheme.RED)
	label(recovery,"请恢复最近有效备份，或导入之前导出的 JSON。恢复会先验证档案，并保留异常原件；成功后显示实际进度。",16,GameTheme.JADE)
	button(recovery,"恢复最近有效备份",_restore_backup,true)
	button(recovery,"选择已有存档导入",_import_save)
	if store.slot!="normal": button(recovery,"返回普通档",_load_slot.bind("normal"))
	if store.is_demo(): button(recovery,"重置此展示起点",_reset_demo)

func _settings_content(parent: Node) -> void:
	if GameEconomy.free_currency(): label(parent,"测试版 · 货币无消耗（零余额可用）\n灵石、修为、灵材、灵药、召唤符、道缘、仙盟贡献与庆典代币免扣。专用材料、物品、次数和解锁条件沿用原规则。",14,GameTheme.GOLD)
	var settings: Dictionary=state().settings
	var c: VBoxContainer=card(parent,"声音与演出","原创短音与五声音列，首次操作后启用。音效与音乐分别控制。")
	for setting: String in ["sound","music","simplified"]:
		var names: Dictionary={"sound":"音效","music":"音乐","simplified":"简化演出"}
		button(c,"%s：%s" % [names[setting],"开" if settings.get(setting,false) else "关"],_toggle_setting.bind(setting))
	button(c,"战斗演出速度：%d×" % settings.get("speed",1),_cycle_speed)
	var save: VBoxContainer=card(parent,"可靠本地存档","原子提交、校验与最近有效备份。导入先验证；普通档与展示档路径隔离。")
	button(save,"导出存档 JSON",_export_save,true)
	button(save,"导入存档 JSON",_import_save)
	label(save,"旧浏览器档请先在旧版导出 JSON，再使用这里导入。Godot不直接访问浏览器localStorage。",14,GameTheme.MUTED)
	button(save,"查看当前存储状态",_save_status)
	button(save,"恢复最近有效备份",_restore_backup)
	var demo: VBoxContainer=card(parent,"内测 · 隔离全内容展示","所有展示使用实际同一引擎。不会向普通档写入角色、资源或正式奖励。")
	for preset: Dictionary in GameData.economy("DEMO_PRESETS"):
		button(demo,str(preset.name)+"\n"+str(preset.description),_load_slot.bind("demo:"+str(preset.id)))
	if state().get("demo")!=null:
		button(demo,"展示时钟 +1分钟",_demo_time.bind(60000))
		button(demo,"展示时钟 +1小时",_demo_time.bind(3600000))
		button(demo,"重置当前展示起点",_reset_demo)
		button(demo,"返回普通存档",_load_slot.bind("normal"),true)
	var rules: VBoxContainer=card(parent,"版本与边界","Godot 4 原生2D · 封神首篇内测\n扩展万仙图鉴 · 12主线节点 · 10类设施 · 2条短秘境")
	label(rules,"当前是可持续游玩的本地内测。未接入真实账号、跨设备云存档、玩家聊天或充值。存档与时钟可本地修改，不宣称服务端权威或商业发行完成。",14,GameTheme.MUTED)

func _toggle_setting(key: String) -> void:
	command("settings",{"key":key,"value":not state().settings.get(key,false)})
	if is_instance_valid(overlay): _settings()

func _cycle_speed() -> void:
	command("settings",{"key":"speed","value":int(state().settings.get("speed",1))%3+1})
	if is_instance_valid(overlay): _settings()

func _save_status() -> void:
	var box: VBoxContainer=_modal("存储状态")
	if store.corruption:
		label(box,"当前槽：%s\n存档待恢复，尚未读取有效资产、修订号或进度。" % store.slot,17)
		return
	label(box,"当前槽：%s\n存档版本：%s\n修订号：%s\n最近推进：%s" % [store.slot,state().get("version",3),state().get("revision",0),Time.get_datetime_string_from_unix_time(int(float(state().lastTime)/1000))],17)
	label(box,"本地路径："+ProjectSettings.globalize_path("user://"),14,GameTheme.MUTED)

func _export_save() -> void:
	export_dialog=FileDialog.new()
	export_dialog.file_mode=FileDialog.FILE_MODE_SAVE_FILE
	export_dialog.access=FileDialog.ACCESS_FILESYSTEM
	export_dialog.filters=PackedStringArray(["*.json ; JSON存档"])
	export_dialog.current_file="honghuang-%s.json" % str(store.slot).replace(":","-")
	add_child(export_dialog)
	export_dialog.file_selected.connect(func(path: String) -> void:
		var result: Variant=store.export_save(path)
		toast("存档已导出："+path if not result is Dictionary or result.get("ok",false) else str(result.get("error","导出失败")))
		export_dialog.queue_free()
	)
	export_dialog.popup_centered_ratio(0.85)

func _import_save() -> void:
	import_dialog=FileDialog.new()
	import_dialog.file_mode=FileDialog.FILE_MODE_OPEN_FILE
	import_dialog.access=FileDialog.ACCESS_FILESYSTEM
	import_dialog.filters=PackedStringArray(["*.json ; JSON存档"])
	add_child(import_dialog)
	import_dialog.file_selected.connect(func(path: String) -> void:
		import_dialog.queue_free()
		_confirm("验证并导入存档","将先备份当前槽，再校验此JSON。校验不通过不会覆盖当前进度。\n"+path,func() -> void:
			var result: Variant=store.import_save(path)
			if result is Dictionary and not result.get("ok",false): toast(str(result.get("error","导入失败")))
			else: _render(); toast("导入验证完成。")
		)
	)
	import_dialog.popup_centered_ratio(0.85)

func _load_slot(slot: String) -> void:
	var result: Variant=store.load_slot(slot)
	if result is Dictionary and not result.get("ok",true):
		if store.corruption:
			_close_modal()
			page=0
			selected_character=""
			_render()
		toast(str(result.get("error","存档槽加载失败")))
		return
	_close_modal()
	page=0
	selected_character=""
	audio.configure(state().settings)
	_render()
	toast("已切换到独立展示档。" if slot!="normal" else "已回到普通存档。")
	SummonScreen.recover_pending.call_deferred(self)

func _demo_time(milliseconds: int) -> void:
	if store.has_method("advance_demo_time"):
		var result: Variant=store.call("advance_demo_time",milliseconds)
		if result is Dictionary and not result.get("ok",false): toast(str(result.get("error","展示时钟未推进")))
		else: _render(); toast("仅展示档时钟已推进，普通档与系统时钟不变。")

func _reset_demo() -> void:
	if not store.is_demo(): toast("仅隔离展示档可重置，普通档不能使用此操作。"); return
	_confirm("重置当前展示档","只重置当前隔离展示起点，并留在本展示档。如有损坏原件会保留。普通档和其他账号／虚拟设备的本地游戏档完全保留。",func() -> void:
		var result: Dictionary=store.reset_demo()
		if not result.get("ok",false): toast(str(result.get("error","重置失败")))
		else: _render(); toast("当前展示起点已重置。")
	)

func _start_main(stage_id: int) -> void:
	var result: Dictionary=command("prepareMainBattle",{"stageId":stage_id},false)
	if result.ok: _enter_battle(result.data,"main")

func _start_trial(template_id: String) -> void:
	if trial_ids.is_empty(): toast("请先选择至少一位试阵角色。"); return
	var template: Dictionary=GameData.named(GameData.content("TRIAL_TEMPLATES"),template_id)
	var team: Array=[]
	for id: String in trial_ids:
		if trial_current and not state().owned.has(id): toast("当前培养模式仅可使用已结缘法相。"); return
		var member: Dictionary=state().owned[id].duplicate(true) if trial_current else {"level":5,"branch":"A","treasure":1}
		member["id"]=id
		member["branchUnlocked"]=not trial_current or state().branchUnlocks.has(id)
		if trial_current: member["equipmentStats"]=GameEconomy.battle_extras(state(),id)
		team.append(member)
	var request: Dictionary={"stageId":template.stageId,"team":team,"options":{"seed":randi(),"trial":true,"autoOnly":true,"petSupport":load("res://scripts/game_progression.gd").battle_support(state()) if trial_current else {},"enemies":template.enemies,"method":state().chosenMethod,"contextName":str(template.name)+(" · 当前培养" if trial_current else " · 标准化试用")}}
	_enter_battle(request,"trial")

func _enter_battle(request: Dictionary, context: String) -> void:
	if is_instance_valid(battle_view): return
	var created: Dictionary=GameCombat.create(int(request.get("stageId",1)),request.get("team",[]),request.get("options",{}))
	if created.has("error") or not created.get("units") is Array or created.get("units",[]).is_empty():
		toast("无法进入战斗："+str(created.get("error","战前记录不完整，请返回整备检查。")))
		return
	_close_modal()
	battle_context=context
	last_battle=created
	settlement={}
	frame.visible=false
	battle_view=load("res://scenes/battle.tscn").instantiate()
	battle_view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(battle_view)
	battle_view.call("configure",last_battle,state().settings)
	battle_view.connect("finished",_battle_finished)
	battle_view.connect("leave_requested",_leave_battle)
	battle_view.connect("cue",func(kind: String) -> void: audio.cue(kind))
	battle_view.connect("speed_changed",func(speed: int) -> void: command("settings",{"key":"speed","value":speed},false))
	battle_view.connect("gear_requested",func(id: String) -> void: _leave_battle(); _gear_detail(id))
	if context == "framework" and framework_auto_set:
		var stop := Button.new()
		stop.text = "停止连续挑战"
		stop.position = Vector2(12,70); stop.size = Vector2(160,40)
		battle_view.add_child(stop)
		stop.pressed.connect(func() -> void: framework_auto_set = false; stop.text = "本场后停止")
	if presentation_suspended: battle_view.set_backgrounded(true)

func _battle_finished(battle: Dictionary) -> void:
	last_battle=battle
	if battle_context=="trial":
		settlement={"ok":true,"data":{"message":"演武完成 · 无经济奖励，未改变普通资产。"}}
	elif battle_context=="expedition": settlement=command("settleExpeditionBattle",{"battle":battle},false)
	elif battle_context=="challenge": settlement=command("settleCharacterChallenge",{"battle":battle},false)
	elif battle_context=="progression": settlement=command("settleProgressionTrial",{"battle":battle},false)
	elif battle_context=="framework": settlement=command("challengeSettle",{"battle":battle},false)
	elif battle.get("result")=="win": settlement=command("settleMainBattle",{"battle":battle},false)
	else: settlement={"ok":true,"data":{"message":"未损失基础资源与永久培养。可使用同一锁定战前重试。"}}
	battle_view.call("set_settlement",settlement)
	if battle_context == "framework" and framework_auto_set:
		_framework_continue.call_deferred(str(battle.id))

func _framework_continue(id: String) -> void:
	await get_tree().create_timer(1.2).timeout
	if not framework_auto_set or not is_instance_valid(battle_view) or last_battle.get("id") != id: return
	if presentation_suspended or not settlement.get("ok",false) or last_battle.get("result") != "win":
		framework_auto_set = false; return
	var record: Dictionary = state().framework.challenges.completed.get(id,{})
	if record.get("kind") != "set": framework_auto_set = false; return
	var claimed: Dictionary = command("challengeClaim",{"id":id,"txid":"auto-set-claim:"+id},false)
	if not claimed.ok or int(state().framework.challenges.stamina) < int(GameFramework.rules().setClaimStamina):
		framework_auto_set = false
		battle_view.call("set_settlement",claimed)
		return
	_leave_battle(true)
	_framework_action("challengePrepare",framework_auto_args)

func _leave_battle(automatic: bool = false) -> void:
	if not automatic: framework_auto_set = false
	if is_instance_valid(battle_view):
		remove_child(battle_view)
		battle_view.queue_free()
	battle_view=null
	frame.visible=true
	page=8 if battle_context in ["progression","framework"] else 2
	if battle_context=="framework": system_view="framework:挑战"
	subpage="秘境" if battle_context=="expedition" else "演武" if battle_context=="trial" else "主线"
	_render()

func _gear_character(parent: Node, id: String) -> void:
	var c: VBoxContainer=card(parent,"五位灵装 · 面板战力 %d" % GameEquipment.character_power(state(),id),"战力由实际培养与属性计算，只用于比较。胜负仍由回合战斗决定。")
	var stats: Dictionary=GameEquipment.character_stats(state(),id)
	label(c,"生命%d · 攻击%d · 防御%d · 速度%s\n暴击率%.1f%% · 暴伤%.1f%%" % [stats.hp,stats.atk,stats.def,str(stats.speed),float(stats.critRate)*100,float(stats.critDamage)*100],16,GameTheme.JADE)
	for slot_cfg: Dictionary in GameEquipment.slots():
		var artifact_id: String=str(state().equipment.equipped.get(id,{}).get(slot_cfg.id,""))
		var h: HBoxContainer=row(c)
		var icon: TextureRect=picture(h,"res://assets/ui/%s.svg" % slot_cfg.id,48)
		icon.custom_minimum_size.x=48
		icon.size_flags_horizontal=Control.SIZE_SHRINK_CENTER
		var item: Dictionary=GameEquipment.item(state(),artifact_id)
		button(h,str(slot_cfg.name)+" · "+("未装备" if item.is_empty() else "%s +%d" % [GameEquipment.display_name(item),item.level]),_gear_choices.bind(id,str(slot_cfg.id)),not item.is_empty())
	for bonus: Dictionary in GameEquipment.set_bonuses(state(),id): label(c,"%s %d件 · %s" % [bonus.name,bonus.pieces,bonus.description],15,GameTheme.GOLD)
	button(c,"按面板战力自动搭配",func() -> void: command("equipBestArtifacts",{"characterId":id}))
	button(c,"灵装背包",_gear_bag)

func _gear_inventory(parent: Node) -> void:
	var c: VBoxContainer=card(parent,"灵装背包 · %d / 500" % state().get("equipment",{}).get("items",[]).size(),"主线和秘境实际战斗掉落；灵装工坊可加工培养精华。")
	label(c,"淬灵精华 %d" % state().items.get("relic-essence",0),17,GameTheme.JADE)
	button(c,"查看与整理灵装",_gear_bag,true)

func _command_then(name: String, args: Dictionary, callback: Callable) -> void:
	var result: Dictionary=command(name,args)
	if result.get("ok",false): callback.call()

func _exit_tree() -> void:
	if page_pager: page_pager.dispose()
	if modal_pager: modal_pager.dispose()
	if store: store.release()

func _live_affairs(parent: Node) -> void:
	var info: Dictionary=GameEconomy.check_in_status(state(),store.now_ms())
	var c: VBoxContainer=card(parent,"七日仙缘 · 累计签到","UTC自然日更新；不要求连续签到，不惩罚错过。七日完成后循环。")
	label(c,"累计%d天 · 本轮第%d日" % [info.total,info.cycleDay],20,GameTheme.GOLD)
	var cycle: GridContainer=GridContainer.new()
	cycle.columns=3 if size.x>=480 else 2
	cycle.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	c.add_child(cycle)
	for i: int in 7:
		var day: VBoxContainer=card(cycle,"第%d日" % (i+1))
		label(day,cost(info.rewards[i]).replace(" · ","\n"),12,GameTheme.JADE if i+1==int(info.cycleDay) else GameTheme.MUTED)
	button(c,"今日已签到" if info.claimed else "签到领取 · "+cost(info.reward),func() -> void: command("claimCheckIn"),true,info.claimed)
	var links: HBoxContainer=row(parent)
	button(links,"仙府来信",_local_mail)
	button(links,"成长活动",_activities)
	var extras: HBoxContainer=row(parent)
	button(extras,"派遣委托",_idle_missions)
	button(extras,"仙府商店",_shop)
	button(extras,"仙盟",_go.bind(6))
	button(extras,"三界仙榜",_go.bind(7))

func _local_mail() -> void:
	var box: VBoxContainer=_modal("仙府来信 · 本地奖励信")
	label(box,"这些是版本内固定的奖励信，不是联网玩家或运营消息。奖励各档只领一次。",14,GameTheme.MUTED)
	for mail: Dictionary in GameEconomy.extension_rules().localMail:
		var c: VBoxContainer=card(box,str(mail.get("title",mail.get("name","仙府来信"))),str(mail.get("body",mail.get("description",""))))
		label(c,cost(mail.reward),16,GameTheme.GOLD)
		var claimed: bool=state().get("claimedMail",[]).has(mail.id)
		button(c,"已领取" if claimed else "领取附件",func() -> void: _command_then("claimMail",{"id":mail.id},_local_mail),true,claimed)

func _activities() -> void:
	var box: VBoxContainer=_modal("成长活动 · 常驻目标")
	label(box,"由实际建设与主线进度达成，没有虚假限时倒计时。",15,GameTheme.MUTED)
	for activity: Dictionary in GameEconomy.activity_status(state()):
		var c: VBoxContainer=card(box,str(activity.name),str(activity.description))
		label(c,cost(activity.reward),16,GameTheme.GOLD)
		button(c,"已领取" if activity.claimed else "领取成果" if activity.complete else "条件未完成",func() -> void: _command_then("claimActivity",{"id":activity.id},_activities),true,activity.claimed or not activity.complete)

func _show_offline(report: Dictionary) -> void:
	var box: VBoxContainer=_modal("离府期间 · 府中有获")
	label(box,"本次收益窗口 %d分钟%s" % [int(report.get("elapsedMs",0))/60000," · 已达到12小时收益上限" if report.get("capped",false) else ""],19,GameTheme.GOLD)
	label(box,cost(report.get("resources",{})),18,GameTheme.JADE)
	for id: String in report.get("items",{}): label(box,"%s ×%d" % [item_name(id),report.items[id]],16)
	label(box,"产物已计入府库待领。这份回报只是说明，不会再赠送一次。建设完成按实际时间推进。",16)
	button(box,"一键收取府库",func() -> void: _close_modal(); _harvest(),true)
	button(box,"稍后经营",_close_modal)

func _gear_bag(slot_filter: String="", sort_by: String="rarity") -> void:
	var box: VBoxContainer=_modal("灵装背包 · 五位随机词条")
	label(box,"五位灵装 · 强化主词条，每4级提升副词条。同套2件、4件激活额外属性。",15,GameTheme.MUTED)
	var filters: HBoxContainer=row(box)
	button(filters,"全部",_gear_bag.bind("",sort_by),slot_filter.is_empty())
	for slot_cfg: Dictionary in GameEquipment.slots(): button(filters,str(slot_cfg.name),_gear_bag.bind(str(slot_cfg.id),sort_by),slot_filter==slot_cfg.id)
	var sorts: HBoxContainer=row(box)
	for choice: String in ["rarity","level","newest","favorite"]:
		button(sorts,str({"rarity":"品质","level":"等级","newest":"最新","favorite":"收藏"}[choice]),_gear_bag.bind(slot_filter,choice),sort_by==choice)
	var items: Array=GameEquipment.items(state(),{"slot":slot_filter},sort_by)
	if items.is_empty():
		label(box,"暂无这个部位的灵装。完成真实历练与秘境可获得掉落。",18,GameTheme.JADE)
	for item: Dictionary in items:
		var c: VBoxContainer=card(box,"%s · %d星 +%d" % [GameEquipment.display_name(item),item.rarity,item.level],GameEquipment.stat_text(item.mainStat,float(item.mainValue)))
		var h: HBoxContainer=row(c)
		var icon: TextureRect=picture(h,"res://assets/ui/%s.svg" % item.slot,55)
		icon.custom_minimum_size.x=55
		icon.size_flags_horizontal=Control.SIZE_SHRINK_CENTER
		label(h,("已装备："+char_name(item.equippedBy) if not str(item.equippedBy).is_empty() else "背包中")+(" · 已锁定" if item.locked else "")+(" · 已收藏" if item.favorite else ""),14)
		button(c,"详情 · 强化 · 装备",_gear_detail.bind(str(item.id)))

func _gear_choices(character_id: String, slot: String) -> void:
	var box: VBoxContainer=_modal(char_name(character_id)+" · "+str(GameData.named(GameEquipment.slots(),slot).get("name",slot)))
	var equipped: String=str(state().equipment.equipped.get(character_id,{}).get(slot,""))
	if not equipped.is_empty():
		var item: Dictionary=GameEquipment.item(state(),equipped)
		label(box,"当前装备\n"+GameEquipment.describe_item(item),16,GameTheme.JADE)
		button(box,"查看当前灵装",_gear_detail.bind(equipped))
		button(box,"卸下",func() -> void: _command_then("unequipArtifact",{"characterId":character_id,"slot":slot},func() -> void: _gear_choices(character_id,slot)))
	for item: Dictionary in GameEquipment.items(state(),{"slot":slot},"level"):
		var c: VBoxContainer=card(box,str(GameEquipment.display_name(item)),GameEquipment.describe_item(item))
		var owner: String=GameEquipment.equipped_by(state(),str(item.id))
		if not owner.is_empty(): label(c,"当前由"+char_name(owner)+"装备",14,GameTheme.MUTED)
		button(c,"装备给"+char_name(character_id),func() -> void: _command_then("equipArtifact",{"id":item.id,"characterId":character_id},func() -> void: _gear_choices(character_id,slot)),true,not owner.is_empty() and owner!=character_id)
		button(c,"查看详情",_gear_detail.bind(str(item.id)))

func _gear_detail(id: String) -> void:
	var item: Dictionary=GameEquipment.item(state(),id)
	if item.is_empty(): _gear_bag(); return
	var box: VBoxContainer=_modal(str(GameEquipment.display_name(item)))
	picture(box,"res://assets/ui/%s.svg" % item.slot,126)
	label(box,GameEquipment.describe_item(item),19,GameTheme.JADE)
	label(box,"来源："+str(item.get("sourceId","实际掉落")),13,GameTheme.MUTED)
	var actions: HBoxContainer=row(box)
	button(actions,"已锁定 · 解锁" if item.locked else "锁定",func() -> void: _command_then("lockArtifact",{"id":id,"value":not item.locked},func() -> void: _gear_detail(id)))
	button(actions,"取消收藏" if item.favorite else "收藏",func() -> void: _command_then("favoriteArtifact",{"id":id,"value":not item.favorite},func() -> void: _gear_detail(id)))
	button(box,"强化预览",_gear_enhance.bind(id,mini(GameEquipment.max_level(int(item.rarity)),int(item.level)+4),[]),true,int(item.level)>=GameEquipment.max_level(int(item.rarity)))
	button(box,"选择角色装备",_gear_equip_to.bind(id))
	button(box,"分解为淬灵精华",_gear_salvage.bind(id),false,item.locked or item.favorite or not GameEquipment.equipped_by(state(),id).is_empty())

func _gear_equip_to(id: String) -> void:
	var box: VBoxContainer=_modal("选择灵装佩戴者")
	for character_id: String in state().owned:
		button(box,char_name(character_id),func() -> void: _command_then("equipArtifact",{"id":id,"characterId":character_id},func() -> void: _open_character(character_id)))

func _gear_enhance(id: String,target_level: int,materials: Array) -> void:
	var item: Dictionary=GameEquipment.item(state(),id)
	var preview: Dictionary=GameEquipment.enhance_preview(state(),id,target_level,materials)
	var box: VBoxContainer=_modal("强化预览 · 尚未抽取结果")
	if not preview.ok: label(box,str(preview.error),18,GameTheme.RED); return
	var p: Dictionary=preview.data
	label(box,"%s　+%d → +%d" % [GameEquipment.display_name(item),p.fromLevel,p.targetLevel],23,GameTheme.GOLD)
	label(box,"主词条：%s → %s" % [GameEquipment.stat_text(item.mainStat,float(p.mainBefore)),GameEquipment.stat_text(item.mainStat,float(p.mainAfter))],18,GameTheme.JADE)
	var owner_id: String=GameEquipment.equipped_by(state(),id)
	if not owner_id.is_empty():
		var preview_state: Dictionary=state().duplicate(true)
		var preview_item: Dictionary=GameEquipment.item(preview_state,id)
		preview_item.mainValue=p.mainAfter
		preview_item.level=p.targetLevel
		label(box,"%s战力：%d → 至少%d" % [char_name(owner_id),GameEquipment.character_power(state(),owner_id),GameEquipment.character_power(preview_state,owner_id)],19,GameTheme.RED)
		label(box,"按确定提升的主词条计算；副词条结果在强化完成后计入。",13,GameTheme.MUTED)
	label(box,"消耗：%s · 淬灵精华%d（现有%d）" % ["货币免扣" if GameEconomy.free_currency() else cost(p.costs),p.essence,state().items.get("relic-essence",0)],17)
	label(box,str(p.probabilityText),15)
	for milestone: Dictionary in p.milestones: label(box,"+%d：%s" % [milestone.level,milestone.description],15,GameTheme.GOLD)
	if not str(p.warning).is_empty(): label(box,str(p.warning),15,GameTheme.RED)
	if not materials.is_empty():
		var consumed_names: PackedStringArray=[]
		for material_id: String in materials: consumed_names.append(GameEquipment.display_name(GameEquipment.item(state(),material_id)))
		label(box,"会消耗%d件：%s" % [materials.size(),"、".join(consumed_names)],15,GameTheme.RED)
	if int(p.refundEssence)>0 or int(p.lostXp)>0: label(box,"溢出退回精华%d · 不足100经验的余量损失%d" % [p.refundEssence,p.lostXp],15,GameTheme.GOLD)
	var levels: HBoxContainer=row(box)
	button(levels,"+1级",_gear_enhance.bind(id,mini(GameEquipment.max_level(int(item.rarity)),int(item.level)+1),materials))
	button(levels,"+4级",_gear_enhance.bind(id,mini(GameEquipment.max_level(int(item.rarity)),int(item.level)+4),materials))
	button(levels,"至上限",_gear_enhance.bind(id,GameEquipment.max_level(int(item.rarity)),materials))
	button(box,"确认强化并保存结果",func() -> void: _command_then("enhanceArtifact",{"id":id,"targetLevel":target_level,"consumeIds":materials},func() -> void: _gear_detail(id)),true,not p.affordable)
	label(box,"可选材料灵装 · 点选后才纳入预览",20,GameTheme.GOLD)
	for fodder: Dictionary in GameEquipment.items(state(),{"unequipped":true},"rarity"):
		if fodder.id==id or fodder.locked or fodder.favorite: continue
		button(box,("✓ " if materials.has(fodder.id) else "+ ")+"%s %d星+%d" % [fodder.name,fodder.rarity,fodder.level],func() -> void:
			var chosen: Array=materials.duplicate()
			if chosen.has(fodder.id): chosen.erase(fodder.id)
			else: chosen.append(fodder.id)
			_gear_enhance(id,target_level,chosen)
		,materials.has(fodder.id))

func _capture_later(path: String) -> void:
	for i: int in 10: await get_tree().process_frame
	if toast_time>0: await get_tree().create_timer(toast_time+0.2).timeout
	await RenderingServer.frame_post_draw
	var pixels: Image=get_viewport().get_texture().get_image()
	var error: Error=pixels.save_png(path)
	print("NATIVE_CAPTURE ",path," status=",error)

func _idle_missions() -> void:
	var box: VBoxContainer=_modal("派遣委托 · 最多三项")
	label(box,"委托按真实时间完成，回来领取一次成果。派遣角色不能同时参加另一委托；仍可上阵和驻府。",15,GameTheme.MUTED)
	for mission: Dictionary in GameEconomy.idle_mission_status(state(),store.now_ms()):
		var c: VBoxContainer=card(box,str(mission.name),"派遣："+_team_names(mission.characters))
		label(c,"已完成" if mission.ready else "尚余%d分%d秒" % [int(mission.remainingMs)/60000,(int(mission.remainingMs)/1000)%60],18,GameTheme.JADE)
		label(c,cost(mission.reward),15)
		button(c,"领取派遣成果",func() -> void: _command_then("claimIdleMission",{"id":mission.id},_idle_missions),true,not mission.ready)
	for mission: Dictionary in GameEconomy.extension_rules().idleMissions:
		var c: VBoxContainer=card(box,str(mission.name),str(mission.get("description","")))
		label(c,"%d分钟 · %s · %d至%d人" % [int(mission.duration)/60000,cost(mission.reward),mission.minCharacters,mission.maxCharacters],15)
		var unlocked: bool=int(mission.unlockStage)==0 or state().cleared.has(mission.unlockStage)
		button(c,"选择派遣法相" if unlocked else "先完成第%d节点" % mission.unlockStage,_idle_choose.bind(str(mission.id),[]),true,not unlocked)

func _idle_choose(mission_id: String,ids: Array) -> void:
	var mission: Dictionary=GameData.named(GameEconomy.extension_rules().idleMissions,mission_id)
	var box: VBoxContainer=_modal("派遣 · "+str(mission.name))
	label(box,"已选："+_team_names(ids),18,GameTheme.GOLD)
	var busy: Array=[]
	for active: Dictionary in GameEconomy.idle_mission_status(state()): busy.append_array(active.characters)
	for id: String in state().owned:
		if busy.has(id): continue
		button(box,("✓ " if ids.has(id) else "+ ")+char_name(id),func() -> void:
			var next: Array=ids.duplicate()
			if next.has(id): next.erase(id)
			elif next.size()<int(mission.maxCharacters): next.append(id)
			_idle_choose(mission_id,next)
		,ids.has(id))
	button(box,"确认派遣",func() -> void: _command_then("startIdleMission",{"missionId":mission_id,"characters":ids},_idle_missions),true,ids.size()<int(mission.minCharacters))

func _shop() -> void:
	var box: VBoxContainer=_modal("仙府商店 · 普通资源兑换")
	label(box,"仅使用游戏内资源。按UTC自然日刷新公开兑换限额，无真实支付。购入道具进入背包后使用。",15,GameTheme.MUTED)
	for item: Dictionary in GameEconomy.shop_status(state(),store.now_ms()):
		var c: VBoxContainer=card(box,str(GameEquipment.display_name(item)),str(item.get("description","")))
		label(c,"%s · 今日剩余%d" % [cost(item.cost),item.remaining],17,GameTheme.JADE)
		button(c,"兑换一份",func() -> void: _command_then("buyShopItem",{"id":item.id,"count":1},_shop),true,int(item.remaining)<1)
	button(box,"前往背包使用",func() -> void: _close_modal(); page=4; subpage="背包"; _render())

func _character_challenges(parent: Node,id: String) -> void:
	var c: VBoxContainer=card(parent,"法相试炼 · "+char_name(id),"携带这位法相进入真实挑战。一次性成果单独记录，不重复领取主线首通。")
	for challenge: Dictionary in GameEconomy.character_challenge_status(state(),id):
		var encounter: VBoxContainer=card(c,str(challenge.get("encounterName",challenge.get("name","第%d阶" % challenge.id))),str(challenge.get("mechanic","")))
		label(encounter,"本场运用 · "+str(challenge.get("focusSkill",GameData.character(id).get("skillName",""))),15,GameTheme.JADE)
		var foes: PackedStringArray=[]
		for enemy: Dictionary in challenge.get("enemies",[]):
			foes.append("%s · %s · 生命%d" % [enemy.name,"前排" if enemy.get("row")=="front" else "后排",int(enemy.hp)])
		if not foes.is_empty(): label(encounter,"敌情："+"；".join(foes),13,GameTheme.MUTED)
		label(encounter,"需修为%d / 主线%d\n%s" % [challenge.minLevel,challenge.stageId,cost(challenge.reward)],14)
		button(encounter,"已完成" if challenge.claimed else "挑战试炼",_start_challenge.bind(id,int(challenge.id)),true,challenge.claimed or not challenge.unlocked)

func _start_challenge(id: String,tier: int) -> void:
	var result: Dictionary=command("prepareCharacterChallenge",{"characterId":id,"tier":tier},false)
	if result.ok: _enter_battle(result.data,"challenge")

func _field(parent: Node,text: String,placeholder: String="") -> LineEdit:
	var field: LineEdit=LineEdit.new()
	field.text=text
	field.placeholder_text=placeholder
	field.custom_minimum_size.y=48
	field.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	parent.add_child(field)
	return field

func _mock_menu() -> void:
	var box: VBoxContainer=_modal("联机流程 · 内测模拟")
	label(box,"全部在本机模拟，不连接服务器、不发送真实聊天、不真实扣款。测试账号与普通存档隔离，两台虚拟设备分别保留本地进度。",17,GameTheme.GOLD)
	if state().has("mockAccount"):
		mock_account=str(state().mockAccount)
		mock_realm=str(state().mockRealm)
		mock_device=str(state().get("mockDevice","device_1"))
	if mock_service==null or mock_service.realm!=mock_realm:
		mock_service=GameOnlineMock.new(store.base_dir.path_join("mock-service.json"),mock_realm)
		mock_service.load_data()
	if mock_service._corrupt:
		var recovery: VBoxContainer=card(box,"模拟服务需要恢复","当前模拟服务文件缺失或损坏，已禁止写入。可在登录前恢复有效备份；各游戏存档保持独立。")
		button(recovery,"恢复模拟服务备份",_mock_restore_confirm,true)
		button(recovery,"重新检查模拟服务",_mock_reload)
		if state().has("mockAccount"): button(box,"返回普通存档",func() -> void: _load_slot("normal"); mock_service=null)
		return
	if not state().has("mockAccount"):
		label(box,"选择测试分区、账号与虚拟设备后进入。",16)
		var realm_row: HBoxContainer=row(box)
		button(realm_row,"普通规则分区",func() -> void: mock_realm="normal"; _mock_menu(),mock_realm=="normal")
		button(realm_row,"全图鉴试用分区",func() -> void: mock_realm="demo:roster"; _mock_menu(),mock_realm!="normal")
		var accounts: HBoxContainer=row(box)
		for id: String in ["test_a","test_b"]: button(accounts,"测试账号 "+id,func() -> void: mock_account=id; _mock_menu(),mock_account==id)
		var devices: HBoxContainer=row(box)
		for id: String in ["device_1","device_2"]: button(devices,"虚拟设备 "+id,func() -> void: mock_device=id; _mock_menu(),mock_device==id)
		var nickname: LineEdit=_field(box,"仙友甲" if mock_account=="test_a" else "仙友乙","测试昵称")
		button(box,"进入本机测试账号",func() -> void: _mock_login(nickname.text),true)
		return
	label(box,"%s / %s / %s" % [mock_realm,mock_account,mock_device],18,GameTheme.JADE)
	var grid: GridContainer=GridContainer.new()
	grid.columns=2
	grid.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	box.add_child(grid)
	for entry: Array in [["模拟云档",_mock_cloud],["模拟聊天",_mock_chat],["模拟公会",_mock_guild],["模拟榜单",_mock_rank],["模拟支付",_mock_payment]]:
		button(grid,str(entry[0]),entry[1])
	button(box,"模拟连接：断开" if mock_service.offline else "模拟连接：正常",func() -> void: mock_service.offline=not mock_service.offline; _mock_menu())
	button(box,"重新载入模拟服务",_mock_reload)
	button(box,"切换测试账号 / 虚拟设备",func() -> void: _load_slot("normal"); mock_service=null; _mock_menu())
	button(box,"退出测试账号，回普通存档",func() -> void: _load_slot("normal"); mock_service=null, true)

func _mock_login(nickname: String) -> void:
	mock_service=GameOnlineMock.new(store.base_dir.path_join("mock-service.json"),mock_realm)
	var result: Dictionary=mock_service.command(mock_account,mock_device,"login",{"nickname":nickname})
	if not result.ok: _mock_menu(); toast(str(result.error)); return
	var loaded: Variant=store.call("load_mock_profile",mock_realm,mock_account,mock_device)
	if not loaded is Dictionary or not loaded.get("ok",false):
		toast(str(loaded.get("error","测试档载入失败")) if loaded is Dictionary else "测试档载入失败")
		return
	page=4
	subpage="任务"
	_render()
	_mock_menu()

func _mock_reload() -> void:
	var result: Dictionary=mock_service.load_data()
	_mock_menu()
	if not result.get("ok",false): toast(str(result.get("error","模拟服务仍无法载入。")))

func _mock_restore_confirm() -> void:
	_confirm("恢复模拟服务备份","恢复整个本机模拟服务的最近有效备份，涵盖全部测试账号与分区。备份之后的聊天、公会、测试订单及云版本会回退。如有损坏的原文件，会另存保留。普通档与各账号／虚拟设备的本地游戏缓存不会改写。",_mock_restore_backup)

func _mock_restore_backup() -> void:
	var result: Dictionary=mock_service.call("restore_backup")
	_mock_menu()
	if result.get("ok",false): toast("模拟服务备份已恢复；本地游戏档未改写。")
	else: toast(str(result.get("error","模拟服务恢复失败，原文件已保留。")))

func _mock_command(op: String,args: Dictionary={}) -> Dictionary:
	var result: Dictionary=mock_service.command(mock_account,mock_device,op,args)
	if not result.ok: toast(str(result.error))
	return result

func _mock_cloud() -> void:
	var result: Dictionary=_mock_command("cloud_download")
	if not result.ok: return
	var cloud: Dictionary=result.data
	mock_revision=int(cloud.get("revision",0))
	var local_revision: int=int(state().revision)
	var box: VBoxContainer=_modal("模拟云存档 · 本机双端流程")
	label(box,"当前设备本地修订 %d · 模拟云修订 %d" % [local_revision,mock_revision],19,GameTheme.GOLD)
	label(box,"上传比较模拟云版本；冲突时不会静默覆盖。下载也会比较本地修订，导入前验证并备份。",16)
	if not cloud.is_empty(): label(box,"最近由%s上传\n队伍：%s · 已通主线%d" % [cloud.get("device",""),_team_names(cloud.get("save",{}).get("team",[])),cloud.get("save",{}).get("cleared",[]).size()],15,GameTheme.JADE)
	button(box,"上传本机进度",func() -> void:
		var upload: Dictionary=_mock_command("cloud_upload",{"save":state().duplicate(true),"expected_revision":mock_revision})
		if upload.ok: _mock_cloud()
		elif upload.get("data",{}).get("code")=="CONFLICT":
			var panel: VBoxContainer=_modal("模拟云版本冲突")
			label(panel,"另一设备已有新进度，当前本机进度未被覆盖。先重新比较，再明确选择上传或下载。",18,GameTheme.GOLD)
			button(panel,"重新比较两个版本",_mock_cloud,true)
	,true)
	button(box,"下载模拟云档到此设备",func() -> void: _confirm("导入模拟云存档","会备份并替换当前测试账号的这个设备缓存；不影响普通档。",func() -> void: _mock_import(cloud,local_revision,false)),false,cloud.is_empty())

func _mock_import(payload: Dictionary,local_revision: int,force: bool) -> void:
	var result: Variant=store.call("import_mock_state",payload,local_revision,force)
	if not result is Dictionary: toast("模拟云档导入失败。"); return
	if result.get("ok",false): _render(); _mock_cloud(); toast("模拟云档已校验导入。")
	else:
		toast(str(result.get("error","导入失败")))
		if not force and result.get("data",{}).get("code")=="LOCAL_CONFLICT": _confirm("本地进度已变化",str(result.get("error","本地版本发生变化"))+"\n确认备份本地后仍导入此前选择的模拟云档？",func() -> void: _mock_import(payload,int(state().revision),true))

func _mock_chat(channel: String="world") -> void:
	var result: Dictionary=_mock_command("chat_history",{"channel":channel})
	if not result.ok: return
	var box: VBoxContainer=_modal("模拟聊天 · 本机测试账号可见")
	var tabs: HBoxContainer=row(box)
	button(tabs,"世界频道",_mock_chat.bind("world"),channel=="world")
	button(tabs,"公会频道",_mock_chat.bind("guild"),channel=="guild")
	label(box,"没有机器人或预造玩家消息；只展示你用这些本机测试账号发送的内容。",14,GameTheme.MUTED)
	if result.data.is_empty(): label(box,"频道还没有消息。",18)
	for message: Dictionary in result.data:
		var c: VBoxContainer=card(box,str(message.nickname)+" · "+str(message.account))
		label(c,str(message.text),17)
	var field: LineEdit=_field(box,"","输入1至200字的本机测试消息")
	button(box,"发送到模拟频道",func() -> void:
		var sent: Dictionary=_mock_command("chat_send",{"text":field.text,"channel":channel,"request_id":"ui-%d" % Time.get_ticks_usec()})
		if sent.ok: _mock_chat(channel)
	,true)

func _mock_guild() -> void:
	var info: Dictionary=_mock_command("guild_info")
	if not info.ok: return
	var box: VBoxContainer=_modal("模拟公会 · 本机测试账号")
	var guild: Dictionary=info.data
	if not guild.is_empty():
		label(box,str(guild.name),24,GameTheme.GOLD)
		label(box,"会长：%s · 成员%d / %d\n%s" % [guild.owner,guild.members.size(),guild.capacity," · ".join(PackedStringArray(guild.members))],17)
		button(box,"公会模拟聊天",_mock_chat.bind("guild"))
		if guild.owner==mock_account and guild.members.size()>1:
			label(box,"会长退出前选择继任成员：",17)
			for member: String in guild.members:
				if member!=mock_account: button(box,"交接给%s并退出" % member,func() -> void: _mock_then("guild_leave",{"successor_id":member},func() -> void: _mock_guild()))
		else: button(box,"退出模拟公会",func() -> void: _mock_then("guild_leave",{},func() -> void: _mock_guild()))
	else:
		var name_field: LineEdit=_field(box,"","公会名，1至20字")
		button(box,"创建模拟公会",func() -> void: _mock_then("guild_create",{"name":name_field.text},func() -> void: _mock_guild()),true)
	var listed: Dictionary=_mock_command("guild_list")
	if listed.ok:
		for g: Dictionary in listed.data:
			button(box,"%s · %d / %d" % [g.name,g.members.size(),g.capacity],func() -> void: _mock_then("guild_join",{"guild_id":g.id},func() -> void: _mock_guild()),false,not guild.is_empty())
		if listed.data.is_empty(): label(box,"还没有测试公会，可创建一个后切换测试账号加入。",16,GameTheme.MUTED)

func _mock_rank(board: String="power") -> void:
	var result: Dictionary=_mock_command("rank_list",{"board":board})
	if not result.ok: return
	var box: VBoxContainer=_modal("模拟榜单 · 非真实玩家排行")
	var tabs: HBoxContainer=row(box)
	button(tabs,"面板战力",_mock_rank.bind("power"),board=="power")
	button(tabs,"主线进度",_mock_rank.bind("challenge"),board=="challenge")
	label(box,"只排列主动提交过成绩的本机测试账号。不伪造其他玩家、不发排名奖励。",15,GameTheme.MUTED)
	for entry: Dictionary in result.data: label(box,"%d　%s　%d" % [entry.rank,entry.nickname,entry.score],20,GameTheme.JADE)
	var score: int=GameEquipment.team_power(state()) if board=="power" else state().cleared.size()
	button(box,"提交当前真实面板 %d" % score,func() -> void: _mock_then("rank_submit",{"board":board,"score":score},func() -> void: _mock_rank(board)),true)

func _mock_payment() -> void:
	var result: Dictionary=_mock_command("payment_products")
	if not result.ok: return
	var box: VBoxContainer=_modal("模拟支付 · 不真实扣款")
	label(box,"测试下单、成功/失败/取消回调及回执去重。没有支付渠道、银行卡或真实货币流转。到账仅在模拟账号分区。",17,GameTheme.GOLD)
	for sku: String in result.data:
		var product: Dictionary=result.data[sku]
		var c: VBoxContainer=card(box,str(product.name),str(product.price_label)+"\n"+cost(product.rewards))
		button(c,"创建测试订单",func() -> void:
			var order: Dictionary=_mock_command("payment_create",{"sku":sku,"request_id":"ui-%d" % Time.get_ticks_usec()})
			if order.ok: _mock_order(order.data)
		,true)
	var orders: Dictionary=_mock_command("payment_orders")
	if orders.ok:
		for order: Dictionary in orders.data: button(box,"%s · %s · %s" % [order.id,order.price_label,order.status],_mock_order.bind(order))

func _mock_order(order: Dictionary) -> void:
	var box: VBoxContainer=_modal("测试订单 · "+str(order.id))
	label(box,str(order.price_label)+"\n状态："+str(order.status)+"\n模拟奖励："+cost(order.rewards),19,GameTheme.GOLD)
	if order.status=="pending":
		for outcome: String in ["paid","cancelled","failed"]:
			button(box,str({"paid":"模拟支付成功","cancelled":"模拟用户取消","failed":"模拟支付失败"}[outcome]),func() -> void:
				var result: Dictionary=_mock_command("payment_settle",{"order_id":order.id,"outcome":outcome})
				if result.ok: _mock_order(result.data)
			,outcome=="paid")
	elif order.status=="paid":
		label(box,"回执："+str(order.get("receipt_id","")),13,GameTheme.MUTED)
		if mock_realm=="normal": button(box,"验证回执并领取一次",func() -> void: _mock_redeem(order),true)
		else: label(box,"试用分区只测试回调；回执不发资产。",15,GameTheme.MUTED)
	button(box,"返回测试订单列表",_mock_payment)

func _mock_redeem(order: Dictionary) -> void:
	var result: Variant=store.call("redeem_mock_receipt",order,mock_service)
	if result is Dictionary and result.get("ok",false): _render(); _mock_order(order); toast("模拟回执已处理，同一回执不会重复发放。")
	else: toast(str(result.get("error","模拟回执未通过验证")) if result is Dictionary else "回执未提交")

func _mock_then(op: String,args: Dictionary,callback: Callable) -> void:
	var result: Dictionary=_mock_command(op,args)
	if result.ok: callback.call()

func _gear_salvage(id: String) -> void:
	var result: Dictionary=GameEquipment.salvage_preview(state(),[id])
	if not result.ok: toast(str(result.error)); return
	var data: Dictionary=result.data
	if not data.fits: toast("淬灵精华达到容量上限，请先使用。"); return
	_confirm("分解灵装","消耗：%s\n获得淬灵精华 %d\n%s" % ["、".join(PackedStringArray(data.names)),data.essence,data.warning],func() -> void: _command_then("salvageArtifacts",{"ids":[id]},_gear_bag))

func _fit_modal() -> void:
	await get_tree().process_frame
	if not is_instance_valid(overlay) or not is_instance_valid(modal_box): return
	_resize_modal()
	if modal_pager: modal_pager.rebuild()

func _active_challenge_card(parent: Node) -> void:
	var active: Variant=state().get("characterChallenges",{}).get("active")
	if not active is Dictionary: return
	var c: VBoxContainer=card(parent,"未完成的法相试炼 · "+char_name(active.characterId),"已锁定原队伍、培养与丹药；后续更换阵容或重置角色不会改变本次快照。")
	button(c,"继续锁定试炼",_start_challenge.bind(str(active.characterId),int(active.tier)),true)
	button(c,"结束本次试炼",func() -> void: _confirm("结束法相试炼","清除本次战前记录，不发未完成奖励；已生效丹药不退回。之后可正常开始其他历练。",func() -> void: command("abandonCharacterChallenge",{})))

func _restore_backup() -> void:
	_confirm("恢复最近有效备份","将先验证备份，再恢复当前槽。备份之后的进度可能丢失；当前异常原件会保留以便排查。其他普通、展示或模拟账号槽不受影响。",func() -> void:
		var result: Dictionary=store.restore_backup()
		if result.ok: _render(); toast("已恢复通过校验的备份。")
		else: toast(str(result.get("error","没有可恢复的有效备份")))
	)

func _save_load_error(result: Dictionary) -> void:
	if store.slot!="normal" or not store.corruption: return
	var box: VBoxContainer=_modal("存档校验未通过 · 原件已保留")
	label(box,str(result.get("error","无法安全读取当前存档")),18,GameTheme.RED)
	label(box,"没有静默覆盖为空档。当前只展示恢复说明，不显示未经校验的资产或进度；可以恢复有效备份，或导入之前导出的JSON。",16)
	button(box,"恢复最近有效备份",_restore_backup,true,not result.get("backupAvailable",false))
	button(box,"选择已有存档导入",_import_save)

func _back_characters() -> void:
	selected_character=""
	_render()
	await get_tree().process_frame
	if page==1 and selected_character.is_empty(): body_scroll.scroll_vertical=roster_scroll

func _constructing_ids() -> Dictionary:
	var result: Dictionary={}
	for building: Dictionary in state().get("buildings",[]):
		if int(building.get("readyAt",0))>0: result[building.id]=true
	return result

func _construction_feedback(previous: Dictionary) -> void:
	var completed: PackedStringArray=[]
	for building: Dictionary in state().get("buildings",[]):
		if previous.has(building.id) and int(building.get("readyAt",0))==0:
			completed.append(str(GameEconomy.spec(str(building.type)).get("name",building.type)))
	if not completed.is_empty():
		if audio.activated: audio.cue("complete")
		toast("、".join(completed)+"已完工。")
