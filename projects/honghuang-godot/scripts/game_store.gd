class_name GameStore
extends RefCounted

var state: Dictionary = {}
var slot: String = "normal"
var base_dir: String = "user://saves"
var readonly: bool = false
var corruption: bool = false
var clock_offset: int = 0
var mock_account: String = ""
var mock_realm: String = ""
var mock_device: String = ""
var fail_writes: bool = false
var last_error: String = ""
var _receipt_guard: bool = false
var _owner: String = "%s-%s-%s" % [OS.get_process_id(), Time.get_ticks_usec(), get_instance_id()]
var _path: String = ""
var _lease: String = ""
var _lock_dir: String = ""
var _owner_file: String = ""
var _loaded_fingerprint: String = ""
const FORMAT := "honghuang-xianfu-godot"
const MAX_BYTES := 20000000
const LEASE_MS := 15000

func _init(directory: String = "user://saves") -> void:
	base_dir = directory

func now_ms() -> int:
	return GameData.now_ms() + (clock_offset if is_demo() else 0)

func is_demo() -> bool:
	return slot.begins_with("demo:") or (is_mock() and mock_realm.begins_with("demo:"))

func is_mock() -> bool:
	return not mock_account.is_empty()

func _preset() -> String:
	return mock_realm.trim_prefix("demo:") if is_mock() else slot.trim_prefix("demo:")

func _stamp(value: Dictionary) -> void:
	if is_demo(): value["demo"] = _preset()
	if is_mock():
		value["mockAccount"] = mock_account
		value["mockRealm"] = mock_realm
		value["mockDevice"] = mock_device

func _safe_id(value: String) -> bool:
	if value.is_empty() or value.length() > 64: return false
	for character in value:
		if not (character.is_valid_identifier() or character.is_valid_int() or character in ["_", "-"]): return false
	return true

func load_mock_profile(realm: String, account: String, device: String) -> Dictionary:
	if not _safe_id(account) or not _safe_id(device): return {"ok": false, "error": "模拟账号/设备编号无效"}
	var realms: Array = ["normal"]
	for preset in GameData.economy("DEMO_PRESETS", []): realms.append("demo:" + str(preset.id))
	if not realms.has(realm): return {"ok": false, "error": "模拟服务分区无效"}
	return load_slot("mock:" + realm + ":" + account + ":" + device)

func load_slot(next_slot: String = "normal") -> Dictionary:
	release()
	var allowed: Array = ["normal"]
	for preset in GameData.economy("DEMO_PRESETS", []): allowed.append("demo:" + str(preset.id))
	mock_account = ""
	mock_realm = ""
	mock_device = ""
	if next_slot.begins_with("mock:"):
		var parts := next_slot.trim_prefix("mock:").split(":")
		if parts.size() < 3: return {"ok": false, "error": "模拟分区无效"}
		mock_device = parts[parts.size() - 1]
		mock_account = parts[parts.size() - 2]
		mock_realm = ":".join(parts.slice(0, parts.size() - 2))
		if not _safe_id(mock_device) or not _safe_id(mock_account) or not allowed.has(mock_realm):
			mock_account = ""
			return {"ok": false, "error": "模拟分区无效"}
	elif not allowed.has(next_slot): return {"ok": false, "error": "存档位置无效"}
	slot = next_slot
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(base_dir))
	_path = base_dir.path_join(("mock-" + slot.sha256_text().substr(0, 24) if is_mock() else slot.replace(":", "_")) + ".json")
	_lease = _path + ".lease" # Reserved for identifying pre-release legacy leases.
	_lock_dir = _path + ".writer-lock"
	_owner_file = _lock_dir.path_join("owner-" + _owner + ".json")
	clock_offset = 0
	_loaded_fingerprint = ""
	readonly = false
	corruption = false
	state = GameEconomy.demo_state(_preset(), GameData.now_ms()) if is_demo() else GameEconomy.create_state(GameData.now_ms())
	_stamp(state)
	if not FileAccess.file_exists(_path):
		# Godot's Windows rename removes an old destination before MoveFileW.
		# A process interruption in that gap must never be mistaken for a new game.
		if FileAccess.file_exists(_path + ".backup"):
			corruption = true
			readonly = true
			var backup := decode_save(FileAccess.get_file_as_string(_path + ".backup"))
			last_error = "主存档缺失，可能在替换时中断。备份已保留，请恢复有效备份或导入；不会创建空档覆盖进度。"
			return {"ok":false,"status":"corrupt","error":last_error,"backupAvailable":backup.ok}
		var created := _commit(state, false)
		return {"ok": created.ok, "status": "new", "error": created.get("error", "")}
	var raw := FileAccess.get_file_as_string(_path)
	_loaded_fingerprint = raw.sha256_text()
	var decoded := decode_save(raw)
	if not decoded.ok:
		corruption = true
		readonly = true
		var backup := decode_save(FileAccess.get_file_as_string(_path + ".backup")) if FileAccess.file_exists(_path + ".backup") else {"ok": false}
		return {"ok": false, "status": "corrupt", "error": decoded.error, "backupAvailable": backup.ok}
	state = decoded.data
	_stamp(state)
	clock_offset = int(state.get("godotDemoClockOffset", 0)) if is_demo() else 0
	return {"ok": true, "status": "ok", "readonly": not _acquire()}

