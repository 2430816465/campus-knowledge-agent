class_name ActivitiesScreen
extends Control
## One-screen activity tables. Commands always go through the host's transaction API.
const Activities = preload("res://scripts/game_activities.gd")
const Illustrated = preload("res://scripts/game_illustrated_icon.gd")
const INK := Color("214756")
const JADE := Color("4d8493")
const GOLD := Color("b1925e")
const CREAM := Color("edf3ef")
const ELEMENTS := ["木", "水", "火", "金", "土"]
const COLORS := [Color("72a58a"), Color("73a8bd"), Color("cf8267"), Color("d9ba6f"), Color("a8967d")]
var app: Variant
var activity_id: String = "067"
var content: Dictionary = {}
var board: Control
var action_buttons: Array[Button] = []
var cell_buttons: Array[Button] = []
var title_label: Label
var description_label: Label
var stats_label: Label
var log_label: Label
var footer_label: Label
var pending: Dictionary = {}
var busy: bool = false
var last_budget: float = -1
var header_icon: Control
static var _portrait_cache: Dictionary = {}

class ActivityCanvas extends Control:
	var screen: Variant
	func _draw() -> void:
		if screen == null: return
		draw_style_box(GameTheme.skin("panel", 5), Rect2(Vector2.ZERO, size))
		var run: Dictionary = screen.content.get("run", {})
		var kind: String = str(screen.content.get("definition", {}).get("kind", ""))
		if run.is_empty():
			var center: Vector2 = size * Vector2(0.5, 0.48)
			for i: int in 4:
				var radius: float = minf(size.x * 0.28, size.y * 0.40) - i * 9
				if radius > 4: draw_arc(center, radius, -PI * 0.12, PI * 1.2, 60, Color(0.32,0.53,0.43,0.18 + i * 0.03), 2.0, true)
			for i: int in 6:
				var x: float = size.x * float(i + 1) / 7.0
				draw_colored_polygon(PackedVector2Array([Vector2(x - 44, size.y - 8), Vector2(x, size.y * (0.43 + 0.08 * (i % 3))), Vector2(x + 50, size.y - 8)]), Color(0.25,0.46,0.57,0.06 + 0.03 * (i % 2)))
			return
		var m: Dictionary = run.model
		if kind == "plinko":
			var left: float = 25
			var dx: float = (size.x - 50) / 5.0
			var dy: float = (size.y - 28) / 7.0
			for row: int in 6:
				for lane: int in 5: draw_circle(Vector2(left + dx * (lane + 0.5), 12 + dy * (row + 0.5)), 3, screen.GOLD)
			var points: PackedVector2Array = []
			for row: int in m.path.size(): points.append(Vector2(left + dx * (int(m.path[row]) + 0.5), 10 + dy * row))
			if points.size() > 1: draw_polyline(points, screen.JADE, 3, true); draw_circle(points[-1], 7, screen.CREAM); draw_arc(points[-1], 7, 0, TAU, 24, screen.GOLD, 2, true)
		elif kind == "race":
			for lane: int in 3:
				var x: float = size.x * float(lane + 1) / 4.0
				draw_line(Vector2(x, 12), Vector2(x, size.y - 12), Color(0.40,0.55,0.43,0.23), size.x / 4.8, true)
				if lane == int(m.obstacle): draw_colored_polygon(PackedVector2Array([Vector2(x, 18), Vector2(x - 14, 44), Vector2(x + 14, 44)]), Color("b47758"))
				if lane == int(m.wind): draw_arc(Vector2(x, 35), 12, 0.2, PI * 1.7, 24, Color("7fbac0"), 4, true)
			var player: Vector2 = Vector2(size.x * float(int(m.lane) + 1) / 4.0, size.y - 38)
			draw_colored_polygon(PackedVector2Array([player + Vector2(-20, 8), player + Vector2(-12,-7), player + Vector2(0,-15), player + Vector2(12,-7), player + Vector2(20,8)]), screen.JADE)
			draw_line(player + Vector2(-21,10), player + Vector2(21,10), screen.GOLD, 3, true)
		elif kind in ["escort", "defense"]:
			for lane: int in 3:
				var x: float = size.x * (lane + 0.5) / 3.0
				draw_line(Vector2(x, 34), Vector2(x, size.y - 24), Color(0.33,0.54,0.47,0.17), 10, true)
				draw_colored_polygon(PackedVector2Array([Vector2(x - 9, 18), Vector2(x, 33), Vector2(x + 9,18)]), Color("ad6952"))
			if kind == "escort":
				for lane: int in 3:
					var x: float = size.x * (lane + 0.5) / 3.0
					for i: int in int(m.swords[lane]): draw_line(Vector2(x - 5 + i * 10, size.y - 26), Vector2(x - 5 + i * 10, size.y - 55), screen.JADE, 4, true)
				draw_colored_polygon(PackedVector2Array([Vector2(20,size.y-22), Vector2(size.x-20,size.y-22), Vector2(size.x-46,size.y-7), Vector2(46,size.y-7)]), Color("876a49"))
		elif kind in ["dream", "tower", "ruins", "reincarnation", "construct", "puppet", "boss", "astral", "body", "damage"]:
			var nodes: int = 5 if kind == "dream" else 6 if kind == "reincarnation" else 4
			if kind == "ruins": nodes = 8
			for i: int in nodes:
				var p: Vector2 = Vector2((i + 0.5) * size.x / nodes, size.y * (0.20 + 0.12 * (i % 2)))
				if i > 0: draw_line(Vector2((i - 0.5) * size.x / nodes, size.y * (0.20 + 0.12 * ((i - 1) % 2))), p, Color("afbfbd"), 2, true)
				draw_circle(p, minf(17,size.x/nodes/3), screen.JADE if i < int(run.step) else Color("d7d4b8"))
				draw_arc(p, minf(20,size.x/nodes/3+3), 0, TAU, 32, screen.GOLD, 1, true)
			var side: float = minf(76, minf(size.y * 0.44, size.x / maxf(1,run.team.size()) - 12))
			for i: int in run.team.size():
				var art: Texture2D = screen._hero_texture(str(run.team[i].id))
				var rect: Rect2 = Rect2(Vector2(size.x*(i+0.5)/run.team.size()-side/2, size.y*0.54),Vector2.ONE*side)
				if art != null: draw_texture_rect(art,rect,false)
				draw_line(rect.position+Vector2(0,side+2),rect.end+Vector2(0,2),screen.GOLD,2,true)

