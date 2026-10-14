class_name EstateView
extends Control
## The map itself is the native TileMapLayer. No background-image coordinate
## anchors exist. Terrain, foundation meshes, picking, water influence and edit
## previews all use map_to_local/local_to_map from this one layer.
signal building_selected(id: String)
signal plot_selected(id: String)
signal move_previewed(id: String, plotid: String)
signal move_cancelled
signal building_completed(id: String)
signal state_changed
signal progression_selected(system_id: String)

const BuildingScene = preload("res://scenes/building.tscn")
const TILE_SIZE := Vector2i(64,32)
const MEADOW_DIFFUSE := "res://assets/terrain/meadow-diffuse.png"
const STONE_DIFFUSE := "res://assets/terrain/stone-diffuse.png"
const DIFFUSE_REPEAT_CELLS := 8.0
const PLOT_CELLS := {
 "p0": Vector2i(0,0), "p1": Vector2i(0,6), "p2": Vector2i(6,0),
 "p3": Vector2i(6,6), "p4": Vector2i(0,12), "p5": Vector2i(6,12),
 "p6": Vector2i(12,12), "p7": Vector2i(12,0), "p8": Vector2i(12,6),
 "p9": Vector2i(-6,0), "p10": Vector2i(-6,6), "p11": Vector2i(0,-6),
 "p12": Vector2i(0,18), "p13": Vector2i(6,18), "p14": Vector2i(12,18),
 "p15": Vector2i(-6,12), "p16": Vector2i(-6,18), "p17": Vector2i(18,18),
 "p18": Vector2i(18,0), "p19": Vector2i(18,6), "p20": Vector2i(18,12),
 "p21": Vector2i(12,-6), "p22": Vector2i(6,-6), "p23": Vector2i(18,-6)
}
const REGION_NAMES := ["灵泉庭院", "丹器别院", "演法台地"]
const CORE_VIEW := Rect2(-390,-155,845,640)
const COURTYARD_ZOOM := 1.34
var state: Dictionary = {}
var plots: Array = []
var editing := false
var construction_mode := false
var expansion_mode := false
var highlighted_plot := ""
var selected_id := ""
var viewport: SubViewport
var viewport_container: SubViewportContainer
var world: Node2D
var terrain: TileMapLayer
var ground: NativeTerrainDetails
var gardens: NativeGardenDetails
var markers: NativePlotMarkers
var facilities: Node2D
var camera: Camera2D
var building_nodes: Dictionary = {}
var land_cells: Dictionary = {}
var cell_plots: Dictionary = {}
var fit_zoom := 1.0
var zoom_factor := COURTYARD_ZOOM
var _fit_camera := true
var _active_region := 0
var _show_all_regions := false
var _view_bounds := CORE_VIEW
var _press_position := Vector2.ZERO
var _press_world := Vector2.ZERO
var _press_building := ""
var _dragging := false
var _pointer_down := false
var _panning := false
var _drag_id := ""
var _preview_id := ""
var _preview_plot := ""
var _ghost: BuildingView
var _background: TextureRect
var _hint: Label
var _completion_pulses: Dictionary = {}
var _meadow_texture: Texture2D
var _stone_texture: Texture2D
var _underlay_mesh: ArrayMesh
var _underlay_cells: Dictionary = {}
var _garden_cells: Dictionary = {}
var _build_preview_type := ""
var _build_preview_plot := ""
const GARDEN_PROPS := ["jade-blossom", "vermilion-lantern", "scholar-rock", "azalea"]

class NativeTerrainDetails extends Node2D:
	var estate: EstateView
	func _draw() -> void:
		if estate != null: estate.draw_native_terrain(self)

class NativeGardenDetails extends Node2D:
	var estate: EstateView
	func _draw() -> void:
		if estate != null: estate.draw_native_gardens(self)

class NativePlotMarkers extends Node2D:
	var estate: EstateView
	func _draw() -> void:
		if estate != null: estate.draw_plot_markers(self)

func _ready() -> void:
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	custom_minimum_size.y = maxf(custom_minimum_size.y,100)
	_build_world()
	resized.connect(_resize_view)
	gui_input.connect(_on_gui_input)
	if state.is_empty(): state = GameData.all().initialState.duplicate(true)
	_refresh()
	_resize_view()

func _build_world() -> void:
	_background = TextureRect.new()
	_background.texture = load("res://assets/estate-v05/cloud-sea.png")
	_background.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_background.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_background.modulate = Color.WHITE
	add_child(_background)
	viewport_container = SubViewportContainer.new()
	viewport_container.name = "NativeWorldViewport"
	viewport_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	viewport_container.stretch = false
	viewport_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(viewport_container)
	viewport = SubViewport.new()
	viewport.name = "EstateWorld"
	viewport.transparent_bg = true
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.gui_disable_input = true
	viewport_container.add_child(viewport)
	world = Node2D.new()
	world.name = "NativeIsometricEstate"
	viewport.add_child(world)
	ground = NativeTerrainDetails.new()
	ground.name = "CliffsGardensAndWater"
	ground.estate = self
	ground.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	world.add_child(ground)
	terrain = TileMapLayer.new()
	terrain.name = "AuthoritativeTerrainCells"
	terrain.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	terrain.tile_set = _create_tile_set()
	_configure_ground_diffuse()
	world.add_child(terrain)
	gardens = NativeGardenDetails.new()
	gardens.name = "NativeGardenDetails"
	gardens.estate = self
	world.add_child(gardens)
	markers = NativePlotMarkers.new()
	markers.name = "LogicalPlotMarkers"
	markers.estate = self
	world.add_child(markers)
	facilities = Node2D.new()
	facilities.name = "YSortedIndependentFacilities"
	facilities.y_sort_enabled = true
	world.add_child(facilities)
	camera = Camera2D.new()
	camera.name = "EstateCamera"
	camera.position = CORE_VIEW.get_center()
	camera.position_smoothing_enabled = false
	world.add_child(camera)
	camera.make_current()
	_hint = Label.new()
	_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hint.add_theme_font_size_override("font_size",12)
	_hint.add_theme_color_override("font_color",Color("fffae5"))
	_hint.add_theme_constant_override("outline_size",4)
	_hint.add_theme_color_override("font_outline_color",Color("315a58"))
	_hint.position = Vector2(12,8)
	_hint.text = "拖动空地巡视  ·  滚轮 / 双指缩放  ·  点选设施"
	add_child(_hint)

