class_name GameNames
extends RefCounted
## Presentation only: stable IDs, item records and receipts are never rewritten.
const TERMS: Dictionary = {
	"召请符":"召唤符", "道缘":"仙缘", "召请":"召唤",
	"万仙录":"神仙图鉴", "万仙试炼":"神仙试炼", "灵装":"法宝",
	"法门":"神通", "府库":"仓库", "专属灵宝":"专属法宝",
	"灵宝修复":"专属法宝修复", "灵宝已":"专属法宝已",
	"灵宝达到":"专属法宝达到", "灵宝等级":"专属法宝等级",
	"结缘自选":"神仙自选", "已结缘":"已拥有", "尚未结缘":"尚未拥有",
	"定向结缘":"指定兑换", "常驻结缘":"常驻召唤", "门人":"弟子"
}
static func text(value: String) -> String:
	var result: String=value
	for term: String in TERMS: result=result.replace(term,str(TERMS[term]))
	return result