static func build(g: Node, parent: Node, id: String) -> ActivitiesScreen:
	var screen: ActivitiesScreen = load("res://scripts/activities_screen.gd").new()
	screen.name = "ActivitiesScreen_" + id
	screen.app = g; screen.activity_id = id
	parent.add_child(screen)
	return screen

func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	resized.connect(_layout)
	_rebuild()

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, Vector2(size.x, _budget())), Color("edf4f5"))
	var divider: float = 40 if _budget() < 390 else 66 if _budget() < 465 or size.x < 390 else 78
	draw_rect(Rect2(0, 0, size.x, divider), Color("e1eef1"))
	draw_line(Vector2(8,divider), Vector2(size.x-8,divider), Color("a9c3cc"), 1, true)

func _budget() -> float:
	if is_instance_valid(app) and app.has_meta("page_content_height"): return maxf(240, float(app.get_meta("page_content_height")))
	return maxf(390, get_viewport_rect().size.y - 290)

func _new_label(text: String, fs: int, color: Color = INK) -> Label:
	var node: Label = GameTheme.label(text, fs, color)
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(node)
	return node

func _rebuild() -> void:
	if not is_inside_tree() or not is_instance_valid(app): return
	busy = false
	for child: Node in get_children(): remove_child(child); child.queue_free()
	action_buttons.clear(); cell_buttons.clear()
	content = Activities.view(app.state(), activity_id)
	if content.is_empty(): return
	var cfg: Dictionary = content.definition
	var r: Dictionary = content.run
	header_icon = Illustrated.icon(self, _kind_icon(str(cfg.kind)), false)
	title_label = _new_label(str(cfg.name), 24)
	description_label = _new_label(_description(str(cfg.kind)), 14, GameTheme.MUTED)
	stats_label = _new_label(_stats(), 15, JADE)
	var canvas := ActivityCanvas.new()
	canvas.screen = self; canvas.mouse_filter = Control.MOUSE_FILTER_PASS
	board = canvas; add_child(board)
	_make_board_cells()
	var logs: Array = r.get("log", [])
	var message: String = str(logs[-1]) if not logs.is_empty() else "本局会随每次合法操作保存。关闭页面后可以继续。"
	if r.is_empty() and cfg.kind == "milestones": message = "本版起累计实际消耗；旧档仅追溯已记录的神仙培养。"
	if r.is_empty() and cfg.kind == "festival": message = str(Activities.rules().riddle.question)
	if r.is_empty() and cfg.kind == "celebration": message = "选择论题查看题干与选项。收集庆典印记可兑换纪念名片。"
	if cfg.kind == "existing": message = "该系统使用原有界面与进度，请由目录返回对应入口。"
	log_label = _new_label(message, 14, INK)
	var actions: Array = content.actions
	if not pending.is_empty():
		if pending.has("topic"):
			var topic: Dictionary = Activities.rules().topics[int(pending.topic)]
			log_label.text = str(topic.question)
			actions = []
			for i: int in topic.answers.size(): actions.append({"label": str(topic.answers[i]), "cmd": "activityAct", "args": {"action": "debate", "topic": int(pending.topic), "choice": i}})
			actions.append({"label": "返回庆典", "cmd": "dismiss", "args": {}})
		else:
			var args: Dictionary = pending.args
			var preview: Dictionary = Activities.inheritance_preview(app.state(), int(args.choice), int(args.target))
			log_label.text = "%s → %s，成长至%d级。%s" % [preview.get("donorName", "副兽"), preview.get("targetName", "主兽"), int(preview.get("newLevel", 1)), preview.get("consumes", "")]
			var confirmed: Dictionary = args.duplicate(true)
			confirmed.erase("requiresConfirm"); confirmed.confirmed = true
			actions = [{"label": "确认传承并继承技能", "cmd": "activityAct", "args": confirmed}, {"label": "取消", "cmd": "dismiss", "args": {}}]
	for action: Dictionary in actions:
		var button: Button = Illustrated.button(self, _action_caption(str(action.label)), _action_icon(action), _invoke.bind(action))
		button.disabled = bool(action.get("disabled", false))
		button.name = "ActivityAction_" + str(action.args.get("action", action.cmd))
		button.custom_minimum_size = Vector2.ZERO
		button.modulate.a = 0.42 if button.disabled else 1.0
		button.get_node("Art").halo = false
		var caption: Label = button.get_node("Caption")
		caption.add_theme_color_override("font_color", INK)
		caption.add_theme_color_override("font_outline_color", Color("eff7f1"))
		caption.add_theme_constant_override("outline_size", 1)
		caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		action_buttons.append(button)
	footer_label = _new_label("本地演练 · 真人功能待接入" if bool(cfg.network) and cfg.kind in ["online", "puppet"] else "个人短程赛 · 非真人竞速" if cfg.kind == "race" else "本项目原创规则 · 可关闭后继续", 12, GameTheme.MUTED)
	_layout()
	_layout.call_deferred()

