@tool
extends Button
## Data-only visual entry. Native pressed signal is the operation boundary.
@export var caption: String = "功能":
	set(v):
		caption = v
		if is_node_ready(): $Caption.text = v
@export var icon_key: String = "forge":
	set(v):
		icon_key = v
		if is_node_ready(): $Icon.texture = preload("res://scripts/ui/foundation_icons.gd").texture(v)
@export var notice: bool = false:
	set(v):
		notice = v
		if is_node_ready(): $Notice.visible = v
@export var locked: bool = false:
	set(v):
		locked = v
		if is_node_ready(): disabled = v; $Lock.visible = v
func _ready() -> void:
	$Caption.text = caption
	$Icon.texture = preload("res://scripts/ui/foundation_icons.gd").texture(icon_key)
	$Notice.visible = notice
	$Lock.visible = locked
	disabled = locked
func configure(data: Dictionary) -> void:
	caption = str(data.get("caption",caption))
	icon_key = str(data.get("icon",icon_key))
	notice = bool(data.get("notice",false))
	locked = bool(data.get("locked",false))
	tooltip_text = str(data.get("hint",caption))
