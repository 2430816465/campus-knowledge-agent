class_name SummonResults
extends Control
## Presentation only. Records arrive from the already committed summon journal.
signal closed
enum View { PORTRAIT, CARDS }
const EDGE_FADE=preload("res://assets/summon-remotion/portrait.gdshader")
var records: Array=[]
var index: int=0
var view: View=View.CARDS
var sequential: bool=false
var reduced: bool=false
var content: Control
var background: TextureRect
var time: float=0
var age: float=0
var transitioning: bool=false
var cards: Array[Button]=[]
var actions: Array[Button]=[]

class FateCard extends Button:
	var record: Dictionary
	var hero: Dictionary
	var portrait: Texture2D
	var order: int=0
	func _ready() -> void:
		text=""; mouse_default_cursor_shape=Control.CURSOR_POINTING_HAND
		texture_filter=CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		for state: String in ["normal","hover","pressed","focus"]: add_theme_stylebox_override(state,StyleBoxEmpty.new())
		mouse_entered.connect(queue_redraw); mouse_exited.connect(queue_redraw); focus_entered.connect(queue_redraw); focus_exited.connect(queue_redraw)
		resized.connect(queue_redraw)
	func _draw() -> void:
		if portrait==null: return
		var w: float=size.x; var h: float=size.y
		var color: Color=SummonMovie.quality_color(SummonMovie.quality([record])).lerp(Color("eef2df"),0.38)
		var path:=PackedVector2Array([Vector2(9,0),Vector2(w-9,0),Vector2(w,10),Vector2(w,h-12),Vector2(w-12,h),Vector2(12,h),Vector2(0,h-12),Vector2(0,10),Vector2(9,0)])
		draw_colored_polygon(path,Color("183e4c"))
		var compact: bool=h<125
		var footer: float=38 if compact else 53
		var dest:=Rect2(3,7,w-6,h-footer-7)
		var source_size:=Vector2(portrait.get_width(),portrait.get_height())
		var aspect: float=dest.size.x/maxf(1,dest.size.y)
		var crop_size:=Vector2(minf(source_size.x,source_size.y*aspect),minf(source_size.y,source_size.x/aspect))
		# Cover the card without sampling beyond the source. Compact cards retain the face.
		var crop_origin:=Vector2((source_size.x-crop_size.x)/2,clampf(source_size.y*.24-crop_size.y/2,0,source_size.y-crop_size.y))
		draw_texture_rect_region(portrait,dest,Rect2(crop_origin,crop_size))
		draw_rect(Rect2(3,h-footer,w-6,footer-5),Color("143c4cec"))
		draw_polyline(path,Color(color,0.85),1.6 if is_hovered() or has_focus() else 0.9,true)
		# Hanging seal and jewels give cards an identity beyond a generic rectangle.
		draw_line(Vector2(w/2,0),Vector2(w/2,9),color,1,true)
		draw_colored_polygon(PackedVector2Array([Vector2(w/2,4),Vector2(w/2+5,9),Vector2(w/2,14),Vector2(w/2-5,9)]),color)
		var f: Font=GameTheme.display_font(); var fs: int=clampi(int(w/6),10,18)
		var title: String=str(hero.name)
		var tw: float=f.get_string_size(title,HORIZONTAL_ALIGNMENT_LEFT,-1,fs).x
		draw_string(f,Vector2((w-tw)/2,h-(20 if compact else 26)),title,HORIZONTAL_ALIGNMENT_LEFT,-1,fs,Color("fff3ce"))
		var note: String="首次结缘" if not record.get("duplicate",false) else "仙缘 +%d" % int(record.get("fate",0))
		var small: int=maxi(9,fs-4)
		draw_string(f,Vector2((w-f.get_string_size(note,HORIZONTAL_ALIGNMENT_LEFT,-1,small).x)/2,h-(7 if compact else 10)),note,HORIZONTAL_ALIGNMENT_LEFT,-1,small,Color("cde0df"))
		for j: int in int(hero.stars): draw_circle(Vector2(w/2+(j-(int(hero.stars)-1)/2.0)*7,h-(31 if compact else 44)),1.6,color)
		if not record.get("duplicate",false):
			draw_colored_polygon(PackedVector2Array([Vector2(2,18),Vector2(22,18),Vector2(18,37),Vector2(2,33)]),Color("bf684d"))
			draw_string(f,Vector2(6,31),"新",HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color("fff4dc"))
		draw_line(Vector2(8,h-3),Vector2(w-8,h-3),Color(color,.5),1,true)

func configure(items: Array,play_portraits: bool=false,simplified: bool=false,selected: int=0) -> void:
	records=items.duplicate(true); reduced=simplified; index=clampi(selected,0,maxi(0,items.size()-1))
	sequential=play_portraits; view=View.PORTRAIT if play_portraits else View.CARDS
