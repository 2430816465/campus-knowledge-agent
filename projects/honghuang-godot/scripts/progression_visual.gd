class_name ProgressionVisual
extends Control
## Read-only visual view over the existing progression save. No ownership or reward writes.
const FAMILY := {"011":"cosmetics","028":"mounts","036":"manifestations"}
const SLOT := {"011":"outfit","028":"main","036":"main"}
const INK := Color("214b63")
const BLUE := Color("557f97")
const GOLD := Color("bd9858")
const PALE := Color("eef5f6")
const PORTRAIT := "res://assets/avatars/yangjian-premium.webp"
const ASSET_DIR := "res://assets/progression-v08/"
static var _textures: Dictionary = {}
var system_id: String = ""
var preview: Dictionary = {}
var art: TextureRect
var title_label: Label
var ownership_label: Label
var growth_label: Label
var equipped_label: Label
var note_label: Label
var portrait_material: ShaderMaterial

static func build(g: Control, parent: Node, id: String, model: Dictionary) -> Control:
	if not FAMILY.has(id): return null
	var view: Control = load("res://scripts/progression_visual.gd").new()
	view.name = "ProgressionVisual_" + id
	view.system_id = id
	view.custom_minimum_size = Vector2(0,112)
	view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(view)
	view.refresh(g.state(),model)
	return view

static func snapshot(s: Dictionary, id: String, selected_id: String) -> Dictionary:
	if not FAMILY.has(id): return {}
	var family: String = FAMILY[id]
	var p: Dictionary = s.get("progression",{})
	var choices: Array = load("res://scripts/game_progression.gd").rules().families[family].choices
	var spec: Dictionary = GameData.named(choices,selected_id)
	if spec.is_empty(): return {}
	var record: Dictionary = p.get("families",{}).get(family,{}).get(selected_id,{})
	var owned: bool = not record.is_empty()
	var actual_id: String = str(p.get("selected",{}).get(family,{}).get(SLOT[id],""))
	var actual_owned: bool = p.get("families",{}).get(family,{}).has(actual_id)
	var actual_name: String = str(GameData.named(choices,actual_id).get("name","")) if actual_owned else ""
	var lv: int = int(record.get("level",0)) if owned else 0
	var stars: int = int(record.get("stars",0)) if owned else 0
	var spirit: int = int(p.get("mountSpirits",{}).get(selected_id,0)) if owned and id=="028" else 0
	var stage: int = 1+mini(3,lv/10+stars/2) if owned else 0
	return {"id":selected_id,"name":str(spec.name),"family":family,"owned":owned,"equipped":owned and actual_id==selected_id,"equippedName":actual_name,"level":lv,"stars":stars,"spirit":spirit,"stage":stage,"asset":PORTRAIT if id=="011" else ASSET_DIR+family+"-"+selected_id+".svg"}

static func texture(path: String) -> Texture2D:
	if _textures.has(path): return _textures[path]
	var value: Texture2D
	if path.ends_with(".svg"):
		var image := Image.new()
		if image.load_svg_from_string(FileAccess.get_file_as_string(path),2.0) == OK: value = ImageTexture.create_from_image(image)
	elif ResourceLoader.exists(path): value = load(path)
	_textures[path] = value
	return value

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	art = TextureRect.new()
	art.name = "PreviewArt"
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(art)
	title_label = _label("PreviewName",18,INK)
	ownership_label = _label("Ownership",12,BLUE)
	growth_label = _label("Growth",11,INK)
	equipped_label = _label("Equipped",11,BLUE)
	note_label = _label("VisualNote",10,BLUE)
	# Fixed short lines prevent a stale zero-width autowrap minimum during pager layout.
	note_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	resized.connect(_layout)

func _label(label_name: String, font_size: int, color: Color) -> Label:
	var value: Label = GameTheme.label("",font_size,color)
	value.name = label_name
	value.mouse_filter = Control.MOUSE_FILTER_IGNORE
	value.autowrap_mode = TextServer.AUTOWRAP_OFF
	add_child(value)
	return value

func refresh(s: Dictionary, model: Dictionary) -> void:
	preview = snapshot(s,system_id,str(model.get("selectedId","")))
	if preview.is_empty(): hide(); return
	show()
	art.texture = texture(str(preview.asset))
	art.modulate = Color.WHITE if preview.owned else Color(0.85,0.9,0.94,0.72)
	title_label.text = str(preview.name)
	ownership_label.text = "当前佩戴" if preview.equipped else "已拥有 · 预览中" if preview.owned else "未获得 · 仅供预览"
	equipped_label.text = "已配置：" + (str(preview.equippedName) if not str(preview.equippedName).is_empty() else "暂无")
	if system_id == "011":
		_set_outfit(str(preview.id))
		growth_label.text = {"plain":"青玉衣色 · 素雅饰边","cloud":"霁蓝衣色 · 流云饰边","gold":"暖金衣色 · 冠羽饰边"}.get(preview.id,"")
		note_label.text = "头像配色与饰边示意\n非独立服装原画"
	else:
		art.material = null
		growth_label.text = "尚未解锁培养" if not preview.owned else "Lv.%d · %d星%s" % [int(preview.level),int(preview.stars)," · 器灵%d级" % int(preview.spirit) if system_id=="028" else ""]
		var stage_name: String = ["未激活","初醒","凝辉","灵华","昭明"][int(preview.stage)]
		note_label.text = ("灵光 · "+stage_name+" / 器灵"+("已显" if int(preview.spirit)>0 else "未显")) if system_id=="028" else "静态显化 · "+stage_name
	tooltip_text = "%s｜%s\n%s\n%s" % [preview.name,ownership_label.text,growth_label.text,note_label.text]
	_layout()
	queue_redraw()

