class_name AdventureScreen
extends Control
## Main-story presentation only. Unlocks, snapshots and rewards stay in GameEconomy.
const PAPER := GameTheme.PANEL
const INK := Color("233c3a")
const FADED := Color("67766e")
const RED := Color("a94231")
const GOLD := Color("ad813f")
const LIGHT := GameTheme.LIGHT
const JADE := Color("28715f")
const CHAPTER_COPY := [
	"一滴灵泉，唤醒沉寂仙府。循林而行，将第一枚灵脉核心带回庭院。",
	"丹火深处，百炼问道。穿过炉影与妖将，寻得仙府生长所需的炉心。",
	"雷泽风起，万仙归府。迎战最后的守关者，开启引雷入府的新篇。"
]
var app: Variant
var chapter := 1
var selected_stage := 1
var sweep_label: Label
var sweep_button: Button
var banner: Control
var banner_copy: VBoxContainer
var column: VBoxContainer
var last_budget := -1.0
var has_status := false

class ChapterPath extends Control:
	var screen: Variant
	var stages: Array=[]
	var buttons: Array[Button]=[]
	var captions: Array[Label]=[]
	var centers: PackedVector2Array=[]
	func _ready() -> void:
		custom_minimum_size.y=117
		size_flags_horizontal=Control.SIZE_EXPAND_FILL
		mouse_filter=Control.MOUSE_FILTER_PASS
		for stage: Dictionary in stages:
			var id: int=int(stage.id)
			var cleared: bool=screen.has_clear(screen.app.state(),id)
			var unlocked: bool=screen.stage_lock_reason(screen.app.state(),id).is_empty()
			var node: Button=GameTheme.button("%02d\n%s" % [id,"首领" if stage.boss else "已通" if cleared else "历练" if unlocked else "未至"],screen._select_stage.bind(id),false)
			node.name="StageNode%d" % id
			node.tooltip_text=str(stage.name)+(" · 已首通" if cleared else " · "+screen.stage_lock_reason(screen.app.state(),id) if not unlocked else " · 可出发")
			node.add_theme_font_size_override("font_size",12)
			node.custom_minimum_size=Vector2(44,44)
			var color: Color=screen.RED if stage.boss and unlocked else screen.JADE if cleared else screen.LIGHT if unlocked else Color("ded8c9")
			var ink: Color=screen.LIGHT if cleared or (stage.boss and unlocked) else screen.INK if unlocked else screen.FADED
			node.add_theme_color_override("font_color",ink)
			node.add_theme_color_override("font_hover_color",ink)
			node.add_theme_color_override("font_pressed_color",ink)
			node.add_theme_stylebox_override("normal",GameTheme.box(color,screen.GOLD,22,3))
			node.add_theme_stylebox_override("hover",GameTheme.box(color.lightened(0.07),screen.RED,22,3))
			node.add_theme_stylebox_override("pressed",GameTheme.box(color.darkened(0.06),screen.GOLD,22,3))
			add_child(node)
			buttons.append(node)
			var caption: Label=GameTheme.label(str(stage.name),12,screen.INK)
			caption.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
			add_child(caption)
			captions.append(caption)
		resized.connect(_layout)
		_layout()
	func _layout() -> void:
		centers.clear()
		var slot: float=size.x/4.0
		for i: int in buttons.size():
			var center := Vector2(slot*(i+0.5),27 if i%2==0 else 53)
			centers.append(center)
			buttons[i].position=center-Vector2(22,22)
			buttons[i].size=Vector2(44,44)
			captions[i].position=Vector2(slot*i+2,center.y+27)
			captions[i].size=Vector2(maxf(40,slot-4),39)
		queue_redraw()
	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO,size),Color("fff9ec"))
		draw_rect(Rect2(Vector2.ONE,size-Vector2(2,2)),Color("c5b085"),false,1)
		if centers.size()!=4: return
		for i: int in range(3):
			var points := PackedVector2Array()
			for step: int in range(25):
				var t: float=step/24.0
				var from: Vector2=centers[i]
				var to: Vector2=centers[i+1]
				points.append(from.bezier_interpolate(from+Vector2(42,0),to-Vector2(42,0),to,t))
			var done: bool=screen.has_clear(screen.app.state(),int(stages[i].id))
			draw_polyline(points,Color("e2d7ba"),7,true)
			draw_polyline(points,screen.JADE if done else Color("bfa979"),2,true)
		for i: int in stages.size():
			if int(stages[i].id)==screen.selected_stage:
				draw_arc(centers[i],27,0,TAU,64,screen.RED,2,true)
				draw_circle(centers[i]+Vector2(0,-32),2,screen.RED)

