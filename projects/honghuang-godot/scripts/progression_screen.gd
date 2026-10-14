class_name ProgressionScreen
extends RefCounted
const Art = preload("res://scripts/game_illustrated_icon.gd")
static func build(g: Control,parent: Node,id: String) -> void:
	var selections: Dictionary=g.get_meta("progression_selections",{})
	var selection: Dictionary=selections.get(id,{})
	var model: Dictionary=load("res://scripts/game_progression.gd").view(g.state(),id,selection)
	var top: HBoxContainer=g.row(parent)
	var icon: Control=Art.icon(top,SystemHub.icon_for(id),false)
	icon.custom_minimum_size=Vector2(50,50)
	var heading: VBoxContainer=g.column(top)
	g.label(heading,str(model.get("name","修行")),22,GameTheme.GOLD)
	var subtitle: Label=g.label(heading,str(model.get("description","")),12,GameTheme.MUTED)
	subtitle.max_lines_visible=2
	var back: Button=g.button(top,"百宝",g._systems_page)
	back.custom_minimum_size.x=56
	back.size_flags_horizontal=Control.SIZE_SHRINK_END
	var adjacent := GridContainer.new()
	adjacent.columns=4
	adjacent.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	adjacent.add_theme_constant_override("h_separation",4)
	adjacent.add_theme_constant_override("v_separation",4)
	parent.add_child(adjacent)
	var current: Dictionary=GameData.named(SystemHub.catalog(),id)
	for other: Dictionary in SystemHub.catalog():
		if other.area!=current.get("area") or other.category!=current.get("category") or int(other.id)>46: continue
		var b: Button=g.button(adjacent,str(other.name).split("／")[0],g._systems_page.bind(str(other.id)),other.id==id)
		b.custom_minimum_size=Vector2(0,32)
		b.add_theme_font_size_override("font_size",12)
		b.clip_text=true
		b.tooltip_text=str(other.name)
		GameTheme.style_tab(b,other.id==id)
	var summary: String=str(model.get("summary",""))
	if not summary.is_empty():
		var status: VBoxContainer=g.card(parent)
		g.label(status,summary,14,GameTheme.TEXT)
	var selectors: Array=model.get("selectors",[])
	for selector: Dictionary in selectors:
		if model.has("board") and str(selector.key) in ["x","y"]: continue
		var h: HBoxContainer=g.row(parent)
		var name_label: Label=g.label(h,str(selector.get("name","选择")),13,GameTheme.MUTED)
		name_label.autowrap_mode=TextServer.AUTOWRAP_OFF
		name_label.custom_minimum_size.x=maxf(58,name_label.get_theme_font("font").get_string_size(name_label.text,HORIZONTAL_ALIGNMENT_LEFT,-1,13).x)
		name_label.size_flags_horizontal=Control.SIZE_SHRINK_BEGIN
		name_label.size_flags_vertical=Control.SIZE_SHRINK_CENTER
		var choices := OptionButton.new()
		choices.custom_minimum_size=Vector2(0,36)
		choices.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		h.add_child(choices)
		var values: Array=selector.get("choices",[])
		for index: int in range(values.size()):
			choices.add_item(str(values[index].get("name",values[index].get("id",""))))
			if str(selector.get("selectedId",selection.get(selector.key,"")))==str(values[index].id): choices.select(index)
		choices.item_selected.connect(func(index: int)->void:
			selection[str(selector.key)]=values[index].id
			selections[id]=selection
			g.set_meta("progression_selections",selections)
			g._render())
	for field: Dictionary in model.get("fields",[]):
		var input := LineEdit.new()
		input.placeholder_text=str(field.name)
		input.text=str(selection.get(field.key,field.get("value","")))
		input.max_length=int(field.get("maxLength",40))
		input.custom_minimum_size=Vector2(0,38)
		input.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		parent.add_child(input)
		input.text_changed.connect(func(value: String)->void:
			selection[str(field.key)]=value
			selections[id]=selection
			g.set_meta("progression_selections",selections))
	load("res://scripts/progression_visual.gd").build(g,parent,id,model)
	var options: Array=model.get("options",[])
	if not options.is_empty():
		var grid := GridContainer.new()
		grid.columns=3
		grid.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		grid.add_theme_constant_override("h_separation",6)
		grid.add_theme_constant_override("v_separation",5)
		parent.add_child(grid)
		var group: int=int(selection.get("collectionPage",0))
		var per: int=6
		group=clampi(group,0,maxi(0,int(ceil(options.size()/float(per)))-1))
		for option: Dictionary in options.slice(group*per,(group+1)*per):
			var title: String=str(option.get("name",option.id))
			var b: Button=g.button(grid,title,func()->void:
				selection.id=option.id
				selections[id]=selection
				g.set_meta("progression_selections",selections)
				g._render(),bool(option.get("selected",false)))
			b.custom_minimum_size=Vector2(0,38)
			b.add_theme_font_size_override("font_size",13)
			b.clip_text=true
			b.tooltip_text=str(option.get("detail",""))
			b.icon=Art.texture(SystemHub.icon_for(id))
			b.expand_icon=true
			b.add_theme_constant_override("icon_max_width",24)
		if options.size()>per:
			var switcher: HBoxContainer=g.row(parent)
			g.button(switcher,"‹",func()->void: selection.collectionPage=group-1; selections[id]=selection; g.set_meta("progression_selections",selections); g._render(),false,group==0)
			var count: Label=g.label(switcher,"藏品 %d / %d" % [group+1,int(ceil(options.size()/float(per)))],13,GameTheme.MUTED)
			count.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
			g.button(switcher,"›",func()->void: selection.collectionPage=group+1; selections[id]=selection; g.set_meta("progression_selections",selections); g._render(),false,(group+1)*per>=options.size())
		for option: Dictionary in options:
			if str(option.id)==str(model.get("selectedId","")) and not str(option.get("detail","")).is_empty():
				g.label(parent,str(option.detail),14,GameTheme.JADE)
				break
	if id=="003":
		var selected: Dictionary=GameEquipment.item(g.state(),str(model.get("selectedId","")))
		if not selected.is_empty():
			var comparison: Dictionary=GameEquipment.shared_item(g.state(),str(selection.get("slot",model.selectors[0].get("selectedId","flower"))))
			var text: String="当前："+("空位" if comparison.is_empty() else GameEquipment.display_name(comparison)+" +%d" % comparison.level)
			text+="\n所选：%d星 · 强化%d级" % [int(selected.rarity),int(selected.level)]
			g.label(parent,text,14,GameTheme.JADE)
			g.button(parent,"查看属性与强化记录",g._gear_detail.bind(str(selected.id)))
	elif model.has("board"):
		var board := SourceBoard.new()
		board.configure(g,id,model,selection,selections)
		parent.add_child(board)
		g.label(parent,"点选盘面定位，浅金色为待放碎片；青色为已摆放。",12,GameTheme.MUTED)
	var actions: Array=model.get("actions",[])
	var controls := GridContainer.new()
	controls.columns=2
	controls.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	controls.add_theme_constant_override("h_separation",7)
	controls.add_theme_constant_override("v_separation",5)
	parent.add_child(controls)
	for action: Dictionary in actions:
		var b: Button=g.button(controls,str(action.label),_act.bind(g,action,model),true,not bool(action.get("enabled",true)))
		b.custom_minimum_size=Vector2(0,40)
		b.add_theme_font_size_override("font_size",14)
		b.clip_text=true
		b.tooltip_text=str(action.get("reason",""))
		if not str(action.get("costText","")).is_empty():
			var price: Label=g.label(controls,str(action.costText),11,GameTheme.MUTED)
			price.max_lines_visible=2
			price.tooltip_text=str(action.costText)
	var notice: String=str(model.get("notice",""))
	if not notice.is_empty(): g.label(parent,notice,12,GameTheme.MUTED)