func _kind_icon(kind: String) -> String:
	return str({"tower":"tower","dream":"lotus","ruins":"treasure","cards":"summon","sigils":"seal","chess":"taiji","construct":"forge","puppet":"armor","beasts":"beast","defense":"estate","plinko":"pendant","race":"boots","match":"gourd","mansion":"estate","puzzle":"mirror","escort":"sword","reincarnation":"meditation","exorcism":"hunt","festival":"festival","celebration":"events","milestones":"gift","online":"guild","boss":"hunt","body":"armor","astral":"taiji","damage":"battle"}.get(kind,"adventure"))

static func _hero_texture(id: String) -> Texture2D:
	if not _portrait_cache.has(id):
		var definition: Dictionary = GameData.character(id)
		var path: String = str(definition.get("avatarPath", "res://assets/avatars/%s-premium.webp" % id))
		_portrait_cache[id] = load(path) if ResourceLoader.exists(path) else null
	return _portrait_cache[id]

func _action_icon(action: Dictionary) -> String:
	var command: String = str(action.cmd)
	if command == "activityStart": return _kind_icon(str(content.definition.kind))
	if command == "activityEquipCosmetic": return "scroll"
	if command in ["activitySettle", "activityClaimMilestone", "activityFestivalExchange"]: return "chest" if command == "activitySettle" else "gift"
	return str({"fight":"battle","target":"hunt","boon":"lotus","safe":"adventure","risk":"fire","exit":"estate","leave":"estate","abandon":"scroll","growth":"summon","allocate":"taiji","resolve":"seal","craft":"forge","talent":"meditation","explore":"adventure","inherit":"beast","team":"friends","lock":"seal","recruit":"summon","merge":"forge","wave":"battle","drop":"pendant","drive":"boots","hint":"mirror","answer":"seal","focus":"sword","repair":"ingot","charge":"fire","path":"lotus","request":"scroll","assist":"friends","receive":"gift","list":"treasure","cancel":"scroll","bid":"stone","tick":"bell","settle_trade":"chest","resupply":"gourd","develop":"forge","support":"friends","ready":"guild","strategy":"sword","riddle":"festival","participate":"gift","debate":"scroll"}.get(str(action.args.get("action", "")),"scroll"))

