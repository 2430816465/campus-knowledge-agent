extends "res://tests/test_economy_flow.gd"
## Independent audit harness. Every run starts with an ordinary isolated new save.
## Commands, simulated elapsed clocks and real combat only; no direct resources or clear grants.
var audit_phase := "preaudit"
var audit_facts: Dictionary = {}
var rehearse_focus := false
func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="): audit_phase = arg.trim_prefix("--audit-phase=")
		if arg == "--rehearse-focus": rehearse_focus=true
	var gifts := {"preaudit":"yangjian", "round-1":"yangjian", "round-2":"zhaogongming", "round-3":"yunxiao", "round-4":"yangjian"}
	if audit_phase == "round-1" or rehearse_focus: _newcomer_interruption()
	_flow(gifts.get(audit_phase, "yangjian"))
	if not failures.is_empty(): _finish_audit(); return
	check(store.load_slot("normal").ok, "resume independently progressed ordinary account")
	clock_ms = int(store.state.lastTime)
	audit_facts["after_original_core"] = {"resources":store.state.resources.duplicate(true), "equipment_count":store.state.equipment.items.size(), "cleared":store.state.cleared.duplicate(), "project":store.state.thunderProject.duplicate(true)}
	_extend_playable_content()
	_verify_sets_and_power()
	_verify_durable_extended_state()
	if audit_phase in ["preaudit","round-2"]: _long_economy_scenario()
	_mock_recovery_scenario()
	_all_content_scenario()
	if audit_phase == "round-4" or rehearse_focus: _roster_crossover_scenario()
	_finish_audit()
func _finish_audit() -> void:
	if store: store.release()
	var report := {"phase":audit_phase, "status":"pre-audit only" if audit_phase == "preaudit" else "candidate formal round, requires accompanying graphical inspection and final source manifest", "utc":Time.get_datetime_string_from_system(true), "engine":Engine.get_version_info().string, "checks":checks,"failures":failures,"battles":flow_evidence,"facts":audit_facts,"injections":"Only deterministic battle seeds and isolated command clocks. No asset grants, fabricated victory, manual clear flags, or imported demonstration progression."}
	var f := FileAccess.open("res://docs/audits/%s-flow.json" % audit_phase, FileAccess.WRITE)
	f.store_string(JSON.stringify(report,"  ")); f.close()
	print("INDEPENDENT AUDIT %s: %d checks / %d failures / %d real battles" % [audit_phase,checks,failures.size(),flow_evidence.size()])
	print("AUDIT FACTS ", JSON.stringify(audit_facts))
	quit(0 if failures.is_empty() else 1)
func _extend_playable_content() -> void:
	tx("claimCheckIn")
	tx("claimMail", {"id":"godot-welcome-1"})
	for plot in ["p9", "p10", "p11"]: tx("expandPlot", {"plot":plot})
	construct("warehouse", "p9")
	tx("claimActivity", {"id":"settlement-builder"})
	tx("expandPlot", {"plot":"p12"})
	construct("mine", "p12")
	clock_ms += 3600000
	tx("harvest")
	tx("expandPlot", {"plot":"p13"})
	var workshop := construct("relicworkshop", "p13")
	var mission = tx("startIdleMission", {"missionId":"ore-prospecting", "characters":["nezha"]})
	for i in 12: tx("queueRecipe", {"id":workshop,"recipeId":"relic-essence"})
	clock_ms += 1800000
	tx("harvest")
	if mission: tx("claimIdleMission", {"id":mission.id})
	tx("buyShopItem", {"id":"xp-scroll","count":1})
	tx("useItem", {"id":"xp-scroll","count":1})
	var gear: Dictionary = store.state.equipment.items[0]
	for candidate in store.state.equipment.items:
		if int(candidate.rarity) < int(gear.rarity): gear = candidate
	var base_power := GameEquipment.character_power(store.state,"nezha")
	tx("equipArtifact", {"id":gear.id,"characterId":"nezha"})
	var equipped_power := GameEquipment.character_power(store.state,"nezha")
	tx("enhanceArtifact", {"id":gear.id,"targetLevel":4,"consumeIds":[]})
	var upgraded_power := GameEquipment.character_power(store.state,"nezha")
	check(equipped_power > base_power and upgraded_power > equipped_power,"real drop/equip/+4 improves actual power")
	var req = tx("prepareCharacterChallenge", {"characterId":"nezha","tier":1})
	if req:
		var battle := GameCombat.create(req.stageId, req.team, req.options)
		finish(battle,true)
		tx("settleCharacterChallenge", {"battle":battle})
		check("nezha:1" in store.state.characterChallenges.claimed,"actual character challenge records real victory")
	audit_facts["expanded_core"] = {"resources":store.state.resources.duplicate(true),"facilities":store.state.buildings.size(),"expanded_plots":store.state.expandedPlots.size(),"gear":GameEquipment.item(store.state,gear.id).duplicate(true),"power_progression":[base_power,equipped_power,upgraded_power],"challenge_claims":store.state.characterChallenges.claimed.duplicate()}

