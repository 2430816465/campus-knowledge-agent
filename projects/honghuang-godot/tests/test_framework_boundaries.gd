extends "res://tests/test_framework_rules.gd"
func run() -> void:
	production_boundaries()
	category_workforce()
	period_boundaries()
	legacy_boundaries()
	finish()
func category_workforce() -> void:
	var s: Dictionary = rich()
	for plan in s.framework.estate.plans.values(): plan.recipe = ""
	act(s,"progDiscipleRecruit"); act(s,"progDiscipleRecruit")
	var worker: String = s.progression.disciples[0].id
	var reserve: String = s.progression.disciples[1].id
	var first: Dictionary = built(s,"farm")
	var second_id: String = ""
	for plot in GameEconomy.get_all_plots():
		if GameEconomy.check_plot(s,plot.id,"farm").is_empty():
			var result: Dictionary = act(s,"build",{"type":"farm","plot":plot.id})
			if result.ok:
				for building in s.buildings:
					if building.type == "farm" and building.id != first.id: second_id = building.id
			break
	check(not second_id.is_empty(),"second independent farm built")
	if second_id.is_empty(): return
	for bid in [first.id,second_id]:
		if s.framework.estate.plans[bid].active is Dictionary: act(s,"estateCancel",{"id":bid})
		else: act(s,"estatePlan",{"id":bid,"recipe":"stop"})
	# Old per-building teams migrate into one category; current jobs survive.
	s.framework.estate.teams = {first.id:[worker],second_id:[reserve]}
	s.framework.estate.erase("teamSchema")
	GameFramework.ensure(s)
	check(s.framework.estate.teams == {"farm":[worker]} and s.progression.disciples.size() == 2,"legacy teams merge by category; excess workers remain owned reserve")
	act(s,"estateAssign",{"worker":reserve,"type":"reserve"})
	act(s,"estatePlan",{"id":first.id,"recipe":"passive"})
	var one: Dictionary = s.duplicate(true)
	act(s,"estatePlan",{"id":second_id,"recipe":"passive"})
	check(s.framework.estate.plans[first.id].active.workers == [worker] and s.framework.estate.plans[second_id].active.workers == [worker],"one class team supports both independent plans")
	var online: Dictionary = s.duplicate(true)
	GameEconomy.advance(one,NOW+180000)
	GameEconomy.advance(s,NOW+180000)
	for i in range(1,19): GameEconomy.advance(online,NOW+i*10000)
	check(s == online,"class work time and production are online/offline identical")
	check(s.progression.disciples[0].expertise.gather == one.progression.disciples[0].expertise.gather and s.progression.disciples[0].expertise.gather == 3,"multiple buildings do not duplicate one worker's experience")
	check(s.progression.disciples[1].expertise.gather == 0,"reserve gains no experience")
	reject(s,"estateAssign",{"worker":worker,"type":"spring"},NOW+180000)
	check(worker in s.framework.estate.teams.farm,"failed move keeps previous class team atomically")
	act(s,"estateAssign",{"worker":worker,"type":"reserve"},NOW+180000)
	GameEconomy.advance(s,NOW+360000)
	var expertise: int = s.progression.disciples[0].expertise.gather
	GameEconomy.advance(s,NOW+420000)
	check(s.progression.disciples[0].expertise.gather == expertise,"reserve stops accruing after promised current work finishes")
	var study_estate: Dictionary = rich()
	var study_building: Dictionary = built(study_estate,"alchemy")
	for plan in study_estate.framework.estate.plans.values():
		plan.recipe = ""; plan.active = null
	act(study_estate,"progDiscipleRecruit")
	var student: String = study_estate.progression.disciples[0].id
	act(study_estate,"estateAssign",{"worker":student,"type":"alchemy"})
	act(study_estate,"estatePlan",{"id":study_building.id,"recipe":"training"})
	GameEconomy.advance(study_estate,NOW+120000)
	check(study_estate.progression.disciples[0].expertise.study == 2 and study_estate.progression.disciples[0].expertise.gather == 0,"alchemy work grows study expertise, not gathering")
	# Star growth must match actual member stats and displayed power.
	var god: Dictionary = rich()
	var power: int = GameEquipment.character_power(god,"nezha")
	var before: Dictionary = GameEquipment.character_stats(god,"nezha")
	god.framework.godStars.nezha = 2
	var after: Dictionary = GameEquipment.character_stats(god,"nezha")
	var combat: Dictionary = GameCombat.member_stats(GameFramework.party(god)[1])
	check(after.hp == combat.maxHp and after.atk == combat.atk and after.def == combat.def,"star stats agree between character panel and combat")
	check(after.hp > before.hp and GameEquipment.character_power(god,"nezha") > power,"stars increase displayed power")
