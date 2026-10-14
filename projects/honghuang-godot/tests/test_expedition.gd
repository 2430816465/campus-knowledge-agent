extends SceneTree
## Native rule-unit tests. Ticket fixtures exercise settlement validation;
## actual GameCombat integration is run separately when that module is loaded.
const X = preload("res://scripts/game_expedition.gd")
const D = preload("res://scripts/game_data.gd")
const C = preload("res://scripts/game_combat.gd")
var checks: int = 0
var failures: Array = []

func _initialize() -> void:
	run_all()
	print("EXPEDITION TESTS: %s checks, %s failures" % [checks, failures.size()])
	for failure in failures: push_error(str(failure))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, message: String) -> void:
	checks += 1
	if not condition: failures.append(message)

func _success(result: Dictionary, message: String = "command succeeds") -> Variant:
	_check(result.ok, "%s: %s" % [message, result.error])
	return result.data

func _fail(result: Dictionary, message: String) -> void:
	_check(not result.ok and not result.error.is_empty() and result.data == null, message)

func _same(a: Variant, b: Variant) -> bool:
	return JSON.parse_string(JSON.stringify(a)) == JSON.parse_string(JSON.stringify(b))

func _fixture() -> Dictionary:
	var owned: Dictionary = {}
	for id in ["nezha", "huangfeihu", "bigan", "taiyi", "yangjian", "xuandu"]:
		owned[id] = {"level": 12, "branch": "A", "treasure": 0}
	return {
		"mainBattle": null, "lastTime": 1780000000000, "cleared": [8, 12], "slots": 5,
		"owned": owned, "team": ["nezha", "huangfeihu", "bigan"], "branchUnlocks": [],
		"chosenMethod": "ward", "methods": ["ward", "cleanse"], "chosenPill": null, "items": {"ward": 3},
		"thunderProject": {"stage": "unstarted", "direction": null},
		"resources": {"stone": 100, "xp": 100, "material": 10, "herb": 10, "ticket": 2, "fate": 1},
		"randomStreams": {"summon": 11, "expedition": 123456, "battle": 789012},
		"daily": {"day": "2026-05-28", "progress": {"estate": 0, "battle": 0, "cultivation": 0}, "claimed": []},
		"expeditions": {"active": null, "settled": [], "firstCleared": [], "bossClears": [], "closed": []}
	}

func _battle(request: Dictionary, result: Variant = "win") -> Dictionary:
	# New admissions verify the complete engine replay, not a fabricated HP list.
	if request.options.get("autoOnly",false):
		var actual: Dictionary=GameCombat.create(int(request.stageId),request.team,request.options)
		if result==null: return actual
		var safety: int=0
		while actual.result==null and safety<5000:
			GameCombat.auto_act(actual)
			safety+=1
		return actual
	var units: Array = []
	for member in request.team:
		var unit: Dictionary = member.duplicate(true)
		unit.side = "ally"
		unit.hp = 100
		units.append(unit)
	for enemy in request.options.enemies:
		var unit: Dictionary = enemy.duplicate(true)
		unit.side = "enemy"
		unit.hp = 0 if result == "win" else enemy.hp
		units.append(unit)
	return {"id": request.battleId, "stageId": request.stageId, "seed": request.options.seed, "ruleVersion": request.options.ruleVersion, "trial": false, "method": request.options.get("method"), "pill": request.options.get("pill"), "boons": request.options.boons.duplicate(), "units": units, "result": result}

func _win_node(state: Dictionary) -> Dictionary:
	var request: Dictionary = _success(X.prepare_expedition_battle(state), "prepare node")
	var battle: Dictionary = _battle(request)
	_success(X.settle_expedition_battle(state, battle), "settle victory")
	_check(X.validate_expedition_ledger(state.expeditions, state) == "", "ledger valid after victory")
	return battle

