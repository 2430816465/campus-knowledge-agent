class_name GameOnlineMock
extends RefCounted
## Offline integration sandbox only. No network, credentials or real-money transactions.
## Treat all clients as untrusted when replacing this adapter with a real server.
const FORMAT = "honghuang-local-mock-v1"
const PRODUCTS = {"test_small": {"name": "内测补给", "price_label": "模拟 ¥6（不扣款）", "rewards": {"ticket": 3}}, "test_large": {"name": "内测礼包", "price_label": "模拟 ¥30（不扣款）", "rewards": {"ticket": 12}}}
var path: String
var realm: String
var offline = false
var fail_writes = false
var data: Dictionary = {}
var _revision = 0
var _loaded = false
var _corrupt = false
var _fingerprint := ""

func _init(file_path: String = "user://mock-online-v1.json", service_realm: String = "normal") -> void:
	path = file_path
	realm = service_realm

func _empty() -> Dictionary:
	return {"format": FORMAT, "revision": 0, "realms": {}}

func _result(ok: bool, value: Variant = {}, error: String = "") -> Dictionary:
	return {"ok": ok, "data": value, "error": error, "mock": true, "notice": "内测模拟服务 · 不连接服务器 · 不真实扣款"}

func _decode(raw: String) -> Variant:
	var parser = JSON.new()
	if parser.parse(raw) != OK: return null
	return parser.data

func _valid_saved(value: Variant) -> bool:
	if not value is Dictionary or value.get("format") != FORMAT or not value.get("realms") is Dictionary: return false
	for room in value.realms.values():
		if not room is Dictionary: return false
		for key in ["accounts", "guilds", "boards"]:
			if not room.get(key) is Dictionary: return false
		if not room.get("messages") is Array: return false
		for account in room.accounts.values():
			if not account is Dictionary: return false
			for key in ["devices", "cloud", "orders", "requests"]:
				if not account.get(key) is Dictionary: return false
			if not account.get("nickname") is String or not account.get("guild") is String: return false
			for order in account.orders.values():
				if not order is Dictionary or not order.get("status") in ["pending", "paid", "cancelled", "failed"]: return false
		for message in room.messages:
			if not message is Dictionary: return false
			for key in ["account", "nickname", "text", "channel"]:
				if not message.get(key) is String: return false
		for guild in room.guilds.values():
			if not guild is Dictionary or not guild.get("members") is Array or not guild.get("owner") is String or not guild.get("name") is String: return false
		for board in room.boards.values():
			if not board is Dictionary: return false
			for row in board.values():
				if not row is Dictionary or not row.get("account") is String or not (row.get("score") is int or row.get("score") is float): return false
	return true

func load_data() -> Dictionary:
	if not FileAccess.file_exists(path):
		_fingerprint = ""
		if FileAccess.file_exists(path + ".backup"):
			_corrupt = true
			return _result(false, {}, "模拟服务主文件缺失，备份已保留；请明确恢复备份，不会创建空服务覆盖历史")
		data = _empty()
		_revision = 0
		_loaded = true
		return _result(true)
	if FileAccess.get_size(path) > 16000000: return _result(false, {}, "模拟服务文件过大")
	var raw := FileAccess.get_file_as_string(path)
	_fingerprint = raw.sha256_text()
	var parsed: Variant = _decode(raw)
	if not _valid_saved(parsed):
		_corrupt = true
		return _result(false, {}, "模拟服务文件损坏，未覆盖；请保留原件并恢复备份")
	data = parsed
	_revision = int(data.get("revision", 0))
	_loaded = true
	_corrupt = false
	return _result(true)

func restore_backup() -> Dictionary:
	if fail_writes: return _result(false, {}, "模拟写入失败；备份未修改")
	var absolute := ProjectSettings.globalize_path(path)
	var writer := GameFileLock.new(absolute)
	if not writer.acquire(): return _result(false, {}, "另一窗口正在提交模拟服务，请稍后重新载入")
	var result := _restore_backup_locked(absolute, writer._owner)
	writer.release()
	return result