func production_boundaries() -> void:
	var s: Dictionary = rich()
	var b: Dictionary = built(s,"alchemy")
	check(not b.is_empty(),"existing alchemy building")
	var before: Dictionary = s.resources.duplicate(true)
	act(s,"estatePlan",{"id":b.id,"recipe":"training"})
	var active: Dictionary = s.framework.estate.plans[b.id].active.duplicate(true)
	check(active.paid == {"herb":3,"material":1} and s.resources.herb == before.herb-3,"only current batch is paid")
	act(s,"estatePlan",{"id":b.id,"recipe":"heal"})
	check(s.framework.estate.plans[b.id].active == active and s.framework.estate.plans[b.id].nextRecipe == "heal","plan change preserves current paid batch")
	act(s,"estateCancel",{"id":b.id,"txid":"cancel"})
	check(s.resources == before and s.framework.estate.plans[b.id].recipe.is_empty(),"cancel refunds exactly and stops production")
	act(s,"estateCancel",{"id":b.id,"txid":"cancel"})
	check(s.resources == before,"cancel retry cannot duplicate inputs")
	act(s,"estatePlan",{"id":b.id,"recipe":"training"})
	act(s,"estatePlan",{"id":b.id,"recipe":"heal"})
	var at: int = int(s.framework.estate.plans[b.id].active.readyAt)
	GameEconomy.advance(s,at)
	check(s.framework.estate.plans[b.id].active.recipe == "heal" and s.warehouse.items.training == 1,"next plan starts after prior product exists")
	# Pending intermediate ingredients are consumed before backpack stock.
	var supply: Dictionary = rich()
	var supplier_alchemy: Dictionary = built(supply,"alchemy")
	for plan in supply.framework.estate.plans.values(): plan.recipe = ""
	var mine: Dictionary = GameEconomy.building(supply,"spring")
	GameEconomy.accept_output(supply,mine,{"output":{"resource":"material","count":10}})
	var bag_material: int = supply.resources.material
	act(supply,"estatePlan",{"id":supplier_alchemy.id,"recipe":"training"})
	check(supply.resources.material == bag_material and supply.warehouse.resources.material == 9,"automatic intermediate supply does not duplicate or alter chosen plans")
	# A blocked consumable category leaves resource producers running.
	var full: Dictionary = rich()
	var full_alchemy: Dictionary = built(full,"alchemy")
	for plan in full.framework.estate.plans.values(): plan.recipe = ""
	GameEconomy.accept_output(full,full_alchemy,{"output":{"item":"training","count":GameEstateProduction.capacity(full,"consumable")}})
	act(full,"estatePlan",{"id":full_alchemy.id,"recipe":"training"})
	act(full,"estatePlan",{"id":"spring","recipe":"passive"})
	GameEconomy.advance(full,NOW+60000)
	check(full.framework.estate.plans[full_alchemy.id].paused == "分类仓库已满" and full.warehouse.resources.xp > 0,"full category only stops its own producer")
	check(GameEconomy.validate_state(full).is_empty(),"full category state valid")
	# Same category, different recipes, independent paid batches and cancellation.
	var multi: Dictionary = rich()
	var first: Dictionary = built(multi,"alchemy")
	var second_id: String = ""
	for plot in GameEconomy.get_all_plots():
		if GameEconomy.check_plot(multi,plot.id,"alchemy").is_empty():
			var result: Dictionary = act(multi,"build",{"type":"alchemy","plot":plot.id})
			if result.ok:
				for other in multi.buildings:
					if other.type == "alchemy" and other.id != first.id: second_id = other.id
			break
	check(not second_id.is_empty(),"multiple production buildings of same category enabled")
	if second_id.is_empty(): return
	act(multi,"estatePlan",{"id":first.id,"recipe":"training"})
	act(multi,"estatePlan",{"id":second_id,"recipe":"heal"})
	var second_job: Dictionary = multi.framework.estate.plans[second_id].active.duplicate(true)
	check(multi.framework.estate.plans[first.id].active.recipe == "training" and second_job.recipe == "heal","same class supports different per-building recipes")
	act(multi,"estateCancel",{"id":first.id})
	check(multi.framework.estate.plans[second_id].active == second_job,"one cancellation preserves other independent production commitment")
	var shortage: Dictionary = rich()
	var shortage_building: Dictionary = built(shortage,"alchemy")
	for plan in shortage.framework.estate.plans.values(): plan.recipe = ""; plan.active = null
	shortage.resources.herb = 0; shortage.resources.material = 0
	act(shortage,"estatePlan",{"id":shortage_building.id,"recipe":"training"})
	check(shortage.framework.estate.plans[shortage_building.id].active == null and shortage.framework.estate.plans[shortage_building.id].paused.contains("缺少灵药 3") and shortage.framework.estate.plans[shortage_building.id].paused.contains("灵田生产"),"blocked plan names actual missing ingredient, quantity and source")
