class_name BuildingView
extends Node2D
## Independent native facility. Its four measured art foundation corners are
## projected onto the same 3 x 3 TileMapLayer footprint used by placement.
const FLOOR_HALF := Vector2(96.0, 48.0)
const FLOOR_CORNERS := [Vector2(-96, 0), Vector2(0, -48), Vector2(96, 0), Vector2(0, 48)]
const ASSETS := {
 "hall": "wanxian-premium.webp", "spring": "spring-premium.webp",
 "farm": "farm-premium.webp", "alchemy": "alchemy-idle-v02.webp",
 "forge": "forge-idle-v02.webp", "library": "library-premium.webp",
 "arena": "arena-premium.webp"
}
var building: Dictionary = {}
var source_state: Dictionary = {}
var metadata: Dictionary = {}
var selected := false
var ghost := false
var nourished := false
var valid_placement := true
var mesh: Polygon2D
var caption: Label
var status: Label
var phase := 0.0
var operating := false
var constructing := false
var stored := false
var full := false
var completion_remaining := 0.0
var art_top := -120.0
var texture_image: Image
var foreground: FacilityStateEffects
var _visual_key := ""
var furnishings: Array[Sprite2D] = []
static var _visual_metadata_cache: Dictionary = {}
class FacilityStateEffects extends Node2D:
	var facility: BuildingView
	func _draw() -> void:
		if facility != null: facility.draw_state_effects(self)

func _ready() -> void:
	if mesh == null:
		mesh = Polygon2D.new()
		mesh.name = "FoundationNormalizedSprite"
		mesh.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		add_child(mesh)
		foreground = FacilityStateEffects.new()
		foreground.name = "DataDrivenStateEffects"
		foreground.facility = self
		add_child(foreground)
		caption = Label.new()
		caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		caption.add_theme_font_size_override("font_size", 17)
		caption.add_theme_color_override("font_color", Color("f7eed2"))
		caption.add_theme_color_override("font_shadow_color", Color("102727"))
		caption.add_theme_constant_override("shadow_offset_x", 1)
		caption.add_theme_constant_override("shadow_offset_y", 2)
		caption.add_theme_constant_override("outline_size", 4)
		caption.add_theme_color_override("font_outline_color", Color(0.07,0.16,0.17,0.85))
		caption.position = Vector2(-110, 49)
		caption.size = Vector2(220, 26)
		add_child(caption)
		status = Label.new()
		status.mouse_filter = Control.MOUSE_FILTER_IGNORE
		status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		status.add_theme_font_size_override("font_size", 14)
		status.add_theme_color_override("font_color", Color("d6ead6"))
		status.add_theme_constant_override("outline_size", 4)
		status.add_theme_color_override("font_outline_color", Color(0.05,0.13,0.15,0.95))
		status.position = Vector2(-130, 71)
		status.size = Vector2(260, 23)
		add_child(status)
		for at in [Vector2(-86,5),Vector2(86,5),Vector2(-64,26),Vector2(64,26)]:
			var ornament := Sprite2D.new()
			ornament.texture = load("res://assets/estate-v05/vermilion-lantern.png" if furnishings.size()<2 else "res://assets/estate-v05/jade-blossom.png")
			ornament.offset = Vector2(0,-80)
			ornament.position = at
			ornament.scale = Vector2.ONE*0.12
			ornament.z_index = 1
			add_child(ornament)
			furnishings.append(ornament)
	if not building.is_empty(): _rebuild()

func configure(value: Dictionary, state: Dictionary, is_nourished := false) -> void:
	building = value.duplicate(true)
	source_state = state
	nourished = is_nourished
	if is_node_ready(): _rebuild()

static func visual_metadata(kind: String, level: int) -> Dictionary:
	var key := kind+":"+str(clampi(level,1,4))
	if _visual_metadata_cache.has(key): return _visual_metadata_cache[key].duplicate(true)
	var extras_path := "res://assets/terrain/extra-building-visuals.json"
	if FileAccess.file_exists(extras_path):
		var extras = JSON.parse_string(FileAccess.get_file_as_string(extras_path))
		if extras is Dictionary and extras.has(kind):
			_visual_metadata_cache[key] = extras[kind].duplicate(true)
			return _visual_metadata_cache[key].duplicate(true)
	var visuals: Dictionary = GameData.all().get("buildingVisuals", {})
	_visual_metadata_cache[key] = visuals.get(kind, {}).get(str(clampi(level,1,4)), {}).duplicate(true)
	return _visual_metadata_cache[key].duplicate(true)

