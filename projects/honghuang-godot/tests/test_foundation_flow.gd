extends SceneTree
var app: Control
var checks: Array = []
var failed: bool = false
func _initialize() -> void: run.call_deferred()
func check(condition: bool, label: String) -> void:
	checks.append({"check":label,"passed":condition})
	if not condition: failed = true; push_error(label)
func click(control: Control) -> void:
	var position: Vector2 = control.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = position
	Input.parse_input_event(motion)
	var down := InputEventMouseButton.new()
	down.position = position; down.button_index = MOUSE_BUTTON_LEFT; down.pressed = true
	Input.parse_input_event(down)
	await process_frame
	var up := InputEventMouseButton.new()
	up.position = position; up.button_index = MOUSE_BUTTON_LEFT; up.pressed = false
	Input.parse_input_event(up)
	await process_frame
func settle() -> void:
	await create_timer(0.45).timeout
	for i: int in 3: await process_frame
func run() -> void:
	root.size = Vector2i(540,960); root.content_scale_size = root.size
	app = load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true); root.add_child(app)
	app.set_process(false); app.audio.sound_enabled = false; app.toast_label.hide()
	await settle()
	var home: Control = app.foundation_home
	var before: int = app.state().equipment.items.size()
	await click(home.get_node("Design/Forge"))
	await click(home.get_node("Design/Forge"))
	await settle()
	check(app.state().equipment.items.size() == before+1,"rapid double click commits exactly one forge")
	check(is_instance_valid(home.result_view),"real mouse click opens equipment result")
	if not is_instance_valid(home.result_view): finish(); return
	var id: String = home.pending_id
	await click(home.get_node("Design/Forge"))
	check(app.state().equipment.items.size() == before+1,"modal shade blocks underlying forge")
	await click(home.result_view.get_node("Design/Panel/Content/Lock"))
	check(GameEquipment.item(app.state(),id).locked,"lock signal commits through existing transaction")
	check(home.result_view.get_node("Design/Panel/Content/Actions/Salvage").disabled,"locked equipment cannot be salvaged")
	await click(home.result_view.get_node("Design/Panel/Content/Actions/Salvage"))
	check(not GameEquipment.item(app.state(),id).is_empty(),"disabled click has no economic effect")
	await click(home.result_view.get_node("Design/Panel/Content/Lock"))
	await click(home.result_view.get_node("Design/Panel/Content/Actions/Keep"))
	check(not is_instance_valid(home.result_view),"keep closes result")
	check(not GameEquipment.item(app.state(),id).is_empty(),"keep preserves the item")
	app._go(1); await process_frame; app._go(5); await settle()
	home = app.foundation_home
	check(home.pending_id == id,"page re-entry preserves pending comparison id")
	await click(home.get_node("Design/Comparison/Content/ButtonMargins/Actions/Equip"))
	check(id in app.state().equipment.sharedEquipped.values(),"equip updates real shared loadout")
	await click(home.get_node("Design/Forge")); await settle()
	id = home.pending_id
	await click(home.result_view.get_node("Design/Panel/Content/Actions/Salvage"))
	check(GameEquipment.item(app.state(),id).is_empty(),"salvage removes only the selected new item")
	check(not is_instance_valid(home.result_view),"salvage returns to refreshed home")
	# Closing the page during feedback cannot perform a second transaction.
	before = app.state().equipment.items.size()
	await click(home.get_node("Design/Forge")); app._go(3); await settle()
	check(app.state().equipment.items.size() == before+1,"leaving during feedback keeps exactly one committed item")
	check(not is_instance_valid(app.foundation_home),"leaving destroys page-owned animation and modal")
	app._go(5); await settle(); home = app.foundation_home
	check(not home.pending_id.is_empty(),"return restores comparison after interrupted animation")
	for dimensions: Vector2i in [Vector2i(540,1200),Vector2i(540,810),Vector2i(360,640)]:
		root.content_scale_size = dimensions; root.size = dimensions
		root.set_meta(GameSafeArea.TEST_INSETS,Vector4(0,24,0,20))
		root.set_meta("ui_capsule_bottom",56.0)
		home._layout_page(); await settle()
		var safe: Rect2 = GameSafeArea.rect_for(home)
		var design: Rect2 = home.get_node("Design").get_global_rect()
		check(safe.encloses(design),"safe-area encloses reference composition "+str(dimensions))
		check(design.position.y >= 56,"capsule exclusion "+str(dimensions))
	finish()
func finish() -> void:
	var report := {"checks":checks,"passed":not failed,"engine":Engine.get_version_info(),"renderer":DisplayServer.get_name(),"input":"Input.parse_input_event mouse down/up; isolated GameStore"}
	var file := FileAccess.open("res://evidence/ui-foundation/interaction-results.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  ")); file.close()
	app.store.release()
	print("FOUNDATION_FLOW ","FAIL" if failed else "PASS"," checks=",checks.size())
	quit(1 if failed else 0)