func _create_tile_set() -> TileSet:
	var ts := TileSet.new()
	ts.tile_shape = TileSet.TILE_SHAPE_ISOMETRIC
	ts.tile_layout = TileSet.TILE_LAYOUT_DIAMOND_DOWN
	ts.tile_size = TILE_SIZE
	var atlas := TileSetAtlasSource.new()
	atlas.texture = load("res://assets/terrain/estate_tiles.svg")
	atlas.texture_region_size = Vector2i(64,64)
	for i in range(5):
		atlas.create_tile(Vector2i(i,0))
	ts.add_source(atlas,0)
	return ts

func _configure_ground_diffuse() -> void:
	if not ResourceLoader.exists(MEADOW_DIFFUSE): return
	_meadow_texture = load(MEADOW_DIFFUSE)
	_stone_texture = load(STONE_DIFFUSE) if ResourceLoader.exists(STONE_DIFFUSE) else _meadow_texture
	# The generated images contain top-down diffuse surface only. Godot applies
	# them to the real cells using one shared lattice-space UV field, so they
	# cannot change a footprint, invent a platform or slide under moved scenery.
	var shader := Shader.new()
	shader.code = """shader_type canvas_item;
	uniform sampler2D meadow_texture : source_color, repeat_enable, filter_linear_mipmap;
	uniform sampler2D stone_texture : source_color, repeat_enable, filter_linear_mipmap;
	uniform float repeat_cells = 8.0;
	uniform bool has_stone_texture = false;
	varying vec2 world_position;
	void vertex() { world_position = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy; }
	void fragment() {
		vec4 native_pixel = texture(TEXTURE, UV);
		vec2 lattice = vec2(world_position.y / 32.0 + world_position.x / 64.0,
			world_position.y / 32.0 - world_position.x / 64.0);
		vec2 surface_uv = lattice / repeat_cells;
		vec3 meadow = texture(meadow_texture, surface_uv).rgb * vec3(0.96, 1.09, 0.94);
		int kind = int(floor(UV.x * 5.0));
		vec3 surface = meadow;
		if (kind == 1) { surface = mix(meadow, vec3(0.61, 0.66, 0.54), 0.28); }
		if (kind == 2) { surface = mix(meadow, vec3(0.39, 0.67, 0.57), 0.32); }
		if (kind == 4) { surface = has_stone_texture ? texture(stone_texture, lattice / 3.0).rgb : native_pixel.rgb; }
		COLOR = vec4(surface, native_pixel.a);
	}
	"""
	var material := ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("meadow_texture",_meadow_texture)
	material.set_shader_parameter("stone_texture",_stone_texture)
	material.set_shader_parameter("repeat_cells",DIFFUSE_REPEAT_CELLS)
	material.set_shader_parameter("has_stone_texture",ResourceLoader.exists(STONE_DIFFUSE))
	terrain.material = material

func _meadow_uv(point: Vector2) -> Vector2:
	return Vector2(point.y/32.0+point.x/64.0,point.y/32.0-point.x/64.0)/DIFFUSE_REPEAT_CELLS

func configure(value: Dictionary) -> void:
	set_state(value)

func set_state(value: Dictionary) -> void:
	# Production heartbeat updates must not erase an in-progress drag or the
	# user's pending confirmation. Only a committed placement change does so.
	var active_id := _preview_id if not _preview_id.is_empty() else _drag_id
	var old_building := GameData.named(state.get("buildings",[]),active_id)
	# A committed readyAt transition is the only completion trigger. Loading a
	# ready save, repainting the map, or opening a trial is deliberately silent.
	var completed: Array[String] = []
	if not state.is_empty() and state.get("createdAt") == value.get("createdAt") and state.get("demo") == value.get("demo"):
		for before in state.get("buildings",[]):
			var after := GameData.named(value.get("buildings",[]),str(before.get("id","")))
			if int(before.get("readyAt",0)) > 0 and not after.is_empty() and int(after.get("readyAt",0)) == 0:
				var id := str(after.id)
				_completion_pulses[id] = 1.8
				completed.append(id)
	state = value.duplicate(true)
	if is_node_ready():
		if not active_id.is_empty():
			var updated := GameData.named(state.get("buildings",[]),active_id)
			if updated.is_empty() or updated.get("plot") != old_building.get("plot") or (updated.get("pendingPlacement",false) and not old_building.get("pendingPlacement",false)):
				cancel_move(false)
			elif not _preview_plot.is_empty() and not can_preview_move(active_id,_preview_plot):
				cancel_move(false)
		_refresh()
		for id in completed: building_completed.emit(id)
		if _ghost != null and not active_id.is_empty():
			_ghost.configure(GameData.named(state.get("buildings",[]),active_id),state,false)
		if not _build_preview_plot.is_empty():
			if not GameEconomy.check_plot(state,_build_preview_plot,_build_preview_type).is_empty(): cancel_move()
		state_changed.emit()

