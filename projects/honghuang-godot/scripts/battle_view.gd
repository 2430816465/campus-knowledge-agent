class_name BattleView
extends Control
signal finished(battle: Dictionary)
signal leave_requested
signal cue(kind: String)
signal speed_changed(speed: int)
signal gear_requested(id: String)

var battle: Dictionary = {}
var settings: Dictionary = {}
var frame: VBoxContainer
var content: VBoxContainer
var arena: Control
var order_label: Label
var intent_label: Label
var controls: VBoxContainer
var log_label: Label
var battle_title: Label
var top_label: Label
var auto_button: Button
var speed_button: Button
var unit_nodes: Dictionary = {}
var action_kind: String = "attack"
var form: String = "normal"
var target_id: String = ""
var source_id: String = ""
var automatic: bool = false
var elapsed: float = 0.0
var locked: float = 0.0
var reported: bool = false
var result_data: Dictionary = {}
var detail_overlay: Control
var backgrounded: bool=false
var ignore_resume_delta: bool=false
var body_scroll: ScrollContainer
var arena_background: TextureRect
var safe_area_elapsed: float=0.0
var last_safe_rect: Rect2
var visual_units: Dictionary = {}
var presenting := false
var review_label: Label
var detail_pages: Array[String]=[]
var detail_page := 0
var detail_text := ""
var detail_label: Label
var detail_page_label: Label
var detail_previous: Button
var detail_next: Button
var settlement_items: Array=[]
var settlement_item_index := 0
var settlement_item_button: Button

class UnitCard extends Button:
	# Only tint and an inset halo change: every card keeps its layout rectangle.
	var portrait: TextureRect
	var body: BattleActor
	var name_label: Label
	var hp_bar: ProgressBar
	var info_label: Label
	var status_label: Label
	var body_mode := false
	var living := true
	var reduced := false
	var idle_phase := 0.0
	var playback_speed := 1.0
	var hit_time := 0.0
	var cast_time := 0.0
	var exit_time := 0.0
	func _process(delta: float) -> void:
		idle_phase += delta
		hit_time = maxf(0,hit_time-delta*playback_speed)
		cast_time = maxf(0,cast_time-delta*playback_speed)
		exit_time = maxf(0,exit_time-delta*playback_speed)
		if living:
			modulate = Color(1,1,1,1)
			if is_instance_valid(portrait):
				var breathe: float = 1.0 if reduced else 0.975+sin(idle_phase*1.4)*0.025
				portrait.self_modulate = Color(1.0,breathe,breathe) if hit_time<=0 else Color(1.0,0.72,0.63)
		else:
			var fade: float = clampf(exit_time/0.34,0,1)
			modulate = Color(0.52+fade*0.48,0.55+fade*0.45,0.57+fade*0.43,0.42+fade*0.58)
		queue_redraw()
	func _draw() -> void:
		if cast_time>0:
			var alpha: float = minf(cast_time*3.0,0.9)
			draw_rect(Rect2(Vector2(2,2),size-Vector2(4,4)),Color(0.92,0.80,0.52,alpha),false,2.0)
	func struck() -> void:
		hit_time = 0.22
		if is_instance_valid(body): body.play("hurt",0.22)
	func cast(animation: String = "cast", duration: float = 0.45) -> void:
		cast_time = duration
		if is_instance_valid(body): body.play(animation,duration)
	func depart() -> void:
		living = false
		exit_time = 0.34
		if is_instance_valid(body): body.depart()

func configure(value: Dictionary, preferences: Dictionary) -> void:
	for node: Control in unit_nodes.values():
		if is_instance_valid(node): node.queue_free()
	unit_nodes.clear()
	visual_units.clear()
	presenting=false
	reported=false
	result_data={}
	battle=value
	automatic=bool(battle.get("autoOnly",false))
	settings=preferences.duplicate(true)
	if is_node_ready():
		auto_button.disabled=automatic
		auto_button.text="自动战斗" if automatic else "自动"
		_refresh()

func _ready() -> void:
	theme=GameTheme.create()
	_build()
	_refresh()

