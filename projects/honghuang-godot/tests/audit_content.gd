extends SceneTree
var checks := 0
var failures: Array = []
var missing: Array = []
var phase := "preaudit"
var require_art := false
func check(value: bool,label: String) -> void:
	checks += 1
	if not value: failures.append(label); push_error("CONTENT AUDIT: "+label)
func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="): phase=arg.trim_prefix("--audit-phase=")
		if arg == "--require-art": require_art=true
	var heroes: Array = GameData.content("CHARACTERS")
	var ids: Dictionary = {}
	var portraits: Dictionary = {}
	var stars := {3:0,4:0,5:0}
	check(heroes.size() == 50,"50 configured playable characters")
	for hero in heroes:
		check(not ids.has(hero.id),"unique hero id " + hero.id)
		ids[hero.id] = true
		check(hero.stars in [3,4,5],"valid rarity " + hero.id)
		stars[int(hero.stars)] += 1
		var path: String = hero.get("portraitPath","res://assets/portraits/%s-premium.webp" % hero.id)
		if not FileAccess.file_exists(path):
			missing.append({"id":hero.id,"path":path})
			if require_art: check(false,"missing final portrait " + hero.id)
		else:
			var hash: String = FileAccess.get_sha256(path)
			check(not portraits.has(hash),"independent distinct image bytes " + hero.id)
			portraits[hash] = hero.id
			var texture: Texture2D = load(path)
			check(texture != null and texture.get_width()>=400 and texture.get_height()>=400,"readable high-resolution portrait " + hero.id)
		check(hero.branches.size()==2 and not hero.skillDescription.is_empty() and not hero.passiveDescription.is_empty(),"full character descriptions " + hero.id)
	check(GameData.character("tongtian").stars == 5,"Tongtian remains highest tier")
	check(stars[3]>0 and stars[4]>0 and stars[5]>0,"three populated rarity tiers")
	var rules := GameEconomy.gacha_config()
	check(is_equal_approx(float(rules.fiveStarChance),0.006) and is_equal_approx(float(rules.fourStarChance),0.051) and is_equal_approx(float(rules.threeStarChance),0.943),"transparent base probability masses")
	check(rules.fiveStarPity==90 and rules.fourStarPity==10,"transparent 90/10 guarantee counters")
	for edge in [[0.0,"divine"],[0.005999999,"divine"],[0.006,"immortal"],[0.056999999,"immortal"],[0.057000001,"mortal"],[0.99999999,"mortal"]]:
		var s := GameEconomy.create_state(1700000000000)
		var chance: float = edge[0]
		var result := GameEconomy.command(s,"summon",{"count":1,"txid":"boundary","rng":func():return chance},int(s.lastTime))
		check(result.ok and result.data[0].rarity==edge[1],"gacha exact probability boundary %.9f" % chance)
	check(GameData.content("STAGES").size()==12,"three chapters12native combat nodes")
	check(GameEconomy.get_all_plots().size()==24 and GameEconomy.get_building_types().size()==10,"24native plots10real facility types")
	check(GameEquipment.slots().size()==5 and GameEquipment.rules().sets.size()==6,"five true gear slots six native sets")
	var buildings: Dictionary = {}
	for kind in ["hall","spring","farm","alchemy","forge","library","arena","warehouse","mine","relicworkshop"]:
		var meta:=BuildingView.visual_metadata(kind,1)
		var path: String=str(meta.get("path","res://assets/buildings/"+str(BuildingView.ASSETS.get(kind,""))))
		check(FileAccess.file_exists(path),"actual independent facility art exists "+kind)
		var texture: Texture2D=load(path)
		check(texture!=null and texture.get_width()>=200,"actual facility image is loadable "+kind)
		var hash:=FileAccess.get_sha256(path)
		check(not buildings.has(hash),"ten distinct facility texture bytes "+kind)
		buildings[hash]={"id":kind,"path":path,"width":texture.get_width(),"height":texture.get_height()}
		for level in [1,2,3,4]:
			var visuals:=BuildingView.visual_metadata(kind,level)
			check(visuals.get("foundation",{}).get("corners",[]).size()==4,"measured real grid foundation metadata "+kind+" "+str(level))
	check(load("res://assets/fonts/NotoSansSC-Regular.otf") is Font,"embedded native Chinese body font")
	check(load("res://assets/fonts/NotoSerifSC-Regular.otf") is Font,"embedded native Chinese title font")
	for path in ["res://assets/battle-background-premium.webp","res://assets/terrain/distant-cloud-mountains.png","res://assets/terrain/estate_tiles.svg","res://assets/ui/panel-frame.svg"]:
		check(load(path) is Texture2D,"native scene art resource "+path)
	if phase=="round-4":
		var chapter_hashes:Dictionary={}
		for path in ["res://assets/battle-background-premium.webp","res://assets/battle/danfire-premium.webp","res://assets/battle/thundermarsh-premium.webp"]:
			var texture:Texture2D=load(path)
			check(texture!=null and texture.get_width()>=400 and texture.get_height()>=400,"real chapter background loads at useful resolution "+path)
			var hash:=FileAccess.get_sha256(path)
			check(not chapter_hashes.has(hash),"chapter background is distinct source art "+path)
			chapter_hashes[hash]=path
	var report := {"phase":phase,"utc":Time.get_datetime_string_from_system(true),"require_art":require_art,"checks":checks,"failures":failures,"rarities":stars,"distinct_loaded_portraits":portraits.size(),"missing_portraits":missing,"distinct_facility_images":buildings.values()}
	var file := FileAccess.open("res://docs/audits/%s-content.json" % phase,FileAccess.WRITE); file.store_string(JSON.stringify(report,"  "));file.close()
	print(JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
