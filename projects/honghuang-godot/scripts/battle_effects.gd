class_name BattleEffects
extends Control
signal action_started(entry: Dictionary)
signal impact(event: Dictionary)
signal presentation_finished
## Read-only presentation of committed combat events. No RNG, combat calls, particles,
## or timers survive this one bounded drawing node. Coordinates never move cards.
const MAX_EFFECTS := 4
const DURATIONS := {"eye":0.92,"pearls":1.08,"clouds":1.20,"swords":1.16,"rally":0.94,"transfer":1.04,"lotus":0.82,"lightning":0.72,"ward":0.72,"sigil":0.82,"wave":0.80,"cleave":0.68,"arrow":0.62,"skirmish":0.70,"follow":0.40,"strike":0.44,"simple":0.22}
var entries: Array = []
var anchors: Dictionary = {}
var age := 0.0
var duration := 0.0
var speed := 1.0
var caption: Label
var cues: Array = []
var cue_cursor := 0
var amounts: Array = []

static func family(event: Dictionary, units: Array) -> String:
	var kind: String = str(event.get("type",""))
	var fx: String = str(event.get("fx",""))
	if kind == "combined": return "clouds"
	if kind == "harmonize": return "transfer"
	if kind in ["follow","trigger"]:
		if fx == "pearl-counter": return "pearls"
		if fx == "morale-focus" or event.get("triggerId") == "moraleFinish": return "rally"
		return "follow"
	if kind == "attack": return "strike"
	if kind == "guard": return "ward"
	if kind == "method": return "sigil"
	if kind == "charge": return "sigil"
	match fx:
		"eye-spear": return "eye"
		"pearl-orbit": return "pearls"
		"sword-array": return "swords"
		"gold-dipper": return "sigil"
		"twin-scissors": return "skirmish"
		"water-ward","tiger-guard","yin-yang": return "ward"
		"imperial-banner","phoenix-arrow": return "rally"
		"lotus-flame","heart-lantern": return "lotus"
		"chain-lightning","storm-wave": return "lightning"
		"fire-ring","furnace-smash": return "wave"
	var actor: Dictionary = {}
	for unit: Dictionary in units:
		if unit.get("uid") == event.get("actorUid"): actor = unit; break
	var role: String = str(GameData.character(str(actor.get("id",""))).get("combatRole",actor.get("role","")))
	return {"healer":"lotus","sustain":"lotus","support":"ward","tank":"ward","guard":"ward","control":"sigil","striker":"arrow","breaker":"cleave","skirmisher":"skirmish","area":"wave","commander":"rally","stone":"ward","shield":"ward","burner":"wave"}.get(role,"strike")

static func plan(events: Array, units: Array, simplified: bool = false) -> Array:
	var chosen: Dictionary = {}
	# Healing/shield/status events can precede their parent skill; choose the action.
	for priority: String in ["combined","skill","attack","guard","method","charge","heal","shield"]:
		for event: Dictionary in events:
			if event.get("type") == priority and not event.get("targetUids",[]).is_empty(): chosen = event; break
		if not chosen.is_empty(): break
	if chosen.is_empty(): return []
	# The real harmonize event carries both selected endpoints. Without it there is
	# no transferable buff, so Xuandu shows only the real base ward.
	for event: Dictionary in events:
		if event.get("type") == "harmonize": chosen = event; break
	var first: Dictionary = _entry(chosen,units,simplified)
	var shields: Array = []
	var allies: Array = []
	for event: Dictionary in events:
		if event.get("actorUid") != chosen.get("actorUid"): continue
		if event.get("type") == "shield":
			for uid: String in event.get("targetUids",[]):
				if not shields.has(uid): shields.append(uid)
		if event.get("type") in ["status","heal","shield"]:
			for uid: String in event.get("targetUids",[]):
				for unit: Dictionary in units:
					if unit.uid == uid and unit.side == "ally" and not allies.has(uid): allies.append(uid)
	first["shieldUids"] = shields.slice(0,5)
	first["allyUids"] = allies.slice(0,5)
	var result: Array = [first]
	if simplified: return result
	var seen: Dictionary = {}
	for event: Dictionary in events:
		var trigger: String = str(event.get("triggerId",""))
		if event.get("type") != "follow" and not (event.get("type") == "trigger" and trigger in ["mark","nezhaFollow","pearlCounter","counter","moraleFinish","spearFinish","swordFinish"]): continue
		var signature: String = str(event.get("actorUid",""))+str(event.get("targetUids",[]))+trigger
		if seen.has(signature) or result.size() >= MAX_EFFECTS: continue
		# A trigger and a following damage/follow event may describe the same reaction.
		if event.get("type") == "follow" and trigger == "nezhaFollow" and seen.has(str(event.get("actorUid",""))+str(event.get("targetUids",[]))+trigger): continue
		seen[signature] = true
		var entry: Dictionary = _entry(event,units,false)
		entry["delay"] = float(first.duration)*0.66+float(result.size()-1)*0.08
		entry["duration"] = 0.38 if entry.family != "pearls" else 0.54
		result.append(entry)
	return result

