extends "res://tests/test_framework.gd"
## Scenario tests exercise actual combat, production, migration and disk commits.
func rich() -> Dictionary:
	var s: Dictionary = GameEconomy.create_state(NOW)
	for key in s.resources: s.resources[key] = mini(200000,int(GameEconomy.config().resourceCaps[key]))
	for id in ["yangjian","leizhenzi","yunxiao"]: GameEconomy.grant(s,id)
	for id in s.owned:
		s.owned[id].level = 20; s.framework.highestLevels[id] = 20
		if not id in s.branchUnlocks: s.branchUnlocks.append(id)
	s.team = ["nezha","yangjian","yunxiao","bigan"]
	return s
func battle_claim(s: Dictionary, kind: String, extra: Dictionary = {}, at: int = NOW) -> Dictionary:
	var args: Dictionary = extra.duplicate(); args.kind = kind
	var prepared: Dictionary = act(s,"challengePrepare",args,at)
	if not prepared.ok: return {}
	var b: Dictionary = fight(prepared.data.battleRequest)
	act(s,"challengeSettle",{"battle":b},at)
	return b
func run() -> void:
	levels_and_equipment()
	production()
	challenges()
	gacha_and_migration()
	durable()
	finish()
func levels_and_equipment() -> void:
	var s: Dictionary = rich()
	s.owned.nezha.level = 1; s.framework.highestLevels.nezha = 1
	var stone: int = s.resources.stone; var xp: int = s.resources.xp
	act(s,"upgradeCharacter",{"id":"nezha","txid":"lev"})
	check(s.resources.xp == xp and s.resources.stone == stone-45,"god level only uses stone")
	var upgrades: int = s.stats.upgrades
	act(s,"resetCharacter",{"id":"nezha","txid":"reset"})
	check(s.resources.stone == stone and s.owned.nezha.level == 1,"actual ordinary spend fully refunded")
	act(s,"upgradeCharacter",{"id":"nezha"})
	check(s.stats.upgrades == upgrades,"reset and retrain does not farm milestone")
	s.framework.petShards["god:nezha"] = 1
	act(s,"fwGodStar",{"id":"nezha"}); act(s,"resetCharacter",{"id":"nezha"})
	check(s.framework.godStars.nezha == 1,"reset retains god star")
	act(s,"saveTeamPreset",{"slot":0,"name":"第一阵"})
	act(s,"setTeam",{"ids":["bigan"]})
	act(s,"applyTeamPreset",{"slot":0})
	check(s.team.size() == 4 and GameFramework.party(s).size() == 5,"preset restores lord plus four gods")
	var made: Dictionary = act(s,"progForge").data.item
	var embryos: int = s.progression.materials.embryo
	act(s,"salvageArtifacts",{"ids":[made.id]})
	check(s.progression.materials.embryo == embryos+1,"lord salvage supplies advanced forge")
	for i in range(3): act(s,"progForge")
	s.progression.materials.embryo += 10
	var advanced: Dictionary = act(s,"fwAdvancedForge").data
	check(advanced.item.rarity >= advanced.minimum,"advanced guarantee uses available current stage")
	reject(s,"enhanceArtifact",{"id":advanced.item.id,"targetLevel":1})
	act(s,"progEquipShared",{"id":advanced.item.id})
	check(GameEquipment.active_loadout(s,GameFramework.LORD).has(advanced.item.slot) and GameEquipment.active_loadout(s,"nezha").is_empty(),"lord gear does not attach to gods")
	var god: Dictionary = GameEquipment.grant_drop(s,{"rarity":5,"sourceId":"set-dungeon","slot":GameEquipment.slots()[0].id})
	check(god.ownerKind == "god","set rewards have god ownership")
	reject(s,"progEquipShared",{"id":god.id})
	act(s,"equipArtifact",{"characterId":"nezha","id":god.id})
	reject(s,"equipArtifact",{"characterId":"bigan","id":god.id})
	act(s,"unequipArtifact",{"characterId":"nezha","slot":god.slot})
	act(s,"equipArtifact",{"characterId":"bigan","id":god.id})
	check(not god.id in GameEquipment.active_loadout(s,"nezha").values() and god.id in GameEquipment.active_loadout(s,"bigan").values(),"an artifact is moved, never duplicated")
	s.items["relic-essence"] = 200
	act(s,"enhanceArtifact",{"id":god.id,"targetLevel":8})
	var initial: Array = god.substats.duplicate(true)
	var equipped: Dictionary = GameEquipment.item(s,god.id)
	var event_index: int = -1; var target: String = ""
	for i in range(equipped.enhancements.size()):
		var event: Dictionary = equipped.enhancements[i]
		if event.type != "roll": continue
		for sub in equipped.substats.slice(0,int(equipped.initialCount)):
			if sub.stat != event.stat: target = sub.stat; event_index = i; break
		if event_index >= 0: break
	check(event_index >= 0,"enhancement includes a correctable actual roll")
	if event_index >= 0:
		var main_value: float = equipped.mainValue; var identity: String = equipped.setId
		act(s,"fwCorrectArtifact",{"id":god.id,"event":event_index,"stat":target})
		check(GameEquipment.item(s,god.id).mainValue == main_value and GameEquipment.item(s,god.id).setId == identity,"correction keeps main value and set identity")
		reject(s,"fwCorrectArtifact",{"id":god.id,"event":event_index,"stat":equipped.enhancements[event_index].stat})
	act(s,"fwPetSummon")
	var pet: String = s.progression.families.pets.keys()[0]
	act(s,"progSelect",{"family":"pets","id":pet,"slot":"main"})
	check(GameProgression.battle_support(s).is_empty(),"pets provide no active support")
	stone = s.resources.stone
	act(s,"fwPetTrain",{"id":pet}); act(s,"fwPetReset",{"id":pet})
	check(s.resources.stone == stone and s.progression.families.pets[pet].level == 1,"pet exact level refund")
	var history: int = s.progression.tasks.trained
	act(s,"fwPetTrain",{"id":pet})
	check(s.progression.tasks.trained == history,"pet reset cannot farm training objective")
	var other_life: String = GameProgression.rules().lifeBranches.keys()[1]
	reject(s,"progLifeBranch",{"id":other_life})
	act(s,"fwLifeAcquire",{"id":other_life}); act(s,"progLifeBranch",{"id":other_life})
	stone = s.resources.stone
	act(s,"fwLifeTrain",{"id":other_life}); act(s,"fwLifeReset",{"id":other_life})
	check(s.resources.stone == stone and s.framework.lifeArtifacts.size() == 2,"life levels independently refundable, collection retained")