# Atomic directory creation elects one writer. A live process never loses its
# lock because of a timeout or a paused frame. Token-specific reclamation cannot
# delete a successor's ownership. Disk fingerprint/revision guards remain in force.
func _pid_alive(pid: int) -> bool:
	if pid <= 0: return true # Unknown/corrupt ownership is conservatively protected.
	if pid == OS.get_process_id(): return true
	if OS.get_name() == "Linux":
		return DirAccess.dir_exists_absolute("/proc/" + str(pid))
	if OS.get_name() == "Windows":
		# The Windows Godot API only knows its own children. tasklist can
		# block on WMI/credentials, so query the OS process table through a
		# hidden, bounded helper. Unknown/timeout is always protected.
		var path: String = ProjectSettings.globalize_path(base_dir.path_join("pid-query-%s-%s.txt" % [OS.get_process_id(),Time.get_ticks_usec()]))
		var quoted: String = "'"+path.replace("'","''")+"'"
		var query: String = "try { $process=[System.Diagnostics.Process]::GetProcessById(%d); $process.Dispose(); $status='alive' } catch [System.ArgumentException] { $status='dead' } catch { $status='unknown' }; [System.IO.File]::WriteAllText(%s,$status)" % [pid,quoted]
		var helper: int = OS.create_process("powershell.exe",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-Command",query])
		if helper <= 0: return true
		var deadline: int = Time.get_ticks_msec()+5000
		while OS.is_process_running(helper) and Time.get_ticks_msec() < deadline: OS.delay_msec(20)
		if OS.is_process_running(helper): OS.kill(helper)
		var result: String = FileAccess.get_file_as_string(path).strip_edges() if FileAccess.file_exists(path) else "unknown"
		if FileAccess.file_exists(path): DirAccess.remove_absolute(path)
		return result != "dead"
	return true # Unsupported platforms require explicit clean close, never stealing.

func _busy() -> bool:
	readonly = true
	last_error = "另一窗口正在写入此档，本窗口只读；关闭另一窗口后重新载入"
	return false

func _lock_snapshot() -> Dictionary:
	var directory := DirAccess.open(_lock_dir)
	if directory == null: return {}
	# Instance enumeration tolerates a concurrent clean release. Static
	# get_files_at emits an engine error when open races directory removal.
	return {"files":directory.get_files(),"directories":directory.get_directories()}

func _owned_lock() -> bool:
	var contents := _lock_snapshot()
	if contents.is_empty(): return false
	var files: PackedStringArray = contents.files
	return files.size() == 1 and files[0] == _owner_file.get_file() and contents.directories.is_empty()

func _acquire() -> bool:
	if fail_writes:
		last_error = "模拟写入失败；资产未提交"
		return false
	if _owned_lock():
		readonly = false
		return true
	var contents := _lock_snapshot()
	if not contents.is_empty():
		var files: PackedStringArray = contents.files
		if not contents.directories.is_empty(): return _busy()
		for name in files:
			if not name.begins_with("owner-") or not name.ends_with(".json"): return _busy()
			var path := _lock_dir.path_join(name)
			var prior: Variant = _parse_json(FileAccess.get_file_as_string(path))
			if not prior is Dictionary or _pid_alive(int(prior.get("pid", 0))): return _busy()
			# Delete only the unique observed dead-owner token, never a generic
			# owner.json that may already have been replaced by a successor.
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
		if files.is_empty():
			# A creator may be between mkdir and token write. Do not disturb it.
			var modified := FileAccess.get_modified_time(_lock_dir)
			if modified == 0 or GameData.now_ms() - modified * 1000 < LEASE_MS: return _busy()
		DirAccess.remove_absolute(ProjectSettings.globalize_path(_lock_dir)) # Fails safely if nonempty.
	if DirAccess.make_dir_absolute(ProjectSettings.globalize_path(_lock_dir)) != OK: return _busy()
	var f := FileAccess.open(_owner_file, FileAccess.WRITE)
	if f == null:
		last_error = "无法取得存档写入权"
		return false
	f.store_string(JSON.stringify({"owner": _owner, "pid": OS.get_process_id(), "createdAt": GameData.now_ms()}))
	f.flush()
	var write_error := f.get_error()
	f.close()
	# This verification also fences a creator resumed after its abandoned empty
	# directory was reclaimed: it cannot coexist with an established owner.
	if write_error != OK or not _owned_lock():
		if FileAccess.file_exists(_owner_file): DirAccess.remove_absolute(ProjectSettings.globalize_path(_owner_file))
		return _busy()
	readonly = false
	last_error = ""
	return true

func heartbeat() -> bool:
	if corruption or _path.is_empty(): return false
	return _acquire()

func release() -> void:
	if not _owner_file.is_empty() and FileAccess.file_exists(_owner_file):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(_owner_file))
		# Never recursively delete: a concurrent successor token must survive.
		DirAccess.remove_absolute(ProjectSettings.globalize_path(_lock_dir))