func _restore_backup_locked(absolute: String, owner: String) -> Dictionary:
	var backup_path := absolute + ".backup"
	if not FileAccess.file_exists(backup_path) or FileAccess.get_size(backup_path) > 16000000: return _result(false, {}, "没有可用的模拟服务备份")
	var restored: Variant = _decode(FileAccess.get_file_as_string(backup_path))
	if not _valid_saved(restored): return _result(false, {}, "模拟服务备份无效，原文件保留")
	if FileAccess.file_exists(absolute):
		var current := FileAccess.get_file_as_string(absolute)
		if not _fingerprint.is_empty() and current.sha256_text() != _fingerprint: return _result(false, {}, "模拟服务已有新版本，请先重新载入，不能覆盖未看到的变更")
		var preserved := absolute + ".before-restore-" + str(GameData.now_ms()) + ".json"
		if not _write_service_file(preserved, current, owner): return _result(false, {}, "无法保留当前服务文件，恢复未提交")
	elif not _fingerprint.is_empty(): return _result(false, {}, "服务主文件刚被移除，请重新载入后恢复")
	restored.revision = maxi(_revision, int(restored.get("revision", 0))) + 1
	var encoded := JSON.stringify(restored, "", false, true)
	if not _write_service_file(absolute, encoded, owner): return _result(false, {}, "恢复写入失败，备份与临时文件保留")
	data = restored
	_revision = int(data.revision)
	_fingerprint = encoded.sha256_text()
	_loaded = true
	_corrupt = false
	return _result(true, {"revision":_revision}, "已恢复最近有效模拟服务备份；备份之后的服务操作已回退，普通游戏档未改动")

func snapshot() -> Dictionary:
	return data.duplicate(true)

func _id_valid(value: String) -> bool:
	if value.is_empty() or value.length() > 48: return false
	for ch in value:
		if not (ch.is_valid_identifier() or ch.is_valid_int() or ch in ["-", ":"]): return false
	return true

func _clean(value: Variant, limit: int) -> String:
	var text = str(value).strip_edges()
	if text.is_empty() or text.length() > limit: return ""
	for c in text:
		if c.unicode_at(0) < 32: return ""
	return text

func _room(draft: Dictionary) -> Dictionary:
	if not draft.realms.has(realm): draft.realms[realm] = {"accounts": {}, "messages": [], "guilds": {}, "boards": {}, "sequence": 0}
	return draft.realms[realm]

func _next(room: Dictionary, prefix: String) -> String:
	room.sequence = int(room.sequence) + 1
	return prefix + str(room.sequence)

func _commit(draft: Dictionary) -> bool:
	if fail_writes or _corrupt: return false
	var absolute := ProjectSettings.globalize_path(path)
	if DirAccess.make_dir_recursive_absolute(absolute.get_base_dir()) != OK: return false
	var writer := GameFileLock.new(absolute)
	if not writer.acquire(): return false
	var committed := _commit_locked(draft, absolute, writer._owner)
	writer.release()
	return committed

func _commit_locked(draft: Dictionary, absolute: String, owner: String) -> bool:
	var old_text := ""
	if FileAccess.file_exists(absolute):
		old_text = FileAccess.get_file_as_string(absolute)
		if not _fingerprint.is_empty() and old_text.sha256_text() != _fingerprint: return false
		var latest: Variant = _decode(old_text)
		if not latest is Dictionary or int(latest.get("revision", -1)) != _revision: return false
	elif _revision != 0: return false
	draft.revision = _revision + 1
	var encoded := JSON.stringify(draft, "", false, true)
	if encoded.to_utf8_buffer().size() > 16000000: return false
	if not old_text.is_empty() and not _write_service_file(absolute + ".backup", old_text, owner): return false
	if not _write_service_file(absolute, encoded, owner): return false
	data = draft
	_revision = int(data.revision)
	_fingerprint = encoded.sha256_text()
	return true

func _write_service_file(destination: String, encoded: String, owner: String) -> bool:
	var temp := destination + ".tmp-" + owner
	var f := FileAccess.open(temp, FileAccess.WRITE)
	if f == null: return false
	f.store_string(encoded)
	f.flush()
	var write_error := f.get_error()
	f.close()
	if write_error != OK or FileAccess.get_file_as_string(temp) != encoded:
		DirAccess.remove_absolute(temp)
		return false
	return DirAccess.rename_absolute(temp, destination) == OK