func production() -> void:
	var s: Dictionary = rich()
	for p in s.framework.estate.plans.values(): p.recipe = ""
	var hall: Dictionary = GameEconomy.building(s,"spring")
	var rate: Dictionary = GameEconomy.extension_rules().passiveRates.get(hall.type,{})
	check(not rate.is_empty(),"hall has configured production")
	act(s,"estatePlan",{"id":hall.id,"recipe":"passive"})
	var online: Dictionary = s.duplicate(true); var offline: Dictionary = s.duplicate(true)
	for i in range(1,31): GameEconomy.advance(online,NOW+i*60000)
	GameEconomy.advance(offline,NOW+30*60000)
	check(online.warehouse == offline.warehouse and online.framework.estate.plans == offline.framework.estate.plans,"online ticks and one offline interval yield same state")
	var result: Dictionary = GameEconomy.advance(offline,NOW+10*86400000)
	check(result.data.elapsedMs == 10*86400000-30*60000 and not result.data.capped,"offline time has no fixed duration ceiling")
	check(GameEstateProduction.occupied(offline,rate.resource) <= GameEstateProduction.capacity(offline,rate.resource),"category storage including reservation never overflows")
	var occupied: int = GameEstateProduction.occupied(offline,rate.resource)
	act(offline,"harvestBuilding",{"id":hall.id},NOW+10*86400000)
	GameEconomy.advance(offline,NOW+10*86400000+60000)
	check(GameEstateProduction.occupied(offline,rate.resource) < occupied,"claim frees capacity and producer restarts")
	act(s,"progDiscipleRecruit"); act(s,"progDiscipleRecruit")
	var worker: String = s.progression.disciples[0].id
	var reserve: String = s.progression.disciples[1].id
	var aptitude: Dictionary = s.progression.disciples[0].aptitude.duplicate(true)
	act(s,"estateTeam",{"id":hall.id,"ids":[worker]})
	GameEconomy.advance(s,NOW+180000)
	check(GameData.named(s.progression.disciples,worker).expertise.gather > 0 and GameData.named(s.progression.disciples,reserve).expertise.gather == 0,"only actual workers gain expertise")
	check(GameData.named(s.progression.disciples,worker).aptitude == aptitude,"work never changes fixed aptitude")
	var after: int = s.resources.stone
	act(s,"progDiscipleTrain",{"id":worker},NOW+180000); act(s,"fwResetDisciple",{"id":worker},NOW+180000)
	check(s.resources.stone == after and GameData.named(s.progression.disciples,worker).expertise.gather > 0,"disciple resets exact level spend and keeps expertise")
	act(s,"estateHost",{"type":hall.type,"hero":"nezha"},NOW+180000)
	check("nezha" in s.team,"host remains available in combat")
	var another: String = "farm" if hall.type != "farm" else "spring"
	reject(s,"estateHost",{"type":another,"hero":"nezha"},NOW+180000)
	act(s,"estateOrdersRefresh",{},NOW+180000)
	act(s,"estateOrderAccept",{"id":"0"},NOW+180000)
	var receipt: String = s.framework.estate.orders[0].receiptId
	act(s,"estateOrdersRefresh",{},NOW+86400000*2)
	check(s.framework.estate.orders[0].receiptId == receipt and s.framework.estate.orders[0].status == "accepted","refresh preserves accepted order")
	act(s,"estateOrderDeliver",{"id":"0","txid":"delivery"},NOW+86400000*2)
	var resources: Dictionary = s.resources.duplicate(true)
	act(s,"estateOrderDeliver",{"id":"0"},NOW+86400000*2)
	check(s.resources == resources,"delivered order never rewards twice")
	var broken: Dictionary = s.duplicate(true)
	broken.framework.estate.orders[0].need.stone = -1
	check(not GameEconomy.validate_state(broken).is_empty(),"negative order goods rejected")