func _get_plots() -> Array:
	var result: Array = GameEconomy.get_all_plots().duplicate(true)
	for i in range(9,24):
		var id := "p%d" % i
		if GameData.named(result,id).is_empty():
			result.append({"id":id,"region":0 if i<=11 else (1 if i<=17 else 2),"nourished":i in [10,13,19],"expansion":true})
	return result

func _refresh() -> void:
	plots = _get_plots()
	_build_terrain()
	var retained: Dictionary = {}
	for data in state.get("buildings",[]):
		if data.get("pendingPlacement",false): continue
		var plot_id: String = str(data.get("plot",""))
		if not PLOT_CELLS.has(plot_id): continue
		var instance: BuildingView = building_nodes.get(str(data.id))
		if instance == null:
			instance = BuildingScene.instantiate()
			instance.name = "Facility_" + str(data.id)
			facilities.add_child(instance)
		instance.configure(data,state,bool(plot_info(plot_id).get("nourished",false)))
		instance.position = plot_to_world(plot_id)
		instance.set_selected(str(data.id) == selected_id)
		instance.completion_remaining = float(_completion_pulses.get(str(data.id),0.0))
		retained[str(data.id)] = instance
	for id in building_nodes:
		if not retained.has(id): building_nodes[id].queue_free()
	building_nodes = retained
	_refresh_garden_props()
	load("res://scripts/estate_progression_landmarks.gd").refresh(self)
	select_building(selected_id)
	ground.queue_redraw()
	gardens.queue_redraw()
	markers.queue_redraw()
	if _fit_camera:
		_view_bounds = _calculate_view_bounds()
		_resize_view()

func _build_terrain() -> void:
	terrain.clear()
	land_cells.clear()
	cell_plots.clear()
	# Every footprint remains 3 x 3 cells. Five-cell garden modules are linked
	# by narrower native paths. Locked courtyards do not exist as empty slabs.
	for plot in plots:
		var id: String = str(plot.id)
		if not PLOT_CELLS.has(id): continue
		var center: Vector2i = PLOT_CELLS[id]
		for x in range(-2,3):
			for y in range(-2,3):
				var cell := center + Vector2i(x,y)
				if is_plot_unlocked(id) and not (absi(x)==2 and absi(y)==2):
					land_cells[cell] = true
				if absi(x)<=1 and absi(y)<=1: cell_plots[cell] = id
	for plot in plots:
		var id: String = str(plot.id)
		if not is_plot_unlocked(id): continue
		var center: Vector2i = PLOT_CELLS[id]
		for direction in [Vector2i(6,0),Vector2i(0,6)]:
			var neighbor: Vector2i = center+direction
			var linked := false
			for candidate in plots:
				if PLOT_CELLS[str(candidate.id)]==neighbor and is_plot_unlocked(str(candidate.id)): linked=true; break
			if not linked: continue
			for step in range(2,5):
				for width in range(-1,2):
					var along := Vector2i(step,width) if direction.x!=0 else Vector2i(width,step)
					land_cells[center+along] = true
	for cell in land_cells:
		var tile := 0
		if cell_plots.has(cell):
			var id: String = cell_plots[cell]
			var info := plot_info(id)
			tile = 2 if bool(info.get("nourished",false)) and is_plot_unlocked(id) else 0
			for b in state.get("buildings",[]):
				if str(b.get("plot","")) == id: tile = 1 if not bool(info.get("nourished",false)) else 2
		elif is_path_cell(cell):
			# Real walkways run between plot modules, on the same grid.
			tile = 4
		terrain.set_cell(cell,0,Vector2i(tile,0))
	_cache_underlay_mesh()

func _cache_underlay_mesh() -> void:
	# The underlay is opaque and all cells share one texture/UV field. Submit
	# its unchanged native diamonds as one surface rather than one draw each.
	# Economy ticks and occupied-plot changes do not alter this topology.
	if _underlay_mesh != null and _underlay_cells == land_cells: return
	var vertices := PackedVector2Array()
	var uv := PackedVector2Array()
	var colors := PackedColorArray()
	var indices := PackedInt32Array()
	for cell in land_cells:
		var c := tile_to_world(cell)
		var first := vertices.size()
		for offset in [Vector2(-32,0),Vector2(0,-16),Vector2(32,0),Vector2(0,16)]:
			var point: Vector2 = c+offset
			vertices.append(point)
			uv.append(_meadow_uv(point))
			colors.append(Color.WHITE)
		for index in [0,1,2,0,2,3]: indices.append(first+index)
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	# Retain the resource for deferred canvas rendering. Rebuild only when the
	# actual cell set changes, including expansion, load and profile switching.
	_underlay_mesh = ArrayMesh.new()
	if not vertices.is_empty(): _underlay_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	_underlay_cells = land_cells.duplicate()

