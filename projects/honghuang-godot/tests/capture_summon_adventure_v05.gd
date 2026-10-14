extends SceneTree
## Native screenshots of actual main callbacks. Requires the graphical renderer.
var app: Control
var checks := 0
var failures: Array[String]=[]
var captures: Array[Dictionary]=[]
var overflow: Array[Dictionary]=[]
func _initialize() -> void: _run.call_deferred()
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _button(node: Node,text: String) -> Button:
	if node is Button and node.text.contains(text): return node
	for child: Node in node.get_children():
		var found: Button=_button(child,text)
		if found!=null: return found
	return null
func _inspect(node: Node,bounds: Rect2,name: String) -> void:
	if node is Control and node.is_visible_in_tree() and (node is Button or node is Label):
		var rect: Rect2=node.get_global_rect()
		if rect.position.x<bounds.position.x-2 or rect.end.x>bounds.end.x+2 or rect.position.y<bounds.position.y-2 or rect.end.y>bounds.end.y+2:
			overflow.append({"screen":name,"node":str(node.get_path()),"text":node.text,"rect":str(rect),"bounds":str(bounds)})
	for child: Node in node.get_children(): _inspect(child,bounds,name)
func _shot(name: String) -> void:
	for frame: int in 12: await process_frame
	_inspect(app.body,app.body_scroll.get_global_rect(),name)
	if is_instance_valid(app.overlay):
		var sheet: Control=app.overlay.get_node("Sheet")
		_inspect(sheet,sheet.get_global_rect(),name+"-modal")
	await RenderingServer.frame_post_draw
	var pixels: Image=root.get_texture().get_image()
	var path: String="res://evidence/single-screen/"+name+".png"
	check(pixels.save_png(path)==OK,"native capture "+name)
	captures.append({"name":name,"path":ProjectSettings.globalize_path(path),"size":[pixels.get_width(),pixels.get_height()],"page":app.page,"slot":app.store.slot,"revision":app.state().revision})
	print("SINGLE SCREEN CAPTURE ",name)
func _run() -> void:
	DirAccess.make_dir_recursive_absolute("res://evidence/single-screen")
	root.size=Vector2i(540,960); root.content_scale_size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true); root.add_child(app)
	await process_frame
	check(app.store.base_dir.begins_with("user://ui-tests-"),"actual main uses an isolated save")
	app.command("settings",{"key":"sound","value":false},false)
	app.command("settings",{"key":"music","value":false},false)
	app._go(3); await _shot("summon-540")
	app._summon(1); await _shot("summon-single-540")
	app._close_modal(); app._summon(10); await _shot("summon-ten-detail-540")
	var total: Button=_button(app.modal_box,"十连总览")
	check(total!=null,"ten results have a native overview tab")
	if total!=null: total.pressed.emit()
	await _shot("summon-ten-overview-540")
	app._close_modal()
	var summon: Node=app.body.find_child("SummonScreen",true,false)
	summon._set_mode("exchange"); await _shot("summon-exchange-540")
	app._load_slot("demo:expedition-project"); app.subpage="主线"; app._go(2)
	var adventure: Node=app.body.find_child("AdventureScreen",true,false)
	check(adventure!=null,"main invokes actual AdventureScreen")
	if adventure==null: quit(1); return
	for chapter: int in [1,2,3]:
		adventure._select_chapter(chapter)
		await _shot("adventure-chapter%d-540" % chapter)
	app._load_slot("normal")
	root.size=Vector2i(360,800); root.content_scale_size=Vector2i(360,800)
	app.set_meta("summon_v05_mode","permanent"); app._go(3)
	await _shot("summon-360")
	summon=app.body.find_child("SummonScreen",true,false)
	summon._set_mode("exchange"); await _shot("summon-exchange-360")
	summon._rules(); await _shot("summon-rules-360")
	app._close_modal(); summon._history(); await _shot("summon-history-360")
	app._close_modal(); summon._wish_choices(); await _shot("summon-wish-360")
	app._close_modal(); summon._pool(); await _shot("summon-pool-360")
	app._close_modal()
	var saved: Array=app.state().drawHistory[-1].results.duplicate(true)
	SummonScreen.show_results(app,saved,10); await _shot("summon-ten-detail-360")
	_button(app.modal_box,"十连总览").pressed.emit(); await _shot("summon-ten-overview-360")
	app._close_modal(); app.subpage="主线"; app._go(2)
	await _shot("adventure-new-360")
	app._load_slot("demo:expedition-project"); app.subpage="主线"; app._go(2)
	adventure=app.body.find_child("AdventureScreen",true,false)
	adventure._select_chapter(3); await _shot("adventure-chapter3-360")
	check(overflow.is_empty(),"all page and modal labels/buttons fit the visible bounds without scrolling")
	var report: Dictionary={"engine":Engine.get_version_info().string,"renderer":RenderingServer.get_video_adapter_name(),"checks":checks,"failures":failures,"overflow":overflow,"captures":captures,"method":"actual native main scene + real button callbacks + isolated GameStore; no scroll interaction; direct rendered viewport"}
	var file: FileAccess=FileAccess.open("res://evidence/single-screen/report.json",FileAccess.WRITE); file.store_string(JSON.stringify(report,"  "));file.close()
	app.store.release(); app.queue_free(); await process_frame
	quit(0 if failures.is_empty() else 1)
