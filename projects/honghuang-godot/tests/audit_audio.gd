extends SceneTree
var checks := 0
var failures: Array = []
var phase := "preaudit"
var cues: Array = []
func check(value: bool,label: String) -> void:
	checks+=1
	if not value:failures.append(label);push_error("AUDIO AUDIT: "+label)
func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--audit-phase="):phase=arg.trim_prefix("--audit-phase=")
	_run.call_deferred()
func _run() -> void:
	var audio:=GameAudio.new()
	root.add_child(audio)
	var hashes: Dictionary={}
	for kind in ["click","harvest","summon","skill","hit","build","complete"]:
		audio.cue(kind)
		check(audio.voices.size()==1,"actual player created for "+kind)
		if audio.voices.is_empty():continue
		var player:AudioStreamPlayer=audio.voices[0]
		var stream:AudioStreamWAV=player.stream
		check(player.playing and stream.data.size()>4000 and stream.get_length()>0.1,"nonempty generated PCM is playing "+kind)
		var hash:=HashingContext.new()
		hash.start(HashingContext.HASH_SHA256);hash.update(stream.data)
		var signature:=hash.finish().hex_encode()
		check(not hashes.has(signature),"distinct PCM cue "+kind)
		hashes[signature]=kind
		cues.append({"cue":kind,"bytes":stream.data.size(),"duration":stream.get_length(),"sample_rate":stream.mix_rate,"sha256":signature})
		await create_timer(0.45).timeout
		check(audio.voices.is_empty(),"finished cue releases player "+kind)
	audio.configure({"sound":false,"music":false})
	audio.cue("complete")
	check(audio.voices.is_empty(),"sound disabled suppresses actual player creation")
	audio.configure({"sound":true,"music":false})
	for index in 8:audio.cue("hit")
	check(audio.voices.size()==4,"polyphony bound prevents unbounded simultaneous players")
	await create_timer(0.45).timeout
	check(audio.voices.is_empty(),"all bounded players are freed after audio completes")
	audio.configure({"sound":false,"music":true})
	audio._process(3.0)
	check(audio.voices.size()==1,"music enable drives real generated stream")
	audio.configure({"sound":false,"music":false})
	var count:=audio.voices.size()
	audio._process(3.0)
	check(audio.voices.size()==count,"music disable prevents new background notes")
	await create_timer(1.8).timeout
	check(audio.voices.is_empty(),"last music note naturally completes after disabling music")
	var output:=FileAccess.open("res://docs/audits/%s-audio.json"%phase,FileAccess.WRITE)
	output.store_string(JSON.stringify({"phase":phase,"utc":Time.get_datetime_string_from_system(true),"checks":checks,"failures":failures,"cues":cues,"audible_verification":false,"scope":"Generated PCM content, actual AudioStreamPlayer playing/finished lifecycle, toggles and bounded voices. No available physical audio output; listening quality remains unverified."},"  "));output.close()
	audio.queue_free()
	await process_frame
	print("AUDIO ",checks," checks / ",failures.size()," failures / ",cues.size()," real PCM cues")
	quit(0 if failures.is_empty() else 1)
