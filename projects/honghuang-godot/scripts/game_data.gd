class_name GameData
extends RefCounted
static var _cache: Dictionary = {}
static func all() -> Dictionary:
	if _cache.is_empty():
		_cache = normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/game-data.json")))
		for hero in _cache.get("content", {}).get("CHARACTERS", []):
			if not hero.has("stars"): hero["stars"] = 5 if hero.get("rarity") == "divine" else 4
		if FileAccess.file_exists("res://data/roster-expansion.json"):
			var expansion: Variant = normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/roster-expansion.json")))
			if expansion is Dictionary:
				var ids: Dictionary = {}
				for hero in _cache.content.CHARACTERS: ids[hero.id] = true
				for hero in expansion.get("characters", []):
					if not ids.has(hero.id):
						_cache.content.CHARACTERS.append(hero)
						ids[hero.id] = true
		var guide_data: Variant = normalize(JSON.parse_string(FileAccess.get_file_as_string("res://data/roster-guides.json")))
		if guide_data is Dictionary:
			for id in guide_data.get("guides", {}):
				_cache.content.CHARACTER_GUIDES[id] = guide_data.guides[id]
	return _cache
static func content(key: String, fallback: Variant = null) -> Variant:
	return all().get("content", {}).get(key, fallback)
static func economy(key: String, fallback: Variant = null) -> Variant:
	return all().get("economy", {}).get(key, fallback)
static func expedition(key: String, fallback: Variant = null) -> Variant:
	return all().get("expedition", {}).get(key, fallback)
static func character(id: String) -> Dictionary:
	if id == "palace-lord":
		var lord: Dictionary = character("yangjian").duplicate(true)
		lord.merge({"id":"palace-lord","name":"府主","faction":"仙府","rarity":"mortal","hp":520,"atk":90,"def":30,"speed":100,"attackName":"御气","skillName":"府主道法","skillDescription":"对敌人施展本命道法。","passiveDescription":"府主装备与修炼方向独立生效。","portraitIndex":0},true)
		return lord
	for item in content("CHARACTERS", []):
		if item.id == id: return item
	return {}
static func stage(id: int) -> Dictionary:
	for item in content("STAGES", []):
		if int(item.id) == id: return item
	return {}
static func named(items: Array, id: Variant) -> Dictionary:
	for item in items:
		if item.get("id") == id: return item
	return {}
static func now_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000)

static func normalize(value: Variant) -> Variant:
	if value is float and is_finite(value) and value == floor(value) and abs(value) <= 9007199254740991:
		return int(value)
	if value is Array:
		var result: Array = []
		for item in value: result.append(normalize(item))
		return result
	if value is Dictionary:
		var result: Dictionary = {}
		for key in value: result[key] = normalize(value[key])
		return result
	return value
