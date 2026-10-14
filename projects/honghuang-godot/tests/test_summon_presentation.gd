extends SceneTree
var checks := 0
var failures: Array=[]
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void: _run.call_deferred()
func labels(node: Node) -> String:
	var parts: PackedStringArray=[]
	if node is Label: parts.append(node.text)
	for child: Node in node.get_children(): parts.append(labels(child))
	return "\n".join(parts)
func _run() -> void:
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	var before_ticket: int=int(app.state().resources.ticket)
	var before_fate: int=int(app.state().resources.fate)
	app._summon(1)
	check(app.get_meta(SummonScreen.ACTIVE_CINEMATIC) is SummonMovie,"ordinary draw uses supplied video, not prototype")
	app.get_meta(SummonScreen.ACTIVE_CINEMATIC)._finish(true)
	for frame: int in 3: await process_frame
	var record: Dictionary=app.state().drawHistory[-1].results[0]
	var hero: Dictionary=GameData.character(record.id)
	check(labels(app.modal_box).contains("%d星法相" % int(hero.stars)),"actual ordinary draw result exposes textual star rarity")
	check(app.state().resources.ticket==before_ticket-1 and app.state().resources.fate==before_fate+int(record.fate),"ordinary UI result uses committed cost and fate credit")
	check(labels(app.modal_box).contains("仙缘 +%d" % int(record.fate)) or labels(app.modal_box).contains("仙缘合计 +%d" % int(record.fate)),"ordinary new or duplicate draw displays committed total")
	app._load_slot("demo:roster")
	var rules: Dictionary=GameEconomy.gacha_config()
	for stars: int in [3,4,5]:
		var chance: float=0.95 if stars==3 else float(rules.fiveStarChance)+float(rules.fourStarChance)*0.5 if stars==4 else float(rules.fiveStarChance)*0.5
		before_ticket=int(app.state().resources.ticket)
		before_fate=int(app.state().resources.fate)
		# Controlled RNG only inside this isolated fixture; results still pass the
		# real transaction, validation, disk commit, and presentation path.
		var result: Dictionary=app.command("summon",{"count":1,"txid":"round-1-rarity-%d" % stars,"rng":func() -> float: return chance},false)
		check(result.ok,"committed duplicate draw %d stars" % stars)
		record=result.data[0]
		check(GameData.character(record.id).stars==stars and record.duplicate,"real expected rarity and duplicate flag %d" % stars)
		var after_commit: String=JSON.stringify(app.state())
		app._show_summon_results(result.data,1)
		var text: String=labels(app.modal_box)
		check(text.contains("%d星法相" % stars),"readable %d-star label without reliance on color" % stars)
		check(text.contains("重复转化 +%d仙缘" % (int(record.fate)-1)) and text.contains("召唤基础 +1") and text.contains("本次仙缘合计 +%d" % int(record.fate)),"exact duplicate conversion/base/total %d stars" % stars)
		check(app.state().resources.ticket==before_ticket-1 and app.state().resources.fate==before_fate+int(record.fate),"display agrees with actual economic delta %d stars" % stars)
		check(JSON.stringify(app.state())==after_commit,"showing result cannot credit again %d stars" % stars)
	app._close_modal()
	before_ticket=int(app.state().resources.ticket)
	before_fate=int(app.state().resources.fate)
	app._summon(10)
	check(app.get_meta(SummonScreen.ACTIVE_CINEMATIC) is SummonMovie,"ten draw uses supplied film")
	app.get_meta(SummonScreen.ACTIVE_CINEMATIC)._finish(true)
	for frame: int in 3: await process_frame
	var total: int=0
	for draw: Dictionary in app.state().drawHistory[-1].results: total+=int(draw.fate)
	check(app.state().resources.ticket==before_ticket-10 and app.state().resources.fate==before_fate+total,"actual ten-draw cost and sum stay unchanged")
	var before_failed: String=JSON.stringify(app.state())
	var modal_before: int=app.modal_box.get_instance_id()
	app.store.fail_writes=true
	app._summon(1)
	check(JSON.stringify(app.state())==before_failed and app.modal_box.get_instance_id()==modal_before,"failed write cannot expose an uncommitted summon result")
	app.store.fail_writes=false
	app.audio.set_backgrounded(true)
	app.queue_free()
	await process_frame
	await create_timer(0.1).timeout
	var f: FileAccess=FileAccess.open("res://docs/audits/round-1-summon-presentation-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"round":1,"checks":checks,"failures":failures,"nativeVisual":false,"fixed":"Explicit result stars and committed duplicate conversion amounts"},"  "));f.close()
	print("SUMMON PRESENTATION ROUND 1: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
