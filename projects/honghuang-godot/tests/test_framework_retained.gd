extends "res://tests/test_framework_rules.gd"
## Retained cultivation systems through the authoritative economic transaction API.
func run() -> void:
	var s: Dictionary = rich()
	for key in s.progression.materials: s.progression.materials[key] = 1000
	s.items["relic-essence"] = 500
	for family in ["spirits","abilities","collections","mounts","manifestations"]:
		var spec: Dictionary = GameProgression.rules().families[family].choices[0]
		act(s,"progAcquire",{"family":family,"id":spec.id})
		act(s,"progTrain",{"family":family,"id":spec.id})
		act(s,"progAcquire",{"family":family,"id":spec.id})
		act(s,"progStar",{"family":family,"id":spec.id})
		if family != "collections": act(s,"progSelect",{"family":family,"id":spec.id,"slot":"1" if family == "spirits" else spec.get("category","main")})
	var god_stats: Dictionary = GameEconomy.battle_extras(s,"nezha")
	var lord_stats: Dictionary = GameEconomy.battle_extras(s,GameFramework.LORD)
	act(s,"progLawInsight",{"id":"attack"})
	check(GameEconomy.battle_extras(s,"nezha") == god_stats and GameEconomy.battle_extras(s,GameFramework.LORD) != lord_stats,"personal law affects lord only")
	act(s,"progVeinTrain"); act(s,"progVeinRoll")
	var branch: String = s.progression.vein.branch
	act(s,"progVeinChoose",{"accept":false})
	check(s.progression.vein.branch == branch,"reject pending vein retains original branch")
	act(s,"progBodyNode",{"id":"bone"}); act(s,"progRootGrow")
	act(s,"progLifeNode")
	var pets: Dictionary = act(s,"fwPetSummon").data
	var pet_id: String = str(pets.id)
	var core: Dictionary = act(s,"progCraftObject",{"kind":"petcore"}).data
	act(s,"progSocket",{"id":core.id,"target":"pet:"+pet_id,"slot":"1"})
	reject(s,"progSocket",{"id":core.id,"target":"life","slot":"1"})
	act(s,"progDiscipleRecruit")
	var worker: String = s.progression.disciples[0].id
	var aptitude: Dictionary = s.progression.disciples[0].aptitude.duplicate(true)
	var job: Dictionary = act(s,"progJobStart",{"kind":"excavate","target":worker}).data
	reject(s,"progJobClaim",{"id":job.id},int(job.readyAt)-1)
	var ancient: Dictionary = act(s,"progJobClaim",{"id":job.id},job.readyAt).data.item
	check(not ancient.identified,"excavation produces unidentified actual object")
	reject(s,"progSocket",{"id":ancient.id,"target":"ancient","slot":"main"},s.lastTime)
	act(s,"progIdentify",{"id":ancient.id},s.lastTime)
	act(s,"progSocket",{"id":ancient.id,"target":"ancient","slot":"main"},s.lastTime)
	var gem: Dictionary = act(s,"progCraftObject",{"kind":"gem"},s.lastTime).data
	act(s,"progSocket",{"id":gem.id,"target":ancient.id,"slot":"1"},s.lastTime)
	var piece: Dictionary = act(s,"progCraftObject",{"kind":"source"},s.lastTime).data
	act(s,"progSourcePlace",{"id":piece.id,"x":0,"y":0,"rotation":0},s.lastTime)
	var piece2: Dictionary = act(s,"progCraftObject",{"kind":"source"},s.lastTime).data
	reject(s,"progSourcePlace",{"id":piece2.id,"x":0,"y":0,"rotation":0},s.lastTime)
	act(s,"progSourceExpand",{},s.lastTime)
	act(s,"progSourceRemove",{"id":piece.id},s.lastTime)
	var ids: Array = []
	for i in range(3): ids.append(act(s,"progCraftObject",{"kind":"chaos"},s.lastTime).data.id)
	reject(s,"progFuse",{"ids":[ids[0],ids[0],ids[1]],"confirm":true},s.lastTime)
	act(s,"progObjectLock",{"id":ids[1],"value":true},s.lastTime)
	reject(s,"progFuse",{"ids":ids,"confirm":true},s.lastTime)
	act(s,"progObjectLock",{"id":ids[1],"value":false},s.lastTime)
	act(s,"progFuse",{"ids":ids,"confirm":true},s.lastTime)
	check(GameProgression.object(s,ids[0]).level == 2 and GameProgression.object(s,ids[1]).is_empty(),"fusion keeps one asset and consumes exactly two")
	job = act(s,"progJobStart",{"kind":"disciple","target":worker},s.lastTime).data
	act(s,"progDiscipleEvent",{"id":worker,"jobId":job.id,"choice":"explore"},s.lastTime)
	act(s,"progJobClaim",{"id":job.id},job.readyAt)
	check(s.progression.disciples[0].aptitude == aptitude and s.progression.disciples[0].expertise.explore > 0,"retained disciple events grow expertise and preserve aptitude")
	act(s,"progFriendGift",{"id":"nezha","count":2},s.lastTime)
	act(s,"progStoryRead",{"id":"nezha","chapter":0},s.lastTime)
	var assets: Dictionary = s.resources.duplicate()
	act(s,"progStoryRead",{"id":"nezha","chapter":0},s.lastTime)
	check(s.resources == assets,"rereading cannot duplicate rewards")
	var story_count: int = 0
	for hero in GameData.content("CHARACTERS"):
		for chapter in range(2):
			check(GameProgression.friend_story(s,hero.id,chapter).get("text","").length() >= 60,"retained original story "+hero.id)
			story_count += 1
	check(story_count == 100,"all fifty existing gods retain two original stories")
	var cs: Dictionary = rich()
	battle_claim(cs,"story")
	var challenge: Dictionary = act(cs,"prepareCharacterChallenge",{"characterId":"nezha","tier":1},cs.lastTime)
	if not challenge.ok: finish(); return
	var character_battle: Dictionary = fight(challenge.data)
	check(character_battle.result == "win","retained character trial uses actual five-unit combat")
	var before_gear: int = cs.equipment.items.size()
	act(cs,"settleCharacterChallenge",{"battle":character_battle},cs.lastTime)
	check(cs.equipment.items.size() == before_gear+1,"character trial still grants an actual god artifact")
	reject(cs,"settleCharacterChallenge",{"battle":character_battle},cs.lastTime)
	# Actual cultivation trial and server-style replay validation, no win flag.
	var trial: Dictionary = act(s,"progRealmTrial",{},s.lastTime).data
	var battle: Dictionary = fight(trial.battleRequest)
	check(battle.result == "win","real realm trial victory")
	act(s,"settleProgressionTrial",{"battle":battle},s.lastTime)
	act(s,"progRealmBreak",{},s.lastTime)
	check(s.progression.realm.level == 1 and s.cleared.is_empty(),"realm advances without hard story chapter gate")
	for definition in GameProgression.definitions():
		var view: Dictionary = GameProgression.view(s,definition.id)
		check(view.id == definition.id and view.has("actions"),"retained cultivation view "+definition.id)
	check(GameEconomy.validate_state(GameData.normalize(JSON.parse_string(JSON.stringify(s)))).is_empty(),"cultivation objects survive JSON round trip with framework")
	finish()
