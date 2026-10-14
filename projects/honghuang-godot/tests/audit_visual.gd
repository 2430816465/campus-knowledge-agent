extends SceneTree
## Native graphical audit driver. Never run this as headless visual evidence.
## F12 saves the current native framebuffer after real mouse/keyboard interactions.
var app: Control
var phase := "preaudit"
var captures: Array = []
var interaction_index := 0
var performance_samples: Array = []
var first_screen_ms := 0
var navigation_memory: Array = []
var native_interactions: Array = []
var benchmark_exports: Array = []
var flow_phase := ""
var safe_case_index := -1
var boot_tick := 0
func _initialize() -> void:
	root.window_input.connect(_input)
	boot_tick = Time.get_ticks_msec()
	_run.call_deferred()
func _input(event: InputEvent) -> void:
	if app != null and ((event is InputEventMouseButton and event.pressed) or (event is InputEventKey and event.pressed and not event.echo)):
		var recorded := {"utc":Time.get_datetime_string_from_system(true),"ticks_ms":Time.get_ticks_msec(),"event":event.as_text(),"page_before_dispatch":app.page,"slot":app.store.slot,"state_revision_before_dispatch":app.state().revision}
		if event is InputEventMouseButton: recorded["local_position"]=[event.position.x,event.position.y]
		native_interactions.append(recorded)
		var output:=FileAccess.open("res://docs/audits/%s-native-interactions.json"%phase,FileAccess.WRITE)
		output.store_string(JSON.stringify({"phase":phase,"events":native_interactions,"note":"Events received by native Godot window from desktop interaction; automatic navigation in this driver creates no synthetic input events."},"  "));output.close()
	if event is InputEventKey and event.pressed and not event.echo and event.keycode==KEY_F12:
		interaction_index += 1
		call_deferred("_shot","manual-%02d" % interaction_index)
	if event is InputEventKey and event.pressed and not event.echo and event.keycode==KEY_F11:
		call_deferred("_sample","manual-current-scene",90)
	if event is InputEventKey and event.pressed and not event.echo and event.keycode==KEY_F9 and phase=="round-3":
		call_deferred("_show_isolated_corruption")
	if event is InputEventKey and event.pressed and not event.echo and event.keycode==KEY_F7 and phase=="round-4":
		call_deferred("_cycle_safe_area")
func _shot(name: String) -> void:
	app.toast_time = 0
	app.toast_label.hide()
	for frame in 8: await process_frame
	await RenderingServer.frame_post_draw
	var pixels: Image = root.get_texture().get_image()
	var path := "res://docs/audits/%s-native-%s.png" % [phase,name]
	var result := pixels.save_png(path)
	var state_path := "res://docs/audits/%s-native-state-%s.json" % [phase,name]
	var state_file:=FileAccess.open(state_path,FileAccess.WRITE)
	var saved_state:=GameStore.encode_save(app.state())
	state_file.store_string(saved_state);state_file.close()
	var geometry:Dictionary={}
	for key in ["buildings","expandedPlots","unlockedRegions","integratedCores","thunderProject"]:geometry[key]=app.state().get(key)
	var camera:Dictionary={}
	if is_instance_valid(app.estate):camera={"position":[app.estate.camera.position.x,app.estate.camera.position.y],"zoom":[app.estate.camera.zoom.x,app.estate.camera.zoom.y],"viewport":[app.estate.viewport.size.x,app.estate.viewport.size.y],"control_size":[app.estate.size.x,app.estate.size.y]}
	var battle:Dictionary={}
	if is_instance_valid(app.battle_view):battle={"id":app.last_battle.get("id"),"stageId":app.last_battle.get("stageId"),"context":app.battle_context,"trial":app.last_battle.get("trial"),"result":app.last_battle.get("result"),"actions":app.last_battle.get("actionCount"),"round":app.last_battle.get("round"),"settlement":app.settlement}
	var safe_info:Dictionary={"injection":false}
	if root.has_meta("ui_test_safe_insets"):
		var insets:Vector4=root.get_meta("ui_test_safe_insets")
		safe_info={"injection":true,"logical_insets":[insets.x,insets.y,insets.z,insets.w],"main_frame_rect":_rect_values(app.frame.get_global_rect()),"nav_rect":_rect_values(app.nav.get_global_rect())}
		if is_instance_valid(app.overlay):
			var sheet:Control=app.overlay.get_node_or_null("Sheet")
			if sheet!=null:safe_info["modal_rect"]=_rect_values(sheet.get_global_rect())
		if is_instance_valid(app.battle_view):
			for node in app.battle_view.get_children():
				if node is ScrollContainer:safe_info["battle_scroll_rect"]=_rect_values(node.get_global_rect())
	captures.append({"path":path,"size":[pixels.get_width(),pixels.get_height()],"error":result,"utc":Time.get_datetime_string_from_system(true),"page":app.page,"slot":app.store.slot,"state_revision":app.state().revision,"corruption_protected":app.store.corruption,"state_export_is_placeholder":app.store.corruption,"state_export":state_path,"state_sha256":saved_state.sha256_text(),"geometry_state_sha256":JSON.stringify(geometry,"",true,true).sha256_text(),"camera":camera,"battle":battle,"safe_area":safe_info})
	var file := FileAccess.open("res://docs/audits/%s-native-captures.json" % phase,FileAccess.WRITE)
	file.store_string(JSON.stringify({"phase":phase,"renderer":RenderingServer.get_video_adapter_name(),"captures":captures},"  "));file.close()
	print("AUDIT_NATIVE_CAPTURE ",path," status=",result)