func transact(command_name: String, args: Dictionary = {}, at: int = -1) -> Dictionary:
	if command_name == "redeemMockReceipt" and not _receipt_guard: return {"ok": false, "error": "模拟回执须先通过模拟服务核验"}
	if corruption: return {"ok": false, "error": "原档校验失败，请先恢复有效备份或导入，不能覆盖为空档"}
	if not _acquire(): return {"ok": false, "error": last_error}
	if FileAccess.file_exists(_path):
		var current := decode_save(FileAccess.get_file_as_string(_path))
		if not current.ok: return {"ok": false, "error": "磁盘存档已改变或损坏，请重新载入"}
		if int(current.data.get("revision", 0)) != int(state.get("revision", 0)):
			readonly = true
			return {"ok": false, "error": "另一窗口已有更新，请重新载入；本次操作未提交"}
	var draft: Dictionary = state.duplicate(true)
	_stamp(draft)
	var result: Dictionary
	if command_name == "ackSummonPresentation":
		if str(draft.get("summonPresentation", {}).get("id", "")) != str(args.get("txid", "")):
			return {"ok": false, "error": "召唤展示记录已改变，请重新载入"}
		draft["summonPresentation"]["acknowledged"] = true
		result = {"ok": true}
	else:
		if command_name == "summon" and bool(args.get("presentation", false)) and not pending_summon().is_empty():
			if str(pending_summon().id) == str(args.get("txid", "")):
				return {"ok": true, "data": pending_summon().results}
			return {"ok": false, "error": "请先查看上次已保存的召唤结果"}
		result = GameEconomy.command(draft, command_name, args, now_ms() if at < 0 else at)
		if command_name == "summon" and result.get("ok", false) and bool(args.get("presentation", false)):
			# One atomic commit binds the pending reveal to its already awarded ledger entry.
			draft["summonPresentation"] = {"id": str(args.txid), "acknowledged": false}
	if not result.get("ok", false): return result
	_stamp(draft)
	draft["revision"] = int(state.get("revision", 0)) + 1
	if is_demo(): draft["godotDemoClockOffset"] = clock_offset
	var validation: String = GameEconomy.validate_state(draft)
	if not validation.is_empty(): return {"ok": false, "error": "提交校验失败：" + validation}
	var saved := _commit(draft, true)
	if not saved.ok: return saved
	state = draft
	return result