func _action_caption(value: String) -> String:
	return value.replace("纪念名片 · ", "").replace("纪念名片·", "").replace("纪念物 · ", "").replace("免费查看下一步提示", "下一步提示\n免费").replace("确认传承并继承技能", "确认传承\n并继承技能").replace(" · ", "\n")

func _stats() -> String:
	var r: Dictionary = content.run
	if r.is_empty():
		if not content.festival.is_empty(): return "收集物 %d  ·  已兑换 %d 项" % [int(content.festival.tokens), content.festival.purchases.size()]
		return "已完成 %d 局  ·  最佳成绩 %d" % [int(content.record.get("wins", 0)), int(content.record.get("best", 0))]
	var m: Dictionary = r.model
	var kind: String = str(content.definition.kind)
	var prefix: String = "生命 %d%%  ·  成绩 %d" % [int(r.hp), int(r.score)]
	match kind:
		"tower": return "第%d层  ·  锋芒%d  ·  坚壁%d  ·  成绩%d" % [int(m.floor), int(m.might), int(m.ward), int(r.score)]
		"ruins": return "临时遗宝 %d  ·  危险 %d%%  ·  生命 %d%%" % [int(m.loot), int(m.risk), int(r.hp)]
		"cards": return "灵力 %d = 攻击%d + 护持%d  ·  敌方%d" % [int(m.budget), int(m.allocate), int(m.budget)-int(m.allocate), int(m.enemyHp)]
		"sigils": return "下一符：%s  ·  已布%d/9  ·  生命%d%%" % [ELEMENTS[int(m.next)], int(m.placed), int(r.hp)]
		"construct", "puppet": return "零件%d  ·  武器%d  ·  护甲%d  ·  探索%d/3" % [int(m.parts), int(m.weapon), int(m.armor), int(m.explored)]
		"defense": return "铜钱%d  ·  仙府%d  ·  敌阵%d  ·  第%d波" % [int(m.coins), int(r.hp), int(m.enemyHp), int(r.step)+1]
		"plinko": return "剩余灵珠 %d  ·  积分 %d  ·  落点18/8/5/8/18分" % [int(m.balls), int(r.score)]
		"race": return "座驾成长+%d  ·  耐久%d%%  ·  速度%d  ·  %d/12段" % [int(m.growth),int(r.hp), int(m.speed), int(r.turn)]
		"match": return "采集 %d/25  ·  剩余%d步  ·  成绩%d" % [int(m.collected), int(m.moves), int(r.score)]
		"mansion": return "线索%d  ·  铜钥%d  ·  已探%d/6间" % [int(m.clues), int(m.keys), m.rooms.size()]
		"puzzle": return "目标：九格全部归木  ·  已转动%d次" % int(r.turn)
		"escort": return "仙舟耐久%d%%  ·  灵力%d  ·  第%d/6波" % [int(r.hp), int(m.energy), mini(6,int(r.step)+1)]
		"online":
			if content.definition.group == "development": return "本地沙盘 · 本体支援+%d · 营地%d · 补给%d" % [int(m.inherited),int(m.round),int(m.supply)]
			return "本地沙盘  ·  阶段%s  ·  积分%d  ·  补给%d" % [_phase_name(str(m.phase)), int(m.points), int(m.supply)]
	return prefix + "  ·  进度%d" % int(r.step)