static func _entry(event: Dictionary, units: Array, simplified: bool) -> Dictionary:
	var effect: String = "simple" if simplified else family(event,units)
	var actor: Dictionary = {}
	for unit: Dictionary in units:
		if unit.get("uid")==event.get("actorUid"): actor=unit; break
	var animation: String = "attack" if event.get("type") in ["attack","follow","trigger"] else "cast"
	var body: bool = actor.get("id")=="nezha" and BattleActor.available()
	return {"family":effect,"actorUid":str(event.get("actorUid","")),"targetUids":event.get("targetUids",[]).slice(0,10),"responderUids":event.get("responderUids",[]).slice(0,3),"color":Color(event.get("color","#e9c88a")),"delay":0.0,"duration":DURATIONS[effect] if simplified or not body else BattleActor.duration_for(animation),"impactFraction":BattleActor.impact_fraction(animation) if body else 0.52,"animation":animation,"text":str(event.get("text","")),"eventType":str(event.get("type","")),"sequence":event.get("sequence",0)}

static func timeline(events: Array, effects: Array) -> Array:
	# Every committed amount is presented once, including shield absorption,
	# counter/follow-up hits and periodic damage. No result is recalculated here.
	var result: Array = []
	for entry: Dictionary in effects:
		result.append({"at":float(entry.delay),"kind":"action","entry":entry,"sequence":-1})
		for i: int in entry.get("responderUids",[]).size():
			var response: Dictionary=entry.duplicate(true)
			response.actorUid=entry.responderUids[i]
			response.animation="cast"
			result.append({"at":float(entry.delay)+float(i)*float(entry.duration)*0.18,"kind":"action","entry":response,"sequence":-1})
	for event: Dictionary in events:
		if event.get("type") not in ["damage","followDamage","multiHitDamage","boonDamage","heal","shield","death","status","cleanse"]: continue
		var entry: Dictionary=effects[0] if not effects.is_empty() else {"delay":0.0,"duration":0.22,"impactFraction":0.5}
		for candidate: Dictionary in effects:
			if candidate.actorUid==event.get("actorUid"):
				entry=candidate
				if event.get("origin","direct")=="direct": break
		result.append({"at":float(entry.delay)+float(entry.duration)*float(entry.get("impactFraction",0.52)),"kind":"impact","event":event.duplicate(true),"sequence":int(event.get("sequence",0))})
	result.sort_custom(func(a: Dictionary,b: Dictionary) -> bool: return a.at<b.at if not is_equal_approx(a.at,b.at) else int(a.sequence)<int(b.sequence))
	return result

static func total_duration(effects: Array) -> float:
	var longest := 0.22
	for entry: Dictionary in effects: longest = maxf(longest,float(entry.delay)+float(entry.duration))
	return longest

func setup(value: Array, points: Dictionary, playback_speed: int, events: Array = []) -> void:
	entries = value.duplicate(true)
	anchors = points.duplicate()
	speed = clampf(float(playback_speed),1.0,3.0)
	duration = total_duration(entries)
	cues = timeline(events,entries)
	cue_cursor = 0
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 10

func _ready() -> void:
	caption = GameTheme.label("",13,GameTheme.GOLD)
	caption.position = Vector2(0,size.y-29)
	caption.size = Vector2(size.x,27)
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(caption)