func pending_summon() -> Dictionary:
	var journal: Dictionary = state.get("summonPresentation", {})
	if journal.is_empty() or bool(journal.get("acknowledged", false)): return {}
	for entry: Dictionary in state.get("drawHistory", []):
		if str(entry.id) == str(journal.get("id", "")): return entry.duplicate(true)
	return {}

func _guard_current_disk() -> Dictionary:
	if not _acquire(): return {"ok": false, "error": last_error}
	if FileAccess.file_exists(_path):
		var current_raw := FileAccess.get_file_as_string(_path)
		if not _loaded_fingerprint.is_empty() and current_raw.sha256_text() != _loaded_fingerprint:
			readonly = true
			return {"ok": false, "error": "磁盘存档已有新版本，请先重新载入后比较，不能覆盖未看到的进度", "data": {"code": "DISK_CONFLICT"}}
		var current := decode_save(current_raw)
		if current.ok and int(current.data.get("revision", 0)) != int(state.get("revision", 0)):
			readonly = true
			return {"ok": false, "error": "磁盘存档版本已变化，请重新载入", "data": {"code": "DISK_CONFLICT"}}
		if not current.ok and not corruption:
			return {"ok": false, "error": "磁盘存档校验失败，请重新载入并恢复"}
	elif not _loaded_fingerprint.is_empty():
		return {"ok": false, "error": "磁盘存档已被移除，请重新载入后恢复"}
	return {"ok": true}

func _commit(value: Dictionary, backup: bool) -> Dictionary:
	var final_validation: String = GameEconomy.validate_state(value)
	if not final_validation.is_empty(): return {"ok": false, "error": "最终存档校验失败：" + final_validation}
	var guard := _guard_current_disk()
	if not guard.ok: return guard
	var raw := encode_save(value)
	if raw.to_utf8_buffer().size() > MAX_BYTES: return {"ok": false, "error": "存档超过20MB，原档保留"}
	if raw.is_empty(): return {"ok": false, "error": "存档编码校验失败"}
	if backup and FileAccess.file_exists(_path):
		var old := FileAccess.get_file_as_string(_path)
		if decode_save(old).ok:
			var copied := _write_atomic(_path + ".backup", old)
			if not copied.ok: return copied
	var written := _write_atomic(_path, raw)
	if written.ok: _loaded_fingerprint = raw.sha256_text()
	return written

func _write_atomic(path: String, text: String) -> Dictionary:
	if fail_writes: return {"ok": false, "error": "模拟写入失败；资产未提交"}
	var tmp := path + ".tmp-" + _owner
	var file := FileAccess.open(tmp, FileAccess.WRITE)
	if file == null: return {"ok": false, "error": "无法写入临时存档，原档保留"}
	file.store_string(text)
	file.flush()
	var error := file.get_error()
	file.close()
	if error != OK or FileAccess.get_file_as_string(tmp) != text:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(tmp))
		return {"ok": false, "error": "存档落盘验证失败，原档保留"}
	var renamed := DirAccess.rename_absolute(ProjectSettings.globalize_path(tmp), ProjectSettings.globalize_path(path))
	if renamed != OK: return {"ok": false, "error": "无法完成文件替换；有效备份与临时文件保留，请重新载入并恢复"}
	return {"ok": true}

static func encode_save(value: Dictionary) -> String:
	var payload := JSON.stringify(value, "", false, true)
	return JSON.stringify({"format": FORMAT, "version": 1, "sourceSaveVersion": 3, "checksum": payload.sha256_text(), "payload": payload})

static func legacy_checksum(text: String) -> String:
	var hash: int = 2166136261
	for i in text.length():
		var code := text.unicode_at(i)
		if code > 65535:
			code -= 65536
			hash = ((hash ^ (55296 + (code >> 10))) * 16777619) & 0xffffffff
			code = 56320 + (code & 1023)
		hash = ((hash ^ code) * 16777619) & 0xffffffff
	return "%08x" % hash

