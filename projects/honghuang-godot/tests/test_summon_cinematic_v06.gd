extends SceneTree
# Unapproved development prototype only. These checks do not validate or
# fulfill the requested complete video animation; ordinary play disables it.
const Cinematic = preload("res://scripts/summon_cinematic.gd")
var checks := 0
var failures: Array[String]=[]
var captures: Array[String]=[]

class TestApp extends Control:
	var store: GameStore
	var body: VBoxContainer
	var overlay: Control
	var modal_box: VBoxContainer
	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		theme=GameTheme.create()
		body=VBoxContainer.new()
		body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(body)
	func state() -> Dictionary: return store.state
	func command(operation: String,args: Dictionary={},_refresh: bool=true) -> Dictionary: return store.transact(operation,args)
	func _render() -> void:
		for child: Node in body.get_children(): body.remove_child(child); child.queue_free()
		SummonScreen.build(self,body)
	func _modal(_title: String) -> VBoxContainer:
		_close_modal()
		overlay=Control.new(); overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); add_child(overlay)
		var panel := PanelContainer.new(); panel.name="Sheet"; overlay.add_child(panel)
		panel.position=Vector2(16,50); panel.size=size-Vector2(32,100)
		modal_box=VBoxContainer.new(); panel.add_child(modal_box)
		return modal_box
	func _close_modal() -> void:
		if is_instance_valid(overlay): remove_child(overlay); overlay.queue_free()
		overlay=null; modal_box=null
	func _fit_modal() -> void: pass
	func _open_character(_id: String) -> void: pass
	func _try_character(_id: String) -> void: pass
	func _confirm(_title: String,_description: String,_action: Callable) -> void: pass

func _initialize() -> void: _run.call_deferred()
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func settle() -> void:
	for frame: int in 4: await process_frame
func text_of(node: Node) -> String:
	if node==null: return ""
	var output: String=node.text if node is Label else ""
	for child: Node in node.get_children(): output+="\n"+text_of(child)
	return output
func capture(path: String) -> void:
	if DisplayServer.get_name()=="headless": return
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(path)
	captures.append(path)

