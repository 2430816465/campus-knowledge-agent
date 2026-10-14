class_name GameChallenges
extends RefCounted
## Reward claims are independent from validated combat. No score/power victory proxy.
static func ensure(s: Dictionary) -> void:
	var c: Dictionary = s.framework.challenges
	if c.is_empty():
		c.merge({"seq":0,"pending":null,"completed":{},"claimed":{},"materialCharges":{},"materialUnlocks":{},"dayIndex":_day_index(s.lastTime),"stamina":120,"staminaAt":s.lastTime,"week":GameFramework.week(s.lastTime),"towerHistory":0,"towerFloor":1,"towerWeekly":[],"towerFirst":[],"beastDay":GameFramework.day(s.lastTime),"beastBest":0,"beastChests":[],"mountain":null,"mountainMajor":{},"mountainRepeat":{},"ads":{},"lastParty":{}})
		for type in GameFramework.rules().materials: c.materialCharges[type.id] = int(GameFramework.rules().materialDaily)
	if not c.has("towerPeriods"): c.towerPeriods = {c.week:c.towerWeekly.duplicate()}
	if not c.has("beastHistory"): c.beastHistory = {c.beastDay:{"best":c.beastBest,"chests":c.beastChests.duplicate()}}
static func _mail(s: Dictionary, id: String, reward: Dictionary) -> void:
	if GameData.named(s.framework.mail,id).is_empty(): s.framework.mail.append({"id":id,"reward":reward.duplicate(),"claimed":false})
static func _reward(s: Dictionary, reward: Dictionary, id: String) -> void:
	if GameEconomy.refund_room(s,reward): GameEconomy.gain(s,reward)
	else: _mail(s,"overflow:"+id,reward)
static func _beast_recovery(s: Dictionary) -> void:
	var c: Dictionary = s.framework.challenges
	for date in c.beastHistory:
		if date >= c.beastDay: continue
		var r: Dictionary = c.beastHistory[date]
		for threshold in [1000,5000,10000]:
			if int(r.best) >= threshold and not threshold in r.chests:
				_mail(s,"beast:"+date+":"+str(threshold),{"stone":int(threshold/10)})
				r.chests.append(threshold)
static func _day_index(now: int) -> int: return int(floor((float(now)/1000.0+int(GameFramework.rules().dayOffsetSeconds))/86400.0))
static func sync(s: Dictionary, now: int) -> void:
	var c: Dictionary = s.framework.challenges
	var days: int = maxi(0,_day_index(now)-int(c.dayIndex))
	if days > 0:
		for id in c.materialCharges: c.materialCharges[id] = mini(int(GameFramework.rules().materialCap),int(c.materialCharges[id])+days*int(GameFramework.rules().materialDaily))
		c.dayIndex += days
	var earned: int = maxi(0,int((now-int(c.staminaAt))/int(GameFramework.rules().staminaIntervalMs)))
	if int(c.stamina) >= int(GameFramework.rules().staminaCap): c.staminaAt = now
	elif earned > 0:
		c.stamina = mini(int(GameFramework.rules().staminaCap),int(c.stamina)+earned)
		c.staminaAt += earned*int(GameFramework.rules().staminaIntervalMs)
	var today: String = GameFramework.day(now)
	if today > str(c.beastDay):
		c.beastHistory[c.beastDay] = {"best":c.beastBest,"chests":c.beastChests.duplicate()}
		c.beastDay = today; c.beastBest = 0; c.beastChests = []
		c.beastHistory[today] = {"best":0,"chests":[]}
	_beast_recovery(s)
	var week: String = GameFramework.week(now)
	if week > str(c.week):
		c.towerPeriods[c.week] = c.towerWeekly.duplicate()
		c.week = week; c.towerWeekly = []
		c.towerFloor = maxi(1,int(floor(int(c.towerHistory)*float(GameFramework.rules().towerStartRatio))))
		# Skipped floors only carry weekly ordinary reward, never first-clear reward.
		for floor_id in range(1,int(c.towerFloor)):
			_reward(s,{"stone":20+floor_id*5},"tower:"+week+":"+str(floor_id)); c.towerWeekly.append(floor_id)
		c.towerPeriods[week] = c.towerWeekly.duplicate()
