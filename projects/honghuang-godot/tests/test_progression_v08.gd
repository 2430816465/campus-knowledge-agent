extends SceneTree
const P = preload("res://scripts/game_progression.gd")
var checks: int = 0
var failures: Array = []
func check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		failures.append(message)
		push_error(message)
func fresh(seed_value: int = 1791300000000) -> Dictionary:
	var s: Dictionary = GameEconomy.create_state(seed_value)
	P.ensure_state(s)
	return s
func funded() -> Dictionary:
	var s: Dictionary = fresh()
	for key in s.resources: s.resources[key] = mini(50000,int(GameEconomy.config().resourceCaps[key]))
	for key in s.progression.materials: s.progression.materials[key] = 1000
	s.items["relic-essence"] = 500
	return s
func act(s: Dictionary, name: String, args: Dictionary = {}, now: int = -1) -> Dictionary:
	var result: Dictionary = P.command(s,name,args,now)
	check(result.ok,name+": "+str(result.error))
	check(P.validate(s).is_empty(),"valid after "+name+": "+P.validate(s))
	return result
func reject(s: Dictionary, name: String, args: Dictionary = {}, now: int = -1) -> void:
	var before: String = JSON.stringify(s)
	var result: Dictionary = P.command(s,name,args,now)
	check(not result.ok,name+" must reject")
	check(before==JSON.stringify(s),name+" rejected atomically incl RNG/assets/clock")
