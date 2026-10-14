extends SceneTree
var checks := 0
var failures: Array[String]=[]
var observations: Array[Dictionary]=[]
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void: _run.call_deferred()
func settle() -> void:
	for frame: int in 8: await process_frame
func button(node: Node,text: String) -> Button:
	if node is Button and node.text==text: return node
	for child: Node in node.get_children():
		var found: Button=button(child,text)
		if found!=null: return found
	return null
func fits(node: Control,bounds: Rect2,message: String) -> void:
	check(node!=null and bounds.grow(0.5).encloses(node.get_global_rect()),message+" rect="+str(node.get_global_rect())+" bounds="+str(bounds))
func _fixture() -> Dictionary:
	var team: Array=[]
	for id: String in ["yunxiao","huangfeihu","qiongxiao","bixiao","nezha"]:
		team.append({"id":id,"level":7,"branch":"A","treasure":1})
	var enemies: Array=[]
	for i: int in 5:
		enemies.append({"id":"test-%d" % i,"name":"测试妖将%d" % i,"row":"front" if i<2 else "back","role":"soldier" if i<2 else "archer","hp":2400,"atk":40,"def":20,"speed":40+i})
	var battle: Dictionary=GameCombat.create(12,team,{"seed":713,"trial":true,"enemies":enemies,"contextName":"五人合阵 · 单屏实测"})
	for i: int in battle.order.size():
		if GameCombat.unit(battle,battle.order[i]).id=="yunxiao": battle.cursor=i; break
	return battle
func _capture(view: BattleView,name: String) -> void:
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	var pixels: Image=root.get_texture().get_image()
	check(pixels.save_png("res://evidence/battle/single-screen-"+name+".png")==OK,"native image "+name)
func _run() -> void:
	DirAccess.make_dir_recursive_absolute("res://evidence/battle")
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED; root.content_scale_size=Vector2i.ZERO
	for scenario: Dictionary in [{"name":"540-portrait","size":Vector2i(540,960),"insets":Vector4(0,44,0,34)},{"name":"360-portrait","size":Vector2i(360,800),"insets":Vector4(0,24,0,20)},{"name":"960-landscape","size":Vector2i(960,540),"insets":Vector4(44,0,32,24)}]:
		root.size=scenario.size; root.set_meta(GameSafeArea.TEST_INSETS,scenario.insets)
		var battle: Dictionary=_fixture()
		var view: BattleView=BattleView.new(); view.configure(battle,{"speed":1,"simplified":false}); root.add_child(view)
		view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); view.set_process(false)
		await settle(); view._resize_safe_layout(); await settle()
		var bounds: Rect2=GameSafeArea.rect_for(view)
		check(view.body_scroll.vertical_scroll_mode==ScrollContainer.SCROLL_MODE_DISABLED and view.body_scroll.horizontal_scroll_mode==ScrollContainer.SCROLL_MODE_DISABLED,scenario.name+" battle has no scrolling")
		fits(button(view.controls,"确认行动"),bounds,scenario.name+" confirm always visible")
		fits(button(view.controls,"三霄合阵 · CD3"),bounds,scenario.name+" combined choice always visible")
		fits(view.auto_button,bounds,scenario.name+" automation visible")
		var grouped: Dictionary={}
		for unit: Dictionary in battle.units:
			var card: BattleView.UnitCard=view.unit_nodes[unit.uid]
			fits(card,bounds,scenario.name+" actual target "+unit.uid)
			fits(card.hp_bar,card.get_global_rect(),scenario.name+" HP stays in target region "+unit.uid)
			check(card.get_rect().has_point(view._anchor(unit.uid)),scenario.name+" impact belongs to target "+unit.uid)
			var key: String=unit.side+unit.row
			if not grouped.has(key): grouped[key]=[]
			for previous: Rect2 in grouped[key]: check(not previous.intersects(card.get_global_rect()),scenario.name+" same rank target regions do not overlap")
			grouped[key].append(card.get_global_rect())
		var before: String=JSON.stringify(battle)
		var legal: Array=GameCombat.legal_targets(battle,"attack")
		view._select_unit(legal[0]); await settle()
		check(view.target_id==legal[0] and JSON.stringify(battle)==before,scenario.name+" selection stays read-only")
		check(not button(view.controls,"确认行动").disabled,scenario.name+" selected target enables confirmation")
		await _capture(view,scenario.name)
		var long_text := ""
		for line: int in 100: long_text+="第%d次真实行动：哪吒攻击测试妖将，护盾吸收与实际生命伤害分别记录。\n\n" % line
		view._details("实际战报分页",long_text); await settle()
		check(view.detail_pages.size()>1,scenario.name+" long report uses pages")
		check(view.detail_pages.size()<80,scenario.name+" report measures settled native width rather than over-paginating")
		check("".join(view.detail_pages).replace("\n","")==long_text.replace("\n",""),scenario.name+" report retains every character")
		check(view.detail_overlay.find_children("*","ScrollContainer",true,false).is_empty(),scenario.name+" report has no scroll")
		for page: int in view.detail_pages.size():
			view.detail_page=page; view._update_detail_page(); await settle()
			fits(view.detail_label,view.detail_overlay.get_node("Panel").get_global_rect(),scenario.name+" report text page %d fits" % page)
			fits(button(view.detail_overlay,"关闭"),bounds,scenario.name+" report close page %d fits" % page)
			fits(view.detail_next,bounds,scenario.name+" report next page %d fits" % page)
		check(JSON.stringify(battle)==before,scenario.name+" report pagination is read-only")
		view.detail_page=0; view._update_detail_page(); await settle(); await _capture(view,scenario.name+"-report")
		view.detail_overlay.queue_free(); await settle()
		battle.result="win"; view.set_settlement({"ok":true,"data":{"reward":{"stone":320,"xp":240,"material":32}}}); await settle()
		fits(button(view.controls,"返回整备"),bounds,scenario.name+" settled return visible")
		fits(button(view.controls,"完整战报"),bounds,scenario.name+" complete report visible")
		observations.append({"name":scenario.name,"safe":str(bounds),"arena":str(view.arena.get_global_rect()),"reportPages":view.detail_pages.size(),"confirmVisible":true,"targets":battle.units.size()})
		view.queue_free(); await settle()
	var file: FileAccess=FileAccess.open("res://evidence/battle/single-screen-report.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks":checks,"failures":failures,"observations":observations,"native":DisplayServer.get_name()!="headless","noCombatAlgorithmChanges":true},"  "));file.close()
	print("BATTLE SINGLE SCREEN: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
