extends SceneTree
var checks := 0
var failures: Array=[]
var observations: Array=[]
var confirmations := 0
var app: Control
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void: _run.call_deferred()
func settle() -> void:
	for i: int in 5: await process_frame
func fits(node: Control,rect: Rect2,label: String) -> void:
	var actual: Rect2=node.get_global_rect()
	check(rect.grow(0.1).encloses(actual),label+" actual="+str(actual)+" safe="+str(rect))
func button_named(node: Node,text: String) -> Button:
	if node is Button and node.text==text: return node
	for child: Node in node.get_children():
		var found: Button=button_named(child,text)
		if found!=null: return found
	return null
func click_control(control: Control) -> void:
	var center: Vector2=control.get_global_rect().get_center()
	var motion:=InputEventMouseMotion.new()
	motion.position=center; motion.global_position=center
	root.push_input(motion,true)
	for pressed: bool in [true,false]:
		var event:=InputEventMouseButton.new()
		event.position=center; event.global_position=center
		event.button_index=MOUSE_BUTTON_LEFT
		event.button_mask=MOUSE_BUTTON_MASK_LEFT if pressed else 0
		event.pressed=pressed
		root.push_input(event,true)
	await process_frame
func bottom_scroll(control: Control) -> void:
	var parent: Node=control.get_parent()
	while parent!=null and not parent is ScrollContainer: parent=parent.get_parent()
	if parent is ScrollContainer: parent.scroll_vertical=int(parent.get_v_scroll_bar().max_value)
	await settle()
func record(label: String) -> void:
	observations.append({"case":label,"controlSize":[app.size.x,app.size.y],"shell":str(app.frame.get_global_rect()),"header":str(app.header.get_global_rect()),"navigation":str(app.nav.get_global_rect()),"toast":str(app.toast_label.get_global_rect())})
func inspect_main(expected: Rect2,label: String) -> void:
	app._resize_shell()
	await settle()
	fits(app.frame,expected,label+" shell")
	fits(app.header,expected,label+" header")
	fits(app.nav,expected,label+" navigation")
	for button: Button in app.nav.get_children(): fits(button,expected,label+" actual navigation button")
	app.toast("安全区布局检查")
	fits(app.toast_label,expected,label+" toast")
	record(label)
	await click_control(app.nav.get_child(4))
	check(app.page==app.NAV_PAGES[4],label+" bottom navigation receives pointer input")
	app._confirm("安全区确认","检查安全区内的真实确认按钮。",func() -> void: confirmations+=1)
	# Long content forces pagination; inspect the final delayed fit, not
	# the helper's return value or a second implementation of its formula.
	for i: int in 24: app.label(app.modal_box,"这是需要分页的实际弹层内容 %d" % i,16)
	app._fit_modal()
	await settle()
	var panel: Control=app.overlay.get_node("Sheet")
	fits(panel,expected,label+" modal after delayed fit")
	fits(button_named(app.overlay,"关闭"),expected,label+" modal close button")
	var confirmation: Button=button_named(app.overlay,"确认")
	# Confirmation is near the beginning in this actual confirmation component.
	fits(confirmation,expected,label+" confirmation button")
	var before: int=confirmations
	await click_control(confirmation)
	check(confirmations==before+1 and not is_instance_valid(app.overlay),label+" confirmation receives pointer input once")