func _ready() -> void:
	name="SummonResults"; set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter=Control.MOUSE_FILTER_STOP
	background=TextureRect.new(); background.texture=SummonMovie.LAST
	background.expand_mode=TextureRect.EXPAND_IGNORE_SIZE; background.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_COVERED
	# Preserve the same graded real tail frame through the portrait entrance.
	var grade:=ShaderMaterial.new(); grade.shader=SummonMovie.PORTAL
	var overall: String=SummonMovie.quality(records)
	grade.set_shader_parameter("rarity_color",SummonMovie.quality_color(overall))
	grade.set_shader_parameter("mythic_power",1.0 if overall=="gold" else 0.0)
	grade.set_shader_parameter("reveal",1.0)
	grade.set_shader_parameter("media_phase",SummonMovie.DURATION-SummonMovie.FRAME_STEP-SummonMovie.REVEAL_AT)
	background.material=grade
	background.modulate=Color.WHITE if sequential and not reduced else Color(.61,.75,.77)
	background.mouse_filter=Control.MOUSE_FILTER_IGNORE
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); add_child(background)
	content=Control.new(); content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); add_child(content)
	resized.connect(_build); _build()
func _process(delta: float) -> void:
	if not visible or not get_window().has_focus(): return
	time+=minf(delta,.1); age+=minf(delta,.1); queue_redraw()
	if sequential and not reduced: background.modulate=Color.WHITE.lerp(Color(.61,.75,.77),smoothstep(0.0,0.40,time))
func _draw() -> void:
	# Local, translucent silk veils frame the scene; no boxed panel.
	var entrance: float=smoothstep(0.0,0.40,time) if sequential and not reduced else 1.0
	for i: int in 18:
		var p: float=float(i)/18
		draw_rect(Rect2(0,size.y*p,size.x,size.y/18+1),Color(.03,.11,.15,(.12+.23*pow(absf(p-.47)*2,1.7))*entrance))
	var color: Color=Color("c9e0d9")
	if not records.is_empty(): color=SummonMovie.quality_color(SummonMovie.quality([records[index]])).lerp(Color("ecede0"),.6)
	var center:=Vector2(size.x*.5,size.y*.43)
	if view==View.PORTRAIT:
		for r: float in [size.x*.32,size.x*.34,size.x*.39]: draw_arc(center,r,0,TAU,90,Color(color,.25),1,true)
		for i: int in 12:
			var a: float=i*TAU/12+(0 if reduced else time*.025)
			var p:=center+Vector2(cos(a),sin(a))*size.x*.39
			draw_colored_polygon(PackedVector2Array([p+Vector2(0,-4),p+Vector2(3,0),p+Vector2(0,4),p+Vector2(-3,0)]),Color(color,.7))
	for x: float in [size.x*.08,size.x*.92]:
		draw_line(Vector2(x,size.y*.13),Vector2(x,size.y*.85),Color("e2d5aa30"),1,true)
		for y: float in [size.y*.13,size.y*.85]: draw_arc(Vector2(x,y),10,0,PI,16,Color("eadcaa88"),1,true)
func _clear() -> void:
	for child: Node in content.get_children(): content.remove_child(child); child.queue_free()
	cards.clear(); actions.clear(); age=0; transitioning=false
func _text(value: String,pos: Vector2,extent: Vector2,fs: int,color: Color=Color("fff4d8")) -> Label:
	var label: Label=GameTheme.label(value,fs,color); label.position=pos; label.size=extent
	label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER; label.vertical_alignment=VERTICAL_ALIGNMENT_CENTER
	label.add_theme_color_override("font_outline_color",Color("143744")); label.add_theme_constant_override("outline_size",3)
	label.add_theme_font_override("font",GameTheme.display_font()); label.mouse_filter=Control.MOUSE_FILTER_IGNORE
	content.add_child(label); return label
func _action(value: String,pos: Vector2,extent: Vector2,callback: Callable,primary: bool=false) -> Button:
	var b: Button=GameTheme.button(value,callback,primary); b.position=pos; b.size=extent; b.custom_minimum_size=Vector2.ZERO
	GameTheme.style_button(b,primary,2); b.add_theme_font_size_override("font_size",18 if size.x>400 else 14)
	b.name="Action_"+value; content.add_child(b); actions.append(b); return b
func _build() -> void:
	if not is_instance_valid(content) or size.x<20: return
	_clear()
	if records.is_empty(): _text("尚未取得召请结果",Vector2(0,size.y*.4),Vector2(size.x,60),26); return
	if view==View.PORTRAIT: _portrait()
	else: _overview()
	if not reduced:
		content.modulate.a=0; var tw:=create_tween(); tw.tween_property(content,"modulate:a",1.0,.28)
	else: content.modulate.a=1
	queue_redraw()
