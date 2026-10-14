extends SceneTree
var checks := 0
var failures: Array=[]
var samples: Array=[]
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void: _run.call_deferred()
func _run() -> void:
	var view: BattleView=BattleView.new()
	root.add_child(view)
	view.set_process(false)
	for stage: int in [1,4,5,8,9,12,1]:
		var b: Dictionary=GameCombat.create(stage,[{"id":"nezha","level":5,"branch":"A","treasure":1}],{"seed":713,"trial":true})
		var before: String=JSON.stringify(b)
		view.configure(b,{"speed":1,"simplified":false})
		await process_frame
		var expected: String="res://assets/battle-background-premium.webp" if stage<=4 else "res://assets/battle/danfire-premium.webp" if stage<=8 else "res://assets/battle/thundermarsh-premium.webp"
		check(ResourceLoader.exists(expected),"chapter resource imports "+str(stage))
		check(view.arena_background.texture.resource_path==expected,"actual configured texture matches chapter "+str(stage))
		check(view.arena_background.stretch_mode==TextureRect.STRETCH_KEEP_ASPECT_COVERED,"chapter image retains aspect "+str(stage))
		check(view.arena.get_children().filter(func(n: Node) -> bool: return n is TextureRect).size()==1,"configure reuses one background node "+str(stage))
		check(JSON.stringify(b)==before,"chapter display never mutates battle, events, seed or RNG "+str(stage))
		samples.append({"stage":stage,"actualTexture":view.arena_background.texture.resource_path})
	view.queue_free()
	await process_frame
	var f: FileAccess=FileAccess.open("res://docs/audits/round-4-chapter-presentation-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"round":4,"checks":checks,"failures":failures,"samples":samples},"  "));f.close()
	print("CHAPTER PRESENTATION ROUND 4: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