func _initialize() -> void:
	_migration()
	_forge()
	_cultivation()
	_objects_jobs()
	_friends_disciples_fish()
	_views_validation()
	_transaction_edges()
	_trial_recovery_and_corruption()
	_story_coverage()
	_manager_timing()
	_ancient_pet_fish()
	_investment_and_stat_accounting()
	print("PROGRESSION V08 CHECKS: %d, FAILURES: %d" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
func _migration() -> void:
	var s: Dictionary = fresh()
	for amount in s.progression.materials.values(): check(amount==0,"migration grants no dedicated materials")
	var before: String = JSON.stringify(s)
	P.ensure_state(s)
	check(before==JSON.stringify(s),"ensure idempotent")
	s.erase("progression")
	s.equipment.erase("sharedEquipped")
	s.equipment.erase("sharedActive")
	s.equipment.erase("legacyEquipped")
	var a: Dictionary = GameEquipment.grant_drop(s,{"rarity":5,"slot":"flower"})
	var b: Dictionary = GameEquipment.grant_drop(s,{"rarity":4,"slot":"flower"})
	s.resources.stone = 50000
	s.items["relic-essence"] = 100
	check(GameEquipment.command(s,"enhanceArtifact",{"id":a.id,"targetLevel":4}).ok,"legacy invested artifact")
	check(GameEquipment.command(s,"equipArtifact",{"id":a.id,"characterId":"nezha"}).ok,"legacy equip one")
	check(GameEquipment.command(s,"equipArtifact",{"id":b.id,"characterId":"bigan"}).ok,"legacy equip two")
	var assets: Dictionary = {"items":s.equipment.items.duplicate(true),"resources":s.resources.duplicate(),"owned":s.owned.duplicate(true),"rng":s.equipment.randomState,"equipped":s.equipment.equipped.duplicate(true),"pity":s.pity}
	P.ensure_state(s)
	check(s.equipment.items==assets.items,"migration preserves every item XP/substat/history/name/lock")
	check(s.resources==assets.resources and s.owned==assets.owned and s.pity==assets.pity,"migration preserves currencies/heroes/pity")
	check(s.equipment.randomState==assets.rng,"migration never rerolls")
	check(s.equipment.equipped==assets.equipped,"legacy mapping retained")
	check(s.equipment.sharedActive and GameEquipment.shared_item(s,"flower").id==a.id,"stronger equipped legacy item chosen")
	check(GameEquipment.stats_for(s,"nezha")==GameEquipment.stats_for(s,"bigan"),"same shared effects for all heroes")
	before = JSON.stringify(s)
	P.ensure_state(s)
	check(before==JSON.stringify(s),"migrated save remains idempotent")
	check(GameEquipment.shared_slots().size()==12 and GameEquipment.slots().size()==5,"12 shared positions and stable legacy five")
	check(P.validate(s).is_empty(),"migration valid")
func _forge() -> void:
	var s: Dictionary = funded()
	var streams: Dictionary = s.randomStreams.duplicate()
	var r: Dictionary = act(s,"progForge",{"txid":"once"})
	var before: String = JSON.stringify(s)
	act(s,"progForge",{"txid":"once"})
	check(before==JSON.stringify(s),"forge receipt retry no spending/reroll")
	reject(s,"progMakeEmbryo",{"count":-1})
	reject(s,"progMakeEmbryo",{"count":1.5})
	reject(s,"progAutoForge",{"count":51})
	reject(s,"progFurnaceUpgrade",{"txid":"once"})
	act(s,"progEquipShared",{"id":r.data.item.id})
	check(GameEquipment.shared_item(s,r.data.item.slot).id==r.data.item.id,"forge can equip shared")
	var power: int = GameEquipment.team_power(s)
	act(s,"progMakeEmbryo",{"count":3})
	act(s,"progFurnaceUpgrade")
	check(GameEquipment.team_power(s)==power,"furnace quality level not false equipment power")
	act(s,"progForgeFilter",{"rarity":5,"stats":[],"minGain":10000,"salvage":true})
	var kept: int = s.equipment.items.size()
	act(s,"progAutoForge",{"count":10})
	check(s.equipment.items.size()==kept,"low quality auto results salvaged, existing artifact kept")
	check(GameEquipment.item(s,r.data.item.id).id==r.data.item.id,"auto never consumes existing equipped item")
	check(s.randomStreams==streams,"progression RNG never consumes legacy summon/battle/expedition")
	var s2: Dictionary = fresh()
	reject(s2,"progForge")
	act(s,"progSaveFormation",{"id":"1"})
	act(s,"progUnequipShared",{"slot":r.data.item.slot})
	act(s,"progLoadFormation",{"id":"1"})
	check(GameEquipment.shared_item(s,r.data.item.slot).id==r.data.item.id,"formation restores asset refs")
	check(s.equipment.items.size()==kept,"formation never clones items")
func _cultivation() -> void:
	var s: Dictionary = funded()
	var initial: int = GameEquipment.team_power(s)
	act(s,"progDirectionNode",{"id":"sword"})
	check(GameEquipment.team_power(s)>initial,"direction training changes true character stats")
	act(s,"progVeinTrain")
	var old: Dictionary = s.progression.vein.duplicate(true)
	act(s,"progVeinRoll")
	check(s.progression.vein.branch==old.branch and s.progression.vein.quality==old.quality,"pending vein does not replace current")
	reject(s,"progVeinRoll")
	act(s,"progVeinChoose",{"accept":false})
	check(s.progression.vein.branch==old.branch and s.progression.vein.quality==old.quality,"rejecting vein keeps original")
	act(s,"progAcquire",{"family":"pets","id":"deer"})
	act(s,"progAcquire",{"family":"pets","id":"fox"})
	act(s,"progSelect",{"family":"pets","id":"deer","slot":"main"})
	reject(s,"progSelect",{"family":"pets","id":"deer","slot":"helper"})
	act(s,"progSelect",{"family":"pets","id":"fox","slot":"helper"})
	var support: Dictionary = P.battle_support(s)
	check(support.scope=="once_per_team" and support.skill=="spring","one main pet battle effect")
	act(s,"progPetInherit",{"target":"deer","donor":"fox","confirm":true})
	check(P.battle_support(s).skill=="flame" and s.progression.families.pets.size()==2,"inherit effect changes with neither pet consumed")
	for i in range(9): act(s,"progTrain",{"family":"pets","id":"deer"})
	var ledger: Dictionary = s.progression.families.pets.deer.spent.duplicate()
	reject(s,"progPetRebirth",{"id":"deer","target":"turtle","confirm":"false"})
	act(s,"progPetRebirth",{"id":"deer","target":"turtle","confirm":true})
	ledger.stone=int(ledger.get("stone",0))+300
	ledger.petsoul=int(ledger.get("petsoul",0))+5
	ledger.inheritstone=int(ledger.get("inheritstone",0))+3
	check(s.progression.families.pets.turtle.level==10 and s.progression.families.pets.turtle.spent==ledger,"rebirth keeps old levels/investment and adds exactly the newly paid transformation cost")
	check(s.progression.selected.pets.main=="turtle","rebirth updates main reference")
	for family in ["spirits","abilities","collections","mounts","manifestations"]:
		var spec: Dictionary = P.rules().families[family].choices[0]
		act(s,"progAcquire",{"family":family,"id":spec.id})
		act(s,"progTrain",{"family":family,"id":spec.id})
		act(s,"progAcquire",{"family":family,"id":spec.id})
		act(s,"progStar",{"family":family,"id":spec.id})
		if family != "collections": act(s,"progSelect",{"family":family,"id":spec.id,"slot":"1" if family=="spirits" else spec.get("category","main")})
	act(s,"progLifeNode")
	act(s,"progLawInsight",{"id":"attack"})
	act(s,"progBodyNode",{"id":"bone"})
	act(s,"progRootGrow")
	act(s,"progMountSpirit",{"id":"cloud"})
	reject(s,"progRealmBreak")
	var trial: Dictionary = act(s,"progRealmTrial")
	check(trial.data.has("battleRequest"),"trial returns immutable battle request")
	reject(s,"progRealmTrial")
	check(not P.handles("progFinishTrial"),"no public victory boolean command")
	check(P.settle_trial(s,trial.data.trial.id,false).ok,"internal authorized trial loss settlement")
	check(s.progression.realm.level==0,"failure never removes realm")
	trial = act(s,"progRealmTrial")
	check(P.settle_trial(s,trial.data.trial.id,true).ok,"internal authorized win settlement")
	check(not P.settle_trial(s,trial.data.trial.id,true).ok,"trial reward cannot repeat")
	act(s,"progRealmBreak")
func _objects_jobs() -> void:
	var s: Dictionary = funded()
	act(s,"progAcquire",{"family":"pets","id":"deer"})
	act(s,"progAcquire",{"family":"pets","id":"fox"})
	var core: Dictionary = act(s,"progCraftObject",{"kind":"petcore"}).data
	act(s,"progSocket",{"id":core.id,"target":"pet:deer","slot":"1"})
	reject(s,"progSocket",{"id":core.id,"target":"pet:fox","slot":"1"})
	test_job(s,"herbs","nezha")
	var disciple: Dictionary = act(s,"progDiscipleRecruit").data
	var job: Dictionary = act(s,"progJobStart",{"kind":"excavate","target":disciple.id}).data
	reject(s,"progJobClaim",{"id":job.id})
	reject(s,"progJobStart",{"kind":"disciple","target":disciple.id})
	var result: Dictionary = act(s,"progJobClaim",{"id":job.id},job.readyAt)
	var ancient: Dictionary = result.data.item
	check(not ancient.identified,"excavation first yields unidentified object")
	reject(s,"progSocket",{"id":ancient.id,"target":"ancient","slot":"main"})
	act(s,"progIdentify",{"id":ancient.id})
	reject(s,"progIdentify",{"id":ancient.id})
	act(s,"progSocket",{"id":ancient.id,"target":"ancient","slot":"main"})
	var gem: Dictionary = act(s,"progCraftObject",{"kind":"gem"}).data
	act(s,"progSocket",{"id":gem.id,"target":ancient.id,"slot":"1"})
	reject(s,"progSocket",{"id":gem.id,"target":"life","slot":"1"})
	act(s,"progLawInsight",{"id":"attack"})
	job = act(s,"progJobStart",{"kind":"lawcore","target":"attack"}).data
	result = act(s,"progJobClaim",{"id":job.id},job.readyAt)
	act(s,"progSocket",{"id":result.data.item.id,"target":"lawcore","slot":"main"})
	var piece: Dictionary = act(s,"progCraftObject",{"kind":"source"}).data
	act(s,"progSourcePlace",{"id":piece.id,"x":0,"y":0,"rotation":0})
	var piece2: Dictionary = act(s,"progCraftObject",{"kind":"source"}).data
	reject(s,"progSourcePlace",{"id":piece2.id,"x":0,"y":0,"rotation":0})
	reject(s,"progSourcePlace",{"id":piece2.id,"x":5,"y":5,"rotation":0})
	act(s,"progSourceExpand")
	act(s,"progSourceRemove",{"id":piece.id})
	var ids: Array = []
	for i in range(3): ids.append(act(s,"progCraftObject",{"kind":"chaos"}).data.id)
	reject(s,"progFuse",{"ids":ids,"confirm":"false"})
	reject(s,"progFuse",{"ids":[ids[0],ids[0],ids[1]],"confirm":true})
	act(s,"progObjectLock",{"id":ids[1],"value":true})
	reject(s,"progFuse",{"ids":ids,"confirm":true})
	act(s,"progObjectLock",{"id":ids[1],"value":false})
	act(s,"progFuse",{"ids":ids,"confirm":true})
	check(P.object(s,ids[0]).level==2 and P.object(s,ids[1]).is_empty(),"fusion consumes exactly two and upgrades retained object")
	test_job(s,"fertile","material")
	reject(s,"progGatherSeat",{"seat":2})
	var contest: Dictionary = act(s,"progGatherChallenge",{"seat":2}).data
	check(P.settle_trial(s,contest.trial.id,false).ok and s.progression.gather.seat==0,"lost local seat contest leaves old seat")
	contest = act(s,"progGatherChallenge",{"seat":2}).data
	check(P.settle_trial(s,contest.trial.id,true).ok,"authoritative local seat win unlocks")
	act(s,"progGatherSeat",{"seat":2})
	test_job(s,"gather","2")
	act(s,"progGatherHelp")
	reject(s,"progGatherHelp")
	test_job(s,"grotto","mountain")
	check(s.progression.grotto.regions.mountain==1,"grotto restore completes real region progress")
func test_job(s: Dictionary, kind: String, target: String) -> void:
	var team: Array = s.team.duplicate()
	var r: Dictionary = act(s,"progJobStart",{"kind":kind,"target":target})
	if not r.ok: return
	var job: Dictionary = r.data
	check(s.team==team,"dispatch never removes battle characters")
	reject(s,"progJobClaim",{"id":job.id},job.readyAt-1)
	act(s,"progJobClaim",{"id":job.id},job.readyAt)
	reject(s,"progJobClaim",{"id":job.id},job.readyAt)
func _friends_disciples_fish() -> void:
	var s: Dictionary = funded()
	act(s,"progFriendTalk",{"id":"nezha"})
	reject(s,"progFriendTalk",{"id":"nezha"})
	var spar: Dictionary = act(s,"progFriendSpar",{"id":"nezha"}).data
	check(P.settle_trial(s,spar.trial.id,true).ok,"internal spar reward settlement")
	reject(s,"progFriendSpar",{"id":"nezha"})
	act(s,"progFriendGift",{"id":"nezha","count":2})
	act(s,"progStoryRead",{"id":"nezha","chapter":0})
	var before: String = JSON.stringify(s)
	act(s,"progStoryRead",{"id":"nezha","chapter":0})
	check(before==JSON.stringify(s),"reading story again grants no extra reward")
	reject(s,"progFriendGift",{"id":"nezha","count":-1})
	var a: Dictionary = act(s,"progDiscipleRecruit").data
	var b: Dictionary = act(s,"progDiscipleRecruit").data
	act(s,"progDisciplePair",{"id":a.id,"other":b.id,"talent":"study"})
	reject(s,"progDisciplePair",{"id":a.id,"other":b.id,"talent":"study"})
	for i in range(9): act(s,"progDiscipleTrain",{"id":a.id,"mentor":"nezha"})
	var job: Dictionary = act(s,"progJobStart",{"kind":"disciple","target":a.id}).data
	reject(s,"progJobClaim",{"id":job.id},job.readyAt)
	act(s,"progDiscipleEvent",{"id":a.id,"jobId":job.id,"choice":"explore"})
	act(s,"progJobClaim",{"id":job.id},job.readyAt)
	act(s,"progDiscipleGraduate",{"id":a.id})
	check(s.progression.graduates.size()==1 and s.progression.disciples.size()==1,"graduation archived real disciple and freed residence")
	reject(s,"progDiscipleGraduate",{"id":a.id})
	s.items.training = 1
	act(s,"progHerbCommission",{"id":"training"})
	check(s.items.training==0,"commission consumes existing alchemy inventory")
	reject(s,"progHerbCommission",{"id":"training"})
	act(s,"progShop",{"id":"fishbait","count":3})
	reject(s,"progShop",{"id":"fishbait","count":100})
	var future: int = int(s.progression.fish.regenAt)+5*3600000
	check(P.fish_charges(s,future)==5 and P.fish_charges(s,future+20*3600000)==5,"fishing accumulation bounded at five")
	var fish: Dictionary = act(s,"progFishCatch",{},future).data
	act(s,"progFishTrain",{"id":fish.id})
	act(s,"progFishRoll",{"id":fish.id})
	reject(s,"progFishRoll",{"id":fish.id})
	act(s,"progFishChoose",{"id":fish.id,"accept":true})
	act(s,"progFishSelect",{"id":fish.id,"slot":"1"})
	reject(s,"progFishSelect",{"id":fish.id,"slot":"2"})
	check(s.progression.fish.owned.has(fish.id),"fish grows without being consumed")
	act(s,"progManagerAuthorize",{"id":"dispatch","value":true})
	act(s,"progManagerRun")
	var materials: Dictionary = s.progression.materials.duplicate()
	act(s,"progManagerAuthorize",{"id":"dispatch","value":false})
	act(s,"progManagerAuthorize",{"id":"claim","value":true})
	reject(s,"progManagerRun")
	check(materials==s.progression.materials,"manager no unauthorized spending")
func _views_validation() -> void:
	var s: Dictionary = funded()
	check(P.definitions().size()==46,"46 traceable progression definitions")
	var before: String = JSON.stringify(s)
	for n in range(1,47):
		var v: Dictionary = P.view(s,"%03d" % n)
		check(not v.name.is_empty() and v.actions is Array and v.selectors is Array,"view available %03d" % n)
	check(before==JSON.stringify(s),"all views preserve state and RNG")
	var bad: Dictionary = s.duplicate(true)
	bad.progression.materials.embryo = -1
	check(not P.validate(bad).is_empty(),"negative material corruption rejected")
	bad = s.duplicate(true)
	bad.progression.selected.pets.main = "deer"
	check(not P.validate(bad).is_empty(),"unowned equipped pet corruption rejected")
	var job: Dictionary = act(s,"progJobStart",{"kind":"fertile","target":"herb"}).data
	s.resources.herb = GameEconomy.config().resourceCaps.herb
	reject(s,"progJobClaim",{"id":job.id},job.readyAt)
	check(not GameData.named(s.progression.jobs,job.id).claimed,"full inventory keeps reward pending")
	var reloaded: Dictionary = GameData.normalize(JSON.parse_string(JSON.stringify(s)))
	check(P.validate(reloaded).is_empty(),"JSON save/reload valid")
	P.ensure_state(reloaded)
	check(s==reloaded,"save reload ensure gives no repeated assets")

func _transaction_edges() -> void:
	var s: Dictionary = funded()
	act(s,"progForge")
	for slot in GameEquipment.shared_slots():
		var item: Dictionary = GameEquipment.grant_drop(s,{"slot":slot.id,"rarity":5})
		check(not item.is_empty() and GameEquipment.validate(s).is_empty(),"new slot valid without changing legacy main stat rules: "+slot.id)
		act(s,"progEquipShared",{"id":item.id})
	check(s.equipment.sharedEquipped.size()==12,"all twelve distinct shared slots can be equipped")
	check(GameEquipment.command(s,"equipBestArtifacts",{"characterId":"nezha"}).ok,"best equipment handles shared twelve-slot loadout")
	check(GameEquipment.stats_for(s,"nezha")==GameEquipment.stats_for(s,"bigan"),"best shared equipment applies same gear stats to every hero")
	while s.equipment.items.size()<499: GameEquipment.grant_drop(s,{"slot":"flower","rarity":3})
	var embryos: int = s.progression.materials.embryo
	var count: int = s.progression.furnace.forged
	act(s,"progAutoForge",{"count":5})
	check(s.equipment.items.size()==500 and s.progression.materials.embryo==embryos-1 and s.progression.furnace.forged==count+1,"auto forge partial batch stops at capacity with exactly one paid result")
	reject(s,"progForge")
	s = funded()
	act(s,"progAcquire",{"family":"pets","id":"deer"})
	var core: Dictionary = act(s,"progCraftObject",{"kind":"petcore"}).data
	P.object(s,core.id).quality = 1
	for i in range(4): act(s,"progObjectTrain",{"id":core.id})
	var donor: Dictionary = act(s,"progCraftObject",{"kind":"petcore"}).data
	act(s,"progSocket",{"id":core.id,"target":"pet:deer","slot":"1"})
	act(s,"progObjectLock",{"id":donor.id,"value":true})
	reject(s,"progCoreBreakthrough",{"id":core.id,"donor":donor.id,"confirm":true})
	act(s,"progObjectLock",{"id":donor.id,"value":false})
	var spent: Dictionary = P.object(s,core.id).spent.duplicate()
	act(s,"progCoreBreakthrough",{"id":core.id,"donor":donor.id,"confirm":true})
	check(P.object(s,core.id).level==5 and P.object(s,core.id).quality==2 and P.object(s,donor.id).is_empty(),"inner-core breakthrough consumes only chosen donor and retains target level")
	for key in spent: check(P.object(s,core.id).spent[key]>=spent[key],"core investment retained: "+str(key))
	check(s.progression.sockets["pet:deer"]["1"]==core.id,"breakthrough retains embedded core identity")
	s = funded()
	var base_resources: Dictionary = s.resources.duplicate()
	reject(s,"progDispatchHerbs",{"ids":["nezha","nezha"]})
	reject(s,"progDispatchHerbs",{"ids":["nezha","not-owned"]})
	check(s.resources==base_resources and s.progression.jobs.is_empty(),"batch failure returns all costs and leaves no partially dispatched hero")
	act(s,"progDispatchHerbs",{"ids":["nezha","bigan"]})
	check(s.resources.stone==base_resources.stone-40 and s.progression.jobs.size()==2,"batch dispatch creates and pays exactly two real jobs")
	var job: Dictionary = act(s,"progJobStart",{"kind":"fertile","target":"herb","worker":"nezha"}).data
	reject(s,"progJobStart",{"kind":"fertile","target":"stone","worker":"nezha"})
	var snap: Dictionary = job.base.duplicate()
	act(s,"progRefreshFertile")
	check(GameData.named(s.progression.jobs,job.id).base==snap,"resource refresh cannot reroll an already dispatched reward")
	act(s,"progSelectDirection",{"id":"guard"})
	act(s,"progSaveFormation",{"id":"1"})
	s.progression.vein.branch="water"
	act(s,"progLoadFormation",{"id":"1"})
	check(s.progression.vein.branch=="water","formation cannot resurrect a historical random vein branch")

func _trial_recovery_and_corruption() -> void:
	var s: Dictionary = funded()
	act(s,"progAcquire",{"family":"pets","id":"fox"})
	act(s,"progSelect",{"family":"pets","id":"fox","slot":"main"})
	var started: Dictionary = act(s,"progRealmTrial").data
	act(s,"progDirectionNode",{"id":"sword"})
	act(s,"progTrain",{"family":"pets","id":"fox"})
	var resumed: Dictionary = act(s,"progResumeTrial").data
	check(started.battleRequest==resumed.battleRequest,"resuming uses original team, stats, pet and seed despite live growth")
	var before: String = JSON.stringify(s)
	for page in ["001","005","021","035","046"]:
		var v: Dictionary = P.view(s,page)
		var resume_count: int=0
		var abandon_count: int=0
		for action in v.actions:
			if action.cmd=="progResumeTrial": resume_count+=1
			if action.cmd=="progAbandonTrial":
				abandon_count+=1
				check(action.args.confirm==true,"abandon action requests explicit confirmation")
		check(resume_count==1 and abandon_count==1,"every cultivation page exposes exactly one recovery pair")
	check(JSON.stringify(s)==before,"recovery previews never mutate pending battle")
	var bad: Dictionary=s.duplicate(true)
	bad.progression.realm.pending.options.seed+=1
	check(not P.validate(bad).is_empty(),"mismatched battle option seed rejected")
	bad=s.duplicate(true)
	bad.progression.realm.pending.team[0].equipmentStats.atkPercent=-1
	check(not P.validate(bad).is_empty(),"negative saved battle stat rejected")
	bad=s.duplicate(true)
	bad.progression.realm.pending.options.petSupport.coefficient=INF
	check(not P.validate(bad).is_empty(),"non-finite pet snapshot rejected")
	reject(s,"progAbandonTrial")
	var resources: Dictionary=s.resources.duplicate()
	act(s,"progAbandonTrial",{"confirm":true})
	check(s.progression.realm.pending.is_empty() and s.progression.realm.level==0 and s.resources==resources,"confirmed abandonment grants nothing and preserves realm/resources")
	reject(s,"progResumeTrial")
	for mutation in ["profile","fertile","gather","formation","job","task"]:
		bad=s.duplicate(true)
		match mutation:
			"profile": bad.progression.profile.name=[]
			"fertile": bad.progression.fertile.points.herb=-1
			"gather": bad.progression.gather.unlocked=[1,1]
			"formation": bad.progression.formations["1"]={"team":"invalid"}
			"job": bad.progression.jobs=[{"id":"fake","kind":"grotto"}]
			"task": bad.progression.tasks.received=["forge-10","forge-10"]
		check(not P.validate(bad).is_empty(),"typed corruption rejected: "+mutation)
		var original: String=JSON.stringify(bad)
		check(not P.command(bad,"progMakeEmbryo").ok and JSON.stringify(bad)==original,"corrupt save never partially changes: "+mutation)
	var filter_view: Dictionary=P.view(s,"004")
	for selector in filter_view.selectors:
		check(selector.has("selectedId") and not GameData.named(selector.choices,selector.selectedId).is_empty(),"selector visible default matches the outgoing command")

func _story_coverage() -> void:
	var s: Dictionary=funded()
	var titles: Dictionary={}
	for hero in GameData.content("CHARACTERS"):
		for chapter in range(2):
			var story: Dictionary=P.friend_story(s,hero.id,chapter)
			check(not story.is_empty() and story.get("text","").length()>=60,"original chapter present for "+hero.id+" / "+str(chapter))
			check(not titles.has(story.get("title","")),"unique chapter title for "+hero.id)
			titles[story.get("title","")]=true
	check(titles.size()==100,"all fifty existing heroes have two separate story chapters")
	reject(s,"progStoryRead",{"id":"nezha","chapter":0})
	act(s,"progFriendGift",{"id":"nezha","count":2})
	act(s,"progFriendGift",{"id":"bigan","count":2})
	var wallet: Dictionary=s.resources.duplicate()
	var materials: Dictionary=s.progression.materials.duplicate()
	act(s,"progStoryRead",{"id":"nezha","chapter":0})
	var cosmetics: Dictionary=s.progression.families.cosmetics.duplicate(true)
	act(s,"progStoryRead",{"id":"bigan","chapter":0})
	check(s.progression.families.cosmetics==cosmetics,"same commemorative outfit is never duplicated across fifty first chapters")
	check(s.resources==wallet and s.progression.materials==materials,"story reading costs no currency or materials")
	reject(s,"progStoryRead",{"id":"nezha","chapter":1})
	act(s,"progFriendGift",{"id":"nezha","count":2})
	act(s,"progStoryRead",{"id":"nezha","chapter":1})

func _manager_timing() -> void:
	var s: Dictionary = funded()
	var now: int = int(s.lastTime)+86400000
	var assets: String = JSON.stringify(s)
	check(P.advance(s,now).ok and JSON.stringify(s)==assets,"unauthorized manager never changes assets or clocks")
	check(GameEconomy.command(s,"progManagerAuthorize",{"id":"forge","value":true},now).ok,"manager authorization uses real economy transaction")
	check(GameEconomy.command(s,"progManagerAuthorize",{"id":"dispatch","value":true},now).ok,"second authorization does not execute immediately")
	var embryos: int = s.progression.materials.embryo
	var stone: int = s.resources.stone
	var forged: int = s.progression.furnace.forged
	var pulse: Dictionary = GameEconomy.command(s,"advance",{},now+59000)
	check(pulse.ok and not pulse.data.manager.executed and s.progression.jobs.is_empty(),"first automatic pulse waits sixty seconds after authorization")
	pulse = GameEconomy.command(s,"advance",{},now+86400000)
	check(pulse.ok and pulse.data.manager.executed,"offline economy advance executes authorized manager pulse")
	check(s.progression.furnace.forged==forged+1 and s.progression.jobs.size()==1 and s.progression.materials.embryo==embryos-1 and s.resources.stone==stone-20,"offline day executes only one forge and one paid dispatch")
	assets = JSON.stringify(s.progression)
	check(GameEconomy.command(s,"advance",{},now+86400000).ok and JSON.stringify(s.progression)==assets,"same timestamp cannot repeat manager payout or payment")
	check(GameEconomy.command(s,"advance",{},now+86459000).ok and JSON.stringify(s.progression)==assets,"sub-minute ticks do not rerun manager")
	check(GameEconomy.command(s,"advance",{},now+86460000).ok and s.progression.furnace.forged==forged+2 and s.progression.jobs.size()==2,"next full minute runs one bounded pulse")
	now += 86460000
	for key in ["forge","dispatch"]:
		check(GameEconomy.command(s,"progManagerAuthorize",{"id":key,"value":false},now).ok,"disable spending branch "+key)
	check(GameEconomy.command(s,"progManagerAuthorize",{"id":"claim","value":true},now).ok,"enable only claims")
	s.resources.herb = GameEconomy.config().resourceCaps.herb
	var material_before: int = s.progression.materials.dew
	check(GameEconomy.command(s,"advance",{},now+120000).ok,"full reward storage does not fail whole elapsed-time transaction")
	check(not s.progression.jobs[0].claimed and not s.progression.jobs[1].claimed and s.progression.materials.dew==material_before,"full storage retains both pending rewards without partial material payout")
	s.resources.herb = 0
	check(GameEconomy.command(s,"advance",{},now+180000).ok,"recovered storage allows later automatic claim")
	check(s.progression.jobs[0].claimed and s.progression.jobs[1].claimed and s.progression.materials.dew==material_before+6 and s.resources.herb==40,"both original rewards paid exactly once")
	var wallet: Dictionary = s.resources.duplicate()
	check(GameEconomy.command(s,"advance",{},now+240000).ok and s.resources==wallet and s.progression.materials.dew==material_before+6,"claimed transactions are never replayed")
	check(P.validate(s).is_empty() and GameEconomy.validate_state(s).is_empty(),"manager elapsed-time integration preserves both validators")

func _ancient_pet_fish() -> void:
	var s: Dictionary = funded()
	for kind in ["ancient","seal","lawcore"]: reject(s,"progCraftObject",{"kind":kind})
	var disciple: Dictionary = act(s,"progDiscipleRecruit").data
	var now: int = int(s.progression.clock)
	for site in P.rules().excavationSites:
		var job: Dictionary = act(s,"progJobStart",{"kind":"excavate","target":disciple.id,"site":site.id},now).data
		now = int(job.readyAt)
		var result: Dictionary = act(s,"progJobClaim",{"id":job.id},now).data
		var item: Dictionary = P.object(s,str(result.item.id))
		check(item.site==site.id and not item.identified,"excavation retains chosen location until identification")
		act(s,"progIdentify",{"id":item.id},now)
		# Deterministic fixture covers all legal equipment positions separately from RNG.
		item = P.object(s,item.id)
		item.template = site.preferred
		act(s,"progSocket",{"id":item.id,"target":"ancient","slot":"main"},now)
	check(s.progression.selected.ancient.size()==3,"three ancient types occupy independent positions")
	var objects: String = JSON.stringify(s.progression.objects)
	var tablet: String = s.progression.selected.ancient.tablet
	s.progression.selected.ancient.erase("tablet")
	s.progression.selected.ancient.main=tablet
	P.ensure_state(s)
	check(s.progression.selected.ancient.tablet==tablet and not s.progression.selected.ancient.has("main") and JSON.stringify(s.progression.objects)==objects,"legacy single ancient slot migrates without reroll or lost investment")
	var copy: Dictionary=s.duplicate(true)
	P.object(copy,tablet).site="unknown"
	check(not P.validate(copy).is_empty(),"unrecognized ancient site cannot load")
	s = funded()
	act(s,"progAcquire",{"family":"pets","id":"fox"})
	act(s,"progSelect",{"family":"pets","id":"fox","slot":"main"})
	var team_before: int = GameEquipment.team_power(s)
	var hero_before: int = GameEquipment.character_power(s,"nezha")
	act(s,"progTrain",{"family":"pets","id":"fox"})
	check(GameEquipment.team_power(s)>team_before and GameEquipment.character_power(s,"nezha")==hero_before,"pet-only training contributes once to team estimate, not each hero's personal stats")
	var fish: Dictionary = act(s,"progFishCatch",{},int(s.progression.fish.regenAt)+3600000).data
	act(s,"progFishSelect",{"id":fish.id,"slot":"1"})
	var fish_view: Dictionary = P.view(s,"046",{"tab":"fish","id":fish.id,"slot":"1"})
	var can_remove: bool=false
	for action in fish_view.actions:
		if action.cmd=="progFishUnselect" and action.enabled: can_remove=true
	check(can_remove,"owned-fish page exposes water slot removal")
	act(s,"progFishUnselect",{"slot":"1"})
	check(s.progression.fish.selected.is_empty() and s.progression.fish.owned.has(fish.id),"removing water slot keeps original fish and growth")
	reject(s,"progFishUnselect",{"slot":"1"})
	var catalogue: Dictionary = P.view(s,"046",{"tab":"catalogue"})
	check(catalogue.options.size()==P.rules().fish.size() and catalogue.actions.is_empty(),"fish catalogue shows all species without duplicate capture actions")

func _investment_and_stat_accounting() -> void:
	var s: Dictionary = funded()
	act(s,"progAcquire",{"family":"pets","id":"deer"})
	act(s,"progAcquire",{"family":"pets","id":"deer"})
	act(s,"progTrain",{"family":"pets","id":"deer"})
	act(s,"progStar",{"family":"pets","id":"deer"})
	check(s.progression.families.pets.deer.spent=={"stone":615,"herb":24,"xp":20,"petfood":1,"petsoul":3},"family investment records both acquisitions, level cost and star cost once")
	var core: Dictionary = act(s,"progCraftObject",{"kind":"petcore"}).data
	# Fix only the rolled rarity so both lower-rarity breakthrough thresholds are exercised.
	P.object(s,core.id).quality=1
	for i in 4: act(s,"progObjectTrain",{"id":core.id})
	var donor: Dictionary = act(s,"progCraftObject",{"kind":"petcore"}).data
	act(s,"progCoreBreakthrough",{"id":core.id,"donor":donor.id,"confirm":true})
	check(P.object(s,core.id).spent=={"stone":900,"coreessence":22},"core breakthrough preserves consumed donor investment plus newly paid costs exactly")
	check(P.object(s,core.id).level==5 and P.object(s,donor.id).is_empty(),"core target keeps level while only selected donor is consumed")
	var pieces: Array=[]
	for i in 3: pieces.append(act(s,"progCraftObject",{"kind":"chaos"}).data.id)
	act(s,"progFuse",{"ids":pieces,"confirm":true})
	check(P.object(s,pieces[0]).spent=={"stone":400,"chaosdust":9},"fusion retained item includes all three creation costs and one fusion fee")
	var disciple: Dictionary=act(s,"progDiscipleRecruit").data
	act(s,"progJobStart",{"kind":"disciple","target":disciple.id})
	check(GameData.named(s.progression.disciples,disciple.id).spent=={"stone":175,"herb":5},"disciple archives include recruitment and paid expedition cost")

	s=funded()
	var now: int=int(s.lastTime)
	check(GameEconomy.command(s,"progAcquire",{"family":"pets","id":"deer","txid":"accounting-acquire"},now).ok,"acquisition uses official economy ledger hook")
	var ledger: Dictionary=s.activities.consumption.duplicate(true)
	check(ledger.commands==1 and ledger.resources=={"stone":240,"herb":12},"official ledger sees exact acquisition debit once")
	var paid: Dictionary=s.resources.duplicate()
	check(GameEconomy.command(s,"progAcquire",{"family":"pets","id":"deer","txid":"accounting-acquire"},now).ok,"official economy accepts identical receipt retry")
	check(s.activities.consumption==ledger and s.resources==paid and s.progression.families.pets.deer.copies==0,"receipt retry cannot add ledger points or duplicate copies")
	var before: String=JSON.stringify(s)
	check(not GameEconomy.command(s,"progTrain",{"family":"pets","id":"missing"},now).ok and JSON.stringify(s)==before,"failed training rolls back wallet and consumption ledger")
	check(GameEconomy.command(s,"progForge",{"txid":"accounting-forge"},now).ok,"forge dedicated material debit reaches official ledger")
	check(s.activities.consumption.commands==2 and s.activities.consumption.materials=={"embryo":1},"dedicated materials recorded exactly once")
	var gear: Dictionary=s.equipment.items[-1]
	act(s,"progEquipShared",{"id":gear.id})
	var gear_only: Dictionary=GameEquipment.stats_for(s,"nezha")
	act(s,"progDirectionNode",{"id":"sword"})
	check(GameEquipment.stats_for(s,"nezha")==gear_only,"gear-only accessor never includes progression a second time")
	var expected: Dictionary=gear_only.duplicate()
	for key in P.combat_bonus(s,"nezha"): expected[key]=float(expected.get(key,0))+float(P.combat_bonus(s,"nezha")[key])
	check(GameData.normalize(GameEquipment.character_stats(s,"nezha").equipmentStats)==GameData.normalize(expected),"displayed character extras equal gear plus progression once")
	var main: Dictionary=GameEconomy.command(s,"prepareMainBattle",{"stageId":1},now)
	check(main.ok,"main snapshot can be created for accounting check")
	if main.ok: check(GameData.normalize(main.data.team[0].equipmentStats)==GameData.normalize(expected),"main battle snapshot uses the same one-time combined extras")
	before=JSON.stringify(s)
	check(not GameEconomy.command(s,"progRealmTrial",{},now).ok and JSON.stringify(s)==before,"progression trial cannot overlap a real main ticket")
	check(GameEconomy.command(s,"abandonMainBattle",{},now).ok,"release saved main ticket")
	var trial: Dictionary=GameEconomy.command(s,"progRealmTrial",{},now)
	check(trial.ok,"progression trial snapshot created after releasing main battle")
	if trial.ok: check(GameData.normalize(trial.data.battleRequest.team[0].equipmentStats)==GameData.normalize(expected),"progression trial snapshot includes shared gear and growth exactly once")
	var abandon_args: Dictionary={"confirm":true,"txid":"accounting-abandon"}
	act(s,"progAbandonTrial",abandon_args,now+1000)
	check(s.progression.clock==now+1000 and s.progression.receipts.has("accounting-abandon"),"nested settlement preserves the outer transaction clock and receipt")
	before=JSON.stringify(s)
	act(s,"progAbandonTrial",abandon_args,now+1000)
	check(JSON.stringify(s)==before,"abandon receipt retry succeeds without replaying internal settlement")
	check(P.validate(s).is_empty() and GameEconomy.validate_state(s).is_empty(),"accounting audit leaves valid integrated state")