func _best_set() -> Dictionary:
	var choices: Dictionary = {}
	for artifact in store.state.equipment.items:
		if not choices.has(artifact.setId): choices[artifact.setId] = {}
		choices[artifact.setId][artifact.slot] = artifact.id
	var best: Dictionary = {}
	var best_id := ""
	for id in choices:
		if choices[id].size() > best.size(): best = choices[id]; best_id = id
	return {"setId":best_id,"slots":best}
func _verify_sets_and_power() -> void:
	var draws = tx("summon", {"count":1,"txid":"audit-three-star","rng":func():return 0.99})
	check(draws != null and draws[0].rarity == "mortal", "three-star character really joins through ordinary pool")
	var best := _best_set()
	var farmed := 0
	while best.slots.size() < 4 and farmed < 60:
		clock_ms += 1000
		var req = tx("prepareMainBattle", {"stageId":12,"options":{"seed":60012+farmed,"now":clock_ms}})
		if req == null: break
		var b := GameCombat.create(req.stageId,req.team,req.options)
		finish(b)
		if b.get("result") != "win": break
		tx("settleMainBattle", {"battle":b})
		best = _best_set()
		farmed += 1
	check(best.slots.size() >= 4,"four-piece set obtained only from real drops")
	if best.slots.size() >= 4:
		for slot in best.slots: tx("equipArtifact", {"id":best.slots[slot],"characterId":"nezha"})
		var bonuses := GameEquipment.set_bonuses(store.state,"nezha")
		check(bonuses.size() >= 2,"two-piece and four-piece bonuses both active")
		audit_facts["ordinary_set"]={"setId":best.setId,"farmed_battles":farmed,"pieces":best.slots,"bonuses":bonuses,"power":GameEquipment.character_power(store.state,"nezha")}
	var demo := GameStore.new(store.base_dir + "-standard-comparison")
	check(demo.load_slot("demo:roster").ok,"isolated comparison roster")
	var comparisons: Array = []
	for id in ["wuji","nezha","tongtian"]:
		comparisons.append({"id":id,"name":GameData.character(id).name,"stars":GameData.character(id).stars,"level":demo.state.owned[id].level,"treasure":demo.state.owned[id].treasure,"equipment":GameEquipment.stats_for(demo.state,id),"power":GameEquipment.character_power(demo.state,id),"stats":GameEquipment.character_stats(demo.state,id)})
	check(comparisons[0].stars == 3 and comparisons[1].stars == 4 and comparisons[2].stars == 5,"comparison covers 3/4/5 rarity")
	check(comparisons[0].level == comparisons[1].level and comparisons[1].level == comparisons[2].level and comparisons[0].treasure == comparisons[2].treasure,"comparison uses equal cultivation and repair conditions")
	audit_facts["standardized_demo_power_comparison"] = comparisons
	demo.release()
