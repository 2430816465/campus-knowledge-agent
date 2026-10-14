class_name SummonScreen
extends Control
## Single-screen presentation. Atomic cost/RNG/pity remain in GameStore.
const PAPER := Color("e6eff0")
const INK := Color("234b5d")
const FADED := Color("617f88")
const VERMILION := Color("397f8f")
const GOLD := Color("ac8d53")
const LIGHT := Color("f1f4e8")
const Cinematic = preload("res://scripts/summon_cinematic.gd")
const Movie = preload("res://scripts/summon_movie.gd")
const Results = preload("res://scripts/summon_results.gd")
const DRAW_LOCK: StringName = &"summon_presentation_busy"
const ACTIVE_CINEMATIC: StringName = &"summon_cinematic"
var app: Variant
var mode := "permanent"
var star_filter := 0
var exchange_page := 0
var banner: Control
var banner_picture: TextureRect
var banner_card: Control
var banner_copy: VBoxContainer
var banner_art: Texture2D
var banner_avatar: Texture2D
var column: VBoxContainer
var busy := false
var last_budget := -1.0
var compact_layout := false

func _readable_text(node: Control) -> void:
	node.add_theme_color_override("font_color",Color("fff4d8"))
	node.add_theme_color_override("font_hover_color",Color.WHITE)
	node.add_theme_color_override("font_pressed_color",Color("ffe2a2"))
	node.add_theme_color_override("font_outline_color",Color("163642"))
	node.add_theme_constant_override("outline_size",3)
	node.add_theme_color_override("font_shadow_color",Color("071d29aa"))
	node.add_theme_constant_override("shadow_offset_y",2)
# Shared by AdventureScreen; the summon page itself uses lighter accents.
class OrnamentalFrame extends Control:
	func _ready() -> void:
		mouse_filter=Control.MOUSE_FILTER_IGNORE
		resized.connect(queue_redraw)
	func _draw() -> void:
		var gold := Color("b9914a")
		var dark := Color("426a80")
		draw_line(Vector2(24,3),Vector2(size.x-24,3),Color(gold,0.65),1,true)
		draw_line(Vector2(24,size.y-3),Vector2(size.x-24,size.y-3),Color(gold,0.45),1,true)
		for corner: Vector2 in [Vector2(3,3),Vector2(size.x-3,3),Vector2(3,size.y-3),size-Vector2(3,3)]:
			var sign := Vector2(1 if corner.x<size.x/2 else -1,1 if corner.y<size.y/2 else -1)
			draw_polyline(PackedVector2Array([corner+Vector2(0,18)*sign,corner,corner+Vector2(18,0)*sign]),dark,3,true)
			var center: Vector2=corner+Vector2(10,10)*sign
			draw_colored_polygon(PackedVector2Array([center+Vector2(0,-3),center+Vector2(3,0),center+Vector2(0,3),center+Vector2(-3,0)]),gold)
class BannerAccents extends Control:
	func _ready() -> void:
		mouse_filter=Control.MOUSE_FILTER_IGNORE
		resized.connect(queue_redraw)
	func _draw() -> void:
		var gold := Color("ac8d5366")
		draw_line(Vector2(18,size.y-1),Vector2(size.x-18,size.y-1),gold,1,true)
		for x: float in [14.0,size.x-14.0]:
			var center := Vector2(x,size.y-1)
			draw_colored_polygon(PackedVector2Array([center+Vector2(0,-2),center+Vector2(3,0),center+Vector2(0,2),center+Vector2(-3,0)]),gold)
static func build(application: Node,parent: Node) -> SummonScreen:
	var screen := SummonScreen.new()
	screen.name="SummonScreen"
	screen.app=application
	screen.mode=str(application.get_meta("summon_v05_mode","permanent"))
	parent.add_child(screen)
	return screen
func _ready() -> void:
	size_flags_horizontal=Control.SIZE_EXPAND_FILL
	busy=bool(app.get_meta(DRAW_LOCK,false))
	resized.connect(_layout_page)
	_rebuild()
	_layout_page.call_deferred()
func _height_budget() -> float:
	if not is_inside_tree(): return 580
	if app.has_meta("page_content_height"): return maxf(280,float(app.get_meta("page_content_height")))
	var scroll: Variant=app.get("body_scroll")
	if scroll is Control and scroll.size.y>100:
		return maxf(280,scroll.size.y-(get_global_rect().position.y-scroll.get_global_rect().position.y)-18)
	return maxf(400,get_viewport_rect().size.y-210)