func _build() -> void:
	var backdrop: ColorRect=ColorRect.new()
	backdrop.color=GameTheme.PAPER
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)
	body_scroll=ScrollContainer.new()
	body_scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	body_scroll.vertical_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	add_child(body_scroll)
	frame=VBoxContainer.new()
	frame.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	frame.size_flags_vertical=Control.SIZE_EXPAND_FILL
	frame.add_theme_constant_override("separation",8)
	body_scroll.add_child(frame)
	var margin: MarginContainer=MarginContainer.new()
	margin.add_theme_constant_override("margin_left",12)
	margin.add_theme_constant_override("margin_right",12)
	margin.add_theme_constant_override("margin_top",12)
	frame.add_child(margin)
	content=VBoxContainer.new()
	content.add_theme_constant_override("separation",5)
	margin.add_child(content)
	var top: HBoxContainer=HBoxContainer.new()
	content.add_child(top)
	var back_button: Button=_btn(top,"‹ 返回",_request_exit)
	back_button.size_flags_horizontal=Control.SIZE_SHRINK_BEGIN
	back_button.custom_minimum_size.x=72
	top_label=_label(top,"历练",16)
	top_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	speed_button=_btn(top,"1×",_speed)
	auto_button=_btn(top,"自动 关",func() -> void: automatic=not automatic; auto_button.text="自动 开" if automatic else "自动 关")
	if battle.get("autoOnly",false): auto_button.text="自动战斗"; auto_button.disabled=true
	speed_button.size_flags_horizontal=Control.SIZE_SHRINK_END
	speed_button.custom_minimum_size.x=58
	auto_button.size_flags_horizontal=Control.SIZE_SHRINK_END
	auto_button.custom_minimum_size.x=90
	battle_title=_label(content,"",20,GameTheme.GOLD)
	battle_title.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	order_label=_label(content,"",12,GameTheme.JADE)
	review_label=_label(content,"哪吒静态体 · 其余头像过渡 · 动画暂缓",11,GameTheme.MUTED)
	review_label.tooltip_text="哪吒独立静态战斗体；角色动画制作已暂停，其余法相使用原头像作为过渡展示。"
	arena=Control.new()
	arena.custom_minimum_size.y=350
	arena.size_flags_vertical=Control.SIZE_EXPAND_FILL
	arena.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	content.add_child(arena)
	arena_background=TextureRect.new()
	arena_background.name="ChapterBackground"
	arena_background.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	arena_background.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_COVERED
	arena_background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	arena_background.modulate=Color(0.72,0.77,0.80,1)
	arena_background.mouse_filter=Control.MOUSE_FILTER_IGNORE
	arena.add_child(arena_background)
	var divide: Label=_label(arena,"我 方　　　　　　　　　敌 方",14,GameTheme.GOLD)
	divide.name="Divide"
	divide.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	divide.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	divide.position=Vector2(0,203)
	divide.size=Vector2(500,25)
	arena.resized.connect(_position_units)
	intent_label=_label(content,"",12,GameTheme.GOLD)
	controls=VBoxContainer.new()
	controls.add_theme_constant_override("separation",4)
	content.add_child(controls)
	log_label=_label(content,"",12,GameTheme.MUTED)
	log_label.custom_minimum_size.y=18
	for line: Label in [battle_title,order_label,review_label,intent_label,log_label]:
		line.autowrap_mode=TextServer.AUTOWRAP_OFF
		line.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	resized.connect(_resize_safe_layout)
	_resize_safe_layout()
	_update_background()

static func chapter_background_path(stage_id: int) -> String:
	if stage_id>=9: return "res://assets/battle/thundermarsh-premium.webp"
	if stage_id>=5: return "res://assets/battle/danfire-premium.webp"
	return "res://assets/battle-background-premium.webp"

func _update_background() -> void:
	if not is_instance_valid(arena_background): return
	var path: String=chapter_background_path(int(battle.get("stageId",1)))
	if not ResourceLoader.exists(path): path="res://assets/battle-background-premium.webp"
	if arena_background.texture==null or arena_background.texture.resource_path!=path: arena_background.texture=load(path)

func _resize_safe_layout() -> void:
	if not is_instance_valid(body_scroll): return
	var safe: Rect2=GameSafeArea.rect_for(self)
	var compact: bool=safe.size.y<650
	for line: Label in [battle_title,order_label,review_label,intent_label,log_label]: line.visible=not compact
	last_safe_rect=safe
	body_scroll.position=safe.position
	body_scroll.size=safe.size
	frame.custom_minimum_size=safe.size
	_fit_arena.call_deferred()
	_resize_details()

func _fit_arena() -> void:
	if not is_inside_tree() or not is_instance_valid(arena): return
	var safe: Rect2=GameSafeArea.rect_for(self)
	var other: float=12+float(content.get_theme_constant("separation"))*maxi(0,content.get_child_count()-1)
	for node: Control in content.get_children():
		if node!=arena and node.visible: other+=node.get_combined_minimum_size().y
	arena.custom_minimum_size.y=maxf(120,safe.size.y-other)
	_position_units.call_deferred()

func _resize_details() -> void:
	if not is_instance_valid(detail_overlay): return
	var panel: Control=detail_overlay.get_node_or_null("Panel")
	if panel==null: return
	var safe: Rect2=GameSafeArea.rect_for(self)
	panel.position=safe.position+Vector2(18,40)
	panel.size=Vector2(maxf(1,safe.size.x-36),maxf(1,safe.size.y-80))
	_repage_details()

func _label(parent: Node, text: String, fs: int=17, color: Color=GameTheme.TEXT) -> Label:
	var label: Label=GameTheme.label(text,fs,color)
	parent.add_child(label)
	return label

func _btn(parent: Node, text: String, callback: Callable, primary: bool=false, disabled: bool=false) -> Button:
	var button: Button=GameTheme.button(text,callback,primary,disabled)
	button.custom_minimum_size.y=36
	button.add_theme_font_size_override("font_size",13)
	button.add_theme_stylebox_override("normal",GameTheme.box(GameTheme.JADE if primary else GameTheme.LIGHT,GameTheme.GOLD,7,5))
	button.add_theme_stylebox_override("hover",GameTheme.box(Color("34816b") if primary else GameTheme.PAPER,GameTheme.GOLD,7,5))
	button.add_theme_stylebox_override("pressed",GameTheme.box(GameTheme.DEEP if primary else Color("ddcd9e"),GameTheme.GOLD,7,5))
	parent.add_child(button)
	return button

func _row(parent: Node) -> HBoxContainer:
	var row: HBoxContainer=HBoxContainer.new()
	row.add_theme_constant_override("separation",4)
	parent.add_child(row)
	return row

func _clear(parent: Node) -> void:
	for child: Node in parent.get_children(): parent.remove_child(child); child.queue_free()

