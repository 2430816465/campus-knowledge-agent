class_name GameAudio
extends Node
## Generated pentatonic cues; summon ambience is the provided film's own audio.
var sound_enabled: bool = true
var music_enabled: bool = false
var activated: bool = false
var music_time: float = 0.0
var note_index: int = 0
var voices: Array[AudioStreamPlayer] = []
var backgrounded: bool = false
var ignore_resume_delta: bool = false
var summon_voice: AudioStreamPlayer

func start_summon_film(position: float=0) -> void:
	stop_summon_film()
	if not sound_enabled or backgrounded: return
	summon_voice=AudioStreamPlayer.new()
	summon_voice.stream=preload("res://assets/summon-remotion/ambience.ogg")
	summon_voice.volume_db=-7
	add_child(summon_voice)
	summon_voice.play(position)

func pause_summon_film(value: bool) -> void:
	if is_instance_valid(summon_voice): summon_voice.stream_paused=value

func sync_summon_film(position: float) -> void:
	if is_instance_valid(summon_voice) and summon_voice.playing and not summon_voice.stream_paused:
		if absf(summon_voice.get_playback_position()-position)>0.18: summon_voice.seek(position)

func stop_summon_film() -> void:
	if is_instance_valid(summon_voice): summon_voice.stop(); summon_voice.queue_free()
	summon_voice=null

func configure(settings: Dictionary) -> void:
	sound_enabled = bool(settings.get("sound", true))
	music_enabled = bool(settings.get("music", false))

func _process(delta: float) -> void:
	if backgrounded: return
	if ignore_resume_delta: ignore_resume_delta=false; return
	if not activated or not music_enabled: return
	music_time += delta
	if music_time > 2.8:
		music_time = 0.0
		var notes: Array[float] = [261.63, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66, 196.0]
		_note(notes[note_index % notes.size()], 1.6, 0.035)
		note_index += 1

func cue(kind: String = "click") -> void:
	if backgrounded: return
	activated = true
	if not sound_enabled: return
	if kind.begins_with("summon_"):
		var root_note: float={"summon_blue":392.0,"summon_purple":523.25,"summon_gold":659.25}.get(kind,392.0)
		_note(root_note,0.8,0.055)
		_note(root_note*1.5,1.0,0.04)
		return
	var frequency: float = {"click": 660.0, "harvest": 880.0, "summon": 523.25, "skill": 392.0, "hit": 185.0, "build": 440.0, "complete": 1046.5}.get(kind, 660.0)
	_note(frequency, 0.15 if kind == "click" else 0.32, 0.075)

func set_backgrounded(value: bool) -> void:
	if value==backgrounded: return
	backgrounded=value
	pause_summon_film(value)
	music_time=0.0
	ignore_resume_delta=not value
	if backgrounded: _stop_voices()

func _exit_tree() -> void: _stop_voices()

func _stop_voices() -> void:
	for voice: AudioStreamPlayer in voices:
		if is_instance_valid(voice):
			voice.stop()
			voice.stream=null
			voice.queue_free()
	voices.clear()

func _note(frequency: float, duration: float, gain: float) -> void:
	if voices.size() >= 4: return
	var sample_rate: int = 22050
	var frames: int = int(duration * sample_rate)
	var bytes: PackedByteArray = PackedByteArray()
	bytes.resize(frames * 2)
	for i: int in frames:
		var t: float = float(i) / sample_rate
		var envelope: float = minf(t * 40.0, 1.0) * exp(-t * 5.0 / duration) * (1.0 - t / duration)
		var value: float = (sin(TAU * frequency * t) + 0.22 * sin(TAU * frequency * 2.0 * t)) * envelope * gain
		bytes.encode_s16(i * 2, int(clampf(value, -1.0, 1.0) * 32767))
	var stream: AudioStreamWAV = AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.data = bytes
	var player: AudioStreamPlayer = AudioStreamPlayer.new()
	player.stream = stream
	add_child(player)
	voices.append(player)
	player.finished.connect(_release_voice.bind(player))
	# Dummy or disconnected audio devices may never emit finished. The native
	# cue is finite, so release its voice after its authored length regardless.
	var cleanup: Tween=player.create_tween()
	cleanup.tween_interval(duration+0.08)
	cleanup.tween_callback(_release_voice.bind(player))
	player.play()

func _release_voice(player: AudioStreamPlayer) -> void:
	if not is_instance_valid(player): return
	voices.erase(player)
	player.stop()
	player.stream=null
	player.queue_free()