func _process(_delta: float) -> void:
	if is_instance_valid(column) and absf(_height_budget()-last_budget)>2: _layout_page()
func _compact() -> bool:
	return _height_budget()<620 or (size.x>0 and size.x<380)
func _layout_page() -> void:
	if not is_inside_tree() or not is_instance_valid(column): return
	if compact_layout!=(_compact()):
		_rebuild()
		return
	last_budget=_height_budget()
	custom_minimum_size.y=last_budget
	column.position=Vector2.ZERO
	column.size=Vector2(size.x,last_budget)
	if mode=="permanent" and is_instance_valid(banner):
		var controls_height: float=0
		for child: Control in column.get_children():
			if child!=banner: controls_height+=child.get_combined_minimum_size().y
		controls_height+=float(column.get_child_count()-1)*column.get_theme_constant("separation")
		banner.custom_minimum_size.y=maxf(78 if last_budget<430 else 150,last_budget-controls_height)
		_layout_banner()
	elif mode=="exchange":
		var other_height: float=float(column.get_child_count()-1)*column.get_theme_constant("separation")+6
		for child: Control in column.get_children():
			if child.name!="ExchangePage": other_height+=child.get_combined_minimum_size().y
		for card: Node in column.find_children("ExchangeCard_*","Button",true,false):
			card.custom_minimum_size.y=maxf(64,(last_budget-other_height)/2.0)
func _label(parent: Node,text: String,fs: int=16,color: Color=INK) -> Label:
	var node: Label=GameTheme.label(text,fs,color)
	parent.add_child(node)
	return node
func _button(parent: Node,text: String,callback: Callable,primary: bool=false,disabled: bool=false,height: float=36) -> Button:
	var node: Button=GameTheme.button(text,callback,primary,disabled)
	node.custom_minimum_size.y=height
	node.add_theme_font_size_override("font_size",14)
	node.add_theme_color_override("font_color",LIGHT if primary else INK)
	node.add_theme_color_override("font_hover_color",LIGHT if primary else VERMILION)
	node.add_theme_color_override("font_disabled_color",Color("8a9187"))
	GameTheme.style_button(node,primary,3 if _compact() else 5)
	node.add_theme_stylebox_override("disabled",GameTheme.box(Color("d3e0df"),Color("9aafb0"),5,3 if _compact() else 5))
	parent.add_child(node)
	return node
func _row(parent: Node) -> HBoxContainer:
	var node := HBoxContainer.new()
	node.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	node.add_theme_constant_override("separation",6)
	parent.add_child(node)
	return node
func _panel(parent: Node) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel",GameTheme.box(Color("e4eef0d9"),Color("93b4bc55"),4,5 if _compact() else 10))
	parent.add_child(panel)
	var box := VBoxContainer.new()
	box.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation",2 if _compact() else 4)
	panel.add_child(box)
	return box
func _rebuild() -> void:
	compact_layout=_compact()
	for child: Node in get_children(): remove_child(child); child.queue_free()
	banner=null
	column=VBoxContainer.new()
	column.name="SingleScreenContent"
	column.add_theme_constant_override("separation",4 if _compact() else 8)
	add_child(column)
	_summon_header()
	var tabs: HBoxContainer=_row(column)
	tabs.add_theme_constant_override("separation",10)
	var summon_tab := _button(tabs,"常驻召请",_set_mode.bind("permanent"),mode=="permanent",false,30 if _compact() else 40)
	GameTheme.style_tab(summon_tab,mode=="permanent")
	_readable_text(summon_tab)
	var exchange_tab := _button(tabs,"道缘 · 定向兑换",_set_mode.bind("exchange"),mode=="exchange",false,30 if _compact() else 40)
	GameTheme.style_tab(exchange_tab,mode=="exchange")
	_readable_text(exchange_tab)
	if mode=="exchange": _exchange_content()
	else: _permanent_content()
	_layout_page()
func _set_mode(value: String) -> void:
	mode=value
	app.set_meta("summon_v05_mode",value)
	_rebuild()
