extends SceneTree
const Combat = preload("res://scripts/game_combat.gd")
var checks: int = 0
var failures: Array = []
var results: Array = []
func _assert(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)
		if failures.size() < 30: printerr("FAIL ", message)
func _team(ids: Array, level: int = 5, treasure: int = 0, branch: String = "A") -> Array:
	return ids.map(func(id: String) -> Dictionary: return {"id":id,"level":level,"treasure":treasure,"branch":branch})
func _focus(b: Dictionary, id: String) -> Dictionary:
	var actor: Dictionary = GameData.named(b.units, id)
	b.order = [actor.uid]
	for u: Dictionary in b.units:
		if u.hp > 0 and u.uid != actor.uid: b.order.append(u.uid)
	b.cursor = 0
	return actor
func _fixture(id: String, level: int = 5, treasure: int = 0, branch: String = "A") -> Dictionary:
	var ids: Array = [id, "bigan" if id != "bigan" else "taiyi", "huangfeihu" if id != "huangfeihu" else "nezha"]
	var enemies: Array = [
		{"id":"front","name":"前阵陪练","role":"soldier","row":"front","hp":50000,"atk":80,"def":20,"speed":20},
		{"id":"back","name":"后阵陪练","role":"archer","row":"back","hp":50000,"atk":100,"def":20,"speed":18}]
	var b: Dictionary = Combat.create(12, _team(ids,level,treasure,branch), {"enemies":enemies,"seed":163,"battleId":"fixture"})
	_focus(b,id)
	for u: Dictionary in b.units:
		u.formation = 2
		u.morale = 2
		if u.side == "ally":
			u.hp = int(u.maxHp * .3)
			u.statuses.append({"id":"burn","name":"灼烧","turns":2,"power":8})
		else:
			u.hp = 15000
			u.charge = 2
			u.shield = 1000
			u.statuses.append({"id":"weakened","name":"削弱","turns":2,"power":.2})
			u.statuses.append({"id":"guard","name":"护持","turns":2,"power":.2})
			u.statuses.append({"id":"atkUp","name":"战令","turns":2,"power":.2})
	if id == "xuandu": b.units[1].statuses.append({"id":"atkUp","name":"战令","turns":2,"power":.2})
	return b
func _cast(b: Dictionary) -> bool:
	var u: Dictionary = Combat.current_actor(b)
	var source: String = b.units[1].uid if u.id == "xuandu" else ""
	var action: Dictionary = {"kind":"skill","targetId":Combat.legal_targets(b,"skill",source)[0]}
	if not source.is_empty(): action.sourceId = source
	return Combat.act(b,action)
func _signature(b: Dictionary) -> String:
	var units: Array = []
	for u: Dictionary in b.units: units.append({"hp":u.hp,"shield":u.shield,"statuses":u.statuses,"cd":u.cd,"formation":u.formation,"morale":u.morale,"charge":u.charge,"will":u.will})
	return JSON.stringify({"units":units,"stats":b.stats})
