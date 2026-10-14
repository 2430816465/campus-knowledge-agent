extends SceneTree
func _initialize() -> void:
	var directory := ""
	var worker := ""
	var barrier := 0
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--directory="): directory=arg.trim_prefix("--directory=")
		if arg.begins_with("--worker="): worker=arg.trim_prefix("--worker=")
		if arg.begins_with("--barrier="): barrier=int(arg.trim_prefix("--barrier="))
	if not directory.begins_with("user://tests/audit-race-") or worker not in ["a","b"]: quit(2); return
	while GameData.now_ms() < barrier: OS.delay_msec(1)
	var store := GameStore.new(directory)
	var outcomes: Array = []
	for i in 50:
		var loaded := store.load_slot("normal")
		if loaded.ok and not store.readonly:
			var name := "summon" if i < 15 else "settings"
			var args := {"count":1,"txid":"race-%s-%d" % [worker,i]} if name == "summon" else {"key":"speed","value":1+(i % 3)}
			var result := store.transact(name,args)
			outcomes.append({"index":i,"command":name,"ok":result.ok,"revision":store.state.get("revision",-1),"error":result.get("error","")})
		store.release()
		OS.delay_msec(1)
	var report := {"worker":worker,"results":outcomes}
	var file := FileAccess.open(directory.path_join("worker-%s.json" % worker),FileAccess.WRITE)
	file.store_string(JSON.stringify(report)); file.close()
	print(JSON.stringify(report))
	quit()