func _summon_header() -> void:
	var top := _row(column)
	top.custom_minimum_size.y=46
	var back := _button(top,"‹  返回",func()->void: app._go(5),false,false,42)
	back.size_flags_horizontal=Control.SIZE_SHRINK_BEGIN
	back.autowrap_mode=TextServer.AUTOWRAP_OFF
	back.add_theme_stylebox_override("normal",StyleBoxEmpty.new())
	_readable_text(back)
	var spacer := Control.new(); spacer.size_flags_horizontal=Control.SIZE_EXPAND_FILL; top.add_child(spacer)
	for item: Array in [["ticket","召唤符"],["fate","仙缘"]]:
		var amount := _label(top,"%s %d" % [item[1],app.state().resources[item[0]]],12 if compact_layout else 15,INK)
		amount.size_flags_horizontal=Control.SIZE_SHRINK_END
		amount.autowrap_mode=TextServer.AUTOWRAP_OFF
		amount.vertical_alignment=VERTICAL_ALIGNMENT_CENTER
		amount.add_theme_color_override("font_outline_color",Color("eaf5ef"))
		amount.add_theme_constant_override("outline_size",4)
		_readable_text(amount)

func _permanent_content() -> void:
	var compact := _compact()
	var state: Dictionary=app.state()
	var g: Dictionary=GameEconomy.gacha_config()
	var pool: String = str(state.framework.gacha.selected)
	var pity: int = int(state.pity) if pool == "standard" else int(state.framework.gacha.limitedPity)
	var four: int = int(state.get("fourStarPity",0)) if pool == "standard" else int(state.framework.gacha.limitedFourPity)
	_banner("","","","","")
	var guarantee := _label(column,"%s · 五星最多再 %d 次" % [{"standard":"常驻","limited-new":"通天限定","limited-rerun":"杨戬返场"}[pool],maxi(1,int(g.fiveStarPity)-pity)],14 if compact else 18,INK)
	guarantee.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	guarantee.add_theme_color_override("font_outline_color",Color("eef7f2"))
	guarantee.add_theme_constant_override("outline_size",5)
	_readable_text(guarantee)
	var actions := _row(column)
	actions.alignment=BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation",30 if compact else 68)
	_summon_action(actions,"单次召唤",1,false,busy or not GameEconomy.can_afford(state,{"ticket":1}))
	_summon_action(actions,"十次召唤",10,true,busy or not GameEconomy.can_afford(state,{"ticket":10}))
	var caption := _label(column,"四星或以上最多再 %d 次 · 已累计 %d 抽" % [maxi(1,int(g.fourStarPity)-four),pity],10 if compact else 12,INK)
	caption.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	caption.add_theme_color_override("font_outline_color",Color("eef7f2"))
	caption.add_theme_constant_override("outline_size",4)
	_readable_text(caption)
	if not GameEconomy.free_currency() and int(state.resources.ticket)<10:
		caption.text="十次召唤还需 %d 张召唤符" % (10-int(state.resources.ticket))
	var links := _row(column)
	for entry: Array in [["概率规则",_rules],["召请记录",_history],["卡池图鉴",_pool],["切换卡池",func() -> void: app._framework_page("卡池")]]:
		var link := _button(links,entry[0],entry[1],false,false,38)
		link.add_theme_font_size_override("font_size",12 if compact else 15)
		link.add_theme_stylebox_override("normal",StyleBoxEmpty.new())
		link.add_theme_color_override("font_outline_color",Color("eef7f2"))
		link.add_theme_constant_override("outline_size",4)
		_readable_text(link)

func _summon_action(parent: Node,title: String,count: int,featured: bool,disabled: bool) -> Button:
	var compact := _compact()
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation",0)
	parent.add_child(stack)
	var action := _button(stack,title,draw.bind(app,count),featured,disabled,98 if compact else 140)
	action.name="SummonTen" if featured else "SummonOne"
	action.text="十次\n召唤" if featured else "单次\n召唤"
	action.tooltip_text=title+" · 测试免费" if GameEconomy.free_currency() else "%s · 消耗 %d 张召唤符" % [title,count]
	action.custom_minimum_size.x=104 if compact else 146
	action.add_theme_font_size_override("font_size",23 if compact else 31)
	for state_name: String in ["normal","hover","pressed","disabled"]:
		var style=preload("res://scripts/summon_seal_style.gd").new()
		style.gold=featured
		style.brightness=1.12 if state_name=="hover" else (0.78 if state_name in ["pressed","disabled"] else 1.0)
		style.content_margin_left=2; style.content_margin_right=2
		style.content_margin_top=2; style.content_margin_bottom=2
		action.add_theme_stylebox_override(state_name,style)
	for color_name: String in ["font_color","font_hover_color","font_pressed_color","font_disabled_color"]:
		action.add_theme_color_override(color_name,Color("613d21") if featured else Color("fff0bc"))
	var cost := _label(stack,"测试免费 · 召唤符不消耗" if GameEconomy.free_currency() else "消耗  %d  召唤符" % count,10 if compact else 12,INK)
	cost.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	cost.add_theme_color_override("font_outline_color",Color("eef7f2"))
	cost.add_theme_constant_override("outline_size",4)
	_readable_text(cost)
	return action
