class_name GameTheme
extends RefCounted

const INK := Color("173a48")
const DEEP := Color("183e4c")
const PANEL := Color("e6eff3")
const JADE := Color("386c77")
const GOLD := Color("a87d3e")
const TEXT := Color("294b55")
const MUTED := Color("677f80")
const RED := Color("a45138")
const PAPER := Color("d9e7ef")
const LIGHT := Color("fcf6df")
const BRIGHT_GOLD := Color("ead28d")
static var heading_font: Font
static var skin_cache: Dictionary={}
const Silk = preload("res://scripts/game_silk_style.gd")

static func display_font() -> Font:
	if heading_font == null:
		if ResourceLoader.exists("res://assets/fonts/mashanzheng/MaShanZheng-Regular.ttf"):
			var brush: FontFile=load("res://assets/fonts/mashanzheng/MaShanZheng-Regular.ttf").duplicate()
			brush.fallbacks=[load("res://assets/fonts/NotoSerifSC-Regular.otf"),load("res://assets/fonts/NotoSansSC-Regular.otf")]
			heading_font=brush
		else: heading_font=load("res://assets/fonts/NotoSerifSC-Regular.otf")
	return heading_font

static func silk(role: String="panel",tint: Color=PANEL,pad: int=6,active: bool=false) -> StyleBox:
	var style: StyleBox=Silk.new()
	style.set("role",role)
	style.set("color",tint)
	style.set("emphasized",active)
	style.set_content_margin_all(pad)
	return style

static func style_tab(node: Button,active: bool=false,pad: int=4) -> void:
	node.set_meta("silk_tab",true)
	for state: String in ["normal","hover","pressed","disabled","focus"]:
		node.add_theme_stylebox_override(state,silk("tab",JADE,pad,active or state in ["hover","focus"]))
	for key: String in ["font_color","font_hover_color","font_pressed_color"]: node.add_theme_color_override(key,INK if active else TEXT)
	node.add_theme_color_override("font_disabled_color",INK if active else MUTED)
	node.add_theme_font_override("font",display_font())

static func refine_node(node: Node) -> void:
	# Dynamic sheets share the same material; geometry and game-board semantics stay intact.
	if not is_instance_valid(node) or not node.is_inside_tree(): return
	# New scene-local themes own their typography and skins. Legacy pages (including
	# recruitment) deliberately keep the exact pre-existing refinement path.
	var scope: Node = node
	while scope != null:
		if scope.get_meta("ui_foundation",false): return
		scope = scope.get_parent()
	if node is Label and node.get_theme_font_size("font_size")>=20: node.add_theme_font_override("font",display_font())
	if node is PanelContainer:
		var old: StyleBox=node.get_theme_stylebox("panel")
		if old is StyleBoxFlat:
			var style: StyleBox=silk("panel",old.bg_color,0)
			for side: int in [SIDE_LEFT,SIDE_TOP,SIDE_RIGHT,SIDE_BOTTOM]: style.set_content_margin(side,old.get_content_margin(side))
			node.add_theme_stylebox_override("panel",style)
	if not node is Button or node is CheckButton or node is CheckBox: return
	if str(node.name).begins_with("SharedGear_") or node.has_node("Art"): return
	if node.text.is_empty() or node.has_meta("silk_tab"): return
	if node.get_theme_font_size("font_size")>=12: node.add_theme_font_override("font",display_font())
	for state: String in ["normal","hover","pressed","disabled"]:
		var old: StyleBox=node.get_theme_stylebox(state)
		if not old is StyleBoxFlat or old.bg_color.a<0.02: continue
		if node.get_combined_minimum_size().x>0 and node.get_combined_minimum_size().x<40 and node.get_combined_minimum_size().y<34: continue
		var tint: Color=old.bg_color
		var style: StyleBox=silk("ribbon",tint,0,tint.get_luminance()<0.35)
		for side: int in [SIDE_LEFT,SIDE_TOP,SIDE_RIGHT,SIDE_BOTTOM]: style.set_content_margin(side,old.get_content_margin(side))
		node.add_theme_stylebox_override(state,style)

static func art_path(path: String) -> String:
	if not path.begins_with("res://assets/ui/"): return path
	var key: String=path.get_file().get_basename()
	var aliases: Dictionary={"ticket":"summon","herb":"herb","material":"stone","gear":"treasure","roster":"heroes","cloud":"adventure","stages":"adventure","estate":"home","affairs":"tasks"}
	key=str(aliases.get(key,key))
	var painted: String="res://assets/ui-v08/icon-%s.png" % key
	if ResourceLoader.exists(painted): return painted
	var vector: String="res://assets/ui-v08/%s.svg" % key
	if ResourceLoader.exists(vector): return vector
	return path

static func skin(material: String="button",pad: int=10) -> StyleBox:
	if material in ["panel","jade-panel","button","button-jade","button-gold"]:
		return silk("panel" if material.contains("panel") else "ribbon",DEEP if material=="jade-panel" else JADE if material=="button-jade" else Color("e5c27e") if material=="button-gold" else PANEL,pad,material in ["button-jade","button-gold"])
	var style := StyleBoxTexture.new()
	var materials: Dictionary={"panel":"panel-paper","jade-panel":"panel-jade","button":"button-gold","button-jade":"button-jade","button-gold":"button-gold"}
	var path: String="res://assets/ui-v08/%s.svg" % str(materials.get(material,material))
	if not materials.has(material): path="res://assets/ui-v06/%s.svg" % material
	if not ResourceLoader.exists(path): path="res://assets/ui-v06/%s.svg" % material
	if not skin_cache.has(path): skin_cache[path]=load(path)
	style.texture=skin_cache[path]
	var panel: bool=material.contains("panel")
	for side: int in [SIDE_LEFT,SIDE_RIGHT]: style.set_texture_margin(side,48 if panel else 44)
	for side: int in [SIDE_TOP,SIDE_BOTTOM]: style.set_texture_margin(side,42 if panel else 9)
	if material=="button": style.modulate_color=Color(0.90,0.96,0.91)
	style.set_content_margin_all(pad)
	return style