func _process(delta: float) -> void:
	if backgrounded: return
	if ignore_resume_delta: ignore_resume_delta=false; return
	if GameSafeArea.uses_device_safe_area():
		safe_area_elapsed+=minf(delta,0.25)
		if safe_area_elapsed>=0.5:
			safe_area_elapsed=0
			if not GameSafeArea.rect_for(self).is_equal_approx(last_safe_rect): _resize_safe_layout()
	if battle.is_empty() or not is_instance_valid(controls): return
	var was_locked: bool = locked>0
	locked=maxf(0,locked-delta)
	if was_locked and locked<=0: _refresh_controls(GameCombat.current_actor(battle))
	if battle.get("result")!=null:
		if not reported and locked<=0:
			reported=true
			finished.emit(battle)
		return
	elapsed+=delta
	var actor: Dictionary=GameCombat.current_actor(battle)
	if actor.is_empty(): return
	if locked<=0 and (actor.get("side")=="enemy" or automatic) and elapsed>=0.85/float(settings.get("speed",1)):
		elapsed=0
		var since: int=battle.get("events",[]).size()
		_capture_visual_state()
		if GameCombat.auto_act(battle): _after_action(since)

func _refresh() -> void:
	if battle.is_empty() or not is_instance_valid(controls): return
	_update_background()
	var actor: Dictionary=GameCombat.current_actor(battle)
	top_label.text="第%d轮" % battle.get("round",1)
	battle_title.text=str(battle.get("contextName",GameData.stage(int(battle.get("stageId",1))).get("name","历练")))
	top_label.tooltip_text=battle_title.text+"\n"+review_label.tooltip_text
	speed_button.text="%d×" % settings.get("speed",1)
	auto_button.text="自动 开" if automatic else "自动 关"
	var order: PackedStringArray=[]
	for uid: String in battle.get("order",[]).slice(int(battle.get("cursor",0))):
		var unit: Dictionary=_unit(uid)
		if not unit.is_empty() and int(unit.hp)>0: order.append(str(unit.name))
	order_label.text="行动序　"+" › ".join(order)
	if not presenting:
		for unit: Dictionary in battle.get("units",[]): visual_units[unit.uid]=unit.duplicate(true)
	var legal: Array=[]
	if not actor.is_empty() and actor.get("side")=="ally" and battle.get("result")==null:
		legal=GameCombat.legal_sources(battle) if action_kind=="skill" and actor.id=="xuandu" and source_id.is_empty() else GameCombat.legal_targets(battle,action_kind,source_id)
	for unit: Dictionary in battle.get("units",[]):
		var node: UnitCard=unit_nodes.get(unit.uid)
		if not is_instance_valid(node):
			node=_unit_card(visual_units.get(unit.uid,unit),false,false)
			arena.add_child(node)
			unit_nodes[unit.uid]=node
		_update_card(node,visual_units.get(unit.uid,unit),actor.get("uid","")==unit.uid,legal.has(unit.uid))
	_position_units()
	var intents: PackedStringArray=[]
	for unit: Dictionary in battle.get("units",[]):
		if unit.side=="enemy" and int(unit.hp)>0 and not str(unit.get("intent","")).is_empty():
			intents.append("%s%s：%s" % [unit.name," · 定力%d/%d" % [unit.get("will",0),unit.get("maxWill",0)] if unit.get("boss",false) else "",unit.intent])
	intent_label.text=intents[0] if not intents.is_empty() else "敌方普通攻势 · 前排护持可减轻压力"
	intent_label.tooltip_text="\n".join(intents)
	_refresh_controls(actor)
	var logs: Array=battle.get("log",[])
	log_label.text=str(logs[-1]) if not logs.is_empty() else "点击法相选择目标，再确认行动；敌情与详情可查。"
	log_label.tooltip_text=log_label.text
	_fit_arena.call_deferred()