func _banner(_id: String,_heading: String,_title: String,_subtitle: String,_note: String) -> void:
	# The full-screen courtyard is drawn by main, never inside the UI banner.
	banner=Control.new()
	banner.name="PremiumBanner"
	banner.mouse_filter=Control.MOUSE_FILTER_IGNORE
	banner.custom_minimum_size.y=maxf(78 if _compact() else 150,_height_budget()-270)
	column.add_child(banner)
	var wish := _button(banner,"心愿\n＋",_wish_content,false,false,80)
	wish.name="CourtyardWish"
	wish.size_flags_horizontal=Control.SIZE_SHRINK_END
	wish.add_theme_font_size_override("font_size",16)
	wish.add_theme_stylebox_override("normal",GameTheme.box(Color("e5f0efb0"),Color("a78d5870"),6,4))
	var selected: Variant=app.state().get("wishlist")
	if selected!=null:
		wish.text="心愿"
		wish.icon=load("res://assets/avatars/%s-premium.webp" % str(selected))
		wish.expand_icon=true
		wish.vertical_icon_alignment=VERTICAL_ALIGNMENT_TOP
		wish.add_theme_constant_override("icon_max_width",46)
	banner.resized.connect(_layout_banner)

func _layout_banner() -> void:
	if not is_instance_valid(banner): return
	var wish: Control=banner.get_node("CourtyardWish")
	wish.position=Vector2(maxf(0,banner.size.x-64),20)
	wish.size=Vector2(60,86)
func _exchange_content() -> void:
	var compact := _compact()
	_label(column,"直接兑换所选角色 · 不进行随机抽取",11 if compact else 14,VERMILION)
	var filters: HBoxContainer=_row(column)
	for stars: int in [0,5,4,3]:
		var filter_button := _button(filters,"全部" if stars==0 else "%d星" % stars,func() -> void: star_filter=stars; exchange_page=0; _rebuild(),star_filter==stars,false,26 if compact else 32)
		GameTheme.style_tab(filter_button,star_filter==stars)
		if compact: filter_button.add_theme_font_size_override("font_size",12)
	var heroes: Array=[]
	for hero: Dictionary in GameData.content("CHARACTERS"):
		if star_filter==0 or int(hero.stars)==star_filter: heroes.append(hero)
	var pages: int=maxi(1,int(ceil(heroes.size()/6.0))); exchange_page=clampi(exchange_page,0,pages-1)
	var grid := GridContainer.new(); grid.name="ExchangePage"; grid.columns=3
	grid.add_theme_constant_override("h_separation",6); grid.add_theme_constant_override("v_separation",6)
	column.add_child(grid)
	var cell_height: float=maxf(64,(_height_budget()-184)/2.0) if compact else maxf(110,(_height_budget()-255)/2.0)
	for hero: Dictionary in heroes.slice(exchange_page*6,(exchange_page+1)*6):
		var id: String=str(hero.id)
		var price: int=int(GameEconomy.gacha_config().redeemCost[hero.rarity])
		var owned: bool=app.state().owned.has(id)
		var status: String="已结缘" if owned else "%d道缘" % price
		var card: Button=_button(grid,"%s\n%d星 · %s" % [hero.name,hero.stars,status],_exchange_detail.bind(id),false,false,cell_height)
		card.name="ExchangeCard_"+id; card.custom_minimum_size.x=70; card.add_theme_font_size_override("font_size",10 if compact else 12)
		card.icon=load("res://assets/avatars/%s-premium.webp" % id)
		card.expand_icon=true; card.icon_alignment=HORIZONTAL_ALIGNMENT_CENTER; card.vertical_icon_alignment=VERTICAL_ALIGNMENT_TOP
		card.add_theme_constant_override("icon_max_width",int(minf(100,cell_height-(40 if compact else 57))))
	var pager: HBoxContainer=_row(column)
	_button(pager,"上一页",func() -> void: exchange_page-=1; _rebuild(),false,exchange_page==0,26 if compact else 32)
	var page_label: Label=_label(pager,"%d / %d" % [exchange_page+1,pages],13); page_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	_button(pager,"下一页",func() -> void: exchange_page+=1; _rebuild(),false,exchange_page==pages-1,26 if compact else 32)
	var exchange_hint := _label(column,"点击法相查看兑换 · 每抽基础+1道缘，重复另有转化",10 if compact else 12,FADED)
	exchange_hint.autowrap_mode=TextServer.AUTOWRAP_OFF
	exchange_hint.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	exchange_hint.tooltip_text=exchange_hint.text
	_button(column,"心愿追踪",_wish_content,false,false,26 if compact else 32)