func _rect_values(rect:Rect2)->Array:
	return [rect.position.x,rect.position.y,rect.size.x,rect.size.y]
func _cycle_safe_area()->void:
	safe_case_index=(safe_case_index+1)%3
	var name:String
	if safe_case_index==0:
		root.set_meta("ui_test_safe_insets",Vector4(0,64,0,34));name="notch-and-gesture"
	elif safe_case_index==1:
		root.set_meta("ui_test_safe_insets",Vector4(36,48,24,40));name="side-and-bottom"
	else:
		root.remove_meta("ui_test_safe_insets");name="desktop-restored"
	app._resize_shell()
	await _shot("safe-"+name)
	print("AUDIT_NATIVE_SAFE_AREA ",name," simulated logical insets, not physical phone hardware")
func _memory() -> Dictionary:
	var rss_kib: Variant = null
	if OS.get_name() == "Linux":
		var status:=FileAccess.open("/proc/self/status",FileAccess.READ)
		if status != null:
			while not status.eof_reached():
				var line:=status.get_line()
				if line.begins_with("VmRSS:"):
					for part in line.replace("\t"," ").split(" ",false):
						if part.is_valid_int():rss_kib=int(part)
			status.close()
	return {"static_bytes":OS.get_static_memory_usage(),"static_peak_bytes":OS.get_static_memory_peak_usage(),"rss_kib":rss_kib,"nodes":Performance.get_monitor(Performance.OBJECT_NODE_COUNT),"resources":Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),"render_video_bytes":Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)}
func _performance_report() -> void:
	var path := "res://docs/audits/%s-native-performance.json" % phase
	var file := FileAccess.open(path,FileAccess.WRITE)
	var usable:=DisplayServer.screen_get_usable_rect()
	file.store_string(JSON.stringify({"phase":phase,"utc":Time.get_datetime_string_from_system(true),"renderer":RenderingServer.get_video_adapter_name(),"dummy_audio_driver":OS.get_cmdline_args().has("Dummy"),"viewport":[root.size.x,root.size.y],"desktop_usable_rect":[usable.position.x,usable.position.y,usable.size.x,usable.size.y],"native_client_window_rect":[root.position.x,root.position.y,root.size.x,root.size.y],"first_draw_engine_clock_ms":first_screen_ms,"scene_tree_initialization_engine_clock_ms":boot_tick,"scene_tree_initialize_to_first_draw_ms":first_screen_ms-boot_tick,"measurement_origin":"SceneTree._initialize entry to RenderingServer.frame_post_draw after native main scene addition. Raw engine tick reported separately. Imported resource caches already exist; this is not full OS process startup or cold-cache launch latency.","samples":performance_samples,"repeated_navigation_memory":navigation_memory,"limits":"Native cloud software renderer; frame intervals are measured, not assumed60fps. RSS includes graphics driver/cache. No physical mobile device performance claim or audible sound verification."},"  "))
	file.close()