func _complete(state: Dictionary, route_id: String, id: String) -> Dictionary:
	_success(X.command(state, "startExpedition", {"routeId": route_id, "options": {"id": id, "seed": 20261006}}))
	var candidates: Dictionary = state.expeditions.active.candidates.duplicate(true)
	var before: Dictionary = state.resources.duplicate()
	for node in [1, 3, 5]:
		_check(state.expeditions.active.node == node, "node progresses in route order")
		var battle: Dictionary = _win_node(state)
		var reward_count: int = state.expeditions.active.rewards.size()
		var daily_progress: int = state.daily.progress.battle
		var duplicate: Dictionary = _success(X.settle_expedition_battle(state, battle))
		_check(duplicate.duplicate and state.expeditions.active.rewards.size() == reward_count and state.daily.progress.battle == daily_progress, "node settlement is idempotent")
		if node < 5:
			var choices: Array = X.expedition_candidates(state)
			_check(choices.size() == 3, "three choices offered")
			_success(X.choose_boon(state, choices[0]))
			_check(X.validate_expedition_ledger(state.expeditions, state) == "", "ledger valid after boon")
	_check(state.resources == before, "pending node rewards not credited before close")
	_check(state.expeditions.active.candidates == candidates, "candidate snapshots never reroll")
	_check(state.expeditions.active.selectedBoons.size() == 2, "two distinct boons carried through")
	var summary: Dictionary = _success(X.close_expedition(state, id))
	_check(summary.complete and summary.first and not summary.duplicate, "first route clear tracked")
	_check(state.expeditions.bossClears.has(route_id) and state.expeditions.firstCleared.has(route_id), "boss and route progression recorded")
	_check(X.validate_expedition_ledger(state.expeditions, state) == "", "closed ledger validates")
	var after: Dictionary = state.resources.duplicate()
	_check(_success(X.close_expedition(state, id)).duplicate and state.resources == after, "close idempotent without active run")
	return summary

func run_all() -> void:
	_check(X.routes().size() == 2, "two routes")
	var state: Dictionary = _fixture()
	var dan: Dictionary = _complete(state, "danfire", "full-dan")
	_check(_same(dan.reward, {"stone": 390, "xp": 315, "material": 29, "herb": 18, "ticket": 0, "fate": 0}), "danfire exact full reward")
	var thunder: Dictionary = _complete(state, "thundermarsh", "full-thunder")
	_check(_same(thunder.reward, {"stone": 500, "xp": 390, "material": 38, "herb": 23, "ticket": 0, "fate": 0}), "thundermarsh exact full reward")
	_check(state.daily.progress.battle == 6, "daily battle progress per completed node")
	_test_replay_and_pills()
	_test_failures_and_early_exit()
	_test_strict_tickets()
	_test_unlocks_and_legal_boons()
	_test_seeds_and_old_rules()
	_test_validation()
	_test_resource_cap_and_repeat_clear()
	_test_real_combat()
	_test_real_failure_replay()

func _test_replay_and_pills() -> void:
	var state: Dictionary = _fixture()
	state.chosenPill = "ward"
	_success(X.start_expedition(state, "danfire", {"id": "fixed", "seed": 18}))
	var locked: Dictionary = state.expeditions.active.snapshot.duplicate(true)
	state.owned.bigan.level = 20
	state.owned.bigan.branch = "B"
	state.team = ["yangjian"]
	state.chosenMethod = "cleanse"
	var request: Dictionary = _success(X.prepare_expedition_battle(state))
	_check(request.team == locked.team and request.options.method == locked.method, "loadout snapshot independent from outside changes")
	_check(state.items.ward == 2, "first preparation charges exactly one pill")
	var restored: Dictionary = JSON.parse_string(JSON.stringify(state))
	var replay: Dictionary = _success(X.prepare_expedition_battle(restored))
	_check(_same(replay, request) and restored.items.ward == 2, "JSON reload resumes exact ticket without pill charge")
	_success(X.settle_expedition_battle(restored, _battle(replay)))
	_success(X.choose_boon(restored, X.expedition_candidates(restored)[0]))
	_success(X.prepare_expedition_battle(restored))
	_check(restored.items.ward == 1, "new node consumes new pill")
	_check(_same(restored.expeditions.active.snapshot, locked), "snapshot persists across JSON and node transitions")
	var copy: Dictionary = restored.duplicate(true)
	_success(X.close_expedition(copy))
	_check(copy.items.ward == 1, "exit never refunds effective pills")

