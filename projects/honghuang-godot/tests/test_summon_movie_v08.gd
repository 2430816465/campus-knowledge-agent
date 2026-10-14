extends SceneTree
## V08 external-fixture expectations replaced by the approved neutral film.
var checks: int=0
var failures: int=0
func _initialize() -> void: run.call_deferred()
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures+=1; push_error(message)
func run() -> void:
	var app: Control=load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true)
	root.add_child(app); app.set_process(false)
	for i: int in 5: await process_frame
	var result: Dictionary=app.store.transact("summon",{"count":1,"txid":"decoder-fixture"})
	var saved: String=JSON.stringify(app.state())
	var outputs: Array=[]
	for mode: String in ["missing","refused","stall"]:
		var film:=SummonMovie.new(); film.configure(result.data,false,false)
		if mode=="missing": film.clip="res://tests/fixtures/intentionally-absent.ogv"
		film.completed.connect(func(skipped: bool) -> void: outputs.append(skipped))
		app.add_child(film)
		if mode=="refused":
			film.player.stop(); film.elapsed=5.1
			film._process(0.01)
		elif mode=="stall":
			var deadline: int=Time.get_ticks_msec()+2000
			while not film.movie_visible and Time.get_ticks_msec()<deadline: await process_frame
			check(film.movie_visible,"actual stream decodes before stall")
			film.player.paused=true; film.stall=3.1; film.last_position=film.player.stream_position
			film._process(0.01)
		check(film.phase==SummonMovie.Phase.RESULTS and not film.failure_reason.is_empty(),mode+" uses static saved result")
		check(film.still.texture==SummonMovie.LAST and film.selected.id==result.data[0].id,mode+" uses actual tail and character")
		film._finish(true); film._finish(false)
		for i: int in 5: await process_frame
		check(JSON.stringify(app.state())==saved,mode+" cannot change economy")
	check(outputs.size()==3,"each race emits completion once")
	app.store.release(); app.queue_free(); await process_frame
	print("SUMMON MEDIA FAILURE: ",checks," checks, ",failures," failures")
	quit(0 if failures==0 else 1)
