extends SceneTree
## Activity acceptance: real command flows, persistence, replay, failure atomicity, UI bounds.
const A = preload("res://scripts/game_activities.gd")
const UI = preload("res://scripts/activities_screen.gd")
var checks: int = 0
var failures: Array[String] = []
var base: Dictionary = {}
var finished: Array[String] = []
var ui_cases: int = 0

class Host extends Control:
	var saved: Dictionary
	func state() -> Dictionary: return saved
	func command(cmd: String, args: Dictionary, _refresh: bool = false) -> Dictionary: return A.command(saved, cmd, args, 1001)
	func toast(_message: String) -> void: pass
	func _update_wallet() -> void: pass

func _initialize() -> void:
	_run.call_deferred()

func check(value: bool, message: String) -> void:
	checks += 1
	if not value: failures.append(message); push_error(message)

func fresh() -> Dictionary:
	return base.duplicate(true)

func apply(s: Dictionary, cmd: String, args: Dictionary, success: bool = true) -> Dictionary:
	var before: String = JSON.stringify(s)
	var result: Dictionary = A.command(s, cmd, args, 1001)
	check(bool(result.ok) == success, "%s %s expected %s: %s" % [cmd, str(args), success, result.error])
	if not result.ok: check(JSON.stringify(s) == before, "failed command changed state: " + cmd)
	check(A.validate(s) == "", "postcommand state: " + A.validate(s))
	return result

func start(s: Dictionary, id: String, seed: int = 1771) -> void:
	apply(s, "activityStart", {"id": id, "seed": seed})

func act(s: Dictionary, id: String, action: String, choice: Variant = null, extra: Dictionary = {}, success: bool = true) -> Dictionary:
	var r: Dictionary = s.activities.runs[id]
	var args: Dictionary = {"id":id,"runId":r.id,"revision":r.revision,"action":action}
	if choice != null: args.choice = choice
	args.merge(extra, true)
	return apply(s,"activityAct",args,success)

func settle(s: Dictionary, id: String) -> void:
	var run_id: String = str(s.activities.runs[id].id)
	check(s.activities.runs[id].status == "ready", "not ready: " + id)
	apply(s,"activitySettle",{"id":id,"runId":run_id})
	check(not s.activities.runs.has(id), "settlement did not clear: " + id)
	var before: String = JSON.stringify(s)
	var duplicate: Dictionary = apply(s,"activitySettle",{"id":id,"runId":run_id})
	check(duplicate.data.duplicate and JSON.stringify(s) == before, "duplicate payout: " + id)
	if id not in finished: finished.append(id)

func roundtrip(s: Dictionary) -> Dictionary:
	var f: FileAccess = FileAccess.open("user://activities-v08-test.json",FileAccess.WRITE)
	check(f != null,"checkpoint open")
	f.store_string(JSON.stringify(s)); f.close()
	var restored: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("user://activities-v08-test.json"))
	check(A.validate(restored) == "", "checkpoint invalid: " + A.validate(restored))
	return restored

func _run() -> void:
	base = GameEconomy.demo_state("expedition-project",1000)
	for key: String in GameEconomy.RESOURCE_KEYS: base.resources[key] = mini(100000,int(GameEconomy.config().resourceCaps[key])/2)
	A.ensure_state(base)
	check(A.validate(base) == "","initial state")
	_atomic_and_replay()
	_trials()
	_exploration()
	_boards()
	_construct_and_beasts()
	_defense_and_casual()
	_online()
	_festival()
	_growth_and_receipts()
	_distinct_sandboxes()
	_battle_exclusion()
	await _ui()
	await _ui_edges()
	DirAccess.remove_absolute("user://activities-v08-test.json")
	print("ACTIVITIES_V08 checks=%d failures=%d completed_rules=%d ui_cases=%d" % [checks, failures.size(), finished.size(), ui_cases])
	for error: String in failures: print("FAIL " + error)
	quit(0 if failures.is_empty() else 1)

