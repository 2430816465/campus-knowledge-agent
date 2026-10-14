extends "res://tests/test_framework.gd"
func run() -> void:
	check(GameEconomy.free_currency(),"test edition currency switch enabled")
	var s: Dictionary = GameEconomy.create_state(NOW)
	for key in s.resources: s.resources[key] = 0
	act(s,"upgradeCharacter",{"id":"nezha"})
	act(s,"resetCharacter",{"id":"nezha"})
	check(s.resources.stone == 0 and s.owned.nezha.spent.stone == 0,"free level and reset cannot mint paid refunds")
	act(s,"summon",{"count":10,"txid":"free-ten"})
	check(s.resources.ticket == 0,"zero-ticket test summon never debits")
	act(s,"fwPetSummon")
	var pet: String = s.progression.families.pets.keys()[0]
	act(s,"fwPetTrain",{"id":pet}); act(s,"fwPetReset",{"id":pet})
	act(s,"progDiscipleRecruit")
	var worker: String = s.progression.disciples[0].id
	act(s,"progDiscipleTrain",{"id":worker}); act(s,"fwResetDisciple",{"id":worker})
	act(s,"fwLifeTrain",{"id":s.progression.life.branch}); act(s,"fwLifeReset",{"id":s.progression.life.branch})
	check(s.resources.stone == 0,"free pet/disciple/life ordinary ledgers refund zero")
	var b: Dictionary = built(s,"alchemy")
	act(s,"estatePlan",{"id":b.id,"recipe":"training"})
	check(s.framework.estate.plans[b.id].active.paid == {"herb":0,"material":0},"free test production records actual zero debit")
	act(s,"estateCancel",{"id":b.id})
	check(s.resources.herb == 0 and s.resources.material == 0,"free production cancel cannot mint ingredients")
	act(s,"progForge")
	check(s.progression.materials.embryo == 0,"basic forge needs no dedicated material")
	reject(s,"fwAdvancedForge")
	check(s.progression.materials.embryo == 0,"dedicated advanced material still required")
	finish()
