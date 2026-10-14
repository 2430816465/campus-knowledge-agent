extends SceneTree
## Native graphical fixture. F6 captures real event animations at 1/2/3x and reduced.
## Space replays the selected committed event. Left/Right changes the fixture.
## Escape opens the normal isolated application for manual UI inspection.
const CASES: Array[String]=["yangjian","zhaogongming","yunxiao","tongtian","zhouwang","xuandu","taiyi","leizhenzi","jifa","qiongxiao","yuanshi","huangtianhua","qingxu","huanglong"]
var index := 0
var view: BattleView
var battle: Dictionary
var events: Array
var busy := false
var app: Control
var captured: Array=[]
var output: String="res://docs/audits/battle-motion"
func _initialize() -> void:
	root.window_input.connect(_input)
	_run.call_deferred()
func _run() -> void:
	root.size=Vector2i(540,960)
	_show(0)
	print("BATTLE MOTION READY. F6 = native capture suite; Space = replay; arrows = case; Escape = full isolated app.")
func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo or busy or is_instance_valid(app): return
	match event.keycode:
		KEY_F6: _capture_suite.call_deferred()
		KEY_SPACE: _replay()
		KEY_RIGHT: _show((index+1)%CASES.size())
		KEY_LEFT: _show((index+CASES.size()-1)%CASES.size())
		KEY_ESCAPE:
			if is_instance_valid(view): view.queue_free()
			app=load("res://scenes/main.tscn").instantiate()
			app.set_meta("ui_test",true)
			root.add_child(app)
			app._load_slot("demo:roster")
			app._go(1)
func _show(value: int, speed: int=1, simplified: bool=false, defeat: bool=false) -> void:
	index=value
	if is_instance_valid(view): root.remove_child(view); view.queue_free()
	var id: String=CASES[index]
	var ids: Array=[id,"bigan","huangfeihu"]
	if id=="huangfeihu" or id=="bigan": ids=[id,"taiyi","nezha"]
	if id=="yunxiao": ids=["yunxiao","qiongxiao","bixiao","tongtian","zhaogongming"]
	var members: Array=[]
	for hero: String in ids: members.append({"id":hero,"level":6,"branch":"A","treasure":1})
	battle=GameCombat.create(12,members,{"seed":713,"battleId":"visual-"+id,"enemies":[{"id":"motion-front","name":"前阵陪练","role":"soldier","row":"front","hp":1 if defeat else 50000,"atk":1,"def":20,"speed":1},{"id":"motion-back","name":"后阵陪练","role":"archer","row":"back","hp":50000,"atk":1,"def":20,"speed":1}]})
	var actor: Dictionary=GameData.named(battle.units,id)
	battle.order=[actor.uid]
	for u: Dictionary in battle.units:
		if u.uid!=actor.uid: battle.order.append(u.uid)
		if u.side=="ally": u.hp=int(u.maxHp*0.55)
	battle.cursor=0
	if id=="xuandu": battle.units[1].statuses.append({"id":"atkUp","name":"战令","turns":2,"power":0.15})
	var source: String=str(battle.units[1].uid) if id=="xuandu" else ""
	var action: Dictionary={"kind":"skill","targetId":GameCombat.legal_targets(battle,"skill",source)[0],"form":"combined" if id=="yunxiao" else "normal"}
	if not source.is_empty(): action.sourceId=source
	var since: int=battle.events.size()
	GameCombat.act(battle,action)
	events=battle.events.slice(since)
	battle.contextName=GameData.character(id).name+" · 神通演示"
	view=BattleView.new()
	view.configure(battle,{"speed":speed,"simplified":simplified})
	root.add_child(view)
	view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	view.set_process(false)
	view.top_label.text="原生效果检查"
	view.controls.hide()
	view.log_label.text="方向键：切换 · 空格：重播 · F6：验证全部\nEsc：进入完整游戏（独立测试存档）"
	view.leave_requested.connect(func() -> void: quit())
	_replay.call_deferred()
func _replay() -> void:
	if not is_instance_valid(view): return
	view.locked=BattleEffects.total_duration(BattleEffects.plan(events,battle.units,bool(view.settings.get("simplified",false))))/float(view.settings.get("speed",1))
	view._animate_events(events)
func _capture_suite() -> void:
	busy=true
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	for i: int in CASES.size():
		for speed: int in [1,2,3]:
			_show(i,speed,false)
			await process_frame
			await process_frame
			var before: String=JSON.stringify(battle)
			var plan: Array=BattleEffects.plan(events,battle.units)
			var started: int=Time.get_ticks_usec()
			var checkpoints: Array=[0.20,0.50,0.80] if speed==1 else [0.5]
			var next: int=0
			var frames: int=0
			while is_instance_valid(view.arena.get_node_or_null("EventEffects")):
				await process_frame
				frames+=1
				var effect: BattleEffects=view.arena.get_node_or_null("EventEffects")
				if is_instance_valid(effect) and next<checkpoints.size() and effect.age/effect.duration>=float(checkpoints[next]):
					await RenderingServer.frame_post_draw
					var path: String=output+"/%s-%dx-%02d.png" % [CASES[i],speed,int(float(checkpoints[next])*100)]
					root.get_texture().get_image().save_png(path)
					next+=1
			captured.append({"hero":CASES[i],"speed":speed,"family":plan[0].family,"expectedDuration":BattleEffects.total_duration(plan)/speed,"observedDuration":float(Time.get_ticks_usec()-started)/1000000.0,"frames":frames,"screenshots":next,"battleUnchanged":before==JSON.stringify(battle)})
	_show(0,1,false,true)
	await process_frame
	for frame_index: int in 24:
		await process_frame
		if frame_index in [0,5,20]:
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(output+"/death-state-%02d.png" % frame_index)
	_show(2,1,true)
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+"/three-clouds-simplified.png")
	var f: FileAccess=FileAccess.open(output+"/native-motion-report.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"renderer":RenderingServer.get_video_adapter_name(),"samples":captured,"native":true,"formalAudit":false},"  "));f.close()
	busy=false
	_show(2)
	print("NATIVE BATTLE MOTION CAPTURE COMPLETE: ",captured.size()," live animations. ",output)
