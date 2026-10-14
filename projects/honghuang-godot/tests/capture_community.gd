extends SceneTree
## Actual native UI controls, callbacks and screenshots in an isolated save.
var app: Control
var checks: int=0
var failures: Array[String]=[]
var captures: Array[Dictionary]=[]
var observations: Array[Dictionary]=[]

func _initialize() -> void: _run.call_deferred()

func check(condition: bool,message: String) -> void:
	checks+=1
	if not condition:
		failures.append(message)
		push_error(message)

func _find_button(node: Node,text: String) -> Button:
	if node is Button and node.text==text: return node
	for child: Node in node.get_children():
		var found: Button=_find_button(child,text)
		if found!=null: return found
	return null

func _press(text: String,modal: bool=false) -> void:
	var scope: Node=app.overlay if modal else app.body
	var target: Button=_find_button(scope,text)
	check(target!=null and not target.disabled,"visible enabled button: "+text)
	if target!=null and not target.disabled: target.emit_signal("pressed")
	await process_frame

func _inspect(node: Node,scope: Control,name: String) -> void:
	if node is Control and node.is_visible_in_tree() and (node is Label or node is Button or node is HBoxContainer):
		var rect: Rect2=node.get_global_rect()
		var bounds: Rect2=scope.get_global_rect()
		var left: bool=rect.position.x<bounds.position.x-2
		var right: bool=rect.end.x>bounds.end.x+2
		if left or right:
			observations.append({"screen":name,"node":str(node.get_path()),"text":node.text if node is Label or node is Button else "row","x":rect.position.x,"width":rect.size.x,"scope_x":bounds.position.x,"scope_width":bounds.size.x})
	for child: Node in node.get_children(): _inspect(child,scope,name)

func _shot(name: String) -> void:
	for frame: int in 6: await process_frame
	check(app.body.get_combined_minimum_size().y<=app.body_scroll.size.y+2,"single-screen content height: "+name)
	check(app.body_scroll.scroll_vertical==0,"no vertical scrolling: "+name)
	_inspect(app.body,app.body_scroll,name)
	if is_instance_valid(app.overlay):
		var sheet: Control=app.overlay.find_child("Sheet",true,false)
		if sheet!=null: _inspect(sheet,sheet,name+"-modal")
	await RenderingServer.frame_post_draw
	var image: Image=root.get_texture().get_image()
	var path: String="res://evidence/community/"+name+".png"
	var error: Error=image.save_png(path)
	check(error==OK,"native screenshot saves: "+name)
	captures.append({"name":name,"path":ProjectSettings.globalize_path(path),"width":image.get_width(),"height":image.get_height(),"logical_size":str(app.size),"content_minimum_height":app.body.get_combined_minimum_size().y,"available_height":app.body_scroll.size.y})
	print("COMMUNITY CAPTURE ",name)

func _run() -> void:
	DirAccess.make_dir_recursive_absolute("res://evidence/community")
	auto_accept_quit=false
	root.size=Vector2i(390,844)
	root.content_scale_size=Vector2i(390,844)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	check(app.store.base_dir.begins_with("user://ui-tests-"),"native UI uses isolated normal save")
	app._go(6)
	await _shot("single-guild-unjoined-390")
	await _press("创建自己的仙盟")
	var field: LineEdit
	for child: Node in app.modal_box.get_children():
		if child is LineEdit: field=child
	check(field!=null,"create guild name field exists")
	var create: Button=_find_button(app.overlay,"创建仙盟")
	check(create!=null and create.disabled,"empty guild name is disabled")
	if field!=null:
		field.text="云海同道"
		field.emit_signal("text_changed",field.text)
	await _shot("single-guild-create-390")
	await _press("创建仙盟",true)
	check(app.state().community.guild.name=="云海同道","create button commits actual guild")
	app.toast_time=0.0
	app.toast_label.visible=false
	await _shot("single-guild-tasks-unready-390")
	await _press("捐献")
	await _press("捐献一次")
	await _shot("single-guild-donation-confirm-390")
	var before: Dictionary=app.state().resources.duplicate(true)
	await _press("取消",true)
	check(app.state().resources==before and app.state().community.donations==0,"donation cancellation preserves assets")
	await _press("捐献一次")
	await _press("确认捐献",true)
	check(app.state().community.donations==1 and app.state().community.coins==50,"donation confirmation commits once")
	await _press("委托")
	app.toast_time=0.0
	app.toast_label.visible=false
	await _shot("single-guild-tasks-ready-390")
	await _press("领取")
	await _shot("single-guild-task-confirm-390")
	await _press("确认领取",true)
	check(app.state().community.coins==80,"task confirmation commits actual contribution")
	await _press("商店")
	app.toast_time=0.0
	app.toast_label.visible=false
	await _shot("single-guild-shop-390")
	await _press("兑换")
	await _shot("single-guild-shop-confirm-390")
	await _press("确认兑换",true)
	check(app.state().community.coins==0 and app.state().community.purchases.ticket==1,"exchange confirms actual quota and cost")
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(390,844),Vector2i(360,800),Vector2i(320,844)]:
		root.size=dimensions
		root.content_scale_size=dimensions
		for frame: int in 6: await process_frame
		print("COMMUNITY VIEWPORT ",dimensions)
		for tab: String in ["委托","商店","捐献","成员"]:
			app.set_meta("community_tab",tab)
			app._go(6)
			app.toast_time=0.0
			app.toast_label.visible=false
			await _shot("single-guild-%s-%d" % [tab,dimensions.x])
			if tab in ["商店","成员"]:
				await _press("下一页")
				await _shot("single-guild-%s-page2-%d" % [tab,dimensions.x])
				if tab=="成员":
					await _press("下一页")
					await _shot("single-guild-%s-page3-%d" % [tab,dimensions.x])
					await _press("上一页")
				await _press("上一页")
		for board: String in ["power","progress","contribution"]:
			app.community_board=board
			app._go(7)
			await _shot("single-rank-%s-%d" % [board,dimensions.x])
			await _press("下一页")
			await _shot("single-rank-%s-page2-%d" % [board,dimensions.x])
			await _press("下一页")
			await _shot("single-rank-%s-page3-%d" % [board,dimensions.x])
			await _press("上一页")
			await _press("上一页")
		app.set_meta("community_tab","成员")
		app._go(6)
		await _press("退出")
		await _shot("single-guild-leave-confirm-%d" % dimensions.x)
		await _press("留在仙盟",true)
		check(not app.state().community.guild.is_empty(),"leave cancellation preserves membership")
	check(observations.is_empty(),"all community labels, buttons and rows fit 320/360/390/540 content width")
	var report: Dictionary={"engine":Engine.get_version_info().string,"utc":Time.get_datetime_string_from_system(true),"checks":checks,"failures":failures,"horizontal_overflow":observations,"captures":captures,"save_scope":app.store.base_dir,"method":"Godot native controls; actual command callbacks; single-screen pages and explicit pagination; isolated fresh save"}
	var file: FileAccess=FileAccess.open("res://evidence/community/ui-report.json",FileAccess.WRITE)
	if file!=null:
		file.store_string(JSON.stringify(report,"  "))
		file.close()
	print("COMMUNITY UI: ",checks," checks, ",failures.size()," failures, ",observations.size()," overflow observations")
	app.store.release()
	app.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
