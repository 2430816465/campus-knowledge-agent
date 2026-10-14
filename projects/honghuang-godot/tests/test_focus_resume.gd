extends SceneTree
var checks := 0
var failures: Array=[]
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void: _run.call_deferred()
func _run() -> void:
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	app._go(0) # Construction now has its own tab; homepage is cultivation.
	app.set_process(false)
	check(app.command("build",{"type":"farm","plot":"p2"}).ok,"create actual movable facility")
	app.estate.editing=true
	check(app.estate.preview_move("farm-1","p3"),"actual pending move preview opens confirmation")
	var screen: EstateScreen = app.body.get_node("IndependentEstateScreen")
	check(screen.preview_bar.visible and not screen.pending.is_empty(),"native map confirmation visible")
	app.estate._pointer_down=true
	app.estate._panning=true
	var before: Dictionary=app.state().duplicate(true)
	root.focus_exited.emit()
	check(app.presentation_suspended,"real Window signal reaches main focus handler")
	check(app.estate._preview_id.is_empty() and not app.estate._pointer_down and not app.estate._panning,"main cancels estate preview and held input")
	check(screen.pending.is_empty() and not screen.preview_bar.visible and screen.preview_controls.get_child_count()==0,"focus removes stale floating confirmation and callbacks")
	app.estate._pointer_event(Vector2.ZERO,false)
	screen._confirm_preview()
	check(app.state()==before,"lost-focus and late release never commit move or mutate ledger")
	root.focus_entered.emit()
	check(not app.presentation_suspended and app.ignore_resume_delta,"main resumes without saved settings change")
	app._start_main(1)
	var view: BattleView=app.battle_view
	view.set_process(false)
	app.audio.set_process(false)
	view.automatic=true
	view.target_id=GameCombat.legal_targets(view.battle,"attack")[0]
	view.action_kind="skill"
	view.elapsed=0.8
	app.audio.configure({"music":true,"sound":true})
	app.audio.cue("skill")
	check(not app.audio.voices.is_empty(),"real native audio voice active before background")
	var battle_before: String=JSON.stringify(view.battle)
	var settings_before: Dictionary=app.state().settings.duplicate(true)
	var clock_before: int=int(app.state().lastTime)
	root.focus_exited.emit()
	view._process(7200)
	view._act()
	view._method()
	app.audio._process(7200)
	app.audio.cue("complete")
	check(view.backgrounded and view.process_mode==Node.PROCESS_MODE_DISABLED,"battle children and effects pause in background")
	check(JSON.stringify(view.battle)==battle_before,"two-hour background delta/input cannot run combat")
	check(view.target_id.is_empty() and view.source_id.is_empty() and view.elapsed==0,"stale selected action and elapsed delay discarded")
	check(app.audio.voices.is_empty() and app.audio.music_time==0,"active audio stops and background cannot add voices")
	check(app.state().settings==settings_before and int(app.state().lastTime)==clock_before,"focus does not alter preferences or offline production ledger")
	root.focus_entered.emit()
	view._process(7200)
	app.audio._process(7200)
	check(JSON.stringify(view.battle)==battle_before and app.audio.note_index==0,"first resumed frame discards large delta without fast-forward")
	check(view.automatic and view.process_mode==Node.PROCESS_MODE_INHERIT,"automatic preference resumes")
	view._process(0.9)
	check(view.battle.actionCount==1,"fresh normal interval permits exactly one action")
	var previous_effects: Array=view.arena.get_children().filter(func(n: Node) -> bool: return n is BattleEffects or n.get_meta("battle_amount",false))
	check(not previous_effects.is_empty(),"committed action started native effects")
	root.focus_exited.emit()
	check(view.arena.get_children().filter(func(n: Node) -> bool: return n is BattleEffects or n.get_meta("battle_amount",false)).is_empty(),"interrupted effect and number nodes cleaned")
	check(view.battle.actionCount==1,"already committed action survives focus loss once")
	root.focus_entered.emit()
	app.audio._process(0.1)
	app.audio.cue("click")
	check(app.audio.voices.size()==1,"audio can resume after focus return")
	await create_timer(0.35).timeout
	check(app.audio.voices.is_empty(),"resumed cue releases its audio playback naturally")
	app.queue_free()
	await process_frame
	# Let the audio mixer release its stopped playback reference before shutdown.
	await create_timer(0.1).timeout
	var f: FileAccess=FileAccess.open("res://docs/audits/focus-resume-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"checks":checks,"failures":failures,"signal":"Window.focus_exited/focus_entered","largeDeltaSeconds":7200,"nativeOperatingSystemFocus":false},"  "));f.close()
	print("FOCUS RESUME: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