func _exchange_detail(id: String) -> void:
	var hero: Dictionary=GameData.character(id)
	var price: int=int(GameEconomy.gacha_config().redeemCost[hero.rarity])
	var box: VBoxContainer=app._modal("定向结缘 · "+str(hero.name)); _paper_modal(app)
	var art := TextureRect.new(); art.texture=load("res://assets/portraits/%s-premium.webp" % id)
	art.expand_mode=TextureRect.EXPAND_IGNORE_SIZE; art.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED; art.custom_minimum_size.y=minf(270,_modal_budget(app)-270)
	box.add_child(art)
	_label(box,"%d星 · %s\n道缘 %d / %d · 还差 %d" % [hero.stars,hero.faction,app.state().resources.fate,price,maxi(0,price-int(app.state().resources.fate))],16)
	var owned: bool=app.state().owned.has(id)
	_button(box,"已结缘" if owned else ("测试免费兑换" if GameEconomy.free_currency() else "兑换 · %d道缘" % price),_redeem.bind(id),true,owned or not GameEconomy.can_afford(app.state(),{"fate":price}),42)
	_button(box,"查看 / 试用",app._open_character.bind(id),false,false,40)
	_button(box,"追踪为心愿",func() -> void:
		var r: Dictionary=app.command("setWishlist",{"id":id},false)
		if r.ok: app._close_modal(); _rebuild()
	,false,false,36)
	app._fit_modal.call_deferred()
func _redeem(id: String) -> void:
	var hero: Dictionary=GameData.character(id)
	var price: int=int(GameEconomy.gacha_config().redeemCost[hero.rarity])
	app._confirm("定向结缘 · "+str(hero.name),("测试版道缘免扣，直接获得%s。此操作不改变召请保底。" % hero.name) if GameEconomy.free_currency() else "消耗 %d 道缘，直接获得%s。此操作不改变召请保底。" % [price,hero.name],func() -> void:
		var result: Dictionary=app.command("redeem",{"id":id},false)
		if result.ok: app._render(); app._open_character(id)
	)
func _rules() -> void:
	var box: VBoxContainer=app._modal("常驻召请 · 概率与规则"); _paper_modal(app)
	var g: Dictionary=GameEconomy.gacha_config()
	_label(box,"基础概率",21,VERMILION)
	_label(box,"五星 %.1f%% · 四星 %.1f%% · 三星 %.1f%%\n各档内部等权；不含保底综合概率。" % [float(g.fiveStarChance)*100,float(g.fourStarChance)*100,float(g.threeStarChance)*100],15)
	_label(box,"五星最多%d抽，四星或以上最多%d抽。五星优先判定；对应星级重置计数。单抽与十连共享保底，十连按10次连续单抽计算。" % [g.fiveStarPity,g.fourStarPity],15)
	_label(box,"每抽基础 +1 道缘。重复五星额外%d、四星额外%d、三星额外%d。" % [g.duplicateExtra.divine,g.duplicateExtra.immortal,g.duplicateExtra.mortal],15)
	_label(box,"定向价格：五星%d、四星%d、三星%d道缘。心愿不改变概率。" % [g.redeemCost.divine,g.redeemCost.immortal,g.redeemCost.mortal],15)
	_label(box,str(g.get("description","常驻池不设角色UP，不混入装备。")),13,FADED)
	_label(box,"先安全保存再揭示。关闭展示不重复扣款、不更换结果。",13,FADED)
	app._fit_modal.call_deferred()