func _run() -> void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	var ids := {}
	for hero: Dictionary in GameData.content("CHARACTERS"):
		if not ids.has(int(hero.stars)): ids[int(hero.stars)]=str(hero.id)
	var app := TestApp.new()
	app.set_meta("ui_test",true)
	app.set_meta("preview_unapproved_summon",true)
	app.store=GameStore.new("user://summon-cinematic-v06-%d" % Time.get_ticks_usec())
	check(app.store.load_slot().ok,"isolated real save created")
	check(app.command("settings",{"key":"sound","value":false}).ok,"sound setting saved through real store")
	root.add_child(app)
	app.set_meta("page_content_height",740)
	app._render()
	await settle()
	var initial: String=JSON.stringify(app.state())
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://evidence/summon-v06"))
	for rarity: int in [3,4,5]:
		var animation: Control=Cinematic.new()
		animation.configure([{"id":ids[rarity]}],false,false)
		animation.playing=false
		app.add_child(animation)
		await settle()
		check(is_equal_approx(animation.duration(),7.0),"normal animation is seven seconds")
		check(is_equal_approx(animation.duration()-animation.reveal_start(),2.0),"last exactly two seconds reveal rarity")
		for instant: float in [0,1.59,1.60,3.14,3.15,4.999]:
			animation.seek_preview(instant)
			check(not animation.rarity_is_visible(),"rarity %d concealed at %.3fs" % [rarity,instant])
			check(animation.visible_color()==Cinematic.NEUTRAL,"neutral particle color identical at %.3fs" % instant)
			check(not animation.rarity_label.visible and not animation.stars.visible,"no premature rarity text or star count")
			check(not animation.has_meta("revealed_rarity"),"no premature revealed rarity metadata")
		for instant: float in [5.0,5.2,6.0,6.999]:
			animation.seek_preview(instant)
			check(animation.rarity_is_visible(),"rarity visible at %.3fs" % instant)
			check(animation.visible_color()==Cinematic.RARITY_COLORS[rarity],"correct blue/purple/gold tier color")
			check(animation.rarity_label.text.contains({3:"三星",4:"四星",5:"五星"}[rarity]),"rarity supported with readable star text")
			check(animation.stars.text.count("★")==rarity,"star count matches real rarity")
		check(JSON.stringify(app.state())==initial,"all timing previews are read-only")
		animation.seek_preview(5.8)
		await capture("res://evidence/summon-v06/rarity-%d-540.png" % rarity)
		animation.dismiss_without_results()
		await settle()
	var animation: Control=Cinematic.new()
	animation.configure([{"id":ids[3]},{"id":ids[5]},{"id":ids[4]}],false,false)
	animation.playing=false
	app.add_child(animation)
	await settle()
	check(animation.rarity==5 and animation.draw_count==3,"multidraw visual uses highest committed rarity")
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(360,800)]:
		root.size=dimensions
		await settle()
		for instant: float in [0.8,2.45,4.1,5.75]:
			animation.seek_preview(instant)
			await settle()
			for node: Control in [animation.skip_button,animation.heading,animation.caption,animation.rarity_label,animation.stars,animation.batch_label]:
				if node.visible: check(animation.get_global_rect().grow(1).encloses(node.get_global_rect()),"animation controls fit %s t=%.2f %s" % [str(dimensions),instant,node.name])
			await capture("res://evidence/summon-v06/%dx%d-%s.png" % [dimensions.x,dimensions.y,animation.phase_at(instant)])
	animation.dismiss_without_results()
	await settle()
	root.size=Vector2i(540,960)
	await settle()
	var tickets: int=int(app.state().resources.ticket)
	var previous_history: int=app.state().drawHistory.size()
	SummonScreen.draw(app,1)
	animation=app.get_meta(SummonScreen.ACTIVE_CINEMATIC,null)
	check(is_instance_valid(animation),"explicit development flags enable the unapproved prototype")
	animation.playing=false
	check(app.state().resources.ticket==tickets-1,"single draw commits exactly one ticket before presentation")
	check(app.state().drawHistory.size()==previous_history+1,"single draw recorded once before any skip")
	var committed: String=JSON.stringify(app.state())
	SummonScreen.draw(app,1)
	SummonScreen.draw(app,10)
	check(JSON.stringify(app.state())==committed,"repeated calls during animation never debit or reroll")
	check(bool(app.get_meta(SummonScreen.DRAW_LOCK,false)),"application lock stays active across screen rebuild")
	app._render()
	SummonScreen.draw(app,1)
	check(JSON.stringify(app.state())==committed,"rerender does not clear transaction lock")
	animation.skip_button.pressed.emit()
	animation.skip()
	await settle()
	check(not bool(app.get_meta(SummonScreen.DRAW_LOCK,true)),"skip releases lock")
	check(not app.has_meta(SummonScreen.ACTIVE_CINEMATIC),"skip detaches active presentation")
	check(JSON.stringify(app.state())==committed,"double skip cannot modify committed results")
	var record: Dictionary=app.state().drawHistory[-1].results[0]
	check(text_of(app.modal_box).contains(str(GameData.character(str(record.id)).stars)+"星法相"),"skip reveals the actual saved single result")
	SummonScreen.show_results(app,app.state().drawHistory[-1].results,1)
	app._close_modal()
	var before_ack: Dictionary=JSON.parse_string(committed)
	var after_ack: Dictionary=app.state().duplicate(true)
	for comparison: Dictionary in [before_ack,after_ack]: comparison.erase("summonPresentation"); comparison.erase("revision")
	check(stable_save(before_ack)==stable_save(after_ack),"closing only acknowledges reveal; economy remains read-only")
	await settle()
	tickets=int(app.state().resources.ticket)
	SummonScreen.draw(app,10)
	animation=app.get_meta(SummonScreen.ACTIVE_CINEMATIC,null)
	check(is_instance_valid(animation),"ten draw enables the explicitly requested prototype preview")
	animation.playing=false
	var ten: Array=app.state().drawHistory[-1].results
	var highest := 3
	for saved: Dictionary in ten: highest=maxi(highest,int(GameData.character(str(saved.id)).stars))
	check(ten.size()==10 and app.state().resources.ticket==tickets-10,"ten draw commits all ten actual results and ten tickets")
	check(animation.rarity==highest and animation.draw_count==10,"ten draw animation matches real highest rarity")
	committed=JSON.stringify(app.state())
	animation.advance(7.0)
	await settle()
	check(not bool(app.get_meta(SummonScreen.DRAW_LOCK,true)),"natural completion releases lock")
	check(text_of(app.modal_box).contains("本次10张召唤符") and JSON.stringify(app.state())==committed,"natural completion reveals committed ten results without new debit")
	SummonScreen.show_results(app,ten,10,9)
	check(text_of(app.modal_box).contains("10 / 10"),"last of ten saved results accessible")
	app._close_modal()
	committed=JSON.stringify(app.state())
	app.store.fail_writes=true
	SummonScreen.draw(app,1)
	check(not app.has_meta(SummonScreen.ACTIVE_CINEMATIC) and not bool(app.get_meta(SummonScreen.DRAW_LOCK,true)),"failed durable save cannot launch animation or retain lock")
	check(JSON.stringify(app.state())==committed,"failed durable save does not charge or reveal")
	app.store.fail_writes=false
	check(app.command("settings",{"key":"simplified","value":true}).ok,"simplified setting uses persistent real setting")
	SummonScreen.draw(app,1)
	animation=app.get_meta(SummonScreen.ACTIVE_CINEMATIC,null)
	animation.playing=false
	check(animation.simplified and is_equal_approx(animation.duration(),2.0),"simplified setting replaces camera flight with two-second reveal")
	check(animation.rarity_is_visible(0) and animation.visible_color(0)==Cinematic.RARITY_COLORS[animation.rarity],"reduced-motion two seconds immediately communicates committed quality")
	committed=JSON.stringify(app.state())
	var persisted_dir: String=app.store.base_dir
	app.store.release()
	var reopened := GameStore.new(persisted_dir)
	check(reopened.load_slot().ok and JSON.stringify(reopened.state)==committed,"closing game mid-animation preserves exact already-saved draw")
	reopened.release()
	animation.queue_free()
	await settle()
	check(not bool(app.get_meta(SummonScreen.DRAW_LOCK,true)),"unexpected animation removal cannot leave summon locked")
	app._close_modal()
	var factions: Array[String]=[]
	for hero: Dictionary in GameData.content("CHARACTERS"):
		if not factions.has(str(hero.faction)): factions.append(str(hero.faction))
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(360,800)]:
		root.size=dimensions
		await settle()
		var screen: SummonScreen=app.body.get_node("SummonScreen")
		for faction: String in factions:
			screen._pool(faction)
			await settle()
			var expected := 0
			for hero: Dictionary in GameData.content("CHARACTERS"):
				if str(hero.faction)==faction: expected+=1
			check(app.modal_box.find_children("PoolCard_*","Button",true,false).size()==expected,"all %s characters shown together at %s" % [faction,str(dimensions)])
			check(app.modal_box.get_combined_minimum_size().x<=dimensions.x-60,"faction card grid fits width without paging")
			check(app.modal_box.get_combined_minimum_size().y<=dimensions.y-190,"faction card grid fits height without scrolling")
		app._close_modal()
	app.queue_free()
	await settle()
	for skip_first: bool in [false,true]:
		var closing := TestApp.new()
		closing.set_meta("ui_test",true)
		closing.set_meta("preview_unapproved_summon",true)
		var closing_path: String="user://summon-close-v06-%d" % Time.get_ticks_usec()
		closing.store=GameStore.new(closing_path)
		check(closing.store.load_slot().ok,"teardown fixture save created")
		closing.command("settings",{"key":"sound","value":false})
		root.add_child(closing)
		closing._render()
		SummonScreen.draw(closing,1)
		var closing_animation: Control=closing.get_meta(SummonScreen.ACTIVE_CINEMATIC)
		var closing_state: String=JSON.stringify(closing.state())
		if skip_first: closing_animation.skip()
		closing.store.release()
		root.remove_child(closing)
		closing.free()
		# Await every deferred presentation callback after its old owner is gone.
		await settle()
		var close_reopened := GameStore.new(closing_path)
		check(close_reopened.load_slot().ok and stable_save(close_reopened.state)==stable_save(JSON.parse_string(closing_state)),"immediate destruction %s preserves exactly one committed draw" % ("after skip" if skip_first else "during animation"))
		close_reopened.release()
	var report := {"status":"unapproved_development_prototype","fulfills_requested_video":false,"default_player_enabled":false,"checks":checks,"failures":failures,"captures":captures,"duration_seconds":7,"quality_reveal_seconds":2,"transactions":"real GameStore with isolated user data","visual":DisplayServer.get_name()!="headless"}
	var output := FileAccess.open("res://evidence/summon-v06/test-results.json",FileAccess.WRITE)
	output.store_string(JSON.stringify(report,"  ")); output.close()
	print("SUMMON UNAPPROVED PROTOTYPE V06: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)

func stable_save(value: Dictionary) -> String:
	var copy: Dictionary=GameData.normalize(value.duplicate(true))
	# Only binary/JSON rounding of continuous building progress is tolerated.
	for building: Dictionary in copy.buildings: building.progress=snappedf(float(building.progress),0.000000000001)
	return JSON.stringify(copy, "", true, true)