func command(account_id: String, device_id: String, operation: String, args: Dictionary = {}) -> Dictionary:
	if offline: return _result(false, {}, "模拟离线：请恢复连接后重试")
	if not _loaded:
		var loaded = load_data()
		if not loaded.ok: return loaded
	if _corrupt: return _result(false, {}, "模拟服务文件损坏，禁止写入")
	if not _id_valid(account_id) or not _id_valid(device_id): return _result(false, {}, "测试账号或设备编号无效")
	if realm.is_empty(): return _result(false, {}, "模拟环境编号无效")
	var draft = data.duplicate(true)
	var room = _room(draft)
	if operation == "login":
		var nickname = _clean(args.get("nickname", account_id), 24)
		if nickname.is_empty(): return _result(false, {}, "昵称须为1–24字且不能含控制字符")
		if not room.accounts.has(account_id): room.accounts[account_id] = {"nickname": nickname, "devices": {}, "cloud": {}, "guild": "", "orders": {}, "requests": {}}
		var account: Dictionary = room.accounts[account_id]
		account.nickname = nickname
		account.devices[device_id] = {"last_seen": int(Time.get_unix_time_from_system())}
		if not _commit(draft): return _result(false, {}, "保存失败或另一窗口已有更新；未提交，请重新载入")
		return _result(true, {"account_id": account_id, "device_id": device_id, "nickname": nickname, "realm": realm})
	if not room.accounts.has(account_id): return _result(false, {}, "请先选择并登录测试账号")
	var account: Dictionary = room.accounts[account_id]
	if not account.devices.has(device_id): return _result(false, {}, "请先登录此测试设备")
	var response = _dispatch(room, account, account_id, device_id, operation, args)
	if not response.ok: return response
	if response.get("read_only", false):
		response.erase("read_only")
		return response
	if not _commit(draft): return _result(false, {}, "保存失败或另一窗口已有更新；未提交，请重新载入")
	return response

func _read(value: Variant) -> Dictionary:
	var response = _result(true, value)
	response.read_only = true
	return response

