extends SceneTree
## Captures actual deterministic combat before taxonomy-only presentation fixes,
## then proves the same units, events, results and RNG after the correction.
var checks:=0
var failures:Array=[]
var baseline:=false
var phase:="round-4"
func check(value:bool,label:String)->void:
	checks+=1
	if not value:failures.append(label);push_error("FACTION AUDIT: "+label)
func _initialize()->void:
	for arg in OS.get_cmdline_user_args():
		if arg=="--baseline":baseline=true
		if arg.begins_with("--audit-phase="):phase=arg.trim_prefix("--audit-phase=")
	var baseline_path:="res://docs/audits/%s-faction-baseline.json"%phase
	var previous:Dictionary={}
	var heroes:Array=[]
	if baseline:
		for hero in GameData.content("CHARACTERS"):
			if hero.faction in ["西岐","商庭"]:heroes.append({"id":hero.id,"faction":hero.faction,"background":hero.get("background","")})
		check(heroes.size()==11,"record all eleven newer characters currently classified by historical camp")
	else:
		var decoded:Variant=JSON.parse_string(FileAccess.get_file_as_string(baseline_path))
		check(decoded is Dictionary,"actual pre-change combat baseline exists")
		if not decoded is Dictionary:quit(1);return
		previous=decoded
		heroes=previous.affected_heroes
	var outcomes:Dictionary={}
	for entry in heroes:
		var hero:=GameData.character(entry.id)
		if not baseline:
			check(hero.faction=="人间","game faction restored to human realm "+str(entry.id))
			check(str(hero.get("background","")).contains("西岐") if entry.faction=="西岐" else (str(hero.get("background","")).contains("朝歌") or str(hero.get("background","")).contains("商庭")),"historical camp retained in background "+str(entry.id))
		for stage in [4,8,12]:
			for branch in ["A","B"]:
				var key:="%s:%d:%s"%[entry.id,stage,branch]
				var ids:Array=[entry.id]
				for partner in ["nezha","bigan","huangfeihu","yangjian","taiyi"]:
					if not partner in ids and ids.size()<5:ids.append(partner)
				var team:Array=[]
				for id in ids:team.append({"id":id,"level":5,"branch":branch,"treasure":1})
				var battle:=GameCombat.create(stage,team,{"seed":48632,"battleId":"taxonomy-"+key,"trial":true})
				var count:=0
				while battle.get("result")==null and count<2000:
					check(GameCombat.auto_act(battle),"legal taxonomy comparison action")
					count+=1
				check(battle.get("result") in ["win","lose"],"actual comparison battle terminates "+key)
				var signature:=JSON.stringify(GameData.normalize({"units":battle.units,"events":battle.events,"stats":battle.stats,"rng":battle.rng,"result":battle.result,"round":battle.round,"actions":battle.actionCount}),"",true,true).sha256_text()
				outcomes[key]={"signature":signature,"result":battle.result,"actions":battle.actionCount,"rounds":battle.round,"rng":battle.rng}
				if not baseline:check(previous.battles.get(key,{}).get("signature")==signature,"taxonomy and chapter art changes preserve exact combat trace/RNG "+key)
	check(outcomes.size()==66,"eleven heroes across three chapters and both branches actually battle")
	var report:={"phase":phase,"mode":"baseline" if baseline else "compare","utc":Time.get_datetime_string_from_system(true),"checks":checks,"failures":failures,"affected_heroes":heroes,"battles":outcomes,"scope":"Explicit no-reward deterministic trial battles; before/after metadata and presentation change comparison, not normal progression."}
	var path:=baseline_path if baseline else "res://docs/audits/%s-faction-integrity.json"%phase
	var file:=FileAccess.open(path,FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("FACTION INTEGRITY ",report.mode," ",checks," checks / ",failures.size()," failures / ",outcomes.size()," actual battles")
	quit(0 if failures.is_empty() else 1)
