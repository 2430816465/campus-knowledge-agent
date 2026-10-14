extends SceneTree
var app: Control
var count: int=0
var failures: Array=[]
func _initialize() -> void: run.call_deferred()
func check(ok: bool,message: String) -> void:
	count+=1
	if not ok: failures.append(message); push_error(message)
func frames(n: int=4) -> void:
	for i: int in n: await process_frame
func economic() -> String:
	var s: Dictionary=app.state().duplicate(true); s.erase("summonPresentation"); s.erase("revision"); return JSON.stringify(s)
func presenter() -> SummonResults: return app.modal_box.get_node("SummonResults") as SummonResults
func run() -> void:
	root.size=Vector2i(540,960)
	app=load("res://scenes/main.tscn").instantiate(); app.set_meta("ui_test",true); root.add_child(app); app.set_process(false)
	app.audio.sound_enabled=false; await frames(); app._go(3)
	var before: int=app.state().resources.ticket
	SummonScreen.draw(app,10); var film: SummonMovie=app.get_meta(SummonScreen.ACTIVE_CINEMATIC)
	var committed: String=economic(); var pending: Dictionary=app.store.pending_summon()
	check(app.state().resources.ticket==before-10 and film.records==pending.results,"ten committed once before media")
	SummonScreen.draw(app,10); SummonScreen.draw(app,1)
	check(economic()==committed,"rapid taps blocked")
	film._finish(false); await frames(6)
	var ui: SummonResults=presenter()
	check(ui.view==SummonResults.View.PORTRAIT and ui.index==0 and ui.sequential,"natural completion starts first real portrait")
	check(ui.records==pending.results,"portrait sequence keeps original order")
	for i: int in 10:
		check(ui.index==i and ui.content.has_node("ResultPortrait_"+str(pending.results[i].id)),"portrait "+str(i)+" uses actual hero")
		ui.age=.5; ui.advance()
	check(ui.view==SummonResults.View.CARDS and ui.cards.size()==10,"after ten portraits show all ten cards")
	check(economic()==committed,"revealing cannot award again")
	for i: int in 10: check(ui.cards[i].record==pending.results[i],"card record "+str(i))
	ui.show_detail(5); check(ui.index==5 and not ui.sequential,"card opens specific detail")
	ui.show_cards(); app._close_modal(); await frames()
	check(app.store.pending_summon().is_empty(),"closing acknowledges journal")
	app.store.state.resources.ticket=maxi(12,int(app.store.state.resources.ticket))
	SummonScreen.draw(app,10); film=app.get_meta(SummonScreen.ACTIVE_CINEMATIC); committed=economic()
	film._finish(true); film._finish(false); await frames(6); ui=presenter()
	check(ui.view==SummonResults.View.CARDS and ui.cards.size()==10,"skip goes directly to ten-card arrangement")
	check(economic()==committed,"skip/end race preserves credit exactly once")
	# All cards and actions fit short and tall portrait windows without scrolling.
	for dimensions: Vector2i in [Vector2i(540,960),Vector2i(540,1200),Vector2i(324,576)]:
		root.content_scale_size=dimensions; root.size=dimensions; await frames(6); ui._build()
		for card: Button in ui.cards: check(Rect2(Vector2.ZERO,ui.size).encloses(Rect2(card.position,card.size)),"card fits "+str(dimensions))
		for action: Button in ui.actions: check(Rect2(Vector2.ZERO,ui.size).encloses(Rect2(action.position,action.size)),"action fits "+str(dimensions))
	app._close_modal(); await frames(); root.content_scale_size=Vector2i(540,960); root.size=Vector2i(540,960)
	for mode: String in ["single","failure","reduced"]:
		app.store.state.resources.ticket=maxi(4,int(app.store.state.resources.ticket))
		app.store.state.settings.simplified=(mode=="reduced")
		SummonScreen.draw(app,1); film=app.get_meta(SummonScreen.ACTIVE_CINEMATIC); committed=economic()
		if mode=="failure": film.fail_media("intentional failure")
		elif mode=="single": film._finish(false)
		await create_timer(.2).timeout; await frames(6); ui=presenter()
		check(ui.view==(SummonResults.View.PORTRAIT if mode=="single" else SummonResults.View.CARDS),mode+" correct destination")
		check(economic()==committed,mode+" economy preserved")
		app._close_modal(); await frames()
	app.store.release(); app.queue_free(); await frames()
	var f:=FileAccess.open("res://video-production/docs/game-contract-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"checks":count,"failures":failures},"  "));f.close()
	print("SUMMON V11: ",count," checks, ",failures.size()," failures"); quit(0 if failures.is_empty() else 1)
