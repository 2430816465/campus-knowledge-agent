extends SceneTree
## Real normal-save path: no resource grants, edited unlocks, or demonstration imports.
var checks: int=0
var failures: Array[String]=[]
var store: GameStore
var clock_ms: int
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func tx(name: String,args: Dictionary={}) -> Dictionary:
	var result: Dictionary=store.transact(name,args,clock_ms)
	check(result.ok,name+": "+str(result.get("error","")))
	return result
func reject(name: String,args: Dictionary) -> void:
	var before: String=GameStore.encode_save(store.state)
	var result: Dictionary=store.transact(name,args,clock_ms)
	check(not result.ok,"reject "+name)
	check(GameStore.encode_save(store.state)==before,"rollback "+name)
func finish(request: Dictionary) -> Dictionary:
	var battle: Dictionary=GameCombat.create(int(request.stageId),request.team,request.options)
	var count: int=0
	while battle.get("result")==null and count<5000:
		check(GameCombat.auto_act(battle),"actual legal action")
		count+=1
	check(battle.get("result") in ["win","lose"],"battle terminates")
	return battle
func _initialize() -> void:
	store=GameStore.new("user://integration-v08-%d" % Time.get_ticks_usec())
	check(store.load_slot().ok,"ordinary durable new save")
	clock_ms=int(store.state.lastTime)
	var initial_power: int=GameEquipment.team_power(store.state)
	var embryo: int=int(store.state.progression.materials.embryo)
	tx("progMakeEmbryo",{"count":1})
	check(store.state.progression.materials.embryo==embryo+1,"craft spends real normal materials")
	var made: Dictionary=tx("progForge",{"txid":"integration-first-forge"})
	if not made.ok: store.release(); quit(1); return
	var item: Dictionary=made.data.item
	tx("progEquipShared",{"id":item.id})
	check(GameEquipment.team_power(store.state)>initial_power,"shared gear raises actual team power")
	var first_stats: Dictionary=GameEquipment.character_stats(store.state,"nezha")
	for attempt: int in 8:
		if GameEquipment.enhance_preview(store.state,item.id,1).data.affordable: break
		tx("progMakeEmbryo",{"count":1})
		var donor: Dictionary=tx("progForge").data.item
		tx("salvageArtifacts",{"ids":[donor.id]})
	tx("enhanceArtifact",{"id":item.id,"targetLevel":1})
	check(GameEquipment.character_stats(store.state,"nezha")!=first_stats,"equipment level changes battle stats")
	var items_before: int=store.state.equipment.items.size()
	var resources_before: Dictionary=store.state.resources.duplicate(true)
	tx("progForge",{"txid":"integration-first-forge"})
	check(store.state.equipment.items.size()==items_before and store.state.resources==resources_before,"forge retry neither rerolls nor debits")
	var before: String=GameStore.encode_save(store.state)
	store.fail_writes=true
	var failed: Dictionary=store.transact("progMakeEmbryo",{"count":1},clock_ms)
	check(not failed.ok and GameStore.encode_save(store.state)==before,"failed durable save rolls back real progression")
	store.fail_writes=false
	var started: Dictionary=tx("progRealmTrial")
	if not started.ok: store.release(); quit(1); return
	var request: Dictionary=started.data.battleRequest
	var locked: Dictionary=store.state.progression.realm.pending.duplicate(true)
	reject("prepareMainBattle",{"stageId":1})
	var unfinished: Dictionary=GameCombat.create(request.stageId,request.team,request.options)
	reject("settleProgressionTrial",{"battle":unfinished})
	var path: String=store.base_dir
	store.release()
	store=GameStore.new(path)
	check(store.load_slot().ok,"reload real pending trial")
	check(store.state.progression.realm.pending==GameData.normalize(locked),"reload preserves immutable team, seed and equipment")
	request=tx("progResumeTrial").data.battleRequest
	var result: Dictionary=finish(request)
	var fake: Dictionary=result.duplicate(true)
	fake.rng=int(fake.rng)^1
	reject("settleProgressionTrial",{"battle":fake})
	check(not GameCombat.act(unfinished,{"kind":"guard"}),"strict automatic trial excludes divergent manual guards")
	tx("settleProgressionTrial",{"battle":result})
	check(store.state.progression.realm.pending.is_empty(),"verified completion clears pending trial")
	reject("settleProgressionTrial",{"battle":result})
	if result.result=="win":
		tx("progRealmBreak")
		check(store.state.progression.realm.level==1,"breakthrough requires actual saved victory")
	var main: Dictionary=tx("prepareMainBattle",{"stageId":1,"options":{"seed":1508}})
	if main.ok:
		var b: Dictionary=finish(main.data)
		var altered: Dictionary=b.duplicate(true)
		altered.units[0].hp=0
		reject("settleMainBattle",{"battle":altered})
		tx("settleMainBattle",{"battle":b})
		resources_before=store.state.resources.duplicate(true)
		tx("settleMainBattle",{"battle":b})
		check(store.state.resources==resources_before,"verified main clear reward is idempotent")
	var saved_normal: Dictionary=GameData.normalize(store.state)
	store.release()
	store=GameStore.new(path)
	check(store.load_slot().ok,"reload final normal save")
	check(GameData.normalize(store.state)==saved_normal,"all progression survives durable save round trip")
	check(GameEconomy.validate_state(store.state).is_empty(),"final combined economic state validates")
	store.release()
	print("INTEGRATION V08: ",checks," checks, ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