func _unit_card(unit: Dictionary, acting: bool, legal: bool) -> UnitCard:
	var button: UnitCard=UnitCard.new()
	button.living=int(unit.hp)>0
	button.reduced=bool(settings.get("simplified",false))
	button.idle_phase=float(str(unit.uid).hash()%100)/10.0
	button.playback_speed=float(settings.get("speed",1))
	button.body_mode=unit.id=="nezha" and unit.side=="ally" and BattleActor.available()
	button.custom_minimum_size=Vector2(118,190) if button.body_mode else Vector2(88,112)
	button.size=button.custom_minimum_size
	button.pressed.connect(_select_unit.bind(str(unit.uid)))
	var column: VBoxContainer=VBoxContainer.new()
	column.mouse_filter=Control.MOUSE_FILTER_IGNORE
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.add_theme_constant_override("separation",0)
	column.offset_left=4
	column.offset_right=-4
	column.offset_top=4
	column.offset_bottom=-4
	button.add_child(column)
	if button.body_mode:
		button.body=BattleActor.new()
		button.body.name="IndependentBody"
		button.body.custom_minimum_size.y=126
		button.body.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		button.body.playback_speed=float(settings.get("speed",1))
		button.body.reduced=bool(settings.get("simplified",false))
		column.add_child(button.body)
	var picture: TextureRect=TextureRect.new()
	picture.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	picture.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_COVERED
	picture.custom_minimum_size.y=47
	picture.mouse_filter=Control.MOUSE_FILTER_IGNORE
	var path: String="res://assets/avatars/%s-premium.webp" % unit.id if unit.side=="ally" else _enemy_art(unit)
	if unit.id == "palace-lord": path = "res://assets/avatars/yangjian-premium.webp"
	if ResourceLoader.exists(path): picture.texture=load(path)
	if not button.body_mode:
		column.add_child(picture)
		button.portrait=picture
	else: picture.free()
	var name_label: Label=_label(column,str(unit.name),12,GameTheme.GOLD if acting else GameTheme.TEXT)
	name_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	name_label.autowrap_mode=TextServer.AUTOWRAP_OFF
	name_label.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	button.name_label=name_label
	var hp: ProgressBar=ProgressBar.new()
	hp.max_value=maxf(1,float(unit.maxHp))
	hp.value=maxf(0,float(unit.hp))
	hp.show_percentage=false
	hp.custom_minimum_size.y=5
	column.add_child(hp)
	button.hp_bar=hp
	if unit.side=="enemy": hp.add_theme_stylebox_override("fill",GameTheme.box(GameTheme.RED,Color.TRANSPARENT,3,0))
	var info: String="%d/%d" % [maxi(0,int(unit.hp)),unit.maxHp]
	if int(unit.get("shield",0))>0: info+=" 盾%d" % unit.shield
	button.info_label=_label(column,info,10,GameTheme.JADE)
	button.info_label.autowrap_mode=TextServer.AUTOWRAP_OFF
	button.info_label.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	var statuses: PackedStringArray=[]
	for status: Dictionary in unit.get("statuses",[]).slice(0,2): statuses.append(str(status.get("name",status.id)).left(2)+str(status.get("turns",0)))
	button.status_label=_label(column," ".join(statuses),10,GameTheme.GOLD)
	button.status_label.autowrap_mode=TextServer.AUTOWRAP_OFF
	button.status_label.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	button.status_label.visible=not statuses.is_empty()
	if int(unit.hp)<=0: button.modulate=Color(0.5,0.5,0.5,0.5)
	return button

func _update_card(node: UnitCard, unit: Dictionary, acting: bool, legal: bool) -> void:
	var border: Color=GameTheme.GOLD if unit.uid==target_id or unit.uid==source_id or acting else GameTheme.JADE if legal else Color("3b5155")
	var box: StyleBoxFlat=GameTheme.box(Color(1,0.965,0.871,0.64 if node.body_mode else 0.98),border,9,2)
	for key: String in ["normal","hover","pressed","focus"]: node.add_theme_stylebox_override(key,box)
	node.name_label.text=str(unit.name)
	node.name_label.add_theme_color_override("font_color",GameTheme.GOLD if acting else GameTheme.TEXT)
	node.hp_bar.max_value=maxf(1,float(unit.maxHp))
	node.hp_bar.value=maxf(0,float(unit.hp))
	node.info_label.text="%d/%d" % [maxi(0,int(unit.hp)),int(unit.maxHp)]+(" 盾%d" % unit.shield if int(unit.get("shield",0))>0 else "")
	node.info_label.tooltip_text=node.info_label.text
	var statuses: PackedStringArray=[]
	for status: Dictionary in unit.get("statuses",[]).slice(0,2): statuses.append(str(status.get("name",status.id)).left(2)+str(status.get("turns",0)))
	node.status_label.text=" ".join(statuses)
	node.status_label.visible=not statuses.is_empty()
	if not presenting:
		node.living=int(unit.hp)>0
		if not node.living and is_instance_valid(node.body): node.body.defeated=true

func _enemy_art(unit: Dictionary) -> String:
	var key: String=str(unit.id)+str(unit.name)
	var family: String="stone"
	for token: String in ["dragon","marsh","storm","雷","蛟","泽"]:
		if key.contains(token): family="thunder"
	if family=="stone":
		for token: String in ["fire","furnace","炉","火","赤","焰"]:
			if key.contains(token): family="fire"
	var names: Dictionary={"stone":"stone-general" if unit.get("boss",false) else "stone-guard","fire":"furnace-king" if unit.get("boss",false) else "fire-spirit","thunder":"dragon-lord" if unit.get("boss",false) else "thunder-guard"}
	return "res://assets/enemies/%s-beta.webp" % names[family]

func _position_units() -> void:
	if battle.is_empty() or not is_instance_valid(arena): return
	var width: float=arena.size.x
	var groups: Dictionary={"enemyback":[],"enemyfront":[],"allyfront":[],"allyback":[]}
	for unit: Dictionary in battle.get("units",[]): groups[str(unit.side)+str(unit.row)].append(unit)
	for key: String in groups:
		var units: Array=groups[key]
		for i: int in units.size():
			var node: UnitCard=unit_nodes.get(units[i].uid)
			if not node: continue
			var rect: Rect2=unit_rect(width,arena.size.y,str(units[i].side),str(units[i].row),i,units.size(),node.body_mode)
			node.position=rect.position
			node.status_label.visible=node.status_label.visible and rect.size.y>=82
			if is_instance_valid(node.body): node.body.custom_minimum_size.y=maxf(24,rect.size.y-52-(14 if node.status_label.visible else 0))
			if is_instance_valid(node.portrait): node.portrait.custom_minimum_size.y=maxf(16,rect.size.y-52-(14 if node.status_label.visible else 0))
			node.custom_minimum_size=rect.size
			node.size=rect.size
			node.z_index=2 if key.ends_with("front") else 1
	var divide: Control=arena.get_node("Divide")
	divide.position=Vector2(0,4)
	divide.size=Vector2(width,24)
	for node: Node in arena.get_children():
		if node is BattleEffects:
			node.size=arena.size
			for uid: String in unit_nodes: node.anchors[uid]=_anchor(uid)
			if is_instance_valid(node.caption): node.caption.size.x=width

