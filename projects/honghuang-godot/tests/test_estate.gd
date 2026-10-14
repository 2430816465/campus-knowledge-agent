extends SceneTree
var failures: Array[String] = []
var count := 0
func check(condition: bool, message: String) -> void:
	count += 1
	if not condition: failures.append(message); push_error(message)
func _initialize() -> void:
	call_deferred("run")
func underlay_covers_exact_land(estate: EstateView) -> bool:
	var arrays: Array = estate._underlay_mesh.surface_get_arrays(0)
	var vertices: PackedVector2Array = arrays[Mesh.ARRAY_VERTEX]
	var uv: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	var area_by_cell: Dictionary = {}
	var corners := [Vector2(-32,0),Vector2(0,-16),Vector2(32,0),Vector2(0,16)]
	for offset in range(0,indices.size(),3):
		var points := PackedVector2Array()
		for at in range(offset,offset+3):
			var index := indices[at]
			if index<0 or index>=vertices.size(): return false
			var point := vertices[index]
			if uv[index].distance_to(estate._meadow_uv(point))>0.00001: return false
			points.append(point)
		var cell: Vector2i = estate.world_to_tile((points[0]+points[1]+points[2])/3.0)
		if not estate.land_cells.has(cell): return false
		for point in points:
			if not corners.has(point-estate.tile_to_world(cell)): return false
		var area := absf((points[1]-points[0]).cross(points[2]-points[0]))*0.5
		area_by_cell[cell] = float(area_by_cell.get(cell,0.0))+area
	if area_by_cell.size()!=estate.land_cells.size(): return false
	for cell in estate.land_cells:
		if not is_equal_approx(float(area_by_cell.get(cell,0.0)),1024.0): return false
	return true
