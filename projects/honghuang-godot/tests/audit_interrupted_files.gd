extends SceneTree
## Simulates a missing primary during replacement using isolated real files.
## Linux simulation only; this does not claim actual Windows crash execution.
var checks:=0
var failures:Array=[]
var battles:Array=[]
var phase:="preaudit"
func difference(a:Variant,b:Variant,path:String="")->Array:
	var result:Array=[]
	if a is Dictionary and b is Dictionary:
		for key in a:
			if not b.has(key):result.append({"path":path+"."+str(key),"missing":true})
			else:result.append_array(difference(a[key],b[key],path+"."+str(key)))
	elif a is Array and b is Array:
		if a.size()!=b.size():result.append({"path":path,"size_a":a.size(),"size_b":b.size()})
		else:
			for index in a.size():result.append_array(difference(a[index],b[index],path+"["+str(index)+"]"))
	elif a!=b:
		result.append({"path":path,"before":str(a),"after":str(b),"before_type":typeof(a),"after_type":typeof(b),"numeric_delta":"%.17f"%(float(a)-float(b)) if (a is float or a is int) and (b is float or b is int) else ""})
	return result
func check(value:bool,label:String)->void:
	checks+=1
	if not value:failures.append(label);push_error("INTERRUPTED FILE AUDIT: "+label)
func interrupt_primary(path:String)->void:
	var absolute:=ProjectSettings.globalize_path(path)
	check(DirAccess.copy_absolute(absolute,absolute+".backup")==OK,"preserve the exact current primary as pre-replacement backup")
	check(DirAccess.rename_absolute(absolute,absolute+".interrupted-original")==OK,"simulate interrupted replacement by moving only isolated primary")
	check(not FileAccess.file_exists(path) and FileAccess.file_exists(path+".backup"),"missing-primary/valid-backup failure state actually exists")
func real_battle(store:GameStore,label:String)->void:
	var admitted:=store.transact("prepareMainBattle",{"stageId":1,"options":{"seed":99381,"now":store.state.lastTime}},int(store.state.lastTime))
	check(admitted.ok,"restored account admits actual combat "+label)
	if not admitted.ok:return
	var request:Dictionary=admitted.data
	var fight:=GameCombat.create(request.stageId,request.team,request.options)
	var count:=0
	while fight.get("result")==null and count<2000:
		check(GameCombat.auto_act(fight),"restored legal combat action "+label);count+=1
	check(fight.get("result")=="win","restored actual victory "+label)
	check(store.transact("settleMainBattle",{"battle":fight},int(store.state.lastTime)).ok,"restored actual victory commits "+label)
	battles.append({"label":label,"id":fight.id,"actions":fight.actionCount,"result":fight.result})
