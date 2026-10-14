class_name BattleActor
extends Control
## A presentation-only body. It reads committed events; it never calls combat or RNG.
const ROOT := "res://assets/battle/nezha/"
const DEFAULT_CLIPS := {
	"idle":{"frames":4,"fps":6.0,"loop":true,"impact_frame":0},
	"attack":{"frames":6,"fps":10.0,"loop":false,"impact_frame":3},
	"cast":{"frames":6,"fps":8.0,"loop":false,"impact_frame":3},
	"hurt":{"frames":4,"fps":12.0,"loop":false,"impact_frame":1}
}
static var _metadata: Dictionary = {}
static var _textures: Dictionary = {}
var clip := "idle"
var frame_index := 0
var age := 0.0
var clip_duration := 0.0
var playback_speed := 1.0
var reduced := false
var mirrored := false
var defeated := false
var body_ready := false
var animation_enabled := false # User paused animation production; show the real body only.

static func metadata() -> Dictionary:
	if _metadata.is_empty():
		_metadata = {"animations":DEFAULT_CLIPS.duplicate(true)}
		if FileAccess.file_exists(ROOT+"metadata.json"):
			var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(ROOT+"metadata.json"))
			if value is Dictionary: _metadata.merge(value,true)
	return _metadata

static func clip_spec(name: String) -> Dictionary:
	var raw: Variant = metadata().get("animations",metadata().get("clips",{})).get(name,{})
	var spec: Dictionary = DEFAULT_CLIPS.get(name,DEFAULT_CLIPS.idle).duplicate(true)
	if raw is Dictionary: spec.merge(raw,true)
	# Frames may be a count, paths, or a spritesheet with one consistent cell size.
	var frames: Variant = spec.get("frames",1)
	spec["count"] = frames.size() if frames is Array else int(frames)
	spec["count"] = maxi(1,int(spec.count))
	spec["duration"] = float(spec.get("duration",float(spec.count)/maxf(1,float(spec.get("fps",10)))))
	return spec

static func duration_for(name: String) -> float:
	return float(clip_spec(name).duration)

static func impact_fraction(name: String) -> float:
	var spec: Dictionary = clip_spec(name)
	return clampf(float(spec.get("impact_frame",int(spec.count)/2))/float(spec.count),0.15,0.85)

static func texture_for(name: String, index: int) -> Texture2D:
	var spec: Dictionary = clip_spec(name)
	var paths: Variant = spec.get("frames")
	var path: String = ""
	if paths is Array and not paths.is_empty(): path = str(paths[mini(index,paths.size()-1)])
	else: path = str(spec.get("file",name+".png"))
	if not path.begins_with("res://"): path = ROOT+path
	if not _textures.has(path): _textures[path] = load(path) if ResourceLoader.exists(path) else null
	return _textures[path] as Texture2D

static func available() -> bool:
	return texture_for("idle",0)!=null

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	body_ready = available()
	clip_duration = duration_for("idle")

func play(name: String, duration: float = -1.0) -> void:
	if defeated: return
	if not animation_enabled:
		clip="idle"
		frame_index=0
		queue_redraw()
		return
	clip = name if name in DEFAULT_CLIPS else "idle"
	age = 0.0
	frame_index = 0
	clip_duration = duration if duration>0 else duration_for(clip)
	queue_redraw()

func depart() -> void:
	play("hurt")
	defeated = true

func _process(delta: float) -> void:
	if not animation_enabled: return
	# The parent disables processing on focus loss. Clamp unexpected long frames.
	age += minf(delta,0.1)*playback_speed
	var spec: Dictionary = clip_spec(clip)
	if clip=="idle":
		frame_index = 0 if reduced else int(age/maxf(0.01,clip_duration)*int(spec.count))%int(spec.count)
	else:
		frame_index = mini(int(spec.count)-1,int(age/maxf(0.01,clip_duration)*int(spec.count)))
		if age>=clip_duration and not defeated: play("idle")
	queue_redraw()

func _draw() -> void:
	var texture: Texture2D = texture_for(clip,frame_index)
	if texture==null: return
	var spec: Dictionary = clip_spec(clip)
	var individual: bool = spec.get("frames") is Array
	var columns: int = maxi(1,int(spec.get("columns",spec.count)))
	var frame_size := Vector2(float(spec.get("frame_width",metadata().get("frame_width",texture.get_width() if individual else texture.get_width()/columns))),float(spec.get("frame_height",metadata().get("frame_height",texture.get_height()))))
	var source := Rect2(Vector2.ZERO,frame_size)
	if not individual: source.position = Vector2((frame_index%columns)*frame_size.x,(frame_index/columns)*frame_size.y)
	var scale_value: float = minf(size.x/frame_size.x,size.y/frame_size.y)
	var display := frame_size*scale_value
	var origin := Vector2((size.x-display.x)*0.5,size.y-display.y)
	draw_set_transform(Vector2(size.x,0) if mirrored else Vector2.ZERO,0,Vector2(-1,1) if mirrored else Vector2.ONE)
	draw_texture_rect_region(texture,Rect2(origin,display),source,Color(0.66,0.68,0.72,0.55) if defeated and age>=clip_duration else Color.WHITE)
	draw_set_transform(Vector2.ZERO)
