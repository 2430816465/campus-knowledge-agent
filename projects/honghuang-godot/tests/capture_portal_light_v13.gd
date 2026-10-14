extends SceneTree
## Actual film, real isolated transactions, and GPU-rendered grade comparisons.
var app: Control
var failures: int = 0
var checks: int = 0
var samples: Array = []
const OUTPUT = "res://video-production/output/portal-light"
func _initialize() -> void: run.call_deferred()
func frames(count: int = 5) -> void:
	for i: int in count: await process_frame
func check(value: bool, message: String) -> void:
	checks += 1
	if not value: failures += 1; push_error(message)
func wait_media(film: SummonMovie, target: float) -> bool:
	var deadline: int = Time.get_ticks_msec() + 22000
	while is_instance_valid(film) and not film.done and film.player.stream_position < target and Time.get_ticks_msec() < deadline:
		if film.backgrounded: film._set_backgrounded(false)
		await process_frame
	return is_instance_valid(film) and not film.done and film.player.stream_position >= target
func snapshot(film: SummonMovie, name: String) -> void:
	film._set_backgrounded(true)
	await frames(2); await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(OUTPUT + "/" + name + ".png")
	samples.append({"image":name + ".png", "rarity":film.rarity, "position":film.player.stream_position, "reveal":film.reveal_amount})
	film._set_backgrounded(false)
func run() -> void:
	root.size = Vector2i(1080,1920); root.position = Vector2i(-2400,40)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://video-production/docs"))
	app = load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true)
	root.add_child(app); app.set_process(false); app.audio.sound_enabled = false
	await frames(); app._go(3); await frames()
	for q: String in ["blue", "purple", "gold"]:
		app.store.load_slot("demo:roster")
		app.store.state.pity = 0; app.store.state.fourStarPity = 0
		var config: Dictionary = GameEconomy.gacha_config()
		var chance: float = 0.95 if q == "blue" else float(config.fiveStarChance) + float(config.fourStarChance)*0.5 if q == "purple" else 0.001
		var result: Dictionary = app.store.transact("summon", {"count":1, "txid":"portal-v13-"+q, "rng":func() -> float: return chance})
		check(result.ok, "real committed " + q)
		var saved: String = JSON.stringify(app.state())
		var film := SummonMovie.new(); film.configure(result.data, false, false); app.add_child(film)
		check(film.rarity == q, "true grade " + q)
		check(app.summon_scene_rect().is_equal_approx(SummonMovie.scene_rect(app.size)), "matching scene transform " + q)
		if not await wait_media(film,7.1): check(false,"media timed out " + q); break
		film._set_backgrounded(true); await frames(2); await RenderingServer.frame_post_draw
		var neutral_pixels: PackedByteArray = root.get_texture().get_image().get_data()
		for color: String in ["blue","purple","gold"]:
			film.grade.set_shader_parameter("rarity_color",SummonMovie.quality_color(color))
			await RenderingServer.frame_post_draw
			check(root.get_texture().get_image().get_data() == neutral_pixels, "neutral pixels unchanged " + q + " / " + color)
		film.grade.set_shader_parameter("rarity_color",SummonMovie.quality_color(q))
		film._set_backgrounded(false)
		for moment: float in [8.1,8.5,9.2,10.5]:
			if not await wait_media(film,moment): check(false,"reveal timed out " + q); break
			await snapshot(film, "%s-%03d" % [q,roundi(moment*10)])
		check(film.reveal_amount > 0.99, "full reveal follows media " + q)
		check(JSON.stringify(app.state()) == saved, "effect leaves ledger intact " + q)
		if q == "gold":
			film._set_backgrounded(true); root.size = Vector2i(720,1600)
			await frames(); await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(OUTPUT + "/gold-tall.png")
			check(Rect2(Vector2.ZERO,film.size).encloses(film.skip.get_rect()),"tall viewport skip visible")
		film.dismiss_without_results(); await frames()
	app.store.release(); app.queue_free(); await frames()
	var report := FileAccess.open("res://video-production/docs/portal-light-native.json",FileAccess.WRITE)
	report.store_string(JSON.stringify({"date":"2026-10-08", "checks":checks, "failures":failures, "renderer":RenderingServer.get_video_adapter_name(), "engine":Engine.get_version_info(), "samples":samples, "sizes":[[1080,1920],[720,1600]]},"  ")); report.close()
	print("PORTAL LIGHT V13: ",checks," checks, ",failures," failures")
	quit(0 if failures == 0 and samples.size() == 12 else 1)