func _process(delta: float) -> void:
	age += minf(delta,0.1)*speed
	while cue_cursor<cues.size() and float(cues[cue_cursor].at)<=age:
		var cue: Dictionary=cues[cue_cursor]
		cue_cursor+=1
		if cue.kind=="action": action_started.emit(cue.entry)
		else: impact.emit(cue.event)
	for amount: Dictionary in amounts:
		var label: Label=amount.node
		if not is_instance_valid(label): continue
		var progress: float=clampf((age-float(amount.at))/0.4,0,1)
		label.position=amount.position+Vector2(0,-20*progress)
		label.modulate.a=1.0-progress
	queue_redraw()
	if is_instance_valid(caption) and not entries.is_empty():
		var entry: Dictionary = entries[0]
		var phase: float = clampf(age/float(entry.duration),0.0,1.0)
		caption.text = str(entry.text)
		if entry.family == "clouds":
			caption.text = ["云霄启阵","琼霄响应 · 不消耗额外行动","碧霄响应 · 不消耗额外行动","三霄合阵 · 云霄本次施放"][mini(3,int(phase*4))]
		caption.modulate.a = minf(1.0,(duration-age)*6.0)
	if age >= duration:
		presentation_finished.emit()
		queue_free()

func show_amount(uid: String, kind: String, value: int) -> void:
	if value<=0: return
	var label: Label=GameTheme.label(("+" if kind=="heal" else "盾" if kind=="shield" else "−")+str(value),20,GameTheme.JADE if kind in ["heal","shield"] else GameTheme.GOLD)
	label.autowrap_mode=TextServer.AUTOWRAP_OFF
	label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	label.size=Vector2(100,28)
	label.position=point(uid)-Vector2(50,36)
	# Keep a single effect owner; amounts die/freeze with this same timeline.
	var previous: int=amounts.filter(func(a: Dictionary) -> bool: return a.uid==uid and age-float(a.at)<0.15).size()
	label.position.y-=previous*22
	add_child(label)
	amounts.append({"node":label,"uid":uid,"at":age,"position":label.position})

func point(uid: String) -> Vector2:
	return anchors.get(uid,size*0.5)

func _draw() -> void:
	for entry: Dictionary in entries:
		var raw_progress: float = (age-float(entry.delay))/float(entry.duration)
		# The release/impact frame and visual arrival use the same normalized beat.
		var beat: float=float(entry.get("impactFraction",0.52))
		var progress: float = raw_progress*0.625/beat if raw_progress<=beat else 0.625+(raw_progress-beat)*0.375/(1.0-beat)
		if progress < 0 or progress > 1: continue
		var color: Color = entry.color
		color.a = minf(progress*12.0,1.0)*minf((1.0-progress)*8.0,1.0)*0.88
		var source: Vector2 = point(str(entry.actorUid))
		var targets: Array[Vector2] = []
		for uid: String in entry.targetUids: targets.append(point(uid))
		match entry.family:
			"eye": _eye(source,targets,progress,color)
			"pearls": _pearls(source,targets,progress,color,entry)
			"clouds": _clouds(targets,progress,color,entry)
			"swords": _swords(targets,progress,color)
			"rally": _rally(source,targets,progress,color,entry)
			"transfer": _transfer(targets,progress,color)
			"lotus": _lotus(targets,progress,color)
			"lightning": _lightning(source,targets,progress,color)
			"ward":
				for target: Vector2 in targets: _ward(target,progress,color)
			"sigil":
				for target: Vector2 in targets: _sigil(target,26.0+progress*8.0,progress*0.5,color)
			"wave":
				for target: Vector2 in targets:
					draw_arc(target,12.0+progress*39.0,0,TAU,32,color,2.5,true)
					for i: int in 5: _petal(target+Vector2.from_angle(float(i)*TAU/5)*24,8+progress*8,float(i)*TAU/5,color)
			"cleave":
				for target: Vector2 in targets:
					_sword(target+Vector2(-24,30).lerp(Vector2(24,-30),progress),Vector2(0.6,-0.8),color,1.5)
					if progress>0.4: draw_arc(target,33,-PI*0.8,PI*0.2,24,color,3,true)
			"skirmish":
				for target: Vector2 in targets:
					for side: int in [-1,1]: _dart(source+Vector2(side*12,0),target+Vector2(side*9,0),progress,color)
			"follow":
				for target: Vector2 in targets:
					_sigil(target,19,0,color)
					_dart(source,target,progress,color)
			"simple":
				for target: Vector2 in targets: draw_arc(target,31,0,TAU,20,color,2,true)
			_:
				for target: Vector2 in targets: _dart(source,target,progress,color)