func _atomic_and_replay() -> void:
	var s: Dictionary = fresh()
	s.resources.stone = 11
	apply(s,"activityStart",{"id":"067"},false)
	s = fresh(); start(s,"068",2012)
	apply(s,"activityStart",{"id":"068"},false)
	apply(s,"activitySettle",{"id":"068","runId":s.activities.runs["068"].id},false)
	act(s,"068","exit",null,{},false)
	var old: Dictionary = {"id":"068","runId":s.activities.runs["068"].id,"revision":0,"action":"safe"}
	apply(s,"activityAct",old)
	apply(s,"activityAct",old,false)
	var twin: Dictionary = roundtrip(s)
	act(s,"068","safe"); act(twin,"068","safe")
	check(GameData.normalize(s) == GameData.normalize(twin),"seed changed after load")
	act(s,"068","exit")
	var stone_before: int = int(s.resources.stone)
	s.resources.stone = int(GameEconomy.config().resourceCaps.stone)
	apply(s,"activitySettle",{"id":"068","runId":s.activities.runs["068"].id},false)
	check(s.activities.runs["068"].status == "ready","overflow erased committed result")
	s.resources.stone = stone_before; settle(s,"068")
	start(s,"067"); start(s,"078")
	check(s.activities.runs.size()==2,"independent activity runs")
	var bad: Dictionary = s.duplicate(true); bad.activities.runs["067"].team[0] = 4
	check(A.validate(bad) != "","corrupt team accepted")
	bad = s.duplicate(true); bad.activities.runs["067"].rng = 0
	check(A.validate(bad) != "","zero rng accepted")
	var unchanged: String = JSON.stringify(s)
	A.view(s,"067")
	check(JSON.stringify(s)==unchanged,"readonly view changed state")
	act(s,"067","abandon"); settle(s,"067")
	check(s.activities.runs.has("078"),"settlement erased another run")
	act(s,"078","abandon"); settle(s,"078")
	apply(s,"activityStart",{"id":"not-real"},false)
	apply(s,"activityStart",{"id":"047"},false)
	apply(s,"activityStart",{"id":"056"},false)

func _trials() -> void:
	for id: String in ["048","050","051","053"]:
		var s: Dictionary = fresh(); start(s,id)
		if id != "050": act(s,id,"target",2)
		act(s,id,"fight")
		check(s.activities.runs[id].battle.actions > 0,"trial did not resolve actual actions:"+id)
		check(s.activities.runs[id].battle.damage > 0,"trial zero damage:"+id)
		check(s.activities.runs[id].outcome == "success","fixture should beat trial:"+id)
		if id == "050":
			var expected_stone: int = int(A.rules().reward.stone) * clampi(1 + int(s.activities.runs[id].score) / 20,1,5)
			for chest: Dictionary in A.rules().damageChests:
				if s.activities.runs[id].battle.damage >= chest.damage: expected_stone += int(chest.reward.stone)
			check(A._reward(s.activities.runs[id]).stone == expected_stone,"damage chest threshold reward missing")
		settle(s,id)
		if id == "048":
			apply(s,"activitySweep",{"id":id,"target":0},false)
			apply(s,"activitySweep",{"id":id,"target":2})
	var tower: Dictionary = fresh(); start(tower,"049")
	act(tower,"049","leave",null,{},false)
	for i: int in 5:
		act(tower,"049","fight")
		if tower.activities.runs["049"].status != "active": break
		if i < 4: act(tower,"049","boon","might")
	check(tower.activities.runs["049"].step == 5,"tower did not advance five real battles")
	act(tower,"049","leave")
	var previous_material: int = int(tower.progression.materials.abilitypage)
	var previous_wallet: Dictionary = tower.resources.duplicate(true)
	tower.progression.materials.abilitypage = int(GameProgression.rules().materialCap)
	apply(tower,"activitySettle",{"id":"049","runId":tower.activities.runs["049"].id},false)
	check(tower.resources == previous_wallet,"material cap failed after partial wallet payout")
	tower.progression.materials.abilitypage = previous_material
	settle(tower,"049")
	check(tower.progression.materials.abilitypage > previous_material,"tower did not award usable ability pages")

func _exploration() -> void:
	var s: Dictionary = fresh(); start(s,"067")
	var permanent: Dictionary = GameData.normalize(s.owned)
	for i: int in 5:
		if s.activities.runs["067"].status != "active": break
		act(s,"067","boon","blade")
		s = roundtrip(s)
		act(s,"067","fight")
	check(s.activities.runs["067"].step == 5,"dream five-node path not reachable")
	check(GameData.normalize(s.owned)==permanent,"temporary dream changed permanent characters")
	settle(s,"067")
	s = fresh(); start(s,"068",99)
	for i: int in 8:
		if s.activities.runs["068"].status != "active": break
		act(s,"068","risk")
	check(s.activities.runs["068"].status == "ready","ruins forced failure/end")
	settle(s,"068")
	s = fresh(); start(s,"080")
	act(s,"080","room",5,{},false)
	act(s,"080","room",0); act(s,"080","room",1); act(s,"080","room",4)
	act(s,"080","hint")
	act(s,"080","answer",s.activities.runs["080"].model.answer)
	act(s,"080","room",5); settle(s,"080")
	s = fresh(); start(s,"080b")
	var turns: int = 0
	while s.activities.runs["080b"].status == "active" and turns < 30:
		act(s,"080b","hint")
		act(s,"080b","rotate",s.activities.runs["080b"].model.hint)
		turns += 1
	check(s.activities.runs["080b"].outcome == "success","puzzle hint path must solve")
	settle(s,"080b")
	s = fresh(); start(s,"082")
	for i: int in 6:
		if s.activities.runs["082"].status == "active": act(s,"082","path","courage" if i < 3 else "compassion")
	check(s.activities.runs["082"].step == 6,"reincarnation six distinct nodes")
	settle(s,"082")
	s = fresh(); start(s,"082b")
	act(s,"082b","node",5,{},false)
	for i: int in [4,0,1,3,2,5]:
		if s.activities.runs["082b"].status == "active": act(s,"082b","node",i)
	check(s.activities.runs["082b"].outcome == "success","exorcism independent seals/final battle")
	settle(s,"082b")

