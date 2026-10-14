extends SceneTree
var checks := 0
var failures: Array = []
func check(value: bool, message: String) -> void:
	checks += 1
	if not value: failures.append(message)
func _initialize() -> void:
	var directory := "user://tests/store-%s-%s-%s" % [int(Time.get_unix_time_from_system()),OS.get_process_id(),Time.get_ticks_usec()]
	var normal := GameStore.new(directory)
	check(normal.load_slot().ok, "new normal save")
	var initial: Dictionary = normal.state.duplicate(true)
	check(normal.transact("summon", {"count": 1, "txid": "test1"}).ok, "real summon transaction")
	check(normal.state.resources.ticket == initial.resources.ticket - 1, "one ticket committed")
	var previous: Dictionary = normal.state.duplicate(true)
	normal.fail_writes = true
	check(not normal.transact("summon", {"count": 1, "txid": "failed"}).ok, "failed write rejected")
	check(normal.state == previous, "failed write leaves assets/RNG unchanged")
	normal.fail_writes = false
	check(normal.transact("summon", {"count": 1, "txid": "failed"}).ok, "same retry succeeds")
	var exported := directory.path_join("export.json")
	check(normal.export_save(exported).ok, "real file exported")
	check(GameStore.decode_save(FileAccess.get_file_as_string(exported)).ok, "export decodes")
	var second := GameStore.new(directory)
	var loaded := second.load_slot()
	check(loaded.ok and second.readonly, "second window becomes readonly")
	check(not second.transact("summon", {"count": 1}).ok, "second window cannot overwrite")
	normal.release()
	check(second.load_slot().ok, "after release reload succeeds")
	check(second.state.resources.ticket == initial.resources.ticket - 2, "exact assets survive disk reload")
	var demo := GameStore.new(directory)
	check(demo.load_slot("demo:new").ok, "separate demo created")
	check(demo.import_save(exported).ok, "ordinary into demo permitted")
	check(demo.state.demo == "new", "sandbox origin restored")
	check(demo.advance_demo_time(1800000).ok, "only isolated clock advances")
	var demo_export := directory.path_join("demo-export.json")
	check(demo.export_save(demo_export).ok, "demo export")
	check(not second.import_save(demo_export).ok, "cannot launder demo into normal")
	check(not second.advance_demo_time().ok, "ordinary clock cannot advance")
	var service := GameOnlineMock.new(directory.path_join("mock.json"), "normal")
	check(service.command("test_a", "device_1", "login", {}).ok, "test A login")
	check(service.command("test_a", "device_2", "login", {}).ok, "second virtual device login")
	check(service.command("test_b", "device_1", "login", {}).ok, "test B login")
	var a := GameStore.new(directory)
	check(a.load_mock_profile("normal", "test_a", "device_1").ok, "mock game profile distinct")
	var order: Dictionary = service.command("test_a", "device_1", "payment_create", {"sku": "test_small", "request_id": "r1"}).data
	var receipt: Dictionary = service.command("test_a", "device_1", "payment_settle", {"order_id": order.id, "outcome": "paid"}).data
	var before_ticket: int = a.state.resources.ticket
	var forged: Dictionary = receipt.duplicate(true)
	forged.rewards.ticket = 999999
	check(a.redeem_mock_receipt(forged, service).ok, "provider lookup ignores forged UI reward")
	check(a.state.resources.ticket == before_ticket + 3, "only canonical receipt amount")
	check(a.redeem_mock_receipt(receipt, service).ok, "duplicate receipt safe result")
	check(a.state.resources.ticket == before_ticket + 3, "duplicate callback no double credit")
	check(not second.redeem_mock_receipt(receipt, service).ok, "ordinary never receives mock payment")
	var extra_order: Dictionary = service.command("test_a", "device_1", "payment_create", {"sku": "test_large", "request_id": "r2"}).data
	var extra_receipt: Dictionary = service.command("test_a", "device_1", "payment_settle", {"order_id": extra_order.id, "outcome": "paid"}).data
	var before_failed_credit: Dictionary = a.state.duplicate(true)
	a.fail_writes = true
	check(not a.redeem_mock_receipt(extra_receipt, service).ok, "paid receipt waits after game disk failure")
	check(a.state == before_failed_credit, "failed credit preserves resources and claim ledger")
	a.fail_writes = false
	service.offline = true
	check(not a.redeem_mock_receipt(extra_receipt, service).ok, "offline provider cannot authorize credit")
	service.offline = false
	check(a.redeem_mock_receipt(extra_receipt, service).ok, "paid receipt replay after disk recovery")
	check(a.state.resources.ticket == before_ticket + 15, "both canonical receipts credit once")
	check(a.redeem_mock_receipt(extra_receipt, service).ok and a.state.resources.ticket == before_ticket + 15, "duplicate recovered callback remains idempotent")
	var b := GameStore.new(directory)
	check(b.load_mock_profile("normal", "test_b", "device_1").ok, "other account own profile")
	check(not b.redeem_mock_receipt(receipt, service).ok, "other account cannot redeem A")
	var upload := service.command("test_a", "device_1", "cloud_upload", {"save": a.state.duplicate(true), "expected_revision": 0})
	check(upload.ok, "real full mock state uploads with null demo")
	var cloud: Dictionary = service.command("test_a", "device_2", "cloud_download", {}).data
	var device2 := GameStore.new(directory)
	check(device2.load_mock_profile("normal", "test_a", "device_2").ok, "second device separate cache")
	check(device2.import_mock_state(cloud, int(device2.state.revision)).ok, "explicit cloud download applies")
	check(device2.state.resources.ticket == before_ticket + 15, "cloud carries exact credited state")
	check(device2.state.mockDevice == "device_2", "local device stamp correct")
	check(not b.import_mock_state(cloud, int(b.state.revision)).ok, "cross-account cloud rejected")
	check(not device2.import_mock_state(cloud, -1).ok, "local revision conflict")
	var mock_export := directory.path_join("mock-export.json")
	check(a.export_save(mock_export).ok, "mock export real file")
	check(not second.import_save(mock_export).ok, "mock assets cannot import normal")
	check(not a.transact("redeemMockReceipt", {"receipt_id":"forged", "account":"test_a", "realm":"normal", "rewards":{"ticket":999}}).ok, "generic UI command cannot bypass provider receipt lookup")
	check(not b.import_save(mock_export).ok, "cross-account file import rejected")
	check(not a.import_save(demo_export).ok, "demo cannot wash into normal mock realm")
	var legacy: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/legacy-saves.json"))
	for fixture in legacy:
		var decoded: Dictionary = GameStore.decode_save(fixture.encoded)
		check(decoded.ok, "legacy exact export decodes: " + fixture.id + " " + str(decoded.get("error", "")))
		if decoded.ok:
			for key in ["resources", "pity", "owned", "cleared", "integratedCores"]:
				if fixture.state.has(key):
					if key == "owned" and int(fixture.state.get("version",3)) < 3: continue
					check(GameData.normalize(decoded.data.get(key)) == GameData.normalize(fixture.state[key]), "preserve legacy assets " + fixture.id + ":" + key)
	var lock_path := directory.path_join("normal.json.writer-lock")
	second.release()
	DirAccess.make_dir_absolute(lock_path)
	var orphan := FileAccess.open(lock_path.path_join("owner-dead.json"), FileAccess.WRITE)
	orphan.store_string(JSON.stringify({"owner":"dead","pid":2147483647,"createdAt":0})); orphan.close()
	check(second.load_slot().ok and not second.readonly, "dead process token reclaimed")
	check(second.transact("settings", {"key":"speed","value":2}).ok, "recovered writer can commit")
	var our_token := FileAccess.open(second._owner_file, FileAccess.WRITE)
	our_token.store_string(JSON.stringify({"owner":second._owner,"pid":OS.get_process_id(),"createdAt":0})); our_token.close()
	var contender := GameStore.new(directory)
	check(contender.load_slot().ok and contender.readonly, "live writer never expires even ancient token")
	check(not contender.transact("settings", {"key":"speed","value":3}).ok, "live stale-looking token cannot be stolen")
	check(FileAccess.file_exists(second._owner_file), "contender never deletes live owner token")
	second.release()
	DirAccess.make_dir_absolute(lock_path)
	var damaged_token := FileAccess.open(lock_path.path_join("owner-unknown.json"), FileAccess.WRITE)
	damaged_token.store_string("damaged"); damaged_token.close()
	check(contender.load_slot().ok and contender.readonly, "corrupt ownership fails closed")
	DirAccess.remove_absolute(lock_path.path_join("owner-unknown.json"))
	DirAccess.remove_absolute(lock_path)
	check(contender.load_slot().ok and not contender.readonly, "clean release restores acquisition")
	contender.release()
	var raw := FileAccess.get_file_as_string(exported)
	check(not GameStore.decode_save(raw.replace("checksum", "brokenchecksum")).ok, "corruption rejected")
	for store in [second, demo, a, b, device2]: store.release()
	print("STORAGE TESTS: %d checks, %d failures" % [checks, failures.size()])
	for failure in failures: push_error(str(failure))
	quit(0 if failures.is_empty() else 1)