func run() -> void:
	var scene = load("res://scenes/estate.tscn")
	check(scene != null,"estate scene loads")
	if scene == null: quit(1); return
	var estate = scene.instantiate()
	estate.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	estate.size = Vector2(540,500)
	root.add_child(estate)
	await process_frame
	var s: Dictionary = GameData.all().initialState.duplicate(true)
	s.unlockedRegions = [0,1,2]
	s.buildings.append({"id":"test-farm","type":"farm","plot":"p2","level":2,"readyAt":0,"queue":[],"assigned":null,"progress":0})
	estate.set_state(s)
	await process_frame
	check(estate.terrain is TileMapLayer,"authoritative ground is native TileMapLayer")
	check(estate.plots.size()==24,"24 real plots exist")
	for x in range(-6,15):
		for y in range(-6,15):
			var cell := Vector2i(x,y)
			check(estate.world_to_tile(estate.tile_to_world(cell))==cell,"native tile roundtrip %s"%cell)
	for id in estate.PLOT_CELLS:
		check(estate.plot_at_world(estate.plot_to_world(id))==id,"plot roundtrip "+id)
	for kind in ["hall","spring","farm","alchemy","forge","library","arena","warehouse","mine","relicworkshop"]:
		for level in range(1,5):
			var meta: Dictionary = BuildingView.visual_metadata(kind,level)
			for i in range(4):
				var source := Vector2(meta.foundation.corners[i].x,meta.foundation.corners[i].y)
				check(BuildingView.foundation_project(meta,source).distance_to(BuildingView.FLOOR_CORNERS[i])<0.001,"foundation corner exact %s %d %d"%[kind,level,i])
				check(BuildingView.foundation_unproject(meta,BuildingView.foundation_project(meta,source)).distance_to(source)<0.001,"alpha picking inverse exact %s"%kind)
	var before := JSON.stringify(estate.state)
	check(not estate.preview_move("test-farm","p3"),"normal mode prohibits move")
	estate.set_editing(true)
	check(not estate.preview_move("hall","p3"),"fixed landmark cannot move")
	check(not estate.preview_move("test-farm","p1"),"occupied plot rejected")
	check(not estate.preview_move("test-farm","p9"),"unexpanded plot rejected")
	check(estate.preview_move("test-farm","p3"),"legal preview accepted")
	check(JSON.stringify(estate.state)==before,"preview never mutates supplied economic state")
	check(estate.building_nodes["test-farm"].position == estate.plot_to_world("p2"),"original remains at committed plot during preview")
	estate.set_state(s)
	check(estate._preview_id=="test-farm" and estate._ghost != null,"production heartbeat preserves pending move confirmation")
	estate.cancel_move()
	check(JSON.stringify(estate.state)==before,"cancel leaves source unchanged")
	for dims in [Vector2(360,500),Vector2(540,700),Vector2(1000,500)]:
		estate.size = dims
		estate._resize_view()
		for zoom in [0.55,1.0,2.5]:
			estate.set_zoom(zoom)
			for id in estate.PLOT_CELLS:
				var world: Vector2 = estate.plot_to_world(id)
				check(estate.screen_to_world(estate.world_to_screen(world)).distance_to(world)<0.002,"resize/zoom world roundtrip")
	check(estate.facilities.y_sort_enabled,"independent building scenes use native y sorting")
	check(estate.terrain.get_used_cells().size()>24*9,"terrain connected by native margins and paths")
	var original_underlay: ArrayMesh = estate._underlay_mesh
	check(original_underlay != null and original_underlay.get_surface_count()==1,"opaque native ground uses one retained mesh surface")
	check(original_underlay.surface_get_array_len(0)==estate.land_cells.size()*4 and original_underlay.surface_get_array_index_len(0)==estate.land_cells.size()*6,"cached surface covers every authoritative land diamond")
	check(underlay_covers_exact_land(estate),"mesh triangles cover all and only native land with unchanged UVs")
	estate.set_state(s)
	check(estate._underlay_mesh==original_underlay,"ordinary state refresh reuses the retained ground mesh")
	var original_land: int = estate.terrain.get_used_cells().size()
	s.expandedPlots = ["p9"]
	estate.set_state(s)
	check(estate.terrain.get_used_cells().size()>original_land,"purchasing expansion physically grows native terrain")
	check(estate.is_plot_unlocked("p9"),"purchased expansion is actually buildable")
	check(estate._underlay_mesh!=original_underlay and estate._underlay_cells==estate.land_cells,"expansion rebuilds the cached surface for the changed land set")
	check(underlay_covers_exact_land(estate),"expanded surface has no missing, extra or misprojected land")
	# Drive the actual project commands rather than invented display-only phases.
	var progression: Dictionary = GameStore.decode_save(FileAccess.get_file_as_string("res://tests/fixtures/estate-polish-state.json")).data
	progression.thunderProject = {"id":"thunder-project","stage":"unstarted","direction":null,"completedStages":[],"invested":{}}
	var model := EstateView.project_visual_state(progression.thunderProject)
	check(not model.survey and not model.array,"unstarted project creates no construction")
	check(GameEconomy.command(progression,"beginThunderProject",{},int(progression.lastTime)).ok,"real project begins")
	model = EstateView.project_visual_state(progression.thunderProject)
	check(model.survey and not model.foundation and not model.pool,"survey shows only measured site and stakes")
	check(GameEconomy.command(progression,"submitThunderStage",{"stage":"survey"},int(progression.lastTime)).ok,"real survey advances")
	model = EstateView.project_visual_state(progression.thunderProject)
	check(model.foundation and not model.pool,"prepare shows excavated foundation before component")
	progression.items["thunder-component"] = 1
	check(GameEconomy.command(progression,"submitThunderStage",{"stage":"prepare"},int(progression.lastTime)).ok,"real component advances")
	model = EstateView.project_visual_state(progression.thunderProject)
	check(model.pool and not model.stabilized and not model.array,"stabilize adds pool and conductors")
	check(GameEconomy.command(progression,"submitThunderStage",{"stage":"stabilize"},int(progression.lastTime)).ok,"real boss evidence stabilizes")
	model = EstateView.project_visual_state(progression.thunderProject)
	check(model.stabilized and not model.array,"committed stabilize turns on pool before direction selection")
	check(GameEconomy.command(progression,"chooseThunderDirection",{"direction":"forge"},int(progression.lastTime)).ok,"real forge direction accepted")
	model = EstateView.project_visual_state(progression.thunderProject)
	check(model.array and model.pool and model.forge and not model.teaching,"forge retains permanent pool with furnace and anvil")
	check(GameEconomy.command(progression,"chooseThunderDirection",{"direction":"teaching"},int(progression.lastTime)).ok,"real teaching remodel accepted")
	model = EstateView.project_visual_state(progression.thunderProject)
	check(model.array and model.pool and model.teaching and not model.forge,"teaching retains pool while replacing furnace with scripture stele")
	var upgrade_fixture: Dictionary = GameStore.decode_save(FileAccess.get_file_as_string("res://tests/fixtures/estate-polish-state.json")).data
	check(GameEconomy.command(upgrade_fixture,"upgradeBuilding",{"id":"farm-1"},int(upgrade_fixture.lastTime)).ok,"earned fixture legitimately upgrades farm for native before/after")
	var farm_ready := int(GameEconomy.building(upgrade_fixture,"farm-1").readyAt)
	check(GameEconomy.command(upgrade_fixture,"advance",{},farm_ready+60001).ok,"earned farm completes and produces through real clock advancement")
	check(GameEconomy.get_building_status(upgrade_fixture,"farm-1").production=="producing" and upgrade_fixture.warehouse.sources["farm-1"].resources.herb>1,"completed upgrade really produces stock")
	check(GameStore.decode_save(GameStore.encode_save(upgrade_fixture)).ok,"changed construction evidence remains a valid native save")
	var completed: Array[String] = []
	estate.building_completed.connect(func(id): completed.append(id))
	estate.set_state(s)
	check(completed.is_empty(),"opening completed buildings never emits completion")
	s.buildings[2].readyAt = int(s.lastTime)+30000
	estate.set_state(s)
	check(estate.building_nodes["test-farm"].constructing,"authoritative active construction shows scaffold")
	s.buildings[2].readyAt = 0
	estate.set_state(s)
	check(completed==["test-farm"],"committed completion emits once")
	check(estate.building_nodes["test-farm"].completion_remaining>0.0,"completion has actual temporary gold pulse")
	estate.set_state(s)
	check(completed.size()==1,"repeated repaint does not duplicate completion")
	check(not estate.play_completion("missing"),"manual completion cannot target absent facility")
	check(estate.play_completion("test-farm"),"UI can restore pulse after successful command recreates scene")
	check(completed.size()==1,"restoring visual pulse does not duplicate completion signal")
	check(estate.building_nodes["test-farm"].completion_remaining>0.0,"heartbeat preserves an active completion pulse")
	check(estate.preview_move("test-farm","p3"),"focus-loss case begins with legal move preview")
	var before_focus := JSON.stringify(estate.state)
	estate._pointer_down = true
	estate._panning = true
	estate._dragging = true
	estate._press_building = "test-farm"
	estate.abort_interaction()
	check(not estate._pointer_down and not estate._panning and not estate._dragging and estate._press_building.is_empty(),"focus loss clears held mouse/touch/pan/drag state")
	check(estate._ghost==null and estate._preview_id.is_empty() and estate._drag_id.is_empty(),"focus loss cancels transient preview")
	estate._pointer_event(Vector2.ZERO,false)
	check(JSON.stringify(estate.state)==before_focus and estate._preview_id.is_empty(),"late release after focus loss cannot commit or revive movement")
	var growth: Dictionary=GameEconomy.create_state(1800014400000)
	var scenery: Script=load("res://scripts/estate_progression_landmarks.gd")
	check(scenery.model(growth).is_empty(),"new save has no completed-growth landmarks")
	growth.progression.monument.level=2
	growth.progression.grotto.regions={"mountain":2,"river":1,"stars":3}
	growth.progression.grotto.level=6
	var immutable: String=JSON.stringify(growth)
	estate.editing=false
	estate.construction_mode=false
	estate.expansion_mode=false
	estate.set_state(growth)
	var landmarks: Array=[]
	for child: Node in estate.facilities.get_children():
		if child.get_meta("progression_landmark",false): landmarks.append(child)
	check(landmarks.size()==4,"earned monument and three restored regions become visible")
	check(JSON.stringify(growth)==immutable,"scenery does not modify economics or growth")
	var growth_land: Dictionary=estate.land_cells.duplicate()
	for landmark: Node2D in landmarks:
		check(not estate.cell_plots.has(estate.world_to_tile(landmark.position)),"landmark never occupies a construction footprint")
		check(scenery.at_world(estate,landmark.position+Vector2(0,-42))==str(landmark.get_meta("system_id")),"visible landmark routes to its actual growth page")
		check(landmark.get_meta("growth_level")>0,"visible tier comes from saved completed progress")
	growth.progression.grotto.regions.mountain=4
	growth.progression.grotto.level=8
	estate.set_state(growth)
	check(estate.facilities.get_node("GrowthLandmark_mountain").get_meta("growth_level")==4,"restoring another tier rebuilds visible detail")
	check(estate.land_cells==growth_land,"growth decor never rewrites authoritative tile geometry")
	estate.editing=true
	check(scenery.at_world(estate,landmarks[0].position)=="","layout editing never intercepted by growth landmarks")
	estate.editing=false
	print("ESTATE CHECKS: ",count," failures: ",failures.size())
	for failure in failures: print("FAIL: ",failure)
	estate.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
