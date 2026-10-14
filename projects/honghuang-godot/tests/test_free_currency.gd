extends SceneTree
## Test the shipped free build with real commands and isolated durable saves.
const A = preload("res://scripts/game_activities.gd")
const P = preload("res://scripts/game_progression.gd")
var checks: int = 0
var failures: Array[String] = []
class LateFailStore extends GameStore:
	var reject_commit: bool = false
	func _commit(value: Dictionary, backup: bool) -> Dictionary:
		if reject_commit: return {"ok":false,"error":"test: disk write rejected"}
		return super._commit(value,backup)
func _initialize() -> void: run.call_deferred()
func check(value: bool, note: String) -> void:
	checks += 1
	if not value: failures.append(note); push_error(note)
func fresh() -> Dictionary:
	var s: Dictionary = GameEconomy.create_state(1791388800000)
	for key in s.resources: s.resources[key] = 0
	return s
func act(s: Dictionary, cmd: String, args: Dictionary = {}) -> Dictionary:
	var r: Dictionary = GameEconomy.command(s,cmd,args,int(s.lastTime))
	check(r.ok,cmd+": "+str(r.get("error","")))
	check(GameEconomy.validate_state(s).is_empty(),cmd+" state: "+GameEconomy.validate_state(s))
	return r
func reject(s: Dictionary, cmd: String, args: Dictionary = {}) -> void:
	var before: String = JSON.stringify(s)
	var r: Dictionary = GameEconomy.command(s,cmd,args,int(s.lastTime))
	check(not r.ok and JSON.stringify(s)==before,cmd+" retains noncurrency guards atomically")
