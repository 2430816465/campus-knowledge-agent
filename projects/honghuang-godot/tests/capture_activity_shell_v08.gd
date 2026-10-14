extends SceneTree
var checks: int=0
var failures: Array[String]=[]
func _initialize() -> void: _run.call_deferred()
func settle() -> void:
	for frame: int in 16: await process_frame
func inspect(node: Node,area: Rect2,context: String) -> void:
	if node is Control and not node.is_visible_in_tree(): return
	if node is BaseButton:
		checks+=1
		if not area.grow(2).encloses(node.get_global_rect()): failures.append(context+" "+str(node.name)+" "+str(node.get_global_rect()))
	for child: Node in node.get_children(): inspect(child,area,context)
func _run() -> void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled=false
	await settle()
	var resources_before: String=JSON.stringify(app.state().resources)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/activities-shell-v08"))
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(320,568)]:
		root.size=dimensions
		await settle()
		for id: String in ["003","047","049","061","083"]:
			app._systems_page(id)
			await settle()
			for index: int in maxi(1,app.page_pager.pages.size()):
				app.page_pager.show_page(index)
				await settle()
				var context: String="%dx%d-%s-page%d" % [dimensions.x,dimensions.y,id,index+1]
				var area: Rect2=app.body_scroll.get_global_rect()
				inspect(app.body,area,context)
				checks+=2
				if app.body.get_combined_minimum_size().y>area.size.y+2: failures.append(context+" min-height exceeds viewport")
				if app.body_scroll.scroll_vertical!=0: failures.append(context+" needs scrolling")
				await RenderingServer.frame_post_draw
				root.get_texture().get_image().save_png("res://evidence/activities-shell-v08/"+context+".png")
				print(context," body=",area," content=",app.body.get_combined_minimum_size().y)
	checks+=1
	if JSON.stringify(app.state().resources)!=resources_before: failures.append("viewing screens mutated resources")
	app.store.release()
	app.queue_free()
	await settle()
	for failure: String in failures: push_error(failure)
	print("ACTIVITIES SHELL CAPTURE V08: ",checks," checks, ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