func _verify_durable_extended_state() -> void:
	var mission = tx("startIdleMission", {"missionId":"long-cultivation","characters":["huangfeihu"]})
	check(mission != null,"12h mission durably admitted")
	var exported := store.base_dir.path_join("expanded-export.json")
	check(store.export_save(exported).ok,"expanded ordinary export")
	var resources: Dictionary = store.state.resources.duplicate(true)
	var equipment: Dictionary = store.state.equipment.duplicate(true)
	var dir := store.base_dir
	store.release()
	store = GameStore.new(dir)
	check(store.load_slot("normal").ok,"reload expanded state with active long mission")
	check(GameData.normalize(store.state.resources) == GameData.normalize(resources) and GameData.normalize(store.state.equipment) == GameData.normalize(equipment),"exact economic assets and random equipment survive reload")
	clock_ms = int(store.state.lastTime) + 43200000
	tx("harvest")
	tx("claimIdleMission", {"id":mission.id})
	var req = tx("prepareMainBattle", {"stageId":1,"options":{"seed":70001,"now":clock_ms}})
	if req:
		var b := GameCombat.create(req.stageId,req.team,req.options)
		finish(b,true)
		tx("settleMainBattle", {"battle":b})
	check(GameEconomy.validate_state(store.state).is_empty(),"fully expanded recovered ordinary state valid after actual combat")
	audit_facts["durable_expanded"]={"save_directory":store.base_dir,"exported_path":exported,"final_revision":store.state.revision,"equipment_count":store.state.equipment.items.size(),"final_resources":store.state.resources.duplicate(true)}

func _reject_atomic(name: String,args: Dictionary = {}) -> void:
	var before: String = JSON.stringify(store.state)
	var result: Dictionary = store.transact(name,args,clock_ms)
	check(not result.ok,"invalid boundary rejects " + name)
	check(JSON.stringify(store.state) == before,"invalid boundary rolls back exact state " + name)
