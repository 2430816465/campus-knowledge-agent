extends SceneTree
var app: Control
var film: SummonMovie
var failed: int=0
var checks: int=0
func _initialize() -> void: run.call_deferred()
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failed+=1; push_error(message)
func frames(n: int=4) -> void:
	for i: int in n: await process_frame
func economic() -> String:
	var s: Dictionary=app.state().duplicate(true)
	s.erase("summonPresentation"); s.erase("revision")
	return JSON.stringify(s)
func run() -> void:
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true)
	root.add_child(app); app.set_process(false); app.audio.sound_enabled=false
	await frames(); app._go(3)
	var before: int=app.state().resources.ticket
	SummonScreen.draw(app,1)
	film=app.get_meta(SummonScreen.ACTIVE_CINEMATIC,null)
	check(film is SummonMovie,"actual film is selected")
	check(app.state().resources.ticket==before-1,"exact single debit")
	check(not app.store.pending_summon().is_empty(),"journal is atomic with rewards")
	var committed: String=economic()
	var pending: Dictionary=app.store.pending_summon()
	var retry: Dictionary=app.store.transact("summon",{"count":1,"txid":pending.id,"presentation":true})
	check(retry.ok and economic()==committed and retry.data==pending.results,"same transaction ID returns same result without debit")
	SummonScreen.draw(app,1); SummonScreen.draw(app,10)
	check(economic()==committed,"rapid taps cannot redraw")
	await create_timer(0.4).timeout
	check(film.movie_visible and film.player.stream_position>0,"real Theora decoding advances")
	check(film.reveal_amount==0,"opening is neutral")
	film._set_backgrounded(true)
	var p: float=film.player.stream_position
	var t: float=film.elapsed
	await create_timer(0.2).timeout
	check(film.player.paused and is_equal_approx(p,film.player.stream_position) and is_equal_approx(t,film.elapsed),"media and effects pause together")
	film._set_backgrounded(false)
	film._finish(true); film._finish(true)
	await frames()
	check(is_instance_valid(app.modal_box) and economic()==committed,"skip only displays awarded result")
	app._close_modal(); await frames()
	check(app.store.pending_summon().is_empty(),"closing results acknowledges presentation")
	SummonScreen.draw(app,10); film=app.get_meta(SummonScreen.ACTIVE_CINEMATIC)
	committed=economic()
	var ten: Array=app.state().drawHistory[-1].results
	check(ten.size()==10 and film.rarity==SummonMovie.quality(ten),"ten uses true highest rarity")
	var deadline: int=Time.get_ticks_msec()+12000
	while app.has_meta(SummonScreen.ACTIVE_CINEMATIC) and Time.get_ticks_msec()<deadline: await process_frame
	await frames()
	check(is_instance_valid(app.modal_box) and economic()==committed,"natural completion converges without awarding")
	app._close_modal(); await frames()
	# Replenish only in this isolated test save via the standard demo slot.
	app._load_slot("demo:late"); await frames()
	# Whatever resources this fixture supplies, use single draws.
	for mode: String in ["missing","denied","removed","reduced"]:
		app.store.state.resources.ticket=maxi(4,int(app.store.state.resources.ticket))
		if mode=="reduced": app.store.state.settings.simplified=true
		SummonScreen.draw(app,1)
		film=app.get_meta(SummonScreen.ACTIVE_CINEMATIC,null)
		check(is_instance_valid(film),mode+" has committed presentation")
		if not is_instance_valid(film): continue
		committed=economic()
		if mode=="removed": film.queue_free()
		elif mode!="reduced": film.fail_media("simulated "+mode)
		await create_timer(1.8).timeout; await frames()
		check(is_instance_valid(app.modal_box) and economic()==committed,mode+" preserves all results")
		app._close_modal(); await frames()
	app.store.state.settings.simplified=false
	var saved: String=economic()
	app.store.fail_writes=true
	SummonScreen.draw(app,1)
	check(not app.has_meta(SummonScreen.ACTIVE_CINEMATIC) and economic()==saved,"failed commit cannot start media or charge")
	app.store.fail_writes=false
	var result: Dictionary=app.store.transact("summon",{"count":1,"txid":"recovery-fixture","presentation":true})
	check(result.ok,"recovery fixture committed")
	committed=economic()
	var slot: String=app.store.slot
	app.store.release(); app.store.load_slot(slot)
	check(not app.store.pending_summon().is_empty(),"fresh disk read retains pending transaction")
	SummonScreen.recover_pending(app)
	check(is_instance_valid(app.modal_box) and economic()==committed,"reload restores existing records without rolling")
	app._close_modal()
	for q: String in ["mortal","immortal","divine"]:
		for hero: Dictionary in GameData.content("CHARACTERS"):
			if hero.rarity==q:
				var r: String=SummonMovie.quality([{"id":hero.id}])
				check(r=={"mortal":"blue","immortal":"purple","divine":"gold"}[q],"rarity mapping "+q)
				check(ResourceLoader.exists("res://assets/portraits/%s-premium.webp" % hero.id),"real portrait "+hero.id)
				break
	app.store.release(); app.queue_free(); await frames()
	print("SUMMON V10: ",checks," checks, ",failed," failures")
	quit(0 if failed==0 else 1)
