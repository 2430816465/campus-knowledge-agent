class_name GameEstateProduction
extends RefCounted
## Event driven production: identical online/offline rules, no elapsed-time ceiling.
static func ensure(s: Dictionary) -> void:
	var e: Dictionary = s.framework.estate
	# Q095: one workforce per building category, independent plans per building.
	if int(e.get("teamSchema",0)) < 2:
		var migrated: Dictionary = {}
		var seen: Array = []
		for old_id in e.teams:
			var old_building: Dictionary = GameEconomy.building(s,str(old_id))
			var type: String = str(old_building.get("type",old_id))
			if GameEconomy.spec(type).is_empty(): continue
			if not migrated.has(type): migrated[type] = []
			for worker in e.teams[old_id]:
				if not worker in seen and not GameData.named(s.progression.disciples,worker).is_empty():
					seen.append(worker)
					if migrated[type].size() < team_limit(s): migrated[type].append(worker)
		e.teams = migrated; e.teamSchema = 2
	for d in s.progression.disciples:
		if not d.has("workMs"): d.workMs = {"study":0,"gather":0,"explore":0}
		elif not d.workMs is Dictionary: d.workMs = {"study":0,"gather":int(d.workMs),"explore":0}
	for b in s.buildings:
		if not e.plans.has(b.id):
			var passive: Dictionary = GameEconomy.extension_rules().passiveRates.get(b.type,{})
			e.plans[b.id] = {"recipe":"passive" if not passive.is_empty() else "","nextRecipe":"","active":null,"paused":""}
static func team_limit(s: Dictionary) -> int:
	return mini(4,1+int(GameEconomy.building(s,"hall").level)/2)
static func work_skill(type: String) -> String:
	return str(GameFramework.rules().workExpertise.get(type,"gather"))
static func _workforce_share(s: Dictionary, type: String) -> int:
	var count: int = 0
	for other in s.buildings:
		if other.type != type or other.get("pendingPlacement",false): continue
		var plan: Dictionary = s.framework.estate.plans[other.id]
		if plan.active is Dictionary or (not plan.recipe.is_empty() and not _recipe(s,other,plan.recipe).is_empty()): count += 1
	return maxi(1,count)
static func category(output: Dictionary) -> String:
	return str(output.resource) if output.has("resource") else "consumable"
static func capacity(s: Dictionary, cat: String) -> int:
	var base: int = int(GameFramework.rules().warehouse.get(cat,1920))
	var level: int = int(GameEconomy.building(s,"hall").level)-1
	for b in s.buildings:
		if b.type == "warehouse": level += int(b.level)
	return int(base*(1.0+minf(2.0,float(level)*0.25)))
static func occupied(s: Dictionary, cat: String, reserved: bool = true) -> int:
	var total: int = int(s.warehouse.resources.get(cat,0))
	if cat == "consumable":
		total = s.warehouse.repairs.size()
		for n in s.warehouse.items.values(): total += int(n)
	if reserved:
		for plan in s.framework.estate.plans.values():
			if plan.active is Dictionary and category(plan.active.output) == cat: total += int(plan.active.output.count)
	return total
static func _recipe(s: Dictionary, b: Dictionary, id: String) -> Dictionary:
	if id == "passive":
		var rate: Dictionary = GameEconomy.extension_rules().passiveRates.get(b.type,{})
		if rate.is_empty(): return {}
		return {"id":"passive","building":b.type,"cost":{},"duration":60000,"output":{"resource":rate.resource,"count":int(rate.perMinute)*int(b.level)}}
	var recipe: Dictionary = GameData.named(GameEconomy.available_recipes(s,b.type),id)
	return recipe
static func efficiency(s: Dictionary, b: Dictionary) -> float:
	var bonus: float = 1.0 + (int(b.level)-1)*0.1
	var plot: Dictionary = GameData.named(GameEconomy.get_all_plots(),b.plot)
	if b.type == "farm" and plot.get("nourished",false): bonus += 0.2
	var host: String = str(s.framework.estate.hosts.get(b.type,""))
	if not host.is_empty(): bonus += 0.15 if host in GameEconomy.spec(b.type).specialist else 0.05
	var workers_bonus: float = 0.0
	for id in s.framework.estate.teams.get(b.type,[]):
		var d: Dictionary = GameData.named(s.progression.disciples,id)
		var skill: String = work_skill(str(b.type))
		if not d.is_empty(): workers_bonus += float(d.level)*0.005+float(d.aptitude[skill])*0.003+float(d.expertise[skill])*0.0005
	bonus += workers_bonus/_workforce_share(s,str(b.type))
	return minf(4.0,bonus)