func run() -> void:
	check(GameEconomy.free_currency(),"current project ships free-currency mode")
	var s: Dictionary = fresh()
	var rules: Dictionary = GameEconomy.gacha_config().duplicate(true)
	var r: Dictionary = act(s,"summon",{"count":10,"txid":"free-ten","rng":func():return .99})
	check(r.ok and r.data.size()==10 and r.data[9].rarity=="immortal","ten results retain real four-star guarantee")
	check(s.resources.ticket==0 and s.resources.fate>0,"zero-ticket ten draw awards real results without debit")
	var snapshot: String = JSON.stringify(s)
	act(s,"summon",{"count":10,"txid":"free-ten"})
	check(JSON.stringify(s)==snapshot,"same transaction cannot duplicate assets or pity")
	check(GameEconomy.gacha_config()==rules,"probabilities and pity config unchanged")
	s=fresh(); s.pity=89
	r=act(s,"summon",{"count":1,"txid":"free-pity","rng":func():return .99})
	check(r.data[0].rarity=="divine" and s.pity==0 and s.resources.ticket==0,"free single draw retains 90th guarantee")
	s=fresh()
	act(s,"redeem",{"id":"yunxiao"})
	check(s.owned.has("yunxiao") and s.resources.fate==0,"zero-fate character redemption")
	var wallet: Dictionary = s.resources.duplicate(true)
	act(s,"upgradeCharacter",{"id":"nezha"})
	act(s,"upgradeCharacter",{"id":"nezha"})
	check(s.owned.nezha.level==3 and s.resources==wallet and s.owned.nezha.spent=={"stone":0,"xp":0},"free upgrades record no fictional payment")
	act(s,"resetCharacter",{"id":"nezha"})
	check(s.resources==wallet and s.owned.nezha.level==1,"free reset cannot mint a refund")
	var farm: Dictionary = act(s,"build",{"type":"farm","plot":"p2"}).data
	act(s,"accelerateBuilding",{"id":farm.id})
	act(s,"upgradeBuilding",{"id":farm.id})
	check(s.resources==wallet,"build acceleration and upgrade all free")
	var alchemy: Dictionary = act(s,"build",{"type":"alchemy","plot":"p3"}).data
	act(s,"accelerateBuilding",{"id":alchemy.id})
	var job: Dictionary = act(s,"queueRecipe",{"id":alchemy.id,"recipeId":"ward"}).data
	check(job.cost!=job.paidCost and job.paidCost==GameEconomy.zero_cost(job.cost),"production retains recipe promise and records actual zero payment")
	act(s,"cancelQueue",{"id":alchemy.id,"jobId":job.id})
	check(s.resources==wallet,"free cancellation cannot mint refund")
	reject(s,"build",{"type":"farm","plot":"p2"})
	var offer: Dictionary = GameEconomy.shop_status(s,int(s.lastTime))[0]
	act(s,"buyShopItem",{"id":offer.id,"count":1})
	check(s.resources==wallet and int(s.items.get(offer.item,0))>=int(offer.count),"shop grants actual item with zero balance")
	act(s,"progMakeEmbryo",{"count":2})
	check(s.progression.materials.embryo==2 and s.resources==wallet,"forge material creation uses free base resources")
	act(s,"progFurnaceUpgrade")
	act(s,"progAcquire",{"family":"pets","id":"deer"})
	check(s.resources==wallet and s.progression.families.pets.deer.spent==GameEconomy.zero_cost(P.rules().families.pets.choices[0].cost),"progression acquisition free and paid ledger zero")
	act(s,"progShop",{"id":"fishbait","count":1})
	check(s.resources==wallet and s.progression.materials.fishbait==1,"progression exchange free")
	s.items["relic-essence"]=100
	var gear: Dictionary = GameEquipment.grant_drop(s,{"rarity":5,"slot":"flower","sourceId":"free-test"})
	act(s,"enhanceArtifact",{"id":gear.id,"targetLevel":4})
	check(GameEquipment.item(s,gear.id).level==4 and s.resources==wallet,"equipment enhances with zero stone")
	check(s.items["relic-essence"]<100,"specialized enhancement item retains normal consumption")
	reject(fresh(),"progForge")
	s=fresh()
	act(s,"guildJoin",{"id":"qingyun"})
	check(CommunityScreen.shop_reason(s,s.community,GameCommunity.SHOP[0]).is_empty(),"zero-contribution shop is enabled in UI")
	act(s,"guildBuy",{"id":"ticket"})
	check(s.community.coins==0 and s.resources.ticket==1,"guild currency remains zero while item reward granted")
	act(s,"guildDonate")
	check(s.resources.stone==0 and s.resources.material==0 and s.community.coins==50,"zero-balance donation retains earned contribution")
	act(s,"guildBuy",{"id":"material"})
	check(s.community.coins==50,"existing guild contribution is not consumed")
	s=fresh()
	for cfg: Dictionary in A.definitions():
		if str(cfg.kind) in ["festival","celebration","milestones","existing"]: continue
		act(s,"activityStart",{"id":cfg.id,"seed":111})
		check(s.resources.stone==0 and s.activities.spent==0,"activity entry free: "+str(cfg.id))
		if cfg.kind=="defense":
			var run: Dictionary=s.activities.runs[cfg.id]
			var coins: int=int(run.model.coins)
			act(s,"activityAct",{"id":cfg.id,"runId":run.id,"revision":run.revision,"action":"recruit"})
			check(s.activities.runs[cfg.id].model.coins==coins,"activity copper money not consumed")
		if cfg.kind=="online" and cfg.group=="auction":
			var run: Dictionary=s.activities.runs[cfg.id]
			var balance: int=int(run.model.balance)
			act(s,"activityAct",{"id":cfg.id,"runId":run.id,"revision":run.revision,"action":"list"})
			run=s.activities.runs[cfg.id]
			act(s,"activityAct",{"id":cfg.id,"runId":run.id,"revision":run.revision,"action":"bid","choice":10})
			check(s.activities.runs[cfg.id].model.balance==balance,"sandbox auction money not consumed")
	for festival: String in ["083","083b"]:
		var offers: Array=A.rules().festivalOffers if festival=="083" else A.rules().celebrationOffers
		act(s,"activityFestivalExchange",{"id":festival,"offer":offers[0].id})
		check(s.activities.festivals[festival].tokens==0,"zero-token celebration exchange: "+festival)
	mixed_refunds()
	durable_transactions()
	await ui_zero_wallet()
	var report: Dictionary={"engine":Engine.get_version_info().string,"checks":checks,"failures":failures,"freeCurrency":GameEconomy.free_currency()}
	DirAccess.make_dir_recursive_absolute("res://evidence")
	var file:=FileAccess.open("res://evidence/free-currency-tests.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  ")); file.close()
	print("FREE CURRENCY: ",checks," checks, ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
func mixed_refunds() -> void:
	ProjectSettings.set_setting("testing/free_currency",false)
	var s: Dictionary=fresh()
	for key in s.resources: s.resources[key]=mini(1000,int(GameEconomy.config().resourceCaps[key]))
	var original: Dictionary=s.resources.duplicate(true)
	act(s,"upgradeCharacter",{"id":"nezha"})
	check(s.resources.stone<1000,"balanced switch restores real payment")
	ProjectSettings.set_setting("testing/free_currency",true)
	act(s,"upgradeCharacter",{"id":"nezha"})
	act(s,"resetCharacter",{"id":"nezha"})
	check(s.resources==original,"mixed paid/free upgrade refunds exactly old paid investment")
	var b: Dictionary=act(s,"build",{"type":"alchemy","plot":"p3"}).data
	act(s,"accelerateBuilding",{"id":b.id})
	ProjectSettings.set_setting("testing/free_currency",false)
	var paid_job: Dictionary=act(s,"queueRecipe",{"id":b.id,"recipeId":"ward"}).data
	ProjectSettings.set_setting("testing/free_currency",true)
	var free_job: Dictionary=act(s,"queueRecipe",{"id":b.id,"recipeId":"ward"}).data
	act(s,"cancelQueue",{"id":b.id,"jobId":paid_job.id})
	check(s.resources==original,"old paid production still refunds while free build enabled")
	ProjectSettings.set_setting("testing/free_currency",false)
	act(s,"cancelQueue",{"id":b.id,"jobId":free_job.id})
	check(s.resources==original,"saved free job refunds zero after disabling test mode")
	var old: Dictionary=act(s,"queueRecipe",{"id":b.id,"recipeId":"ward"}).data
	GameEconomy.building(s,b.id).queue[0].erase("paidCost")
	act(s,"cancelQueue",{"id":b.id,"jobId":old.id})
	check(s.resources==original,"legacy queue without paidCost retains exact refund")
	ProjectSettings.set_setting("testing/free_currency",true)
func durable_transactions() -> void:
	var directory: String="user://tests/free-%s-%s" % [OS.get_process_id(),Time.get_ticks_usec()]
	var store:=LateFailStore.new(directory)
	check(store.load_slot("normal").ok,"isolated save creation")
	var draft: Dictionary=store.state.duplicate(true)
	for key in draft.resources: draft.resources[key]=0
	check(store._commit(draft,true).ok,"isolated empty wallet saved"); store.state=draft
	var before: String=JSON.stringify(store.state)
	store.reject_commit=true
	var r: Dictionary=store.transact("summon",{"count":10,"txid":"durable-free","presentation":true})
	check(not r.ok and JSON.stringify(store.state)==before and store.pending_summon().is_empty(),"disk failure leaves no partial result or currency mutation")
	store.reject_commit=false
	r=store.transact("summon",{"count":10,"txid":"durable-free","presentation":true})
	check(r.ok and store.state.resources.ticket==0,"durable zero-wallet ten draw committed")
	var result: Array=r.data.duplicate(true); var history: int=store.state.drawHistory.size(); var fate: int=store.state.resources.fate
	check(store.transact("summon",{"count":10,"txid":"durable-free","presentation":true}).data==result and store.state.drawHistory.size()==history,"pending replay is same receipt")
	check(not store.transact("summon",{"count":1,"txid":"double-click","presentation":true}).ok,"second presentation still blocked until acknowledgment")
	store.release()
	store=LateFailStore.new(directory)
	check(store.load_slot("normal").ok and store.pending_summon().results==result,"refresh recovers actual committed results")
	check(store.state.resources.ticket==0 and store.state.resources.fate==fate,"reload preserves wallet and one reward")
	check(store.transact("ackSummonPresentation",{"txid":"durable-free"}).ok,"acknowledgment commits")
	check(store.transact("summon",{"count":10,"txid":"durable-free"}).ok and store.state.resources.fate==fate,"acknowledged transaction cannot award again")
	store.release()
func ui_zero_wallet() -> void:
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true); root.add_child(app)
	for i in 6: await process_frame
	app.set_process(false); app.audio.sound_enabled=false
	var draft: Dictionary=app.state().duplicate(true)
	for key in draft.resources: draft.resources[key]=0
	check(app.store._commit(draft,true).ok,"isolated UI wallet saved"); app.store.state=draft
	app._go(3)
	for i in 5: await process_frame
	var one: Button=app.find_child("SummonOne",true,false)
	var ten: Button=app.find_child("SummonTen",true,false)
	check(one!=null and ten!=null and not one.disabled and not ten.disabled,"native summon buttons enabled at zero balance")
	check(one.tooltip_text.contains("测试免费") and ten.tooltip_text.contains("测试免费"),"native UI communicates zero charge")
	if OS.get_cmdline_user_args().has("--capture-free-ui"):
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://evidence/free-currency-summon.png")
	SummonScreen.draw(app,10)
	check(app.state().resources.ticket==0 and app.store.pending_summon().results.size()==10,"native UI executes real ten results free")
	var movie: SummonMovie=app.get_meta(SummonScreen.ACTIVE_CINEMATIC)
	movie._finish(true)
	for i in 8: await process_frame
	check(is_instance_valid(app.modal_box) and app.modal_box.get_node("SummonResults").cards.size()==10,"skip uses same ten-card result")
	app._close_modal(); app.store.release(); app.queue_free()
	for i in 3: await process_frame