func _phase_name(value: String) -> String:
	return str({"prepare":"准备","missions":"盟会任务","training":"推演","pending":"待处理","receivable":"待收取","listed":"已挂单","done":"完成","capture":"推进","resupplied":"已补给"}.get(value,"准备"))

func _invoke(action: Dictionary) -> void:
	if busy or not is_inside_tree() or not is_instance_valid(app): return
	if action.cmd == "dismiss": pending = {}; _rebuild.call_deferred(); return
	var args: Dictionary = action.args.duplicate(true)
	if args.get("requiresConfirm", false): pending = action.duplicate(true); _rebuild.call_deferred(); return
	if args.get("previewTopic", false): pending = {"topic": int(args.topic)}; _rebuild.call_deferred(); return
	if not args.has("id"): args.id = activity_id
	var r: Dictionary = content.get("run", {})
	if not r.is_empty() and action.cmd == "activityAct": args.runId = r.id; args.revision = int(r.revision)
	busy = true
	for button: Button in action_buttons: button.disabled = true
	for button: Button in cell_buttons: button.disabled = true
	var result: Dictionary = app.command(str(action.cmd), args, false)
	if result.get("ok", false):
		pending = {}
		if app.has_method("_update_wallet"): app.call("_update_wallet")
		if result.get("data") is Dictionary and result.data.has("message"): app.toast(str(result.data.message))
	_rebuild.call_deferred()

func _cell(text: String, action: String, choice: int, tint: Color = CREAM, selected: bool = false, extra: Dictionary = {}) -> void:
	var args: Dictionary = {"action": action, "choice": choice}
	args.merge(extra, true)
	var b: Button = GameTheme.button(text, _invoke.bind({"cmd": "activityAct", "args": args}), false)
	b.name = "ActivityCell_%s_%d" % [action,choice]
	b.custom_minimum_size = Vector2.ZERO
	b.add_theme_font_size_override("font_size", 14)
	b.add_theme_stylebox_override("disabled", GameTheme.box(Color("dce6e7"), Color("a4bdc5"), 5, 1))
	var paper: Color = Color("eff5f5").lerp(tint, 0.24)
	b.add_theme_stylebox_override("normal", GameTheme.box(paper, tint.darkened(0.2) if selected else Color("a4bdc5"), 5, 2 if selected else 1))
	b.add_theme_stylebox_override("hover", GameTheme.box(paper.lightened(0.06), JADE, 5, 2))
	b.add_theme_stylebox_override("pressed", GameTheme.box(paper.darkened(0.08), GOLD, 5, 2))
	b.add_theme_color_override("font_color", INK)
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	board.add_child(b); cell_buttons.append(b)

func _portrait_cell(hero_id: String, text: String, action: String, choice: int) -> void:
	_cell("", action, choice, Color("d7e5e7"))
	var b: Button = cell_buttons[-1]
	var art: TextureRect = TextureRect.new()
	art.name = "Portrait"; art.texture = _hero_texture(hero_id)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE; art.clip_contents = true
	b.add_child(art)
	var caption: Label = GameTheme.label(text, 11, INK)
	caption.name = "UnitName"; caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	caption.autowrap_mode = TextServer.AUTOWRAP_OFF; b.add_child(caption)

