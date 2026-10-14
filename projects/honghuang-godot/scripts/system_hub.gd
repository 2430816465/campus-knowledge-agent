class_name SystemHub
extends RefCounted
const Art = preload("res://scripts/game_illustrated_icon.gd")
const AREAS = ["修行","仙府","神仙","历练","仙盟"]
static var _catalog: Array=[]
static func catalog() -> Array:
	if _catalog.is_empty():
		var parsed: Variant=JSON.parse_string(FileAccess.get_file_as_string("res://data/system-catalog.json"))
		if parsed is Array: _catalog=parsed
	return _catalog
static func icon_for(id: String) -> String:
	var n: int=int(id)
	var individual: Dictionary={1:"forge",2:"gourd",3:"treasure",4:"fire",5:"meditation",6:"armor",7:"tower",8:"taiji",9:"scroll",10:"friends",11:"crown",12:"beast",13:"lotus",14:"pendant",15:"seal",16:"bracelet",17:"fan",18:"taiji",19:"friends",20:"summon",21:"rank"}
	if individual.has(n): return str(individual[n])
	if n<=4: return "forge"
	if n<=11: return "meditation"
	if n<=16: return "beast"
	if n<=18: return "taiji"
	if n<=21: return "friends"
	if n<=29: return "treasure"
	if n<=36: return "tower"
	if n<=42: return "estate"
	if n<=46: return "chest"
	if n<=54: return "battle"
	if n<=66: return "guild"
	if n<=82: return "events"
	return "gift"
static func build(g: Control,parent: Node) -> void:
	g.button(parent,"新玩法框架 · 阵容／仙府／挑战",g._framework_page.bind("阵容"))
	var areas: HBoxContainer=g.row(parent)
	for area: String in AREAS:
		var b: Button=g.button(areas,area,func()->void: g.system_area=area; g.system_category=""; g._render(),g.system_area==area)
		b.custom_minimum_size=Vector2(0,36)
		GameTheme.style_tab(b,g.system_area==area)
		b.add_theme_font_size_override("font_size",14)
	var categories: Array[String]=[]
	for entry: Dictionary in catalog():
		if entry.area==g.system_area and not categories.has(str(entry.category)): categories.append(str(entry.category))
	if not categories.has(g.system_category): g.system_category=categories[0] if not categories.is_empty() else ""
	var strip := GridContainer.new()
	strip.columns=mini(4,maxi(1,categories.size()))
	strip.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	parent.add_child(strip)
	for category: String in categories:
		var b: Button=g.button(strip,category,func()->void: g.system_category=category; g._render(),g.system_category==category)
		b.custom_minimum_size=Vector2(0,34)
		GameTheme.style_tab(b,g.system_category==category)
		b.add_theme_font_size_override("font_size",13)
		b.clip_text=true
		b.tooltip_text=category
	var grid := GridContainer.new()
	grid.columns=3
	grid.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation",12)
	grid.add_theme_constant_override("v_separation",10)
	parent.add_child(grid)
	for entry: Dictionary in catalog():
		if entry.area!=g.system_area or entry.category!=g.system_category: continue
		var title: String=str(entry.name).split("／")[0]
		var b: Button=Art.button(grid,title,icon_for(str(entry.id)),g._systems_page.bind(str(entry.id)),false,false)
		b.custom_minimum_size=Vector2(70,82)
		b.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		b.tooltip_text=title
	var hint: Label=g.label(parent,"选择图标进入玩法 · 培养与奖励自动保存",13,GameTheme.MUTED)
	hint.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	g.button(parent,"回到修行",g._go.bind(5))
