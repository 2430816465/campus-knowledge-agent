extends SceneTree
var checks: int = 0
var failures: Array = []
const NOW = 1791388800000
func _initialize() -> void: run.call_deferred()
func check(v: bool, note: String) -> void:
	checks += 1
	if not v: failures.append(note); push_error(note)
func act(s: Dictionary, name: String, args: Dictionary = {}, at: int = NOW) -> Dictionary:
	var r: Dictionary = GameEconomy.command(s,name,args,at)
	check(r.ok,name+": "+str(r.get("error","")))
	check(GameEconomy.validate_state(s).is_empty(),name+" validate: "+GameEconomy.validate_state(s))
	return r
func reject(s: Dictionary, name: String, args: Dictionary = {}, at: int = NOW) -> void:
	var before: String = JSON.stringify(s)
	var r: Dictionary = GameEconomy.command(s,name,args,at)
	check(not r.ok and JSON.stringify(s) == before,name+" rejected atomically")
func built(s: Dictionary, type: String) -> Dictionary:
	for b in s.buildings:
		if b.type == type: return b
	for plot in GameEconomy.get_all_plots():
		if GameEconomy.check_plot(s,plot.id,type).is_empty():
			var r: Dictionary = act(s,"build",{"type":type,"plot":plot.id})
			if r.ok:
				for b in s.buildings:
					if b.type == type: return b
	check(false,"no available plot for "+type)
	return {}
func fight(request: Dictionary) -> Dictionary:
	var b: Dictionary = GameCombat.create(request.stageId,request.team,request.options)
	check(not b.has("error"),"actual combat creates: "+str(b.get("error","")))
	if b.has("error"): return {}
	for i in range(5000):
		if b.result != null: break
		GameCombat.auto_act(b)
	check(b.result != null,"combat finishes through actual actions")
	return b
func run() -> void:
	var s: Dictionary = GameEconomy.create_state(NOW)
	check(GameEconomy.validate_state(s).is_empty(),"fresh state valid: "+GameEconomy.validate_state(s))
	check(s.slots == 4 and GameFramework.party(s)[0].id == GameFramework.LORD,"fixed lord plus four god slots")
	act(s,"upgradeCharacter",{"id":"nezha","txid":"level-1"})
	var level: int = s.owned.nezha.level
	act(s,"upgradeCharacter",{"id":"nezha","txid":"level-1"})
	check(s.owned.nezha.level == level,"upgrade request replays once")
	act(s,"resetCharacter",{"id":"nezha","txid":"reset-1"})
	check(s.owned.nezha.level == 1,"reset ordinary level")
	act(s,"saveTeamPreset",{"slot":0,"name":"青云","txid":"preset-1"})
	act(s,"applyTeamPreset",{"slot":0,"txid":"preset-apply"})
	var made: Dictionary = act(s,"progForge").data
	check(GameEquipment.item(s,made.get("id",made.get("item",{}).get("id",""))).get("ownerKind") == "lord","forge outputs lord item")
	var q: Dictionary = act(s,"challengePrepare",{"kind":"material","type":"stone","difficulty":1,"txid":"prepare-1"})
	if not q.ok: finish(); return
	check(q.data.battleRequest.team[0].id == GameFramework.LORD,"challenge includes lord")
	reject(s,"applyTeamPreset",{"slot":0,"txid":"blocked-preset"})
	var b: Dictionary = fight(q.data.battleRequest)
	var count: int = s.framework.challenges.materialCharges.stone
	act(s,"challengeSettle",{"battle":b,"txid":"settle-1"})
	check(s.framework.challenges.materialCharges.stone == count,"battle itself never consumes claims")
	if b.result == "win":
		act(s,"challengeClaim",{"id":b.id,"txid":"claim-1"})
		check(s.framework.challenges.materialCharges.stone == count-1,"successful claim consumes one")
		act(s,"challengeClaim",{"id":b.id,"txid":"claim-1"})
		check(s.framework.challenges.materialCharges.stone == count-1,"reward claim replay doesn't consume twice")
	act(s,"estateOrdersRefresh",{"txid":"orders-1"})
	act(s,"estateOrderAccept",{"id":"0","txid":"accept-1"})
	GameEconomy.advance(s,NOW+86400000*7)
	check(GameEconomy.validate_state(s).is_empty(),"seven day offline state: "+GameEconomy.validate_state(s))
	check(s.framework.challenges.materialCharges.herb == 6,"unused claims accumulate at cap")
	check(s.framework.estate.orders[0].status == "accepted","accepted orders survive refresh")
	finish()
func finish() -> void:
	print("FRAMEWORK CHECKS ",checks," FAILURES ",failures.size())
	quit(0 if failures.is_empty() else 1)
