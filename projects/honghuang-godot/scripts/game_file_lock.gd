class_name GameFileLock
extends RefCounted
## Short critical-section lock for the local simulated service.
## Uses the same atomic owner-token protocol as the game save store.
var readonly := false
var fail_writes := false
var last_error := ""
var _owner := "%s-%s-%s" % [OS.get_process_id(),Time.get_ticks_usec(),get_instance_id()]
var _lock_dir := ""
var _owner_file := ""
const LEASE_MS := 15000
func _init(file_path: String) -> void:
	_lock_dir = ProjectSettings.globalize_path(file_path) + ".writer-lock"
	_owner_file = _lock_dir.path_join("owner-" + _owner + ".json")
func acquire() -> bool:
	return _acquire()
static func _parse_json(raw: String) -> Variant:
	var parser := JSON.new()
	if parser.parse(raw) != OK: return null
	return parser.data

func _pid_alive(pid: int) -> bool:
	if pid <= 0: return true # Unknown/corrupt ownership is conservatively protected.
	if pid == OS.get_process_id(): return true
	if OS.get_name() == "Linux":
		return DirAccess.dir_exists_absolute("/proc/" + str(pid))
	if OS.get_name() == "Windows":
		# Godot's is_process_running only knows child processes on Windows.
		# tasklist is an OS read-only query, with integer-only arguments.
		var output: Array = []
		var code := OS.execute("tasklist", ["/FI", "PID eq " + str(pid), "/FO", "CSV", "/NH"], output, false)
		if code != 0: return true
		for row in "\n".join(output).split("\n"):
			var fields := row.strip_edges().trim_prefix('"').split('","', false)
			if fields.size() > 1 and fields[1].strip_edges().is_valid_int() and int(fields[1]) == pid: return true
		return false
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

func release() -> void:
	if not _owner_file.is_empty() and FileAccess.file_exists(_owner_file):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(_owner_file))
		# Never recursively delete: a concurrent successor token must survive.
		DirAccess.remove_absolute(ProjectSettings.globalize_path(_lock_dir))