func _history(page: int=0) -> void:
	var box: VBoxContainer=app._modal("召请记录 · 最近50笔"); _paper_modal(app)
	var transactions: Array=app.state().get("drawHistory",[]).duplicate(true); transactions.reverse()
	var entries: Array=[]
	for transaction: Dictionary in transactions.slice(0,50):
		for record: Dictionary in transaction.get("results",[]): entries.append({"record":record,"transaction":transaction})
	if entries.is_empty(): _label(box,"尚未召请。每一次结缘都会留下记录。",16,FADED); return
	var pages: int=maxi(1,int(ceil(entries.size()/8.0))); page=clampi(page,0,pages-1)
	for entry: Dictionary in entries.slice(page*8,(page+1)*8):
		var hero: Dictionary=GameData.character(str(entry.record.id))
		_label(box,"%s · %d星 · %s · 道缘 +%d" % [hero.name,hero.stars,"重复转化" if entry.record.get("duplicate",false) else "首次结缘",entry.record.get("fate",1)],14)
		_label(box,Time.get_datetime_string_from_unix_time(int(float(entry.transaction.get("at",0))/1000))+" · 规则版本 "+str(entry.transaction.get("ruleVersion","历史规则")),10,FADED)
	_modal_pager(box,page,pages,_history)
	app._fit_modal.call_deferred()
func _pool(faction: String="") -> void:
	var box: VBoxContainer=app._modal("常驻角色图鉴 · 档内等权"); _paper_modal(app)
	var heroes: Array=GameData.content("CHARACTERS")
	var counts: Dictionary={"divine":0,"immortal":0,"mortal":0}
	var factions: Array[String]=[]
	for hero: Dictionary in heroes:
		counts[hero.rarity]+=1
		if not factions.has(str(hero.faction)): factions.append(str(hero.faction))
	if faction.is_empty(): faction=str(app.get_meta("summon_pool_faction",factions[0]))
	if not factions.has(faction): faction=factions[0]
	app.set_meta("summon_pool_faction",faction)
	_label(box,"五星 %d位　四星 %d位　三星 %d位" % [counts.divine,counts.immortal,counts.mortal],15,VERMILION)
	var tabs := GridContainer.new(); tabs.name="PoolFactionTabs"; tabs.columns=4; box.add_child(tabs)
	tabs.add_theme_constant_override("h_separation",4); tabs.add_theme_constant_override("v_separation",4)
	for value: String in factions: _button(tabs,value,_pool.bind(value),value==faction,false,32)
	var chosen: Array=[]
	for hero: Dictionary in heroes:
		if str(hero.faction)==faction: chosen.append(hero)
	var rows: int=maxi(1,int(ceil(chosen.size()/4.0)))
	var height: float=clampf((_modal_budget(app)-240)/rows,66,112)
	var grid := GridContainer.new(); grid.name="FactionPoolCards"; grid.columns=4; box.add_child(grid)
	grid.add_theme_constant_override("h_separation",4); grid.add_theme_constant_override("v_separation",4)
	for hero: Dictionary in chosen:
		var card: Button=_button(grid,"%s\n%d星" % [hero.name,hero.stars],app._open_character.bind(str(hero.id)),false,false,height)
		card.name="PoolCard_"+str(hero.id)
		card.custom_minimum_size.x=48
		card.add_theme_font_size_override("font_size",12)
		card.icon=load("res://assets/avatars/%s-premium.webp" % hero.id)
		card.expand_icon=true; card.icon_alignment=HORIZONTAL_ALIGNMENT_CENTER; card.vertical_icon_alignment=VERTICAL_ALIGNMENT_TOP
		card.add_theme_constant_override("icon_max_width",int(maxf(26,height-48)))
	app._fit_modal.call_deferred()