func _long_economy_scenario() -> void:
	var original_resources: Dictionary = store.state.resources.duplicate(true)
	tx("upgradeCharacter",{"id":"wuji"})
	tx("upgradeCharacter",{"id":"wuji"})
	tx("switchBranch",{"id":"wuji","branch":"B"})
	tx("resetCharacter",{"id":"wuji"})
	check(store.state.resources == original_resources,"real mistaken cultivation resets exact paid resources")
	check("wuji" in store.state.branchUnlocks and store.state.owned.wuji.branch == "B","reset preserves earned branch access")
	for pair in [["expandPlot",{"plot":"p0"}],["summon",{"count":100}],["buyShopItem",{"id":"xp-scroll","count":6}],["setTeam",{"ids":["not-a-hero"]}]]:
		_reject_atomic(pair[0],pair[1])
	var warehouse_id := ""
	var workshop_id := ""
	var farm_id := ""
	for building in store.state.buildings:
		if building.type == "warehouse": warehouse_id = building.id
		if building.type == "relicworkshop": workshop_id = building.id
		if building.type == "farm": farm_id = building.id
	var capacity := GameEconomy.warehouse_capacity(store.state)
	tx("upgradeBuilding",{"id":warehouse_id})
	check(GameEconomy.warehouse_capacity(store.state) == capacity,"warehouse retains old capacity during upgrade")
	clock_ms += 30000; tx("advance")
	check(GameEconomy.warehouse_capacity(store.state) == capacity+2000,"completed warehouse adds real pending storage")
	var before_cancel: Dictionary = store.state.resources.duplicate(true)
	var queue = tx("queueRecipe",{"id":workshop_id,"recipeId":"relic-essence"})
	if queue: tx("cancelQueue",{"id":workshop_id,"jobId":queue.id})
	check(store.state.resources == before_cancel,"cancel live production exactly refunds committed recipe")
	tx("moveBuilding",{"id":farm_id,"plot":"p10"})
	var nourished: Dictionary = GameEconomy.production_bonus(store.state,GameEconomy.building(store.state,farm_id))
	check(float(nourished.nourishment) == 0.2,"moved real farm receives native nourished plot bonus")
	tx("assign",{"id":farm_id,"characterId":"wuji"})
	check(GameEconomy.production_bonus(store.state,GameEconomy.building(store.state,farm_id)).multiplier > 1.2,"staff and nourishment combine after actual move")
	var last: int = clock_ms
	clock_ms += 86400000
	var offline = tx("advance")
	check(offline != null and offline.capped and int(offline.elapsedMs) == 43200000,"24h offline grants exactly capped12h production window")
	check(int(store.state.lastTime) == clock_ms,"offline cap advances checkpoint to real return time")
	var warnings: int = store.state.clockWarnings
	var rollback: Dictionary = store.transact("advance",{},last)
	check(rollback.ok and rollback.data.backwards and store.state.clockWarnings == warnings+1,"backward clock only warns with zero reward")
	tx("harvest")
	var shop_info := GameData.named(GameEconomy.shop_status(store.state,clock_ms),"xp-scroll")
	tx("buyShopItem",{"id":"xp-scroll","count":int(shop_info.remaining)})
	_reject_atomic("buyShopItem",{"id":"xp-scroll","count":1})
	clock_ms += 86400000
	tx("buyShopItem",{"id":"xp-scroll","count":1})
	tx("useItem",{"id":"xp-scroll","count":2})
	var original: Dictionary = store.state.duplicate(true)
	store.fail_writes = true
	var failed: Dictionary = store.transact("summon",{"count":1,"txid":"audit-storage-retry"},clock_ms)
	check(not failed.ok and store.state == original,"failed actual disk write preserves summon ticket and RNG")
	store.fail_writes = false
	tx("summon",{"count":1,"txid":"audit-storage-retry"})
	check(store.state.resources.ticket == int(original.resources.ticket)-1,"retry commits exactly one paid draw")
	var target_id: String = store.state.equipment.items[-1].id
	tx("lockArtifact",{"id":target_id,"value":true})
	_reject_atomic("salvageArtifacts",{"ids":[target_id]})
	tx("lockArtifact",{"id":target_id,"value":false})
	if GameEquipment.equipped_by(store.state,target_id).is_empty(): tx("salvageArtifacts",{"ids":[target_id]})
	audit_facts["long_economy"]={"warehouse_capacity":GameEconomy.warehouse_capacity(store.state),"offline_cap":offline,"clock_warning_delta":int(store.state.clockWarnings)-warnings,"nourished_bonus":nourished,"shop_ledger":store.state.shopLedger.duplicate(true),"newest_resources":store.state.resources.duplicate(true)}

func _mock_op(service: GameOnlineMock,account: String,device: String,operation: String,args: Dictionary = {}) -> Variant:
	var result := service.command(account,device,operation,args)
	check(result.ok,"real local mock operation " + operation + " " + result.get("error",""))
	return result.get("data")
