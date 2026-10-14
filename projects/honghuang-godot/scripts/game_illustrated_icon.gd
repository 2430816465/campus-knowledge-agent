class_name GameIllustratedIcon
extends Control
## Native, illustrated icon layer. Art is separate from all live text and state.
const ATLAS_PATH := "res://assets/ui-v08/illustrated-icons.png"
const KEYS := ["chest","gift","events","friends","beast","treasure", "meditation","guild","battle","hunt","tower","festival", "checkin","summon","sword","mirror","armor","gourd", "fire","lotus","fan","crown","taiji","bracelet", "pendant","bell","seal","boots","scroll","stone", "xp","ingot","forge","estate","adventure","rank"]
const ALIASES := {"home":"estate","heroes":"friends","law":"meditation","weapon":"sword","flower":"lotus","feather":"fan","sands":"bell","goblet":"gourd","circlet":"crown","robe":"armor","belt":"seal","ticket":"summon","material":"ingot","fate":"stone","herb":"lotus","spirit":"beast","vein":"tower","stages":"battle","affairs":"chest","mail":"scroll","training":"meditation"}
static var _atlas: Texture2D
static var _textures: Dictionary = {}
static var bounds_cache: Dictionary = {}
const BOUNDS_PATH := "res://assets/ui-v08/icon-bounds.json"
var key := "forge"
var halo := true
var selected := false

class NoticeDot extends Control:
	func _draw() -> void:
		draw_circle(size*0.5,minf(size.x,size.y)*0.47,Color("f17a55"))
		draw_arc(size*0.5,minf(size.x,size.y)*0.47,0,TAU,24,Color("ffe8b7"),1,true)

static func texture(icon_key: String) -> Texture2D:
	var resolved := str(ALIASES.get(icon_key,icon_key))
	if _textures.has(resolved): return _textures[resolved]
	if _atlas == null:
		if ResourceLoader.exists(ATLAS_PATH): _atlas = load(ATLAS_PATH)
		else:
			var image := Image.load_from_file(ProjectSettings.globalize_path(ATLAS_PATH))
			if image == null: return null
			_atlas = ImageTexture.create_from_image(image)
	var index := KEYS.find(resolved)
	if index < 0: index = KEYS.find("scroll")
	var cell := _atlas.get_size()/6.0
	var result := AtlasTexture.new()
	result.atlas = _atlas
	result.region = Rect2(Vector2(index%6,index/6)*cell,cell)
	result.filter_clip = true
	_textures[resolved] = result
	return result

static func icon(parent: Node,icon_key: String,with_halo: bool=true) -> Control:
	var node := GameIllustratedIcon.new()
	node.key = icon_key
	node.halo = with_halo
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(node)
	return node

static func button(parent: Node,title: String,icon_key: String,callback: Callable,notice: bool=false,with_halo: bool=true) -> Button:
	var button := Button.new()
	button.name = "Entry_" + icon_key
	button.flat = true
	button.clip_contents = false
	button.tooltip_text = title
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_stylebox_override("normal",StyleBoxEmpty.new())
	button.add_theme_stylebox_override("hover",GameTheme.box(Color(0.78,0.90,1,0.09),Color.TRANSPARENT,24,0))
	button.add_theme_stylebox_override("pressed",GameTheme.box(Color(0.01,0.08,0.13,0.25),Color.TRANSPARENT,24,0))
	button.add_theme_stylebox_override("focus",GameTheme.box(Color.TRANSPARENT,Color("f7d593"),20,0))
	button.pressed.connect(callback)
	parent.add_child(button)
	var art := icon(button,icon_key,with_halo)
	art.name = "Art"
	var caption := Label.new()
	caption.name = "Caption"
	caption.text = GameNames.text(title)
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	caption.add_theme_color_override("font_color",Color("fff3d2"))
	caption.add_theme_color_override("font_outline_color",Color("16313c"))
	caption.add_theme_constant_override("outline_size",4)
	caption.add_theme_font_size_override("font_size",15)
	caption.add_theme_font_override("font",GameTheme.display_font())
	button.add_child(caption)
	var dot := NoticeDot.new()
	dot.name = "Notice"
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dot.visible = notice
	button.add_child(dot)
	var arrange := func()->void:
		if not is_instance_valid(button): return
		var label_height := 20.0 if button.size.x >= 62 else 18.0
		var side := minf(button.size.x-2,button.size.y-label_height+3)
		art.position = Vector2((button.size.x-side)/2.0,maxf(0,(button.size.y-label_height-side)/2.0))
		art.size = Vector2.ONE*side
		caption.position = Vector2(0,button.size.y-label_height)
		caption.size = Vector2(button.size.x,label_height)
		caption.add_theme_font_size_override("font_size",15 if button.size.x>=62 else (11 if button.size.x<48 else 12))
		dot.position = art.position+Vector2(side*0.8,side*0.08)
		dot.size = Vector2.ONE*7
	button.resized.connect(arrange)
	arrange.call_deferred()
	return button

func _ready() -> void:
	resized.connect(queue_redraw)

func _draw() -> void:
	var extent := minf(size.x,size.y)
	var center := size*0.5
	if halo:
		for step in range(8,0,-1):
			draw_circle(center,extent*(0.34+step*0.017),Color(0.34,0.77,1.0,0.018))
		draw_circle(center,extent*0.405,Color(0.04,0.13,0.21,0.58))
		draw_arc(center,extent*0.413,0,TAU,56,Color(0.98,0.82,0.47,0.75),1.0,true)
		draw_arc(center,extent*0.43,PI*1.1,PI*1.9,28,Color(0.96,0.94,0.73,0.75),1.25,true)
	var art := texture(key)
	if art != null:
		var source := icon_bounds(key)
		var scale := extent*(0.73 if halo else 0.94)/maxf(source.size.x,source.size.y)
		var target := Rect2(center-source.size*scale*0.5,source.size*scale)
		draw_texture_rect_region(art,target,source)
	if selected and not halo:
		draw_line(Vector2(center.x-extent*0.12,size.y-1),Vector2(center.x+extent*0.12,size.y-1),Color("e7cf8e"),1.4,true)

static func icon_bounds(icon_key: String) -> Rect2:
	if bounds_cache.is_empty() and FileAccess.file_exists(BOUNDS_PATH):
		var parsed: Variant=JSON.parse_string(FileAccess.get_file_as_string(BOUNDS_PATH))
		if parsed is Dictionary: bounds_cache=parsed
	var canonical: String=str(ALIASES.get(icon_key,icon_key))
	var values: Array=bounds_cache.get(canonical,[0,0,209,209])
	return Rect2(float(values[0]),float(values[1]),float(values[2]),float(values[3]))