static func unit_rect(width: float, height: float, side: String, row: String, index: int, count: int, body: bool = false) -> Rect2:
	# The front rank faces the center. One rectangle owns body, HP and hit input.
	var ally: bool=side=="ally"
	var factor: float=0.34 if row=="front" else 0.13
	var center_x: float=width*(factor if ally else 1.0-factor)
	var upper: float=28.0
	var usable: float=maxf(40,height-44.0)
	var cell_height: float=clampf(usable/maxi(1,count)-6,60,190 if body else 112)
	var cell: Vector2=Vector2(clampf(width*0.225,82,122),cell_height) if body else Vector2(clampf(width*0.17,62,92),cell_height)
	var center_y: float=upper+usable*(float(index)+0.5)/maxi(1,count)
	return Rect2(Vector2(clampf(center_x-cell.x*0.5,0,width-cell.x),clampf(center_y-cell.y*0.5,25,maxf(25,height-cell.y-8))),cell)

func _refresh_controls(actor: Dictionary) -> void:
	_clear(controls)
	if battle.get("result")!=null:
		_label(controls,"得 胜" if battle.result=="win" else "暂 退 · 再 战",25,GameTheme.GOLD)
		var status: String="结果正在提交…"
		if not result_data.is_empty(): status="结果已安全保存。"+_result_message(result_data.get("data")) if result_data.get("ok",false) else "保存未完成："+str(result_data.get("error","未知错误"))
		var note: Label=_label(controls,status,13)
		note.autowrap_mode=TextServer.AUTOWRAP_OFF
		note.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
		note.tooltip_text=status
		var actions: HBoxContainer=_row(controls)
		_btn(actions,"完整战报",_report)
		if result_data.get("ok",false): _btn(actions,"成果详情",_settlement_details)
		if not result_data.get("ok",false): _btn(actions,"重试提交",func() -> void: finished.emit(battle),true)
		else: _btn(actions,"返回整备",func() -> void: leave_requested.emit(),true)
		_fit_arena.call_deferred()
		return
	var can_act: bool=not actor.is_empty() and actor.get("side")=="ally"
	if battle.get("autoOnly",false):
		var character: Dictionary=GameData.character(str(actor.get("id","")))
		var action_note: String=str(actor.get("name",""))+" · 自动行动"
		if can_act: action_note+=" · "+str(character.get("skillName","技能"))+(" 冷却%d" % actor.get("cd",0) if int(actor.get("cd",0))>0 else " 就绪")
		_label(controls,action_note,14,GameTheme.GOLD)
		var links: HBoxContainer=_row(controls)
		_btn(links,"属性详情",_show_actor,false,actor.is_empty())
		_btn(links,"敌方意图",_show_intents)
		_btn(links,"战报",_report)
		_fit_arena.call_deferred()
		return
	_label(controls,(str(actor.get("name",""))+" · 请选择行动") if can_act else "敌方行动中",18,GameTheme.GOLD)
	var actions: HBoxContainer=_row(controls)
	var character: Dictionary=GameData.character(str(actor.get("id","")))
	_btn(actions,"普攻",_set_action.bind("attack"),action_kind=="attack",not can_act)
	_btn(actions,str(character.get("skillName","神通"))+(" · CD%d" % actor.get("cd",0) if int(actor.get("cd",0))>0 else ""),_set_action.bind("skill"),action_kind=="skill",not can_act or int(actor.get("cd",0))>0)
	_btn(actions,"护持",_set_action.bind("guard"),action_kind=="guard",not can_act)
	if actor.get("id")=="yunxiao":
		var availability: Dictionary=GameCombat.combine_availability(battle)
		var forms: HBoxContainer=_row(controls)
		_btn(forms,"普通式 · CD2",func() -> void: form="normal"; _set_action("skill"),form=="normal")
		_btn(forms,"三霄合阵 · CD3",func() -> void: form="combined"; _set_action("skill"),form=="combined",not availability.available)
		_label(controls,str(availability.reason),13,GameTheme.MUTED)
	var confirm: HBoxContainer=_row(controls)
	_btn(confirm,"取消",func() -> void: target_id=""; source_id=""; _refresh(),false,not can_act)
	_btn(confirm,"确认行动",_act,true,not can_act or target_id.is_empty() or locked>0)
	_btn(confirm,"法门",_method,false,not can_act or locked>0 or battle.get("method")==null or int(battle.get("methodUses",0))>0)
	_btn(confirm,"详情",_show_actor,false,actor.is_empty())
	_btn(confirm,"敌情",_show_intents)
	var hint: String="玉框为合法目标，点选后确认。金框为行动者或当前选择。"
	if actor.get("id")=="xuandu" and action_kind=="skill": hint="先选择增益来源，再选择接受者。" if source_id.is_empty() else "已选来源，选择接受者。"
	var hint_label: Label=_label(controls,hint,13,GameTheme.MUTED)
	hint_label.autowrap_mode=TextServer.AUTOWRAP_OFF
	hint_label.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	hint_label.tooltip_text=hint
	_fit_arena.call_deferred()

func _set_action(kind: String) -> void:
	if backgrounded: return
	action_kind=kind
	target_id=""
	source_id=""
	_refresh()

func _unit(uid: String) -> Dictionary:
	for unit: Dictionary in battle.get("units",[]):
		if unit.uid==uid: return unit
	return {}