static func style_button(node: Button,primary: bool=false,pad: int=10) -> void:
	node.add_theme_font_override("font",display_font())
	node.add_theme_stylebox_override("normal",skin("button-jade" if primary else "button",pad))
	var hover: StyleBox = skin("button-jade" if primary else "button",pad)
	if hover is StyleBoxTexture: hover.modulate_color=Color(1.08,1.08,1.02)
	elif hover is StyleBoxFlat: hover.bg_color=Color("edf5f8")
	elif hover is GameSilkStyle: hover.color=hover.color.lightened(0.12)
	node.add_theme_stylebox_override("hover",hover)
	var pressed: StyleBox = skin("button-jade" if primary else "button",pad)
	if pressed is StyleBoxTexture: pressed.modulate_color=Color(0.86,0.91,0.86)
	elif pressed is StyleBoxFlat: pressed.bg_color=Color("bdced9")
	elif pressed is GameSilkStyle: pressed.color=pressed.color.darkened(0.12)
	node.add_theme_stylebox_override("pressed",pressed)
	node.add_theme_color_override("font_color",LIGHT if primary else TEXT)
	node.add_theme_color_override("font_hover_color",LIGHT if primary else INK)
	node.add_theme_color_override("font_pressed_color",LIGHT if primary else INK)
	node.add_theme_color_override("font_disabled_color",MUTED)

static func box(color: Color, border: Color = Color.TRANSPARENT, radius: int = 14, pad: int = 14) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1 if border.a > 0 else 0)
	style.set_corner_radius_all(radius)
	style.set_content_margin_all(pad)
	return style

static func create() -> Theme:
	var t: Theme = Theme.new()
	for path: String in ["res://assets/fonts/NotoSansSC-Regular.otf", "res://assets/fonts/NotoSansCJKsc-Regular.otf", "res://assets/fonts/NotoSansSC.ttf"]:
		if ResourceLoader.exists(path):
			t.default_font = load(path)
			break
	t.default_font_size = 17
	t.set_color("font_color", "Label", TEXT)
	t.set_color("font_color", "Button", TEXT)
	t.set_color("font_hover_color", "Button", JADE)
	t.set_color("font_disabled_color", "Button", Color("94917e"))
	t.set_stylebox("normal", "Button", skin("button",10))
	t.set_stylebox("hover", "Button", skin("button-gold",10))
	t.set_stylebox("pressed", "Button", box(Color("b9cedb"), GOLD, 8, 10))
	t.set_stylebox("disabled", "Button", box(Color("d1dde5"), Color("a0b3be"), 8, 10))
	t.set_stylebox("focus", "Button", box(Color.TRANSPARENT, JADE, 8, 0))
	t.set_stylebox("panel", "PanelContainer",skin("panel",14))
	for state: String in ["normal","hover","pressed","disabled"]:
		t.set_stylebox(state,"OptionButton",silk("ribbon",PANEL.lightened(0.06) if state=="hover" else PANEL.darkened(0.08) if state=="pressed" else PANEL,6))
	t.set_font("font","OptionButton",display_font())
	t.set_color("font_color","OptionButton",TEXT)
	t.set_color("font_hover_color","OptionButton",INK)
	t.set_color("font_pressed_color","OptionButton",INK)
	t.set_stylebox("focus","OptionButton",silk("tab",JADE,0,true))
	t.set_stylebox("normal", "LineEdit", box(PANEL, Color("96aeba"),7,12))
	t.set_stylebox("normal", "TextEdit", box(PANEL, Color("96aeba"),7,12))
	t.set_stylebox("panel", "PopupMenu",box(PANEL,GOLD,7,6))
	t.set_stylebox("hover", "PopupMenu",box(Color("c1d8e5"),Color.TRANSPARENT,4,2))
	t.set_color("font_color","PopupMenu",TEXT)
	t.set_color("font_hover_color","PopupMenu",INK)
	t.set_color("font_color", "LineEdit", TEXT)
	t.set_color("font_color", "TextEdit", TEXT)
	t.set_color("font_color", "CheckButton", TEXT)
	t.set_constant("separation", "VBoxContainer", 12)
	t.set_constant("separation", "HBoxContainer", 8)
	t.set_constant("h_separation", "GridContainer", 10)
	t.set_constant("v_separation", "GridContainer", 10)
	t.set_stylebox("background", "ProgressBar", box(Color("bacdd9"), Color.TRANSPARENT, 4, 0))
	t.set_stylebox("fill", "ProgressBar", box(JADE, Color.TRANSPARENT, 4, 0))
	return t

static func label(text: String, font_size: int = 17, color: Color = TEXT) -> Label:
	var node: Label = Label.new()
	node.text = GameNames.text(text)
	node.add_theme_font_size_override("font_size", font_size)
	if font_size>=21:
		node.add_theme_font_override("font",display_font())
	node.add_theme_color_override("font_color", color)
	node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node

static func button(text: String, callback: Callable, primary: bool = false, disabled: bool = false) -> Button:
	var node: Button = Button.new()
	node.text = GameNames.text(text)
	node.custom_minimum_size.y = 48
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	node.disabled = disabled
	node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	style_button(node,primary)
	node.pressed.connect(callback)
	return node
