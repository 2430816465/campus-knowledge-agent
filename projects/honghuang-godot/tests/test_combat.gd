extends SceneTree
const Combat = preload("res://scripts/game_combat.gd")
var checks: int = 0
var failed: int = 0
var errors: Array = []
var replay_results: Array = []
func _assert(ok: bool, context: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		errors.append(context)
		if failed < 24: printerr("FAIL ", context)
func _difference(a: Variant, z: Variant, path: String = "") -> String:
	if a is Dictionary and z is Dictionary:
		if a.size() != z.size():
			return "%s dictionary keys actual=%s expected=%s" % [path, str(a.keys()), str(z.keys())]
		for key: Variant in z:
			if not a.has(key): return path + "." + str(key) + " missing"
			var diff: String = _difference(a[key], z[key], path + "." + str(key))
			if not diff.is_empty(): return diff
		return ""
	if a is Array and z is Array:
		if a.size() != z.size(): return "%s length actual=%d expected=%d" % [path, a.size(), z.size()]
		for i: int in range(z.size()):
			var diff: String = _difference(a[i], z[i], path + "[%d]" % i)
			if not diff.is_empty(): return diff
		return ""
	if (a is float or a is int) and (z is float or z is int):
		if abs(float(a) - float(z)) <= 0.00000001: return ""
	elif typeof(a) == typeof(z) and a == z: return ""
	return "%s actual=%s expected=%s" % [path, JSON.stringify(a), JSON.stringify(z)]
func _check_equal(a: Variant, z: Variant, context: String) -> void:
	var diff: String = _difference(a, z)
	_assert(diff.is_empty(), context + " " + diff)
func _focus(b: Dictionary, id: String) -> void:
	var actor: Dictionary = GameData.named(b.units, id)
	b.order = [actor.uid]
	for u: Dictionary in b.units:
		if u.uid != actor.uid and u.hp > 0: b.order.append(u.uid)
	b.cursor = 0
func _initialize() -> void:
	var start: int = Time.get_ticks_msec()
	var fixture_data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/combat-reference.json"))
	_assert(fixture_data.fixtures.size() >= 293, "Reference fixture coverage")
	for f: Dictionary in fixture_data.fixtures:
		var input: Dictionary = f.input
		var created: Dictionary = Combat.create(int(input.stageId), input.team, input.options)
		_check_equal(created, f.created, f.name + " create")
		var b: Dictionary = f.initial.duplicate(true)
		var step_number: int = 0
		for step: Dictionary in f.steps:
			var output: Variant = null
			match step.kind:
				"auto":
					output = Combat.choose_auto_action(b)
					_assert(Combat.auto_act(b), f.name + " auto accepted")
				"act": output = Combat.act(b, step.data)
				"method": output = Combat.use_method(b)
				"actor": output = Combat.current_actor(b).get("uid")
				"combine": output = Combat.combine_availability(b)
				"focus": _focus(b, step.data)
				"set": GameData.named(b.units, step.data.id).merge(step.data.patch, true)
				"nextRound":
					b.cursor = b.order.size()
					output = Combat.current_actor(b).get("uid")
			_check_equal(output, step.output, "%s step %d %s" % [f.name, step_number, step.kind])
			step_number += 1
		_check_equal(b, f.expected, f.name + " complete state/events/log/stats/RNG")
		if f.name.begins_with("boss-") or f.name.begins_with("progression-"):
			_assert(b.result == "win", f.name + " authentic win")
			replay_results.append({"name":f.name, "stageId":b.stageId, "seed":b.seed, "result":b.result, "rounds":b.round, "actions":b.actionCount, "survivors":Combat.living(b,"ally").size(), "events":b.events.size()})
		for u: Dictionary in b.units:
			_assert(u.hp >= 0 and u.hp <= u.maxHp, f.name + " hp bounded " + u.uid)
			_assert(u.shield >= 0, f.name + " shield nonnegative " + u.uid)
	# Invalid boundary inputs remain clear errors, never partial initialized battles.
	_assert(Combat.create(99, [{"id":"nezha"}]).has("error"), "Unknown stage")
	_assert(Combat.create(1, []).has("error"), "Empty party")
	_assert(Combat.create(1, [{"id":"nezha"},{"id":"nezha"}]).has("error"), "Duplicate party")
	_assert(Combat.create(1, [{"id":"missing"}]).has("error"), "Unknown hero")
	_assert(Combat.create(1, [{"id":"nezha"}], {"ruleVersion":"old"}).has("error"), "Incompatible rule")
	_assert(Combat.create(1, [{"id":"nezha"}], {"boons":["missing"]}).has("error"), "Unknown boon")
	_assert(Combat.create(1, [{"id":"nezha"}], {"enemies":[]}).has("error"), "Empty enemies")
	_assert("clarity" not in Combat.get_legal_boons([{"id":"nezha"}]), "No unsupported cleansing boon")
	_assert("clarity" in Combat.get_legal_boons([{"id":"bigan"}]), "Supported cleansing boon")
	var report: Dictionary = {"engine":"Godot 4.6.3 native GDScript", "reference":"unmodified legacy-v03/src/battle.ts", "fixtures":fixture_data.fixtures.size(), "checks":checks, "failures":failed, "durationMs":Time.get_ticks_msec()-start, "errors":errors, "realProgressionAndBossWins":replay_results}
	var report_file: FileAccess = FileAccess.open("res://docs/combat/parity-report.json", FileAccess.WRITE)
	report_file.store_string(JSON.stringify(report, "  "))
	report_file.close()
	print("COMBAT_PARITY ", fixture_data.fixtures.size(), " fixtures / ", checks, " checks / ", failed, " failures / ", Time.get_ticks_msec()-start, " ms")
	quit(1 if failed else 0)