static func js_stringify(value: Variant) -> String:
	if value == null: return "null"
	if value is bool: return "true" if value else "false"
	if value is int: return str(value)
	if value is float:
		if not is_finite(value): return "null"
		if value == floor(value): return str(int(value))
		return JSON.stringify(value)
	if value is String: return JSON.stringify(value)
	if value is Array:
		var parts: PackedStringArray = []
		for item in value: parts.append(js_stringify(item))
		return "[" + ",".join(parts) + "]"
	if value is Dictionary:
		var parts: PackedStringArray = []
		for key in value: parts.append(JSON.stringify(str(key)) + ":" + js_stringify(value[key]))
		return "{" + ",".join(parts) + "}"
	return "null"

static func decode_save(raw: String) -> Dictionary:
	if raw.is_empty() or raw.length() > MAX_BYTES: return {"ok": false, "error": "存档为空或超过20MB"}
	var envelope: Variant = _parse_json(raw)
	if not envelope is Dictionary: return {"ok": false, "error": "存档不是有效JSON对象"}
	var data: Dictionary = {}
	if envelope.get("format") == FORMAT:
		if not (envelope.get("version") is int or envelope.get("version") is float) or float(envelope.version) != 1.0 or not envelope.get("payload") is String:
			return {"ok": false, "error": "不兼容的原生存档格式"}
		var payload: String = envelope.payload
		if payload.sha256_text() != envelope.get("checksum", ""): return {"ok": false, "error": "存档校验失败，原数据保留"}
		var parsed: Variant = _parse_json(payload)
		if not parsed is Dictionary: return {"ok": false, "error": "存档数据无效"}
		data = parsed
	elif envelope.get("format") == "honghuang-xianfu":
		if not envelope.get("data") is Dictionary: return {"ok": false, "error": "旧档数据无效"}
		if not (envelope.get("version") is int or envelope.get("version") is float) or not [1.0,2.0,3.0].has(float(envelope.version)) or float(envelope.version) != float(envelope.data.get("version", 0)): return {"ok": false, "error": "旧档信封与数据版本不符"}
		if legacy_checksum(js_stringify(envelope.data)) != envelope.get("checksum", "") and legacy_checksum(_legacy_data_token(raw)) != envelope.get("checksum", ""):
			return {"ok": false, "error": "旧档校验失败，原文件未修改"}
		data = envelope.data
	else: return {"ok": false, "error": "这不是洪荒众仙府存档"}
	var migrated: Dictionary = GameEconomy.migrate_state(GameData.normalize(data), int(data.get("version", 0)))
	if migrated.is_empty(): return {"ok": false, "error": "旧档迁移校验失败，原文件保留"}
	if migrated.has("error") and not migrated.has("version"): return {"ok": false, "error": str(migrated.error)}
	var validation: String = GameEconomy.validate_state(migrated)
	if not validation.is_empty(): return {"ok": false, "error": validation}
	return {"ok": true, "data": migrated}

func export_save(path: String) -> Dictionary:
	if corruption: return {"ok": false, "error": "请先恢复有效档案，不能导出空白替代档"}
	var export_state: Dictionary = state.duplicate(true)
	_stamp(export_state)
	return _write_atomic(path, encode_save(export_state))

func import_save(path: String) -> Dictionary:
	var disk_guard := _guard_current_disk()
	if not disk_guard.ok: return disk_guard
	if not FileAccess.file_exists(path): return {"ok": false, "error": "导入文件不存在"}
	var source_file := FileAccess.open(path, FileAccess.READ)
	if source_file == null: return {"ok": false, "error": "无法读取导入文件"}
	if source_file.get_length() > MAX_BYTES:
		source_file.close()
		return {"ok": false, "error": "导入文件超过20MB"}
	var raw := source_file.get_as_text()
	source_file.close()
	var decoded := decode_save(raw)
	if not decoded.ok: return decoded
	var candidate: Dictionary = decoded.data
	if not is_mock() and candidate.get("mockAccount") != null: return {"ok": false, "error": "模拟账号档不能导入普通档或非模拟展示档"}
	if is_mock():
		if candidate.get("mockAccount") != null and (candidate.get("mockAccount") != mock_account or candidate.get("mockRealm") != mock_realm): return {"ok": false, "error": "导入档案属于另一模拟账号或分区"}
		if not is_demo() and candidate.get("demo") != null: return {"ok": false, "error": "展示档不能导入普通模拟账号"}
	if slot == "normal" and (candidate.get("demo") != null or candidate.get("mockAccount") != null):
		return {"ok": false, "error": "隔离展示档不能导入普通档"}
	_stamp(candidate)
	var original := _write_atomic(_path + ".import-original-%s.json" % GameData.now_ms(), raw)
	if not original.ok: return original
	candidate["revision"] = maxi(int(state.get("revision", 0)), int(candidate.get("revision", 0))) + 1
	var saved := _commit(candidate, not corruption)
	if not saved.ok: return saved
	state = candidate
	corruption = false
	readonly = false
	clock_offset = int(state.get("godotDemoClockOffset", 0)) if is_demo() else 0
	return {"ok": true, "data": "存档已验证并导入，迁移前原文与当前有效档已备份"}