static func command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	sync(s,now)
	var c: Dictionary = s.framework.challenges
	match name:
		"challengePrepare": return _prepare(s,a,now)
		"challengeSettle": return _settle(s,a.get("battle",{}),now)
		"challengeClaim": return _claim(s,str(a.get("id","")),now)
		"challengeAbandon":
			if c.pending == null: return GameEconomy.ok({"abandoned":false})
			c.completed[c.pending.id] = {"id":c.pending.id,"kind":c.pending.kind,"outcome":"abandoned","claimed":true}
			c.pending = null
			return GameEconomy.ok({"abandoned":true})
		"challengeSweep":
			var type: String = str(a.get("type","stone"))
			var difficulty: int = int(a.get("difficulty",1))
			if difficulty < 1 or difficulty > 12 or _material_reward(type,difficulty).is_empty(): return GameEconomy.fail("材料类型或难度无效")
			if difficulty > int(c.materialUnlocks.get(type,0)): return GameEconomy.fail("先实际战胜此难度")
			if int(c.materialCharges.get(type,0)) <= 0: return GameEconomy.fail("本类可领取次数不足，仍可进行无奖励挑战")
			var reward: Dictionary = _material_reward(type,difficulty)
			if not GameEconomy.refund_room(s,reward): return GameEconomy.fail("背包空间不足")
			c.materialCharges[type] -= 1; GameEconomy.gain(s,reward)
			return GameEconomy.ok({"reward":reward,"remaining":c.materialCharges[type]})
		"challengeAdMaterial": return GameEconomy.fail("当前本地版没有已授权的激励广告SDK，不能发放广告奖励或扣次数")
		"challengeBeastChest":
			var threshold: int = int(a.get("threshold",1000))
			if not threshold in [1000,5000,10000] or int(c.beastBest) < threshold: return GameEconomy.fail("尚未达到伤害档位")
			if threshold in c.beastChests: return GameEconomy.ok({"duplicate":true})
			var reward: Dictionary = {"stone":threshold/10}
			if not GameEconomy.refund_room(s,reward): return GameEconomy.fail("背包空间不足")
			GameEconomy.gain(s,reward); c.beastChests.append(threshold)
			c.beastHistory[c.beastDay] = {"best":c.beastBest,"chests":c.beastChests.duplicate()}
			return GameEconomy.ok({"reward":reward})
		"challengeMountainStart":
			if c.mountain is Dictionary and c.mountain.status != "complete": return GameEconomy.fail("旧行程仍在进行，可完成或手动结束后开启新周")
			if GameFramework.locked(s): return GameEconomy.fail("请先结束已锁定战斗")
			c.seq += 1
			c.mountain = {"id":"mountain-%d" % int(c.seq),"week":c.week,"node":1,"status":"choice","choice":"","boons":[],"rewarded":[],"log":[]}
			return GameEconomy.ok(c.mountain.duplicate(true))
		"challengeStaminaBuy":
			var key: String = "stamina:"+GameFramework.day(now)
			var used: int = int(c.ads.get(key,0))
			if used >= int(GameFramework.rules().staminaBuyDaily): return GameEconomy.fail("今日体力购买已达上限")
			if int(c.stamina)+int(GameFramework.rules().staminaBuyAmount) > int(GameFramework.rules().staminaCap): return GameEconomy.fail("请先使用体力，不能超过上限")
			var cost: Dictionary = {"stone":int(GameFramework.rules().staminaBuyCost)}
			if not GameEconomy.can_afford(s,cost): return GameEconomy.fail("灵石不足")
			GameEconomy.pay(s,cost); c.ads[key] = used+1; c.stamina += int(GameFramework.rules().staminaBuyAmount)
			return GameEconomy.ok({"stamina":c.stamina,"dailyRemaining":int(GameFramework.rules().staminaBuyDaily)-used-1})
		"challengeMountainEnd":
			if c.pending != null: return GameEconomy.fail("请先结束当前战斗")
			c.mountain = null
			return GameEconomy.ok({"ended":true})
		"challengeMountainChoose": return _mountain_choice(s,str(a.get("choice","battle")))
		"challengeMailClaim":
			var mail: Dictionary = GameData.named(s.framework.mail,str(a.get("id","")))
			if mail.is_empty(): return GameEconomy.fail("找回奖励不存在")
			if mail.claimed: return GameEconomy.ok({"duplicate":true})
			if not GameEconomy.refund_room(s,mail.reward): return GameEconomy.fail("背包空间不足")
			GameEconomy.gain(s,mail.reward); mail.claimed = true
			return GameEconomy.ok({"reward":mail.reward})
	return GameEconomy.fail("未知挑战操作")