func _boards() -> void:
	var s: Dictionary = fresh(); start(s,"070")
	act(s,"070","allocate",999,{},false)
	var turns: int = 0
	while s.activities.runs["070"].status == "active" and turns < 35:
		var m: Dictionary = s.activities.runs["070"].model
		if m.phase == "growth": act(s,"070","growth",1)
		else:
			var hitter: int = 0; var tank: int = 0
			for i: int in m.deck.size():
				if m.deck[i].hp > 0 and (m.deck[hitter].hp <= 0 or m.deck[i].atk > m.deck[hitter].atk): hitter = i
				if m.deck[i].hp > m.deck[tank].hp: tank = i
			act(s,"070","select",hitter)
			act(s,"070","allocate",int(m.budget))
			act(s,"070","resolve",tank)
		turns += 1
	check(s.activities.runs["070"].outcome == "success","card budget/growth/receive path")
	settle(s,"070")
	s = fresh(); start(s,"071")
	act(s,"071","resolve",null,{},false)
	for layer: int in 3:
		if layer > 0: act(s,"071","boon","guard")
		for i: int in 9: act(s,"071","place",i)
		act(s,"071","place",0,{},false)
		var resolved: Dictionary = act(s,"071","resolve")
		check(resolved.data.has("lines"),"sigil combination has no line score")
		check(s.activities.runs["071"].battle.get("actions",0) > 0,"sigil layout did not resolve real battle")
	check(s.activities.runs["071"].outcome=="success","sigil defensive choices")
	settle(s,"071")
	s = fresh(); start(s,"072")
	act(s,"072","move",24,{},false)
	for turn: int in 8:
		if s.activities.runs["072"].status != "active": break
		var best: int = -1; var best_value: int = -99999
		for cell: int in 25:
			var trial: Dictionary = s.duplicate(true)
			var r: Dictionary = trial.activities.runs["072"]
			var result: Dictionary = A.command(trial,"activityAct",{"id":"072","runId":r.id,"revision":r.revision,"action":"move","choice":cell},1001)
			if not result.ok: continue
			var value: int = int(trial.activities.runs["072"].hp) + int(trial.activities.runs["072"].score)*3
			if value > best_value: best_value=value; best=cell
		check(best >= 0,"chess has no legal cardinal move")
		if best >= 0: act(s,"072","move",best)
	check(s.activities.runs["072"].outcome=="success","chess survive/capture path")
	settle(s,"072")

func _construct_and_beasts() -> void:
	for id: String in ["073","074"]:
		var s: Dictionary = fresh(); var wallet: Dictionary = s.resources.duplicate(true)
		start(s,id); act(s,id,"fight",null,{},false)
		act(s,id,"talent","blade"); act(s,id,"talent","ward",{},false)
		for i: int in 3: act(s,id,"explore","salvage")
		for i: int in 3: act(s,id,"craft","weapon")
		for i: int in 3: act(s,id,"craft","armor")
		act(s,id,"craft","armor",{},false)
		act(s,id,"fight")
		check(s.activities.runs[id].outcome=="success","craft/talent/explore real battle: "+id)
		settle(s,id)
		if id == "074": check(s.resources == wallet,"puppet local practice spent real assets")
	var s: Dictionary = fresh(); start(s,"075")
	check(A.inheritance_preview(s,0,1).ok == false,"locked/active donor allowed")
	check(A.inheritance_preview(s,0,2).ok == true,"valid inheritance missing preview")
	act(s,"075","inherit",0,{"target":2},false)
	act(s,"075","inherit",0,{"target":2,"confirmed":true})
	check(s.activities.runs["075"].model.beasts.size()==3,"donor not consumed")
	act(s,"075","inherit",0,{"target":2,"confirmed":true},false)
	act(s,"075","inherit",1,{"target":3,"confirmed":true,"inheritSkill":false})
	for i: int in 3:
		if s.activities.runs["075"].status=="active": act(s,"075","fight")
	check(s.activities.runs["075"].outcome=="success","beast independent team battle")
	settle(s,"075")