func _wish_content() -> void:
	var box: VBoxContainer=app._modal("心愿追踪 · 定向结缘"); _paper_modal(app)
	var wish: Variant=app.state().get("wishlist")
	if wish==null: _label(box,"尚未追踪心愿。选择一位法相，记录道缘兑换进度。",16)
	else:
		var hero: Dictionary=GameData.character(str(wish))
		var price: int=int(GameEconomy.gacha_config().redeemCost[hero.rarity])
		_label(box,"%s · %d星\n道缘 %d / %d · 还差 %d" % [hero.name,hero.stars,app.state().resources.fate,price,maxi(0,price-int(app.state().resources.fate))],20,VERMILION)
		_button(box,"查看与试用",app._open_character.bind(str(wish)),false,false,40)
		_button(box,"前往定向兑换",func() -> void: app._close_modal(); _set_mode("exchange"),true,false,40)
		_button(box,"取消追踪",func() -> void:
			var r: Dictionary=app.command("setWishlist",{"id":null},false)
			if r.ok: _wish_content(); _rebuild()
		,false,false,36)
	_button(box,"选择心愿" if wish==null else "更换心愿",_wish_choices,true,false,40)
	_label(box,"免费更换；仅追踪兑换进度，不改变概率或保底。",13,FADED)
	app._fit_modal.call_deferred()
func _wish_choices(page: int=0) -> void:
	var box: VBoxContainer=app._modal("选择心愿 · 追踪兑换目标"); _paper_modal(app)
	_label(box,"选择不提升概率，不消耗道缘，不清空保底。",13,FADED)
	var heroes: Array=GameData.content("CHARACTERS")
	var pages: int=maxi(1,int(ceil(heroes.size()/8.0))); page=clampi(page,0,pages-1)
	var grid := GridContainer.new(); grid.columns=2; box.add_child(grid)
	for hero: Dictionary in heroes.slice(page*8,(page+1)*8):
		var id: String=str(hero.id)
		_button(grid,"%s · %d星" % [hero.name,hero.stars],func() -> void:
			var result: Dictionary=app.command("setWishlist",{"id":id},false)
			if result.ok: _wish_content(); _rebuild()
		,false,false,46)
	_modal_pager(box,page,pages,_wish_choices)
	app._fit_modal.call_deferred()
func _modal_pager(box: Node,page: int,pages: int,callback: Callable) -> void:
	var row: HBoxContainer=_row(box)
	_button(row,"上一页",callback.bind(page-1),false,page==0,34)
	var text: Label=_label(row,"%d / %d" % [page+1,pages],13); text.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	_button(row,"下一页",callback.bind(page+1),false,page==pages-1,34)
static func _paper_modal(application: Node) -> void:
	if is_instance_valid(application.overlay):
		var panel: PanelContainer=application.overlay.get_node("Sheet")
		panel.add_theme_stylebox_override("panel",GameTheme.box(PAPER,GOLD,14,14))
		for scroll: Node in panel.find_children("*","ScrollContainer",true,false):
			scroll.vertical_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
			scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	if is_instance_valid(application.modal_box): application.modal_box.add_theme_constant_override("separation",7)
static func _modal_budget(application: Node) -> float:
	var safe: Rect2=GameSafeArea.rect_for(application)
	return maxf(380,safe.size.y-110)
static func draw(application: Node,count: int) -> void:
	# Lock before touching the store: a second mouse/touch event cannot debit again.
	if bool(application.get_meta(DRAW_LOCK,false)): return
	if application.get_meta("summon_phase",Movie.Phase.IDLE)==Movie.Phase.RESULTS: return
	if recover_pending(application): return
	application.set_meta(DRAW_LOCK,true)
	application.set_meta("summon_phase",Movie.Phase.REQUEST_RESULT)
	var txid: String="summon-%d-%s" % [GameData.now_ms(),Crypto.new().generate_random_bytes(16).hex_encode()]
	var result: Dictionary=application.command("summon",{"count":count,"txid":txid,"presentation":true},false)
	if not result.get("ok",false):
		application.set_meta(DRAW_LOCK,false)
		application.set_meta("summon_phase",Movie.Phase.IDLE)
		return
	var records: Array=result.get("data",[]) if result.get("data") is Array else []
	if records.is_empty():
		application.set_meta(DRAW_LOCK,false)
		return
	application._close_modal()
	application._render()
	var settings: Dictionary=application.state().get("settings",{})
	var development_preview: bool=bool(application.get_meta("ui_test",false)) and bool(application.get_meta("preview_unapproved_summon",false))
	var movie_path: String=Movie.clip_for(records)
	if not development_preview and not application.has_method("summon_scene_rect"):
		_present_committed.call_deferred(application.get_instance_id(),records.duplicate(true),count)
		return
	var presentation: Control=Cinematic.new() if development_preview else Movie.new()
	presentation.configure(records,bool(settings.get("simplified",false)),bool(settings.get("sound",true)))
	application.set_meta(ACTIVE_CINEMATIC,presentation)
	presentation.completed.connect(_finish_cinematic.bind(application.get_instance_id(),records.duplicate(true),count,presentation.get_instance_id()))
	application.add_child(presentation)