static func foundation_project(meta: Dictionary, point: Vector2) -> Vector2:
	# Four affine sectors have shared seams. Every original foundation corner
	# maps EXACTLY to its authoritative grid corner, including skewed source art.
	var center := Vector2(float(meta.foundation.center.x), float(meta.foundation.center.y))
	var relative := point - center
	var corners: Array = meta.foundation.corners
	for i in range(4):
		var av := Vector2(float(corners[i].x),float(corners[i].y)) - center
		var bv := Vector2(float(corners[(i+1)%4].x),float(corners[(i+1)%4].y)) - center
		var determinant := av.cross(bv)
		if absf(determinant) < 0.0001: continue
		var u := relative.cross(bv) / determinant
		var v := av.cross(relative) / determinant
		if u >= -0.00001 and v >= -0.00001:
			return FLOOR_CORNERS[i] * u + FLOOR_CORNERS[(i+1)%4] * v
	return Vector2.ZERO

func _rebuild() -> void:
	var kind: String = str(building.get("type", "hall"))
	var level: int = int(building.get("level", 1))
	if _visual_key != kind+":"+str(level):
		_rebuild_art(kind,level)
		_visual_key = kind+":"+str(level)
	var actual_status: Dictionary = GameEconomy.get_building_status(source_state,str(building.get("id","")))
	constructing = actual_status.get("construction", "ready") == "building"
	operating = actual_status.get("production", "idle") == "producing"
	stored = bool(actual_status.get("pending",false))
	full = actual_status.get("production", "idle") == "storage-full"
	var info: Dictionary = GameData.named(GameEconomy.get_building_types(),kind)
	caption.text = "%s  ·  %d阶" % [str(info.get("name",kind)),level]
	var statuses: Array[String] = []
	if constructing: statuses.append("建造中")
	elif full: statuses.append("满仓暂停")
	elif operating: statuses.append("滋养 +20%" if kind == "farm" and nourished else "产出中")
	elif actual_status.get("production", "idle") == "missing-materials": statuses.append("材料不足")
	elif kind in ["alchemy","forge","relicworkshop"]: statuses.append("工序待命")
	if stored: statuses.append("可领取")
	status.text = " · ".join(statuses)
	mesh.modulate = Color(0.83,0.90,0.89,0.8) if constructing else Color.WHITE
	if ghost:
		modulate = Color(0.72,1.0,0.85,0.65) if valid_placement else Color(1.0,0.45,0.35,0.55)
	caption.visible = selected and not ghost
	status.visible = selected and not ghost
	for i in range(furnishings.size()): furnishings[i].visible = level >= (2 if i<2 else 3) and not constructing
	queue_redraw()
	if foreground != null: foreground.queue_redraw()

func _rebuild_art(kind: String, level: int) -> void:
	metadata = visual_metadata(kind, level)
	var asset: String = str(ASSETS.get(kind, ASSETS.hall))
	if kind == "hall" and level >= 2: asset = "hall-expanded-beta.webp"
	if kind == "alchemy" and level == 2: asset = "alchemy-stage2-v02.webp"
	if kind == "alchemy" and level >= 3: asset = "alchemy-stage3-beta.webp"
	mesh.texture = load(str(metadata.get("path","res://assets/buildings/" + asset)))
	texture_image = mesh.texture.get_image()
	if texture_image.is_compressed(): texture_image.decompress()
	var points := PackedVector2Array()
	var src := PackedVector2Array()
	# A mesh, rather than a rectangular Sprite2D hitbox, preserves the source's
	# fine alpha edges while conforming its floor to the actual native tile grid.
	for y in range(13):
		for x in range(13):
			src.append(Vector2(float(metadata.width)*x/12.0,float(metadata.height)*y/12.0))
	for corner in metadata.foundation.corners:
		src.append(Vector2(float(corner.x),float(corner.y)))
	src.append(Vector2(float(metadata.foundation.center.x),float(metadata.foundation.center.y)))
	art_top = 0.0
	for p in src:
		var mapped := foundation_project(metadata,p)
		points.append(mapped)
		art_top = minf(art_top, mapped.y)
	var indices := Geometry2D.triangulate_delaunay(src)
	var faces: Array[PackedInt32Array] = []
	for i in range(0, indices.size(), 3):
		faces.append(PackedInt32Array([indices[i], indices[i+1], indices[i+2]]))
	mesh.polygon = points
	mesh.uv = src
	mesh.polygons = faces

func _process(delta: float) -> void:
	phase += delta
	var was_completing := completion_remaining > 0.0
	completion_remaining = maxf(0.0,completion_remaining-delta)
	if operating or selected or constructing or stored or was_completing:
		queue_redraw()
		if foreground != null: foreground.queue_redraw()