func _defense_and_casual() -> void:
	var s: Dictionary = fresh(); start(s,"076")
	act(s,"076","place",0,{},false)
	for wave: int in 6:
		if s.activities.runs["076"].status != "active": break
		var m: Dictionary = s.activities.runs["076"].model
		while m.coins >= 4 and m.bench.size() <= 4:
			act(s,"076","recruit"); act(s,"076","recruit")
			act(s,"076","merge",0,{"target":1})
			var slot: int = -1
			for p: int in [3,4,5,0,1,2]:
				if s.activities.runs["076"].model.board[p]==0: slot=p; break
			if slot < 0: break
			act(s,"076","select",0); act(s,"076","place",slot)
			m = s.activities.runs["076"].model
		act(s,"076","wave")
		check(s.activities.runs["076"].battle.get("actions",0)>0,"defense did not resolve deployed gods' actual actions")
	check(s.activities.runs["076"].outcome=="success","recruit merge deploy defend path")
	settle(s,"076")
	s = fresh(); start(s,"077")
	for i: int in 5: act(s,"077","drop",i)
	check(s.activities.runs["077"].model.path.size()==7,"plinko has no physical peg path")
	settle(s,"077")
	s = fresh(); start(s,"078")
	for i: int in 12:
		var m: Dictionary = s.activities.runs["078"].model
		var lane: int = -1
		for p: int in 3:
			if p != int(m.obstacle) and absi(p-int(m.lane)) <= 1:
				if lane < 0 or p==int(m.wind): lane=p
		act(s,"078","drive",lane)
	check(s.activities.runs["078"].outcome=="success" and s.activities.runs["078"].hp==100,"race telegraph avoided collision")
	settle(s,"078")
	var match_wins: int = 0
	var match_losses: int = 0
	for seed: int in [1771,1,2,3,4,5,6,7,8,9]:
		s = fresh(); start(s,"079",seed)
		for turn: int in 8:
			if s.activities.runs["079"].status != "active": break
			var best: int=0; var count: int=0
			for i: int in 25:
				var size: int = A.match_group(s.activities.runs["079"].model.board,i).size()
				if size>count: count=size; best=i
			check(count>=2,"match stuck without legal group")
			act(s,"079","collect",best)
		if s.activities.runs["079"].outcome=="success": match_wins += 1
		else: match_losses += 1
		settle(s,"079")
	check(match_wins > 0 and match_losses > 0,"match needs reachable wins and genuine failure cases")
	s = fresh(); start(s,"081")
	for wave: int in 6:
		if s.activities.runs["081"].status != "active": break
		var m: Dictionary = s.activities.runs["081"].model
		var focus: int=0
		for i: int in 3:
			if int(m.incoming[i]) > int(m.incoming[focus]): focus=i
		act(s,"081","focus",focus)
		if m.energy>=2: act(s,"081","charge")
		act(s,"081","wave")
	check(s.activities.runs["081"].outcome=="success","sword focus/charge escort waves")
	settle(s,"081")

func _online() -> void:
	for cfg: Dictionary in A.definitions():
		if cfg.kind != "online": continue
		var id: String = cfg.id; var s: Dictionary = fresh(); var wallet: String = JSON.stringify(s.resources)
		var unavailable: Dictionary = apply(s,"activityOnlineRequest",{"id":id,"operation":"join"},false)
		check(unavailable.code=="NETWORK_UNAVAILABLE" and not unavailable.contract.configured,"network state disguised: "+id)
		start(s,id)
		match str(cfg.group):
			"trade","auction":
				act(s,id,"list"); act(s,id,"list",null,{},false); act(s,id,"cancel"); act(s,id,"list")
				if cfg.group=="auction":
					act(s,id,"bid",30); act(s,id,"bid",40)
					check(s.activities.runs[id].model.balance==60,"auction prior reserved bid not released")
					act(s,id,"cancel",null,{},false); act(s,id,"settle_trade",null,{},false)
					for i: int in 3: act(s,id,"tick")
				act(s,id,"settle_trade")
			"gift","aid","seal","rescue":
				act(s,id,"receive",null,{},false); act(s,id,"request")
				for i: int in (3 if cfg.group=="seal" else 1): act(s,id,"assist")
				act(s,id,"receive")
			"clues":
				for i: int in 9: act(s,id,"clue",i)
			"territory","tide","core","explore","development":
				if cfg.group=="development": act(s,id,"develop")
				act(s,id,"capture",8,{},false)
				for round: int in 9:
					if s.activities.runs[id].status != "active": break
					var run: Dictionary = s.activities.runs[id]
					if run.model.supply<=1: act(s,id,"resupply")
					var target: int=-1
					for i: int in [1,2,5,8,4,3,6,7]:
						var trial: Dictionary = s.duplicate(true)
						var r: Dictionary = trial.activities.runs[id]
						if A.command(trial,"activityAct",{"id":id,"runId":r.id,"revision":r.revision,"action":"capture","choice":i},1001).ok: target=i; break
					if target<0: break
					act(s,id,"capture",target)
			_:
				act(s,id,"ready",null,{},false)
				for i: int in 3: act(s,id,"support",i)
				act(s,id,"ready")
				for i: int in 12:
					if s.activities.runs[id].status != "active": break
					if s.activities.runs[id].model.phase == "missions":
						for task: int in 3: act(s,id,"mission",task)
					act(s,id,"strategy",(int(s.activities.runs[id].model.target)+1)%3)
		check(s.activities.runs[id].status=="ready","practice flow not finished: "+id)
		if s.activities.runs[id].status=="active": act(s,id,"abandon")
		settle(s,id)
		check(JSON.stringify(s.resources)==wallet and s.activities.completed==0,"practice affected actual wallet/progression: "+id)

