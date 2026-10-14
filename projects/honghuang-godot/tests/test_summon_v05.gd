extends SceneTree
var checks := 0
var failures: Array=[]
class AudioStub extends RefCounted:
	func cue(_kind: String = "click") -> void: pass
class TestApp extends Control:
	var store: GameStore
	var audio := AudioStub.new()
	var body: VBoxContainer
	var overlay: Control
	var modal_box: VBoxContainer
	var selected := ""
	func state() -> Dictionary: return store.state
	func command(operation: String,args: Dictionary={},_refresh: bool=true) -> Dictionary: return store.transact(operation,args)
	func _render() -> void:
		for child: Node in body.get_children(): body.remove_child(child); child.queue_free()
		SummonScreen.build(self,body)
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
	func _open_character(id: String) -> void: selected=id
	func _try_character(id: String) -> void: selected=id
	func _confirm(_title: String,_description: String,_action: Callable) -> void: pass
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
func _run() -> void:
	var app := TestApp.new()
	app.store=GameStore.new("user://summon-v05-%d" % Time.get_ticks_usec())
	check(app.store.load_slot().ok,"ordinary isolated store loads")
	app.body=VBoxContainer.new(); app.body.size=Vector2(500,900); app.add_child(app.body)
	root.add_child(app)
	var initial: String=JSON.stringify(app.state())
	app._render()
	await process_frame
	check(app.body.find_child("CollectionCard",true,false)==null and app.body.find_child("PremiumBanner",true,false)!=null,"summon leaves the courtyard visible without a promotional portrait card")
	check(button_named(app.body,"概率规则").get_theme_font_size("font_size")>=15,"bottom rule entry uses readable 15px or larger text")
	app.body.find_child("SummonScreen",true,false)._rules()
	check(labels(app.modal_box).contains("五星 0.6%") and labels(app.modal_box).contains("三星 94.3%"),"rules display actual configured base probabilities")
	app._close_modal()
	check(labels(app.body).contains("最多再 90 次"),"new player sees actual remaining five-star guarantee")
	check(JSON.stringify(app.state())==initial,"building screen cannot roll RNG, consume resources or alter pity")
	var tickets: int=int(app.state().resources.ticket)
	var fate: int=int(app.state().resources.fate)
	SummonScreen.draw(app,1)
	check(not app.has_meta(SummonScreen.ACTIVE_CINEMATIC) and app.find_child("SummonCinematic",true,false)==null,"ordinary single draw never launches the unapproved prototype")
	check(bool(app.get_meta(SummonScreen.DRAW_LOCK,false)),"ordinary single draw retains lock until deferred result presentation")
	var single_committed: String=JSON.stringify(app.state())
	SummonScreen.draw(app,1)
	check(JSON.stringify(app.state())==single_committed,"same-frame repeated single draw cannot debit twice")
	for frame: int in 3: await process_frame
	check(not bool(app.get_meta(SummonScreen.DRAW_LOCK,true)),"ordinary single result releases presentation lock")
	var record: Dictionary=app.state().drawHistory[-1].results[0]
	var hero: Dictionary=GameData.character(str(record.id))
	check(app.state().resources.ticket==tickets-1 and app.state().resources.fate==fate+int(record.fate),"new single draw uses real atomic debit and credit")
	check(labels(app.modal_box).contains("%d星法相" % hero.stars),"revealed result includes readable real rarity")
	check(labels(app.modal_box).contains("仙缘 +%d" % record.fate) or labels(app.modal_box).contains("仙缘合计 +%d" % record.fate),"new result reports committed fate")
	app._close_modal()
	tickets=int(app.state().resources.ticket); fate=int(app.state().resources.fate)
	app.set_meta("ui_test",true)
	SummonScreen.draw(app,10)
	check(not app.has_meta(SummonScreen.ACTIVE_CINEMATIC) and app.find_child("SummonCinematic",true,false)==null,"ui_test alone never enables unapproved prototype")
	check(bool(app.get_meta(SummonScreen.DRAW_LOCK,false)),"ten draw retains lock until deferred result presentation")
	var ten_committed: String=JSON.stringify(app.state())
	SummonScreen.draw(app,10)
	check(JSON.stringify(app.state())==ten_committed,"same-frame repeated ten draw cannot debit twice")
	for frame: int in 3: await process_frame
	check(not bool(app.get_meta(SummonScreen.DRAW_LOCK,true)),"ordinary ten result releases presentation lock")
	var ten: Array=app.state().drawHistory[-1].results
	var total := 0
	for saved: Dictionary in ten: total+=int(saved.fate)
	check(ten.size()==10 and app.state().resources.ticket==tickets-10 and app.state().resources.fate==fate+total,"ten draw uses saved 10 results and exact aggregate credit")
	var after: String=JSON.stringify(app.state())
	SummonScreen.show_results(app,ten,10,9)
	check(labels(app.modal_box).contains("10 / 10") and JSON.stringify(app.state())==after,"switching reveal selection cannot re-roll or credit again")
	check(app.body.find_child("SummonTen",true,false).disabled and labels(app.body).contains("还需 9 张"),"insufficient ten-draw button and exact deficit are visible")
	var previous_modal: int=app.modal_box.get_instance_id()
	SummonScreen.draw(app,10)
	check(JSON.stringify(app.state())==after and app.modal_box.get_instance_id()==previous_modal,"insufficient transaction never replaces saved reveal or changes RNG")
	app.store.fail_writes=true
	SummonScreen.draw(app,1)
	check(JSON.stringify(app.state())==after and app.modal_box.get_instance_id()==previous_modal,"failed disk save cannot expose an uncommitted result")
	app.store.fail_writes=false
	check(app.store.load_slot("demo:roster").ok,"isolated full roster loads for deterministic duplicate coverage")
	var config: Dictionary=GameEconomy.gacha_config()
	for stars: int in [3,4,5]:
		var chance: float=0.95 if stars==3 else float(config.fiveStarChance)+float(config.fourStarChance)*0.5 if stars==4 else float(config.fiveStarChance)*0.5
		tickets=int(app.state().resources.ticket); fate=int(app.state().resources.fate)
		var result: Dictionary=app.command("summon",{"count":1,"txid":"summon-v05-%d" % stars,"rng":func() -> float: return chance},false)
		check(result.ok,"actual transaction commits deterministic rarity %d" % stars)
		record=result.data[0]
		check(GameData.character(str(record.id)).stars==stars and record.duplicate,"actual owned duplicate rarity %d" % stars)
		SummonScreen.show_results(app,result.data,1)
		var text: String=labels(app.modal_box)
		check(text.contains("%d星法相" % stars) and text.contains("重复转化 +%d仙缘" % (int(record.fate)-1)) and text.contains("召唤基础 +1"),"duplicate reveals exact rarity and base/extra %d" % stars)
		check(app.state().resources.ticket==tickets-1 and app.state().resources.fate==fate+int(record.fate),"duplicate amount agrees with actual store %d" % stars)
		var committed: String=JSON.stringify(app.state())
		SummonScreen.show_results(app,result.data,1)
		check(JSON.stringify(app.state())==committed,"reopening saved duplicate reveal does not credit %d" % stars)
	app._render()
	var screen: SummonScreen=app.body.get_node("SummonScreen")
	var read_only: String=JSON.stringify(app.state())
	screen._set_mode("exchange")
	check(labels(screen).contains("直接兑换所选角色") and screen.find_children("ExchangeCard_*","Button",true,false).size()<=6,"directed category uses real redemption with a bounded page")
	screen._exchange_detail("nezha")
	check(button_named(app.modal_box,"已结缘").disabled,"directed owned detail disables actual redeem")
	screen._rules()
	check(labels(app.modal_box).contains("90抽") and labels(app.modal_box).contains("十连按10次连续"),"public rules come from actual gacha config")
	screen._history()
	check(labels(app.modal_box).contains("重复转化") and labels(app.modal_box).contains("规则版本"),"history displays persisted draws and version")
	check(JSON.stringify(app.state())==read_only,"categories, rule lookup and history never alter assets/RNG")
	for fixture: Vector2 in [Vector2(516,740),Vector2(328,570)]:
		app.set_meta("page_content_height",fixture.y)
		app.body.size=fixture
		for category: String in ["permanent","exchange"]:
			screen._set_mode(category)
			for frame: int in 5: await process_frame
			check(screen.column.get_combined_minimum_size().y<=fixture.y+1,"single-screen minimum fits %s %s: %s" % [str(fixture),category,str(screen.column.get_combined_minimum_size())])
			check(screen.column.get_combined_minimum_size().x<=fixture.x+1,"single-screen width fits %s %s" % [str(fixture),category])
	app.store.release()
	app._close_modal(); app.queue_free()
	await process_frame
	# Closing the owner before deferred result presentation must be harmless and
	# preserve the exact committed draw on disk. Also prove preview alone is gated.
	for queued: bool in [false,true]:
		var closing := TestApp.new()
		closing.set_meta("preview_unapproved_summon",true)
		var closing_path: String="user://summon-default-close-v06-%d" % Time.get_ticks_usec()
		closing.store=GameStore.new(closing_path)
		check(closing.store.load_slot().ok,"ordinary teardown fixture loads")
		closing.body=VBoxContainer.new(); closing.body.size=Vector2(500,900); closing.add_child(closing.body)
		root.add_child(closing)
		closing._render()
		SummonScreen.draw(closing,1)
		check(not closing.has_meta(SummonScreen.ACTIVE_CINEMATIC),"preview flag without ui_test cannot enable prototype")
		var closing_state: Dictionary=closing.state().duplicate(true)
		check(closing.state().drawHistory.size()==1 and closing.state().resources.ticket==11,"teardown fixture has exactly one committed draw")
		closing.store.release()
		if queued: closing.queue_free()
		else:
			root.remove_child(closing)
			closing.free()
		for frame: int in 3: await process_frame
		var reopened := GameStore.new(closing_path)
		var reopened_result: Dictionary=reopened.load_slot()
		# JSON round trips may shift production progress at the last float digit.
		# Keep all currency, history, RNG and other saved fields exact.
		var restored_state: Dictionary=reopened.state.duplicate(true)
		for comparison: Dictionary in [closing_state,restored_state]:
			for building: Dictionary in comparison.buildings:
				building.progress=snappedf(float(building.progress),0.000000000001)
		check(reopened_result.ok and JSON.stringify(restored_state)==JSON.stringify(closing_state),"closing before deferred result preserves saved draw (%s)" % ("queued" if queued else "immediate"))
		reopened.release()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/summon"))
	var f: FileAccess=FileAccess.open("res://evidence/summon/v05-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"checks":checks,"failures":failures,"transactions":"real GameStore in isolated user:// directory","visual":false},"  "));f.close()
	print("SUMMON V05: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