func _test_failures_and_early_exit() -> void:
	var state: Dictionary = _fixture()
	state.chosenPill = "ward"
	state.items.ward = 1
	for member in state.owned.values(): member.level=1
	state.team=["nezha"]
	_success(X.start_expedition(state, "danfire", {"id": "lose", "seed": 999}))
	var before: Dictionary = state.resources.duplicate()
	var request: Dictionary = _success(X.prepare_expedition_battle(state))
	_check(state.chosenPill == null and state.items.ward == 0, "empty selected pill is cleared")
	var loss: Dictionary = _success(X.settle_expedition_battle(state, _battle(request, "lose")))
	_check(not loss.won and state.expeditions.active.status == "failed", "loss leaves retryable failed node")
	_check(_success(X.prepare_expedition_battle(state)) == request and state.items.ward == 0, "loss retry locks ticket and does not repay pill")
	_success(X.settle_expedition_battle(state, _battle(request, "lose")))
	var closed: Dictionary = _success(X.close_expedition(state))
	_check(not closed.complete and closed.reward.stone == 0 and state.resources == before and state.items.ward == 0, "failed exit earns no reward or pill refund")
	for member in state.owned.values(): member.level=12
	state.team=["nezha","huangfeihu","bigan"]
	_success(X.start_expedition(state, "danfire", {"id": "early", "seed": 111}))
	_win_node(state)
	closed = _success(X.close_expedition(state, "early"))
	_check(not closed.complete and not closed.first and closed.reward.stone == 25 and closed.reward.material == 2, "early exit gets only completed node")
	_check(state.expeditions.bossClears.is_empty() and state.expeditions.firstCleared.is_empty(), "early exit grants no progression")
	_fail(X.start_expedition(state, "danfire", {"id": "early", "seed": 1}), "settled run id cannot be reused")
	state.chosenPill = "ward"
	state.items.ward = 1
	_success(X.start_expedition(state, "danfire", {"id": "need-pill", "seed": 1}))
	_win_node(state)
	_success(X.choose_boon(state, X.expedition_candidates(state)[0]))
	_fail(X.prepare_expedition_battle(state), "second node blocks without locked pill")
	state.items.ward = 1
	_success(X.prepare_expedition_battle(state))
	_check(state.items.ward == 0, "replenishing same pill permits next node")

func _test_strict_tickets() -> void:
	var state: Dictionary = _fixture()
	_success(X.start_expedition(state, "danfire", {"id": "strict", "seed": 11}))
	var request: Dictionary = _success(X.prepare_expedition_battle(state))
	var battle: Dictionary = _battle(request)
	for patch in [{"id": "unrelated"}, {"stageId": 12}, {"seed": 42}, {"ruleVersion": "forged"}, {"trial": true}, {"method": "break"}, {"pill": "heal"}, {"boons": ["clarity"]}, {"result": null}]:
		var forged: Dictionary = battle.duplicate(true)
		for key in patch: forged[key] = patch[key]
		_fail(X.settle_expedition_battle(state, forged), "reject mismatched ticket %s" % patch)
	for key in ["id", "level", "branch", "treasure", "branchUnlocked"]:
		var forged: Dictionary = battle.duplicate(true)
		forged.units[0][key] = "bogus" if key in ["id", "branch"] else 1 if key == "treasure" else false if key == "branchUnlocked" else 0
		_fail(X.settle_expedition_battle(state, forged), "reject changed ally %s" % key)
	var forged: Dictionary = battle.duplicate(true)
	forged.units[-1].id = "mainline-enemy"
	_fail(X.settle_expedition_battle(state, forged), "mainline enemy roster cannot claim expedition")
	forged = battle.duplicate(true)
	forged.units[-1].hp = 1
	_fail(X.settle_expedition_battle(state, forged), "living boss cannot claim victory")
	forged = battle.duplicate(true)
	forged.units.reverse()
	_fail(X.settle_expedition_battle(state, forged), "unit ordering is part of locked snapshot")
	_check(state.expeditions.active.rewards.is_empty(), "all forged settlements grant no rewards")
	_success(X.settle_expedition_battle(state, battle))
	_fail(X.choose_boon(state, "nonexistent"), "cannot choose unavailable boon")
	_success(X.choose_boon(state, X.expedition_candidates(state)[0]))
	_fail(X.choose_boon(state, state.expeditions.active.selectedBoons[0]), "cannot choose boon twice or outside choice")

