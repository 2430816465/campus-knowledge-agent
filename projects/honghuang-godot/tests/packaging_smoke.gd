extends Node
## Runs using the exported Windows executable, outside the source project.
## This harness is intentionally excluded from the player PCK.
var checks: int = 0
var failures: Array[String] = []
var app: Control
var report: Dictionary = {}

func _ready() -> void:
	_run.call_deferred()

func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures.append(message)
		push_error("PACKAGE ASSERT: " + message)

func _run() -> void:
	await get_tree().process_frame
	check(not OS.has_feature("editor"), "real export template, not editor")
	check(FileAccess.file_exists("res://project.binary"), "binary exported project settings")
	check(not FileAccess.file_exists("res://project.godot"), "no source-project fallback")
	for path: String in ["data/game-data.json", "data/godot-rules.json", "data/equipment-rules.json", "data/roster-expansion.json", "data/activities-rules.json", "data/progression-rules.json", "data/progression-stories.json", "assets/terrain/extra-building-visuals.json"]:
		check(FileAccess.file_exists("res://" + path), "runtime JSON present: " + path)
		check(JSON.parse_string(FileAccess.get_file_as_string("res://" + path)) is Dictionary, "runtime JSON parses: " + path)
	for path: String in ["data/system-catalog.json", "data/progression-systems.json"]:
		check(FileAccess.file_exists("res://"+path),"new runtime array JSON bundled: "+path)
		check(JSON.parse_string(FileAccess.get_file_as_string("res://"+path)) is Array,"new runtime array JSON parses: "+path)
	check(SystemHub.catalog().size()==88,"88 actual system routes from PCK")
	check(str(ProjectSettings.get_setting("application/config/version",""))=="0.9.0","release metadata is V0.9")
	check(FileAccess.file_exists("res://assets/ui-v08/icon-bounds.json"),"icon alignment metadata is bundled")
	check(GameIllustratedIcon.icon_bounds("forge").size.x<209,"actual cropped icon alignment is active")
	check(ResourceLoader.exists("res://assets/fonts/mashanzheng/MaShanZheng-Regular.ttf"),"brush heading font bundled")
	check(FileAccess.file_exists("res://assets/fonts/mashanzheng/OFL.txt"),"brush font license bundled")
	var silk: StyleBox=GameTheme.silk("tab",GameTheme.JADE,4,true).duplicate()
	check(silk is GameSilkStyle and silk.role=="tab" and silk.emphasized,"native UI material survives dynamic layout")
	for filename: String in ["home-immortal.png","illustrated-icons.png","panel-paper.svg","panel-jade.svg","button-jade.svg","button-gold.svg"]:
		check(ResourceLoader.exists("res://assets/ui-v08/"+filename) and load("res://assets/ui-v08/"+filename)!=null,"new V0.8 art imports in PCK: "+filename)
	check(not ResourceLoader.exists("res://assets/ui-v07/icon-roster.png"),"retired V0.7 icon assets not bundled")
	for path: String in ["tests", "docs", "art-source", "tools"]:
		check(not DirAccess.dir_exists_absolute("res://" + path), "private/build files excluded: " + path)
	for filename: String in ["xianfu-background-premium.webp", "xianfu-background-v02.webp", "xianfu-terrain-beta.webp"]:
		check(not ResourceLoader.exists("res://assets/" + filename), "unused baked estate backdrop excluded: " + filename)
	for path: String in ["res://assets/fonts/NotoSansSC-Regular.otf", "res://assets/fonts/NotoSerifSC-Regular.otf"]:
		var font: Font = load(path)
		check(font != null, "bundled Chinese font loads: " + path)
		if font != null:
			font.allow_system_fallback = false
			for character: String in "洪荒灵兽弟子宝胚垂钓镶嵌座驾本源混沌":
				check(font.has_char(character.unicode_at(0)), "actual bundled glyph: " + path + " " + character)
	var data_script: Script = load("res://scripts/game_data.gd")
	var heroes: Array = data_script.content("CHARACTERS")
	check(heroes.size() >= 14, "runtime roster JSON loaded")
	var missing_art: Array[String] = []
	for hero: Dictionary in heroes:
		for folder: String in ["portraits", "avatars"]:
			var path: String = "res://assets/%s/%s-premium.webp" % [folder, hero.id]
			if not ResourceLoader.exists(path): missing_art.append(path)
			elif load(path) == null: missing_art.append(path)
	if OS.get_cmdline_user_args().has("--complete-art"):
		check(heroes.size() == 50, "all 50 characters present")
		check(missing_art.is_empty(), "all 50 portraits and avatars bundled")
		var stories: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/progression-stories.json"))
		check(stories.size() == 50, "50 character story collections bundled")
		for hero: Dictionary in heroes:
			var chapters: Array = stories.get(str(hero.id), [])
			check(chapters.size() == 2, "two story chapters for " + str(hero.id))
			for chapter: Dictionary in chapters:
				check(not str(chapter.get("title", "")).is_empty() and str(chapter.get("text", "")).length() >= 60, "actual story text for " + str(hero.id))
	var extra_art: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/terrain/extra-building-visuals.json"))
	for kind: String in ["warehouse", "mine", "relicworkshop"]:
		var metadata: Dictionary = extra_art.get(kind, {})
		var path: String = str(metadata.get("path", ""))
		var texture: Texture2D = load(path) if ResourceLoader.exists(path) else null
		check(texture != null and texture.get_width() == int(metadata.get("width", 0)) and texture.get_height() == int(metadata.get("height", 0)), "generated facility art loads from PCK: " + kind)
	for kind: String in ["wanxian-premium", "spring-premium", "farm-premium", "alchemy-idle-v02", "forge-idle-v02", "library-premium", "arena-premium", "hall-expanded-beta", "alchemy-stage2-v02", "alchemy-stage3-beta"]:
		var path: String = "res://assets/buildings/" + kind + ".webp"
		check(ResourceLoader.exists(path) and load(path) != null, "existing facility art loads from PCK: " + kind)
	for filename: String in ["meadow-diffuse.png", "stone-diffuse.png"]:
		var path: String = "res://assets/terrain/" + filename
		check(ResourceLoader.exists(path) and load(path) != null, "native terrain diffuse material loads from PCK: " + filename)
	for filename: String in ["danfire-premium.webp", "thundermarsh-premium.webp"]:
		var path: String = "res://assets/battle/" + filename
		check(ResourceLoader.exists(path) and load(path) != null, "chapter battle background loads from PCK: " + filename)
	var scene: PackedScene = load("res://scenes/main.tscn")
	check(scene != null, "real main scene loads from PCK")
	if scene == null:
		_finish()
		return
	app = get_tree().current_scene
	check(app != null, "engine launched actual configured main scene")
	await get_tree().process_frame
	check(app.state().owned.size() == 3, "isolated ordinary new save with three starters")
	check(app.state().resources.ticket == 12, "ordinary starting tickets")
	for i: int in 9:
		app._go(i)
		await get_tree().process_frame
		check(app.nav.get_child_count() == 5 and app.body.get_child_count() > 0, "native page works: " + str(i))
		for tab in app.nav.get_children():
			check(not tab.get_node("Art").halo,"no bottom navigation halo in release: "+str(i))
		for arg: String in OS.get_cmdline_user_args():
			if arg.begins_with("--capture-dir="):
				for frame: int in 8: await get_tree().process_frame
				await RenderingServer.frame_post_draw
				var capture_dir: String = arg.trim_prefix("--capture-dir=")
				DirAccess.make_dir_recursive_absolute(capture_dir)
				var capture_path: String = capture_dir.path_join("release-page-%d.png" % i)
				check(get_viewport().get_texture().get_image().save_png(capture_path) == OK, "actual release GPU capture: " + str(i))
	for path: String in ["res://assets/home-v05/home-garden.png", "res://assets/home-v05/nezha.png", "res://assets/summon-v05/summon-gate.png", "res://assets/battle/nezha/master.png"]:
		check(ResourceLoader.exists(path) and load(path)!=null,"V0.5 new artwork present: "+path)
	app._summon(1)
	await get_tree().process_frame
	check(app.state().resources.ticket == 11, "native summon persists one debit")
	await get_tree().process_frame
	check(not app.has_meta("summon_cinematic"), "unapproved procedural animation disabled for players")
	check(is_instance_valid(app.modal_box), "committed summon result appears without unapproved animation")
	for material: String in ["button", "button-jade", "button-gold", "panel", "jade-panel", "nav-glow"]:
		check(ResourceLoader.exists("res://assets/ui-v06/%s.svg" % material), "V0.6 interface material bundled: "+material)
	app._close_modal()
	var balance: Dictionary=app.state().resources.duplicate(true)
	var craft: Dictionary=app.command("progMakeEmbryo",{"count":1},false)
	check(craft.ok and app.state().resources.stone==balance.stone-10 and app.state().resources.material==balance.material-3,"new crafting spends exact real assets in export")
	var forged: Dictionary=app.command("progForge",{"txid":"package-v08-forge"},false)
	check(forged.ok and not forged.data.item.is_empty(),"new forging creates an actual shared item")
	if forged.ok:
		var old_power: int=GameEquipment.team_power(app.state())
		check(app.command("progEquipShared",{"id":forged.data.item.id},false).ok,"shared equipment equips through exported Store")
		check(GameEquipment.team_power(app.state())>old_power,"equipped gear raises actual exported power")
	var after_forge: Dictionary={"resources":app.state().resources.duplicate(true),"equipment":app.state().equipment.duplicate(true),"progression":app.state().progression.duplicate(true),"rng":app.state().randomStreams.duplicate(true)}
	var retried: Dictionary=app.command("progForge",{"txid":"package-v08-forge"},false)
	var after_retry: Dictionary={"resources":app.state().resources.duplicate(true),"equipment":app.state().equipment.duplicate(true),"progression":app.state().progression.duplicate(true),"rng":app.state().randomStreams.duplicate(true)}
	check(retried.ok and after_retry==after_forge,"exported forge receipt retry preserves assets, items and RNG")
	for system_id: String in ["003","012","034","049","078","083","084"]:
		app._systems_page(system_id)
		await get_tree().process_frame
		check(app.body.get_child_count()>0,"new system presentation loads from export: "+system_id)
	app._build_at("farm", "p2")
	check(app.state().buildings.size() == 3, "native construction commits")
	app._close_modal()
	app._start_main(1)
	await get_tree().process_frame
	check(is_instance_valid(app.battle_view), "native battle scene instantiates")
	var battle: Dictionary = app.last_battle
	var combat: Script = load("res://scripts/game_combat.gd")
	var steps: int = 0
	while battle.get("result") == null and steps < 500:
		check(combat.auto_act(battle), "real native battle action")
		steps += 1
	check(battle.get("result") == "win", "ordinary first stage won")
	app._battle_finished(battle)
	check(app.settlement.get("ok", false) and app.state().cleared.has(1), "real battle reward persisted")
	app._leave_battle()
	var before: Dictionary = app.state().resources.duplicate(true)
	var save_dir: String = app.store.base_dir
	app.store.release()
	check(app.store.load_slot("normal").ok, "save reload succeeds in exported runtime")
	check(app.state().resources == before and app.state().cleared.has(1), "save survives reload exactly")
	check(not FileAccess.file_exists("user://saves/normal.json"), "normal player save untouched")
	report = {"executable": OS.get_executable_path(), "engine": Engine.get_version_info(), "checks": checks, "failures": failures, "hero_count": heroes.size(), "missing_art": missing_art, "save_root": ProjectSettings.globalize_path(save_dir), "battle_steps": steps, "display_server": DisplayServer.get_name(), "execution": "Windows release executable + external PCK; actual main scene, native pages, summon, construction, battle, reward, save reload"}
	app.store.release()
	app.queue_free()
	# Let deferred page-layout callbacks observe disposal before engine shutdown.
	for frame: int in 6: await get_tree().process_frame
	_finish()

func _finish() -> void:
	report["checks"] = checks
	report["failures"] = failures
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):
			var file: FileAccess = FileAccess.open(arg.trim_prefix("--report="), FileAccess.WRITE)
			if file != null:
				file.store_string(JSON.stringify(report, "  "))
				file.close()
	print("PACKAGE_SMOKE " + JSON.stringify(report))
	get_tree().quit(0 if failures.is_empty() else 1)