func _dart(source: Vector2, target: Vector2, progress: float, color: Color) -> void:
	var head: Vector2 = source.lerp(target,clampf(progress*1.6,0,1))
	var direction: Vector2 = (target-source).normalized()
	draw_line(head-direction*23,head,color,2.5,true)
	draw_colored_polygon(PackedVector2Array([head+direction*8,head-direction*6+direction.orthogonal()*4,head-direction*6-direction.orthogonal()*4]),color)

func _sigil(center: Vector2, radius: float, angle: float, color: Color) -> void:
	draw_arc(center,radius,0,TAU,32,color,1.5,true)
	var vertices: PackedVector2Array = []
	for i: int in 7: vertices.append(center+Vector2.from_angle(angle+float(i)*TAU/6)*radius*0.77)
	draw_polyline(vertices,color,1.3,true)
	draw_line(center+Vector2(-7,0),center+Vector2(7,0),color,2,true)
	draw_line(center+Vector2(0,-7),center+Vector2(0,7),color,2,true)

func _eye(source: Vector2, targets: Array[Vector2], progress: float, color: Color) -> void:
	var eye: Vector2 = source+Vector2(0,-22)
	var width: float = 15.0*minf(progress*5.0,1.0)
	var shape: PackedVector2Array = [eye+Vector2(-width,0),eye+Vector2(0,-7),eye+Vector2(width,0),eye+Vector2(0,7),eye+Vector2(-width,0)]
	draw_polyline(shape,color,2,true)
	draw_circle(eye,3.2,color)
	for target: Vector2 in targets:
		if progress>0.23:
			draw_line(eye,target,color*Color(1,1,1,0.45),1,true)
			_sigil(target,22,PI*0.25,color)
		if progress>0.42: _dart(eye,target,(progress-0.42)/0.58,color)

func _pearls(source: Vector2, targets: Array[Vector2], progress: float, color: Color, entry: Dictionary) -> void:
	var target: Vector2 = targets[0] if not targets.is_empty() else source
	for uid: String in entry.get("shieldUids",[]): _ward(point(uid),progress,color*Color(1,1,1,0.45))
	for i: int in 5:
		var orbit: Vector2 = source+Vector2.from_angle(float(i)*TAU/5+progress*3)*29
		var pearl: Vector2 = orbit
		var offset := Vector2(float(i-2)*7,-12)
		if progress>=0.25 and progress<0.57: pearl = orbit.lerp(target+offset,(progress-0.25)/0.32)
		elif progress>=0.57 and progress<0.67: pearl = target+offset
		elif progress>=0.67: pearl = (target+offset).lerp(orbit,(progress-0.67)/0.33)
		draw_circle(pearl,7,color*Color(1,1,1,0.2))
		draw_circle(pearl,3.6,color)
		draw_arc(pearl,5,0,TAU,12,color,1,true)

func _clouds(targets: Array[Vector2], progress: float, color: Color, entry: Dictionary) -> void:
	var responders: Array = entry.get("responderUids",[])
	var points: PackedVector2Array = []
	for i: int in responders.size():
		var center: Vector2 = point(str(responders[i]))
		points.append(center)
		var response: float = clampf((progress-float(i)*0.18)*4.0,0,1)
		if response>0: _sigil(center,20+response*6,float(i)*PI/3,color*Color(1,1,1,response))
	if progress>0.3 and points.size()==3:
		points.append(points[0])
		draw_polyline(points,color*Color(1,1,1,0.65),1.5,true)
	if progress>0.53:
		for target: Vector2 in targets: _sigil(target,15+(progress-0.53)*54,-progress,color*Color(1,1,1,0.7))

func _sword(center: Vector2, direction: Vector2, color: Color, scale_value: float = 1.0) -> void:
	var perpendicular: Vector2 = direction.orthogonal()
	var blade: PackedVector2Array = [center+direction*19*scale_value,center-direction*8*scale_value+perpendicular*3*scale_value,center-direction*8*scale_value-perpendicular*3*scale_value]
	draw_colored_polygon(blade,color)
	draw_line(center-direction*8*scale_value-perpendicular*7*scale_value,center-direction*8*scale_value+perpendicular*7*scale_value,color,2,true)
	draw_line(center-direction*8*scale_value,center-direction*16*scale_value,color,2,true)

