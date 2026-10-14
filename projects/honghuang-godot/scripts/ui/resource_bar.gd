@tool
extends HBoxContainer
signal operation_requested(resource_id: String)
@export var resource_id: String = "stone"
@export var amount: int = 128000
@export var caption: String = "灵石"
func _ready() -> void:
	$Add.pressed.connect(func() -> void: operation_requested.emit(resource_id))
	set_amount(amount)
func set_amount(value: int) -> void:
	amount = value
	if not is_node_ready(): return
	$Icon.texture = GameIllustratedIcon.texture(resource_id)
	$Value.text = "%s %s" % [caption,compact(value)]
	tooltip_text = "%s %d" % [caption,value]
static func compact(value: int) -> String:
	if abs(value) >= 100000000: return "%.1f亿" % (value / 100000000.0)
	if abs(value) >= 10000: return "%.1f万" % (value / 10000.0)
	return str(value)