func plot_info(id: String) -> Dictionary:
	return GameData.named(plots,id)

func is_plot_unlocked(id: String) -> bool:
	var info := plot_info(id)
	if info.is_empty(): return false
	if not state.get("unlockedRegions",[0]).has(int(info.get("region",0))): return false
	if int(id.trim_prefix("p")) >= 9: return state.get("expandedPlots",[]).has(id)
	return true

func plot_to_world(id: String) -> Vector2:
	if not PLOT_CELLS.has(id) or terrain == null: return Vector2.ZERO
	return terrain.map_to_local(PLOT_CELLS[id])

func tile_to_world(cell: Vector2i) -> Vector2:
	return terrain.map_to_local(cell)

func world_to_tile(point: Vector2) -> Vector2i:
	return terrain.local_to_map(point)

func world_to_screen(point: Vector2) -> Vector2:
	camera.force_update_scroll()
	return viewport.get_canvas_transform() * point

func screen_to_world(point: Vector2) -> Vector2:
	camera.force_update_scroll()
	return viewport.get_canvas_transform().affine_inverse() * point

func plot_at_world(point: Vector2) -> String:
	return str(cell_plots.get(world_to_tile(point),""))

func building_at_world(point: Vector2) -> String:
	# Alpha-aware roof/facade picking in reverse native draw order. Transparent
	# texture rectangles never capture a neighbor or a vacant plot.
	var visible_nodes: Array = building_nodes.values()
	visible_nodes.sort_custom(func(a,b): return a.position.y>b.position.y)
	for node in visible_nodes:
		if node.modulate.a >= 0.5 and node.contains_visible_point(point): return str(node.building.id)
	var id := plot_at_world(point)
	if id.is_empty(): return ""
	for data in state.get("buildings",[]):
		if not data.get("pendingPlacement",false) and str(data.get("plot","")) == id: return str(data.id)
	return ""

func play_completion(id: String) -> bool:
	# The UI may recreate this scene after a successful acceleration command.
	# It supplies only IDs whose authoritative construction just completed.
	var data := GameData.named(state.get("buildings",[]),id)
	if data.is_empty() or int(data.get("readyAt",0))>0 or data.get("pendingPlacement",false): return false
	_completion_pulses[id] = 1.8
	var node: BuildingView = building_nodes.get(id)
	if node != null: node.completion_remaining = 1.8
	return true

func select_building(id: String) -> void:
	selected_id = id
	var selected_node: BuildingView = building_nodes.get(id)
	for key in building_nodes:
		var node: BuildingView = building_nodes[key]
		node.set_selected(key == id)
		node.modulate = Color.WHITE
		if selected_node != null and node != selected_node:
			var delta := node.position-selected_node.position
			if delta.y > 0 and delta.y < 180 and absf(delta.x) < 135:
				node.modulate.a = 0.35
	markers.queue_redraw()
	gardens.queue_redraw()

func set_editing(value: bool) -> void:
	editing = value
	if not editing: cancel_move(false)
	if _hint != null:
		_hint.text = "布局模式 · 拖动建筑到空地 · 确认后搬迁" if editing else "拖动空地巡视  ·  滚轮 / 双指缩放  ·  点选设施"
	if markers != null: markers.queue_redraw()

func set_construction_mode(value: bool, expanding := false) -> void:
	construction_mode = value
	expansion_mode = expanding
	if _hint != null:
		if value: _hint.text = "建造模式 · 选择建筑后点选绿色地块 · 确认开工"
		elif expanding: _hint.text = "扩地模式 · 金色边框为可开拓地块 · 选择后查看成本"
	if markers != null: markers.queue_redraw()

func highlight_plot(id: String) -> void:
	highlighted_plot = id
	if markers != null: markers.queue_redraw()

func preview_build(kind: String, destination: String) -> bool:
	if not construction_mode or not GameEconomy.check_plot(state,destination,kind).is_empty(): return false
	cancel_move(false)
	_build_preview_type = kind
	_build_preview_plot = destination
	_ghost = BuildingScene.instantiate()
	_ghost.name = "UncommittedConstructionPreview"
	_ghost.ghost = true
	_ghost.configure({"id":"building-preview","type":kind,"plot":destination,"level":1,"readyAt":0,"queue":[],"assigned":null,"progress":0.0},state,bool(plot_info(destination).get("nourished",false)))
	_ghost.position = plot_to_world(destination)
	facilities.add_child(_ghost)
	highlight_plot(destination)
	return true

func _resize_view() -> void:
	if viewport == null or size.x < 1 or size.y < 1: return
	viewport.size = Vector2i(maxi(1,int(size.x)),maxi(1,int(size.y)))
	fit_zoom = minf(size.x / _view_bounds.size.x, size.y / _view_bounds.size.y)
	camera.zoom = Vector2.ONE * clampf(fit_zoom*zoom_factor,0.25,2.4)
	if _fit_camera: camera.position = _camera_focus()
	camera.force_update_scroll()

func _camera_focus() -> Vector2:
	var center := _view_bounds.get_center()
	if _show_all_regions: return center
	var occupied := Vector2.ZERO
	var count := 0
	for building: Dictionary in state.get("buildings",[]):
		var id := str(building.get("plot",""))
		if not PLOT_CELLS.has(id) or not is_plot_unlocked(id): continue
		if int(plot_info(id).get("region",0))!=_active_region: continue
		occupied+=plot_to_world(id)+Vector2(0,-55)
		count+=1
	return center.lerp(occupied/count,0.2) if count>0 else center

