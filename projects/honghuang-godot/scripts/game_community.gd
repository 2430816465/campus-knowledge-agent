class_name GameCommunity
extends RefCounted
## Offline single-player guild. All mutations occur in GameStore's draft.
const SECTS := [
	{"id":"qingyun","name":"青云仙盟","motto":"青山为契，共修长生。","portrait":"yunxiao"},
	{"id":"chixiao","name":"赤霄道盟","motto":"赤心济世，护持苍生。","portrait":"nezha"},
	{"id":"yuxu","name":"玉虚同道","motto":"万法归一，道合山海。","portrait":"yangjian"}]
const SHOP := [
	{"id":"ticket","name":"召请符","price":80,"limit":2,"level":1,"reward":{"ticket":1}},
	{"id":"material","name":"灵材宝匣","price":30,"limit":3,"level":1,"reward":{"material":40}},
	{"id":"xp","name":"悟道心得","price":40,"limit":3,"level":1,"reward":{"xp":180}},
	{"id":"fate","name":"仙缘玉佩","price":100,"limit":1,"level":2,"reward":{"fate":5}}]
const TASKS := [
	{"id":"donate","name":"同心共建","description":"完成一次仙盟捐献","target":1,"coins":30,"reward":{"stone":60}},
	{"id":"estate","name":"经营有道","description":"在仙府完成三次经营行动","target":3,"coins":50,"reward":{"material":30}},
	{"id":"cultivation","name":"道法精进","description":"完成一次角色培养","target":1,"coins":30,"reward":{"xp":80}}]

static func ensure_state(s: Dictionary) -> void:
	if not s.has("community"):
		s.community={"guild":{},"coins":0,"totalContribution":0,"day":"","donations":0,"claimed":[],"purchases":{}}

static func sync(s: Dictionary) -> void:
	ensure_state(s)
	var c: Dictionary=s.community
	var day: String=GameEconomy.natural_day(int(s.lastTime))
	if day>str(c.day):
		c.day=day
		c.donations=0
		c.claimed=[]
		c.purchases={}

static func level(c: Dictionary) -> int:
	return mini(10,1+int(c.get("guild",{}).get("experience",0))/300)

static func command(s: Dictionary,op: String,a: Dictionary) -> Dictionary:
	sync(s)
	var c: Dictionary=s.community
	var id: String=str(a.get("id",""))
	if op=="guildJoin" or op=="guildCreate":
		if not c.guild.is_empty(): return GameEconomy.fail("请先退出当前仙盟")
		var guild: Dictionary=GameData.named(SECTS,id).duplicate(true)
		if op=="guildCreate":
			var title: String=str(a.get("name","")).strip_edges()
			if title.length()<2 or title.length()>12 or title.contains("\n"): return GameEconomy.fail("盟名需为2至12字")
			guild={"id":"custom","name":title,"motto":"山海相逢，同道同行。","portrait":str(s.team[0])}
		if guild.is_empty(): return GameEconomy.fail("仙盟不存在")
		guild.experience=0
		c.guild=guild
		return GameEconomy.ok(guild)
	if c.guild.is_empty(): return GameEconomy.fail("请先加入或创建仙盟")
	match op:
		"guildLeave":
			c.guild={}
			return GameEconomy.ok()
		"guildDonate":
			if int(c.donations)>=3: return GameEconomy.fail("今日三次捐献已完成")
			var cost: Dictionary={"stone":100,"material":15}
			if not GameEconomy.can_afford(s,cost): return GameEconomy.fail("捐献需要灵石100、灵材15")
			GameEconomy.pay(s,cost)
			c.donations+=1
			c.coins+=50
			c.totalContribution+=50
			c.guild.experience+=50
			return GameEconomy.ok({"message":"贡献 +50 · 仙盟经验 +50"})
		"guildClaim":
			var task: Dictionary=GameData.named(TASKS,id)
			if task.is_empty() or id in c.claimed: return GameEconomy.fail("委托不存在或已领取")
			if task_progress(s,id)<int(task.target): return GameEconomy.fail("委托尚未完成")
			if not GameEconomy.refund_room(s,task.reward): return GameEconomy.fail("资源将超出上限，请先消耗后领取")
			c.claimed.append(id)
			c.coins+=int(task.coins)
			c.totalContribution+=int(task.coins)
			c.guild.experience+=int(task.coins)
			GameEconomy.gain(s,task.reward)
			return GameEconomy.ok({"reward":task.reward})
		"guildBuy":
			var offer: Dictionary=GameData.named(SHOP,id)
			if offer.is_empty(): return GameEconomy.fail("商品不存在")
			if level(c)<int(offer.level): return GameEconomy.fail("仙盟等级尚未达到要求")
			if int(c.purchases.get(id,0))>=int(offer.limit): return GameEconomy.fail("今日兑换额度已用尽")
			if not GameEconomy.free_currency() and int(c.coins)<int(offer.price): return GameEconomy.fail("仙盟贡献不足")
			if not GameEconomy.refund_room(s,offer.reward): return GameEconomy.fail("资源将超出上限，请先消耗")
			if not GameEconomy.free_currency(): c.coins-=int(offer.price)
			c.purchases[id]=int(c.purchases.get(id,0))+1
			GameEconomy.gain(s,offer.reward)
			return GameEconomy.ok({"reward":offer.reward})
	return GameEconomy.fail("未知仙盟操作")

