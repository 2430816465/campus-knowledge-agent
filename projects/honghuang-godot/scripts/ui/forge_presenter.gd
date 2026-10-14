extends RefCounted
## Presentation adapter only; all mutations remain in GameStore.transact.
static func card(item: Dictionary, heading: String, detailed: bool = false) -> Dictionary:
	if item.is_empty(): return {"heading":heading,"name":"尚未装备","stat":"炼器后查看属性","empty":true}
	var value: float = GameEquipment.main_value(str(item.mainStat),int(item.rarity),int(item.level))
	var stat: String = GameProgression.stat_name(str(item.mainStat))
	var shown: String = ("%.1f%%" % (value*100.0)) if "Percent" in str(item.mainStat) or str(item.mainStat) in ["critRate","critDamage"] else str(int(value))
	return {"id":item.id,"heading":heading,"name":GameEquipment.display_name(item),"stat":stat+"  "+shown,"icon":str(item.slot),"new":heading != "当前装备","details":GameEquipment.describe_item(item) if detailed else "","quantity":"%d星 · +%d" % [item.rarity,item.level]}
static func sample(new_item: bool, detailed: bool = false) -> Dictionary:
	return {"id":"fixture-only","heading":"新炼装备" if new_item else "当前装备","name":"青锋剑" if new_item else "玄铁剑","stat":"攻击 156  ↑28" if new_item else "攻击 128","new":new_item,"texture":load("res://assets/ui-foundation/jade-sword.png" if new_item else "res://assets/ui-foundation/iron-sword.png"),"tint":Color.WHITE,"details":("基础属性\n攻击 +156  ↑28\n\n附加词条\n暴击率 +5%  ↑2%\n攻击加成 +8%  ↑2%\n剑气伤害 +4%" if new_item else "基础属性\n攻击 +128\n\n附加词条\n暴击率 +3%\n攻击加成 +6%") if detailed else ""}