func _make_board_cells() -> void:
	var r: Dictionary = content.run
	if r.is_empty():
		var label: Label = GameTheme.label(_board_intro(str(content.definition.kind)), 17, JADE)
		label.name = "BoardIntro"
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		label.offset_left = 28; label.offset_right = -28
		board.add_child(label)
		return
	var m: Dictionary = r.model
	var kind: String = str(content.definition.kind)
	match kind:
		"chess":
			for i: int in 25: _cell("我" if i == int(m.player) else "敌" if i in m.enemies else "·", "move", i, Color("93b69a") if i == int(m.player) else Color("d9a48a") if i in m.enemies else CREAM)
		"sigils":
			for i: int in 9: _cell("＋" if int(m.board[i]) < 0 else ELEMENTS[int(m.board[i])], "place", i, CREAM if int(m.board[i]) < 0 else COLORS[int(m.board[i])])
		"match", "puzzle":
			for i: int in m.board.size(): _cell(ELEMENTS[int(m.board[i])], "collect" if kind == "match" else "rotate", i, COLORS[int(m.board[i])], kind == "puzzle" and i == int(m.hint))
		"cards":
			for i: int in m.deck.size(): _cell("%s\n命%d 攻%d" % [m.deck[i].name, int(m.deck[i].hp), int(m.deck[i].atk)], "select", i, COLORS[i % 5], i == int(m.selected))
		"beasts":
			for beast: Dictionary in m.beasts: _cell("%s %d级%s\n%s%s" % [beast.name, int(beast.level), " · 阵" if beast.id in m.team else "", {"strike":"猛攻","guard":"护甲","heal":"恢复"}[beast.skill], " · 锁定" if beast.locked else ""], "select", int(beast.id), COLORS[int(beast.id)], int(beast.id) == int(m.selected))
		"defense":
			for i: int in 6:
				var hero_id: String = str(r.team[i % r.team.size()].id)
				if int(m.board[i]) == 0: _cell("前阵·空位" if i < 3 else "后阵·空位", "place", i)
				else: _portrait_cell(hero_id,"%s·%d阶" % [GameData.character(hero_id).name,int(m.board[i])],"recall",i)
			for i: int in m.bench.size(): _cell("待命%d阶" % int(m.bench[i]), "select", i, Color("e6d4a9"), i == int(m.selected))
		"mansion":
			for i: int in 6: _cell(["书房","侧室","守卫","静室","门阵","遗宝室"][i] + (" · 已探" if i in m.rooms else ""), "room", i, Color("b8c7ae") if i in m.rooms else CREAM)
		"exorcism":
			for i: int in 6: _cell(["玄岩封印","青木封印","群妖封印","净化坛","护法坛","最终魔阵"][i] + ("\n已完成" if i in m.visited else ""), "node", i, Color("b8c7ae") if i in m.visited else CREAM)
		"online":
			if content.definition.group == "clues":
				for i: int in 9: _cell("残图%d%s" % [i+1,"✓" if i in m.clues else ""], "clue", i, Color("b8c7ae") if i in m.clues else CREAM)
			elif content.definition.group in ["territory","tide","core","explore","development"]:
				for i: int in 9: _cell(("核心" if i==8 else "节点%d" % (i+1)) + ("\n已占据" if i in m.owned else ""), "capture", i, Color("b8c7ae") if i in m.owned else CREAM)
			else:
				var label: Label = GameTheme.label(_practice_board_text(m), 17, JADE)
				label.name = "BoardIntro"
				label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				board.add_child(label); label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); label.offset_left=14; label.offset_right=-14
	if r.status != "active":
		for b: Button in cell_buttons: b.disabled = true

func _practice_board_text(m: Dictionary) -> String:
	var group: String = str(content.definition.group)
	if content.run.status == "ready":
		var badge: String = " · ".join(m.glory) if not m.glory.is_empty() else "真实段位与资产不受影响"
		return "本地沙盘已结束\n" + badge
	if group in ["trade", "auction"]: return "本地资产托管演练\n模拟余额%d · 托管%d\n不提交真实资产" % [int(m.balance),int(m.escrow)]
	if m.phase == "missions": return "盟会沙盘 · 第%d/3轮\n完成筹备、攻关、巡防后进入对阵\n当前任务 %d/3" % [int(m.round)+1,m.missions.size()]
	if m.phase == "training":
		var heading: String = "三局两胜 · 第%d/3轮 · %d胜%d负" % [mini(3,int(m.round)+1),int(m.seriesWins),int(m.seriesLosses)] if group == "bracket" else "本地对阵 · 第%d/3轮" % [mini(3,int(m.round)+1)]
		return heading + "\n对手策略：" + ["攻伐","守御","恢复"][int(m.target)] + "\n守御克攻伐 · 恢复克守御 · 攻伐克恢复"
	if m.phase == "prepare" and group not in ["gift","aid","seal","rescue"]: return "本地规则演练\n安排三个支援位后准备\n真人成员与真实赛程待联网"
	return "本地规则演练\n真实成员与共享账本待联网"