static func build_main(application: Node,parent: Node) -> AdventureScreen:
	var screen: AdventureScreen=load("res://scripts/adventure_screen.gd").new()
	screen.name="AdventureScreen"
	screen.app=application
	var next: int=next_stage(application.state())
	screen.chapter=clampi(int(application.get_meta("adventure_v05_chapter",1+(next-1)/4)),1,3)
	screen.selected_stage=next if int(GameData.stage(next).chapter)==screen.chapter else (screen.chapter-1)*4+1
	parent.add_child(screen)
	return screen

static func has_clear(state: Dictionary,id: int) -> bool:
	for cleared: Variant in state.get("cleared",[]):
		if int(cleared)==id: return true
	return false

static func next_stage(state: Dictionary) -> int:
	for id: int in range(1,13):
		if not has_clear(state,id): return id
	return 12

static func stage_lock_reason(state: Dictionary,id: int) -> String:
	return GameEconomy._stage_error(state,id)

static func chapter_clears(state: Dictionary,value: int) -> int:
	var count := 0
	for id: int in range((value-1)*4+1,value*4+1):
		if has_clear(state,id): count+=1
	return count

func _ready() -> void:
	size_flags_horizontal=Control.SIZE_EXPAND_FILL
	resized.connect(_layout_page)
	_rebuild()
	_layout_page.call_deferred()
func _height_budget() -> float:
	if not is_inside_tree(): return 500
	if app.has_meta("page_content_height"): return maxf(330,float(app.get_meta("page_content_height")))
	var scroll: Variant=app.get("body_scroll")
	if scroll is Control and scroll.size.y>100:
		return maxf(330,scroll.size.y-(get_global_rect().position.y-scroll.get_global_rect().position.y)-18)
	return maxf(400,get_viewport_rect().size.y-310)
func _layout_page() -> void:
	if not is_inside_tree() or not is_instance_valid(column): return
	last_budget=_height_budget()
	if get_meta("page_pager_active",false):
		# The shell divides this opted-in VBox on short displays. Resizing must
		# preserve its visible page instead of restoring the full-screen floor.
		var height: float=column.get_combined_minimum_size().y
		custom_minimum_size.y=height
		column.position=Vector2.ZERO
		column.size=Vector2(size.x,height)
		_layout_banner()
		return
	custom_minimum_size.y=last_budget
	column.position=Vector2.ZERO; column.size=Vector2(size.x,last_budget)
	if is_instance_valid(banner):
		banner.custom_minimum_size.y=maxf(84,last_budget-310-(39 if has_status else 0))
		_layout_banner()
func _label(parent: Node,text: String,fs: int=16,color: Color=INK) -> Label:
	var node: Label=GameTheme.label(text,fs,color); parent.add_child(node); return node
func _button(parent: Node,text: String,callback: Callable,primary: bool=false,disabled: bool=false,height: float=36) -> Button:
	var node: Button=GameTheme.button(text,callback,primary,disabled)
	node.custom_minimum_size.y=height; node.add_theme_font_size_override("font_size",13)
	node.add_theme_color_override("font_color",LIGHT if primary else INK)
	node.add_theme_color_override("font_hover_color",LIGHT if primary else RED)
	node.add_theme_color_override("font_disabled_color",Color("8a9187"))
	node.add_theme_stylebox_override("normal",GameTheme.box(RED if primary else LIGHT,GOLD,7,6))
	node.add_theme_stylebox_override("hover",GameTheme.box(Color("b64b38") if primary else PAPER,RED,7,6))
	node.add_theme_stylebox_override("pressed",GameTheme.box(Color("903528") if primary else Color("e8dcc3"),GOLD,7,6))
	node.add_theme_stylebox_override("disabled",GameTheme.box(Color("e4ded0"),Color("c0b7a0"),7,6))
	parent.add_child(node); return node
