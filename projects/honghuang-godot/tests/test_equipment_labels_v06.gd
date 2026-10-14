extends SceneTree

const SLOT_IDS := ["flower", "feather", "sands", "goblet", "circlet"]
const OLD_NAMES := ["灵花", "天羽", "时砂", "玄觞", "道冠"]
const NEW_NAMES := ["莲座", "羽毛", "铜铃", "葫芦", "宝冠"]
const MAIN_RULES := [
	{"hpFlat": 1},
	{"atkFlat": 1},
	{"hpPercent": 26, "atkPercent": 26, "defPercent": 26, "speedFlat": 22},
	{"hpPercent": 19, "atkPercent": 19, "defPercent": 19, "damageBonus": 43},
	{"hpPercent": 22, "atkPercent": 22, "defPercent": 22, "critRate": 10, "critDamage": 10, "healBonus": 14}
]
var checks: int = 0
var failures: Array[String] = []

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	_test_labels_and_slots()
	_test_old_equipment_reads()
	_test_saved_fixture()
	_test_random_sequence_unchanged()
	print("EQUIPMENT LABELS V06 CHECKS: %d, FAILURES: %d" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)

func _test_labels_and_slots() -> void:
	check(GameEquipment.slots().size() == 5, "five equipment slots remain")
	for i in range(SLOT_IDS.size()):
		var rule: Dictionary = GameEquipment.slots()[i]
		check(rule.id == SLOT_IDS[i], "slot ID and order remain " + SLOT_IDS[i])
		check(rule.name == NEW_NAMES[i], "plain slot label " + SLOT_IDS[i])
		check(rule.mainStats == MAIN_RULES[i], "main stats and weights remain " + SLOT_IDS[i])
		check(FileAccess.file_exists("res://assets/ui/%s.svg" % rule.id), "matching existing slot icon " + SLOT_IDS[i])
	check(GameEquipment.display_name({}) == "未装备", "empty equipment has a plain label")
	check(GameEquipment.display_name({"name": "历史道具", "slot": "unknown", "setId": "unknown"}) == "历史道具", "unknown historical item keeps its name")
	check(GameEquipment.display_name({"slot": "unknown"}) == "未命名装备", "incomplete inspection gets a readable fallback")

func _test_old_equipment_reads() -> void:
	var state: Dictionary = GameEconomy.create_state(1710000000000)
	GameEquipment.ensure_state(state)
	for i in range(SLOT_IDS.size()):
		var dropped: Dictionary = GameEquipment.grant_drop(state, {"rarity": 5, "slot": SLOT_IDS[i], "setId": "green-lotus"})
		check(dropped.name == "青莲生息·" + NEW_NAMES[i], "new item uses current plain label")
		var saved: Dictionary = GameEquipment.item(state, dropped.id)
		saved.name = "青莲生息·" + OLD_NAMES[i]
		var snapshot: String = JSON.stringify(state)
		for repeat in range(3):
			check(GameEquipment.display_name(saved) == "青莲生息·" + NEW_NAMES[i], "old item resolves the new display name")
			check(GameEquipment.describe_item(saved).begins_with("青莲生息·" + NEW_NAMES[i]), "details resolve old item name")
		var salvage: Dictionary = GameEquipment.salvage_preview(state, [saved.id])
		check(salvage.ok and salvage.data.names == ["青莲生息·" + NEW_NAMES[i]], "salvage confirmation resolves old item name")
		check(JSON.stringify(state) == snapshot, "all name reads preserve saved data, receipts, and RNG")
		check(saved.name == "青莲生息·" + OLD_NAMES[i], "old save name is not rewritten")
	check(GameEquipment.validate(state).is_empty(), "old names still satisfy the unchanged save validator")
	var before_names: String = JSON.stringify(state)
	GameEquipment.items(state, {}, "slot")
	check(JSON.stringify(state) == before_names, "bag queries leave historical names untouched")

func _test_saved_fixture() -> void:
	# This fixture came from V0.5 play, including upgraded items and settlement receipts.
	var envelope: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/estate-polish-state.json"))
	check(str(envelope.payload).sha256_text() == envelope.checksum, "historical fixture checksum is valid")
	var state: Dictionary = GameData.normalize(JSON.parse_string(envelope.payload))
	var snapshot: String = JSON.stringify(state)
	check(GameEquipment.validate(state).is_empty(), "historical real equipment validates before inspection")
	for artifact: Dictionary in state.equipment.items:
		var slot_index: int = SLOT_IDS.find(artifact.slot)
		check(slot_index >= 0, "historical item has the original slot ID")
		if slot_index >= 0:
			check(GameEquipment.display_name(artifact).ends_with("·" + NEW_NAMES[slot_index]), "historical item displays current slot label")
			check(not GameEquipment.describe_item(artifact).contains("·" + OLD_NAMES[slot_index]), "historical detail no longer shows obscure slot label")
	check(JSON.stringify(state) == snapshot, "inspecting a real save is byte-stable after normalization")
	check(GameEquipment.validate(state).is_empty(), "historical save remains valid after inspection")

func _rolled_equipment() -> Dictionary:
	var state: Dictionary = GameEconomy.create_state(1710000000010)
	GameEquipment.ensure_state(state)
	state.resources.stone = 50000
	state.items["relic-essence"] = 999
	for i in range(SLOT_IDS.size()):
		var dropped: Dictionary = GameEquipment.grant_drop(state, {"rarity": 5, "slot": SLOT_IDS[i], "setId": "void-slayer"})
		check(GameEquipment.command(state, "enhanceArtifact", {"id": dropped.id, "targetLevel": 4}).ok, "upgrade after renamed drop")
		check(GameEquipment.command(state, "equipArtifact", {"id": dropped.id, "characterId": "nezha"}).ok, "equip original slot ID")
	return state

func _test_random_sequence_unchanged() -> void:
	var current: Dictionary = _rolled_equipment()
	# Re-run the same seed with exactly the historical presentation labels.
	for i in range(SLOT_IDS.size()): GameEquipment.slots()[i].name = OLD_NAMES[i]
	var legacy: Dictionary = _rolled_equipment()
	for i in range(SLOT_IDS.size()): GameEquipment.slots()[i].name = NEW_NAMES[i]
	check(current.equipment.randomState == legacy.equipment.randomState, "labels consume no additional random rolls")
	check(GameEquipment.character_stats(current, "nezha") == GameEquipment.character_stats(legacy, "nezha"), "all combat stats unchanged")
	check(GameEquipment.character_power(current, "nezha") == GameEquipment.character_power(legacy, "nezha"), "power unchanged")
	check(GameEquipment.set_bonuses(current, "nezha") == GameEquipment.set_bonuses(legacy, "nezha"), "two and four-piece set effects unchanged")
	for artifact: Dictionary in current.equipment.items: artifact.name = ""
	for artifact: Dictionary in legacy.equipment.items: artifact.name = ""
	check(current == legacy, "renaming changes only item presentation names, with no schema, ID, value, or RNG changes")