func _board_intro(kind: String) -> String:
	return str({"tower":"镇妖二十层\n自动交锋 · 层间选择锋芒或坚壁\n五层后可携成果离塔", "dream":"梦中修行\n本局临时成长，五次选择改变征途\n永久神仙与仙府保持完整", "cards":"出符之前，先分灵力\n攻击与护持共同使用本轮预算\n点击神符出战，再指定谁承伤", "sigils":"同纹成线，相生成阵\n横、竖、斜线影响镇魔与守御\n布置至少六枚后启动阵法", "chess":"步步为营\n上下左右移动一格，可吃掉目标敌子\n敌军随后推进，生存八回合", "beasts":"独立兽魂队伍\n先预览传承，再确认副兽消耗\n收藏锁和出战位保护有效", "defense":"守住仙府，也要破敌阵\n招募 · 同阶合成 · 选择单位后布置\n前排守御，后排进攻", "plinko":"五珠入星盘\n选择入口，观察六层阵钉路径\n五枚用尽后按落点积分结算", "race":"看清下一段道路\n移动至相邻赛道躲开障碍\n经过乘风点提高速度", "match":"葫芦收五行\n点击相邻的两枚以上同色灵珠\n八步采集二十五枚", "puzzle":"九宫机关\n点击会同时转动自身与相邻阵纹\n全部归木即可开启宝藏", "online":"本地沙盘演练\n无真人参与，不提交真实资产或排名\n账号与权威服务尚未连接", "festival":"仙府灯会\n制花灯 · 解灯谜 · 收集花笺\n兑换灵药、材料与纪念物", "celebration":"论道庆典\n三个原创论题，完成后收集印记\n领取参与成果与纪念名片", "milestones":"道途有迹可循\n已有培养投入自动追溯\n达成阶段条件即可领取"}.get(kind, "独立行程 · 随时续玩\n" + str(content.definition.description)))

func _description(kind: String) -> String:
	return str({"tower":"逐层挑战，选择祝福；五层后可带奖离塔。", "dream":"五次临时成长选择，共闯一场梦境。", "ruins":"携宝深入或及时撤离，风险由你决定。", "cards":"分配随机灵力，选择出战符与承伤符。", "sigils":"布置九宫阵纹，组合强化真实战斗。", "chess":"每回合走一格、吃敌子，生存八回合。", "construct":"打造道兵、选择天赋，再探索与试战。", "puppet":"本地傀儡演练，不参与真人竞赛或排名。", "beasts":"本局兽魂编队与传承；先预览再确认。", "defense":"招募、合成、布阵，守仙府并击破敌阵。", "plinko":"选择五次落珠入口，落点决定积分。", "race":"个人短程竞速；避障、乘风，跑完十二段。", "match":"八步内采集二十五枚相连的同色灵珠。", "mansion":"探查六间机关密室，寻钥、解谜取宝。", "puzzle":"转动九宫机关，使全部阵纹归木。", "escort":"分配飞剑与灵力，护送仙舟抵御六波。", "reincarnation":"六段轮回道路，选择影响战斗与结局。", "exorcism":"收集法印、净化节点，破除最后封印。", "online":"仅本地流程演练；真实服务尚未连接。", "festival":"制作花灯、解灯谜，收集花笺兑换好礼。", "celebration":"参与三个论题，收集印记兑换纪念物。", "milestones":"追溯真实培养投入、通关与活动成果。", "boss":"选择不同妖王；首胜结算后解锁扫荡。", "body":"三种炼体挑战，胜利获得炼体丹。", "astral":"五种敌阵各具特性，选择后自动挑战。", "damage":"五十次行动积累伤害，解锁三档宝箱。"}.get(kind, str(content.definition.description)))