func _test_unlocks_and_legal_boons() -> void:
	var state: Dictionary = _fixture()
	state.cleared = []
	_check(not X.is_route_unlocked(state, "danfire") and not X.is_route_unlocked(state, "thundermarsh"), "route locked without mainline 8/12")
	_fail(X.start_expedition(state, "danfire"), "unopened route cannot start")
	_fail(X.start_expedition(state, "unknown"), "unknown route rejected")
	state.cleared = [8]
	_check(X.is_route_unlocked(state, "danfire") and not X.is_route_unlocked(state, "thundermarsh"), "route unlock independent")
	state.mainBattle = {"id": "main"}
	_fail(X.start_expedition(state, "danfire"), "main battle and expedition mutually exclusive")
	state.mainBattle = null
	state.chosenMethod = "thunderward"
	state.methods.append("thunderward")
	_fail(X.start_expedition(state, "danfire"), "disabled project method rejected")
	state.thunderProject.direction = "teaching"
	_success(X.start_expedition(state, "danfire", {"id": "teaching", "seed": 1}))
	_fail(X.start_expedition(state, "danfire"), "only one active route")
	# A saved route at a non-combat node must not bypass later battle locks.
	for blocker: String in ["mainBattle", "characterChallenges", "progression"]:
		var locked: Dictionary = state.duplicate(true)
		if blocker == "mainBattle": locked.mainBattle = {"id":"other-main"}
		elif blocker == "characterChallenges": locked.characterChallenges = {"active":{"id":"other-hero"}}
		else: locked.progression = {"realm":{"pending":{"id":"other-realm"}}}
		var before: String = JSON.stringify(locked)
		_fail(X.prepare_expedition_battle(locked), "late expedition admission rejects " + blocker)
		_check(JSON.stringify(locked) == before, "blocked admission preserves pill, snapshot and resources " + blocker)
	for team in [[{"id": "nezha", "treasure": 0}], [{"id": "bigan", "treasure": 0}], [{"id": "taiyi", "treasure": 0}], [{"id": "xuandu", "treasure": 1}]]:
		var legal: Array = X.legal_boons(team)
		_check(legal.has("clarity") == (team[0].id != "nezha"), "clarity requires actual cleansing capability")
	_check(X.legal_boons([{"id": "nezha", "treasure": 0}], "cleanse").has("clarity"), "cleanse method unlocks clarity")
	_check(not X.legal_boons([{"id": "xuandu", "treasure": 0}]).has("clarity"), "xuandu needs restored treasure")

func _test_seeds_and_old_rules() -> void:
	var golden: Array = JSON.parse_string("""[{"seed":0,"candidates":{"first":["clarity","victory","initiative"],"secondByFirst":{"clarity":["victory","shade","initiative"],"victory":["barrier","solidarity","shade"],"initiative":["victory","clarity","shade"]}},"seeds":{"1":3969620119,"3":1857019187,"5":876020055}},{"seed":1,"candidates":{"first":["clarity","victory","initiative"],"secondByFirst":{"clarity":["victory","shade","initiative"],"victory":["barrier","solidarity","shade"],"initiative":["victory","clarity","shade"]}},"seeds":{"1":3969890486,"3":1789385522,"5":2851842450}},{"seed":91,"candidates":{"first":["victory","solidarity","initiative"],"secondByFirst":{"victory":["clarity","barrier","initiative"],"solidarity":["shade","victory","clarity"],"initiative":["solidarity","barrier","victory"]}},"seeds":{"1":3992777481,"3":2142759,"5":3673127861}},{"seed":20261006,"candidates":{"first":["victory","solidarity","shade"],"secondByFirst":{"victory":["barrier","shade","solidarity"],"solidarity":["shade","clarity","barrier"],"shade":["solidarity","clarity","barrier"]}},"seeds":{"1":3425202571,"3":2167890023,"5":3394070970}},{"seed":4294967295,"candidates":{"first":["clarity","solidarity","shade"],"secondByFirst":{"clarity":["solidarity","initiative","barrier"],"solidarity":["initiative","barrier","shade"],"shade":["solidarity","victory","barrier"]}},"seeds":{"1":3969415304,"3":2460491980,"5":1082956052}}]""")
	# Golden values generated by the untouched TypeScript startExpedition.
	for expected in golden:
		var actual_state: Dictionary = _fixture()
		var actual: Dictionary = _success(X.start_expedition(actual_state, "danfire", {"id": "golden", "seed": expected.seed}))
		_check(_same(actual.candidates, expected.candidates), "exact TS candidate shuffle parity %s" % expected.seed)
		_check(_same(actual.seeds, expected.seeds), "exact TS battle stream parity %s" % expected.seed)
	for seed in [0, 1, 91, 20261006, 4294967295]:
		var a: Dictionary = _fixture()
		var b: Dictionary = _fixture()
		_success(X.start_expedition(a, "danfire", {"id": "a", "seed": seed}))
		_success(X.start_expedition(b, "danfire", {"id": "b", "seed": seed}))
		_check(a.expeditions.active.seeds == b.expeditions.active.seeds and a.expeditions.active.candidates == b.expeditions.active.candidates, "explicit seeds reproduce choices and battles %s" % seed)
		_check(a.randomStreams == _fixture().randomStreams, "explicit seed leaves gameplay streams unchanged")
		_check(X.validate_expedition_ledger(a.expeditions, a) == "", "seeded ledger valid")
	var state: Dictionary = _fixture()
	var other: Dictionary = _fixture()
	_success(X.start_expedition(state, "danfire", {"id": "stream-a"}))
	_success(X.start_expedition(other, "danfire", {"id": "stream-b"}))
	_check(state.expeditions.active.seeds == other.expeditions.active.seeds and state.expeditions.active.candidates == other.expeditions.active.candidates, "unseeded starts use persisted deterministic streams")
	_check(state.randomStreams.summon == 11 and state.randomStreams.battle != 789012 and state.randomStreams.expedition != 123456, "only expedition and battle streams advance")
	_win_node(state)
	state.expeditions.active.ruleVersion = "v0.1.legacy"
	state = JSON.parse_string(JSON.stringify(state))
	_check(X.validate_expedition_ledger(state.expeditions, state) == "", "old version remains structurally valid and exportable")
	_check(not X.expedition_compatibility(state).compatible, "old version incompatible for new play")
	_fail(X.choose_boon(state, X.expedition_candidates(state)[0]), "old version cannot choose new boon")
	_fail(X.prepare_expedition_battle(state), "old version cannot prepare next battle")
	var closed: Dictionary = _success(X.close_expedition(state, "stream-a", "旧规则安全退出"))
	_check(closed.reward.stone == 25 and not closed.complete and not closed.first, "old version closes earned reward only")