func _row(parent: Node) -> HBoxContainer:
	var node := HBoxContainer.new(); node.add_theme_constant_override("separation",6)
	node.size_flags_horizontal=Control.SIZE_EXPAND_FILL; parent.add_child(node); return node
func _panel(parent: Node) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel",GameTheme.box(LIGHT,Color("c5b085"),10,8))
	parent.add_child(panel)
	var box := VBoxContainer.new(); box.add_theme_constant_override("separation",4)
	box.size_flags_horizontal=Control.SIZE_EXPAND_FILL; panel.add_child(box); return box
func _rebuild() -> void:
	sweep_label=null; sweep_button=null; banner=null
	for child: Node in get_children(): remove_child(child); child.queue_free()
	column=VBoxContainer.new(); column.name="SingleScreenContent"
	column.add_theme_constant_override("separation",7); add_child(column)
	var state: Dictionary=app.state()
	has_status=state.get("mainBattle")!=null or state.get("choicePending",false) or state.get("materialSweep")!=null or has_clear(state,12)
	if has_status:
		var status: HBoxContainer=_row(column)
		if state.get("mainBattle")!=null: _button(status,"继续历练",_resume_details,false,false,32)
		if state.get("choicePending",false): _button(status,"结缘自选",app._gift,true,false,32)
		if state.get("materialSweep")!=null:
			sweep_button=_button(status,"扫荡中",_sweep_details,false,false,32)
			_update_sweep()
		if has_clear(state,12): _button(status,"雷泽归府",_ending,false,false,32)
	var tabs: HBoxContainer=_row(column)
	for value: int in range(1,4):
		var tab: Button=_button(tabs,"%s章 · %d/4" % [["壹","贰","叁"][value-1],chapter_clears(state,value)],_select_chapter.bind(value),value==chapter,false,38)
		tab.name="ChapterTab%d" % value
		GameTheme.style_tab(tab,value==chapter)
	_banner()
	var path := ChapterPath.new(); path.name="ChapterPath"; path.screen=self
	for stage: Dictionary in GameData.content("STAGES"):
		if int(stage.chapter)==chapter: path.stages.append(stage)
	column.add_child(path)
	_stage_detail()
	_layout_page()
func _banner() -> void:
	banner=Control.new(); banner.name="ChapterBanner"; banner.custom_minimum_size.y=130; column.add_child(banner)
	var image := TextureRect.new(); image.name="ChapterBackground"
	image.texture=load(BattleView.chapter_background_path((chapter-1)*4+1))
	image.expand_mode=TextureRect.EXPAND_IGNORE_SIZE; image.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_COVERED
	image.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); image.mouse_filter=Control.MOUSE_FILTER_IGNORE
	banner.add_child(image)
	var wash := TextureRect.new()
	var gradient := Gradient.new()
	gradient.colors=PackedColorArray([Color(0.06,0.17,0.15,0.82),Color(0.06,0.17,0.15,0.46),Color(0.06,0.17,0.15,0.06)])
	gradient.offsets=PackedFloat32Array([0,0.60,1])
	var texture := GradientTexture2D.new(); texture.gradient=gradient
	texture.fill_from=Vector2(0,0.5); texture.fill_to=Vector2(1,0.5)
	wash.texture=texture; wash.mouse_filter=Control.MOUSE_FILTER_IGNORE
	wash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); banner.add_child(wash)
	banner_copy=VBoxContainer.new(); banner_copy.add_theme_constant_override("separation",4)
	banner_copy.mouse_filter=Control.MOUSE_FILTER_IGNORE; banner.add_child(banner_copy)
	_label(banner_copy,"第%s章 · %s" % [["壹","贰","叁"][chapter-1],GameData.economy("CORE_NAMES")["spring" if chapter==1 else "furnace" if chapter==2 else "thunder"]],11,Color("f4dcac"))
	_label(banner_copy,str(GameData.content("CHAPTERS")[chapter-1]),27,LIGHT)
	var frame := SummonScreen.OrnamentalFrame.new(); frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); banner.add_child(frame)
	banner.resized.connect(_layout_banner); _layout_banner()