func _dispatch(room: Dictionary, account: Dictionary, account_id: String, device_id: String, operation: String, args: Dictionary) -> Dictionary:
	match operation:
		"cloud_upload":
			var save: Variant = args.get("save")
			if not save is Dictionary or save.is_empty() or JSON.stringify(save).length() > 1000000: return _result(false, {}, "存档为空、格式错误或超过模拟上限")
			var demo = "" if save.get("demo") == null else str(save.get("demo"))
			if (realm == "normal" and not demo.is_empty()) or (realm != "normal" and demo != realm.trim_prefix("demo:")): return _result(false, {}, "普通档与试用档不能互传")
			var current = int(account.cloud.get("revision", 0))
			if not args.has("expected_revision") or int(args.expected_revision) != current:
				return _result(false, {"code": "CONFLICT", "server_revision": current, "cloud": account.cloud.duplicate(true)}, "云档版本冲突：请下载比较后明确选择保留版本")
			account.cloud = {"revision": current + 1, "save": save.duplicate(true), "device": device_id, "updated_at": int(Time.get_unix_time_from_system())}
			return _result(true, account.cloud.duplicate(true))
		"cloud_download":
			return _read(account.cloud.duplicate(true))
		"chat_send":
			var text = _clean(args.get("text", ""), 200)
			if text.is_empty(): return _result(false, {}, "消息须为1–200字且不能含控制字符")
			var channel = str(args.get("channel", "world"))
			if channel == "guild":
				if str(account.guild).is_empty(): return _result(false, {}, "尚未加入公会")
				channel = "guild:" + str(account.guild)
			elif channel != "world": return _result(false, {}, "频道无效")
			var request = _clean(args.get("request_id", ""), 64)
			if not request.is_empty():
				for old in room.messages:
					if old.account == account_id and old.get("request_id") == request: return _read(old.duplicate(true))
			var message = {"id": _next(room, "msg-"), "account": account_id, "nickname": account.nickname, "text": text, "channel": channel, "request_id": request, "time": int(Time.get_unix_time_from_system())}
			room.messages.append(message)
			while room.messages.size() > 300: room.messages.pop_front()
			return _result(true, message)
		"chat_history":
			var channel = str(args.get("channel", "world"))
			if channel == "guild":
				if str(account.guild).is_empty(): return _result(false, {}, "尚未加入公会")
				channel = "guild:" + str(account.guild)
			elif channel != "world": return _result(false, {}, "频道无效")
			var messages: Array = []
			for message in room.messages:
				if message.channel == channel: messages.append(message.duplicate(true))
			return _read(messages)
		"guild_create":
			if not str(account.guild).is_empty(): return _result(false, {}, "请先退出当前公会")
			var title = _clean(args.get("name", ""), 20)
			if title.is_empty(): return _result(false, {}, "公会名须为1–20字")
			for guild in room.guilds.values():
				if guild.name == title: return _result(false, {}, "公会名已存在")
			var guild_id = _next(room, "guild-")
			room.guilds[guild_id] = {"id": guild_id, "name": title, "owner": account_id, "members": [account_id], "capacity": 30}
			account.guild = guild_id
			return _result(true, room.guilds[guild_id].duplicate(true))
		"guild_join":
			var guild_id = str(args.get("guild_id", ""))
			if not str(account.guild).is_empty(): return _result(false, {}, "已经加入公会")
			if not room.guilds.has(guild_id): return _result(false, {}, "公会不存在")
			var guild: Dictionary = room.guilds[guild_id]
			if guild.members.size() >= int(guild.capacity): return _result(false, {}, "公会已满")
			guild.members.append(account_id)
			account.guild = guild_id
			return _result(true, guild.duplicate(true))
		"guild_leave":
			var guild_id = str(account.guild)
			if not room.guilds.has(guild_id): return _result(false, {}, "尚未加入公会")
			var guild: Dictionary = room.guilds[guild_id]
			if guild.owner == account_id and guild.members.size() > 1:
				var successor = str(args.get("successor_id", ""))
				if successor == account_id or not guild.members.has(successor): return _result(false, {}, "会长退出前须指定已有成员接任")
				guild.owner = successor
			guild.members.erase(account_id)
			account.guild = ""
			if guild.members.is_empty(): room.guilds.erase(guild_id)
			return _result(true)
		"guild_info":
			return _read(room.guilds.get(str(account.guild), {}).duplicate(true))
		"guild_list":
			return _read(room.guilds.values().duplicate(true))
		"rank_submit":
			var score: Variant = args.get("score", -1)
			if not (score is int or score is float) or not is_finite(float(score)) or float(score) < 0 or float(score) > 1000000000: return _result(false, {}, "分数无效")
			var board = str(args.get("board", "power"))
			if board not in ["power", "challenge"]: return _result(false, {}, "榜单无效")
			if not room.boards.has(board): room.boards[board] = {}
			room.boards[board][account_id] = {"account": account_id, "nickname": account.nickname, "score": int(score)}
			return _result(true, room.boards[board][account_id].duplicate(true))
		"rank_list":
			var board = str(args.get("board", "power"))
			var rows: Array = room.boards.get(board, {}).values().duplicate(true)
			rows.sort_custom(func(a, b): return a.score > b.score if a.score != b.score else a.account < b.account)
			for i in rows.size(): rows[i]["rank"] = i + 1
			return _read(rows)
		"payment_products": return _read(PRODUCTS.duplicate(true))
		"payment_create":
			var sku = str(args.get("sku", ""))
			var request = _clean(args.get("request_id", ""), 64)
			if not PRODUCTS.has(sku) or request.is_empty(): return _result(false, {}, "商品无效或缺少订单请求号")
			if account.requests.has(request):
				var old: Dictionary = account.orders[account.requests[request]]
				if old.sku != sku: return _result(false, {}, "请求号已用于其他商品")
				return _read(old.duplicate(true))
			var order_id = _next(room, "order-")
			var order = {"id": order_id, "sku": sku, "account": account_id, "realm": realm, "status": "pending", "price_label": PRODUCTS[sku].price_label, "rewards": PRODUCTS[sku].rewards.duplicate(true), "real_payment": false}
			account.orders[order_id] = order
			account.requests[request] = order_id
			return _result(true, order.duplicate(true))
		"payment_settle":
			var order_id = str(args.get("order_id", ""))
			var outcome = str(args.get("outcome", ""))
			if not account.orders.has(order_id): return _result(false, {}, "订单不存在或不属于此账号")
			if outcome not in ["paid", "cancelled", "failed"]: return _result(false, {}, "模拟回调状态无效")
			var order: Dictionary = account.orders[order_id]
			if order.status != "pending":
				if order.status != outcome: return _result(false, {}, "订单已结算，不可更改终态")
				return _read(order.duplicate(true))
			order.status = outcome
			if outcome == "paid": order["receipt_id"] = "mock:" + realm + ":" + account_id + ":" + order_id
			return _result(true, order.duplicate(true))
		"payment_receipts":
			var receipts: Array = []
			for order in account.orders.values():
				if order.status == "paid": receipts.append(order.duplicate(true))
			return _read(receipts)
		"payment_orders": return _read(account.orders.values().duplicate(true))
	return _result(false, {}, "未知模拟服务操作")
