class_name EstateProgressionLandmarks
extends RefCounted
## Read-only scenery bound to completed growth. It never occupies a build plot.
const Art = preload("res://scripts/game_illustrated_icon.gd")
const REGIONS := ["mountain","river","stars"]
const NAMES := ["山川洞天","河泽洞天","星台洞天"]

static func model(state: Dictionary) -> Array[Dictionary]:
	var p: Dictionary=state.get("progression",{})
	var result: Array[Dictionary]=[]
	var monument: int=int(p.get("monument",{}).get("level",0))
	if monument>0:
		result.append({"id":"monument","name":"镇府至宝","level":monument,"system":"025","cell":Vector2i(-2,4),"icon":"treasure","color":Color("f3dba2")})
	var levels: Dictionary=p.get("grotto",{}).get("regions",{})
	for index: int in 3:
		var level: int=int(levels.get(REGIONS[index],0))
		if level>0:
			result.append({"id":REGIONS[index],"name":NAMES[index],"level":level,"system":"030","cell":[Vector2i(3,-2),Vector2i(13,10),Vector2i(-2,14)][index],"icon":["estate","lotus","meditation"][index],"color":[Color("82b8bf"),Color("8dd3e2"),Color("bac1ee")][index]})
	return result

static func refresh(estate: EstateView) -> void:
	var signature: String=JSON.stringify(estate.state.get("progression",{}).get("monument",{}))+JSON.stringify(estate.state.get("progression",{}).get("grotto",{}))
	if signature==str(estate.get_meta("progression_scenery_signature","")): return
	estate.set_meta("progression_scenery_signature",signature)
	for child: Node in estate.facilities.get_children():
		if child.get_meta("progression_landmark",false):
			estate.facilities.remove_child(child)
			child.queue_free()
	for item: Dictionary in model(estate.state):
		var node:=Node2D.new()
		node.name="GrowthLandmark_"+str(item.id)
		node.set_meta("progression_landmark",true)
		node.set_meta("system_id",item.system)
		node.set_meta("growth_level",item.level)
		node.position=estate.tile_to_world(item.cell)
		estate.facilities.add_child(node)
		var art:=Sprite2D.new()
		art.texture=Art.texture(item.icon)
		art.position=Vector2(0,-42)
		art.scale=Vector2.ONE*((115.0+minf(5,int(item.level))*6)/art.texture.get_width())
		node.add_child(art)
		var halo:=Polygon2D.new()
		var points:=PackedVector2Array()
		for point: int in 48:
			var angle: float=TAU*point/48.0
			points.append(Vector2(cos(angle)*58,sin(angle)*21))
		halo.polygon=points
		halo.color=Color(item.color,0.22)
		halo.show_behind_parent=true
		node.add_child(halo)
		var nameplate:=GameTheme.label("%s · %d级" % [item.name,item.level],12,Color("f4edd4"))
		nameplate.position=Vector2(-70,8)
		nameplate.size=Vector2(140,22)
		nameplate.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
		nameplate.mouse_filter=Control.MOUSE_FILTER_IGNORE
		nameplate.add_theme_color_override("font_outline_color",Color("193d50"))
		nameplate.add_theme_constant_override("outline_size",3)
		node.add_child(nameplate)
		# Completed tiers add distinct visible vegetation, lanterns and rocks.
		for tier: int in mini(5,int(item.level)):
			var detail:=Sprite2D.new()
			var prop: String=["scholar-rock","jade-blossom","vermilion-lantern","azalea"][tier%4]
			detail.texture=load("res://assets/estate-v05/%s.png" % prop)
			detail.scale=Vector2.ONE*0.13
			detail.position=Vector2((tier-2)*24,8+absf(tier-2)*2)
			detail.offset=Vector2(0,-76)
			node.add_child(detail)

static func at_world(estate: EstateView,point: Vector2) -> String:
	if estate.editing or estate.construction_mode or estate.expansion_mode: return ""
	for item: Dictionary in model(estate.state):
		var center: Vector2=estate.tile_to_world(item.cell)+Vector2(0,-42)
		if center.distance_to(point)<42: return str(item.system)
	return ""
