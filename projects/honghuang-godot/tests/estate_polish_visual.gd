extends SceneTree
## Same immutable ordinarily-earned state + same native viewport/camera before/after.
var estate: EstateView
func _initialize() -> void: _run.call_deferred()
func _run() -> void:
	root.size = Vector2i(900,900)
	root.content_scale_size = Vector2i(900,900)
	ThemeDB.fallback_font = load("res://assets/fonts/NotoSansSC-Regular.otf")
	var raw := FileAccess.get_file_as_string("res://tests/fixtures/estate-polish-state.json")
	var decoded := GameStore.decode_save(raw)
	if not decoded.ok: push_error("Immutable estate fixture rejected: "+str(decoded)); quit(1); return
	var phase := FileAccess.get_file_as_string("res://tests/fixtures/estate-polish-phase.txt").strip_edges()
	var commands: Array = []
	if phase == "forge":
		var direction := GameEconomy.command(decoded.data,"chooseThunderDirection",{"direction":"forge"},int(decoded.data.lastTime))
		commands.append({"command":"chooseThunderDirection","args":{"direction":"forge"},"result":direction})
		if not direction.ok: push_error(str(direction)); quit(1); return
	if phase.begins_with("construction-"):
		var upgrade := GameEconomy.command(decoded.data,"upgradeBuilding",{"id":"farm-1"},int(decoded.data.lastTime))
		commands.append({"command":"upgradeBuilding","args":{"id":"farm-1"},"result":upgrade.duplicate(true)})
		if not upgrade.ok: push_error(str(upgrade)); quit(1); return
	estate = load("res://scenes/estate.tscn").instantiate()
	root.add_child(estate)
	estate.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	estate.set_state(decoded.data)
	if phase == "construction-after":
		# Let a full post-completion minute produce stock through the actual
		# economy; this proves function as well as permanent upgrade geometry.
		var finish_at := int(GameEconomy.building(decoded.data,"farm-1").readyAt)+60001
		var advance := GameEconomy.command(decoded.data,"advance",{},finish_at)
		commands.append({"command":"advance","at":finish_at,"result":advance.duplicate(true)})
		if not advance.ok: push_error(str(advance)); quit(1); return
		estate.set_state(decoded.data)
	if phase.begins_with("construction-"): estate.select_building("farm-1")
	# Fixed camera sees all 10 actually earned buildings with unchanged locations.
	estate._fit_camera = false
	estate.zoom_factor = 0.64 / estate.fit_zoom
	estate.camera.zoom = Vector2.ONE*0.64
	estate.camera.position = Vector2(-128,236)
	estate.camera.force_update_scroll()
	var diagnostic := GameStore.new("user://estate-native-diagnostic-%s" % OS.get_process_id())
	var loaded := diagnostic.load_slot("normal")
	var owner_probe := FileAccess.open(diagnostic._owner_file,FileAccess.WRITE)
	var owner_open_error := FileAccess.get_open_error()
	var owner_write_error := -1
	if owner_probe != null:
		owner_probe.store_string(JSON.stringify({"diagnosticOnly":true,"pid":OS.get_process_id()}))
		owner_probe.flush()
		owner_write_error = owner_probe.get_error()
		owner_probe.close()
	var diagnostic_result := {"user_data_dir":OS.get_user_data_dir(),"path":diagnostic._path,"owner_file":diagnostic._owner_file,"readonly":diagnostic.readonly,"last_error":diagnostic.last_error,"owner_open_error":owner_open_error,"owner_write_error":owner_write_error,"owner_exists":FileAccess.file_exists(diagnostic._owner_file),"owner_contents":FileAccess.get_file_as_string(diagnostic._owner_file),"absolute_owner_file":ProjectSettings.globalize_path(diagnostic._owner_file),"lock_exists_virtual":DirAccess.dir_exists_absolute(diagnostic._lock_dir),"lock_exists_absolute":DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(diagnostic._lock_dir)),"token_files_virtual":Array(DirAccess.get_files_at(diagnostic._lock_dir)),"token_files_absolute":Array(DirAccess.get_files_at(ProjectSettings.globalize_path(diagnostic._lock_dir))),"loaded":loaded}
	diagnostic.release()
	for frame in 12: await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var output := "res://docs/estate-polish-%s.png" % phase
	var result := image.save_png(output)
	var report := {"phase":phase,"fixture_sha256":raw.sha256_text(),"payload_checksum":JSON.parse_string(raw).checksum,"viewport":[900,900],"camera_position":[-128,236],"camera_zoom":0.64,"buildings":decoded.data.buildings,"project":decoded.data.thunderProject,"image":output,"capture_status":result,"renderer":RenderingServer.get_video_adapter_name(),"store_diagnostic":diagnostic_result,"commands":commands,"farm_status":GameEconomy.get_building_status(decoded.data,"farm-1",int(decoded.data.lastTime)),"farm_stock":decoded.data.warehouse.sources.get("farm-1",{}),"completion_remaining":estate.building_nodes["farm-1"].completion_remaining}
	var f := FileAccess.open("res://docs/estate-polish-%s.json"%phase,FileAccess.WRITE)
	f.store_string(JSON.stringify(report,"  "));f.close()
	if not commands.is_empty():
		var save_file := FileAccess.open("res://docs/estate-polish-%s.save.json" % phase,FileAccess.WRITE)
		save_file.store_string(GameStore.encode_save(decoded.data)); save_file.close()
	print("ESTATE_POLISH_NATIVE ",JSON.stringify(report))
