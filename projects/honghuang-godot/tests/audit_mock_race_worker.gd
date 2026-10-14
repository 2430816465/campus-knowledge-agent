extends SceneTree
func _initialize() -> void:
	var directory := ""
	var worker := ""
	var barrier := 0
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--directory="): directory=arg.trim_prefix("--directory=")
		if arg.begins_with("--worker="): worker=arg.trim_prefix("--worker=")
		if arg.begins_with("--barrier="): barrier=int(arg.trim_prefix("--barrier="))
	if not directory.begins_with("user://tests/audit-mock-race-") or worker not in ["a","b"]: quit(2); return
	while GameData.now_ms() < barrier: OS.delay_msec(1)
	var outcomes: Array = []
	for index in 50:
		var service := GameOnlineMock.new(directory.path_join("service.json"))
		var loaded := service.load_data()
		var request := "request-%s-%d" % [worker,index]
		var operation := "chat_send" if index%2==0 else "payment_create"
		var args := {"text":"Actual concurrent local mock message "+request,"request_id":request} if operation=="chat_send" else {"sku":"test_small","request_id":request}
		var result := service.command("race"+worker,"device"+worker,operation,args) if loaded.ok else loaded
		outcomes.append({"operation":operation,"request_id":request,"ok":result.ok,"data":result.data,"error":result.error,"revision":service._revision})
		OS.delay_msec(1)
	var file := FileAccess.open(directory.path_join("worker-"+worker+".json"),FileAccess.WRITE)
	file.store_string(JSON.stringify({"worker":worker,"outcomes":outcomes}));file.close()
	quit()