func _layout_banner() -> void:
	if not is_instance_valid(banner): return
	banner_copy.position=Vector2(18,maxf(10,(banner.size.y-69)/2))
	banner_copy.size=Vector2(maxf(100,banner.size.x*0.75),65)
func _select_chapter(value: int) -> void:
	chapter=clampi(value,1,3); app.set_meta("adventure_v05_chapter",chapter)
	var next: int=next_stage(app.state())
	selected_stage=next if int(GameData.stage(next).chapter)==chapter else (chapter-1)*4+1
	_rebuild()
func _select_stage(value: int) -> void:
	selected_stage=value; _rebuild()
func _stage_detail() -> void:
	var state: Dictionary=app.state()
	var stage: Dictionary=GameData.stage(selected_stage)
	var first: bool=not has_clear(state,selected_stage)
	var reason: String=stage_lock_reason(state,selected_stage)
	var box: VBoxContainer=_panel(column); box.name="StageDetail"
	_label(box,"%02d　%s%s" % [selected_stage,stage.name," · 首领" if stage.boss else ""],20,RED)
	var reward: Dictionary=GameEconomy.stage_reward(selected_stage,first)
	_label(box,reason if not reason.is_empty() else "建议修为%d · 敌方%d位 · %s" % [stage.recommendedLevel,stage.enemies.size(),"首通符%d" % reward.ticket if first else "已首通"],12,RED if not reason.is_empty() else FADED)
	_label(box,"%s · 灵石%d　修为%d　灵材%d" % ["首通" if first else "重打",reward.stone,reward.xp,reward.material],12,JADE)
	var actions: HBoxContainer=_row(box)
	_button(actions,"查看敌情与出发" if reason.is_empty() else "暂未开启",_preview.bind(selected_stage),true,not reason.is_empty(),38)
	if not first and not stage.boss:
		_button(actions,"材料扫荡",_start_sweep.bind(selected_stage),false,state.get("materialSweep")!=null,38)
	elif reason.contains("核心") or reason.contains("炉心"):
		_button(actions,"回府融入核心",func() -> void: app._go(0),false,false,38)
func _resume_details() -> void:
	var active: Variant=app.state().get("mainBattle")
	if not active is Dictionary: return
	var box: VBoxContainer=app._modal("未完成的历练"); SummonScreen._paper_modal(app)
	_label(box,"%02d · %s" % [active.stageId,GameData.stage(int(active.stageId)).name],22,RED)
	_label(box,"继续同一战前快照；已经登记的丹药不会再次扣除。",15)
	_button(box,"继续历练",app._start_main.bind(int(active.stageId)),true,false,42)
	_button(box,"放弃战前记录",func() -> void: app._confirm("放弃这次历练？","仅结束本次战前记录；已登记丹药按原规则不退还。",func() -> void: app.command("abandonMainBattle")),false,false,40)
	app._fit_modal.call_deferred()
