@tool
extends PanelContainer
signal activated(item_id: String)
var item_id: String = ""
var data: Dictionary = {}
func configure(value: Dictionary) -> void:
	data = value.duplicate(true)
	item_id = str(value.get("id",""))
	$Content/Heading.text = str(value.get("heading","装备"))
	$Content/Name.text = str(value.get("name","尚未装备"))
	$Content/Name.tooltip_text = $Content/Name.text
	$Content/Stat.text = str(value.get("stat","炼器后查看属性"))
	$Content/Stat.tooltip_text = $Content/Stat.text
	$Content/Details.text = str(value.get("details",""))
	$Content/Details.visible = not $Content/Details.text.is_empty()
	$Content/Quantity.text = str(value.get("quantity",""))
	$Content/Quantity.visible = not $Content/Quantity.text.is_empty()
	$Content/Icon.texture = value.get("texture",preload("res://scripts/ui/foundation_icons.gd").texture(str(value.get("icon","sword"))))
	$Content/Icon.visible = not bool(value.get("empty",false))
	$Content/Icon.modulate = value.get("tint",Color.WHITE)
	$Content/Heading.modulate = value.get("quality_color",Color.WHITE)
	theme_type_variation = "EquipmentNew" if value.get("new",false) else "EquipmentOld"
	tooltip_text = str(value.get("name",""))+"\n"+str(value.get("details",""))
func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		activated.emit(item_id)
		accept_event()
