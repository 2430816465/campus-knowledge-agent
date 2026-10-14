extends SceneTree
var failures: int=0
var checks: int=0
func _initialize() -> void:
	auto_accept_quit=false
	run.call_deferred()
func check(value: bool,text: String) -> void:
	checks+=1
	if not value: failures+=1; push_error(text)
func run() -> void:
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true); root.add_child(app); app.set_process(false)
	for i: int in 8: await process_frame
	for resolution: Vector2i in [Vector2i(540,960),Vector2i(360,800)]:
		root.size=resolution
		root.position=Vector2i(-2200,30)
		app._go(3)
		for i: int in 8: await process_frame
		for q: String in ["blue","purple","gold"]:
			app.store.load_slot("demo:roster")
			app.store.state.pity=0; app.store.state.fourStarPity=0
			var config: Dictionary=GameEconomy.gacha_config()
			var chance: float=0.95 if q=="blue" else float(config.fiveStarChance)+float(config.fourStarChance)*0.5 if q=="purple" else 0.001
			var result: Dictionary=app.store.transact("summon",{"count":1,"txid":"capture-%s-%s" % [str(resolution),q],"rng":func() -> float: return chance})
			check(result.ok,"capture result really committed")
			var saved: String=JSON.stringify(app.state())
			var film:=SummonMovie.new(); film.configure(result.data,false,false); app.add_child(film)
			check(film.rarity==q,"true "+q)
			check(app.summon_scene_rect().is_equal_approx(SummonMovie.scene_rect(app.size)),"identical page/film transform")
			var deadline: int=Time.get_ticks_msec()+12000
			var neutral_seen: bool=false
			while film.player.stream_position<5.8 and Time.get_ticks_msec()<deadline:
				if film.player.stream_position>4.2 and film.player.stream_position<SummonMovie.REVEAL_AT:
					neutral_seen=true
					check(film.reveal_amount==0,"no early rarity")
				await process_frame
			check(neutral_seen and film.reveal_amount>0.5,"reveal follows actual media progress")
			film._set_backgrounded(true)
			check(Rect2(Vector2.ZERO,film.size).encloses(film.skip.get_rect()),"skip inside viewport")
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://evidence/summon-video-v10/%s-%dx%d.png" % [q,resolution.x,resolution.y])
			film._enter_portrait(); film.result_time=0.5; film.hero_layer.modulate.a=1
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("res://evidence/summon-video-v10/%s-portrait-%dx%d.png" % [q,resolution.x,resolution.y])
			check(JSON.stringify(app.state())==saved,"effects never change ledger")
			film.dismiss_without_results()
			for i: int in 4: await process_frame
	app.store.release(); app.queue_free(); await process_frame
	print("SUMMON QUALITY GPU: ",checks," checks, ",failures," failures")
	quit(0 if failures==0 else 1)
