extends SceneTree
## Actual parallel Godot processes. No transaction hooks or fake interleavings.
func _initialize() -> void:
	var phase := "preaudit"
	var count := 25
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="): phase=arg.trim_prefix("--audit-phase=")
		if arg.begins_with("--runs="): count=clampi(int(arg.trim_prefix("--runs=")),1,100)
	var reports: Array = []
	var failures := 0
	for run in count:
		var directory := "user://tests/audit-race-%s-%d-%d" % [phase,GameData.now_ms(),run]
		var barrier := GameData.now_ms()+700
		var common := PackedStringArray(["--headless","--path",ProjectSettings.globalize_path("res://"),"--script","tests/audit_race_worker.gd","--","--directory="+directory,"--barrier="+str(barrier)])
		var aa := common.duplicate(); aa.append("--worker=a")
		var bb := common.duplicate(); bb.append("--worker=b")
		var a := OS.create_process(OS.get_executable_path(),aa)
		var b := OS.create_process(OS.get_executable_path(),bb)
		while OS.is_process_running(a) or OS.is_process_running(b): OS.delay_msec(10)
		var successes := 0
		var draws := 0
		var acknowledgements: Array = []
		for worker in ["a","b"]:
			var path := directory.path_join("worker-"+worker+".json")
			var actor: Variant = JSON.parse_string(FileAccess.get_file_as_string(path)) if FileAccess.file_exists(path) else null
			if not actor is Dictionary:
				failures += 1; continue
			for row in actor.results:
				if row.ok:
					successes += 1
					if row.command == "summon": draws += 1
					acknowledgements.append({"worker":worker,"revision":row.revision,"command":row.command,"index":row.index})
		var decoded := GameStore.decode_save(FileAccess.get_file_as_string(directory.path_join("normal.json")))
		var revision := int(decoded.get("data",{}).get("revision",-1))
		var committed_draws := 0
		if decoded.ok:
			for draw in decoded.data.drawHistory: committed_draws += draw.results.size()
		var passed: bool = decoded.ok and successes == revision and draws == committed_draws
		if not passed: failures += 1
		var result := {"run":run,"directory":directory,"passed":passed,"successful_commands":successes,"disk_revision":revision,"successful_draws":draws,"committed_draws":committed_draws,"acknowledgements":acknowledgements}
		reports.append(result)
		print("RACE ",run," passed=",passed," ack=",successes," disk=",revision)
	var report := {"phase":phase,"utc":Time.get_datetime_string_from_system(true),"real_parallel_processes":2,"runs":reports,"failures":failures}
	var file := FileAccess.open("res://docs/audits/%s-race-native.json" % phase,FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  ")); file.close()
	print("REAL MULTIPROCESS RACE: ",count," runs, ",failures," failures")
	quit(0 if failures == 0 else 1)