func challenges() -> void:
	var s: Dictionary = rich()
	var b: Dictionary = battle_claim(s,"material",{"difficulty":1,"type":"stone"})
	check(b.result == "win","material reward tested with actual victory")
	var charges: int = s.framework.challenges.materialCharges.stone
	act(s,"challengeClaim",{"id":b.id,"txid":"claim"})
	var assets: Dictionary = s.resources.duplicate(true)
	act(s,"challengeClaim",{"id":b.id})
	check(s.resources == assets and s.framework.challenges.materialCharges.stone == charges-1,"claim id is durable without caller replay id")
	act(s,"challengeSweep",{"type":"stone","difficulty":1,"txid":"sweep"})
	check(s.framework.challenges.materialCharges.stone == 0,"sweep uses one available reward")
	reject(s,"challengeAdMaterial",{"type":"stone","success":true})
	b = battle_claim(s,"material",{"difficulty":2,"type":"stone"})
	check(b.result == "win" and s.framework.challenges.materialUnlocks.stone == 2,"zero-charge actual practice unlocks higher sweep")
	check(s.framework.challenges.completed[b.id].claimed and s.framework.challenges.completed[b.id].practice,"practice cannot bank rewards for tomorrow")
	reject(s,"challengeSweep",{"type":"stone","difficulty":2})
	var stamina: int = s.framework.challenges.stamina
	b = battle_claim(s,"set",{"difficulty":1,"dungeon":2})
	check(s.framework.challenges.stamina == stamina,"set entry and victory do not prematurely charge")
	act(s,"challengeClaim",{"id":b.id})
	var drop: Dictionary = s.equipment.items.back()
	check(s.framework.challenges.stamina == stamina-20 and drop.setId in [GameEquipment.rules().sets[4].id,GameEquipment.rules().sets[5].id],"set claim charges exactly and drops only dungeon pair")
	reject(s,"challengeSetSweep")
	var weak: Dictionary = GameEconomy.create_state(NOW)
	var loss: Dictionary = battle_claim(weak,"material",{"difficulty":12,"type":"herb"})
	check(loss.result == "lose" and weak.framework.challenges.materialCharges.herb == 2,"actual defeat costs no material claims")
	for i in range(3): b = battle_claim(s,"tower")
	check(s.framework.challenges.towerHistory == 3,"tower actual victories progress")
	s.framework.challenges.towerHistory = 10
	var next_week: int = NOW+7*86400000
	GameEconomy.advance(s,next_week)
	check(s.framework.challenges.towerFloor == 5 and s.framework.challenges.towerWeekly == [1,2,3,4],"new week restarts high and credits only skipped weekly floors")
	check(s.framework.challenges.towerFirst == [1,2,3],"weekly skip doesn't fake permanent first clears")
	var once: Dictionary = s.resources.duplicate(true)
	GameEconomy.advance(s,next_week)
	check(s.resources == once,"weekly recovery repeats without duplicate rewards")
	var beast: Dictionary = rich()
	var q: Dictionary = act(beast,"challengePrepare",{"kind":"beast"})
	b = fight(q.data.battleRequest)
	var bad: Dictionary = b.duplicate(true)
	bad.stats[bad.stats.keys()[0]].damage += 999999
	reject(beast,"challengeSettle",{"battle":bad})
	act(beast,"challengeSettle",{"battle":b})
	var best: int = beast.framework.challenges.beastBest
	b = battle_claim(beast,"beast")
	check(beast.framework.challenges.beastBest == maxi(best,int(beast.framework.challenges.completed[b.id].damage)),"attempts use highest single damage, never accumulated")
	GameEconomy.advance(beast,NOW+86400000)
	check(beast.framework.challenges.beastBest == 0 and beast.framework.mail.size() > 0,"daily reset mails earned unclaimed beast thresholds")
	var mail: String = beast.framework.mail[0].id
	act(beast,"challengeMailClaim",{"id":mail},NOW+86400000)
	once = beast.resources.duplicate(true)
	act(beast,"challengeMailClaim",{"id":mail},NOW+86400000)
	check(beast.resources == once,"recovery mail rewards once")
	var mountain: Dictionary = rich()
	act(mountain,"challengeMountainStart")
	var week: String = mountain.framework.challenges.mountain.week
	act(mountain,"challengeMountainChoose",{"choice":"boon"})
	var boons: Array = mountain.framework.challenges.mountain.boons.duplicate()
	GameEconomy.advance(mountain,next_week)
	reject(mountain,"challengeMountainStart",{},next_week)
	check(mountain.framework.challenges.mountain.week == week and mountain.framework.challenges.mountain.boons == boons,"old mountain period and boons survive cross-week")
	act(mountain,"challengeMountainChoose",{"choice":"battle"},next_week)
	b = battle_claim(mountain,"mountain",{},next_week)
	check(b.result == "win" and mountain.framework.challenges.mountain.boons == boons,"fresh actual battle retains route boons")
	check(mountain.framework.challenges.mountainMajor.has(week+":2"),"cross-week old route reward belongs entry period")
	act(mountain,"challengeMountainEnd",{},next_week)
	act(mountain,"challengeMountainStart",{},next_week)
	check(mountain.framework.challenges.mountain.week != week,"new route enters current period after old run ends")
	var story: Dictionary = rich()
	for i in range(13):
		b = battle_claim(story,"story")
		check(b.result == "win","continuous story actual win "+str(i+1))
		if i+1 in [4,8,12]: act(story,"integrateCore",{"id":"spring" if i == 3 else "furnace" if i == 7 else "thunder"})
	check(story.framework.storyNode == 14 and story.cleared.size() == 12,"continuous story advances beyond original stage limit")
	check(story.integratedCores == ["spring","furnace","thunder"] and story.choicePending,"old first-clear cores and choice are preserved")