func _test_validation() -> void:
	var state: Dictionary = _fixture()
	_success(X.start_expedition(state, "danfire", {"id": "validate", "seed": 91}))
	var ledger: Dictionary = state.expeditions.duplicate(true)
	_check(X.validate_expedition_ledger(ledger, state) == "", "baseline snapshot valid")
	for malformed in [null, [], {}, {"settled": []}, {"settled": [], "firstCleared": [], "bossClears": [], "closed": [], "active": 3}]:
		_check(not X.validate_expedition_ledger(malformed, state).is_empty(), "malformed ledger rejected safely")
	for field in ["id", "routeId", "createdAt", "ruleVersion", "node", "status", "snapshot", "encounters", "seeds", "candidates", "selectedBoons", "startedBattles", "completedBattles", "rewards", "completionReward", "firstReward"]:
		var bad: Dictionary = ledger.duplicate(true)
		bad.active.erase(field)
		_check(not X.validate_expedition_ledger(bad, state).is_empty(), "missing run field rejected %s" % field)
	var bad: Dictionary = ledger.duplicate(true)
	bad.active.candidates.secondByFirst[bad.active.candidates.first[0]] = [bad.active.candidates.first[0], "guard", "guard"]
	_check(not X.validate_expedition_ledger(bad, state).is_empty(), "second choices reject duplicate or first boon")
	bad = ledger.duplicate(true)
	bad.active.nodeRewards["1"].ticket = 1
	_check(not X.validate_expedition_ledger(bad, state).is_empty(), "snapshotted rewards cannot mint tickets")
	bad = ledger.duplicate(true)
	bad.active.erase("nodeRewards")
	_check(X.validate_expedition_ledger(bad, state) == "", "legacy snapshot without optional nodeRewards valid")
	bad = ledger.duplicate(true)
	bad.firstCleared = ["danfire"]
	_check(not X.validate_expedition_ledger(bad, state).is_empty(), "first clear requires boss record")
	for seed in [-1, 1.5, 4294967296, "91"]:
		_fail(X.start_expedition(_fixture(), "danfire", {"id": "invalid-seed", "seed": seed}), "invalid seed rejected")
	_fail(X.command(state, "unknown"), "unknown command returns error")