func _sample(label: String, frames: int=60) -> void:
	# Godot monitor values update more slowly than rendered frames. Warm up after
	# navigation and sample at least 120 actual frames; intervals remain direct.
	await create_timer(1.25).timeout
	frames=maxi(frames,120)
	var intervals: Array = []
	var process_ms: Array = []
	var calls: Array = []
	var memory_before := _memory()
	var begin := Time.get_ticks_usec()
	var previous := begin
	for frame in frames:
		await process_frame
		var tick := Time.get_ticks_usec()
		intervals.append(float(tick-previous)/1000.0)
		previous=tick
		process_ms.append(Performance.get_monitor(Performance.TIME_PROCESS)*1000.0)
		calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	var finish := Time.get_ticks_usec()
	intervals.sort(); process_ms.sort(); calls.sort()
	performance_samples.append({"scene":label,"frames":frames,"warmup_seconds":1.25,"window_ms":float(finish-begin)/1000.0,"observed_frame_rate":float(frames)*1000000.0/float(finish-begin),"frame_interval_ms":{"min":intervals[0],"median":intervals[frames/2],"p95":intervals[mini(frames-1,int(ceil(frames*0.95))-1)],"max":intervals[-1]},"reported_process_monitor_ms":{"median":process_ms[frames/2],"p95":process_ms[mini(frames-1,int(ceil(frames*0.95))-1)]},"process_monitor_note":"Godot Performance.TIME_PROCESS is a periodically refreshed engine monitor, may retain an earlier resource-loading stall, and is not treated as per-frame CPU duration. Direct frame intervals above are the rendered cadence evidence.","draw_calls":{"median":calls[frames/2],"max":calls[-1]},"memory_before":memory_before,"memory_after":_memory()})
	_performance_report()
func _navigation_measurement() -> void:
	var cycles:=30 if phase=="round-4" else 6
	var navigation_started:=Time.get_ticks_msec()
	for cycle in cycles:
		for page in 5:
			app._go(page)
			for frame in 3: await process_frame
		app._start_trial("break")
		for frame in 6: await process_frame
		app._leave_battle()
		app._go(0)
		for frame in 6: await process_frame
		navigation_memory.append({"cycle":cycle+1,"elapsed_ms":Time.get_ticks_msec()-navigation_started,"memory_after_cleanup":_memory()})
	await _sample("estate-after-%d-full-navigation-and-battle-cycles"%cycles,120)
func _paired_benchmarks() -> void:
	if benchmark_exports.is_empty():return
	var ordinary_directory:String=app.store.base_dir
	var ordinary_timer:float=app.production_timer
	# Freeze only periodic economic advancement for the exact-state rendering
	# comparison; restore the ordinary account and timer before human interaction.
	app.production_timer=-100000.0
	app.store.release()
	for entry in benchmark_exports:
		var directory:="user://tests/audit-paired-%s-%s-%d"%[phase,str(entry.name),Time.get_ticks_usec()]
		app.store=GameStore.new(directory)
		var created:Dictionary=app.store.load_slot("normal")
		var loaded:Dictionary=app.store.import_save(str(entry.path)) if created.ok else created
		print("AUDIT_PAIRED_STATE ",entry," ",loaded)
		if loaded.ok:
			app._go(0)
			await _shot("paired-"+str(entry.name))
			await _sample("paired-exact-state-"+str(entry.name),120)
		app.store.release()
	app.store=GameStore.new(ordinary_directory)
	var restored:Dictionary=app.store.load_slot("normal")
	print("AUDIT_RETURN_OWN_ORDINARY ",restored)
	app.production_timer=ordinary_timer
	app._go(0)
