extends SceneTree
const V = preload("res://scripts/progression_visual.gd")
const IDS := ["011","028","036"]
var checks: int = 0
var errors: Array[String] = []
var state: Dictionary = {}
var app: Control
var capture: bool = false
var screenshots: Array[String] = []

func _initialize() -> void: _run.call_deferred()
func check(ok: bool, message: String) -> void:
	checks+=1
	if not ok: errors.append(message); push_error(message)
func settle() -> void:
	for frame: int in 10: await process_frame
func command(name: String, args: Dictionary) -> void:
	var result: Dictionary = GameEconomy.command(state,name,args,1000)
	check(result.ok,name+" "+str(args)+" "+str(result.error))

func _run() -> void:
	capture = "--visual-capture" in OS.get_cmdline_user_args()
	state = GameEconomy.create_state(1000)
	for key: String in GameEconomy.RESOURCE_KEYS: state.resources[key]=mini(100000,int(GameEconomy.config().resourceCaps[key])/2)
	for key: String in state.progression.materials: state.progression.materials[key]=1000
	_readonly_and_growth()
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	app.set_process(false); app.audio.sound_enabled=false
	await settle()
	var palettes: Array = []
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(320,568)]:
		root.size=dimensions
		await settle()
		for page: String in IDS:
			var family: String=V.FAMILY[page]
			for spec: Dictionary in GameProgression.rules().families[family].choices:
				if not state.progression.families[family].has(spec.id): command("progAcquire",{"family":family,"id":spec.id})
				command("progSelect",{"family":family,"id":spec.id,"slot":V.SLOT[page]})
				app.store.state=state.duplicate(true)
				app.set_meta("progression_selections",{page:{"id":spec.id}})
				app._systems_page(page)
				await settle()
				var view: Control=app.body.find_child("ProgressionVisual_"+page,true,false)
				check(is_instance_valid(view),"real page missing visual "+page)
				if not is_instance_valid(view): continue
				check(view.preview.id==spec.id and view.preview.owned and view.preview.equipped,"real selected model not reflected "+page+spec.id)
				check(view.equipped_label.text.contains(spec.name),"actual equipped name missing "+page+spec.id)
				if page=="011" and dimensions.x==540: palettes.append(view.portrait_material.get_shader_parameter("cloth_color"))
				var seen: int=0
				for index: int in maxi(1,app.page_pager.pages.size()):
					app.page_pager.show_page(index); await settle()
					check(app.body_scroll.scroll_vertical==0 and app.body_scroll.scroll_horizontal==0,"native preview page uses scrolling")
					if not view.is_visible_in_tree(): continue
					seen+=1
					check(app.body_scroll.get_global_rect().grow(1).encloses(view.get_global_rect()),"visual outside actual body "+page+str(dimensions))
					_inspect(view,page+spec.id+str(dimensions))
					if capture:
						await RenderingServer.frame_post_draw
						var filename: String="user://progression-visual-%s-%s-%dx%d.png" % [page,spec.id,dimensions.x,dimensions.y]
						root.get_texture().get_image().save_png(filename); screenshots.append(ProjectSettings.globalize_path(filename))
				check(seen==1,"visual is not a single indivisible pager unit "+page)
				# Preview another owned object must keep the actual equipped choice clear.
				var choices: Array=GameProgression.rules().families[family].choices
				var other: Dictionary=choices[1] if spec.id==choices[0].id else choices[0]
				var before: String=JSON.stringify(app.state())
				view.refresh(app.state(),{"selectedId":other.id})
				check(not view.preview.equipped and view.equipped_label.text.contains(spec.name),"browsing falsely changed actual equipment")
				check(JSON.stringify(app.state())==before,"readonly visual changed saved state")
	check(palettes.size()==3 and palettes[0]!=palettes[1] and palettes[1]!=palettes[2] and palettes[0]!=palettes[2],"three outfit palettes are identical")
	# An unowned object is still previewable without inventing a level or an equip state.
	var locked: Dictionary=GameEconomy.create_state(1000)
	app.store.state=locked
	app.set_meta("progression_selections",{"028":{"id":"boat"}})
	app._systems_page("028"); await settle()
	var locked_view: Control=app.body.find_child("ProgressionVisual_028",true,false)
	check(locked_view.preview.level==0 and not locked_view.preview.owned and locked_view.ownership_label.text.contains("未获得"),"unowned preview implies ownership")
	var restored: Dictionary=JSON.parse_string(JSON.stringify(state))
	check(V.snapshot(restored,"028","cloud")==V.snapshot(state,"028","cloud"),"visual growth changed after JSON save reload")
	app.store.release(); app.queue_free(); await settle()
	var report: FileAccess=FileAccess.open("user://progression-visual-v08-report.json",FileAccess.WRITE)
	report.store_string(JSON.stringify({"checks":checks,"errors":errors,"screenshots":screenshots},"  ")); report.close()
	print("PROGRESSION VISUAL V08: %d checks, %d failures" % [checks,errors.size()])
	quit(0 if errors.is_empty() else 1)