func set_zoom(value: float) -> void:
	zoom_factor = clampf(value,0.55,3.5)
	_resize_view()

func zoom_by(multiplier: float) -> void:
	set_zoom(zoom_factor*multiplier)

func reset_camera() -> void:
	_fit_camera = true
	_show_all_regions = true
	_view_bounds = _calculate_view_bounds()
	zoom_factor = 1.0
	_resize_view()

func focus_region(index: int) -> void:
	_active_region = index
	_show_all_regions = false
	_fit_camera = true
	zoom_factor = COURTYARD_ZOOM
	_view_bounds = _calculate_view_bounds()
	_resize_view()

func _calculate_view_bounds() -> Rect2:
	var points: Array[Vector2] = []
	for plot in plots:
		if not is_plot_unlocked(str(plot.id)): continue
		if not _show_all_regions and int(plot.region)!=_active_region: continue
		var at := plot_to_world(str(plot.id))
		# Enough headroom for roofs; terrain margin and cliff must remain visible.
		points.append(at+Vector2(-172,-190))
		points.append(at+Vector2(172,118))
	if _show_all_regions:
		for landmark: Dictionary in EstateProgressionLandmarks.model(state):
			var at: Vector2=tile_to_world(landmark.cell)
			points.append(at+Vector2(-80,-120))
			points.append(at+Vector2(80,38))
	if points.is_empty(): return CORE_VIEW
	var bounds := Rect2(points[0],Vector2.ZERO)
	for point in points: bounds=bounds.expand(point)
	return bounds.grow(20)

func focus_plot(id: String) -> void:
	if not PLOT_CELLS.has(id): return
	_fit_camera = false
	camera.position = plot_to_world(id) + Vector2(0,-45)
	camera.force_update_scroll()

func can_preview_move(id: String, destination: String) -> bool:
	if not editing or destination.is_empty() or not is_plot_unlocked(destination): return false
	var data := GameData.named(state.get("buildings",[]),id)
	if data.is_empty() or str(data.get("type","")) in ["hall","spring"]: return false
	var info := plot_info(destination)
	if info.has("fixed"): return false
	for other in state.get("buildings",[]):
		if str(other.id)!=id and str(other.get("plot",""))==destination and not other.get("pendingPlacement",false): return false
	return true

func preview_move(id: String, destination: String) -> bool:
	if not can_preview_move(id,destination): return false
	_preview_id = id
	_preview_plot = destination
	_show_ghost(id,destination,true)
	move_previewed.emit(id,destination)
	return true

func cancel_move(emit_signal := true) -> void:
	_drag_id = ""
	_preview_id = ""
	_preview_plot = ""
	_build_preview_type = ""
	_build_preview_plot = ""
	_dragging = false
	if _ghost != null:
		_ghost.queue_free()
		_ghost = null
	if markers != null: markers.queue_redraw()
	if emit_signal: move_cancelled.emit()

func abort_interaction() -> void:
	# A focus change may eat the mouse/touch release event. Drop the entire
	# transient gesture so a later release cannot commit or select stale input.
	_pointer_down = false
	_panning = false
	_press_position = Vector2.ZERO
	_press_world = Vector2.ZERO
	_press_building = ""
	cancel_move()
	release_focus()

func _show_ghost(id: String, destination: String, valid: bool) -> void:
	if _ghost == null:
		_ghost = BuildingScene.instantiate()
		_ghost.ghost = true
		_ghost.configure(GameData.named(state.get("buildings",[]),id),state,false)
		facilities.add_child(_ghost)
	_ghost.valid_placement = valid
	_ghost.modulate = Color(0.65,1.0,0.8,0.65) if valid else Color(1.0,0.45,0.3,0.6)
	if PLOT_CELLS.has(destination): _ghost.position = plot_to_world(destination)
	markers.queue_redraw()

func _on_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			_zoom_at(event.position,1.13)
			accept_event()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			_zoom_at(event.position,1.0/1.13)
			accept_event()
		elif event.button_index == MOUSE_BUTTON_LEFT:
			_pointer_event(event.position,event.pressed)
			accept_event()
		elif event.button_index == MOUSE_BUTTON_RIGHT and event.pressed:
			cancel_move()
			accept_event()
	elif event is InputEventMouseMotion and _pointer_down:
		_pointer_motion(event.position,event.relative)
		accept_event()
	elif event is InputEventScreenTouch:
		_pointer_event(event.position,event.pressed)
		accept_event()
	elif event is InputEventScreenDrag and _pointer_down:
		_pointer_motion(event.position,event.relative)
		accept_event()
	elif event is InputEventMagnifyGesture:
		_zoom_at(event.position,event.factor)
		accept_event()
	elif event is InputEventKey and event.pressed and event.keycode==KEY_ESCAPE:
		cancel_move()
		accept_event()

