extends SceneTree
var failures: Array[String] = []
var checks := 0
var app: Control
var screen: EstateScreen
func check(value: bool, message: String) -> void:
	checks += 1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void:
	_run.call_deferred()
func _run() -> void:
	app = load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	app._go(0)
	app.set_process(false)
	app.body_scroll.vertical_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	app.body.size_flags_vertical=Control.SIZE_EXPAND_FILL
	for child in app.body.get_children(): app.body.remove_child(child); child.queue_free()
	screen = EstateScreen.build(app,app.body)
	await process_frame
	check(app.estate==screen.view,"heartbeat targets the actual native map")
	check(screen.view.terrain is TileMapLayer,"dedicated page retains authoritative native grid")
	check(screen.view.facilities.y_sort_enabled,"buildings and generated props share depth sorting")
	var source := JSON.stringify(app.state())
	var normal_offer := EstateScreen.build_offer(app.state(),"farm","p2")
	check(normal_offer.ok and not normal_offer.cost.is_empty(),"new estate shows valid real build cost")
	var poor: Dictionary = app.state().duplicate(true)
	for key in poor.resources: poor.resources[key]=0
	check(not EstateScreen.build_offer(poor,"farm","p2").ok,"unaffordable build is unavailable")
	check(not EstateScreen.build_offer(app.state(),"mine","p2").ok,"chapter-locked facility remains locked")
	screen._set_mode("build")
	screen._choose_type("farm")
	screen._select_plot("p2")
	check(screen.pending.get("action")=="build" and screen.view._ghost!=null,"build creates independent native preview")
	check(JSON.stringify(app.state())==source,"build preview never deducts or adds assets")
	screen._cancel_preview()
	check(screen.pending.is_empty() and screen.view._ghost==null and JSON.stringify(app.state())==source,"cancelled construction leaves persisted estate unchanged")
	screen._select_plot("p2")
	screen._confirm_preview()
	check(app.state().buildings.size()==3,"confirmation really commits one building")
	var farm := GameEconomy.building(app.state(),"farm-1")
	check(not farm.is_empty() and farm.plot=="p2" and farm.readyAt>0,"committed construction has real ready time")
	check(screen.view.building_nodes.has("farm-1") and screen.view.building_nodes["farm-1"].constructing,"map shows the persisted construction")
	var retained_node: BuildingView = screen.view.building_nodes["farm-1"]
	screen.view.set_state(app.state())
	check(screen.view.building_nodes["farm-1"]==retained_node,"heartbeat retains meshes rather than recreating facility nodes")
	screen._set_mode("edit")
	screen._select_building("farm-1")
	screen._select_plot("p3")
	var saved_plot := str(GameEconomy.building(app.state(),"farm-1").plot)
	check(screen.pending.get("action")=="moveBuilding" and saved_plot=="p2","move preview awaits explicit transaction confirmation")
	screen._cancel_preview()
	check(GameEconomy.building(app.state(),"farm-1").plot=="p2","move cancellation retains original placement")
	screen._select_plot("p3")
	screen._confirm_preview()
	check(GameEconomy.building(app.state(),"farm-1").plot=="p3","new layout confirmation writes actual building position")
	var directory: String = app.store.base_dir
	app.store.release()
	var reloaded := GameStore.new(directory)
	check(reloaded.load_slot("normal").ok and GameEconomy.building(reloaded.state,"farm-1").plot=="p3","construction and movement survive reload")
	reloaded.release()
	check(app.store.load_slot("normal").ok,"test app reacquires isolated ordinary store")
	var imported: Dictionary = app.store.import_save("res://tests/fixtures/estate-polish-state.json")
	check(imported.ok,"earned rich estate fixture imported through native validation")
	if imported.ok:
		screen.view.set_state(app.state())
		var expansion_id := ""
		for plot in GameEconomy.get_all_plots():
			if GameEconomy.expansion_info(app.state(),str(plot.id)).ok: expansion_id=str(plot.id); break
		check(not expansion_id.is_empty(),"fixture has legitimately affordable expansion")
		if not expansion_id.is_empty():
			var area_before := screen.view.land_cells.size()
			var cost: Dictionary = GameEconomy.expansion_info(app.state(),expansion_id).cost.duplicate(true)
			var wallet_before: Dictionary = app.state().resources.duplicate(true)
			check(screen._commit("expandPlot",{"plot":expansion_id}).ok,"expansion crosses real transaction")
			check(GameEconomy.plot_unlocked(app.state(),expansion_id) and screen.view.land_cells.size()>area_before,"paid expansion physically grows native terrain")
			for key in cost: check(app.state().resources[key]==wallet_before[key]-cost[key],"expansion deducts exact "+str(key))
		var workshop_id := ""
		var recipe_id := ""
		for b in app.state().buildings:
			for recipe in GameEconomy.get_recipes():
				if GameEconomy.can_queue_recipe(app.state(),str(b.id),str(recipe.id)).ok:
					workshop_id=str(b.id); recipe_id=str(recipe.id); break
			if not workshop_id.is_empty(): break
		check(not workshop_id.is_empty(),"earned fixture has legitimate production recipe")
		if not workshop_id.is_empty():
			check(screen._commit("queueRecipe",{"id":workshop_id,"recipeId":recipe_id}).ok,"actual locked recipe can be queued in eligible workshop")
			var workshop_before: Dictionary = GameEconomy.building(app.state(),workshop_id).duplicate(true)
			var target := ""
			for plot in GameEconomy.get_all_plots():
				if str(plot.id)!=str(workshop_before.plot) and GameEconomy.check_plot(app.state(),str(plot.id),str(workshop_before.type),workshop_id).is_empty(): target=str(plot.id); break
			check(not target.is_empty(),"production workshop has legal vacant move target")
			if not target.is_empty():
				screen._set_mode("edit")
				screen._select_building(workshop_id)
				screen._select_plot(target)
				screen._confirm_preview()
				var workshop_after: Dictionary = GameEconomy.building(app.state(),workshop_id)
				check(workshop_after.plot==target,"busy workshop moves through the dedicated screen")
				check(workshop_after.level==workshop_before.level and workshop_after.assigned==workshop_before.assigned and workshop_after.queue==workshop_before.queue,"move preserves real level, staff, queue and timestamps")
		var pending_before: int = EstateScreen.overview(app.state(),app.store.now_ms()).stock
		check(pending_before>0,"earned fixture has real warehouse production")
		var harvest := screen._commit("harvest",{})
		check(harvest.ok,"collect all uses authoritative warehouse transaction")
		check(EstateScreen.overview(app.state(),app.store.now_ms()).stock==0,"collected sources no longer show pending badges")
		check(not screen._commit("moveBuilding",{"id":"hall","plot":"p2"}).ok,"fixed landmark remains protected by authoritative rules")
	for dimensions in [Vector2i(360,800),Vector2i(540,960),Vector2i(800,1000)]:
		root.size = dimensions
		await process_frame
		screen._set_mode("build")
		await process_frame
		check(screen.size.x<=app.body.size.x+1,"screen respects available width "+str(dimensions.x))
		check(screen.catalog_grid.get_child_count()==1,"construction book shows one paged card at each width")
		check(screen.get_combined_minimum_size().y<=580,"all estate controls fit the smallest available page height")
		check(screen.view.size.x<=screen.size.x+1,"native map fits its dedicated page")
		var current_kind := str(CATEGORIES_FOR_TEST(screen.category)[screen.catalogue_index])
		screen._cycle_catalogue(1)
		check(str(CATEGORIES_FOR_TEST(screen.category)[screen.catalogue_index])!=current_kind,"next card reaches other facilities without scrolling")
		screen._set_mode("expand")
		await process_frame
		check(screen.get_combined_minimum_size().y<=580,"expansion also fits a single page")
		screen._set_mode("edit")
		await process_frame
		check(screen.get_combined_minimum_size().y<=580,"layout management also fits a single page")
	app.queue_free()
	await process_frame
	print("ESTATE SCREEN CHECKS: ",checks," failures: ",failures.size())
	quit(0 if failures.is_empty() else 1)

func CATEGORIES_FOR_TEST(category: String) -> Array:
	return EstateScreen.CATEGORIES[category]