func _initialize() -> void:
	var start: int = Time.get_ticks_msec()
	var chars: Array = GameData.content("CHARACTERS")
	_assert(chars.size() == 50,"Exactly 50 playable unique characters")
	_assert(GameData.character("tongtian").stars == 5,"Tongtian highest rarity")
	var ids: Dictionary = {}
	var new_signatures: Dictionary = {}
	for c: Dictionary in chars:
		_assert(not ids.has(c.id),c.id+" unique ID")
		ids[c.id]=true
		_assert(c.stars in [3,4,5],c.id+" rarity 3/4/5")
		_assert(c.branches.size()==2 and not c.skillDescription.is_empty() and not c.passiveDescription.is_empty() and not c.treasureEffect.is_empty(),c.id+" complete descriptions")
		for branch: String in ["A","B"]:
			for treasure: int in [0,1,3]:
				var b: Dictionary = _fixture(c.id,5,treasure,branch)
				_assert(_cast(b),"Skill resolves "+c.id+branch+str(treasure))
				_assert(b.actionCount==1,"Skill costs one action "+c.id)
				_assert(b.events.any(func(e:Dictionary)->bool:return e.type=="skill" and e.actorUid==b.units[0].uid),"Real skill event "+c.id)
				for u:Dictionary in b.units: _assert(u.hp>=0 and u.hp<=u.maxHp and u.shield>=0,"Bounds "+c.id)
		var pre_a: Dictionary = _fixture(c.id,1,0,"A")
		var pre_b: Dictionary = _fixture(c.id,1,0,"B")
		_cast(pre_a); _cast(pre_b)
		_assert(_signature(pre_a)==_signature(pre_b),"Branch stays closed before level3 "+c.id)
		var open_a: Dictionary = _fixture(c.id,3,0,"A")
		var open_b: Dictionary = _fixture(c.id,3,0,"B")
		_cast(open_a); _cast(open_b)
		_assert(_signature(open_a)!=_signature(open_b),"A/B actual outcome differs "+c.id)
		if c.has("combat"):
			var signature: String=JSON.stringify(c.combat)
			_assert(not new_signatures.has(signature),"Unique full ability config "+c.id)
			new_signatures[signature]=true
			var passive:Dictionary=c.combat.passive
			var b: Dictionary=_fixture(c.id)
			var actor: Dictionary=b.units[0]
			match passive.trigger:
				"roundStart": b.cursor=b.order.size(); Combat.current_actor(b)
				"onActionEnd":
					match passive.condition:
						"skillOnly": _cast(b)
						"guardOnly": Combat.act(b,{"kind":"guard","targetId":actor.uid})
						_: Combat.act(b,{"kind":"attack"})
				"onHit", "onKill":
					var target:Dictionary=Combat.front_targets(b,actor)[0]
					target.statuses.append({"id":"mark","name":"锁定","turns":2,"power":.15})
					if passive.trigger=="onKill":target.hp=1;target.shield=0
					Combat.act(b,{"kind":"attack","targetId":target.uid})
				"onDamaged","onAllyDamaged":
					# Make the new hero the actual front-row target, keep it alive through the hit.
					actor.hp=int(actor.maxHp*.3)
					b.units[1].hp=int(b.units[1].maxHp*.8)
					var enemy:Dictionary=_focus(b,"front")
					enemy.charge=0
					Combat.act(b,{"kind":"attack"})
			_assert(b.stats[actor.uid].triggers.get("passive:"+c.id,0)==1,"Passive actually triggers "+c.id+" "+passive.trigger)
			_assert(b.events.any(func(e:Dictionary)->bool:return e.get("triggerId")=="passive:"+c.id),"Attributed passive event "+c.id)
			# Repeating the eligible hook through actual normal actions cannot exceed its round cap.
			var count: int=int(b.stats[actor.uid].triggers.get("passive:"+c.id,0))
			_assert(count<=int(passive.limit),"Passive per-round cap "+c.id)
		for template: Dictionary in GameData.content("TRIAL_TEMPLATES"):
			var trial_ids: Array=[c.id]
			for other: String in template.defaultTeam:
				if other!=c.id and trial_ids.size()<5:trial_ids.append(other)
			var trial:Dictionary=Combat.create(template.stageId,_team(trial_ids,template.level,template.treasure),{"trial":true,"enemies":template.enemies,"method":"ward","seed":173})
			var safety:int=0
			while trial.result==null and safety<1000:
				if Combat.current_actor(trial).get("side")=="ally" and trial.methodUses==0:Combat.use_method(trial)
				_assert(Combat.auto_act(trial),"Trial legal action "+c.id)
				safety+=1
			_assert(trial.result=="win","Trial actual win "+c.id+" / "+template.id)
			results.append({"hero":c.id,"template":template.id,"result":trial.result,"actions":trial.actionCount,"rounds":trial.round,"events":trial.events.size()})
	# Equipment modifies actual stats, damage, healing, deterministic critical events.
	var member:Dictionary={"id":"yangjian","level":5,"branch":"A","treasure":1,"equipmentStats":{"hpFlat":200,"hpPercent":.2,"atkFlat":30,"atkPercent":.2,"defFlat":10,"defPercent":.1,"speedFlat":5,"critRate":1.0,"critDamage":.5,"damageBonus":.2,"healBonus":.2}}
	var plain:Dictionary=member.duplicate(true);plain.erase("equipmentStats")
	var base:Dictionary=Combat.member_stats(plain)
	var enhanced:Dictionary=Combat.member_stats(member)
	_assert(enhanced.maxHp==int(round(base.maxHp*1.2+200)),"Equipment HP exact formula")
	_assert(enhanced.atk==int(round(base.atk*1.2+30)),"Equipment ATK exact formula")
	_assert(enhanced.def==int(round(base.def*1.1+10)),"Equipment DEF exact formula")
	_assert(enhanced.critRate==1.0 and enhanced.critDamage==1.0,"Equipment critical total")
	var fight:Dictionary=Combat.create(12,[member],{"seed":777})
	_focus(fight,"yangjian");Combat.act(fight,{"kind":"attack"})
	_assert(fight.units[0].maxHp==enhanced.maxHp and fight.units[0].atk==enhanced.atk,"Equipment snapshot used by combat")
	_assert(fight.events.any(func(e:Dictionary)->bool:return e.get("critical",false)),"Guaranteed critical is actual event")
	var repeat:Dictionary=Combat.create(12,[member],{"seed":777})
	_focus(repeat,"yangjian");Combat.act(repeat,{"kind":"attack"})
	_assert(JSON.stringify(fight.units)==JSON.stringify(repeat.units) and fight.rng==repeat.rng,"Equipment critical seeded deterministic")
	var report:Dictionary={"characters":chars.size(),"expansionCharacters":new_signatures.size(),"checks":checks,"failures":failures,"trialBattles":results,"durationMs":Time.get_ticks_msec()-start}
	var output:FileAccess=FileAccess.open("res://docs/combat/expansion-report.json",FileAccess.WRITE);output.store_string(JSON.stringify(report,"  "));output.close()
	print("COMBAT_EXPANSION ",chars.size()," heroes / ",checks," checks / ",failures.size()," failures / ",results.size()," actual trials")
	quit(0 if failures.is_empty() else 1)