func _festival() -> void:
	var s: Dictionary = fresh()
	apply(s,"activityAct",{"id":"083","action":"participate"},false)
	apply(s,"activityAct",{"id":"083","action":"riddle","choice":2},false)
	for i: int in 3: apply(s,"activityAct",{"id":"083","action":"craft"})
	apply(s,"activityAct",{"id":"083","action":"craft"},false)
	apply(s,"activityAct",{"id":"083","action":"riddle","choice":0})
	apply(s,"activityAct",{"id":"083","action":"riddle","choice":0},false)
	apply(s,"activityFestivalExchange",{"id":"083","offer":"lantern"})
	apply(s,"activityFestivalExchange",{"id":"083","offer":"lantern"},false)
	for i: int in 3: apply(s,"activityAct",{"id":"083b","action":"debate","topic":i,"choice":0})
	apply(s,"activityAct",{"id":"083b","action":"debate","topic":0,"choice":0},false)
	apply(s,"activityFestivalExchange",{"id":"083b","offer":"wisdom"})
	apply(s,"activityClaimMilestone",{"id":"growth-120"})
	apply(s,"activityClaimMilestone",{"id":"growth-120"},false)
	var empty: Dictionary = GameEconomy.create_state(1000); A.ensure_state(empty)
	apply(empty,"activityClaimMilestone",{"id":"runs-3"},false)
	for i: int in 3:
		start(s,"077",i+1)
		for j: int in 5: act(s,"077","drop",j)
		settle(s,"077")
	apply(s,"activityClaimMilestone",{"id":"runs-3"})
	apply(s,"activityAct",{"id":"083","action":"participate"})
	apply(s,"activityAct",{"id":"083b","action":"participate"})
	apply(s,"activityFestivalExchange",{"id":"083b","offer":"banner"})
	check(s.activities.cosmetics.size()==2,"festival cosmetics not recorded")
	apply(s,"activityEquipCosmetic",{"cosmetic":"not-owned"},false)
	apply(s,"activityEquipCosmetic",{"cosmetic":"lantern-v08"})
	check(not A.cosmetic_name(s).is_empty(),"owned commemorative card has no display name")
	s = roundtrip(s)
	check(s.activities.equippedCosmetic=="lantern-v08","equipped card not persisted")
	apply(s,"activityEquipCosmetic",{"cosmetic":"debate-v08"})
	check(A.cosmetic_name(s).contains("论道"),"alternate commemorative card name wrong")
	apply(s,"activityEquipCosmetic",{"cosmetic":""})
	check(A.cosmetic_name(s).is_empty(),"unequipped card still displayed")

