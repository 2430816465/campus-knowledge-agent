extends SceneTree
func _initialize() -> void:
	var phase := "preaudit"
	var count := 10
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="): phase=arg.trim_prefix("--audit-phase=")
		if arg.begins_with("--runs="): count=clampi(int(arg.trim_prefix("--runs=")),1,50)
	var reports: Array = []
	var failures := 0
	for run in count:
		var directory := "user://tests/audit-mock-race-%s-%d-%d" % [phase,GameData.now_ms(),run]
		var service := GameOnlineMock.new(directory.path_join("service.json"))
		for worker in ["a","b"]:
			if not service.command("race"+worker,"device"+worker,"login").ok: failures += 1
		for index in 120:
			if not service.command("racea","devicea","chat_send",{"text":"合法预置测试历史".repeat(16)+str(index),"request_id":"warmup-%d"%index}).ok: failures += 1
		var initial_revision: int = service._revision
		var barrier := GameData.now_ms()+700
		var common := PackedStringArray(["--headless","--path",ProjectSettings.globalize_path("res://"),"--script","tests/audit_mock_race_worker.gd","--","--directory="+directory,"--barrier="+str(barrier)])
		var aa := common.duplicate();aa.append("--worker=a")
		var bb := common.duplicate();bb.append("--worker=b")
		var a := OS.create_process(OS.get_executable_path(),aa)
		var b := OS.create_process(OS.get_executable_path(),bb)
		while OS.is_process_running(a) or OS.is_process_running(b): OS.delay_msec(10)
		var loaded := service.load_data()
		var successes := 0
		var missing: Array = []
		var acknowledgements: Array = []
		for worker in ["a","b"]:
			var path := directory.path_join("worker-"+worker+".json")
			var actor: Variant = JSON.parse_string(FileAccess.get_file_as_string(path)) if FileAccess.file_exists(path) else null
			if not actor is Dictionary: failures += 1;continue
			for outcome in actor.outcomes:
				if not outcome.ok: continue
				successes += 1
				acknowledgements.append(outcome)
				var exists := false
				if loaded.ok:
					if outcome.operation == "chat_send":
						exists = service.data.realms.normal.messages.any(func(message):return message.account=="race"+worker and message.request_id==outcome.request_id)
					else:
						var orders: Dictionary = service.data.realms.normal.accounts["race"+worker].orders
						exists = orders.has(outcome.data.id) and service.data.realms.normal.accounts["race"+worker].requests.get(outcome.request_id)==outcome.data.id
				if not exists: missing.append(outcome)
		var passed: bool = loaded.ok and service._revision == initial_revision+successes and missing.is_empty()
		if not passed: failures += 1
		var result := {"run":run,"directory":directory,"passed":passed,"loaded":loaded,"initial_revision":initial_revision,"successful_commands":successes,"expected_revision":initial_revision+successes,"disk_revision":service._revision if loaded.ok else null,"acknowledged_but_missing_or_unreadable":missing,"acknowledgements":acknowledgements}
		reports.append(result)
		print("MOCK_RACE ",run," pass=",passed," success=",successes," expected_revision=",initial_revision+successes," disk=",service._revision," missing=",missing.size())
	var report := {"phase":phase,"utc":Time.get_datetime_string_from_system(true),"real_parallel_processes":2,"runs":reports,"failures":failures,"scope":"Only local simulated service integrity; no real network/account/payment or production security claim."}
	var output := FileAccess.open("res://docs/audits/%s-mock-race-native.json"%phase,FileAccess.WRITE)
	output.store_string(JSON.stringify(report,"  "));output.close()
	print("REAL MULTIPROCESS MOCK RACE: ",count," runs / ",failures," failed")
	quit(0 if failures==0 else 1)