func _mock_recovery_scenario() -> void:
	var ordinary_before: Dictionary = store.state.duplicate(true)
	var exported := store.base_dir.path_join("mock-seed-export.json")
	check(store.export_save(exported).ok,"export legitimately progressed ordinary data as test seed")
	var directory := store.base_dir + "-services"
	var a := GameStore.new(directory)
	var a2 := GameStore.new(directory)
	var b := GameStore.new(directory)
	check(a.load_mock_profile("normal","audit_a","device_1").ok,"isolated A virtual device1")
	check(a2.load_mock_profile("normal","audit_a","device_2").ok,"isolated A virtual device2")
	check(b.load_mock_profile("normal","audit_b","device_1").ok,"isolated B account")
	check(a.import_save(exported).ok,"ordinary game progression copies into bounded isolated mock account")
	var service := GameOnlineMock.new(directory.path_join("service.json"))
	_mock_op(service,"audit_a","device_1","login",{"nickname":"独立验收甲"})
	_mock_op(service,"audit_a","device_2","login",{"nickname":"独立验收甲"})
	_mock_op(service,"audit_b","device_1","login",{"nickname":"独立验收乙"})
	var cloud = _mock_op(service,"audit_a","device_1","cloud_upload",{"save":a.state.duplicate(true),"expected_revision":0})
	check(a2.import_mock_state(cloud,int(a2.state.revision)).ok,"explicit cloud transfer applies exact authentic game state")
	check(a2.state.resources == a.state.resources and a2.state.equipment == a.state.equipment,"second virtual device receives exact assets and equipment")
	check(a.transact("summon",{"count":1,"txid":"device-one-progress"},clock_ms).ok,"device1 develops own progress")
	check(a2.transact("summon",{"count":1,"txid":"device-two-progress"},clock_ms).ok,"device2 develops conflicting own progress")
	_mock_op(service,"audit_a","device_1","cloud_upload",{"save":a.state.duplicate(true),"expected_revision":1})
	var service_before: Dictionary = service.snapshot()
	var conflict := service.command("audit_a","device_2","cloud_upload",{"save":a2.state.duplicate(true),"expected_revision":1})
	check(not conflict.ok and conflict.data.code == "CONFLICT" and service.snapshot() == service_before,"stale virtual device upload reports conflict without replacing cloud")
	cloud = _mock_op(service,"audit_a","device_2","cloud_download")
	check(a2.import_mock_state(cloud,int(a2.state.revision)).ok,"explicitly selected cloud wins after conflict comparison")
	var b_before: Dictionary = b.state.duplicate(true)
	check(not b.import_mock_state(cloud,int(b.state.revision)).ok and b.state == b_before,"cross-account cloud application fully rejected")
	var order = _mock_op(service,"audit_a","device_1","payment_create",{"sku":"test_small","request_id":"audit-one-order"})
	var receipt = _mock_op(service,"audit_a","device_1","payment_settle",{"order_id":order.id,"outcome":"paid"})
	var tickets: int = a.state.resources.ticket
	a.fail_writes = true
	check(not a.redeem_mock_receipt(receipt,service).ok and a.state.resources.ticket == tickets,"paid local mock receipt survives game disk failure without false credit")
	a.fail_writes = false
	var forged: Dictionary = receipt.duplicate(true); forged.rewards.ticket = 999
	check(a.redeem_mock_receipt(forged,service).ok and a.state.resources.ticket == tickets+3,"receipt replay credits provider canonical3 tickets only")
	check(a.redeem_mock_receipt(receipt,service).ok and a.state.resources.ticket == tickets+3,"repeated delivery credits no additional tickets")
	check(not b.redeem_mock_receipt(receipt,service).ok,"other account cannot redeem paid mock order")
	_mock_op(service,"audit_a","device_1","chat_send",{"text":"验收文本 [b]保持原文[/b] <script>不可执行</script>","request_id":"audit-message"})
	_mock_op(service,"audit_a","device_1","chat_send",{"text":"验收文本 [b]保持原文[/b] <script>不可执行</script>","request_id":"audit-message"})
	var history = _mock_op(service,"audit_b","device_1","chat_history")
	check(history.size() == 1,"local mock message retry is exactly once")
	var guild = _mock_op(service,"audit_a","device_1","guild_create",{"name":"独立验收仙盟"})
	_mock_op(service,"audit_b","device_1","guild_join",{"guild_id":guild.id})
	_mock_op(service,"audit_a","device_1","chat_send",{"channel":"guild","text":"仅当前盟友"})
	_mock_op(service,"audit_a","device_1","guild_leave",{"successor_id":"audit_b"})
	check(not service.command("audit_a","device_1","chat_history",{"channel":"guild"}).ok,"former guild owner cannot read current guild after leave")
	_mock_op(service,"audit_b","device_1","guild_leave")
	_mock_op(service,"audit_a","device_1","rank_submit",{"score":GameEquipment.team_power(a.state)})
	check(_mock_op(service,"audit_a","device_1","rank_list").size() == 1,"rank contains only actual test submission")
	service.offline = true
	check(not service.command("audit_a","device_1","cloud_download").ok,"explicit simulated disconnect rejects network-like reads")
	service.offline = false
	var progressed := a.export_save(directory.path_join("progressed-mock.json"))
	check(progressed.ok,"paid mock account exports durably")
	var a_path: String = a._path
	check(a.transact("settings",{"key":"speed","value":2},clock_ms).ok,"last safe checkpoint creates full paid backup")
	a.release()
	var raw_corrupt := "{AUDIT_CORRUPTED_ONLY_OWN_TEST_SAVE}"
	var file := FileAccess.open(a_path,FileAccess.WRITE); file.store_string(raw_corrupt); file.close()
	a = GameStore.new(directory)
	var bad := a.load_mock_profile("normal","audit_a","device_1")
	check(not bad.ok and a.corruption,"damaged mock account recognized without replacing original")
	check(not a.transact("summon",{"count":1},clock_ms).ok and FileAccess.get_file_as_string(a_path) == raw_corrupt,"corrupt mock cache preserves exact original bytes")
	check(a.restore_backup().ok,"actual mock backup recovery succeeds")
	check(a.state.resources.ticket == tickets+3,"paid assets survive corrupt account recovery")
	check(a.redeem_mock_receipt(receipt,service).ok and a.state.resources.ticket == tickets+3,"receipt remains idempotent after actual recovery")
	var battle_request := a.transact("prepareMainBattle",{"stageId":1,"options":{"seed":89321,"now":clock_ms}},clock_ms)
	check(battle_request.ok,"recovered cloud/mock account can enter real native fight")
	if battle_request.ok:
		var req: Dictionary = battle_request.data
		var battle := GameCombat.create(req.stageId,req.team,req.options)
		finish(battle,true)
		check(a.transact("settleMainBattle",{"battle":battle},clock_ms).ok,"recovered mock account durably settles actual victory")
	check(store.state == ordinary_before,"entire multi-account flow preserves ordinary in-memory progress")
	var disk := GameStore.decode_save(FileAccess.get_file_as_string(store._path))
	check(disk.ok and disk.data.resources == ordinary_before.resources,"ordinary disk assets untouched by mock payment/restore")
	audit_facts["mock_recovery"]={"cloud_revision":cloud.revision,"paid_ticket_delta":3,"replayed_receipt":receipt.receipt_id,"recovered_revision":a.state.revision,"ordinary_resources_untouched":true,"devices":2,"accounts":2}
	for item in [a,a2,b]: item.release()

