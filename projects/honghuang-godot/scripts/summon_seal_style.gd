extends StyleBox
var gold := false
var brightness := 1.0

func _draw(canvas: RID, rect: Rect2) -> void:
	var c := rect.get_center()
	var r := minf(rect.size.x*0.45,rect.size.y*0.46)
	var fill := Color("d4b76e") if gold else Color("376d83")
	fill=fill*Color(brightness,brightness,brightness,1)
	var edge := Color("f5d98b") if gold else Color("a7d5d6")
	var p := PackedVector2Array([c+Vector2(0,-r),c+Vector2(r*0.82,0),c+Vector2(0,r),c+Vector2(-r*0.82,0)])
	RenderingServer.canvas_item_add_polygon(canvas,p,PackedColorArray([fill.lightened(0.16),fill,fill.darkened(0.18),fill]))
	p.append(p[0])
	RenderingServer.canvas_item_add_polyline(canvas,p,PackedColorArray([edge]),1.5,true)
	for sign: float in [-1.0,1.0]:
		var branch := PackedVector2Array([c+Vector2(sign*r*0.96,4),c+Vector2(sign*r*0.74,-r*0.31),c+Vector2(sign*r*0.58,-r*0.26)])
		RenderingServer.canvas_item_add_polyline(canvas,branch,PackedColorArray([edge]),1.5,true)
		RenderingServer.canvas_item_add_line(canvas,c+Vector2(-r*0.13,sign*r*0.83),c+Vector2(r*0.13,sign*r*0.83),edge,1,true)
