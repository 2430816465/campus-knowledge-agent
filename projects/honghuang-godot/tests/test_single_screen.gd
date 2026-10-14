extends SceneTree
var app: Control
var failures: Array=[]
var checks: int=0
var observations: Array=[]
func _initialize() -> void: _run.call_deferred()
func check(ok: bool,message: String) -> void:
	checks+=1
	if not ok: failures.append(message); push_error(message)
func settle() -> void:
	for i: int in 12: await process_frame
func inspect_buttons(node: Node,area: Rect2,context: String) -> void:
	if node is BaseButton and node.is_visible_in_tree():
		check(area.grow(2).encloses(node.get_global_rect()),context+" button outside page: "+str(node.name)+" "+node.text+" "+str(node.get_global_rect()))
	for child: Node in node.get_children(): inspect_buttons(child,area,context)
func inspect(context: String,modal: bool=false) -> void:
	await settle()
	var pager: PagePager=app.modal_pager if modal else app.page_pager
	var content: Control=app.modal_box if modal else app.body
	if not is_instance_valid(content): check(false,context+" missing content"); return
	var viewport: Control=pager.viewport if pager else app.body_scroll
	var count: int=maxi(1,pager.pages.size()) if pager else 1
	for index: int in count:
		if pager: pager.show_page(index)
		await settle()
		var required: float=content.get_combined_minimum_size().y
		check(required<=viewport.size.y+2,context+" page%d height %.1f > %.1f" % [index+1,required,viewport.size.y])
		check(viewport.scroll_vertical==0 and viewport.scroll_horizontal==0,context+" requires scrolling")
		inspect_buttons(content,viewport.get_global_rect(),context+" page%d" % (index+1))
		observations.append({"case":context,"page":index+1,"pages":count,"required":required,"available":viewport.size.y})
	check(app.get_rect().grow(1).encloses(app.nav.get_global_rect()),context+" navigation outside window")
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
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(360,800)]:
		root.size=dimensions
		await settle()
		var prefix: String=str(dimensions.x)+"x"+str(dimensions.y)+" "
		for page: int in [5,0,1,2,3,4,6,7]:
			app._go(page)
			await inspect(prefix+"page"+str(page))
		for section: String in ["任务","背包","工程","设置"]:
			app.page=4; app.subpage=section; app._render()
			await inspect(prefix+section)
		for section: String in ["主线","秘境","演武"]:
			app.page=2; app.subpage=section; app._render()
			await inspect(prefix+section)
		for tab: String in ["培养","神通","灵宝","装备","仙人志"]:
			app.set_meta("hero_tab",tab)
			app._open_character("nezha")
			await inspect(prefix+"nezha/"+tab)
		for method: String in ["_team","_presets","_preparation","_synergy","_local_mail","_activities","_idle_missions","_shop","_gear_bag","_trial_team","_building_list","_settings"]:
			app.call(method)
			await inspect(prefix+method,true)
			app._close_modal()
		app._stage_preview(1)
		await inspect(prefix+"stage-preview",true)
		app._close_modal()
		app._show_building(str(app.state().buildings[0].id))
		await inspect(prefix+"building-details",true)
		app._close_modal()
	# Rapidly close/rebuild a paged modal across awaited layouts; no stale-tree callbacks.
	for i: int in 10:
		app._trial_team()
		await process_frame
		app._close_modal()
	await settle()
	var report: FileAccess=FileAccess.open("res://evidence/single-screen-layout.json",FileAccess.WRITE)
	report.store_string(JSON.stringify({"checks":checks,"failures":failures,"observations":observations},"  "))
	report.close()
	print("SINGLE SCREEN: ",checks," checks, ",failures.size()," failures")
	app.store.release()
	app.queue_free()
	await settle()
	quit(0 if failures.is_empty() else 1)
