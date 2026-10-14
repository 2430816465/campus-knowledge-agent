@tool
extends StyleBox
## Nine slices with independent source/destination margins. This preserves the
## painted corner detail when a high-resolution atlas is used on small controls.
@export var texture: Texture2D
@export var source_rect: Rect2
@export var source_margin: float = 110.0
@export var border_width: float = 24.0
func _draw(canvas_item: RID, destination: Rect2) -> void:
	if texture == null: return
	var border: Vector2 = Vector2(minf(border_width,destination.size.x/2),minf(border_width,destination.size.y/2))
	var sx: Array[float] = [source_rect.position.x,source_rect.position.x+source_margin,source_rect.end.x-source_margin,source_rect.end.x]
	var sy: Array[float] = [source_rect.position.y,source_rect.position.y+source_margin,source_rect.end.y-source_margin,source_rect.end.y]
	var dx: Array[float] = [destination.position.x,destination.position.x+border.x,destination.end.x-border.x,destination.end.x]
	var dy: Array[float] = [destination.position.y,destination.position.y+border.y,destination.end.y-border.y,destination.end.y]
	for y: int in 3:
		for x: int in 3:
			var target := Rect2(dx[x],dy[y],dx[x+1]-dx[x],dy[y+1]-dy[y])
			var source := Rect2(sx[x],sy[y],sx[x+1]-sx[x],sy[y+1]-sy[y])
			RenderingServer.canvas_item_add_texture_rect_region(canvas_item,target,texture.get_rid(),source,Color.WHITE,false,true)