func _select_unit(uid: String) -> void:
	if backgrounded: return
	var actor: Dictionary=GameCombat.current_actor(battle)
	if actor.is_empty() or actor.get("side")!="ally" or battle.get("result")!=null:
		_show_unit(uid)
		return
	if actor.id=="xuandu" and action_kind=="skill" and source_id.is_empty():
		if GameCombat.legal_sources(battle).has(uid): source_id=uid; _refresh()
		else: _show_unit(uid)
	elif GameCombat.legal_targets(battle,action_kind,source_id).has(uid): target_id=uid; _refresh()
	else: _show_unit(uid)

func _act() -> void:
	if backgrounded or target_id.is_empty() or locked>0: return
	var since: int=battle.events.size()
	_capture_visual_state()
	if GameCombat.act(battle,{"kind":action_kind,"targetId":target_id,"sourceId":source_id,"form":form}): _after_action(since)

func _method() -> void:
	if backgrounded or locked>0: return
	var since: int=battle.events.size()
	_capture_visual_state()
	if GameCombat.use_method(battle): _after_action(since)

func _after_action(since: int) -> void:
	target_id=""
	source_id=""
	action_kind="attack"
	form="normal"
	elapsed=0
	var events: Array=battle.events.slice(since)
	var plan: Array=BattleEffects.plan(events,battle.units,bool(settings.get("simplified",false)))
	presenting=true
	locked=BattleEffects.total_duration(plan)/float(settings.get("speed",1))
	_refresh()
	_animate_events(events,plan)
	cue.emit("skill" if events.any(func(e: Dictionary) -> bool: return e.get("type") in ["skill","combined"]) else "hit")

func _anchor(uid: String) -> Vector2:
	var node: UnitCard=unit_nodes.get(uid)
	return node.position+Vector2(node.size.x*0.5,minf(68.0 if node.body_mode else 29.0,node.size.y*0.46)) if node else arena.size*0.5

func _animate_events(events: Array, plan: Array = []) -> void:
	if plan.is_empty(): plan=BattleEffects.plan(events,battle.units,bool(settings.get("simplified",false)))
	# One owner for body cues, impacts and amounts. No tween can outlive the action.
	for old: Node in arena.get_children():
		if old is BattleEffects or old.get_meta("battle_amount",false):
			arena.remove_child(old)
			old.queue_free()
	var spell: BattleEffects=BattleEffects.new()
	spell.name="EventEffects"
	spell.size=arena.size
	var anchors: Dictionary={}
	for uid: String in unit_nodes: anchors[uid]=_anchor(uid)
	spell.setup(plan,anchors,int(settings.get("speed",1)),events)
	spell.action_started.connect(_start_body_action)
	spell.impact.connect(_present_impact.bind(spell))
	spell.presentation_finished.connect(_finish_presentation)
	arena.add_child(spell)
	var divide: Control=arena.get_node("Divide")
	divide.hide()
	spell.tree_exited.connect(_restore_divider)

func _capture_visual_state() -> void:
	for unit: Dictionary in battle.get("units",[]): visual_units[unit.uid]=unit.duplicate(true)

func _start_body_action(entry: Dictionary) -> void:
	var actor: UnitCard=unit_nodes.get(entry.actorUid)
	if is_instance_valid(actor): actor.cast(str(entry.get("animation","cast")),float(entry.duration))

func _present_impact(event: Dictionary, spell: BattleEffects) -> void:
	for uid: String in event.get("targetUids",[]):
		var card: UnitCard=unit_nodes.get(uid)
		if not is_instance_valid(card): continue
		var shown: Dictionary=visual_units.get(uid,_unit(uid).duplicate(true))
		var amount: int=int(event.get("amount",0))
		var kind: String=str(event.type)
		if kind in ["damage","followDamage","multiHitDamage","boonDamage"]:
			shown.hp=maxi(0,int(shown.hp)-int(event.get("hpDamage",amount)))
			shown.shield=maxi(0,int(shown.get("shield",0))-int(event.get("shieldAbsorbed",0)))
			card.struck()
			spell.show_amount(uid,"damage",amount)
		elif kind=="heal":
			shown.hp=mini(int(shown.maxHp),int(shown.hp)+amount)
			spell.show_amount(uid,"heal",amount)
		elif kind=="shield":
			shown.shield=int(shown.get("shield",0))+amount
			spell.show_amount(uid,"shield",amount)
		elif kind=="death": card.depart()
		visual_units[uid]=shown
		_update_card(card,shown,false,false)

func _finish_presentation() -> void:
	presenting=false
	_capture_visual_state()
	_refresh()

func _restore_divider() -> void:
	if is_instance_valid(arena):
		var divide: Control=arena.get_node_or_null("Divide")
		if is_instance_valid(divide): divide.show()

func set_backgrounded(value: bool) -> void:
	if backgrounded==value: return
	backgrounded=value
	# Completed events remain committed. Discard only transient presentation and
	# input intent; returning waits a fresh action interval without fast-forward.
	target_id=""
	source_id=""
	action_kind="attack"
	form="normal"
	locked=0.0
	elapsed=0.0
	presenting=false
	if is_instance_valid(arena):
		for node: Node in arena.get_children():
			if node is BattleEffects or node.get_meta("battle_amount",false):
				arena.remove_child(node)
				node.queue_free()
	_refresh()
	if backgrounded:
		battle_title.text+=" · 已暂停"
		process_mode=Node.PROCESS_MODE_DISABLED
	else:
		process_mode=Node.PROCESS_MODE_INHERIT
		ignore_resume_delta=true
		_resize_safe_layout()