static func _take(s: Dictionary, key: String, amount: int) -> void:
	# Intermediate stock is supplied before backpack stock, in stable source order.
	var sources: Array = s.warehouse.sources.keys(); sources.sort()
	for source_id in sources:
		var source: Dictionary = s.warehouse.sources[source_id]
		var used: int = mini(amount,int(source.resources.get(key,0)))
		source.resources[key] -= used; s.warehouse.resources[key] -= used; amount -= used
		if amount == 0: return
	s.resources[key] -= amount
static func _start(s: Dictionary, b: Dictionary, at: int) -> bool:
	var plan: Dictionary = s.framework.estate.plans[b.id]
	if plan.active != null or not b.queue.is_empty() or b.get("pendingPlacement",false) or plan.recipe.is_empty(): return false
	var recipe: Dictionary = _recipe(s,b,plan.recipe)
	if recipe.is_empty(): plan.paused = "配方尚未解锁"; return false
	var cat: String = category(recipe.output)
	if int(recipe.output.count) > capacity(s,cat): plan.paused = "单批产量超过分类仓库容量"; return false
	if occupied(s,cat)+int(recipe.output.count) > capacity(s,cat): plan.paused = "分类仓库已满"; return false
	var paid: Dictionary = GameEconomy.charged_cost(recipe.cost)
	for key in paid:
		var available: int = int(s.resources.get(key,0))+int(s.warehouse.resources.get(key,0))
		if available < int(paid[key]):
			var names: Dictionary = {"herb":"灵药","material":"灵材","stone":"灵石","xp":"修为"}
			var sources: Dictionary = {"herb":"灵田生产","material":"材料秘境","stone":"灵矿生产或材料秘境","xp":"灵泉生产或材料秘境"}
			plan.paused = "缺少%s %d，来源：%s" % [names.get(key,key),int(paid[key])-available,sources.get(key,"百宝阁")]
			return false
	for key in paid: _take(s,key,int(paid[key]))
	var duration: int = maxi(1000,int(ceil(float(recipe.duration)/efficiency(s,b))))
	plan.active = {"recipe":plan.recipe,"startedAt":at,"readyAt":at+duration,"output":recipe.output.duplicate(true),"paid":paid,"workers":s.framework.estate.teams.get(b.type,[]).duplicate()}
	plan.paused = ""
	return true
static func advance(s: Dictionary, now: int) -> Dictionary:
	ensure(s)
	var e: Dictionary = s.framework.estate
	var from: int = int(e.clock)
	var report: Dictionary = {"elapsedMs":maxi(0,now-from),"capped":false,"backwards":now<from,"resources":GameEconomy.empty_resources(),"items":{},"batches":0}
	if now < from: s.clockWarnings += 1; return GameEconomy.ok(report)
	var buildings: Array = s.buildings.duplicate()
	buildings.sort_custom(func(a: Dictionary,b: Dictionary) -> bool: return str(a.id)<str(b.id))
	var at: int = from
	while at <= now:
		for b in buildings:
			if b.get("pendingPlacement",false): continue
			b.readyAt = 0
			var plan: Dictionary = e.plans[b.id]
			# Honor paid legacy work, including repair promises and refunds.
			while not b.queue.is_empty() and int(b.queue[0].readyAt) <= at:
				var legacy: Dictionary = b.queue[0]
				if occupied(s,category(legacy.output))+int(legacy.output.count) > capacity(s,category(legacy.output)): break
				if not GameEconomy.accept_output(s,b,legacy): break
				b.queue.pop_front(); report.batches += 1
			if plan.active is Dictionary and int(plan.active.readyAt) <= at:
				var job: Dictionary = plan.active
				if GameEconomy.accept_output(s,b,job):
					report.batches += 1
					if job.output.has("resource"): report.resources[job.output.resource] += int(job.output.count)
					else: report.items[job.output.item] = int(report.items.get(job.output.item,0))+int(job.output.count)
					plan.active = null
					if not plan.nextRecipe.is_empty():
						plan.recipe = "" if plan.nextRecipe == "stop" else plan.nextRecipe
						plan.nextRecipe = ""
		# Finish all producers before starting another batch so intermediates
		# can supply an earlier producer at the same tick in stable order.
		for b in buildings: _start(s,b,at)
		var next: int = now+1
		for b in buildings:
			var plan: Dictionary = e.plans[b.id]
			if plan.active is Dictionary: next = mini(next,int(plan.active.readyAt))
			if not b.queue.is_empty() and int(b.queue[0].readyAt) > at: next = mini(next,int(b.queue[0].readyAt))
		if next <= at: next = at+1
		# Count actual working time once per disciple, even when a category
		# supports several buildings. Reserve/blocked plans earn no expertise.
		var workers: Dictionary = {}
		for b in buildings:
			var active: Variant = e.plans[b.id].active
			if active is Dictionary:
				for worker in active.workers:
					if not workers.has(worker): workers[worker] = work_skill(str(b.type))
		var elapsed: int = maxi(0,mini(next,now)-at)
		for worker in workers:
			var disciple: Dictionary = GameData.named(s.progression.disciples,worker)
			if disciple.is_empty(): continue
			var skill: String = workers[worker]
			var work: int = int(disciple.workMs[skill])+elapsed
			disciple.expertise[skill] = mini(1000,int(disciple.expertise[skill])+int(work/60000))
			disciple.workMs[skill] = work%60000
		at = next
	e.clock = now; s.lastTime = now
	GameEconomy.sync_daily(s,now)
	s.progression.clock = maxi(int(s.progression.clock),now)
	return GameEconomy.ok(report)
