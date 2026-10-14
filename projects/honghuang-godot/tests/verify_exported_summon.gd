extends SceneTree
func _initialize() -> void: run.call_deferred()
func run() -> void:
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true); root.add_child(app); app.set_process(false)
	for i: int in 6: await process_frame
	app._go(3); SummonScreen.draw(app,1)
	var film: Control=app.get_meta(SummonScreen.ACTIVE_CINEMATIC)
	var deadline: int=Time.get_ticks_msec()+6000
	while not film.movie_visible and Time.get_ticks_msec()<deadline: await process_frame
	var success: bool=film.movie_visible and film.player.stream_position>0
	film._finish(true)
	for i: int in 8: await process_frame
	success=success and is_instance_valid(app.modal_box)
	app._close_modal(); app.store.release(); app.queue_free()
	for i: int in 5: await process_frame
	print("EXPORTED SUMMON PACK: ","PASS" if success else "FAIL")
	quit(0 if success else 1)