func _all_content_scenario() -> void:
	var earned_battles := 0
	for plot in GameEconomy.extension_rules().expansionPlots:
		if plot.id in store.state.expandedPlots: continue
		while not GameEconomy.can_afford(store.state,plot.cost) and earned_battles < 80:
			clock_ms += 1000
			var req = tx("prepareMainBattle",{"stageId":12,"options":{"seed":85000+earned_battles,"now":clock_ms}})
			if req == null: break
			var fight := GameCombat.create(req.stageId,req.team,req.options)
			finish(fight)
			if fight.get("result") != "win": break
			tx("settleMainBattle",{"battle":fight})
			earned_battles += 1
		tx("expandPlot",{"plot":plot.id})
	check(store.state.expandedPlots.size() == 15,"all15 expansion plots purchased with normal earned resources")
	var types: Dictionary = {}
	for building in store.state.buildings: types[building.type] = true
	check(types.size() == 10,"all10 distinct facilities actually built on normal account")
	for plot in GameEconomy.get_all_plots(): check(GameEconomy.plot_unlocked(store.state,plot.id),"ordinary plot unlocked " + plot.id)
	var export_path := store.base_dir.path_join("fully-expanded-ordinary.json")
	check(store.export_save(export_path).ok,"full24plot ordinary account exported for actual native visual validation")
	audit_facts["all_content_ordinary"]={"expanded_plots":store.state.expandedPlots.duplicate(),"distinct_facilities":types.keys(),"earning_battles":earned_battles,"exported_path":export_path,"base_dir":store.base_dir,"resources":store.state.resources.duplicate(true)}