func _swords(targets: Array[Vector2], progress: float, color: Color) -> void:
	for target: Vector2 in targets:
		_sigil(target,33,minf(progress,0.32)*1.2,color*Color(1,1,1,0.7))
		for i: int in 4:
			var angle: float = float(i)*TAU/4-PI/4
			var outer: Vector2 = target+Vector2.from_angle(angle)*48
			var strike: float = clampf((progress-0.36-float(i)*0.045)/0.27,0,1)
			if progress>0.16+float(i)*0.035: _sword(outer.lerp(target,strike),-Vector2.from_angle(angle),color)
		if progress>0.8: draw_arc(target,31*(1-(progress-0.8)/0.2),0,TAU,28,color,2.2,true)

func _rally(source: Vector2, targets: Array[Vector2], progress: float, color: Color, entry: Dictionary) -> void:
	var banner: Vector2 = source+Vector2(-18,-28)
	draw_line(banner+Vector2(0,44),banner,color,2.5,true)
	draw_colored_polygon(PackedVector2Array([banner,banner+Vector2(30,3),banner+Vector2(24,13),banner+Vector2(0,14)]),color)
	for uid: String in entry.get("allyUids",[]):
		var center: Vector2 = point(uid)
		if progress>0.16:
			draw_arc(center,25+progress*8,0.15*PI,0.85*PI,22,color,2,true)
			for i: int in 3: draw_line(center+Vector2(float(i-1)*9,18),center+Vector2(float(i-1)*9,9-progress*12),color,1.5,true)
	for target: Vector2 in targets:
		if progress>0.4 and not entry.get("allyUids",[]).any(func(uid: String) -> bool: return point(uid)==target):
			_sigil(target,19,0,color)
			_dart(source,target,(progress-0.4)/0.6,color)

func _transfer(targets: Array[Vector2], progress: float, color: Color) -> void:
	if targets.size()<2: return
	var source: Vector2 = targets[0]
	var recipient: Vector2 = targets[1]
	var control: Vector2 = (source+recipient)*0.5+Vector2(0,-62)
	var path: PackedVector2Array = []
	for i: int in 25:
		var t: float = float(i)/24
		path.append(source.lerp(control,t).lerp(control.lerp(recipient,t),t))
	draw_polyline(path,color*Color(1,1,1,0.38),1.4,true)
	_sigil(source,20,progress,color*Color(1,1,1,1-progress*0.65))
	var t: float = clampf((progress-0.16)/0.61,0,1)
	var token: Vector2 = source.lerp(control,t).lerp(control.lerp(recipient,t),t)
	_sigil(token,8,-progress*2,color)
	draw_circle(token,3,color)
	if progress>0.65: _ward(recipient,(progress-0.65)/0.35,color)

func _petal(center: Vector2, radius: float, rotation: float, color: Color) -> void:
	var direction: Vector2 = Vector2.from_angle(rotation)
	var side: Vector2 = direction.orthogonal()
	var points: PackedVector2Array = [center,center+direction*radius*0.5+side*radius*0.3,center+direction*radius,center+direction*radius*0.5-side*radius*0.3,center]
	draw_polyline(points,color,1.5,true)

func _lotus(targets: Array[Vector2], progress: float, color: Color) -> void:
	for target: Vector2 in targets:
		var center: Vector2 = target+Vector2(0,22-progress*10)
		for i: int in 5: _petal(center,24+progress*8,-PI+float(i)*PI/4,color)
		draw_arc(center,29,0.1*PI,0.9*PI,25,color,1.5,true)

func _ward(target: Vector2, progress: float, color: Color) -> void:
	var height: float = 30.0*minf(progress*4,1)
	var shape: PackedVector2Array = [target+Vector2(-26,-height),target+Vector2(26,-height),target+Vector2(23,13),target+Vector2(0,32),target+Vector2(-23,13),target+Vector2(-26,-height)]
	draw_polyline(shape,color,2,true)
	draw_arc(target,36,0.12*PI,0.88*PI,22,color*Color(1,1,1,0.55),1.5,true)

func _lightning(source: Vector2, targets: Array[Vector2], progress: float, color: Color) -> void:
	for index: int in targets.size():
		if progress<float(index)*0.09: continue
		var target: Vector2 = targets[index]
		var start: Vector2 = source if index==0 else targets[index-1]
		var delta: Vector2 = target-start
		var normal: Vector2 = delta.normalized().orthogonal()
		var bend: float = 9.0 if int(progress*12)%2==0 else -9.0
		draw_polyline(PackedVector2Array([start,start+delta*0.31+normal*bend,start+delta*0.49-normal*bend,start+delta*0.72+normal*bend*0.7,target]),color,2.5,true)
		draw_arc(target,13+progress*14,0,TAU,18,color,1.5,true)