func _initialize()->void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="):phase=arg.trim_prefix("--audit-phase=")
	var report:Variant=JSON.parse_string(FileAccess.get_file_as_string("res://docs/audits/%s-flow.json"%phase))
	if not report is Dictionary:report=JSON.parse_string(FileAccess.get_file_as_string("res://docs/audits/preaudit-flow.json"))
	var source:String=report.facts.all_content_ordinary.exported_path
	var directory:="user://tests/audit-interrupted-%s-%d"%[phase,Time.get_ticks_usec()]
	var store:=GameStore.new(directory)
	check(store.load_slot("normal").ok and store.import_save(source).ok,"isolated genuinely progressed normal recovery fixture")
	var expected:Dictionary=store.state.duplicate(true)
	var path:String=store._path
	store.release()
	interrupt_primary(path)
	store=GameStore.new(directory)
	var load_result:=store.load_slot("normal")
	check(not load_result.ok and store.corruption and store.readonly,"missing primary with existing backup is visibly protected, not a new game")
	check(not FileAccess.file_exists(path),"startup does not silently recreate missing primary")
	check(not store.transact("summon",{"count":1},int(expected.lastTime)).ok,"protected interrupted account cannot spend assets")
	var restored:=store.restore_backup()
	check(restored.ok,"explicit backup restoration succeeds")
	if restored.ok:
		check(GameData.normalize(store.state.resources)==GameData.normalize(expected.resources) and GameData.normalize(store.state.equipment)==GameData.normalize(expected.equipment) and store.state.cleared==expected.cleared,"restore preserves all earned currency/equipment/mainline progress")
		check(int(store.state.revision)>int(expected.revision),"recovery advances beyond preserved revision rather than resetting counter")
		real_battle(store,"normal")
	store.release()
	var mock:=GameStore.new(directory+"-mock")
	check(mock.load_mock_profile("normal","interrupted","device1").ok and mock.import_save(source).ok,"isolated progressed mock account")
	var service_path:String=(directory+"-mock").path_join("service.json")
	var service:=GameOnlineMock.new(service_path)
	check(service.command("interrupted","device1","login").ok,"real local mock login")
	check(service.command("interrupted","device1","chat_send",{"text":"Durable pre-interruption message","request_id":"durable-message"}).ok,"real local mock message")
	var order:=service.command("interrupted","device1","payment_create",{"sku":"test_small","request_id":"durable-order"})
	check(order.ok,"real local sandbox order")
	var receipt:=service.command("interrupted","device1","payment_settle",{"order_id":order.data.id,"outcome":"paid"})
	check(receipt.ok and mock.redeem_mock_receipt(receipt.data,service).ok,"real local receipt credited before interruption")
	var tickets:int=mock.state.resources.ticket
	check(service.command("interrupted","device1","cloud_upload",{"save":mock.state.duplicate(true),"expected_revision":0}).ok,"paid mock state uploaded before interruption")
	var service_before:Dictionary=service.snapshot()
	var stale:=GameOnlineMock.new(service_path)
	check(stale.load_data().ok,"old service window actually loaded prior revision")
	interrupt_primary(service_path)
	var recovered:=GameOnlineMock.new(service_path)
	var loaded:=recovered.load_data()
	check(not loaded.ok,"missing service primary with valid backup is protected")
	check(not recovered.command("interrupted","device1","login").ok and not FileAccess.file_exists(service_path),"broken service refuses to create a replacement empty account database")
	check(recovered.has_method("restore_backup"),"explicit simulated-service backup recovery is available")
	if recovered.has_method("restore_backup"):
		var recovery:Dictionary=recovered.call("restore_backup")
		check(recovery.ok,"actual service backup restoration succeeds")
		if recovery.ok:
			check(GameData.normalize(recovered.data.realms)==GameData.normalize(service_before.realms),"service recovery exactly retains accounts/messages/orders/cloud payload")
			if GameData.normalize(recovered.data.realms)!=GameData.normalize(service_before.realms): print("SERVICE_RECOVERY_DIFF ",JSON.stringify(difference(GameData.normalize(service_before.realms),GameData.normalize(recovered.data.realms))))
			check(recovered._revision>int(service_before.revision),"service recovery revision is newer than preserved revision")
			check(not stale.command("interrupted","device1","chat_send",{"text":"stale overwrite forbidden"}).ok,"pre-interruption stale service window cannot overwrite recovered state")
			check(mock.redeem_mock_receipt(receipt.data,recovered).ok and mock.state.resources.ticket==tickets,"restored paid service receipt remains exactly once")
			var cloud:=recovered.command("interrupted","device1","cloud_download")
			check(cloud.ok and GameData.normalize(cloud.data.save.resources)==GameData.normalize(mock.state.resources),"restored cloud download retains exact paid game assets")
			real_battle(mock,"mock after service recovery")
	mock.release()
	var output:=FileAccess.open("res://docs/audits/%s-interrupted-files.json"%phase,FileAccess.WRITE)
	output.store_string(JSON.stringify({"phase":phase,"utc":Time.get_datetime_string_from_system(true),"checks":checks,"failures":failures,"actual_battles":battles,"scope":"Actual isolated Linux files with primary moved away after a verified backup copy. Tests failure-state protection and explicit recovery. No actual Windows process/crash verification or real payment."},"  "));output.close()
	print("INTERRUPTED FILE RECOVERY ",checks," checks / ",failures.size()," failures / ",battles.size()," actual battles")
	quit(0 if failures.is_empty() else 1)