static func _material_reward(type: String, difficulty: int) -> Dictionary:
	var cfg: Dictionary = GameData.named(GameFramework.rules().materials,type)
	if cfg.is_empty(): return {}
	var reward: Dictionary = cfg.reward.duplicate()
	for key in reward: reward[key] = int(reward[key])*difficulty
	return reward
static func _prepare(s: Dictionary, a: Dictionary, now: int) -> Dictionary:
	var c: Dictionary = s.framework.challenges
	var kind: String = str(a.get("kind","material"))
	if c.pending is Dictionary:
		if c.pending.kind != kind: return GameEconomy.fail("已有不同类型的未完成挑战")
		return GameEconomy.ok({"battleRequest":c.pending.request.duplicate(true),"id":c.pending.id})
	if GameFramework.locked(s): return GameEconomy.fail("请先结束其他已锁定战斗")
	if not kind in ["story","material","set","tower","beast","mountain"]: return GameEconomy.fail("挑战类型不存在")
	var difficulty: int = int(a.get("difficulty",1))
	if difficulty < 1 or difficulty > 12: return GameEconomy.fail("挑战难度须为1至12")
	var type: String = str(a.get("type","stone"))
	if kind == "material" and _material_reward(type,difficulty).is_empty(): return GameEconomy.fail("材料秘境不存在")
	var dungeon: int = int(a.get("dungeon",0))
	if kind == "set" and (dungeon < 0 or dungeon >= 3): return GameEconomy.fail("套装秘境不存在")
	var boons: Array = []
	var story_node: int = int(s.framework.storyNode)
	if kind == "story":
		difficulty = (story_node-1)%12+1
		if story_node <= 12:
			var gate: String = GameEconomy._stage_error(s,story_node)
			if not gate.is_empty(): return GameEconomy.fail(gate)
	if kind == "tower": difficulty = clampi(int(c.towerFloor),1,12)
	if kind == "mountain":
		if not c.mountain is Dictionary or c.mountain.status != "battle": return GameEconomy.fail("先选择山路节点")
		boons = c.mountain.boons.duplicate()
		difficulty = clampi(int(c.mountain.node)+(2 if c.mountain.choice == "elite" else 0),1,12)
	c.seq += 1
	var id: String = "fw-battle-%d" % int(c.seq)
	var options: Dictionary = {"battleId":id,"seed":int(GameEconomy.next_random(s,"battle")*4294967295.0),"autoOnly":true,"trial":true,"ruleVersion":GameData.content("BATTLE_RULE_VERSION"),"boons":boons,"contextName":{"story":"主线章节","material":"材料秘境","set":"神仙套装秘境","tower":"镇妖塔","beast":"凶兽伤害挑战","mountain":"每周仙山"}[kind]}
	if kind in ["story","tower"]:
		options.enemies = GameData.stage(difficulty).enemies.duplicate(true)
		var scale: float = 1.0+float((story_node-1)/12)*0.25 if kind == "story" else 1.0+float(maxi(0,int(c.towerFloor)-12))*0.08
		for enemy in options.enemies:
			for stat in ["hp","atk","def"]: enemy[stat] = maxi(1,int(round(float(enemy[stat])*scale)))
	if kind == "beast": options.enemies = [{"id":"framework-beast","name":"凶兽法相","role":"soldier","row":"front","hp":10000000,"atk":20,"def":10,"speed":60,"will":0}]
	var request: Dictionary = {"stageId":difficulty,"team":GameFramework.party(s),"options":options}
	c.pending = {"id":id,"kind":kind,"type":type,"difficulty":difficulty,"dungeon":dungeon,"storyNode":story_node,"towerFloor":c.towerFloor,"week":c.week,"day":GameFramework.day(now),"runId":c.mountain.id if kind == "mountain" else "","request":request.duplicate(true)}
	c.lastParty[kind] = s.team.duplicate()
	s.framework.lastParties[kind] = s.team.duplicate()
	return GameEconomy.ok({"id":id,"battleRequest":request,"requiresBattle":true})