func _newcomer_interruption() -> void:
	var dir := "user://tests/audit-firstbattle-%d" % Time.get_ticks_usec()
	store = GameStore.new(dir)
	check(store.load_slot("normal").ok, "newcomer fresh normal slot")
	clock_ms = int(store.state.lastTime)
	var assets: Dictionary = store.state.resources.duplicate(true)
	var request = tx("prepareMainBattle", {"stageId":1,"options":{"seed":4177,"now":clock_ms}})
	if request == null: store.release(); return
	var interrupted := GameCombat.create(request.stageId,request.team,request.options)
	check(GameCombat.auto_act(interrupted),"newcomer performs first real action before interruption")
	var checkpoint: Dictionary = store.state.mainBattle.duplicate(true)
	store.release()
	store = GameStore.new(dir)
	check(store.load_slot("normal").ok,"newcomer reloads during admitted first battle")
	check(store.state.resources == assets and store.state.mainBattle == checkpoint,"interruption does not settle or change first-battle assets")
	var resumed = tx("prepareMainBattle", {"stageId":1,"options":{"seed":99999,"now":clock_ms+1000}})
	check(resumed == request,"resume disregards new seed/time and reuses original admission")
	var battle := GameCombat.create(resumed.stageId,resumed.team,resumed.options)
	finish(battle,true)
	var result = tx("settleMainBattle",{"battle":battle})
	check(result != null and result.first and store.state.cleared == [1],"real manual first battle commits exactly first node")
	audit_facts["round_1_newcomer_interruption"]={"base_dir":dir,"checkpoint":checkpoint,"restored_request_identical":resumed==request,"post_victory_resources":store.state.resources.duplicate(true),"discarded_inflight_actions":interrupted.actionCount,"resumption_policy":"admission snapshot restarts exact same seeded battle, not midturn continuation"}
	store.release()

func _roster_crossover_scenario() -> void:
	var results: Array = []
	for hero in GameData.content("CHARACTERS"):
		for template in GameData.content("TRIAL_TEMPLATES"):
			for branch in ["A","B"]:
				for treasure in [0,3]:
					var ids: Array = [hero.id]
					for other in template.defaultTeam:
						if not other in ids and ids.size()<5: ids.append(other)
					var team: Array = []
					for id in ids: team.append({"id":id,"level":template.level,"branch":branch,"treasure":treasure})
					var trial := GameCombat.create(template.stageId,team,{"trial":true,"enemies":template.enemies,"method":"ward","seed":70417})
					check(not trial.has("error"),"round4 actual trial creation " + hero.id)
					if trial.has("error"): continue
					var safety := 0
					while trial.result == null and safety < 2000:
						if GameCombat.current_actor(trial).get("side") == "ally" and trial.methodUses == 0: GameCombat.use_method(trial)
						check(GameCombat.auto_act(trial),"round4 roster crossover legal action")
						safety += 1
					check(trial.result in ["win","lose"],"round4 crossover reaches authentic terminal outcome " + hero.id)
					results.append({"hero":hero.id,"template":template.id,"branch":branch,"treasure":treasure,"result":trial.result,"actions":trial.actionCount,"rounds":trial.round})
	check(results.size() == 600,"all50 heroes ×3 templates ×2 branches ×2 treasure states actually complete")
	var comparisons: Array = []
	for id in ["wuji","nezha","tongtian"]:
		var team: Array = [{"id":id,"level":5,"branch":"A","treasure":1}]
		var fight := GameCombat.create(4,team,{"trial":true,"seed":4419})
		var baseline: Dictionary = GameCombat.member_stats(team[0])
		var count := 0
		while fight.result == null and count < 2000:
			check(GameCombat.auto_act(fight),"equal cultivation rarity comparison actual action")
			count += 1
		check(fight.result in ["win","lose"],"equal cultivation rarity comparison terminates")
		comparisons.append({"id":id,"stars":GameData.character(id).stars,"level":5,"branch":"A","treasure":1,"gear":"none","stats":baseline,"result":fight.result,"actions":fight.actionCount,"rounds":fight.round})
	audit_facts["round_4_roster_crossovers"]={"scope":"Explicit isolated no-reward trials, never imported into ordinary save","battle_count":results.size(),"battles":results,"equal_rarity_comparisons":comparisons}