func gacha_and_migration() -> void:
	var s: Dictionary = rich()
	s.pity = 88; s.fourStarPity = 5
	act(s,"fwSetPool",{"id":"limited-new"})
	var r: Dictionary = GameEconomy.command(s,"summon",{"count":1,"txid":"lim1","rng":func() -> float: return 0.8},NOW)
	check(r.ok and s.pity == 88 and s.fourStarPity == 5 and s.framework.gacha.limitedPity == 1,"limited roll keeps standard pity independent")
	act(s,"fwSetPool",{"id":"limited-rerun"})
	check(s.framework.gacha.limitedPity == 1,"same-class rerun inherits limited pity")
	s.framework.gacha.limitedPity = 89
	r = GameEconomy.command(s,"summon",{"count":1,"txid":"lim2","rng":func() -> float: return 0.8},NOW)
	check(r.ok and r.data[0].id == GameFramework.featured("limited-rerun"),"limited highest pity always featured")
	var pity: int = s.framework.gacha.limitedPity
	act(s,"fwLimitedExchange")
	reject(s,"fwLimitedExchange")
	check(s.framework.gacha.limitedPity == pity,"one-per-period exchange keeps draw pity")
	var old: Dictionary = rich()
	old.framework.erase("highestLevels")
	old.erase("framework"); old.slots = 5; old.team = ["nezha","bigan","huangfeihu","yangjian","yunxiao"]
	old.cleared = [1,2,3]; old.choicePending = true
	var gear: Dictionary = GameEquipment.grant_drop(old,{"sourceId":"furnace","slot":GameEquipment.shared_slots()[0].id,"rarity":4})
	old.equipment.sharedActive = true; old.equipment.sharedEquipped[gear.slot] = gear.id
	GameEquipment.item(old,gear.id).erase("ownerKind")
	var migrated: Dictionary = GameEconomy.migrate_state(old,3)
	check(not migrated.has("error"),"actual old schema migration: "+str(migrated.get("error","")))
	if not migrated.has("error"):
		check(migrated.slots == 4 and migrated.framework.migration.reserveGods == ["yunxiao"],"fifth god moves to reserve without removal")
		check(migrated.resources == old.resources and migrated.owned == old.owned and migrated.pity == old.pity,"migration preserves assets, characters and pity")
		check(GameEquipment.item(migrated,gear.id).ownerKind == "lord" and not migrated.equipment.sharedActive,"shared item changes ownership without cloning")
		check(GameEconomy.validate_state(migrated).is_empty(),"migrated complete state validates")
func durable() -> void:
	var dir: String = "user://tests/framework-"+str(Time.get_ticks_usec())
	var store := GameStore.new(dir)
	check(store.load_slot().ok,"disk save created")
	var before: Dictionary = store.state.duplicate(true)
	store.fail_writes = true
	check(not store.transact("upgradeCharacter",{"id":"nezha","txid":"disk-level"}).ok and store.state == before,"disk failure leaves level, ledger and assets unchanged")
	store.fail_writes = false
	check(store.transact("upgradeCharacter",{"id":"nezha","txid":"disk-level"}).ok,"retry same operation commits once")
	var level: int = store.state.owned.nezha.level
	check(store.transact("challengePrepare",{"kind":"material","txid":"saved-battle"}).ok,"battle snapshot committed before playback")
	var id: String = store.state.framework.challenges.pending.id
	store.release()
	var resumed := GameStore.new(dir)
	check(resumed.load_slot().ok and resumed.state.framework.challenges.pending.id == id,"reopen recovers same pending battle")
	check(resumed.transact("upgradeCharacter",{"id":"nezha","txid":"disk-level"}).ok and resumed.state.owned.nezha.level == level,"saved mutation receipt prevents repeated level gain")
	resumed.release()
