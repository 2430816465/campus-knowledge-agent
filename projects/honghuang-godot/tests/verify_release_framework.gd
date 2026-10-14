extends Node
## Drives the actual exported executable through a temporary external autoload.
var checks: int = 0
var failures: Array = []
var app: Control
func _ready() -> void: run.call_deferred()
func check(value: bool, note: String) -> void:
	checks += 1
	if not value: failures.append(note); push_error(note)
func frames(n: int = 5) -> void:
	for i in n: await get_tree().process_frame
func command(name: String, args: Dictionary = {}) -> Dictionary:
	var result: Dictionary = app.store.transact(name,args)
	check(result.ok,name+": "+str(result.get("error","")))
	check(GameEconomy.validate_state(app.state()).is_empty(),name+" release state validates")
	return result
func run() -> void:
	await frames()
	check(not OS.has_feature("editor"),"actual Windows release template")
	check(FileAccess.file_exists("res://project.binary"),"actual exported project settings")
	check(ProjectSettings.get_setting("application/config/version") == "0.10.0","release framework version")
	check(GameFramework.rules().version == "framework-20261008.3","release includes latest framework rules")
	check(GameData.normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/system-catalog.json"))).size() == 88,"release includes all 88 tracking entries")
	app = get_tree().current_scene
	check(app != null,"real configured main scene starts")
	if app == null: finish(); return
	app.set_process(false); app.audio.sound_enabled = false
	check(GameEconomy.free_currency(),"requested currency-free test edition")
	var s: Dictionary = app.state().duplicate(true)
	for key in s.resources: s.resources[key] = 0
	for id in ["yangjian","yunxiao"]: GameEconomy.grant(s,id)
	for id in s.owned: s.owned[id].level = 20; s.framework.highestLevels[id] = 20
	s.team = ["nezha","bigan","yangjian","yunxiao"]
	check(app.store._commit(s,true).ok,"isolated release test fixture commits")
	app.store.state = s
	check(GameFramework.party(app.state()).size() == 5 and GameFramework.party(app.state())[0].id == GameFramework.LORD,"exported main party lord plus four gods")
	command("progForge",{"txid":"release-forge"})
	check(app.state().progression.materials.embryo == 0,"unlimited base forge needs no advanced embryo")
	command("saveTeamPreset",{"slot":0,"name":"发布检验"})
	command("setTeam",{"ids":["bigan"]})
	command("applyTeamPreset",{"slot":0})
	check(app.state().team.size() == 4,"exported complete preset restores party")
	command("progDiscipleRecruit")
	var worker: String = app.state().progression.disciples[0].id
	command("estateAssign",{"worker":worker,"type":"spring"})
	command("estatePlan",{"id":"spring","recipe":"passive"})
	check(app.state().framework.estate.teams.spring == [worker],"release workforce assigned by category")
	command("fwPetSummon")
	var pet: String = app.state().progression.families.pets.keys()[0]
	command("fwPetTrain",{"id":pet}); command("fwPetReset",{"id":pet})
	check(app.state().resources.stone == 0 and GameProgression.battle_support(app.state()).is_empty(),"release free ordinary level refund and passive-only pet")
	var prepared: Dictionary = command("challengePrepare",{"kind":"set","difficulty":1,"dungeon":0,"txid":"release-battle"})
	if prepared.ok:
		var request: Dictionary = prepared.data.battleRequest
		var b: Dictionary = GameCombat.create(request.stageId,request.team,request.options)
		for i in range(5000):
			if b.result != null: break
			GameCombat.auto_act(b)
		check(b.result == "win","actual release combat wins through attacks")
		command("challengeSettle",{"battle":b})
		command("challengeClaim",{"id":b.id})
		check(app.state().framework.challenges.stamina == 100,"set stamina debited on real reward claim")
		var item_count: int = app.state().equipment.items.size()
		var duplicate: Dictionary = app.store.transact("challengeClaim",{"id":b.id})
		check(duplicate.ok and duplicate.data.get("duplicate",false) and app.state().equipment.items.size() == item_count and app.state().framework.challenges.stamina == 100,"duplicate release reward is an idempotent receipt without reward or stamina change")
	for tab in FrameworkScreen.TABS:
		app._framework_page(tab); await frames()
		check(app.system_view == "framework:"+tab and app.body.get_child_count() > 4,"exported functional route "+tab)
	for id in ["048","051","061"]:
		app._systems_page(id); await frames()
		check(app.system_view == id,"exported distinct activity "+id)
	app._go(5); await frames()
	check(app.foundation_home != null,"original visual home remains reachable")
	app._go(3); await frames()
	check(app.page == 3,"original summoning remains reachable")
	var revision: int = app.state().revision
	check(app.store.load_slot().ok and app.state().revision == revision,"release durable reload retains committed revision")
	check(GameEconomy.validate_state(app.state()).is_empty(),"reopened exported full state validates")
	if DisplayServer.get_name() != "headless":
		app._framework_page("挑战"); await frames(); await RenderingServer.frame_post_draw
		for arg in OS.get_cmdline_user_args():
			if arg.begins_with("--screenshot="): check(get_tree().root.get_texture().get_image().save_png(arg.trim_prefix("--screenshot=")) == OK,"actual exported framework GPU render")
	app.store.release(); finish()
func finish() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):
			var f: FileAccess = FileAccess.open(arg.trim_prefix("--report="),FileAccess.WRITE)
			f.store_string(JSON.stringify({"checks":checks,"failures":failures,"releaseTemplate":not OS.has_feature("editor"),"display":DisplayServer.get_name(),"renderer":RenderingServer.get_video_adapter_name()},"  ")); f.close()
	print("WINDOWS FRAMEWORK: ",checks," checks, ",failures.size()," failures")
	get_tree().quit(0 if failures.is_empty() else 1)