static func _settle(s: Dictionary, battle: Dictionary, now: int) -> Dictionary:
	var c: Dictionary = s.framework.challenges
	var id: String = str(battle.get("id",""))
	if c.completed.has(id): return GameEconomy.ok({"duplicate":true,"record":c.completed[id].duplicate(true)})
	var p: Variant = c.pending
	if not p is Dictionary or p.id != id: return GameEconomy.fail("战斗不属于当前已保存快照")
	var error: String = GameCombat.replay_auto(p.request,battle)
	if not error.is_empty(): return GameEconomy.fail(error)
	var record: Dictionary = p.duplicate(true); record.erase("request")
	record.outcome = str(battle.result); record.claimed = false; record.at = now
	if p.kind == "beast":
		var damage: int = 0
		for stats in battle.stats.values():
			if stats.side == "ally": damage += int(stats.damage)
		record.damage = damage; record.claimed = true
		# The saved entry date owns this attempt, including a midnight interruption.
		if not c.beastHistory.has(p.day): c.beastHistory[p.day] = {"best":0,"chests":[]}
		var daily: Dictionary = c.beastHistory[p.day]
		daily.best = maxi(int(daily.best),damage)
		if p.day == c.beastDay: c.beastBest = daily.best; c.beastChests = daily.chests.duplicate()
		_beast_recovery(s)
		record.message = "本次伤害%d；%s最高%d" % [damage,p.day,int(daily.best)]
	elif battle.result == "win":
		if p.kind == "story":
			s.framework.storyNode = maxi(int(s.framework.storyNode),int(p.storyNode)+1)
			if int(p.storyNode) <= 12 and not int(p.storyNode) in s.cleared:
				# Preserve the original first-clear grants and unlocks exactly once.
				var legacy: Dictionary = GameEconomy._settle_victory(s,"framework-story:"+id,int(p.storyNode))
				if not legacy.ok: return legacy
				record.reward = legacy.data.reward
			else:
				record.reward = {"stone":120+int(p.storyNode)*10,"xp":100+int(p.storyNode)*5}
				_reward(s,record.reward,id)
				s.stats.battles += 1; GameEconomy.record_daily(s,"battle")
			record.claimed = true
		if p.kind == "material":
			c.materialUnlocks[p.type] = maxi(int(c.materialUnlocks.get(p.type,0)),int(p.difficulty))
			if int(c.materialCharges.get(p.type,0)) == 0:
				record.claimed = true; record.practice = true
				record.message = "练习通关，已解锁本难度扫荡；本场没有材料奖励"
		if p.kind == "tower":
			var floor_id: int = int(p.towerFloor)
			c.towerHistory = maxi(int(c.towerHistory),floor_id)
			if p.week == c.week: c.towerFloor = maxi(int(c.towerFloor),floor_id+1)
			record.reward = {}
			if not floor_id in c.towerFirst: record.reward.material = 5+floor_id; c.towerFirst.append(floor_id)
			if not c.towerPeriods.has(p.week): c.towerPeriods[p.week] = []
			if not floor_id in c.towerPeriods[p.week]:
				record.reward.stone = 20+floor_id*5; c.towerPeriods[p.week].append(floor_id)
			if p.week == c.week: c.towerWeekly = c.towerPeriods[p.week].duplicate()
			_reward(s,record.reward,id); record.claimed = true
		if p.kind == "mountain":
			var run: Dictionary = c.mountain
			if run.id != p.runId: return GameEconomy.fail("仙山行程不匹配")
			var node: int = int(run.node)
			var reward: Dictionary = _mountain_reward(s,run,node,now)
			if not node in run.rewarded: _reward(s,reward,id); run.rewarded.append(node)
			record.reward = reward; record.claimed = true
			run.log.append("完成节点%d：%s" % [node,run.choice]); run.node += 1
			run.status = "complete" if node >= 5 else "choice"
	else:
		record.claimed = true
		record.message = "未扣领取次数与体力，可重新整备后挑战"
	c.completed[id] = record
	c.pending = null
	return GameEconomy.ok({"record":record,"rewardPending":not record.claimed,"message":record.get("message","战斗完成，奖励待手动领取" if not record.claimed else "已结算")})
