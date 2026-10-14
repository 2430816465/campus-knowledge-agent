extends SceneTree
var checks:=0
var failures:Array=[]
var phase:="round-3"
func check(value:bool,label:String)->void:
	checks+=1
	if not value:failures.append(label);push_error("DEMO RESET AUDIT: "+label)
func _initialize()->void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="):phase=arg.trim_prefix("--audit-phase=")
	var directory:="user://tests/audit-demo-reset-%d"%Time.get_ticks_usec()
	var store:=GameStore.new(directory)
	check(store.load_slot("normal").ok,"isolated ordinary slot exists")
	check(store.transact("claimMail",{"id":"godot-welcome-1"}).ok,"ordinary assets exist before demo recovery")
	var normal_path:String=store._path
	var normal_bytes:=FileAccess.get_file_as_string(normal_path)
	check(not store.reset_demo().ok,"ordinary save cannot use demo reset")
	check(store.load_slot("demo:roster").ok,"actual isolated full-roster demonstration slot")
	check(store.advance_demo_time(60000).ok,"demonstration has an actual advanced clock")
	var path:String=store._path
	store.release()
	var original:="{CORRUPTED_ONLY_THIS_DEMO_COPY}"
	var file:=FileAccess.open(path,FileAccess.WRITE);file.store_string(original);file.close()
	var loaded:=store.load_slot("demo:roster")
	check(not loaded.ok and store.corruption and store.readonly,"real broken demonstration file is protected")
	var before:=JSON.stringify(store.state)
	store.fail_writes=true
	check(not store.reset_demo().ok,"failed durable reset reports failure")
	check(store.corruption and store.readonly and JSON.stringify(store.state)==before and FileAccess.get_file_as_string(path)==original,"failed reset preserves exact broken bytes and protection flags")
	store.fail_writes=false
	var reset:=store.reset_demo()
	check(reset.ok,"authorized isolated demonstration reset writes a valid replacement")
	var decoded:=GameStore.decode_save(FileAccess.get_file_as_string(path))
	check(decoded.ok and decoded.data.demo=="roster" and decoded.data.owned.size()==50,"actual replacement file is a valid isolated full-roster save")
	check(not store.corruption and not store.readonly,"successful demonstration reset clears stale protection flags immediately")
	check(store.clock_offset==0,"demonstration reset clears the artificial clock offset")
	var admitted:=store.transact("prepareMainBattle",{"stageId":1,"options":{"seed":3119,"now":store.state.lastTime}},int(store.state.lastTime))
	check(admitted.ok,"new actual battle works immediately after successful reset without restarting")
	var battle_actions:=0
	if admitted.ok:
		var request:Dictionary=admitted.data
		var battle:=GameCombat.create(request.stageId,request.team,request.options)
		while battle.get("result")==null and battle_actions<1000:
			check(GameCombat.auto_act(battle),"real post-reset combat action");battle_actions+=1
		check(battle.get("result")=="win" and store.transact("settleMainBattle",{"battle":battle},int(store.state.lastTime)).ok,"post-reset real victory settles in the same session")
	check(store.export_save(directory.path_join("reset-export.json")).ok,"valid reset can immediately export without stale corruption flag")
	check(FileAccess.get_file_as_string(normal_path)==normal_bytes,"entire failed/successful demonstration reset never changes ordinary save bytes")
	store.release()
	store=GameStore.new(directory)
	check(store.load_slot("demo:roster").ok and not store.corruption,"reset replacement survives a separate store reload")
	store.release()
	var output:=FileAccess.open("res://docs/audits/%s-demo-reset.json"%phase,FileAccess.WRITE)
	output.store_string(JSON.stringify({"phase":phase,"utc":Time.get_datetime_string_from_system(true),"checks":checks,"failures":failures,"post_reset_actual_battle_actions":battle_actions,"scope":"Real isolated ordinary and demonstration files; explicit reset of the corrupted demonstration only, failed-write rollback, immediate actual play and ordinary-byte preservation."},"  "));output.close()
	print("DEMO RESET ",checks," checks / ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