func _growth_and_receipts() -> void:
	var s: Dictionary = fresh()
	s.progression.materials.spiritessence = 20
	var initial_total: int = A.milestone_progress(s,"cultivationSpent")
	var initial_resources: Dictionary = s.resources.duplicate(true)
	check(GameEconomy.command(s,"progAcquire",{"family":"mounts","id":"cloud"},1000).ok,"actual mount acquire failed")
	check(GameEconomy.command(s,"progSelect",{"family":"mounts","id":"cloud","slot":"main"},1000).ok,"actual mount select failed")
	for i: int in 2: check(GameEconomy.command(s,"progTrain",{"family":"mounts","id":"cloud"},1000).ok,"actual mount train failed")
	check(int(s.activities.consumption.materials.get("spiritessence",0))==2,"mount cultivation materials missing in ledger")
	var net: int = 2
	for key: String in GameEconomy.RESOURCE_KEYS: net += maxi(0,int(initial_resources[key])-int(s.resources[key]))
	check(A.milestone_progress(s,"cultivationSpent")==initial_total+net,"actual economy command consumption counted wrong")
	var before: String = JSON.stringify(s)
	check(not GameEconomy.command(s,"progTrain",{"family":"mounts","id":"not-owned"},1000).ok,"invalid mount train accepted")
	check(JSON.stringify(s)==before,"failed command changed consumption ledger")
	start(s,"078")
	check(s.activities.runs["078"].model.mountId=="cloud" and s.activities.runs["078"].model.mountLevel==3 and s.activities.runs["078"].model.growth==1,"race did not inherit cultivated mount")
	check(s.activities.runs["078"].model.speed==2,"cultivated mount did not improve starting speed")
	var collision: Dictionary = s.duplicate(true)
	act(collision,"078","drive",int(collision.activities.runs["078"].model.obstacle))
	check(collision.activities.runs["078"].hp==76 and collision.activities.runs["078"].model.speed==2,"cultivated mount collision mitigation/reset wrong")
	var plain: Dictionary = fresh(); start(plain,"078")
	act(plain,"078","drive",int(plain.activities.runs["078"].model.obstacle))
	check(plain.activities.runs["078"].hp==72 and plain.activities.runs["078"].model.speed==1,"untrained mount collision baseline wrong")
	var corrupt_race: Dictionary = s.duplicate(true); corrupt_race.activities.runs["078"].model.growth=2
	check(A.validate(corrupt_race)!="","inconsistent race growth snapshot accepted")
	corrupt_race=s.duplicate(true); corrupt_race.activities.runs["078"].model.mountId="fake-mount"
	check(A.validate(corrupt_race)!="","unknown race mount snapshot accepted")
	var capped: Dictionary = s.duplicate(true)
	capped.activities.runs.erase("078"); capped.progression.families.mounts.cloud.level=45; capped.progression.families.mounts.cloud.stars=5
	start(capped,"078")
	check(capped.activities.runs["078"].model.growth==2 and capped.activities.runs["078"].model.speed==3,"race permanent growth escaped its finite cap")
	var snapshot: Dictionary = s.activities.runs["078"].model.duplicate(true)
	check(GameEconomy.command(s,"progTrain",{"family":"mounts","id":"cloud"},1000).ok,"mount mid-run cultivation failed")
	check(s.activities.runs["078"].model==snapshot,"race snapshot changed mid-run")
	for i: int in 12:
		var m: Dictionary = s.activities.runs["078"].model
		var lane: int = -1
		for p: int in 3:
			if p != int(m.obstacle) and absi(p-int(m.lane))<=1:
				if lane<0 or p==int(m.wind): lane=p
		act(s,"078","drive",lane)
	var old_material: int = int(s.progression.materials.spiritessence)
	settle(s,"078")
	check(int(s.progression.materials.spiritessence)>old_material,"race did not reward usable mount cultivation material")
	s = fresh(); s.activities.erase("consumption")
	var legacy: int = A._known_cultivation(s)
	var twin: Dictionary = s.duplicate(true)
	twin.resources.stone -= 50
	var member: String = str(twin.owned.keys()[0])
	twin.owned[member].spent.stone += 50
	A.ensure_state(twin)
	A.record_consumption(twin,s,"legacy-test",1005)
	check(twin.activities.consumption.legacyCultivation==legacy and A.milestone_progress(twin,"cultivationSpent")==legacy+50,"migrated draft counted new spending twice")
	check(twin.activities.consumption.fromAt==1005,"consumption version start timestamp wrong")
	var gain: Dictionary = twin.duplicate(true); gain.resources.stone += 100
	A.record_consumption(gain,twin,"refund-test",1006)
	check(gain.activities.consumption==twin.activities.consumption,"refund counted as consumption")
	var bad: Dictionary = twin.duplicate(true); bad.activities.consumption.materials.spiritessence=-1
	check(A.validate(bad)!="","negative consumption accepted")
	roundtrip(twin)

