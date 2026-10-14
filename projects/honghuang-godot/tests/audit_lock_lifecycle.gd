extends SceneTree
func _initialize() -> void:
	var dir := ""
	var mode := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--directory="): dir=arg.trim_prefix("--directory=")
		if arg.begins_with("--mode="): mode=arg.trim_prefix("--mode=")
	if not dir.begins_with("user://tests/audit-lock-") or mode not in ["owner","contender","recovery"]: quit(2);return
	var store := GameStore.new(dir)
	var loaded := store.load_slot("normal")
	var report := {"pid":OS.get_process_id(),"loaded":loaded,"readonly":store.readonly,"mode":mode}
	if mode == "owner":
		var ready := FileAccess.open(dir.path_join("owner-ready.json"),FileAccess.WRITE)
		ready.store_string(JSON.stringify(report));ready.close()
		OS.delay_msec(90000)
	else:
		report["claim"] = store.transact("claimMail",{"id":"godot-welcome-1"})
		report["resources"] = store.state.resources.duplicate(true)
		var output := FileAccess.open(dir.path_join(mode+"-result.json"),FileAccess.WRITE)
		output.store_string(JSON.stringify(report));output.close()
		print(JSON.stringify(report))
	store.release()
	quit()