func _pointer_event(point: Vector2, pressed: bool) -> void:
	if pressed:
		grab_focus()
		_pointer_down = true
		_press_position = point
		_press_world = screen_to_world(point)
		_press_building = building_at_world(_press_world)
		_dragging = false
		_panning = false
		return
	if not _pointer_down: return
	_pointer_down = false
	if _dragging and not _drag_id.is_empty():
		var plot := plot_at_world(screen_to_world(point))
		var id := _drag_id
		_drag_id = ""
		if not preview_move(id,plot): cancel_move()
	elif not _panning:
		var world_point := screen_to_world(point)
		var system_id: String=load("res://scripts/estate_progression_landmarks.gd").at_world(self,world_point)
		if not system_id.is_empty():
			progression_selected.emit(system_id)
			_dragging=false
			_panning=false
			return
		var id := building_at_world(world_point)
		if not id.is_empty():
			select_building(id)
			building_selected.emit(id)
		else:
			var plot := plot_at_world(world_point)
			if not plot.is_empty(): plot_selected.emit(plot)
	_dragging = false
	_panning = false

func _pointer_motion(point: Vector2, relative: Vector2) -> void:
	if point.distance_to(_press_position) < 8 and not _dragging and not _panning: return
	var moving := GameData.named(state.get("buildings",[]),_press_building)
	if editing and not moving.is_empty() and not str(moving.type) in ["hall","spring"]:
		_dragging = true
		_drag_id = _press_building
		var destination := plot_at_world(screen_to_world(point))
		_show_ghost(_drag_id,destination,can_preview_move(_drag_id,destination))
		if _ghost != null and destination.is_empty(): _ghost.position = screen_to_world(point)
	else:
		_panning = true
		_fit_camera = false
		camera.position -= relative/camera.zoom
		camera.position = camera.position.clamp(Vector2(-920,-320),Vector2(965,900))
		camera.force_update_scroll()

func _zoom_at(point: Vector2, multiplier: float) -> void:
	var previous := screen_to_world(point)
	_fit_camera = false
	zoom_by(multiplier)
	camera.position += previous-screen_to_world(point)
	camera.force_update_scroll()

func _process(delta: float) -> void:
	for id in _completion_pulses.keys():
		_completion_pulses[id] = maxf(0.0,float(_completion_pulses[id])-delta)
		if _completion_pulses[id] <= 0.0: _completion_pulses.erase(id)

func is_path_cell(cell: Vector2i) -> bool:
	return posmod(cell.x,6)==3 or posmod(cell.y,6)==3

func _cliff_depth(point: Vector2) -> float:
	return 23.0 + sin(point.x*0.017)*2.0 + cos(point.y*0.025)*2.0

func _draw_cliff_face(canvas: Node2D, a: Vector2, b: Vector2, lit: bool) -> void:
	var low_a := a+Vector2(0,_cliff_depth(a))
	var low_b := b+Vector2(0,_cliff_depth(b))
	var rock := Color("b4ad83") if lit else Color("899b78")
	canvas.draw_colored_polygon(PackedVector2Array([a,b,low_b,low_a]),rock)
	# Continuous strata share the exact tile-edge endpoints. No repeating
	# vertical fence posts or unrelated platform art appear along the island.
	canvas.draw_colored_polygon(PackedVector2Array([a.lerp(low_a,0.42),b.lerp(low_b,0.42),low_b,low_a]),Color("9c9f75") if lit else Color("72876b"))
	canvas.draw_colored_polygon(PackedVector2Array([a.lerp(low_a,0.81),b.lerp(low_b,0.81),low_b,low_a]),Color("8a956a") if lit else Color("597762"))
	canvas.draw_polyline(PackedVector2Array([a+Vector2(0,3),b+Vector2(0,3)]),Color("c3db8e") if lit else Color("8fbb71"),3.0,true)
	canvas.draw_line(a+Vector2(0,9),b+Vector2(0,9),Color("7e8c73") if lit else Color("61795f"),2.0,true)
	canvas.draw_line(a.lerp(low_a,0.52),b.lerp(low_b,0.52),Color(0.75,0.8,0.65,0.12),1.0,true)
	if posmod(int(a.x+a.y),5)==0:
		var middle := a.lerp(b,0.58)
		canvas.draw_polyline(PackedVector2Array([middle+Vector2(1,13),middle+Vector2(-4,23),middle+Vector2(-1,31)]),Color(0.15,0.29,0.24,0.19),1.0,true)

func draw_native_terrain(canvas: Node2D) -> void:
	if terrain == null: return
	var ordered: Array = land_cells.keys()
	ordered.sort_custom(func(a,b): return tile_to_world(a).y < tile_to_world(b).y)
	for cell in ordered:
		var c := tile_to_world(cell)
		if not land_cells.has(cell+Vector2i(0,1)):
			_draw_cliff_face(canvas,c+Vector2(-32,0),c+Vector2(0,16),false)
		if not land_cells.has(cell+Vector2i(1,0)):
			_draw_cliff_face(canvas,c+Vector2(0,16),c+Vector2(32,0),true)
	# A native opaque soil surface beneath the atlas closes subpixel filtering
	# seams. It is made from exactly the same cells, never a painted platform.
	if _underlay_mesh != null:
		canvas.draw_mesh(_underlay_mesh,_meadow_texture,Transform2D.IDENTITY,Color.WHITE if _meadow_texture != null else Color("8fa77d"))

func draw_native_gardens(canvas: Node2D) -> void:
	if terrain == null: return
	var selected := GameEconomy.building(state,selected_id)
	if selected.get("type") != "spring": return
	# Selection communicates the actual nourishing plots, rather than drawing
	# a permanent cyan path through unrelated construction sites.
	for plot in plots:
		if not plot.get("nourished",false) or not is_plot_unlocked(str(plot.id)): continue
		var c := plot_to_world(str(plot.id))
		canvas.draw_polyline(PackedVector2Array([c+Vector2(-98,0),c+Vector2(0,-49),c+Vector2(98,0),c+Vector2(0,49),c+Vector2(-98,0)]),Color("5fe7cb"),2.0,true)

