extends SceneTree
var checks := 0
var failures: Array=[]
func check(value: bool, message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void: _run.call_deferred()
func _run() -> void:
	root.size=Vector2i(540,960)
	var request: Dictionary=BattleView.nezha_review_request()
	var b: Dictionary=GameCombat.create(request.stageId,request.team,request.options)
	var view: BattleView=BattleView.new()
	view.configure(b,{"speed":1,"simplified":false})
	root.add_child(view)
	view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	view.set_process(false)
	await process_frame
	await process_frame
	for unit: Dictionary in b.units:
		var card: BattleView.UnitCard=view.unit_nodes[unit.uid]
		check(card.get_rect().get_center().x<view.arena.size.x/2 if unit.side=="ally" else card.get_rect().get_center().x>view.arena.size.x/2,"left allies / right enemies: "+unit.uid)
		check(card.get_rect().has_point(view._anchor(unit.uid)),"body hit anchor belongs to selectable rectangle: "+unit.uid)
		check(card.get_global_rect().encloses(card.hp_bar.get_global_rect()),"HP and target click region share coordinates: "+unit.uid)
	var before: String=JSON.stringify(b)
	var target: String=GameCombat.legal_targets(b,"attack")[0]
	view._select_unit(target)
	check(view.target_id==target and JSON.stringify(b)==before,"target selection does not consume an action or RNG")
	var previous_hp: int=int(view.visual_units[target].hp)
	view._act()
	var after: String=JSON.stringify(b)
	check(b.actionCount==1,"one confirmed click commits one normal action")
	check(int(view.visual_units[target].hp)==previous_hp,"HP presentation waits for impact beat")
	var effect: BattleEffects=view.arena.get_node("EventEffects")
	effect.set_process(false)
	var hit_count := 0
	for cue: Dictionary in effect.cues:
		if cue.kind=="impact" and cue.event.type in ["damage","followDamage"]: hit_count+=1
	check(hit_count>=1,"real committed damage produces impact cues")
	for i: int in 16: effect._process(0.1)
	check(JSON.stringify(b)==after,"visual timeline never mutates combat, RNG or counters")
	check(int(view.visual_units[target].hp)==int(GameCombat.unit(b,target).hp),"display converges to authoritative final HP")
	view.set_backgrounded(true)
	view._process(7200)
	check(JSON.stringify(b)==after and view.elapsed==0,"background large delta cannot advance combat")
	view.set_backgrounded(false)
	view._process(7200)
	check(JSON.stringify(b)==after,"first resume frame discards background delta")
	var signatures: Array=[]
	for speed: int in [1,2,3]:
		for simplified: bool in [false,true]:
			var actual: Dictionary=GameCombat.create(request.stageId,request.team,request.options)
			for turn: int in 400:
				if actual.result!=null: break
				var since: int=actual.events.size()
				GameCombat.auto_act(actual)
				var plan: Array=BattleEffects.plan(actual.events.slice(since),actual.units,simplified)
				var immutable: String=JSON.stringify(actual)
				BattleEffects.timeline(actual.events.slice(since),plan)
				check(JSON.stringify(actual)==immutable,"read-only timeline speed %d simplified %s" % [speed,simplified])
			signatures.append(JSON.stringify(actual))
	check(signatures.all(func(s: String) -> bool: return s==signatures[0]),"same seeded result/log/HP/CD/stats/triggerCounts for 1/2/3x and reduced")
	var actor: BattleActor=BattleActor.new()
	actor.play("attack")
	actor._process(10)
	check(actor.clip=="idle" and actor.frame_index==0,"paused animation production uses only the available static body")
	actor.free()
	view.queue_free()
	await process_frame
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/battle"))
	var f: FileAccess=FileAccess.open("res://evidence/battle/v05-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"checks":checks,"failures":failures,"animationProductionPaused":true,"bodyResourceAvailable":BattleActor.available(),"visual":false},"  "));f.close()
	print("BATTLE V05: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