func _portrait() -> void:
	var record: Dictionary=records[index]; var hero: Dictionary=GameData.character(str(record.id))
	var rarity: String=SummonMovie.quality([record]); var color: Color=SummonMovie.quality_color(rarity).lerp(Color.WHITE,.35)
	_text("仙门结缘",Vector2(0,size.y*.035),Vector2(size.x,55),34)
	_text("%s · %d / %d" % ["依次揭晓" if sequential else "法相详情",index+1,records.size()],Vector2(0,size.y*.095),Vector2(size.x,28),15,Color("cee4e0"))
	var art:=TextureRect.new(); art.name="ResultPortrait_"+str(hero.id)
	art.texture=load("res://assets/portraits/%s-premium.webp" % hero.id)
	art.expand_mode=TextureRect.EXPAND_IGNORE_SIZE; art.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.position=Vector2(size.x*.075,size.y*.16); art.size=Vector2(size.x*.85,size.y*.59)
	var shader:=ShaderMaterial.new(); shader.shader=EDGE_FADE; art.material=shader; art.mouse_filter=Control.MOUSE_FILTER_IGNORE
	content.add_child(art); content.move_child(art,0)
	_text("%s · %d星" % [SummonMovie.quality_name(rarity),hero.stars],Vector2(0,size.y*.70),Vector2(size.x,33),20,color)
	_text(str(hero.name),Vector2(0,size.y*.745),Vector2(size.x,64),44 if size.x>400 else 34)
	_text(str(hero.faction),Vector2(0,size.y*.816),Vector2(size.x,28),19,Color("cde0df"))
	var note: String="新结缘 · 道缘 +%d" % int(record.get("fate",0)) if not record.get("duplicate",false) else "重复转化 +%d道缘 · 基础 +1 · 合计 +%d" % [maxi(0,int(record.get("fate",1))-1),int(record.get("fate",1))]
	_text(note,Vector2(0,size.y*.859),Vector2(size.x,28),15 if size.x>400 else 11)
	_action("全部结果",Vector2(size.x*.08,size.y*.914),Vector2(size.x*.35,44),show_cards)
	_action("下一位" if sequential and index<records.size()-1 else "查看全部",Vector2(size.x*.55,size.y*.914),Vector2(size.x*.37,44),advance,true)
func _overview() -> void:
	_text("万仙来朝" if records.size()>1 else "仙缘已至",Vector2(0,size.y*.04),Vector2(size.x,68),46 if size.x>400 else 34)
	_text("%d次召请 · 仙缘汇聚" % records.size(),Vector2(0,size.y*.116),Vector2(size.x,28),18,Color("d1e5df"))
	var cols: int=5 if size.x>=400 else 4
	if records.size()==1: cols=1
	var rows: int=int(ceil(float(records.size())/cols))
	var gap: float=8 if size.x>=400 else 5
	var w: float=minf(188,(size.x*.88-gap*(cols-1))/cols)
	var h: float=minf(w*2.30,(size.y*.63-gap*(rows-1))/rows)
	var left: float=(size.x-(cols*w+(cols-1)*gap))/2
	var top: float=size.y*.20+(size.y*.63-(rows*h+(rows-1)*gap))/2
	for i: int in records.size():
		var card:=FateCard.new(); card.name="ResultCard_%02d" % i; card.order=i; card.record=records[i]
		card.hero=GameData.character(str(records[i].id)); card.portrait=load("res://assets/portraits/%s-premium.webp" % card.hero.id)
		var col: int=i%cols; var row: int=i/cols
		var row_count: int=mini(cols,records.size()-row*cols)
		var row_left: float=left if row_count==cols else (size.x-(row_count*w+(row_count-1)*gap))/2
		var target:=Vector2(row_left+col*(w+gap),top+row*(h+gap)+(0 if col%2==0 else -5))
		card.position=target; card.size=Vector2(w,h); card.pivot_offset=card.size/2
		card.rotation=deg_to_rad((col-(cols-1)*.5)*.42); card.tooltip_text="%s · %s · %d星 · %s" % [card.hero.name,card.hero.faction,card.hero.stars,"首次结缘" if not card.record.get("duplicate",false) else "重复转化已入账"]
		card.pressed.connect(show_detail.bind(i)); content.add_child(card); cards.append(card)
		if not reduced:
			card.position.y+=24; card.modulate.a=0
			var tw:=card.create_tween(); tw.tween_interval(i*.045); tw.set_parallel(true)
			tw.tween_property(card,"position",target,.38).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			tw.tween_property(card,"modulate:a",1.0,.25)
	var total: int=0
	for record: Dictionary in records: total+=int(record.get("fate",0))
	_text("道缘合计 +%d · 点击法相查看详情" % total,Vector2(0,size.y*.852),Vector2(size.x,30),16 if size.x>400 else 12,Color("d8e5df"))
	_action("返回召请",Vector2(size.x*.29,size.y*.914),Vector2(size.x*.42,44),func() -> void: closed.emit(),true)
	if not cards.is_empty(): cards[0].grab_focus()
func advance() -> void:
	if age<.16 or transitioning: return
	transitioning=true
	if sequential and index<records.size()-1: index+=1; _build()
	else: show_cards()
func show_cards() -> void:
	view=View.CARDS; sequential=false; _build()
func show_detail(value: int) -> void:
	index=clampi(value,0,records.size()-1); sequential=false; view=View.PORTRAIT; _build()
func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		if view==View.PORTRAIT: show_cards()
		else: closed.emit()
	elif event.is_action_pressed("ui_accept") and view==View.PORTRAIT:
		get_viewport().set_input_as_handled(); advance()
