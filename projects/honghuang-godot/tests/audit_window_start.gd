extends SceneTree
## Ordinary production main scene startup with isolated storage. This driver
## deliberately never sets window size, position, stretch or display settings.
var phase:="round-4-window-before"
var initial_size:Vector2i
func _initialize()->void:
	initial_size=root.size
	if FileAccess.file_exists("res://docs/audits/window-request.json"):
		var request:Variant=JSON.parse_string(FileAccess.get_file_as_string("res://docs/audits/window-request.json"))
		if request is Dictionary:phase=str(request.get("phase",phase))
	_run.call_deferred()
func _run()->void:
	var app:Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	for frame in 40:await process_frame
	await RenderingServer.frame_post_draw
	var usable:=DisplayServer.screen_get_usable_rect()
	var client:=Rect2i(root.position,root.size)
	var image_path:="res://docs/audits/%s.png"%phase
	var saved:=root.get_texture().get_image().save_png(image_path)
	var report:={"phase":phase,"utc":Time.get_datetime_string_from_system(true),"platform":OS.get_name(),"display_server":DisplayServer.get_name(),"initial_project_client_size":[initial_size.x,initial_size.y],"native_client_rect":[client.position.x,client.position.y,client.size.x,client.size.y],"usable_workarea":[usable.position.x,usable.position.y,usable.size.x,usable.size.y],"client_inside_workarea":usable.encloses(client),"overflow_bottom":maxi(0,client.end.y-usable.end.y),"image":image_path,"capture_error":saved,"method":"Unmodified main scene startup from project settings with isolated ui_test storage. The audit script does not set or resize the window. Client rectangle excludes titlebar decorations, so any client overflow is already a confirmed failure to fit."}
	var file:=FileAccess.open("res://docs/audits/%s.json"%phase,FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  "));file.close()
	print("NATIVE_STARTUP_WINDOW ",JSON.stringify(report))
