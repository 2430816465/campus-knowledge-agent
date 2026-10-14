extends SceneTree
const Adventure=preload("res://scripts/adventure_screen.gd")
var checks := 0
var failures: Array=[]
class TestApp extends Control:
	var store: GameStore
	var body: VBoxContainer
	var overlay: Control
	var modal_box: VBoxContainer
	var confirmation := Callable()
	var confirm_text := ""
	var started_stage := 0
	var gifted := false
	var page := 2
	var subpage := "主线"
	var team_opened := false
	func state() -> Dictionary: return store.state
	func command(operation: String,args: Dictionary={},refresh: bool=true) -> Dictionary:
		var result: Dictionary=store.transact(operation,args)
		if result.ok and refresh: _render()
		return result
	func _render() -> void:
		for child: Node in body.get_children(): body.remove_child(child); child.queue_free()
		load("res://scripts/adventure_screen.gd").build_main(self,body)
	func _modal(_title: String) -> VBoxContainer:
		_close_modal()
		overlay=Control.new(); add_child(overlay)
		var panel := PanelContainer.new(); panel.name="Sheet"; overlay.add_child(panel)
		modal_box=VBoxContainer.new(); panel.add_child(modal_box)
		return modal_box
	func _close_modal() -> void:
		if is_instance_valid(overlay): remove_child(overlay); overlay.queue_free()
		overlay=null; modal_box=null
	func _fit_modal() -> void: pass
	func _confirm(_title: String,description: String,action: Callable) -> void:
		confirm_text=description; confirmation=action
	func _start_main(id: int) -> void: started_stage=id
	func _gift() -> void: gifted=true
	func _go(value: int) -> void: page=value
	func _team() -> void: team_opened=true
	func _team_names(ids: Array) -> String:
		var names: PackedStringArray=[]
		for id: String in ids: names.append(str(GameData.character(id).name))
		return " · ".join(names)
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void: _run.call_deferred()
func labels(node: Node) -> String:
	var parts: PackedStringArray=[]
	if node is Label: parts.append(node.text)
	for child: Node in node.get_children(): parts.append(labels(child))
	return "\n".join(parts)
func button_named(node: Node,part: String) -> Button:
	if node is Button and node.text.contains(GameNames.text(part)): return node
	for child: Node in node.get_children():
		var found: Button=button_named(child,part)
		if found!=null: return found
	return null