func _preview(id: int) -> void:
	if not stage_lock_reason(app.state(),id).is_empty(): return
	var stage: Dictionary=GameData.stage(id)
	var first: bool=not has_clear(app.state(),id)
	var box: VBoxContainer=app._modal("%02d · %s" % [id,stage.name]); SummonScreen._paper_modal(app)
	_label(box,str(stage.description),14)
	_label(box,CHAPTER_COPY[int(stage.chapter)-1],13,FADED)
	_label(box,"敌方阵容",19,RED)
	for enemy: Dictionary in stage.enemies:
		_label(box,"%s · %s\n生命%d　攻击%d　防御%d%s" % [enemy.name,"前排" if enemy.row=="front" else "后排",enemy.hp,enemy.atk,enemy.def,"　盾%d" % int(enemy.get("shield",0)) if int(enemy.get("shield",0))>0 else ""],13,INK)
	_label(box,("首通总成果" if first else "重打成果")+" · "+_reward_text(GameEconomy.stage_reward(id,first)),13,JADE)
	if first and id==2: _label(box,"首次通关：雷震子结缘，队伍拓展为四位。",13,GOLD)
	if first and id==3: _label(box,"首次通关：解锁第五队位与结缘自选。",13,GOLD)
	if first and stage.boss: _label(box,"首次通关："+str(GameData.economy("CORE_NAMES")["spring" if id==4 else "furnace" if id==8 else "thunder"])+"带回仙府。",13,GOLD)
	_label(box,"当前阵容 · "+app._team_names(app.state().team),13,JADE)
	var actions: HBoxContainer=_row(box)
	_button(actions,"调整阵容",app._team,false,false,38)
	_button(actions,"进入真实回合战斗",app._start_main.bind(id),true,false,38)
	if has_clear(app.state(),id) and not stage.boss: _button(box,"材料扫荡 · 60秒",_start_sweep.bind(id),false,app.state().get("materialSweep")!=null,38)
	app._fit_modal.call_deferred()
func _start_sweep(id: int) -> void:
	var reward: Dictionary=GameEconomy.stage_reward(id,false)
	app._confirm("开始材料扫荡？","%02d · %s\n等待60秒，完成后领取：%s。\n不发放首通成果或召请符。" % [id,GameData.stage(id).name,_reward_text(reward)],func() -> void: app.command("startMaterialSweep",{"stageId":id}))
func _sweep_details() -> void:
	var sweep: Variant=app.state().get("materialSweep")
	if not sweep is Dictionary: return
	var box: VBoxContainer=app._modal("材料扫荡 · "+str(GameData.stage(int(sweep.stageId)).name)); SummonScreen._paper_modal(app)
	_label(box,_reward_text(sweep.reward),15,JADE)
	sweep_label=_label(box,"",16)
	var button: Button=_button(box,"领取扫荡成果",func() -> void: app.command("claimMaterialSweep"),true,int(app.state().lastTime)<int(sweep.readyAt),42)
	button.name="SweepClaim"
	_update_sweep(); app._fit_modal.call_deferred()
func _process(_delta: float) -> void:
	if is_instance_valid(column) and absf(_height_budget()-last_budget)>2: _layout_page()
	if is_instance_valid(sweep_button) or is_instance_valid(sweep_label): _update_sweep()
func _update_sweep() -> void:
	var sweep: Variant=app.state().get("materialSweep")
	if not sweep is Dictionary: return
	var seconds: int=int(ceil(maxi(0,int(sweep.readyAt)-int(app.state().lastTime))/1000.0))
	if is_instance_valid(sweep_button): sweep_button.text="扫荡可领" if seconds==0 else "扫荡中 · %d秒" % seconds
	if is_instance_valid(sweep_label):
		sweep_label.text="扫荡完成 · 可领取" if seconds==0 else "扫荡中 · 还需 %d 秒" % seconds
		var claim: Node=app.modal_box.find_child("SweepClaim",true,false) if is_instance_valid(app.modal_box) else null
		if claim is Button: claim.disabled=seconds>0
func _reward_text(reward: Dictionary) -> String:
	var names: Dictionary={"stone":"灵石","xp":"修为","material":"灵材","herb":"灵草","ticket":"召请符","fate":"道缘"}
	var parts: PackedStringArray=[]
	for id: String in ["stone","xp","material","herb","ticket","fate"]:
		if int(reward.get(id,0))>0: parts.append("%s %d" % [names[id],reward[id]])
	return " · ".join(parts)
func _ending() -> void:
	var box: VBoxContainer=app._modal("封神首篇 · 雷泽归府"); SummonScreen._paper_modal(app)
	_label(box,"三枚成果带回了仙府。万仙录仍待续写，三片庭院继续生长。继续培养、经营与挑战秘境，或完成引雷工程，迎来仙府的新篇。",17)
	_button(box,"查看引雷入府",_thunder,true,false,42)
	app._fit_modal.call_deferred()
func _thunder() -> void:
	app._close_modal()
	app.page=4; app.subpage="工程"; app._render()