func set_settlement(result: Dictionary) -> void:
	result_data=result
	if is_instance_valid(controls): _refresh_controls(GameCombat.current_actor(battle))

func _result_message(data: Variant) -> String:
	if data is Dictionary:
		if data.has("message"): return str(data.message)
		var reward: Dictionary=data.get("reward",data.get("resources",{}))
		var pieces: PackedStringArray=[]
		for key: String in reward:
			if float(reward[key])>0: pieces.append("%s +%d" % [{"stone":"灵石","xp":"修为","material":"灵材","herb":"灵药","ticket":"召请符","fate":"道缘"}.get(key,key),reward[key]])
		return " · ".join(pieces)
	return str(data) if data!=null else ""

func _speed() -> void:
	var previous_speed: int=int(settings.get("speed",1))
	settings["speed"]=previous_speed%3+1
	locked=locked*float(previous_speed)/float(settings.speed)
	for node: Node in arena.get_children():
		if node is BattleEffects: node.speed=float(settings.speed)
	for node: UnitCard in unit_nodes.values():
		node.playback_speed=float(settings.speed)
		if is_instance_valid(node.body): node.body.playback_speed=float(settings.speed)
	speed_button.text="%d×" % settings.speed
	speed_changed.emit(int(settings.speed))

func _request_exit() -> void:
	if battle.get("result")!=null:
		if result_data.get("ok",false): leave_requested.emit()
		return
	var text: String="离开后保留锁定战前记录，下次继续重开当前战斗；已登记丹药不再扣除。演武离开不会留下正式收益。"
	_details("返回整备",text)
	_btn(detail_overlay.get_node("Panel/Box"),"确认返回",func() -> void: leave_requested.emit(),true)

static func nezha_review_request(seed: int = 713, current_member: Dictionary = {}) -> Dictionary:
	var member: Dictionary={"id":"nezha","level":5,"branch":"A","treasure":1,"branchUnlocked":true}
	if not current_member.is_empty(): member.merge(current_member.duplicate(true),true)
	member.id="nezha"
	return {"stageId":1,"team":[member],"options":{"seed":seed,"trial":true,"battleId":"nezha-review-%d" % seed,"contextName":"哪吒 · 静态战斗体审核 · "+("当前培养" if not current_member.is_empty() else "标准化试用"),"enemies":[{"id":"review-guard","name":"石甲陪练","role":"soldier","row":"front","hp":1100,"atk":60,"def":18,"speed":72},{"id":"review-archer","name":"后阵陪练","role":"archer","row":"back","hp":720,"atk":44,"def":12,"speed":66}]}}

func _show_actor() -> void:
	var actor: Dictionary=GameCombat.current_actor(battle)
	if not actor.is_empty(): _show_unit(str(actor.uid))

func _show_unit(uid: String) -> void:
	var unit: Dictionary=_unit(uid)
	var lines: PackedStringArray=["生命 %d / %d · 护盾 %d\n攻击 %d · 防御 %d · 速度 %d\n神通冷却 %d" % [unit.hp,unit.maxHp,unit.shield,unit.atk,unit.def,unit.speed,unit.cd]]
	var cfg: Dictionary=GameData.character(str(unit.id))
	if not cfg.is_empty(): lines.append(str(cfg.skillName)+"："+str(cfg.skillDescription)); lines.append("被动："+str(cfg.passiveDescription))
	if unit.get("id")=="yunxiao": lines.append("三霄合阵："+str(GameCombat.combine_availability(battle).reason))
	for status: Dictionary in unit.get("statuses",[]): lines.append("%s · 剩%d轮\n%s" % [status.get("name",status.id),status.turns,GameData.content("STATUS_CONFIG",{}).get(status.id,{}).get("description","")])
	lines.append(str(GameData.content("COMBAT_RULES").roundTiming))
	lines.append(str(GameData.content("COMBAT_RULES").statusTiming))
	var sequence: PackedStringArray=[]
	for actor_uid: String in battle.get("order",[]).slice(int(battle.get("cursor",0))):
		var acting: Dictionary=_unit(actor_uid)
		if not acting.is_empty() and int(acting.hp)>0: sequence.append(str(acting.name))
	lines.append("本轮待行动："+" › ".join(sequence))
	_details(str(unit.name),"\n\n".join(lines))

func _report() -> void:
	var lines: PackedStringArray=["伤害为实际伤害；恢复仅计有效值。护盾贡献只记录实际吸收，不虚构避免伤害。"]
	for stat: Dictionary in battle.get("stats",{}).values():
		lines.append("%s　伤害%d · 有效恢复%d · 护盾吸收%d\n关键触发 %s" % [stat.name,stat.damage,stat.healing,stat.shieldAbsorbed,str(stat.get("triggers",{}))])
	lines.append("逐行动战报")
	for line: String in battle.get("log",[]): lines.append(line)
	_details("本场实际战果","\n\n".join(lines))

func _show_intents() -> void:
	var lines: PackedStringArray=[]
	for unit: Dictionary in battle.get("units",[]):
		if unit.side=="enemy" and int(unit.hp)>0:
			lines.append("%s · %s\n%s" % [unit.name,"定力%d/%d" % [unit.get("will",0),unit.get("maxWill",0)] if unit.get("boss",false) else "前排" if unit.row=="front" else "后排",unit.get("intent","普通攻势")])
	_details("敌方意图","\n\n".join(lines))