static func command(s: Dictionary, name: String, a: Dictionary, now: int) -> Dictionary:
	var e: Dictionary = s.framework.estate
	var id: String = str(a.get("id",""))
	var b: Dictionary = GameEconomy.building(s,id)
	match name:
		"estatePlan":
			if b.is_empty() or b.get("pendingPlacement",false): return GameEconomy.fail("先放置此建筑")
			var recipe: String = str(a.get("recipe","stop"))
			if recipe != "stop" and _recipe(s,b,recipe).is_empty(): return GameEconomy.fail("配方不适用或尚未解锁")
			var p: Dictionary = e.plans[id]
			if p.active is Dictionary: p.nextRecipe = recipe
			else: p.recipe = "" if recipe == "stop" else recipe
			_start(s,b,now)
			return GameEconomy.ok({"nextBatch":p.active != null,"plan":p.duplicate(true)})
		"estateCancel":
			if b.is_empty(): return GameEconomy.fail("建筑不存在")
			var p: Dictionary = e.plans[id]
			if not p.active is Dictionary: return GameEconomy.fail("没有正在生产的批次")
			var refund: Dictionary = p.active.paid
			if not GameEconomy.refund_room(s,refund): return GameEconomy.fail("背包不能容纳完整退款")
			GameEconomy.gain(s,refund); p.active = null; p.recipe = ""; p.nextRecipe = ""
			return GameEconomy.ok({"refund":refund,"message":"已停产并退还当前未完成批次实付原料"})
		"estateHost":
			var type: String = str(a.get("type",b.get("type","")))
			var hero: String = str(a.get("hero",""))
			if GameEconomy.spec(type).is_empty(): return GameEconomy.fail("建筑类别不存在")
			if hero.is_empty(): e.hosts.erase(type); return GameEconomy.ok({"removed":type})
			if not s.owned.has(hero): return GameEconomy.fail("只能委任已获得神仙")
			for other in e.hosts:
				if other != type and e.hosts[other] == hero: return GameEconomy.fail("每名神仙只能主持一种建筑")
			e.hosts[type] = hero
			return GameEconomy.ok({"type":type,"hero":hero,"combatAvailable":true})
		"estateTeam":
			var type: String = str(a.get("type",b.get("type",id)))
			if GameEconomy.spec(type).is_empty(): return GameEconomy.fail("建筑类别不存在")
			var ids: Variant = a.get("ids",[])
			var limit: int = team_limit(s)
			if not ids is Array or ids.size() > limit: return GameEconomy.fail("此岗位最多%d名弟子" % limit)
			var seen: Array = []
			for worker in ids:
				if GameData.named(s.progression.disciples,worker).is_empty() or worker in seen: return GameEconomy.fail("弟子不存在或重复")
				for other in e.teams:
					if other != type and worker in e.teams[other]: return GameEconomy.fail("弟子已在其他事务队，请先调回候补")
				for other in e.plans:
					var active: Variant = e.plans[other].active
					if GameEconomy.building(s,str(other)).type != type and active is Dictionary and worker in active.workers: return GameEconomy.fail("请待上一事务的批次完工或取消后调岗")
				for job in s.progression.jobs:
					if not job.claimed and job.target == worker: return GameEconomy.fail("弟子正在外出")
				seen.append(worker)
			e.teams[type] = ids.duplicate()
			return GameEconomy.ok({"type":type,"workers":ids,"effective":"下一批","reserveHasNoYield":true})
		"estateAssign":
			var worker: String = str(a.get("worker",""))
			var type: String = str(a.get("type","reserve"))
			if GameData.named(s.progression.disciples,worker).is_empty(): return GameEconomy.fail("弟子不存在")
			for other in e.teams: e.teams[other].erase(worker)
			if type == "reserve": return GameEconomy.ok({"reserve":worker,"effective":"当前批次完工后"})
			var ids: Array = e.teams.get(type,[]).duplicate(); ids.append(worker)
			return command(s,"estateTeam",{"type":type,"ids":ids},now)
		"estateOrdersRefresh":
			for i in range(3):
				var existing: Dictionary = GameData.named(e.orders,str(i))
				if not existing.is_empty() and existing.status == "accepted": continue
				if not existing.is_empty() and existing.get("day") == GameFramework.day(now): continue
				e.orderSeq += 1
				var key: String = ["herb","material","stone"][i]
				var order: Dictionary = {"id":str(i),"receiptId":"npc-order-%d" % int(e.orderSeq),"day":GameFramework.day(now),"status":"offered","need":{key:20 if key != "stone" else 100},"reward":{"stone":180 if key != "stone" else 0,"material":20 if key == "stone" else 0}}
				if not existing.is_empty(): e.orders.erase(existing)
				e.orders.append(order)
			return GameEconomy.ok({"orders":e.orders.duplicate(true)})
		"estateOrderAccept","estateOrderDeliver":
			var order: Dictionary = GameData.named(e.orders,id)
			if order.is_empty(): return GameEconomy.fail("订单不存在")
			if name == "estateOrderAccept":
				if order.status != "offered": return GameEconomy.fail("此订单已接取或完成")
				order.status = "accepted"; return GameEconomy.ok(order.duplicate(true))
			if order.status == "delivered": return GameEconomy.ok({"duplicate":true,"reward":order.reward})
			if order.status != "accepted": return GameEconomy.fail("先接取订单")
			# A delivery consumes actual goods even in currency-free test mode.
			for key in order.need:
				if int(s.resources[key]) < int(order.need[key]): return GameEconomy.fail("请手动领取并准备订单所需物品")
			if not GameEconomy.refund_room(s,order.reward): return GameEconomy.fail("背包空间不足")
			for key in order.need: s.resources[key] -= int(order.need[key])
			GameEconomy.gain(s,order.reward); order.status = "delivered"
			return GameEconomy.ok({"reward":order.reward,"receiptId":order.receiptId})
	return GameEconomy.fail("未知仙府操作")