func screen_of(app: TestApp) -> Variant: return app.body.get_node("AdventureScreen")
func _run() -> void:
	var app := TestApp.new()
	app.store=GameStore.new("user://adventure-v05-%d" % Time.get_ticks_usec())
	check(app.store.load_slot().ok,"ordinary isolated store loads")
	app.theme=GameTheme.create()
	app.body=VBoxContainer.new(); app.body.size=Vector2(500,1400); app.add_child(app.body)
	root.add_child(app)
	var before: String=JSON.stringify(app.state())
	app._render()
	await process_frame
	var screen: Variant=screen_of(app)
	check(screen.chapter==1 and screen.selected_stage==1,"new player begins at actual first node")
	check(labels(screen).contains("灵泉初醒") and labels(screen).contains("灵脉核心"),"chapter displays correct title and core")
	check(screen.find_child("ChapterBackground",true,false).texture.resource_path==BattleView.chapter_background_path(1),"first chapter uses native existing background")
	check(screen.find_children("ChapterPath","",true,false).size()==1,"path is inside native panel")
	check(button_named(screen,"查看敌情与出发")!=null and not button_named(screen,"查看敌情与出发").disabled,"unlocked preview is enabled")
	check(button_named(screen,"材料扫荡")==null,"uncleared node has no sweep action")
	screen._preview(1)
	check(labels(app.modal_box).contains("敌方阵容") and labels(app.modal_box).contains(str(GameData.stage(1).enemies[0].name)),"preview shows actual enemy data")
	button_named(app.modal_box,"进入真实回合战斗").pressed.emit()
	check(app.started_stage==1,"preview calls original start API with actual stage")
	screen._select_stage(2)
	check(labels(screen).contains("请先通关前一节点") and button_named(screen,"暂未开启").disabled,"locked node shows real predecessor gate")
	for chapter: int in [2,3,1]:
		screen._select_chapter(chapter)
		await process_frame
		check(screen.find_child("ChapterBackground",true,false).texture.resource_path==BattleView.chapter_background_path((chapter-1)*4+1),"chapter %d has distinct native background" % chapter)
		check(screen.selected_stage==(chapter-1)*4+1,"chapter %d selects its actual first node" % chapter)
	check(JSON.stringify(app.state())==before,"path selection and enemy preview do not mutate ledger, RNG or inventory")
	var fixture: Dictionary=app.state().duplicate(true)
	fixture.cleared=[1,2,3,4]
	check(Adventure.stage_lock_reason(fixture,5)==GameEconomy._stage_error(fixture,5) and Adventure.stage_lock_reason(fixture,5).contains("灵脉核心"),"next chapter retains real core integration gate missed by old UI")
	fixture.integratedCores=["spring"]
	check(Adventure.stage_lock_reason(fixture,5).is_empty(),"integrating spring opens chapter two in the existing rule")
	fixture.cleared=[1,2,3,4,5,6,7,8]
	check(Adventure.stage_lock_reason(fixture,9).contains("炉心"),"chapter three retains furnace core integration gate")
	fixture.integratedCores=["spring","furnace"]
	check(Adventure.stage_lock_reason(fixture,9).is_empty(),"integrating furnace opens chapter three in existing rule")
	check(Adventure.next_stage(fixture)==9 and Adventure.chapter_clears(fixture,2)==4,"progress counters derive from actual cleared IDs")
	check(app.store.load_slot("demo:expedition-project").ok,"real isolated project demo loads")
	app._render(); screen=screen_of(app)
	before=JSON.stringify(app.state())
	for id: int in range(1,13):
		screen._select_chapter(int(GameData.stage(id).chapter))
		screen._select_stage(id)
		var cleared: bool=Adventure.has_clear(app.state(),id)
		var normal: bool=not GameData.stage(id).boss
		check((button_named(screen,"材料扫荡")!=null)==(cleared and normal),"sweep entry follows actual ordinary-node eligibility %d" % id)
	check(JSON.stringify(app.state())==before,"all 12 node previews remain read-only")
	screen._select_chapter(1); screen._select_stage(1)
	screen._start_sweep(1)
	check(app.confirm_text.contains("60秒") and app.confirm_text.contains("灵石 %d" % GameEconomy.stage_reward(1,false).stone),"confirmation displays actual repeat reward and wait")
	app.confirmation.call()
	check(app.state().materialSweep!=null and app.state().materialSweep.stageId==1,"UI starts actual atomic GameStore sweep")
	screen=screen_of(app)
	screen._sweep_details()
	check(labels(app.modal_box).contains("扫荡中") and button_named(app.modal_box,"领取扫荡成果").disabled,"actual not-ready sweep is visible and unclaimable")
	var ready: int=int(app.state().materialSweep.readyAt)
	var advanced: Dictionary=app.store.advance_demo_time(maxi(0,ready-app.store.now_ms()))
	check(advanced.ok,"real isolated demo clock advances sweep wait")
	app.command("advance",{},false)
	screen._update_sweep()
	check(not button_named(app.modal_box,"领取扫荡成果").disabled,"claim enables only when authoritative store time reaches readyAt")
	var resources: Dictionary=app.state().resources.duplicate(true)
	var reward: Dictionary=app.state().materialSweep.reward.duplicate(true)
	button_named(app.modal_box,"领取扫荡成果").pressed.emit()
	check(app.state().materialSweep==null and app.state().resources.stone==resources.stone+reward.stone and app.state().resources.ticket==resources.ticket,"claim gives committed repeat reward once and no tickets")
	var after: String=JSON.stringify(app.state())
	check(not app.command("claimMaterialSweep",{},false).ok and JSON.stringify(app.state())==after,"duplicate sweep claim changes no state")
	var request: Dictionary=app.command("prepareMainBattle",{"stageId":1,"options":{"id":"adventure-v05-continue","seed":713}},false)
	check(request.ok,"real main battle snapshot is prepared")
	app._render(); screen=screen_of(app)
	check(button_named(screen,"继续历练")!=null,"saved main snapshot continuation remains available")
	button_named(screen,"继续历练").pressed.emit()
	button_named(app.modal_box,"继续历练").pressed.emit()
	check(app.started_stage==1,"continuation uses same stored stage API")
	button_named(app.modal_box,"放弃战前记录").pressed.emit(); app.confirmation.call()
	check(app.state().mainBattle==null,"abandon uses actual existing snapshot transaction")
	# Visual fixture of earned choice/completion, never written into a real or test save.
	app.store.state=app.state().duplicate(true)
	app.store.state.choicePending=true
	app.store.state.cleared=range(1,13)
	app._render(); screen=screen_of(app)
	button_named(screen,"结缘自选").pressed.emit()
	check(app.gifted,"earned node-three choice keeps original gift API")
	button_named(screen,"雷泽归府").pressed.emit()
	button_named(app.modal_box,"查看引雷入府").pressed.emit()
	check(app.page==4 and app.subpage=="工程","node-twelve ending retains original thunder project entry")
	for fixture_size: Vector2 in [Vector2(516,630),Vector2(328,450)]:
		app.set_meta("page_content_height",fixture_size.y)
		app.body.size=fixture_size
		app._render(); screen=screen_of(app)
		for frame: int in 5: await process_frame
		check(screen.column.get_combined_minimum_size().y<=fixture_size.y+1,"chapter page minimum fits one screen %s: %s" % [str(fixture_size),str(screen.column.get_combined_minimum_size())])
		check(screen.column.get_combined_minimum_size().x<=fixture_size.x+1,"chapter page width fits %s" % str(fixture_size))
	app.store.release(); app._close_modal(); app.queue_free()
	await process_frame
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/adventure"))
	var file: FileAccess=FileAccess.open("res://evidence/adventure/v05-tests.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks":checks,"failures":failures,"transactions":"real GameStore isolated new/project demo; lock gate uses GameEconomy._stage_error","visual":false},"  "));file.close()
	print("ADVENTURE V05: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