func _refresh_garden_props() -> void:
	# Finished generated art remains independent from every buildable tile.
	# Props use the shared native y-sort and never own collision or plot hits.
	if _garden_cells == land_cells: return
	_garden_cells = land_cells.duplicate()
	for child in facilities.get_children():
		if child.get_meta("garden_prop",false): child.queue_free()
	for plot in plots:
		if not is_plot_unlocked(str(plot.id)): continue
		var center: Vector2i = PLOT_CELLS[str(plot.id)]
		var variation := int(str(plot.id).trim_prefix("p"))%6
		var arrangements: Array = [ [[0,2],[1]], [[0,2],[1,0]], [[3,0],[2]], [[2,0],[1]], [[0],[3,2]], [[2],[0]] ]
		for group_index in range(2):
			var edge_cells: Array = [Vector2i(0,-2),Vector2i(2,0)] if variation%3==1 else [Vector2i(-2,0),Vector2i(0,2)]
			var cell: Vector2i = center+edge_cells[group_index]
			if not land_cells.has(cell): continue
			var position := tile_to_world(cell)
			var kinds: Array = arrangements[variation][group_index]
			for i in range(kinds.size()):
				var kind: int = kinds[i]
				var sprite := Sprite2D.new()
				sprite.name = "Garden_%s_%d_%d" % [plot.id,group_index,i]
				sprite.set_meta("garden_prop",true)
				sprite.texture = load("res://assets/estate-v05/%s.png" % GARDEN_PROPS[kind])
				sprite.offset = Vector2(0,-80)
				sprite.scale = Vector2.ONE * (0.28 if kind==1 or kind==0 else (0.22 if kind==2 else 0.24))
				var spread := i-(kinds.size()-1)/2.0
				sprite.position = position+Vector2(spread*24.0,absf(spread)*4.0)
				sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
				facilities.add_child(sprite)

static func project_visual_state(project: Dictionary) -> Dictionary:
	var stage := str(project.get("stage","unstarted"))
	var rank := ["unstarted","survey","prepare","stabilize","complete"].find(stage)
	return {"rank":maxi(0,rank),"survey":rank>=1,"foundation":rank>=2,"pool":rank>=3,
		"stabilized":project.get("completedStages",[]).has("stabilize") or stage=="complete",
		"array":stage=="complete","forge":stage=="complete" and project.get("direction")=="forge",
		"teaching":stage=="complete" and project.get("direction")=="teaching"}

func _project_ellipse(canvas: Node2D, center: Vector2, radius: float, color: Color, width: float = 1.0, filled := false) -> void:
	canvas.draw_set_transform(center,0,Vector2(1,0.5))
	if filled: canvas.draw_circle(Vector2.ZERO,radius,color)
	else: canvas.draw_arc(Vector2.ZERO,radius,0,TAU,48,color,width,true)
	canvas.draw_set_transform(Vector2.ZERO)

