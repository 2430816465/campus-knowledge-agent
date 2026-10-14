extends SceneTree
var count := 0
var errors: Array = []
func ck(value:bool,message:String)->void:
 count+=1
 if not value:errors.append(message)
func _initialize()->void:
 var directory := "user://tests/interrupted-%s-%s-%s"%[int(Time.get_unix_time_from_system()),OS.get_process_id(),Time.get_ticks_usec()]
 var store:=GameStore.new(directory)
 ck(store.load_slot().ok,"create real ordinary profile")
 ck(store.transact("claimMail",{"id":"godot-welcome-1"}).ok,"ordinary earned reward committed")
 ck(store.transact("settings",{"key":"speed","value":2}).ok,"ordinary revision advances")
 var previous:=store.state.duplicate(true)
 var old_text:=FileAccess.get_file_as_string(store._path)
 ck(store._write_atomic(store._path+".backup",old_text).ok,"prepare valid backup as commit does")
 ck(DirAccess.rename_absolute(store._path,store._path+".interrupted-original")==OK,"simulate missing destination interval without deleting original")
 store.release()
 var recovered:=GameStore.new(directory)
 var result:=recovered.load_slot()
 ck(not result.ok and result.get("backupAvailable",false) and recovered.corruption and recovered.readonly,"missing primary is recovery state not new game")
 ck(not FileAccess.file_exists(recovered._path),"no blank primary created")
 ck(FileAccess.get_file_as_string(recovered._path+".backup")==old_text,"backup remains byte exact")
 ck(not recovered.transact("summon",{"count":1}).ok,"mutations rejected until explicit restore")
 recovered.fail_writes=true
 ck(not recovered.restore_backup().ok,"failed recovery write leaves backup")
 ck(FileAccess.get_file_as_string(recovered._path+".backup")==old_text,"failed recovery preserves original backup")
 recovered.fail_writes=false
 ck(recovered.restore_backup().ok,"explicit backup restore succeeds")
 ck(recovered.state.resources==previous.resources and recovered.state.owned==previous.owned,"exact committed assets restored")
 ck(recovered.state.revision>previous.revision,"restored revision never rewinds")
 ck(recovered.transact("summon",{"count":1,"txid":"after-restore"}).ok,"play continues through real transaction")
 ck(recovered.state.resources.ticket==previous.resources.ticket-1,"continued play debits exactly once")
 recovered.release()
 var service_path:=directory.path_join("service.json")
 var service:=GameOnlineMock.new(service_path,"normal")
 ck(service.command("a","one","login",{"nickname":"测试甲"}).ok,"create real local mock account")
 ck(service.command("a","one","chat_send",{"text":"恢复前已保存","channel":"world","request_id":"saved"}).ok,"mock message persisted")
 var service_before:=service.snapshot()
 var service_raw:=FileAccess.get_file_as_string(service_path)
 ck(DirAccess.copy_absolute(service_path,service_path+".backup")==OK,"mock commit backup fixture")
 ck(DirAccess.rename_absolute(service_path,service_path+".interrupted-original")==OK,"mock interrupted destination fixture")
 var service_recovered:=GameOnlineMock.new(service_path,"normal")
 ck(not service_recovered.load_data().ok and service_recovered._corrupt,"mock missing primary not empty database")
 ck(not FileAccess.file_exists(service_path),"mock startup creates no replacement")
 ck(not service_recovered.command("b","two","login",{}).ok,"mock cannot erase history with new login")
 ck(service_recovered.restore_backup().ok,"mock explicit restore")
 ck(GameData.normalize(service_recovered.data.realms)==GameData.normalize(service_before.realms),"all mock accounts/messages restored")
 ck(service_recovered._revision>int(service_before.revision),"mock restore revision increases")
 ck(not service.command("a","one","chat_send",{"text":"旧窗口","channel":"world","request_id":"stale"}).ok,"old mock observer cannot overwrite restoration")
 ck(service_recovered.command("a","one","chat_send",{"text":"恢复后继续","channel":"world","request_id":"after"}).ok,"mock service remains usable")
 ck(service_recovered.command("a","one","chat_history",{"channel":"world"}).data.size()==2,"only two acknowledged messages")
 var valid_copy:=FileAccess.get_file_as_string(service_path)
 var bad:=FileAccess.open(service_path,FileAccess.WRITE)
 bad.store_string("broken bytes");bad.close()
 ck(not service_recovered.load_data().ok,"corruption protected")
 ck(service_recovered.restore_backup().ok,"corrupt current can restore valid backup")
 var preserved:=false
 for f in DirAccess.get_files_at(directory):
  if f.begins_with("service.json.before-restore-") and FileAccess.get_file_as_string(directory.path_join(f))=="broken bytes":preserved=true
 ck(preserved,"corrupt service evidence retained")
 ck(GameStore.decode_save(FileAccess.get_file_as_string(directory.path_join("normal.json"))).ok,"ordinary profile unaffected by service restore")
 print("INTERRUPTED SAVE: ",count," checks, ",errors.size()," failures; simulated missing-file state, not Windows execution")
 for err in errors:push_error(err)
 quit(0 if errors.is_empty() else 1)