func period_boundaries() -> void:
	var s: Dictionary = rich()
	var q: Dictionary = act(s,"challengePrepare",{"kind":"beast"})
	var b: Dictionary = fight(q.data.battleRequest)
	var old_day: String = s.framework.challenges.pending.day
	var tomorrow: int = NOW+86400000
	act(s,"challengeSettle",{"battle":b},tomorrow)
	check(s.framework.challenges.beastBest == 0 and s.framework.challenges.beastHistory[old_day].best > 0,"cross-day damage belongs saved entry day")
	var mail_count: int = s.framework.mail.size()
	act(s,"challengeSettle",{"battle":b},tomorrow)
	check(s.framework.mail.size() == mail_count,"cross-day duplicate settlement cannot remail")
	var tower: Dictionary = rich()
	q = act(tower,"challengePrepare",{"kind":"tower"})
	b = fight(q.data.battleRequest)
	var old_week: String = tower.framework.challenges.pending.week
	act(tower,"challengeSettle",{"battle":b},NOW+7*86400000)
	check(tower.framework.challenges.towerPeriods[old_week] == [1] and tower.framework.challenges.towerWeekly.is_empty(),"cross-week tower win cannot advance current weekly claim")
	check(GameFramework.day(1791406799999) != GameFramework.day(1791406800000),"05:00 Beijing daily boundary")
	# Keep valid saved components when another component has disappeared.
	var preset: Dictionary = rich()
	preset.progression.fish.owned = {"jade":{"level":1,"stars":0,"copies":0,"quality":1,"affix":"atkPercent","spent":{}}}
	# Use an actual configured fish ID.
	var fish_id: String = GameProgression.rules().fish[0].id
	preset.progression.fish.owned[fish_id] = preset.progression.fish.owned.jade; preset.progression.fish.owned.erase("jade")
	preset.progression.fish.selected = {"1":fish_id}
	act(preset,"saveTeamPreset",{"slot":0})
	preset.framework.presets[0].fish["2"] = "retired-fish"
	preset.progression.fish.selected = {}
	var applied: Dictionary = act(preset,"applyTeamPreset",{"slot":0})
	check(preset.progression.fish.selected == {"1":fish_id} and not applied.data.warnings.is_empty(),"partial preset applies surviving fish with specific warning")
	# An empty slot in a complete preset must unset the current selection.
	var empty_selection: Dictionary = rich()
	act(empty_selection,"saveTeamPreset",{"slot":0})
	var spec: Dictionary = GameProgression.rules().families.abilities.choices[0]
	act(empty_selection,"progAcquire",{"family":"abilities","id":spec.id})
	act(empty_selection,"progSelect",{"family":"abilities","id":spec.id,"slot":spec.category})
	check(not empty_selection.progression.selected.abilities.is_empty(),"ability equipped before full preset restore")
	act(empty_selection,"applyTeamPreset",{"slot":0})
	check(empty_selection.progression.selected.abilities.is_empty(),"full preset restores empty saved ability slots")
func legacy_boundaries() -> void:
	var s: Dictionary = rich()
	act(s,"progDiscipleRecruit"); act(s,"fwPetSummon")
	var d: Dictionary = s.progression.disciples[0]
	var pet: String = s.progression.families.pets.keys()[0]
	d.level = 4; d.spent = {"stone":500,"material":10}
	for key in ["levelSpent","resetLevel","highestLevel"]: d.erase(key)
	s.progression.families.pets[pet].level = 5; s.progression.families.pets[pet].spent = {"stone":800,"petfood":20}
	for key in ["levelSpent","resetLevel","highestLevel"]: s.progression.families.pets[pet].erase(key)
	GameFramework.ensure(s)
	var stone: int = s.resources.stone
	act(s,"progDiscipleTrain",{"id":d.id}); act(s,"fwResetDisciple",{"id":d.id})
	act(s,"fwPetTrain",{"id":pet}); act(s,"fwPetReset",{"id":pet})
	check(s.progression.disciples[0].level == 4 and s.progression.families.pets[pet].level == 5 and s.resources.stone == stone,"untracked legacy levels preserved, new ordinary spending returned")
	var path: String = "C:/Users/24308/AppData/Roaming/Godot/app_userdata/洪荒众仙府 · V0.5/saves/normal.json"
	if FileAccess.file_exists(path):
		var raw: String = FileAccess.get_file_as_string(path)
		var decoded: Dictionary = GameStore.decode_save(raw)
		check(decoded.ok,"actual user test save migration: "+str(decoded.get("error","")))
		check(FileAccess.get_file_as_string(path) == raw,"read-only migration audit leaves actual save untouched")
		if decoded.ok: check(GameEconomy.validate_state(decoded.data).is_empty(),"actual user test save complete validation")