func _inspect(view: Control, context: String) -> void:
	check(view.size.y<=113,"visual not compact "+context)
	check(view.art.texture!=null and view.art.texture.get_width()>0,"preview texture missing "+context)
	check(view.find_children("*","ScrollContainer",true,false).is_empty(),"visual includes scroller")
	for node: Node in view.get_children():
		if node is Control: check(Rect2(Vector2.ZERO,view.size).grow(1).encloses(Rect2(node.position,node.size)),"visual child overflow "+context+str(node.name)+" "+str(Rect2(node.position,node.size))+" in "+str(view.size))
		if node is Label:
			var h: float=node.get_line_count()*node.get_line_height()+maxi(0,node.get_line_count()-1)*node.get_theme_constant("line_spacing")
			check(h<=node.size.y+1,"visual label clipped "+context+str(node.name))
	if view.system_id=="011": check(view.note_label.text.contains("非独立服装原画"),"outfit provenance not disclosed")

func _readonly_and_growth() -> void:
	var hashes: Array=[]
	for page: String in IDS:
		var family: String=V.FAMILY[page]
		for spec: Dictionary in GameProgression.rules().families[family].choices:
			var before: String=JSON.stringify(state)
			var p: Dictionary=V.snapshot(state,page,spec.id)
			check(JSON.stringify(state)==before,"snapshot mutates state")
			check(p.name==spec.name and p.id==spec.id,"snapshot definition mismatch")
			if not state.progression.families[family].has(spec.id): check(not p.owned and p.stage==0 and p.level==0,"unowned growth invented")
			if page!="011":
				var art: Texture2D=V.texture(p.asset)
				check(art!=null,"SVG asset failed to rasterize "+spec.id)
				var fingerprint: int=hash(art.get_image().get_data())
				check(fingerprint not in hashes,"two mount/manifestation assets identical")
				hashes.append(fingerprint)
	command("progAcquire",{"family":"mounts","id":"cloud"})
	command("progSelect",{"family":"mounts","id":"cloud","slot":"main"})
	var initial: Dictionary=V.snapshot(state,"028","cloud")
	for i: int in 9: command("progTrain",{"family":"mounts","id":"cloud"})
	check(V.snapshot(state,"028","cloud").stage>initial.stage,"level10 did not change visible halo stage")
	for i: int in 3: command("progAcquire",{"family":"mounts","id":"cloud"})
	command("progStar",{"family":"mounts","id":"cloud"})
	command("progStar",{"family":"mounts","id":"cloud"})
	command("progMountSpirit",{"id":"cloud"})
	var grown: Dictionary=V.snapshot(state,"028","cloud")
	check(grown.level==10 and grown.stars==2 and grown.stage==3 and grown.spirit==1,"persistent mount visual growth mismatch")
	check(V.snapshot(state,"999","cloud").is_empty(),"unsupported page returns visual")
