extends SceneTree
## Isolated real transactions. No user save or demo balance is modified.
class LateFailStore extends GameStore:
	var reject_commit: bool = false
	var rejected_community: Dictionary = {}
	func _commit(value: Dictionary, backup: bool) -> Dictionary:
		if reject_commit:
			rejected_community=value.community.duplicate(true)
			return {"ok":false,"error":"test: disk failure after guild draft"}
		return super._commit(value,backup)

var checks: int = 0
var failures: Array[String] = []
var results: Array[Dictionary] = []
var directory: String

func check(condition: bool,message: String) -> void:
	checks+=1
	results.append({"check":message,"passed":condition})
	if not condition:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	directory="user://tests/community-%s-%s-%s" % [GameData.now_ms(),OS.get_process_id(),Time.get_ticks_usec()]
	_test_read_only_and_rejection()
	_test_real_save_lifecycle()
	_test_ranking_actual_equipment_and_cultivation()
	_test_late_write_failure()
	var report: Dictionary={"engine":Engine.get_version_info().string,"utc":Time.get_datetime_string_from_system(true),"directory":ProjectSettings.globalize_path(directory),"checks":checks,"failures":failures,"results":results}
	DirAccess.make_dir_recursive_absolute("res://evidence")
	var file: FileAccess=FileAccess.open("res://evidence/community-tests-report.json",FileAccess.WRITE)
	if file!=null:
		file.store_string(JSON.stringify(report,"  "))
		file.close()
	print("COMMUNITY TESTS: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)

func _action(s: Dictionary,op: String,args: Dictionary={}) -> Dictionary:
	var result: Dictionary=GameEconomy.command(s,op,args,int(s.lastTime))
	check(result.ok,op+" accepts legal action: "+str(result.error))
	return result

func _reject(s: Dictionary,op: String,args: Dictionary={}) -> void:
	var before: String=JSON.stringify(s)
	var result: Dictionary=GameEconomy.command(s,op,args,int(s.lastTime))
	check(not result.ok,op+" rejects invalid action")
	check(JSON.stringify(s)==before,op+" rejection preserves all state, counters and RNG")

func _tx(store: GameStore,op: String,args: Dictionary={},at: int=-1) -> Dictionary:
	var result: Dictionary=store.transact(op,args,int(store.state.lastTime) if at<0 else at)
	check(result.ok,op+" commits validated real save: "+str(result.get("error","")))
	return result

func _tx_reject(store: GameStore,op: String,args: Dictionary={},at: int=-1) -> void:
	var before: String=JSON.stringify(store.state)
	var disk: String=FileAccess.get_file_as_string(store._path)
	var result: Dictionary=store.transact(op,args,int(store.state.lastTime) if at<0 else at)
	check(not result.ok,op+" rejected at store boundary")
	check(JSON.stringify(store.state)==before,op+" failed store action leaves memory identical")
	check(FileAccess.get_file_as_string(store._path)==disk,op+" failed store action leaves saved bytes identical")

func _self_score(s: Dictionary,board: String) -> int:
	for entry: Dictionary in GameCommunity.ranking(s,board):
		if entry.self: return int(entry.score)
	return -1

func _same_save(a: Dictionary,b: Dictionary) -> bool:
	# Native JSON decoding canonicalizes integral floats to integers.
	# Compare every key and value with that same canonicalization.
	var same: bool=GameData.normalize(a)==GameData.normalize(b)
	if not same:
		for key in a:
			if GameData.normalize(a[key])!=GameData.normalize(b.get(key)):
				print("RELOAD DIFFERENCE ",key,": ",JSON.stringify(a[key])," => ",JSON.stringify(b.get(key)))
	return same

func _test_read_only_and_rejection() -> void:
	var s: Dictionary=GameEconomy.create_state(1700000000000)
	var legacy: Dictionary=s.duplicate(true)
	legacy.erase("community")
	GameEconomy.ensure_extensions(legacy)
	check(legacy.community.guild.is_empty() and legacy.community.coins==0,"older valid save receives empty guild extension")
	var before: String=JSON.stringify(s)
	for board: String in ["power","progress","contribution"]:
		var rows: Array=GameCommunity.ranking(s,board)
		check(rows.size()==7,"ranking includes six NPC benchmarks plus actual self: "+board)
		var self_count: int=0
		for index: int in rows.size():
			var row: Dictionary=rows[index]
			check(int(row.rank)==index+1,"ranking has sequential rank: "+board+str(index))
			if row.self: self_count+=1
			else: check(row.kind=="离线NPC","every other ranking entry is explicitly NPC")
			if index>0: check(int(rows[index-1].score)>=int(row.score),"ranking sorted by descending score")
		check(self_count==1,"ranking contains one and only one self")
	GameCommunity.snapshot(s)
	check(JSON.stringify(s)==before,"snapshot and all ranking boards are read-only")
	_reject(s,"guildDonate")
	_reject(s,"guildBuy",{"id":"ticket"})
	_reject(s,"guildClaim",{"id":"donate"})
	_reject(s,"guildJoin",{"id":"missing"})
	_reject(s,"guildCreate",{"name":"一"})
	_reject(s,"guildCreate",{"name":"云\n盟"})
	_reject(s,"guildCreate",{"name":"天地玄黄宇宙洪荒日月盈昃辰"})
	_action(s,"guildJoin",{"id":"qingyun"})
	_reject(s,"guildJoin",{"id":"chixiao"})
	_reject(s,"guildCreate",{"name":"云海仙盟"})
	_reject(s,"guildClaim",{"id":"estate"})
	_reject(s,"guildClaim",{"id":"missing"})
	_reject(s,"guildBuy",{"id":"fate"})
	_reject(s,"guildBuy",{"id":"missing"})
	check(CommunityScreen.shop_reason(s,GameCommunity.snapshot(s),GameCommunity.SHOP[3]).contains("2 级"),"shop names unmet guild level")
	check(CommunityScreen.task_reason(s,GameCommunity.snapshot(s),GameCommunity.TASKS[1]).contains("尚未完成"),"unready task has visible disabled reason")
	s.resources.stone=0
	s.resources.material=0
	_reject(s,"guildDonate")
	check(CommunityScreen.donation_reason(s,GameCommunity.snapshot(s)).contains("资源不足"),"insufficient donation has visible reason")
	s.resources.stone=1200
	s.resources.material=120
	_action(s,"guildDonate")
	s.resources.stone=int(GameEconomy.config().resourceCaps.stone)
	_reject(s,"guildClaim",{"id":"donate"})
	check(CommunityScreen.task_reason(s,GameCommunity.snapshot(s),GameCommunity.TASKS[0]).contains("容量不足"),"overflow task explains inventory capacity")
	s.resources.stone=100
	s.resources.material=int(GameEconomy.config().resourceCaps.material)
	_reject(s,"guildBuy",{"id":"material"})
	check(CommunityScreen.shop_reason(s,GameCommunity.snapshot(s),GameCommunity.SHOP[1]).contains("容量不足"),"overflow shop explains inventory capacity")
	s.lastTime+=86400000
	var raw_before: String=JSON.stringify(s)
	var view: Dictionary=GameCommunity.snapshot(s)
	check(view.donations==0 and view.claimed.is_empty() and view.purchases.is_empty(),"snapshot presents reset counters on new UTC date")
	check(JSON.stringify(s)==raw_before,"new-day snapshot does not silently mutate save")

func _test_real_save_lifecycle() -> void:
	var store: GameStore=GameStore.new(directory+"/lifecycle")
	check(store.load_slot().ok,"new isolated normal slot created")
	var at: int=int(store.state.lastTime)
	var initial: Dictionary=store.state.resources.duplicate(true)
	_tx(store,"guildJoin",{"id":"qingyun"})
	for index: int in 3: _tx(store,"guildDonate")
	check(int(store.state.resources.stone)==int(initial.stone)-300,"three donations cost exact stone")
	check(int(store.state.resources.material)==int(initial.material)-45,"three donations cost exact material")
	check(store.state.community.donations==3 and store.state.community.coins==150,"three donations grant exact balances and count")
	_tx_reject(store,"guildDonate")
	_tx(store,"guildClaim",{"id":"donate"})
	check(store.state.community.coins==180 and int(store.state.resources.stone)==int(initial.stone)-240,"donation task pays once with exact reward")
	_tx_reject(store,"guildClaim",{"id":"donate"})
	var character_id: String=str(store.state.team[0])
	_tx(store,"upgradeCharacter",{"id":character_id})
	_tx(store,"guildClaim",{"id":"cultivation"})
	for plot_and_type: Array in [["p2","farm"],["p3","farm"],["p4","alchemy"]]:
		_tx(store,"build",{"plot":str(plot_and_type[0]),"type":str(plot_and_type[1])})
	check(GameCommunity.task_progress(store.state,"estate")==3,"three real construction actions complete estate task")
	_tx(store,"guildClaim",{"id":"estate"})
	check(store.state.community.coins==260 and store.state.community.totalContribution==260,"all three tasks add precise personal and lifetime contribution")
	check(GameCommunity.level(store.state.community)==1,"260 experience remains level one")
	_tx(store,"guildBuy",{"id":"ticket"})
	_tx(store,"guildBuy",{"id":"ticket"})
	check(store.state.resources.ticket==initial.ticket+2,"shop tickets arrive through real save transactions")
	_tx_reject(store,"guildBuy",{"id":"ticket"})
	for index: int in 3: _tx(store,"guildBuy",{"id":"material"})
	_tx_reject(store,"guildBuy",{"id":"material"})
	_tx_reject(store,"guildBuy",{"id":"xp"})
	_tx_reject(store,"guildBuy",{"id":"fate"})
	check(store.state.community.coins==10 and store.state.community.totalContribution==260,"shop spends usable balance but preserves contribution rank")
	var saved: Dictionary=store.state.duplicate(true)
	store.release()
	store=GameStore.new(directory+"/lifecycle")
	check(store.load_slot().ok,"guild save reloads")
	check(_same_save(saved,store.state),"guild, task and purchase ledgers survive exact reload")
	_tx_reject(store,"guildClaim",{"id":"donate"})
	_tx_reject(store,"guildBuy",{"id":"ticket"})
	var next_day: int=at+86400000
	_tx(store,"guildDonate",{},next_day)
	check(store.state.community.day==GameEconomy.natural_day(next_day),"new guild transaction commits current UTC date")
	check(store.state.community.donations==1 and store.state.community.claimed.is_empty() and store.state.community.purchases.is_empty(),"new-day first donation resets all daily ledgers then counts once")
	check(store.state.community.totalContribution==310 and GameCommunity.level(store.state.community)==2,"accumulated actual experience crosses level two")
	_tx(store,"guildClaim",{"id":"donate"})
	_tx(store,"guildDonate")
	_tx(store,"guildBuy",{"id":"fate"})
	check(store.state.resources.fate==initial.fate+5,"level-two offer becomes actually exchangeable")
	_tx_reject(store,"guildBuy",{"id":"fate"})
	var personal: Dictionary=store.state.community.duplicate(true)
	_tx(store,"guildLeave")
	check(store.state.community.guild.is_empty(),"leave removes current guild only")
	for key: String in ["coins","totalContribution","day","donations","claimed","purchases"]:
		check(store.state.community[key]==personal[key],"leave preserves personal ledger: "+key)
	_tx(store,"guildCreate",{"name":"  云海同道  "})
	check(store.state.community.guild.name=="云海同道" and store.state.community.guild.id=="custom","create commits trimmed personal name")
	check(GameCommunity.level(store.state.community)==1 and store.state.community.guild.experience==0,"rejoin or create starts a new level-one guild")
	_tx_reject(store,"guildBuy",{"id":"fate"})
	_tx_reject(store,"guildClaim",{"id":"donate"})
	check(GameEconomy.validate_state(store.state).is_empty(),"full community lifecycle remains valid gameplay state")
	saved=store.state.duplicate(true)
	store.release()
	var reload: GameStore=GameStore.new(directory+"/lifecycle")
	check(reload.load_slot().ok and _same_save(saved,reload.state),"custom guild and retained personal ledger survive second reload")
	reload.release()

func _test_ranking_actual_equipment_and_cultivation() -> void:
	var store: GameStore=GameStore.new(directory+"/ranking")
	check(store.load_slot().ok,"ranking test creates isolated save")
	# A valid dropped-item fixture is imported through the public save API;
	# every equip and cultivation operation below is a genuine transaction.
	var fixture: Dictionary=store.state.duplicate(true)
	var artifact: Dictionary=GameEquipment.grant_drop(fixture,{"rarity":5,"slot":"feather","sourceId":"explicit-community-ranking-test-fixture"})
	check(not artifact.is_empty() and GameEconomy.validate_state(fixture).is_empty(),"legal isolated artifact fixture")
	var fixture_path: String=directory+"/ranking-fixture.json"
	var file: FileAccess=FileAccess.open(fixture_path,FileAccess.WRITE)
	check(file!=null,"ranking fixture file created")
	if file==null:
		store.release()
		return
	file.store_string(GameStore.encode_save(fixture))
	file.close()
	check(store.import_save(fixture_path).ok,"valid dropped-item fixture imports through actual save boundary")
	var character_id: String=str(store.state.team[0])
	var before: int=_self_score(store.state,"power")
	_tx(store,"equipArtifact",{"id":str(artifact.id),"characterId":character_id})
	var equipped: int=_self_score(store.state,"power")
	check(equipped>before,"power ranking increases after actual equipment transaction")
	check(equipped==GameEquipment.team_power(store.state),"power board equals authoritative equipped team power")
	_tx(store,"upgradeCharacter",{"id":character_id})
	var cultivated: int=_self_score(store.state,"power")
	check(cultivated>equipped,"power ranking increases after real cultivation")
	check(_self_score(store.state,"progress")==store.state.cleared.size(),"progress board reads actual first-clear ledger")
	_tx(store,"guildJoin",{"id":"yuxu"})
	_tx(store,"guildDonate")
	check(_self_score(store.state,"contribution")==50,"contribution board updates after actual donation")
	_tx(store,"guildBuy",{"id":"material"})
	check(_self_score(store.state,"contribution")==50 and store.state.community.coins==20,"spending contribution does not reduce lifetime rank")
	var saved: Dictionary=store.state.duplicate(true)
	store.release()
	var reload: GameStore=GameStore.new(directory+"/ranking")
	check(reload.load_slot().ok and _same_save(saved,reload.state),"equipped and cultivated ranking state reloads exactly")
	check(_self_score(reload.state,"power")==cultivated,"reloaded equipment and cultivation yield the same actual score")
	check(_self_score(reload.state,"contribution")==50,"reloaded lifetime contribution score is retained")
	reload.release()

func _test_late_write_failure() -> void:
	var store: LateFailStore=LateFailStore.new(directory+"/late-failure")
	check(store.load_slot().ok,"late write failure creates isolated normal save")
	_tx(store,"guildJoin",{"id":"chixiao"})
	store.reject_commit=true
	_tx_reject(store,"guildDonate")
	check(store.rejected_community.coins==50 and store.rejected_community.donations==1,"disk failure is injected after a real reward draft is computed")
	store.reject_commit=false
	_tx(store,"guildDonate")
	check(store.state.community.coins==50 and store.state.community.donations==1,"retry grants and charges exactly once after failed write")
	_tx(store,"guildClaim",{"id":"donate"})
	store.reject_commit=true
	_tx_reject(store,"guildBuy",{"id":"ticket"})
	check(store.state.community.coins==80 and store.state.community.purchases.is_empty(),"late exchange write failure preserves contribution and quota")
	store.reject_commit=false
	_tx(store,"guildBuy",{"id":"ticket"})
	check(store.state.community.coins==0 and store.state.community.purchases.ticket==1,"exchange retry commits once")
	store.release()