func _distinct_sandboxes() -> void:
	var s: Dictionary = fresh(); var before_wallet: Dictionary = s.resources.duplicate(true)
	start(s,"054b")
	for i: int in 3: act(s,"054b","support",i)
	act(s,"054b","ready")
	for i: int in 2: act(s,"054b","strategy",int(s.activities.runs["054b"].model.target))
	check(s.activities.runs["054b"].outcome=="fail" and s.activities.runs["054b"].model.seriesLosses==2,"bracket did not eliminate on two losses")
	settle(s,"054b"); check(s.resources==before_wallet,"bracket loss changed real wallet")
	s = fresh(); var permanent: Dictionary = GameData.normalize(s.owned)
	start(s,"062")
	var r: Dictionary = s.activities.runs["062"]
	var levels: int = 0
	for member: Dictionary in r.team: levels += int(member.level)
	var inherited: int = clampi(levels/maxi(1,r.team.size())/5,0,3)
	check(r.model.inherited==inherited and r.model.supply==8+inherited,"development did not inherit bounded actual team growth")
	act(s,"062","develop"); act(s,"062","resupply")
	check(GameData.normalize(s.owned)==permanent,"sandbox changed permanent cultivation")
	s = fresh(); start(s,"064")
	for i: int in 3: act(s,"064","support",i)
	act(s,"064","ready")
	act(s,"064","strategy",0,{},false)
	for i: int in 3:
		act(s,"064","mission",0); act(s,"064","mission",0,{},false)
		act(s,"064","mission",1); act(s,"064","mission",2)
		act(s,"064","strategy",(int(s.activities.runs["064"].model.target)+1)%3)
	check(s.activities.runs["064"].model.glory==["沙盘·协作旗"],"league missions did not unlock local memorial")
	settle(s,"064"); s=roundtrip(s)
	check(s.activities.records["064"].practiceBadges==["沙盘·协作旗"],"league memorial not saved")
	var bad: Dictionary = s.duplicate(true); bad.activities.records["064"].practiceBadges=["真实跨服冠军"]
	check(A.validate(bad)!="","unrecognized online glory accepted")

func _battle_exclusion() -> void:
	for blocker: String in ["main","character","realm","expedition"]:
		var s: Dictionary = fresh(); start(s,"049"); start(s,"077")
		match blocker:
			"main": s.mainBattle={"id":"pending-authority"}
			"character": s.characterChallenges.active={"id":"pending-authority"}
			"realm": s.progression.realm.pending={"id":"pending-authority"}
			"expedition": s.expeditions.active={"status":"battle"}
		act(s,"049","fight",null,{},false)
		act(s,"077","drop",0)
		check(s.activities.runs["049"].step==0 and s.activities.runs["077"].model.balls==4,"combat lock blocked noncombat game or progressed battle")

func _ui() -> void:
	var host: Host = Host.new(); host.theme = GameTheme.create(); root.add_child(host)
	for viewport_size: Vector2i in [Vector2i(540,960),Vector2i(360,800),Vector2i(320,844),Vector2i(320,568),Vector2i(320,567)]:
		root.size = viewport_size
		root.content_scale_size = viewport_size
		for id: String in ["049","054b","062","064","067","070","071","072","073","075","076","077","078","079","080","080b","081","082","082b","065b","083","083b","084"]:
			host.saved = fresh()
			if id not in ["083","083b","084"]: start(host.saved,id)
			var body_height: int = 309 if viewport_size.y == 567 else 444 if viewport_size.y == 568 else viewport_size.y - 300
			host.set_meta("page_content_height",body_height)
			var screen: Control = UI.build(host,host,id)
			screen.size = Vector2(viewport_size.x-24,body_height)
			await process_frame; await process_frame
			_inspect_ui(screen,"%s %s" % [id,viewport_size])
			if "--activity-capture" in OS.get_cmdline_user_args() and id in ["054b","062","064","067","070","072","076","077","078","079","083"] and viewport_size.y in [960,568,567]:
				await RenderingServer.frame_post_draw
				root.get_texture().get_image().save_png("user://activities-v08-%s-%dx%d.png" % [id,viewport_size.x,viewport_size.y])
			ui_cases += 1
			screen.queue_free(); await process_frame
	host.queue_free(); await process_frame

func _inspect_ui(screen: Variant, context: String) -> void:
	var rectangle: Rect2 = Rect2(Vector2.ZERO,screen.size)
	for child: Node in screen.get_children():
		if child is Control: check(rectangle.grow(1).encloses(Rect2(child.position,child.size)),"UI overflow %s child %s %s" % [context,child.name,Rect2(child.position,child.size)])
	for button: Button in screen.cell_buttons:
		check(Rect2(Vector2.ZERO,screen.board.size).grow(1).encloses(Rect2(button.position,button.size)),"board cell overflow " + context + " " + button.text)
	for label: Label in screen.find_children("*", "Label", true, false):
		var text_height: float = label.get_line_count() * label.get_line_height() + maxi(0, label.get_line_count()-1) * label.get_theme_constant("line_spacing")
		check(text_height <= label.size.y + 1, "text clipped %s %s: %s" % [context,label.name,label.text])
		if label.get_parent() is Button: check(Rect2(Vector2.ZERO,label.get_parent().size).grow(1).encloses(Rect2(label.position,label.size)), "caption outside button %s: %s" % [context,label.text])
	check(screen.find_children("*","ScrollContainer",true,false).is_empty(),"scroll UI " + context)