func reset_demo(preset: String = "") -> Dictionary:
	if not is_demo(): return {"ok": false, "error": "普通档不能注入展示资产"}
	var chosen := _preset() if preset.is_empty() else preset
	var draft: Dictionary = GameEconomy.demo_state(chosen, GameData.now_ms())
	if draft.is_empty(): return {"ok": false, "error": "展示起点无效"}
	var guard := _guard_current_disk()
	if not guard.ok: return guard
	if corruption and FileAccess.file_exists(_path):
		var preserved := _write_atomic(_path + ".before-reset-%s.json" % GameData.now_ms(), FileAccess.get_file_as_string(_path))
		if not preserved.ok: return preserved
	_stamp(draft)
	draft["revision"] = int(state.get("revision", 0)) + 1
	var saved := _commit(draft, true)
	if saved.ok:
		state = draft
		clock_offset = 0
		corruption = false
		readonly = false
		last_error = ""
	return saved

func advance_demo_time(milliseconds: int = 1800000) -> Dictionary:
	if not is_demo() or milliseconds <= 0 or milliseconds > 43200000: return {"ok": false, "error": "仅允许隔离档推进最多12小时"}
	var before := clock_offset
	clock_offset += milliseconds
	var result := transact("advance", {}, now_ms())
	if not result.ok: clock_offset = before
	return result

func restore_backup() -> Dictionary:
	var disk_guard := _guard_current_disk()
	if not disk_guard.ok: return disk_guard
	var backup_path := _path + ".backup"
	if not FileAccess.file_exists(backup_path): return {"ok": false, "error": "没有有效备份"}
	var raw := FileAccess.get_file_as_string(backup_path)
	var decoded := decode_save(raw)
	if not decoded.ok: return decoded
	if FileAccess.file_exists(_path):
		var preserved := _write_atomic(_path + ".before-restore-%s.json" % GameData.now_ms(), FileAccess.get_file_as_string(_path))
		if not preserved.ok: return preserved
	var candidate: Dictionary = decoded.data
	if not is_mock() and candidate.get("mockAccount") != null: return {"ok": false, "error": "模拟账号档不能导入普通档或非模拟展示档"}
	if is_mock():
		if candidate.get("mockAccount") != null and (candidate.get("mockAccount") != mock_account or candidate.get("mockRealm") != mock_realm): return {"ok": false, "error": "导入档案属于另一模拟账号或分区"}
		if not is_demo() and candidate.get("demo") != null: return {"ok": false, "error": "展示档不能导入普通模拟账号"}
	if slot == "normal" and (candidate.get("demo") != null or candidate.get("mockAccount") != null): return {"ok": false, "error": "展示备份不能恢复为普通档"}
	_stamp(candidate)
	candidate["revision"] = maxi(int(state.get("revision", 0)), int(candidate.get("revision", 0))) + 1
	var saved := _commit(candidate, false)
	if saved.ok:
		state = candidate
		corruption = false
		readonly = false
		clock_offset = int(state.get("godotDemoClockOffset", 0)) if is_demo() else 0
	return saved

