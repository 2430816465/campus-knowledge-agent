extends Control
signal action_requested(action: String)
signal closed
const Presenter = preload("res://scripts/ui/forge_presenter.gd")
var app: Control
var item_id: String = ""
var fixture: bool = false
func _ready() -> void:
	$Design/Panel/Content/Header/Close.pressed.connect(func() -> void: closed.emit())
	$Design/Panel/Content/Actions/Keep.pressed.connect(func() -> void: action_requested.emit("keep"))
	$Design/Panel/Content/Actions/Equip.pressed.connect(func() -> void: action_requested.emit("equip"))
	$Design/Panel/Content/Actions/Salvage.pressed.connect(func() -> void: action_requested.emit("salvage"))
	$Design/Panel/Content/Lock.toggled.connect(_lock)
	$Design/Panel/Content/Actions/Keep.grab_focus()
	if not OS.get_cmdline_user_args().has("--freeze-ui"):
		$Design/Panel.modulate.a = 0
		create_tween().tween_property($Design/Panel,"modulate:a",1.0,0.15)
func layout(safe: Rect2) -> void:
	var factor: float = minf(safe.size.x/941.0,safe.size.y/1672.0)
	$Design.scale = Vector2.ONE*factor
	$Design.position = safe.position+(safe.size-Vector2(941,1672)*factor)/2.0
func configure(owner_app: Control, id: String, use_fixture: bool) -> void:
	app = owner_app; item_id = id; fixture = use_fixture
	if fixture:
		$Design/Panel/Content/Scroll/Cards/Current.configure(Presenter.sample(false,true))
		$Design/Panel/Content/Scroll/Cards/New.configure(Presenter.sample(true,true))
		return
	var item: Dictionary = GameEquipment.item(app.state(),id)
	var old: Dictionary = GameEquipment.shared_item(app.state(),str(item.get("slot","sword")))
	$Design/Panel/Content/Scroll/Cards/Current.configure(Presenter.card(old,"当前装备",true))
	$Design/Panel/Content/Scroll/Cards/New.configure(Presenter.card(item,"新获得装备",true))
	$Design/Panel/Content/Lock.set_pressed_no_signal(bool(item.get("locked",false)))
	$Design/Panel/Content/Actions/Salvage.disabled = item.is_empty() or item.get("locked",false) or item.get("favorite",false) or not GameEquipment.equipped_by(app.state(),id).is_empty()
	$Design/Panel/Content/Actions/Equip.disabled = item.is_empty()
func _lock(enabled: bool) -> void:
	if fixture: return
	app.command("lockArtifact",{"id":item_id,"value":enabled},false)
	configure(app,item_id,false)
func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		closed.emit(); get_viewport().set_input_as_handled()