func _layout() -> void:
	if not is_inside_tree() or not is_instance_valid(title_label): return
	last_budget = _budget(); custom_minimum_size.y = last_budget
	var w: float = maxf(250, size.x)
	var dense: bool = last_budget < 390
	var compact: bool = last_budget < 465 or w < 390
	var header: float = 44 if dense else 70 if compact else 86
	var stats: float = 32 if dense else 38 if compact else 32
	var log_h: float = 34 if dense else 40 if compact else 52
	var footer: float = 16 if dense else 20
	var rows: int = maxi(1, ceili(action_buttons.size() / 3.0))
	var button_h: float = 36 if dense else 64 if compact else 76
	var button_gap: float = 2 if dense else 5
	var actions_h: float = rows * (button_h + button_gap)
	var board_h: float = maxf(36, last_budget - header - stats - log_h - actions_h - footer - (8 if dense else 16))
	header_icon.position = Vector2(3,0); header_icon.size = Vector2.ONE * (38 if dense else 46)
	title_label.position = Vector2(53,2); title_label.size = Vector2(w-59, 28)
	title_label.add_theme_font_size_override("font_size",20 if compact else 24)
	description_label.text = "进度自动保存，可退出后继续" if dense else _description(str(content.definition.kind))
	description_label.add_theme_font_size_override("font_size",10 if dense else 12 if compact else 14)
	description_label.position = Vector2(53,25 if dense else 30); description_label.size = Vector2(w-59,header-(25 if dense else 30))
	stats_label.position = Vector2(6,header); stats_label.size = Vector2(w-12,stats)
	stats_label.add_theme_font_size_override("font_size",10 if dense else 12 if compact else 15)
	board.position = Vector2(4,header+stats); board.size = Vector2(w-8,board_h)
	if board.has_node("BoardIntro"):
		board.get_node("BoardIntro").add_theme_font_size_override("font_size", 10 if dense else 11 if compact else 17)
	log_label.position = Vector2(8,board.position.y+board_h+4); log_label.size = Vector2(w-16,log_h)
	log_label.add_theme_font_size_override("font_size",10 if dense else 12 if compact else 14)
	var start: float = log_label.position.y+log_h+(1 if dense else 3)
	var bw: float = (w-12)/3.0
	for i: int in action_buttons.size():
		action_buttons[i].position = Vector2(4+(i%3)*bw,start+(i/3)*(button_h+button_gap))
		action_buttons[i].size = Vector2(bw-4,button_h)
		var caption: Label = action_buttons[i].get_node("Caption")
		caption.add_theme_font_size_override("font_size",10 if dense else 11 if compact else 12)
		caption.position = Vector2(16,0) if dense else Vector2(0,button_h-38)
		caption.size = Vector2(bw-20,button_h) if dense else Vector2(bw-4,38)
		var art: Control = action_buttons[i].get_node("Art")
		art.size = Vector2.ONE * (16 if dense else button_h-38)
		art.position = Vector2(0,10) if dense else Vector2((bw-4-art.size.x)/2, 0)
	footer_label.add_theme_font_size_override("font_size",10 if dense else 12)
	footer_label.position = Vector2(6,last_budget-footer); footer_label.size = Vector2(w-12,footer)
	var kind: String = str(content.definition.kind)
	var columns: int = 5 if kind in ["chess","match"] else 2 if kind in ["cards","beasts"] else 3
	if compact and kind == "cards": columns = maxi(1,cell_buttons.size())
	var cell_rows: int = maxi(1, ceili(cell_buttons.size()/float(columns)))
	var cell_w: float = (board.size.x-20)/columns
	var cell_h: float = (board.size.y-16)/cell_rows
	for i: int in cell_buttons.size():
		cell_buttons[i].add_theme_font_size_override("font_size",clampi(int(cell_h/(4.0 if kind in ["cards", "beasts"] else 3.0)),10 if dense else 11,17))
		cell_buttons[i].position = Vector2(10+(i%columns)*cell_w,8+(i/columns)*cell_h)
		cell_buttons[i].size = Vector2(cell_w-4,cell_h-4)
		if cell_buttons[i].has_node("Portrait"):
			var art: TextureRect = cell_buttons[i].get_node("Portrait")
			var caption: Label = cell_buttons[i].get_node("UnitName")
			var side: float = minf(cell_w-10,cell_h-24)
			art.visible = side >= 20
			art.position = Vector2((cell_w-4-side)/2,2); art.size=Vector2.ONE*maxf(0,side)
			caption.position = Vector2(0,cell_h-23 if art.visible else 0); caption.size=Vector2(cell_w-4,18 if art.visible else cell_h-4)
			caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	board.queue_redraw()
	queue_redraw()
