extends Control
const Presenter = preload("res://scripts/ui/forge_presenter.gd")
const ResultScene = preload("res://scenes/ui/equipment_result.tscn")
var app: Control
var result_view: Control
var busy: bool = false
var fixture: bool = false
var pending_id: String = ""
var feedback: Tween
var modal_focus: Dictionary = {}
func _ready() -> void:
	resized.connect(_layout_page)
	var profile_entry := Button.new()
	profile_entry.name = "FrameworkEntry"
	profile_entry.flat = true
	profile_entry.tooltip_text = "府主与阵容 · 仙府经营 · 挑战"
	profile_entry.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for style in ["normal","hover","pressed","focus"]: profile_entry.add_theme_stylebox_override(style,StyleBoxEmpty.new())
	$Design/Profile.add_child(profile_entry)
	profile_entry.pressed.connect(func() -> void:
		if is_instance_valid(app) and not busy: app._framework_page("阵容"))
	$Design/Profile/Info/Avatar.texture = preload("res://scripts/ui/foundation_icons.gd").texture("friends")
	$Design/Forge.pressed.connect(forge)
	$Design/Comparison/Content/ButtonMargins/Actions/Equip.pressed.connect(func() -> void: handle_item("equip"))
	$Design/Comparison/Content/ButtonMargins/Actions/Salvage.pressed.connect(func() -> void: handle_item("salvage"))
	$Design/Resources/Stone.operation_requested.connect(func(_id: String) -> void: route("043"))
	$Design/Resources/XP.operation_requested.connect(func(_id: String) -> void: route("005"))
	$Design/Navigation.navigation_requested.connect(navigate)
	for button: Button in $Design/Entries.get_children():
		button.pressed.connect(route.bind(str(button.get_meta("route",""))))
	_layout_page.call_deferred()
func configure(owner_app: Control, use_fixture: bool = false) -> void:
	app = owner_app
	fixture = use_fixture
	pending_id = str(app.get_meta("forge_pending_id","")) if is_instance_valid(app) else ""
	refresh()
func _layout_page() -> void:
	# A route change can remove this scene before its deferred resize executes.
	if not is_inside_tree() or is_queued_for_deletion(): return
	var safe: Rect2 = GameSafeArea.rect_for(self)
	# A platform adapter may supply capsule bottom in logical viewport pixels.
	var capsule: float = float(get_window().get_meta("ui_capsule_bottom",0.0))
	if capsule > safe.position.y:
		var inset: float = minf(capsule-safe.position.y,safe.size.y-1)
		safe.position.y += inset; safe.size.y -= inset
	var factor: float = minf(safe.size.x/941.0,safe.size.y/1672.0)
	$Design.scale = Vector2.ONE * factor
	$Design.position = safe.position+(safe.size-Vector2(941,1672)*factor)/2.0
	if is_instance_valid(result_view): result_view.layout(safe)
func refresh() -> void:
	if not is_node_ready(): return
	var fresh: Dictionary = {}
	var current: Dictionary = {}
	if fixture:
		$Design/Resources/Stone.set_amount(128000)
		$Design/Resources/XP.set_amount(64000)
		$Design/Profile/Info/Words/Realm.text = "筑基三层"
		$Design/Power/Row/Value.text = "战力 8.26万"
		$Design/Comparison/Content/CardMargins/Cards/Current.configure(Presenter.sample(false))
		$Design/Comparison/Content/CardMargins/Cards/New.configure(Presenter.sample(true))
	else:
		if not is_instance_valid(app): return
		var s: Dictionary = app.state()
		$Design/Resources/Stone.set_amount(int(s.resources.get("stone",0)))
		$Design/Resources/XP.set_amount(int(s.resources.get("xp",0)))
		$Design/Profile/Info/Words/Realm.text = GameProgression.realm_name(s)
		$Design/Power/Row/Value.text = "战力 "+str(GameEquipment.team_power(s))
		fresh = GameEquipment.item(s,pending_id)
		current = GameEquipment.shared_item(s,str(fresh.get("slot","sword")))
		$Design/Comparison/Content/CardMargins/Cards/Current.configure(Presenter.card(current,"当前装备"))
		$Design/Comparison/Content/CardMargins/Cards/New.configure(Presenter.card(fresh,"新炼装备"))
	var available: bool = fixture or not fresh.is_empty()
	$Design/Comparison/Content/ButtonMargins/Actions/Equip.disabled = not available or busy
	$Design/Comparison/Content/ButtonMargins/Actions/Salvage.disabled = not available or busy or (not fixture and (fresh.get("locked",false) or fresh.get("favorite",false) or not GameEquipment.equipped_by(app.state(),pending_id).is_empty()))
	$Design/Forge.disabled = busy
	$Design/TestLabel.text = "固定视觉样例 · 非业务数据" if fixture else ("开发测试 · 货币免扣" if GameEconomy.free_currency() else "")
func forge() -> void:
	if busy or is_instance_valid(result_view): return
	if fixture:
		show_result(); return
	if not is_instance_valid(app): return
	busy = true
	refresh()
	var result: Dictionary = app.command("progForge",{},false)
	if not result.get("ok",false):
		busy = false; refresh(); return
	pending_id = str(result.data.item.id)
	app.set_meta("forge_pending_id",pending_id)
	# Commit already succeeded. Animation is cancellable presentation only.
	feedback = create_tween()
	feedback.tween_property($Design/Subject,"modulate",Color(1.2,1.13,0.9),0.12)
	feedback.tween_property($Design/Subject,"modulate",Color.WHITE,0.18)
	feedback.tween_callback(func() -> void:
		busy = false; refresh(); show_result())
func show_result() -> void:
	if is_instance_valid(result_view): return
	for node in $Design.find_children("*","Control",true,false):
		if node.focus_mode != Control.FOCUS_NONE:
			modal_focus[node] = node.focus_mode
			node.focus_mode = Control.FOCUS_NONE
	result_view = ResultScene.instantiate()
	add_child(result_view)
	result_view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	result_view.action_requested.connect(handle_item)
	result_view.closed.connect(close_result)
	result_view.configure(app,pending_id,fixture)
	_layout_page()
func close_result() -> void:
	if is_instance_valid(result_view):
		remove_child(result_view); result_view.queue_free()
	result_view = null
	for node in modal_focus:
		if is_instance_valid(node): node.focus_mode = modal_focus[node]
	modal_focus.clear()
	$Design/Forge.grab_focus()
	refresh()
func handle_item(action: String) -> void:
	if busy: return
	if action == "keep": close_result(); return
	if fixture: close_result(); return
	if pending_id.is_empty() or not is_instance_valid(app): return
	busy = true
	var result: Dictionary = app.command("progEquipShared" if action == "equip" else "salvageArtifacts",{"id":pending_id} if action == "equip" else {"ids":[pending_id]},false)
	busy = false
	if result.get("ok",false):
		pending_id = ""; app.set_meta("forge_pending_id",""); close_result()
	else:
		refresh()
		if is_instance_valid(result_view): result_view.configure(app,pending_id,false)
func navigate(target: String) -> void:
	if not is_instance_valid(app) or busy: return
	match target:
		"Estate": app._go(0)
		"Roster": app._go(1)
		"Forge": pass
		"Adventure": app._go(2)
		"Shop": app._systems_page("043")
func route(id: String) -> void:
	if not is_instance_valid(app) or busy: return
	if id == "summon": app._go(3)
	elif id == "guild": app._go(6)
	else: app._systems_page(id)