func _test_resource_cap_and_repeat_clear() -> void:
	var state: Dictionary = _fixture()
	state.expeditions.bossClears = ["danfire"]
	state.expeditions.firstCleared = ["danfire"]
	_success(X.start_expedition(state, "danfire", {"id": "repeat", "seed": 7}))
	for node in [1, 3, 5]:
		_win_node(state)
		if node < 5: _success(X.choose_boon(state, X.expedition_candidates(state)[0]))
	var caps: Dictionary = D.economy("ECONOMY").resourceCaps
	state.resources = caps.duplicate()
	var summary: Dictionary = _success(X.close_expedition(state))
	_check(summary.complete and not summary.first and summary.reward.stone == 310, "repeat complete clear omits first reward")
	_check(_same(state.resources, caps), "credit respects resource caps")
	_check(state.expeditions.bossClears.size() == 1 and state.expeditions.firstCleared.size() == 1, "progression ledger de-duplicates routes")

func _test_real_combat() -> void:
	var battles: int = 0
	for gift in ["yangjian", "zhaogongming", "yunxiao"]:
		for route_id in ["danfire", "thundermarsh"]:
			var state: Dictionary = _fixture()
			state.team = ["nezha", "huangfeihu", "bigan", gift]
			for id in state.team:
				state.owned[id] = {"level": 11, "branch": "B" if id == "bigan" else "A", "treasure": 1}
			var run_id: String = "real-%s-%s" % [gift, route_id]
			_success(X.start_expedition(state, route_id, {"id": run_id, "seed": 20261006}))
			for node in [1, 3, 5]:
				var request: Dictionary = _success(X.prepare_expedition_battle(state))
				var battle: Dictionary = C.create(int(request.stageId), request.team, request.options)
				_check(not battle.has("error"), "native combat accepts prepared expedition request")
				if battle.has("error"): return
				for ally in battle.units:
					if ally.side == "ally": _check(ally.hp == ally.maxHp and ally.cd == 0, "new node resets HP and cooldown")
				_check(battle.boons == state.expeditions.active.selectedBoons, "native combat receives carried boons")
				var steps: int = 0
				while battle.result == null and steps < 1000:
					if C.current_actor(battle).get("side") == "ally" and not battle.methodUses and battle.method != null and battle.round >= 2: C.use_method(battle)
					var advanced: bool = C.auto_act(battle)
					if not advanced:
						_check(false, "native expedition battle can advance")
						return
					steps += 1
				_check(battle.result == "win", "real %s/%s node %s wins at level 11" % [gift, route_id, node])
				if battle.result != "win": return
				_success(X.settle_expedition_battle(state, battle), "real native combat ticket settles")
				_check(X.validate_expedition_ledger(state.expeditions, state) == "", "real victory ledger validates")
				battles += 1
				if node < 5: _success(X.choose_boon(state, X.expedition_candidates(state)[0]))
				# Simulate a persisted reload between every combat node and choice.
				state = JSON.parse_string(JSON.stringify(state))
			var summary: Dictionary = _success(X.close_expedition(state, run_id))
			_check(summary.complete and summary.first, "real route settles completion and first-clear rewards")
	_check(battles == 18, "18 real expedition battles across two routes and three gift teams")

func _test_real_failure_replay() -> void:
	var state: Dictionary = _fixture()
	state.team = ["nezha"]
	state.owned.nezha = {"level": 1, "branch": "A", "treasure": 0}
	state.chosenPill = "ward"
	state.items.ward = 1
	_success(X.start_expedition(state, "danfire", {"id": "real-loss", "seed": 999}))
	var original: Dictionary = {}
	for attempt in range(2):
		var request: Dictionary = _success(X.prepare_expedition_battle(state))
		var battle: Dictionary = C.create(int(request.stageId), request.team, request.options)
		var steps: int = 0
		while battle.result == null and steps < 1000:
			var moved: bool = C.auto_act(battle)
			if not moved:
				_check(false, "native losing battle continues legally")
				return
			steps += 1
		_check(battle.result == "lose", "weak automatic team genuinely loses")
		var result: Dictionary = _success(X.settle_expedition_battle(state, battle))
		_check(not result.won and state.expeditions.active.status == "failed", "real loss leaves failed expedition")
		_check(state.items.ward == 0, "real replay does not spend another pill")
		if attempt == 0: original = battle.duplicate(true)
		else: _check(battle.actionCount == original.actionCount and _same(battle.units, original.units), "real retry exactly reproduces terminal units and action count")
		state = JSON.parse_string(JSON.stringify(state))
	var closed: Dictionary = _success(X.close_expedition(state))
	_check(closed.reward == X.empty_resources() and not closed.complete, "real failed route settles no rewards")
