extends SceneTree
## Real native GUI signal handlers with simulated touch/mouse events.
## This is not physical touchscreen verification; real CUA is recorded separately.
var checks := 0
var failures: Array = []
var phase := "preaudit"
var estate: EstateView
var previews: Array = []
var store: GameStore
func check(value: bool,label: String) -> void:
	checks+=1
	if not value: failures.append(label);push_error("INPUT AUDIT: "+label)
func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="): phase=arg.trim_prefix("--audit-phase=")
	_run.call_deferred()
func touch(point: Vector2,down: bool) -> void:
	var event := InputEventScreenTouch.new()
	event.position=point;event.pressed=down;event.index=0
	estate.gui_input.emit(event)
func drag_touch(point: Vector2,relative: Vector2) -> void:
	var event := InputEventScreenDrag.new()
	event.position=point;event.relative=relative;event.index=0
	estate.gui_input.emit(event)
func mouse(point: Vector2,down: bool,button: int=MOUSE_BUTTON_LEFT) -> void:
	var event := InputEventMouseButton.new()
	event.position=point;event.pressed=down;event.button_index=button
	estate.gui_input.emit(event)
func drag_mouse(point: Vector2,relative: Vector2) -> void:
	var event := InputEventMouseMotion.new()
	event.position=point;event.relative=relative;event.button_mask=MOUSE_BUTTON_MASK_LEFT
	estate.gui_input.emit(event)
func _find_hit(id: String) -> Vector2:
	var origin: Vector2 = estate.building_nodes[id].position
	for y in range(-120,5,5):
		for x in range(-60,65,5):
			var point := origin+Vector2(x,y)
			if estate.building_at_world(point)==id: return estate.world_to_screen(point)
	return Vector2(-10000,-10000)
func _run() -> void:
	var report: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://docs/audits/%s-flow.json"%phase))
	check(report is Dictionary,"own round real ordinary fixture exists")
	if not report is Dictionary: _finish();return
	var path: String=report.facts.all_content_ordinary.exported_path
	var directory := "user://tests/audit-input-%s-%d"%[phase,Time.get_ticks_usec()]
	store=GameStore.new(directory)
	check(store.load_slot("normal").ok and store.import_save(path).ok,"isolated copy of genuinely earned full ordinary estate")
	estate=load("res://scenes/estate.tscn").instantiate()
	estate.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	estate.size=Vector2(540,700)
	root.add_child(estate)
	await process_frame
	estate.set_state(store.state)
	estate.move_previewed.connect(func(id,plot):previews.append({"id":id,"plot":plot}))
	estate.set_editing(true)
	var id: String=""
	for building in store.state.buildings:
		if building.type=="farm": id=building.id
	check(not id.is_empty(),"ordinary real farm located")
	var before := JSON.stringify(store.state)
	var origin:=_find_hit(id)
	check(origin.x > -1000,"alpha-aware actual building hit resolved")
	var destination:=estate.world_to_screen(estate.plot_to_world("p11"))
	touch(origin,true)
	drag_touch(destination,destination-origin)
	touch(destination,false)
	check(previews.size()==1 and previews[-1].id==id and previews[-1].plot=="p11","simulated touch drag opens exact legal placement preview")
	check(JSON.stringify(store.state)==before and estate._ghost!=null,"touch preview changes no authoritative economic state")
	var escape:=InputEventKey.new();escape.pressed=true;escape.keycode=KEY_ESCAPE
	estate.gui_input.emit(escape)
	check(estate._preview_id.is_empty() and estate._ghost==null and JSON.stringify(store.state)==before,"Escape cancels native touch preview with zero persisted changes")
	origin=_find_hit(id)
	mouse(origin,true);drag_mouse(destination,destination-origin);mouse(destination,false)
	check(previews.size()==2 and previews[-1].plot=="p11","mouse drag reaches same native placement preview")
	var committed:=store.transact("moveBuilding",{"id":id,"plot":"p11"},int(store.state.lastTime))
	check(committed.ok,"real move confirmation crosses atomic store transaction")
	estate.cancel_move(false);estate.set_state(store.state)
	store.release();store=GameStore.new(directory)
	check(store.load_slot("normal").ok and GameEconomy.building(store.state,id).plot=="p11","mouse-confirmed farm placement survives native reload")
	var anchor:=Vector2(270,350)
	var world_anchor:=estate.screen_to_world(anchor)
	var magnify:=InputEventMagnifyGesture.new();magnify.position=anchor;magnify.factor=1.2
	estate.gui_input.emit(magnify)
	check(estate.screen_to_world(anchor).distance_to(world_anchor)<0.01,"simulated magnify keeps touched world position anchored")
	world_anchor=estate.screen_to_world(anchor)
	mouse(anchor,true,MOUSE_BUTTON_WHEEL_DOWN)
	check(estate.screen_to_world(anchor).distance_to(world_anchor)<0.01,"native wheel zoom keeps cursor world position anchored")
	estate.set_editing(false)
	var camera_before:Vector2=estate.camera.position
	touch(Vector2(4,4),true);drag_touch(Vector2(48,28),Vector2(44,24));touch(Vector2(48,28),false)
	check(estate.camera.position!=camera_before,"simulated touch inspection pans actual native camera")
	for dimensions in [Vector2(360,500),Vector2(540,700),Vector2(900,640)]:
		estate.size=dimensions;estate._resize_view()
		await process_frame
		for plot in estate.PLOT_CELLS:
			var world:=estate.plot_to_world(plot)
			check(estate.screen_to_world(estate.world_to_screen(world)).distance_to(world)<0.002,"input transform survives live resize "+plot)
	_finish()
func _finish() -> void:
	if store:store.release()
	var output:=FileAccess.open("res://docs/audits/%s-input.json"%phase,FileAccess.WRITE)
	output.store_string(JSON.stringify({"phase":phase,"utc":Time.get_datetime_string_from_system(true),"checks":checks,"failures":failures,"previews":previews,"scope":"Native GUI handlers driven by actual InputEventScreenTouch/Drag, mouse, magnify, and key event objects; physical touch hardware unverified."},"  "));output.close()
	if estate:estate.queue_free()
	print("NATIVE INPUT ",checks," checks / ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