static func _claim(s: Dictionary, id: String, now: int) -> Dictionary:
	var c: Dictionary = s.framework.challenges
	var r: Dictionary = c.completed.get(id,{})
	if r.is_empty() or r.outcome != "win": return GameEconomy.fail("没有可领取的胜利结果")
	if r.claimed: return GameEconomy.ok({"duplicate":true,"id":id})
	if r.kind == "material":
		if int(c.materialCharges[r.type]) <= 0: return GameEconomy.fail("本类领取次数不足，胜利结果保留")
		var reward: Dictionary = _material_reward(r.type,r.difficulty)
		if not GameEconomy.refund_room(s,reward): return GameEconomy.fail("背包空间不足，奖励保留")
		c.materialCharges[r.type] -= 1; GameEconomy.gain(s,reward); r.reward = reward
	elif r.kind == "set":
		var cost: int = int(GameFramework.rules().setClaimStamina)
		if int(c.stamina) < cost: return GameEconomy.fail("体力不足，胜利结果保留；可继续无奖励挑战")
		var sets: Array = GameEquipment.rules().sets
		var set_id: String = sets[int(r.dungeon)*2+int(GameEconomy.next_random(s,"battle")*2)].id
		var drops: Dictionary = GameEquipment.reward_drops(s,id,{"sourceId":"set-dungeon","stageId":int(r.difficulty),"setId":set_id},1)
		if not drops.ok: return drops
		# Equipment commits replace nested dictionaries. Use the committed ledger.
		c = s.framework.challenges; r = c.completed[id]
		c.stamina -= cost; r.reward = drops.data
	else: return GameEconomy.fail("此挑战已在结算时发放奖励")
	r.claimed = true; c.claimed[id] = now
	return GameEconomy.ok({"id":id,"reward":r.reward})
static func _mountain_reward(s: Dictionary, run: Dictionary, node: int, now: int) -> Dictionary:
	var c: Dictionary = s.framework.challenges
	var stage: String = str(run.week)+":"+str(node)
	if not c.mountainMajor.has(stage):
		c.mountainMajor[stage] = run.id
		return {"stone":40,"material":60 if node == 5 else 8}
	var date: String = GameFramework.day(now)
	var key: String = "repeat:"+date
	var runs: Array = c.mountainRepeat.get(key,[])
	if not run.id in runs:
		if runs.size() >= int(GameFramework.rules().mountainRepeatDaily): return {}
		runs.append(run.id); c.mountainRepeat[key] = runs
	return {"stone":10,"material":2}
static func _mountain_choice(s: Dictionary, choice: String) -> Dictionary:
	var c: Dictionary = s.framework.challenges
	var run: Variant = c.mountain
	if not run is Dictionary or run.status != "choice": return GameEconomy.fail("当前没有待选择山路")
	if not choice in ["battle","elite","boon","event"]: return GameEconomy.fail("山路选项不存在")
	if int(run.node) == 5: choice = "elite"
	run.choice = choice
	if choice in ["battle","elite"]: run.status = "battle"; return GameEconomy.ok(run.duplicate(true))
	if choice == "boon":
		var pool: Array = []
		for boon in GameData.content("BOONS",[]):
			if not boon.id in run.boons: pool.append(boon.id)
		if not pool.is_empty(): run.boons.append(pool[int(GameEconomy.next_random(s,"expedition")*pool.size())])
	else:
		# Once-only node event, no resetting the node to farm the reward.
		if not int(run.node) in run.rewarded:
			var reward: Dictionary = _mountain_reward(s,run,int(run.node),int(s.lastTime))
			_reward(s,reward,run.id+":"+str(run.node)); run.rewarded.append(int(run.node))
	run.log.append("节点%d：%s" % [int(run.node),choice]); run.node += 1
	run.status = "choice"
	return GameEconomy.ok(run.duplicate(true))