static func validate(s: Dictionary) -> String:
	var e: Variant = s.framework.get("estate")
	if not e is Dictionary or not e.get("plans") is Dictionary or not e.get("hosts") is Dictionary or not e.get("teams") is Dictionary or not e.get("orders") is Array: return "仙府生产存档无效"
	if not GameEconomy._nat(e.get("clock")) or int(e.clock) > int(s.lastTime): return "仙府生产时钟无效"
	var host_ids: Array = []
	for type in e.hosts:
		if GameEconomy.spec(type).is_empty() or not s.owned.has(e.hosts[type]) or e.hosts[type] in host_ids: return "建筑主持重复或无效"
		host_ids.append(e.hosts[type])
	var workers: Array = []
	for id in e.teams:
		if GameEconomy.spec(str(id)).is_empty() or not e.teams[id] is Array or e.teams[id].size() > team_limit(s): return "弟子事务队无效"
		for worker in e.teams[id]:
			if GameData.named(s.progression.disciples,worker).is_empty() or worker in workers: return "弟子不能重复任职"
			workers.append(worker)
	for id in e.plans:
		var p: Variant = e.plans[id]
		if GameEconomy.building(s,id).is_empty() or not p is Dictionary or not p.get("recipe") is String: return "长期生产计划无效"
		if not p.get("nextRecipe") is String or not p.get("paused") is String: return "生产计划切换记录无效"
		if p.active != null:
			if not p.active is Dictionary or not GameEconomy._nat(p.active.get("readyAt")) or int(p.active.readyAt) <= int(p.active.get("startedAt",-1)) or not p.active.get("paid") is Dictionary or not p.active.get("workers") is Array: return "当前批次承诺无效"
			var output: Variant = p.active.get("output")
			if not output is Dictionary or not GameEconomy._nat(output.get("count"),1000000) or int(output.count) < 1 or (not output.has("resource") and not output.has("item") and not output.has("repair")): return "批次产物无效"
			for key in p.active.paid:
				if not s.resources.has(key) or not GameEconomy._nat(p.active.paid[key],999999): return "批次原料承诺无效"
			var seen: Array = []
			for worker in p.active.workers:
				if GameData.named(s.progression.disciples,worker).is_empty() or worker in seen: return "批次弟子无效"
				seen.append(worker)
	var order_ids: Array = []
	for order in e.orders:
		if not order is Dictionary or not order.get("id") is String or order.id in order_ids or not order.get("receiptId") is String or not order.get("status") in ["offered","accepted","delivered"] or not order.get("need") is Dictionary or not order.get("reward") is Dictionary: return "经营订单无效"
		order_ids.append(order.id)
		for record in [order.need,order.reward]:
			for key in record:
				if not s.resources.has(key) or not GameEconomy._nat(record[key],999999): return "经营订单数量无效"
	return ""