func _settlement_details() -> void:
	var data: Variant=result_data.get("data")
	var lines: PackedStringArray=[_result_message(data)]
	var drops: Dictionary=data.get("equipment",{}) if data is Dictionary else {}
	for artifact: Dictionary in drops.get("items",[]): lines.append("获得灵装 · %s · %d星" % [GameEquipment.display_name(artifact),artifact.rarity])
	if int(drops.get("overflowStone",0))>0: lines.append("灵装背包已满，按规则转为灵石%d" % drops.overflowStone)
	_details("实际结算成果","\n\n".join(lines))
	settlement_items=drops.get("items",[])
	settlement_item_index=0
	if not settlement_items.is_empty():
		var items_row: HBoxContainer=_row(detail_overlay.get_node("Panel/Box"))
		if settlement_items.size()>1: _btn(items_row,"前件",_settlement_item_turn.bind(-1))
		settlement_item_button=_btn(items_row,"",func() -> void: gear_requested.emit(str(settlement_items[settlement_item_index].id)),true)
		if settlement_items.size()>1: _btn(items_row,"后件",_settlement_item_turn.bind(1))
		_settlement_item_turn(0)
		_repage_details.call_deferred()

func _settlement_item_turn(direction: int) -> void:
	settlement_item_index=posmod(settlement_item_index+direction,settlement_items.size())
	settlement_item_button.text="查看 · "+str(settlement_items[settlement_item_index].name)

func _details(title: String, text: String) -> void:
	if is_instance_valid(detail_overlay): detail_overlay.queue_free()
	detail_overlay=Control.new()
	detail_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	detail_overlay.z_index=40
	add_child(detail_overlay)
	var shade: ColorRect=ColorRect.new()
	shade.color=Color(0,0.02,0.04,0.94)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	detail_overlay.add_child(shade)
	var panel: PanelContainer=PanelContainer.new()
	panel.name="Panel"
	panel.add_theme_stylebox_override("panel",GameTheme.box(GameTheme.PANEL,GameTheme.GOLD,12,14))
	detail_overlay.add_child(panel)
	var box: VBoxContainer=VBoxContainer.new()
	box.name="Box"
	box.add_theme_constant_override("separation",6)
	panel.add_child(box)
	_label(box,title,25,GameTheme.GOLD)
	detail_text=text
	detail_page=0
	detail_label=_label(box,"",15)
	detail_label.size_flags_vertical=Control.SIZE_EXPAND_FILL
	var pager: HBoxContainer=_row(box)
	detail_previous=_btn(pager,"上一页",_detail_turn.bind(-1))
	detail_page_label=_label(pager,"",13)
	detail_page_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	detail_next=_btn(pager,"下一页",_detail_turn.bind(1))
	_btn(box,"关闭",func() -> void: detail_overlay.queue_free())
	_resize_details()
	_settle_details.call_deferred(panel.get_instance_id())

func _settle_details(panel_id: int) -> void:
	# Containers initially measure buttons before their width is assigned. Wait
	# for native sorting so a wide report does not inherit narrow text heights.
	if not is_inside_tree(): return
	var tree: SceneTree=get_tree()
	for frame_index: int in 2:
		await tree.process_frame
		if not is_inside_tree(): return
	if not is_instance_id_valid(panel_id): return
	var panel: Control=instance_from_id(panel_id)
	if is_instance_valid(panel) and is_instance_valid(detail_overlay) and detail_overlay.get_node("Panel")==panel: _resize_details()

func _repage_details() -> void:
	if not is_instance_valid(detail_overlay) or not is_instance_valid(detail_label): return
	var panel: Control=detail_overlay.get_node("Panel")
	var width: float=maxf(60,panel.size.x-30)
	var box: VBoxContainer=panel.get_node("Box")
	var reserved: float=40+float(box.get_theme_constant("separation"))*maxi(0,box.get_child_count()-1)
	for node: Control in box.get_children():
		if node!=detail_label: reserved+=node.get_combined_minimum_size().y
	var height: float=maxf(35,panel.size.y-reserved)
	detail_pages.clear()
	var page := ""
	for paragraph: String in detail_text.split("\n",true):
		var candidate: String=page+paragraph+"\n"
		if _detail_fits(candidate,width,height):
			page=candidate
			continue
		if not page.is_empty(): detail_pages.append(page); page=""
		# Long descriptions wrap onto additional pages without dropping a character.
		for character: String in paragraph:
			if not page.is_empty() and not _detail_fits(page+character,width,height):
				detail_pages.append(page); page=""
			page+=character
		page+="\n"
	if not page.is_empty(): detail_pages.append(page)
	if detail_pages.is_empty(): detail_pages.append("暂无记录。")
	detail_page=clampi(detail_page,0,detail_pages.size()-1)
	_update_detail_page()

func _detail_fits(value: String,width: float,height: float) -> bool:
	# Shape with the actual Label's smart wrapping, font and line spacing. A
	# separate Font estimate can disagree with native CJK paragraph wrapping.
	detail_label.size.x=width
	detail_label.text=value
	return detail_label.get_minimum_size().y<=height

func _detail_turn(direction: int) -> void:
	detail_page=clampi(detail_page+direction,0,detail_pages.size()-1)
	_update_detail_page()

func _update_detail_page() -> void:
	if not is_instance_valid(detail_label): return
	detail_label.text=detail_pages[detail_page]
	detail_page_label.text="%d / %d" % [detail_page+1,detail_pages.size()]
	detail_previous.disabled=detail_page==0
	detail_next.disabled=detail_page==detail_pages.size()-1
