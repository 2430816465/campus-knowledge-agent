extends Node
## External temporary autoload; the shipped executable and PCK remain unchanged.
var checks: int=0
var failures: Array=[]
func _ready() -> void: run.call_deferred()
func check(ok: bool,note: String) -> void:
	checks+=1
	if not ok: failures.append(note); push_error(note)
func frames(n: int=5) -> void:
	for i: int in n: await get_tree().process_frame
func run() -> void:
	await frames()
	check(not OS.has_feature("editor"),"real Windows release template")
	check(FileAccess.file_exists("res://project.binary"),"real exported project settings")
	var app: Control=get_tree().current_scene
	check(app!=null,"actual configured main scene")
	if app==null: finish(); return
	app.set_process(false); app.audio.sound_enabled=false; app._go(3)
	check(GameEconomy.free_currency(),"actual release enables test free currency")
	var empty_wallet: Dictionary=app.state().duplicate(true)
	empty_wallet.resources.ticket=0
	empty_wallet.pity=int(GameEconomy.gacha_config().fiveStarPity)-1
	check(app.store._commit(empty_wallet,true).ok,"isolated release zero-ticket save")
	app.store.state=empty_wallet; app._render()
	var before: int=app.state().resources.ticket
	SummonScreen.draw(app,10)
	var film: SummonMovie=app.get_meta(SummonScreen.ACTIVE_CINEMATIC)
	check(film!=null and app.state().resources.ticket==before,"free ten draw committed before media with zero tickets")
	if film==null: finish(); return
	check(film.rarity=="gold" and is_equal_approx(float(film.grade.get_shader_parameter("mythic_power")),1.0),"real guaranteed divine result enables gold burst in release")
	check(film.player.get_parent()==film.scene_layer and film.glyphs.get_parent()==film.scene_layer and film.skip.get_parent()==film,"exported scene and effects share shake pivot while skip stays fixed")
	var committed: Array=film.records.duplicate(true)
	var deadline: int=Time.get_ticks_msec()+6000
	while not film.movie_visible and Time.get_ticks_msec()<deadline: await get_tree().process_frame
	check(film.movie_visible and film.player.stream_position>0,"Theora decodes in release executable")
	check(film.player.get_video_texture().get_size()==Vector2(768,1344),"release decodes the full-resolution video")
	check(SummonMovie.FIRST.get_size()==Vector2(768,1344) and SummonMovie.LAST.get_size()==Vector2(768,1344),"exported first and last frames match the supplied clip dimensions")
	var expected_video: String=""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--expected-video-sha256="): expected_video=arg.trim_prefix("--expected-video-sha256=")
	check(not expected_video.is_empty() and FileAccess.get_sha256(film.clip)==expected_video,"export includes the exact fully validated OGV bytes")
	SummonScreen.draw(app,1)
	check(app.state().resources.ticket==before and app.state().drawHistory.size()==1,"rapid second draw blocked")
	deadline=Time.get_ticks_msec()+16000
	var captured_gold: bool=false
	while app.has_meta(SummonScreen.ACTIVE_CINEMATIC) and Time.get_ticks_msec()<deadline:
		if DisplayServer.get_name()!="headless" and not captured_gold and film.presentation_media_time>=5.4:
			film._set_backgrounded(true); await frames(3); await RenderingServer.frame_post_draw
			var img: Image=get_tree().root.get_texture().get_image()
			for arg: String in OS.get_cmdline_user_args():
				if arg.begins_with("--gold-screenshot="):
					check(img.save_png(arg.trim_prefix("--gold-screenshot="))==OK,"real exported gold render captured")
			check(film.phase==SummonMovie.Phase.QUALITY_REVEAL and film.reveal_amount>0.95,"exported gold reveal follows media")
			check(film.scene_layer.scale.x>1.07,"actual exported divine impact applies protective overscan")
			captured_gold=true
		if film.backgrounded: film._set_backgrounded(false)
		await get_tree().process_frame
	check(is_instance_valid(app.modal_box),"natural end enters real portrait presenter")
	if not is_instance_valid(app.modal_box): finish(); return
	var ui: SummonResults=app.modal_box.get_node("SummonResults")
	check(ui.sequential and ui.index==0 and ui.view==SummonResults.View.PORTRAIT,"portrait sequence starts at first committed result")
	check(ui.background.texture==SummonMovie.LAST and ui.background.material is ShaderMaterial,"portrait entrance keeps the actual graded tail frame")
	var result_grade:=ui.background.material as ShaderMaterial
	check(result_grade!=null and is_equal_approx(float(result_grade.get_shader_parameter("media_phase")),SummonMovie.DURATION-SummonMovie.FRAME_STEP-SummonMovie.REVEAL_AT),"result lighting matches the film tail position")
	for i: int in 10:
		check(ui.index==i and ui.records[i]==committed[i],"correct portrait order "+str(i))
		ui.age=.5; ui.advance()
	check(ui.view==SummonResults.View.CARDS and ui.cards.size()==10,"ten portraits finish on ten cards")
	app._close_modal(); await frames()
	check(app.store.pending_summon().is_empty(),"result acknowledgment saved")
	SummonScreen.draw(app,1); film=app.get_meta(SummonScreen.ACTIVE_CINEMATIC)
	film._finish(true); film._finish(false); await frames(8)
	ui=app.modal_box.get_node("SummonResults")
	check(ui.view==SummonResults.View.CARDS and ui.cards.size()==1,"skip goes directly to committed card")
	check(app.state().resources.ticket==before and app.state().drawHistory.size()==2,"skip/end retains zero debit and exactly two transactions")
	app._close_modal(); await frames(); app.store.release(); finish()
func finish() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):
			var f:=FileAccess.open(arg.trim_prefix("--report="),FileAccess.WRITE)
			f.store_string(JSON.stringify({"checks":checks,"failures":failures,"releaseTemplate":not OS.has_feature("editor"),"display":DisplayServer.get_name(),"renderer":RenderingServer.get_video_adapter_name()},"  ")); f.close()
	print("WINDOWS SUMMON V11: ",checks," checks, ",failures.size()," failures")
	get_tree().quit(0 if failures.is_empty() else 1)