func _ui_edges() -> void:
	root.size = Vector2i(320,568); root.content_scale_size = Vector2i(320,568)
	var host: Host = Host.new(); host.theme = GameTheme.create(); root.add_child(host)
	host.set_meta("page_content_height",444)
	for id: String in ["070","075","076","050","083b"]:
		host.saved = fresh()
		if id != "083b": start(host.saved,id)
		if id == "070": host.saved.activities.runs[id].model.deck.append({"id":3,"name":"长生符","hp":36,"atk":4})
		if id == "076": host.saved.activities.runs[id].model.bench = [1,1,1,1,1,1]; host.saved.activities.runs[id].model.board = [2,2,2,1,1,1]; host.saved.activities.runs[id].model.selected = 5
		if id == "050": act(host.saved,id,"fight")
		check(A.validate(host.saved)=="","adversarial UI fixture invalid: "+id)
		var screen: Variant = UI.build(host,host,id); screen.size=Vector2(296,444)
		await process_frame; await process_frame
		_inspect_ui(screen,id+" edge")
		if "--activity-capture" in OS.get_cmdline_user_args():
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("user://activities-v08-edge-%s-320x568.png" % id)
		if id == "075":
			var before: String = JSON.stringify(host.saved)
			screen._invoke({"cmd":"activityAct","args":{"action":"inherit","choice":0,"target":2,"requiresConfirm":true}})
			await process_frame; await process_frame
			check(JSON.stringify(host.saved)==before,"inherit preview mutated saved beasts")
			_inspect_ui(screen,"075 inheritance confirmation")
			screen._invoke({"cmd":"dismiss","args":{}})
			await process_frame; await process_frame
			check(JSON.stringify(host.saved)==before,"inherit cancel consumed donor")
		if id == "083b":
			screen._invoke({"cmd":"activityAct","args":{"action":"debate","topic":0,"previewTopic":true}})
			await process_frame; await process_frame
			_inspect_ui(screen,"083b topic choices")
		ui_cases += 1
		screen.queue_free(); await process_frame
	host.saved = fresh()
	var screen: Variant = UI.build(host,host,"067"); screen.size=Vector2(296,444)
	await process_frame; await process_frame
	var before_stone: int = int(host.saved.resources.stone)
	screen._invoke({"cmd":"activityStart","args":{}})
	screen._invoke({"cmd":"activityStart","args":{}})
	check(int(host.saved.activities.seq)==1 and int(host.saved.resources.stone)==before_stone-12,"same-frame double-click charged twice")
	screen.free(); host.saved = roundtrip(host.saved)
	await process_frame
	screen = UI.build(host,host,"067"); screen.size=Vector2(296,444)
	await process_frame; await process_frame
	check(screen.content.run.id==host.saved.activities.runs["067"].id,"reopen did not restore current run")
	screen._invoke({"cmd":"activityAct","args":{"action":"boon","choice":"blade"}})
	host.free(); await process_frame
	check(true,"destroyed host deferred rebuild survived")
	# Real main-shell shortest available body, including dense training and worst-case contents.
	host = Host.new(); host.theme = GameTheme.create(); root.add_child(host)
	host.set_meta("page_content_height",309)
	for id: String in ["054b","064","070","075","076","083b"]:
		host.saved=fresh()
		if id != "083b": start(host.saved,id)
		if id in ["054b","064"]:
			for i: int in 3: act(host.saved,id,"support",i)
			act(host.saved,id,"ready")
			if id == "064":
				for i: int in 3: act(host.saved,id,"mission",i)
		if id == "070": host.saved.activities.runs[id].model.deck.append({"id":3,"name":"长生符","hp":36,"atk":4})
		if id == "076": host.saved.activities.runs[id].model.bench=[1,1,1,1,1,1]; host.saved.activities.runs[id].model.board=[2,2,2,1,1,1]; host.saved.activities.runs[id].model.selected=5
		screen=UI.build(host,host,id); screen.size=Vector2(296,309)
		await process_frame; await process_frame
		if id == "075": screen._invoke({"cmd":"activityAct","args":{"action":"inherit","choice":0,"target":2,"requiresConfirm":true}})
		if id == "083b": screen._invoke({"cmd":"activityAct","args":{"action":"debate","topic":0,"previewTopic":true}})
		await process_frame; await process_frame
		_inspect_ui(screen,id+" dense 309 edge")
		if id in ["054b","064"]: check(screen.board.get_node("BoardIntro").text.contains("对手策略"),"strategy choices have no visible opponent telegraph")
		if "--activity-capture" in OS.get_cmdline_user_args():
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("user://activities-v08-dense-%s-309.png" % id)
		ui_cases+=1; screen.queue_free(); await process_frame
	host.queue_free(); await process_frame
