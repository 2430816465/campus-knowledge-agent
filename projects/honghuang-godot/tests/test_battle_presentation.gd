extends SceneTree
var checks := 0
var failures: Array = []
var families: Dictionary = {}
func check(value: bool, text: String) -> void:
	checks += 1
	if not value: failures.append(text); push_error(text)
func _initialize() -> void: _run.call_deferred()
func fixture(id: String, combined: bool = false, transferable: bool = true) -> Dictionary:
	var ids: Array = [id,"bigan","huangfeihu"] if id not in ["bigan","huangfeihu"] else [id,"taiyi","nezha"]
	if id=="yunxiao" or combined: ids=["yunxiao","qiongxiao","bixiao","tongtian","zhaogongming"]
	var team: Array=[]
	for hero: String in ids: team.append({"id":hero,"level":6,"branch":"A","treasure":1})
	var b: Dictionary=GameCombat.create(12,team,{"seed":713,"battleId":"presentation-"+id,"enemies":[{"id":"test-front","name":"前阵陪练","role":"soldier","row":"front","hp":50000,"atk":1,"def":20,"speed":1},{"id":"test-back","name":"后阵陪练","role":"archer","row":"back","hp":50000,"atk":1,"def":20,"speed":1}]})
	var actor: Dictionary=GameData.named(b.units,id)
	b.order=[actor.uid]
	for u: Dictionary in b.units:
		if u.uid!=actor.uid: b.order.append(u.uid)
		if u.side=="ally": u.hp=int(u.maxHp*0.55)
	b.cursor=0
	if id=="xuandu" and transferable: b.units[1].statuses.append({"id":"atkUp","name":"战令","turns":2,"power":0.15})
	return b
func cast(b: Dictionary, combined: bool = false) -> Array:
	var actor: Dictionary=GameCombat.current_actor(b)
	var source: String=str(b.units[1].uid) if actor.id=="xuandu" else ""
	var action: Dictionary={"kind":"skill","targetId":GameCombat.legal_targets(b,"skill",source)[0],"form":"combined" if combined else "normal"}
	if not source.is_empty(): action.sourceId=source
	var since: int=b.events.size()
	check(GameCombat.act(b,action),"real skill resolves "+str(actor.id))
	return b.events.slice(since)
func _run() -> void:
	for hero: Dictionary in GameData.content("CHARACTERS"):
		var b: Dictionary=fixture(hero.id)
		var events: Array=cast(b)
		var before: String=JSON.stringify(b)
		var plan: Array=BattleEffects.plan(events,b.units)
		check(not plan.is_empty() and plan[0].family!="strike","specific effect or role family "+str(hero.id))
		families[hero.id]=plan[0].family
		check(plan.size()<=BattleEffects.MAX_EFFECTS,"bounded timeline "+str(hero.id))
		for speed: int in [1,2,3]:
			for reduced: bool in [false,true]:
				var presentation: Array=BattleEffects.plan(events,b.units,reduced)
				var fx: BattleEffects=BattleEffects.new()
				fx.setup(presentation,{},speed)
				check(is_equal_approx(fx.duration/fx.speed,BattleEffects.total_duration(presentation)/speed),"speed presentation only "+str(hero.id))
				fx.free()
		check(JSON.stringify(b)==before,"drawing plan preserves battle, RNG, turns and counters "+str(hero.id))
	check(families.yangjian=="eye" and families.zhaogongming=="pearls" and families.tongtian=="swords","distinct core signatures")
	check(families.zhouwang=="rally" and families.jifa=="rally" and families.xuandu=="transfer","morale and selected buff transfer signatures")
	var no_buff: Dictionary=fixture("xuandu",false,false)
	check(BattleEffects.plan(cast(no_buff),no_buff.units)[0].family=="ward","no fabricated transfer when source has no transferable buff")
	var combined: Dictionary=fixture("yunxiao",true)
	var before_qiong: int=int(GameData.named(combined.units,"qiongxiao").cd)
	var before_bi: int=int(GameData.named(combined.units,"bixiao").cd)
	var combined_events: Array=cast(combined,true)
	var cloud_plan: Array=BattleEffects.plan(combined_events,combined.units)
	check(cloud_plan[0].family=="clouds" and cloud_plan[0].responderUids.size()==3,"three real responder anchors")
	check(combined.actionCount==1 and GameData.named(combined.units,"qiongxiao").cd==before_qiong and GameData.named(combined.units,"bixiao").cd==before_bi,"partner responses do not create actions or cooldowns")
	var view: BattleView=BattleView.new()
	view.configure(combined,{"speed":3,"simplified":false})
	root.add_child(view)
	view.set_process(false)
	await process_frame
	var positions: Dictionary={}
	for uid: String in view.unit_nodes: positions[uid]=view.unit_nodes[uid].position
	var state_before: String=JSON.stringify(combined)
	view.locked=BattleEffects.total_duration(cloud_plan)/3
	view._animate_events(combined_events,cloud_plan)
	var effect_node: BattleEffects=view.arena.get_node("EventEffects")
	check(effect_node.entries[0].responderUids.size()==3,"native effect retains partner identities")
	view._animate_events(combined_events,cloud_plan)
	check(view.arena.get_children().filter(func(n: Node) -> bool: return n is BattleEffects).size()==1,"repeated presentation keeps one effect node")
	await create_timer(0.65).timeout
	check(view.arena.get_children().filter(func(n: Node) -> bool: return n is BattleEffects or n.get_meta("battle_amount",false)).is_empty(),"effects and floating amounts clean themselves up")
	for uid: String in view.unit_nodes: check(view.unit_nodes[uid].position==positions[uid],"idle/cast never moves card "+uid)
	check(JSON.stringify(combined)==state_before,"native animation also preserves authoritative battle")
	var card: BattleView.UnitCard=view.unit_nodes.values()[0]
	card.struck(); card._process(0.01)
	check(card.hit_time>0,"subtle hit state exists")
	card.depart(); card._process(0.06)
	check(card.modulate.a<1 and card.modulate.a>0.42,"death fades in place")
	card._process(1)
	check(is_equal_approx(card.modulate.a,0.42),"departed card remains identifiable")
	view.queue_free()
	await process_frame
	var f: FileAccess=FileAccess.open("res://docs/audits/battle-presentation-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"checks":checks,"failures":failures,"heroFamilies":families,"visual":false,"notes":"Real combat event fixtures; animation, cleanup and immutable result checks. Not a formal audit round."},"  ")); f.close()
	print("BATTLE PRESENTATION: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