static func task_progress(s: Dictionary,id: String) -> int:
	if id=="donate": return int(s.get("community",{}).get("donations",0))
	return int(s.daily.progress.get(id,0))

static func snapshot(s: Dictionary) -> Dictionary:
	var copy: Dictionary=s.duplicate(true)
	sync(copy)
	return copy.community

static func ranking(s: Dictionary,board: String="power") -> Array:
	# Fixed named NPC benchmarks, never fabricated online player records.
	var npcs: Array=[
		["云岫真人","yunxiao",12800,12,1200], ["太乙散人","taiyi",8200,10,800],
		["莲华道友","nezha",5600,8,500], ["清源行者","yangjian",3200,6,300],
		["松风居士","bigan",1800,4,180], ["青禾小仙","dengchanyu",700,2,60]]
	var index: int=2 if board=="power" else 3 if board=="progress" else 4
	var rows: Array=[]
	for npc: Array in npcs: rows.append({"name":npc[0],"portrait":npc[1],"score":npc[index],"self":false,"kind":"离线NPC"})
	var score: int=GameEquipment.team_power(s) if board=="power" else s.cleared.size() if board=="progress" else int(s.get("community",{}).get("totalContribution",0))
	rows.append({"name":"我的仙府","portrait":str(s.team[0]),"score":score,"self":true,"kind":"我的实际数据"})
	rows.sort_custom(func(a: Dictionary,b: Dictionary)->bool:
		if int(a.score)==int(b.score): return bool(a.self) and not bool(b.self)
		return int(a.score)>int(b.score))
	for i: int in rows.size(): rows[i]["rank"]=i+1
	return rows

static func validate(s: Dictionary) -> String:
	if not s.has("community"): return ""
	var c: Variant=s.community
	if not c is Dictionary: return "仙盟数据无效"
	for key: String in ["coins","totalContribution","donations"]:
		if not GameEconomy._nat(c.get(key),999999999): return "仙盟数值无效"
	if c.donations>3 or c.coins>c.totalContribution: return "仙盟贡献记录不符"
	if not c.get("day") is String or not c.get("claimed") is Array or not c.get("purchases") is Dictionary or not c.get("guild") is Dictionary: return "仙盟记录无效"
	var seen: Array=[]
	for id in c.claimed:
		if not id is String or GameData.named(TASKS,id).is_empty() or id in seen: return "仙盟委托记录无效"
		seen.append(id)
	for id in c.purchases:
		var offer: Dictionary=GameData.named(SHOP,id)
		if offer.is_empty() or not GameEconomy._nat(c.purchases[id],int(offer.limit)): return "仙盟商店记录无效"
	if not c.guild.is_empty():
		for key: String in ["id","name","motto","portrait"]:
			if not c.guild.get(key) is String: return "仙盟信息无效"
		if c.guild.name.length()<2 or c.guild.name.length()>12 or not GameEconomy._nat(c.guild.get("experience"),999999999): return "仙盟信息无效"
	return ""
