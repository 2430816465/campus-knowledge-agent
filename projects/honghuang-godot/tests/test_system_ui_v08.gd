extends SceneTree
var app: Control
var failures: Array[String]=[]
var checks: int=0
var cases: Array=[]
func _initialize() -> void: _run.call_deferred()
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func settle() -> void:
	for frame: int in 8: await process_frame
func inspect(node: Node,area: Rect2,context: String) -> void:
	if node is BaseButton and node.is_visible_in_tree():
		check(area.grow(2).encloses(node.get_global_rect()),context+" button "+node.text+" "+str(node.get_global_rect()))
	for child: Node in node.get_children(): inspect(child,area,context)
func _run() -> void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled=false
	await settle()
	check(SystemHub.catalog().size()==88,"88 entries from the user plan")
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(320,568)]:
		root.size=dimensions
		await settle()
		for entry: Dictionary in SystemHub.catalog():
			app._systems_page(str(entry.id))
			await settle()
			var pager: PagePager=app.page_pager
			var pages: int=maxi(1,pager.pages.size())
			for index: int in pages:
				pager.show_page(index)
				await settle()
				var context: String="%dx%d %s page%d" % [dimensions.x,dimensions.y,entry.id,index+1]
				var height: float=app.body.get_combined_minimum_size().y
				check(height<=app.body_scroll.size.y+2,context+" vertical content "+str(height))
				check(app.body_scroll.scroll_vertical==0 and app.body_scroll.scroll_horizontal==0,context+" does not require scrolling")
				inspect(app.body,app.body_scroll.get_global_rect(),context)
				cases.append({"size":str(dimensions),"id":entry.id,"page":index+1,"height":height,"available":app.body_scroll.size.y})
			app._close_modal()
	var file: FileAccess=FileAccess.open("res://evidence/system-ui-v08.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks":checks,"failures":failures,"cases":cases},"  "))
	file.close()
	app.store.release()
	app.queue_free()
	await settle()
	print("SYSTEM UI V08: ",checks," checks, ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