func _run() -> void:
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false)
	app.audio.sound_enabled=false
	app._go(0)
	await settle()
	var baseline_shell: Rect2=app.frame.get_global_rect()
	var baseline_header: Rect2=app.header.get_global_rect()
	var baseline_nav: Rect2=app.nav.get_global_rect()
	check(baseline_shell==Rect2(12,8,516,944),"zero-inset desktop shell preserves original geometry")
	await inspect_main(Rect2(0,0,540,960),"desktop-zero")
	var before_layout: String=JSON.stringify(app.state())
	root.set_meta(GameSafeArea.TEST_INSETS,Vector4(0,44,0,34))
	await inspect_main(Rect2(0,44,540,882),"portrait-notch-gesture")
	check(JSON.stringify(app.state())==before_layout,"safe-area navigation/layout does not change assets or preferences")
	app._confirm("安全区变化","弹层开启时改变安全边距。",func() -> void: confirmations+=1)
	root.set_meta(GameSafeArea.TEST_INSETS,Vector4(20,60,16,40))
	app._resize_shell()
	await app._fit_modal()
	await settle()
	fits(app.overlay.get_node("Sheet"),Rect2(20,60,504,860),"already-open modal responds to changed insets and delayed fit")
	var changed_close: Button=button_named(app.overlay,"关闭")
	fits(changed_close,Rect2(20,60,504,860),"already-open modal close remains safe after change")
	await click_control(changed_close)
	check(not is_instance_valid(app.overlay),"changed-inset modal receives close pointer input")
	root.set_meta(GameSafeArea.TEST_INSETS,Vector4(0,44,0,34))
	app._resize_shell()
	app._go(0)
	await settle()
	check(is_equal_approx(app.estate.camera.zoom.x,app.estate.camera.zoom.y),"estate keeps uniform camera zoom with safe insets")
	app._start_main(1)
	var view: BattleView=app.battle_view
	view.set_process(false)
	await settle()
	var portrait_safe:=Rect2(0,44,540,882)
	fits(view.body_scroll,portrait_safe,"battle scroll viewport is safe")
	fits(view.speed_button,portrait_safe,"battle top speed button is safe")
	fits(view.auto_button,portrait_safe,"battle top automatic button is safe")
	var legal: Array=GameCombat.legal_targets(view.battle,"attack")
	var target: Button=view.unit_nodes[legal[0]]
	fits(target,portrait_safe,"actual selectable enemy card is safe")
	var before_target: String=JSON.stringify(view.battle)
	await click_control(target)
	check(view.target_id==legal[0],"safe-area battle target receives pointer input")
	check(JSON.stringify(view.battle)==before_target,"target selection leaves combat RNG and outcome unchanged")
	check(view.battle.get("autoOnly",false) and view.automatic and view.auto_button.disabled,"real campaign uses automatic combat")
	check(button_named(view.controls,"确认行动")==null,"automatic combat has no obsolete manual-confirm control")
	var details: Button=button_named(view.controls,"属性详情")
	fits(details,portrait_safe,"automatic combat detail action is inside gesture-safe area")
	var action_count: int=int(view.battle.actionCount)
	view._process(0.9)
	check(int(view.battle.actionCount)==action_count+1,"safe-area battle advances through its actual automatic process path")
	view._report()
	await settle()
	fits(view.detail_overlay.get_node("Panel"),portrait_safe,"battle report panel is safe")
	var close: Button=button_named(view.detail_overlay,"关闭")
	fits(close,portrait_safe,"battle report close control is safe")
	await click_control(close)
	await settle()
	check(not is_instance_valid(view.detail_overlay),"battle report can actually close inside safe area")
	app._leave_battle()
	root.size=Vector2i(960,540)
	root.set_meta(GameSafeArea.TEST_INSETS,Vector4(44,0,32,24))
	await settle()
	await inspect_main(Rect2(44,0,884,516),"landscape-side-cutouts")
	root.remove_meta(GameSafeArea.TEST_INSETS)
	root.content_scale_size=Vector2i(540,960)
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect=Window.CONTENT_SCALE_ASPECT_IGNORE
	root.size=Vector2i(1080,1920)
	# Fixed physical pixels for a 2x rendered 540x960 viewport, with a translated
	# window origin. The actual UI containers must still land in logical bounds.
	root.set_meta(GameSafeArea.TEST_SCREEN_RECT,Rect2(120,168,1080,1764))
	root.set_meta(GameSafeArea.TEST_SCREEN_TRANSFORM,Transform2D(Vector2(2,0),Vector2(0,2),Vector2(120,80)))
	await settle()
	check(app.size.is_equal_approx(Vector2(540,960)),"real canvas viewport remains 540x960 under 2x window scaling")
	await inspect_main(Rect2(0,44,540,882),"scaled-physical-safe-rect")
	root.remove_meta(GameSafeArea.TEST_SCREEN_RECT)
	root.remove_meta(GameSafeArea.TEST_SCREEN_TRANSFORM)
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	app._go(0)
	await settle()
	app._resize_shell()
	await settle()
	check(app.frame.get_global_rect()==baseline_shell and app.header.get_global_rect()==baseline_header and app.nav.get_global_rect()==baseline_nav,"removing injected insets restores desktop geometry snapshot")
	app.audio.set_backgrounded(true)
	app.queue_free()
	await process_frame
	await create_timer(0.1).timeout
	var f: FileAccess=FileAccess.open("res://docs/audits/round-4-safe-area-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"round":4,"checks":checks,"failures":failures,"containerObservations":observations,"nativeMobileDevice":false,"verification":"Actual global Control rectangles and viewport-routed pointer input; desktop, notch/gesture, side cutouts, 2x window/viewport conversion."},"  "));f.close()
	print("SAFE AREA ROUND 4: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
