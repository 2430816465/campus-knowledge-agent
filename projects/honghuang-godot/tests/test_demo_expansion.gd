extends SceneTree
var count := 0
var errors: Array = []
func ck(ok:bool,message:String)->void:
 count+=1
 if not ok:errors.append(message)
func _initialize()->void:
 var normal := GameEconomy.create_state(100000)
 var before := normal.duplicate(true)
 for name in ["new","roster","estate-initial","estate-expanded","estate-complete","expedition-project"]:
  var s := GameEconomy.demo_state(name,100000)
  ck(GameEconomy.validate_state(s).is_empty(),name+" valid complete snapshot")
  ck(s.demo==name,name+" provenance")
  var again := GameEconomy.demo_state(name,100000)
  ck(s==again,name+" deterministic isolated reset")
  if name=="new":
   ck(s.owned.size()==3 and s.equipment.items.is_empty(),"new sandbox remains ordinary starting assets")
  else:ck(s.owned.size()==50,name+" all50 heroes")
  if name in ["roster","estate-complete","expedition-project"]:
   ck(s.equipment.items.size()==90,name+" allsets slots rarities")
   var combinations: Dictionary = {}
   for item in s.equipment.items:
    combinations["%s:%s:%s"%[item.setId,item.slot,item.rarity]]=true
    ck(item.sourceId.begins_with("isolated-demo:"),name+" itemorigin")
   ck(combinations.size()==90,name+" unique coverage")
   ck(s.items["relic-essence"]==600,name+" enhancement materials")
   ck(GameEquipment.command(s,"equipBestArtifacts",{"characterId":"wuji"}).ok,name+" new3star can equip real gear")
   ck(GameEquipment.stats_for(s,"wuji").size()>0,name+" actual stat modifiers")
  if name=="estate-complete":
   ck(s.expandedPlots.size()==15,"C3 all expansion purchased")
   var types: Dictionary={}
   for b in s.buildings:types[b.type]=true
   ck(types.size()==10,"C3 all10facilities")
   for p in GameEconomy.get_all_plots():ck(GameEconomy.plot_unlocked(s,p.id),"C3 authoritative unlocked "+p.id)
 ck(normal==before,"normal memory not mutated")
 ck(normal.owned.size()==3 and normal.equipment.items.is_empty() and normal.expandedPlots.is_empty(),"ordinary save has no injected content")
 print("DEMO EXPANSION: ",count," checks, ",errors.size()," failures")
 for err in errors:push_error(err)
 quit(0 if errors.is_empty() else 1)