func set_selected(value: bool) -> void:
	selected = value
	if caption != null: caption.visible = selected and not ghost
	if status != null: status.visible = selected and not ghost
	queue_redraw()

func _draw() -> void:
	var floor := PackedVector2Array(FLOOR_CORNERS)
	draw_colored_polygon(PackedVector2Array([Vector2(-101,4),Vector2(0,-46),Vector2(101,4),Vector2(0,56)]),Color(0.02,0.11,0.1,0.24))
	if selected or ghost:
		var ring := PackedVector2Array([Vector2(-102,0),Vector2(0,-51),Vector2(102,0),Vector2(0,51),Vector2(-102,0)])
		draw_polyline(ring,Color("f5d78b") if not ghost else Color("86f4c9"),2.0,true)
		for p in floor: draw_circle(p,2.8,Color("ffe1a1"))

func draw_state_effects(canvas: Node2D) -> void:
	if building.is_empty(): return
	if completion_remaining > 0.0:
		var t := 1.0-completion_remaining/1.8
		var radius := 95.0+t*28.0
		var alpha := sin(t*PI)*0.8
		var ring := PackedVector2Array([Vector2(-radius,0),Vector2(0,-radius*0.5),Vector2(radius,0),Vector2(0,radius*0.5),Vector2(-radius,0)])
		canvas.draw_polyline(ring,Color(0.94,0.83,0.46,alpha),2.8,true)
		for i in range(7):
			var x := float(i-3)*20
			canvas.draw_circle(Vector2(x,12-t*75-absf(x)*0.22),2.2,Color(1.0,0.91,0.63,alpha))
	var level: int = int(building.get("level",1))
	if constructing:
		for x in [-78.0,78.0]:
			canvas.draw_line(Vector2(x,15),Vector2(x,-70),Color("c5a779"),3)
			canvas.draw_line(Vector2(x-9,-44),Vector2(x+9,-44),Color("dcc391"),2)
		return
	if operating and str(building.get("type")) in ["spring","farm","mine"]:
		var color := Color(0.55,0.95,0.88,0.35)
		for i in range(3):
			var t := fmod(phase*0.45+i/3.0,1.0)
			var origin := Vector2((i-1)*26,-12-t*27)
			canvas.draw_circle(origin,1.8,Color(color,color.a*(1.0-t)))
	if operating and str(building.get("type")) in ["alchemy","forge","relicworkshop"]:
		var fire := Color("ffc473")
		for i in range(4):
			var t := fmod(phase*0.7+i/4.0,1.0)
			canvas.draw_circle(Vector2(sin(t*7+i)*7,-45-t*33),2.5*(1.0-t),Color(fire,0.55*(1.0-t)))
	if stored:
		var at := Vector2(0, art_top-14+sin(phase*2)*2)
		canvas.draw_circle(at,10,Color("243d36"))
		canvas.draw_arc(at,10,0,TAU,24,Color("d8c280"),1.5,true)
		canvas.draw_line(at+Vector2(-4,0),at+Vector2(-1,3),Color("fff1b1"),2,true)
		canvas.draw_line(at+Vector2(-1,3),at+Vector2(5,-4),Color("fff1b1"),2,true)

func _lantern_box() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color("e8d4a0")
	box.border_color = Color("886846")
	box.set_border_width_all(1)
	box.set_corner_radius_all(2)
	return box

func contains_ground_point(world: Vector2) -> bool:
	var local := to_local(world)
	return absf(local.x)/FLOOR_HALF.x + absf(local.y)/FLOOR_HALF.y <= 1.0

static func foundation_unproject(meta: Dictionary, point: Vector2) -> Vector2:
	var center := Vector2(float(meta.foundation.center.x),float(meta.foundation.center.y))
	for i in range(4):
		var av: Vector2 = FLOOR_CORNERS[i]
		var bv: Vector2 = FLOOR_CORNERS[(i+1)%4]
		var determinant := av.cross(bv)
		var u := point.cross(bv)/determinant
		var v := av.cross(point)/determinant
		if u >= -0.00001 and v >= -0.00001:
			var ac = meta.foundation.corners[i]
			var bc = meta.foundation.corners[(i+1)%4]
			return center+(Vector2(ac.x,ac.y)-center)*u+(Vector2(bc.x,bc.y)-center)*v
	return center

func contains_visible_point(world_point: Vector2) -> bool:
	if texture_image == null or metadata.is_empty(): return false
	var pixel := foundation_unproject(metadata,to_local(world_point))
	if pixel.x<0 or pixel.y<0 or pixel.x>=texture_image.get_width() or pixel.y>=texture_image.get_height(): return false
	return texture_image.get_pixel(int(pixel.x),int(pixel.y)).a>0.15