static func _act(g: Control,action: Dictionary,model: Dictionary) -> void:
	var command: String=str(action.get("cmd",""))
	var args: Dictionary=action.get("args",{})
	if command=="progProfile":
		var profile: Dictionary=g.get_meta("progression_selections",{}).get("011",{})
		args=args.duplicate(true)
		args.name=str(profile.get("profileName",args.get("name","")))
		args.signature=str(profile.get("signature",args.get("signature","")))
	if command in ["progPetInherit","progPetRebirth","progFuse","progCoreBreakthrough","progAbandonTrial"]:
		g._confirm(str(action.label),str(action.get("costText",""))+"\n"+str(model.get("notice",""))+"\n"+str(model.get("summary","")),g._system_action.bind(command,args))
	else: g._system_action(command,args)

class SourceBoard extends Control:
	var app: Control
	var system_id: String
	var model: Dictionary
	var selection: Dictionary
	var selections: Dictionary
	var board: Dictionary
	func configure(g: Control,id: String,value: Dictionary,pick: Dictionary,picks: Dictionary) -> void:
		app=g; system_id=id; model=value; selection=pick; selections=picks; board=value.board
		custom_minimum_size=Vector2(0,176)
		size_flags_horizontal=Control.SIZE_EXPAND_FILL
		mouse_filter=Control.MOUSE_FILTER_STOP
		clip_contents=true
		resized.connect(queue_redraw)
	func geometry() -> Dictionary:
		var cell: float=minf(30.0,minf(size.x/float(board.width),size.y/float(board.height)))
		return {"cell":cell,"origin":(size-Vector2(board.width,board.height)*cell)*0.5}
	func _draw() -> void:
		var geo: Dictionary=geometry()
		for y in int(board.height):
			for x in int(board.width):
				var rect := Rect2(geo.origin+Vector2(x,y)*geo.cell,Vector2.ONE*geo.cell)
				draw_style_box(GameTheme.box(Color("d4e0dc"),Color("a1b6b2"),4,0),rect.grow(-2))
		var palette: Array[Color]=[Color("56a3b3"),Color("6787b4"),Color("8ca777"),Color("ad829e")]
		var index: int=0
		for item_id in board.placements:
			var placement: Dictionary=board.placements[item_id]
			var cells: Array=load("res://scripts/game_progression.gd").source_cells(app.state(),item_id,int(placement.x),int(placement.y),int(placement.rotation))
			for cell in cells:
				var rect := Rect2(geo.origin+Vector2(cell[0],cell[1])*geo.cell,Vector2.ONE*geo.cell)
				draw_style_box(GameTheme.box(palette[index%palette.size()],Color("f6eccb"),4,0),rect.grow(-3))
			index+=1
		var preview: Array=load("res://scripts/game_progression.gd").source_cells(app.state(),str(model.get("selectedId","")),int(selection.get("x",0)),int(selection.get("y",0)),int(selection.get("rotation",0)))
		for cell in preview:
			var rect := Rect2(geo.origin+Vector2(cell[0],cell[1])*geo.cell,Vector2.ONE*geo.cell)
			draw_rect(rect.grow(-2),Color(0.94,0.78,0.35,0.35))
			draw_rect(rect.grow(-2),Color("b79045"),false,2)
	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT and event.pressed:
			var geo: Dictionary=geometry()
			var pos: Vector2=(event.position-geo.origin)/geo.cell
			if pos.x<0 or pos.y<0 or pos.x>=board.width or pos.y>=board.height: return
			selection.x=int(pos.x); selection.y=int(pos.y)
			selections[system_id]=selection
			app.set_meta("progression_selections",selections)
			app._render()
			accept_event()
