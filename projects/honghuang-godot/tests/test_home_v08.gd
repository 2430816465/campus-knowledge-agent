extends SceneTree
const Home = preload("res://scripts/home_screen.gd")
var failures: Array[String] = []
var checks := 0
class ViewApp extends Control:
	const RESOURCE_NAMES := {"stone":"灵石","xp":"修为","material":"灵材"}
	var data: Dictionary
	var routes: Array = []
	var store: Dictionary={"corruption":false}
	func state() -> Dictionary: return data
	func _settings() -> void: routes.append("settings")
	func _systems_page(id: String) -> void: routes.append(id)
	func _shared_gear_choices(id: String) -> void: routes.append("gear:"+id)
	func _go(page: int) -> void: routes.append("page:"+str(page))

func _initialize() -> void: _run.call_deferred()
func check(ok: bool,why: String) -> void:
	checks += 1
	if not ok: failures.append(why)
func _run() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/home-v08"))
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size = Vector2i.ZERO
	var app := ViewApp.new()
	app.theme = GameTheme.create()
	app.data = GameData.all().initialState.duplicate(true)
	GameProgression.ensure_state(app.data)
	var before := JSON.stringify(app.data)
	root.add_child(app)
	app.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var body := VBoxContainer.new()
	app.add_child(body)
	body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	body.offset_bottom = -108
	Home.build(app,body)
	for viewport_size: Vector2i in [Vector2i(540,960),Vector2i(360,800),Vector2i(320,844),Vector2i(360,640),Vector2i(320,568)]:
		root.size = viewport_size
		for frame in range(18): await process_frame
		var home: Control = body.get_node("CultivationHome")
		var rect := home.get_global_rect()
		var name := "%dx%d" % [viewport_size.x,viewport_size.y]
		var count := 0
		var activity_bottom := 0.0
		for node: Node in home.get_children():
			if not node is Button: continue
			var button: Button=node
			count += 1
			check(rect.grow(0.5).encloses(button.get_global_rect()),name+" outside "+str(button.name)+" "+str(button.get_global_rect()))
			check(button.size.x>=40 and button.size.y>=23,name+" tiny "+str(button.name)+" "+str(button.size))
			if button.has_meta("system_id"):
				activity_bottom=maxf(activity_bottom,button.position.y+button.size.y)
				button.pressed.emit()
				check(app.routes.back()==button.get_meta("system_id"),name+" route "+str(button.name))
		check(activity_bottom<=home.info_rect.position.y,name+" activities overlap progression")
		check(home.info_rect.end.y<=home.gear_rect.position.y,name+" progression overlaps gear")
		check(home.gear_rect.end.y<=home.chat_rect.position.y,name+" gear overlaps chat")
		for prefix in ["SharedGear_","HomeSide_"]:
			var expected := 12 if prefix=="SharedGear_" else 4
			check(home.find_children(prefix+"*","Button",false,false).size()==expected,name+" count "+prefix)
		for label: Node in home.find_children("HomeStat*","Label",false,false):
			var text_width: float=label.get_theme_font("font").get_string_size(label.text,HORIZONTAL_ALIGNMENT_LEFT,-1,label.get_theme_font_size("font_size")).x
			check(text_width<=label.size.x,name+" stat overflow "+label.text)
		check(count==37,name+" expected 37 actions got "+str(count))
		if DisplayServer.get_name()!="headless":
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://evidence/home-v08/"+name+".png")
		print(name," home=",rect," buttons=",count)
	check(before==JSON.stringify(app.data),"Home changed state")
	# Actual resource changes must remain readable after the periodic presentation refresh.
	app.data.resources.stone=99999999
	app.data.resources.xp=999999999
	app.data.resources.material=12345678
	await create_timer(0.8).timeout
	var small_home: Control=body.get_node("CultivationHome")
	for key: String in ["stone","xp","material"]:
		var resource: Button=small_home.get_node("HomeResource_"+key)
		var label: Label=resource.get_child(1)
		check(label.get_theme_font("font").get_string_size(label.text,HORIZONTAL_ALIGNMENT_LEFT,-1,label.get_theme_font_size("font_size")).x<=label.size.x,"large balance clips "+key)
		check(resource.tooltip_text.ends_with(str(app.data.resources[key])),"large balance exact tooltip "+key)
	check(small_home.get_node("Entry_checkin/Notice").visible,"unclaimed daily check-in needs a real notice")
	# Earn the actual shipped commemorative card through the activity rules.
	GameActivities.ensure_state(app.data)
	for i: int in 3:
		check(GameActivities.command(app.data,"activityAct",{"id":"083","action":"craft"}).ok,"real lantern crafting")
	check(GameActivities.command(app.data,"activityAct",{"id":"083","action":"riddle","choice":int(GameActivities.rules().riddle.correct)}).ok,"real riddle earns flower tokens")
	check(GameActivities.command(app.data,"activityFestivalExchange",{"id":"083","offer":"lantern"}).ok,"real tokens buy shipped commemorative card")
	check(GameActivities.command(app.data,"activityEquipCosmetic",{"cosmetic":"lantern-v08"}).ok,"equip owned earned commemorative card")
	await create_timer(0.8).timeout
	check(small_home.get_node("HomeLocalChat/HomeLocalRecord").text.contains(GameActivities.cosmetic_name(app.data)),"home displays actually earned equipped card")
	check(small_home.get_node("HomeAvatar").tooltip_text.contains("万灯长明"),"avatar explains actual commemorative card")
	app.store.corruption=true
	await create_timer(0.8).timeout
	for key: String in ["stone","xp","material"]:
		var entry: Button=small_home.get_node("HomeResource_"+key)
		check(entry.get_child(1).text=="—" and entry.tooltip_text.contains("待恢复"),"corruption masks home balance and tooltip "+key)
	check(small_home.get_node("HomePowerNumber").text=="—" and small_home.get_node("HomePowerNumber").tooltip_text.contains("未知"),"corruption masks home power and tooltip")
	check(not small_home.get_node("HomeAvatar").tooltip_text.contains("万灯长明"),"corruption does not expose temporary identity")
	app.store.corruption=false
	check(GameActivities.command(app.data,"activityEquipCosmetic",{"cosmetic":""}).ok,"unequip actual card")
	await create_timer(0.8).timeout
	check(not small_home.get_node("HomeLocalChat/HomeLocalRecord").text.contains("万灯长明"),"home clears unequipped card")
	check(small_home.get_node("HomePowerNumber").text!="—" and not small_home.get_node("HomeAvatar").disabled,"validated profile restores actual home presentation")
	print("HOME_V08 checks=",checks," failures=",failures.size())
	for failure: String in failures: print("FAIL ",failure)
	quit(0 if failures.is_empty() else 1)