func _set_outfit(id: String) -> void:
	if portrait_material == null:
		var shader := Shader.new()
		shader.code = "shader_type canvas_item; uniform vec4 cloth_color: source_color; void fragment(){ vec4 c=texture(TEXTURE,UV); float blue_mask=smoothstep(0.02,0.16,c.b-c.r)*smoothstep(0.38,0.62,UV.y); float lightness=dot(c.rgb,vec3(0.299,0.587,0.114)); c.rgb=mix(c.rgb,cloth_color.rgb*(0.35+lightness*0.95),blue_mask*0.82); c.a*=1.0-smoothstep(0.465,0.48,distance(UV,vec2(0.5))); COLOR=c; }"
		portrait_material = ShaderMaterial.new()
		portrait_material.shader = shader
	portrait_material.set_shader_parameter("cloth_color",{"plain":Color("4d9c98"),"cloud":Color("679bd0"),"gold":Color("d7af56")}.get(id,Color("4d9c98")))
	art.material = portrait_material

func _layout() -> void:
	if art == null: return
	var compact: bool = size.x<350
	var art_width: float = 90 if compact else 108
	var left: float = art_width+10
	art.position = Vector2(3,9)
	art.size = Vector2(art_width,94)
	title_label.position = Vector2(left,3); title_label.size = Vector2(size.x-left-6,22)
	title_label.add_theme_font_size_override("font_size",16 if compact else 18)
	ownership_label.position = Vector2(left,26); ownership_label.size = Vector2(size.x-left-6,16)
	growth_label.position = Vector2(left,44); growth_label.size = Vector2(size.x-left-6,16)
	equipped_label.position = Vector2(left,62); equipped_label.size = Vector2(size.x-left-6,16)
	note_label.position = Vector2(left,80); note_label.size = Vector2(size.x-left-6,32)
	queue_redraw()

func _draw() -> void:
	if preview.is_empty(): return
	draw_style_box(GameTheme.silk("panel",PALE,0),Rect2(Vector2.ZERO,size))
	draw_line(Vector2(8,size.y-1),Vector2(size.x-8,size.y-1),Color("b8cfd4"),1,true)
	var aw: float = 90 if size.x<350 else 108
	var center := Vector2(aw*0.5+3,56)
	if system_id == "011":
		var trim: Color = GOLD if preview.id=="gold" else BLUE if preview.id=="cloud" else Color("54938c")
		draw_circle(center,45,Color("dcebef"))
		draw_arc(center,45,-PI*0.7,PI*0.7,48,trim,2.5,true)
		if preview.id=="gold":
			draw_colored_polygon(PackedVector2Array([center+Vector2(-22,-37),center+Vector2(-21,-48),center+Vector2(-10,-42),center+Vector2(0,-52),center+Vector2(10,-42),center+Vector2(21,-48),center+Vector2(22,-37)]),GOLD)
		elif preview.id=="cloud":
			for n: int in 3: draw_arc(center+Vector2(-31+8*n,-35),7,-PI*0.9,PI*0.3,16,Color("8ebdd0"),2,true)
		return
	for ring: int in int(preview.stage):
		var rx: float = aw*(0.34+ring*0.025)
		var points := PackedVector2Array()
		for i: int in 65:
			var angle: float = TAU*i/64.0
			points.append(center+Vector2(cos(angle)*rx,sin(angle)*(32+ring*3)))
		draw_polyline(points,Color(0.72,0.58,0.32,0.16+ring*0.06),1.5,true)
	if int(preview.spirit)>0:
		var spirit := Vector2(aw-5,22)
		draw_circle(spirit,10,Color(0.45,0.75,0.86,0.22))
		draw_colored_polygon(PackedVector2Array([spirit+Vector2(0,-9),spirit+Vector2(5,0),spirit+Vector2(0,8),spirit+Vector2(-5,0)]),Color("77bacb"))
		for i: int in mini(3,1+int(preview.spirit)/4): draw_circle(spirit+Vector2(-13+i*6,14),1.8,GOLD)
	for i: int in int(preview.stars):
		var star := Vector2(center.x+(i-(float(preview.stars)-1)*0.5)*9,104)
		draw_colored_polygon(PackedVector2Array([star+Vector2(0,-3),star+Vector2(3,0),star+Vector2(0,3),star+Vector2(-3,0)]),GOLD)