func _show_isolated_corruption() -> void:
	if app.store.corruption or is_instance_valid(app.battle_view) or app.store.slot!="normal":return
	var original:Dictionary=app.state().duplicate(true)
	var original_directory:String=app.store.base_dir
	var directory:="user://tests/audit-native-corruption-%d"%Time.get_ticks_usec()
	app.store.release()
	app.store=GameStore.new(directory)
	var created:Dictionary=app.store.load_slot("normal")
	if not created.ok:return
	var source_path:String=directory.path_join("legitimately-earned-source.json")
	var source:=FileAccess.open(source_path,FileAccess.WRITE)
	source.store_string(GameStore.encode_save(original));source.close()
	var imported:Dictionary=app.store.import_save(source_path)
	if not imported.ok:push_error(str(imported));return
	var committed:Dictionary=app.store.transact("settings",{"key":"speed","value":original.settings.speed},int(original.lastTime))
	if not committed.ok:push_error(str(committed));return
	var primary:String=app.store._path
	app.store.release()
	var broken:=FileAccess.open(primary,FileAccess.WRITE)
	broken.store_string("{AUDIT_CORRUPTED_NATIVE_ISOLATED_COPY}");broken.close()
	var loaded:Dictionary=app.store.load_slot("normal")
	app._go(0)
	app._save_load_error(loaded)
	var file:=FileAccess.open("res://docs/audits/%s-native-corruption-fixture.json"%phase,FileAccess.WRITE)
	file.store_string(JSON.stringify({"phase":phase,"source_directory":original_directory,"isolated_copy":directory,"expected_resources":original.resources,"expected_equipment":original.equipment,"load_result":loaded,"note":"Only a new isolated copy is damaged. The original ordinary audit save remains intact. Real restore uses the application's existing confirmation and backup API."},"  "));file.close()
	print("AUDIT_NATIVE_CORRUPTION_READY ",loaded)
func _capture_chapter_battles() -> void:
	if phase!="round-4":return
	var original_directory:String=app.store.base_dir
	var original:Dictionary=app.state().duplicate(true)
	app.store.release()
	var directory:="user://tests/audit-chapter-visual-%d"%Time.get_ticks_usec()
	app.store=GameStore.new(directory)
	var loaded:Dictionary=app.store.load_slot("normal")
	var source_path:String=directory.path_join("earned-ordinary-source.json")
	var source:=FileAccess.open(source_path,FileAccess.WRITE)
	source.store_string(GameStore.encode_save(original));source.close()
	var imported:Dictionary=app.store.import_save(source_path) if loaded.ok else loaded
	if imported.ok:
		for stage in [1,5,9]:
			app._start_main(stage)
			await process_frame
			await _shot("actual-chapter-stage-%d"%stage)
			app._leave_battle()
			var abandoned:Dictionary=app.command("abandonMainBattle",{},false)
			print("AUDIT_CHAPTER_ADMISSION ",stage," abandoned=",abandoned.ok)
			await process_frame
		print("AUDIT_CHAPTER_SOURCE_RESOURCES_PRESERVED ",GameData.normalize(original.resources)==GameData.normalize(app.state().resources))
	app.store.release()
	app.store=GameStore.new(original_directory)
	print("AUDIT_CHAPTER_RETURN_OWN_ORDINARY ",app.store.load_slot("normal"))
	app._go(0)
func _run() -> void:
	if FileAccess.file_exists("res://docs/audits/visual-request.json"):
		var request: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://docs/audits/visual-request.json"))
		if request is Dictionary:
			phase=str(request.get("phase","preaudit"))
			benchmark_exports=request.get("benchmark_exports",[])
			flow_phase=str(request.get("flow_phase",phase))
	root.size = Vector2i(540,960)
	app = load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	await RenderingServer.frame_post_draw
	first_screen_ms=Time.get_ticks_msec()
	await _shot("fresh-estate")
	await _sample("fresh-estate",60)
	var flow_path := "res://docs/audits/%s-flow.json" % (flow_phase if not flow_phase.is_empty() else phase)
	if FileAccess.file_exists(flow_path):
		var report: Variant = JSON.parse_string(FileAccess.get_file_as_string(flow_path))
		var directory: String = report.get("facts",{}).get("durable_expanded",{}).get("save_directory","") if report is Dictionary else ""
		if not directory.is_empty():
			app.store.release()
			app.store = GameStore.new(directory)
			var loaded: Dictionary = app.store.load_slot("normal")
			if loaded.ok: app._render()
			print("AUDIT_VISUAL_REAL_PROGRESSION ",directory," ",loaded)
	app._go(0)
	await _shot("progressed-estate")
	await _sample("all-facilities-ordinary-estate",60)
	app._open_character("nezha")
	await _shot("actual-equipment")
	app._gear_bag()
	await _shot("actual-gear-bag")
	app._close_modal()
	app._go(4)
	await _shot("affairs")
	app._mock_menu()
	await _shot("mock-notice")
	app._close_modal()
	app._go(0)
	await _navigation_measurement()
	await _paired_benchmarks()
	await _capture_chapter_battles()
	print("AUDIT_NATIVE_READY phase=",phase,". Real mouse/keyboard are active. F12 records framebuffer. Close window when finished.")