static func validate(s: Dictionary) -> String:
	var c: Variant = s.framework.get("challenges")
	if not c is Dictionary or not c.get("completed") is Dictionary or not c.get("materialCharges") is Dictionary: return "挑战记录无效"
	for field in ["materialUnlocks","towerPeriods","beastHistory","mountainMajor","mountainRepeat","ads","lastParty"]:
		if not c.get(field) is Dictionary: return "挑战字段无效："+field
	if not GameEconomy._nat(c.get("seq"),99999999) or not GameEconomy._nat(c.get("stamina"),int(GameFramework.rules().staminaCap)): return "挑战序列或体力无效"
	if not GameEconomy._nat(c.get("staminaAt")) or int(c.staminaAt) > int(s.lastTime) or not GameEconomy._nat(c.get("dayIndex")) or not GameEconomy._nat(c.get("towerHistory"),9999999) or not GameEconomy._nat(c.get("towerFloor"),9999999) or int(c.towerFloor) < 1 or not c.get("week") is String or not c.get("beastDay") is String or not GameEconomy._nat(c.get("beastBest")): return "挑战周期记录无效"
	for key in ["towerFirst","towerWeekly","beastChests"]:
		if not c.get(key) is Array: return "挑战领取记录无效"
		var seen: Array = []
		for value in c[key]:
			if not GameEconomy._nat(value,9999999) or value in seen: return "挑战领取记录重复或无效"
			seen.append(value)
	for type in GameFramework.rules().materials:
		if not GameEconomy._nat(c.materialCharges.get(type.id),int(GameFramework.rules().materialCap)): return "材料领取次数无效"
	for type in c.materialUnlocks:
		if GameData.named(GameFramework.rules().materials,type).is_empty() or not GameEconomy._nat(c.materialUnlocks[type],12): return "扫荡解锁记录无效"
	for date in c.beastHistory:
		var daily: Variant = c.beastHistory[date]
		if not date is String or not daily is Dictionary or not GameEconomy._nat(daily.get("best")) or not daily.get("chests") is Array: return "凶兽历史无效"
		var seen: Array = []
		for threshold in daily.chests:
			if not threshold in [1000,5000,10000] or threshold > daily.best or threshold in seen: return "凶兽阶段重复或未达成"
			seen.append(threshold)
	for id in c.completed:
		var r: Variant = c.completed[id]
		if not r is Dictionary or r.get("id") != id or not r.get("kind") in ["story","material","set","tower","beast","mountain"] or not r.get("outcome") in ["win","lose","abandoned","draw"] or not r.get("claimed") is bool: return "已结算挑战记录无效"
	if c.mountain != null:
		var run: Variant = c.mountain
		if not run is Dictionary or not run.get("id") is String or not run.get("week") is String or not GameEconomy._nat(run.get("node"),6) or int(run.node) < 1 or not run.get("status") in ["choice","battle","complete"] or not run.get("boons") is Array or not run.get("rewarded") is Array or not run.get("log") is Array: return "仙山行程无效"
		for boon in run.boons:
			if GameData.named(GameData.content("BOONS",[]),boon).is_empty(): return "仙山增益无效"
	if c.pending != null:
		if not c.pending is Dictionary or not c.pending.get("request") is Dictionary or c.completed.has(c.pending.get("id")): return "挑战战前快照无效"
		var request: Dictionary = c.pending.request
		if not request.get("options") is Dictionary or not request.get("team") is Array or request.team.is_empty() or request.team.size() > 5 or request.team[0].get("id") != GameFramework.LORD or request.options.get("battleId") != c.pending.get("id") or request.options.get("autoOnly") != true or not c.pending.get("kind") in ["story","material","set","tower","beast","mountain"]: return "挑战队伍或结算编号无效"
		var battle: Dictionary = GameCombat.create(int(request.get("stageId",0)),request.team,request.options)
		if battle.has("error"): return "挑战快照无法重建："+str(battle.error)
	return ""
