extends SceneTree
func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--file="):
			print("TARGET_DECODE ", GameStore.decode_save(FileAccess.get_file_as_string(arg.trim_prefix("--file="))))
			quit(); return
	var s := GameStore.new("user://tests/audit-idle-roundtrip-%d" % Time.get_ticks_usec())
	print("LOAD ",s.load_slot())
	print("START ",s.transact("startIdleMission",{"missionId":"herb-gathering","characters":["nezha"]}))
	print("MEMORY_VALID ",GameEconomy.validate_state(s.state))
	print("DECODE ",GameStore.decode_save(FileAccess.get_file_as_string(s._path)))
	print("NEXT ",s.transact("claimMail",{"id":"godot-welcome-1"}))
	s.release()
	quit()
