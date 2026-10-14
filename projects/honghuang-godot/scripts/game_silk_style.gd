class_name GameSilkStyle
extends StyleBox
## Native, resolution-independent silk and jade controls. No baked labels.
@export var role := "ribbon"
@export var color := Color("dceaf0")
@export var accent := Color("c4a66e")
@export var emphasized := false

func _draw(canvas: RID, rect: Rect2) -> void:
	var x := rect.position.x
	var y := rect.position.y
	var w := rect.size.x
	var h := rect.size.y
	if w < 1 or h < 1: return
	if role == "tab":
		if emphasized:
			var points := PackedVector2Array([Vector2(x,y+h*0.25),Vector2(x+w*0.5,y),Vector2(x+w,y+h*0.25),Vector2(x+w,y+h),Vector2(x,y+h)])
			RenderingServer.canvas_item_add_polygon(canvas,points,PackedColorArray([Color(color,0),Color(color,0.28),Color(color,0),Color(color,0.36),Color(color,0.36)]))
		var bottom := y+h-2
		RenderingServer.canvas_item_add_line(canvas,Vector2(x+w*0.15,bottom),Vector2(x+w*0.85,bottom),Color(accent,0.85 if emphasized else 0.2),1.5 if emphasized else 0.65,true)
		if emphasized: _diamond(canvas,Vector2(x+w*0.5,bottom),3,accent)
		return
	if role == "panel":
		# Open cloud shoulders; the page reads as one surface, without nested boxes.
		var r := minf(18,h*0.15)
		var points := PackedVector2Array([Vector2(x+r,y),Vector2(x+w-r,y),Vector2(x+w,y+r),Vector2(x+w,y+h-r),Vector2(x+w-r,y+h),Vector2(x+r,y+h),Vector2(x,y+h-r),Vector2(x,y+r)])
		RenderingServer.canvas_item_add_polygon(canvas,points,PackedColorArray([color]))
		RenderingServer.canvas_item_add_line(canvas,Vector2(x+18,y+2),Vector2(x+w-18,y+2),Color(accent,0.28),0.8,true)
		for left: bool in [true,false]:
			var edge := x+8 if left else x+w-8
			var sign := 1.0 if left else -1.0
			RenderingServer.canvas_item_add_polyline(canvas,PackedVector2Array([Vector2(edge,y+15),Vector2(edge+5*sign,y+7),Vector2(edge+15*sign,y+4),Vector2(edge+27*sign,y+7)]),PackedColorArray([Color(accent,0.55)]),1,true)
		return
	var cut := minf(16,minf(w*0.12,h*0.28))
	var points := PackedVector2Array([Vector2(x+cut,y+2),Vector2(x+w-cut,y+2),Vector2(x+w,y+h*0.5),Vector2(x+w-cut,y+h-2),Vector2(x+cut,y+h-2),Vector2(x,y+h*0.5)])
	RenderingServer.canvas_item_add_polygon(canvas,points,PackedColorArray([color.lightened(0.13),color.lightened(0.13),color,color.darkened(0.08),color.darkened(0.08),color]))
	# Only the primary action has a complete fine gold edge.
	if emphasized:
		var edge := points.duplicate()
		edge.append(points[0])
		RenderingServer.canvas_item_add_polyline(canvas,edge,PackedColorArray([Color(accent,0.8)]),0.85,true)
	else:
		RenderingServer.canvas_item_add_line(canvas,Vector2(x+cut+3,y+h-3),Vector2(x+w-cut-3,y+h-3),Color(accent,0.42),0.8,true)
		return
	for left: bool in [true,false]:
		var edge := x+cut*0.8 if left else x+w-cut*0.8
		var sign := 1.0 if left else -1.0
		RenderingServer.canvas_item_add_polyline(canvas,PackedVector2Array([Vector2(edge+6*sign,y+h*0.26),Vector2(edge,y+h*0.5),Vector2(edge+6*sign,y+h*0.74)]),PackedColorArray([Color(accent,0.75 if emphasized else 0.32)]),0.8,true)

func _diamond(canvas: RID, center: Vector2, radius: float, tint: Color) -> void:
	RenderingServer.canvas_item_add_polygon(canvas,PackedVector2Array([center+Vector2(-radius,0),center+Vector2(0,-radius),center+Vector2(radius,0),center+Vector2(0,radius)]),PackedColorArray([tint]))