func draw_project_construction(canvas: Node2D) -> void:
	var model := project_visual_state(state.get("thunderProject",{}))
	if not model.survey: return
	var c := tile_to_world(Vector2i(15,9))
	var outline := PackedVector2Array([c+Vector2(-46,0),c+Vector2(0,-23),c+Vector2(46,0),c+Vector2(0,23),c+Vector2(-46,0)])
	if model.foundation:
		canvas.draw_colored_polygon(PackedVector2Array([c+Vector2(-45,0),c+Vector2(0,-22),c+Vector2(45,0),c+Vector2(0,23)]),Color("8c9b88"))
		canvas.draw_polyline(outline,Color("d0c9a3"),2,true)
		_project_ellipse(canvas,c,29,Color("5b7871"),1,true)
		_project_ellipse(canvas,c,31,Color("c0b894"),3)
	else:
		canvas.draw_polyline(outline,Color("c1b48a"),1.2,true)
	# Corner survey rods become carved conductors after the component is built.
	for i in range(4):
		var p: Vector2 = c+[Vector2(-39,0),Vector2(0,-20),Vector2(39,0),Vector2(0,20)][i]
		var height := 26.0 if model.pool else 13.0
		canvas.draw_line(p,p+Vector2(0,-height),Color("89968a") if model.pool else Color("b09a70"),5.0 if model.pool else 2.0,true)
		if model.pool:
			canvas.draw_line(p+Vector2(-3,-height),p+Vector2(3,-height),Color("d6c493"),3,true)
			canvas.draw_circle(p+Vector2(0,-height-2),2.5,Color("9dd6cd") if model.stabilized else Color("b8b591"))
	if model.pool:
		_project_ellipse(canvas,c,27,Color("559a9c") if model.stabilized else Color("658e89"),1,true)
		_project_ellipse(canvas,c+Vector2(0,-2),22,Color("a2d8ce"),1.3)
		_project_ellipse(canvas,c+Vector2(0,2),14,Color("80beb5"),1.1)
		if model.stabilized:
			for side in [-1,1]:
				canvas.draw_polyline(PackedVector2Array([c+Vector2(side*30,0),c+Vector2(side*19,-4),c+Vector2(side*11,0)]),Color("c4e5d2"),1.4,true)
	if model.array:
		_project_ellipse(canvas,c,37,Color("dec99c"),1.4)
		for i in range(8):
			var a := i*TAU/8.0
			var p := c+Vector2(cos(a)*35,sin(a)*17.5)
			canvas.draw_line(p,p+Vector2(cos(a)*4,sin(a)*2),Color("e7d8ac"),1.8,true)
	if model.forge:
		# Copper lightning furnace and dark anvil are permanent forge furnishings.
		var f := c+Vector2(0,-9)
		canvas.draw_colored_polygon(PackedVector2Array([f+Vector2(-9,2),f+Vector2(-7,-17),f+Vector2(7,-17),f+Vector2(9,2),f+Vector2(0,7)]),Color("b68652"))
		canvas.draw_rect(Rect2(f+Vector2(-4,-10),Vector2(8,7)),Color("e5c17b"))
		canvas.draw_line(f+Vector2(-9,-18),f+Vector2(9,-18),Color("e2c995"),3,true)
		canvas.draw_line(f+Vector2(0,-19),f+Vector2(0,-32),Color("c6c4a0"),2,true)
		var anvil := c+Vector2(16,9)
		canvas.draw_colored_polygon(PackedVector2Array([anvil+Vector2(-8,-6),anvil+Vector2(9,-6),anvil+Vector2(5,-2),anvil+Vector2(2,-2),anvil+Vector2(3,3),anvil+Vector2(-4,3),anvil+Vector2(-3,-2)]),Color("586c68"))
	elif model.teaching:
		# The teaching branch replaces forge hardware with a jade scripture stele.
		var t := c+Vector2(0,-9)
		canvas.draw_colored_polygon(PackedVector2Array([t+Vector2(-10,4),t+Vector2(-9,-25),t+Vector2(0,-30),t+Vector2(9,-25),t+Vector2(10,4),t+Vector2(0,9)]),Color("a7c5b5"))
		canvas.draw_polyline(PackedVector2Array([t+Vector2(-9,-25),t+Vector2(0,-30),t+Vector2(9,-25)]),Color("e5d4a5"),2,true)
		for y in [-20,-15,-10]: canvas.draw_line(t+Vector2(-4,y),t+Vector2(4,y),Color("527f7b"),1.4,true)
		for side in [-1,1]:
			var cushion := c+Vector2(side*17,9)
			_project_ellipse(canvas,cushion,6,Color("d6c596"),1,true)

func draw_plot_markers(canvas: Node2D) -> void:
	if terrain == null: return
	var font: Font = ThemeDB.fallback_font
	for plot in plots:
		var id: String = str(plot.id)
		if not PLOT_CELLS.has(id): continue
		var center := plot_to_world(id)
		var occupied := false
		for b in state.get("buildings",[]):
			if str(b.get("plot",""))==id and not b.get("pendingPlacement",false): occupied = true
		var available := is_plot_unlocked(id)
		if occupied and not editing: continue
		if not available and not expansion_mode and highlighted_plot != id: continue
		var outline := PackedVector2Array()
		for p in [Vector2(-96,0),Vector2(0,-48),Vector2(96,0),Vector2(0,48),Vector2(-96,0)]: outline.append(center+p)
		var color := Color("90cdb7") if available else Color("8c9d91")
		if editing or construction_mode or expansion_mode or highlighted_plot==id:
			canvas.draw_polyline(outline,Color(color,0.7 if available else 0.22),1.5,true)
		if highlighted_plot==id:
			canvas.draw_polyline(outline,Color("fff2ae"),3.0,true)
		if occupied: continue
		if available:
			if not editing and not construction_mode and highlighted_plot!=id: continue
			canvas.draw_arc(center,15,0,TAU,32,Color("e3ddae"),1.2,true)
			canvas.draw_line(center-Vector2(7,0),center+Vector2(7,0),Color("f8edbc"),1.6,true)
			canvas.draw_line(center-Vector2(0,7),center+Vector2(0,7),Color("f8edbc"),1.6,true)
			canvas.draw_string(font,center+Vector2(-25,30),"可建设",HORIZONTAL_ALIGNMENT_CENTER,50,14,Color("f1edc7"))
		else:
			if not land_cells.has(PLOT_CELLS[id]):
				# Faint grid-aligned prospect pads ground expansion locks in the
				# clouds without pretending unpurchased land already exists.
				canvas.draw_colored_polygon(PackedVector2Array(outline.slice(0,4)),Color(0.72,0.85,0.72,0.10))
				canvas.draw_polyline(outline,Color(0.74,0.88,0.75,0.27),1.0,true)
			canvas.draw_rect(Rect2(center+Vector2(-7,-2),Vector2(14,11)),Color("879f91"),false,1.8)
			canvas.draw_arc(center+Vector2(0,-2),5,PI,TAU,10,Color("879f91"),1.8,true)
			var label := "可拓建" if state.get("unlockedRegions",[0]).has(int(plot.get("region",0))) else "区域待开启"
			canvas.draw_string(font,center+Vector2(-45,28),label,HORIZONTAL_ALIGNMENT_CENTER,90,13,Color("b5c7b7"))
	draw_project_construction(canvas)

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode==KEY_ESCAPE and (_ghost != null or not _preview_id.is_empty()):
		cancel_move()
		get_viewport().set_input_as_handled()