static func recover_pending(application: Node) -> bool:
	var pending: Dictionary=application.store.pending_summon()
	if pending.is_empty(): return false
	if application.get_meta("summon_phase",Movie.Phase.IDLE)==Movie.Phase.RESULTS: return true
	if application.has_method("_go"): application._go(3)
	show_results(application,pending.results,pending.results.size())
	return true

static func _ack_results(application_id: int,txid: String,backdrop: Control) -> void:
	if is_instance_valid(backdrop): backdrop.queue_free()
	if not is_instance_id_valid(application_id): return
	var application: Node=instance_from_id(application_id)
	if application.is_queued_for_deletion(): return
	application.set_meta("summon_phase",Movie.Phase.RETURN)
	if application.get("frame") is Control: application.frame.modulate.a=1
	if application.get("summon_ui_shade") is Control: application.summon_ui_shade.modulate.a=1
	if application.get_meta("summon_replacing_result",false): return
	if not txid.is_empty():
		var result: Dictionary=application.store.transact("ackSummonPresentation",{"txid":txid})
		if not result.get("ok",false) and application.has_method("toast"): application.toast("展示记录暂未保存；下次会重新显示结果，不会再次扣费。")
	application.set_meta("summon_phase",Movie.Phase.IDLE)

static func _finish_cinematic(_skipped: bool,application_id: int,records: Array,count: int,presentation_id: int) -> void:
	if not is_instance_id_valid(application_id): return
	var application: Node=instance_from_id(application_id)
	if not application.has_meta(ACTIVE_CINEMATIC): return
	var active: Variant=application.get_meta(ACTIVE_CINEMATIC)
	if not is_instance_valid(active) or active.get_instance_id()!=presentation_id: return
	application.remove_meta(ACTIVE_CINEMATIC)
	# Defer rebuilding controls: an unexpected tree exit can occur while the
	# parent is removing children. Keep the lock until the result sheet is ready.
	_present_committed.call_deferred(application_id,records,count,not _skipped)

static func _present_committed(application_id: int,records: Array,count: int,play_portraits: bool=false) -> void:
	if not is_instance_id_valid(application_id): return
	var application: Node=instance_from_id(application_id)
	application.set_meta(DRAW_LOCK,false)
	if not application.is_inside_tree() or application.is_queued_for_deletion(): return
	application._render()
	show_results(application,records,count,0,play_portraits)

static func show_results(application: Node,records: Array,count: int,selected: int=0,play_portraits: bool=false) -> void:
	if records.is_empty(): return
	var active: Variant=application.get_meta(ACTIVE_CINEMATIC) if application.has_meta(ACTIVE_CINEMATIC) else null
	if is_instance_valid(active):
		application.remove_meta(ACTIVE_CINEMATIC)
		active.dismiss_without_results()
	application.set_meta(DRAW_LOCK,false)
	application.set_meta("summon_replacing_result",true)
	var box: VBoxContainer=application._modal("仙门结缘 · %d次召请" % count)
	application.set_meta("summon_replacing_result",false)
	application.set_meta("summon_phase",Movie.Phase.RESULTS)
	var pending: Dictionary=application.store.pending_summon()
	application.overlay.get_node("Sheet").hide()
	for child: Node in application.overlay.get_children():
		if child is ColorRect: child.hide()
	box.reparent(application.overlay)
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var presenter: Control=Results.new()
	presenter.configure(records,play_portraits,bool(application.state().get("settings",{}).get("simplified",false)),selected)
	presenter.size_flags_horizontal=Control.SIZE_EXPAND_FILL; presenter.size_flags_vertical=Control.SIZE_EXPAND_FILL
	box.add_child(presenter)
	presenter.closed.connect(application._close_modal)
	if application.get("frame") is Control: application.frame.modulate.a=0
	if application.get("summon_ui_shade") is Control: application.summon_ui_shade.modulate.a=0
	application.overlay.tree_exiting.connect(_ack_results.bind(application.get_instance_id(),str(pending.get("id","")),null),CONNECT_ONE_SHOT)