func redeem_mock_receipt(receipt: Dictionary, service: GameOnlineMock) -> Dictionary:
	if not is_mock() or is_demo(): return {"ok": false, "error": "模拟支付只能进入独立普通模拟账号档，不能影响普通档或试用档"}
	if service.realm != mock_realm: return {"ok": false, "error": "模拟服务分区不匹配"}
	var expected_id: String = str(receipt.get("receipt_id", ""))
	if expected_id.is_empty(): return {"ok": false, "error": "缺少模拟支付回执编号"}
	var lookup: Dictionary = service.command(mock_account, mock_device, "payment_receipts", {})
	if not lookup.ok: return lookup
	var canonical: Dictionary = {}
	for entry in lookup.data:
		if entry.get("receipt_id") == expected_id: canonical = entry
	if canonical.is_empty() or canonical.get("status") != "paid" or canonical.get("real_payment") != false:
		return {"ok": false, "error": "模拟服务没有这笔已支付回执；本地传来的奖励不可信"}
	if canonical.get("account") != mock_account or canonical.get("realm") != mock_realm:
		return {"ok": false, "error": "回执不属于当前模拟账号"}
	_receipt_guard = true
	var result := transact("redeemMockReceipt", {"receipt_id": canonical.receipt_id, "rewards": GameData.normalize(canonical.rewards), "account": mock_account, "realm": mock_realm})
	_receipt_guard = false
	return result

func import_mock_state(cloud_payload: Dictionary, expected_local_revision: int, force: bool = false) -> Dictionary:
	if not is_mock(): return {"ok": false, "error": "仅模拟账号档可接收模拟云存档"}
	if int(state.get("revision", 0)) != expected_local_revision:
		return {"ok": false, "error": "本地进度已经变化，请明确选择云端或本地版本", "data": {"code": "LOCAL_CONFLICT"}}
	var incoming: Variant = cloud_payload.get("save", cloud_payload)
	if not incoming is Dictionary: return {"ok": false, "error": "模拟云存档格式无效"}
	if incoming.get("mockAccount") != mock_account or incoming.get("mockRealm") != mock_realm:
		return {"ok": false, "error": "云存档账号或分区不匹配"}
	if (not is_demo() and incoming.get("demo") != null) or (is_demo() and incoming.get("demo") != _preset()):
		return {"ok": false, "error": "普通模拟档与试用模拟档不能互传"}
	var migrated: Dictionary = GameEconomy.migrate_state(GameData.normalize(incoming), int(incoming.get("version", 0)))
	var validation: String = GameEconomy.validate_state(migrated)
	if not validation.is_empty(): return {"ok": false, "error": validation}
	_stamp(migrated)
	migrated["revision"] = int(state.get("revision", 0)) + 1
	var saved := _commit(migrated, true)
	if saved.ok:
		state = migrated
		clock_offset = int(state.get("godotDemoClockOffset", 0)) if is_demo() else 0
	return saved

static func _legacy_data_token(raw: String) -> String:
	var i := 0
	var depth := 0
	while i < raw.length():
		var c := raw.substr(i, 1)
		if c == "\"":
			var begin := i
			i += 1
			while i < raw.length():
				if raw.substr(i, 1) == "\\": i += 2; continue
				if raw.substr(i, 1) == "\"": break
				i += 1
			var token := raw.substr(begin, i - begin + 1)
			if depth == 1 and _parse_json(token) == "data":
				i += 1
				while i < raw.length() and raw.substr(i, 1) in [" ", "\t", "\n", "\r"]: i += 1
				if i >= raw.length() or raw.substr(i, 1) != ":": return ""
				i += 1
				while i < raw.length() and raw.substr(i, 1) in [" ", "\t", "\n", "\r"]: i += 1
				var result := ""
				var nesting := 0
				var in_string := false
				var escaped := false
				while i < raw.length():
					c = raw.substr(i, 1)
					if in_string:
						result += c
						if escaped: escaped = false
						elif c == "\\": escaped = true
						elif c == "\"": in_string = false
					else:
						if c == "\"": in_string = true
						if c in ["{", "["]: nesting += 1
						if c in ["}", "]"]: nesting -= 1
						if not c in [" ", "\t", "\n", "\r"]: result += c
						if nesting == 0: return result
					i += 1
				return ""
		elif c == "{": depth += 1
		elif c == "}": depth -= 1
		i += 1
	return ""

static func _parse_json(raw: String) -> Variant:
	var parser := JSON.new()
	if parser.parse(raw) != OK: return null
	return parser.data
