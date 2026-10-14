extends PanelContainer
signal navigation_requested(page_id: String)
@export var selected: String = "Forge"
func _ready() -> void:
	for button: Button in $Items.get_children():
		button.pressed.connect(func() -> void: navigation_requested.emit(str(button.name)))
	set_selected(selected)
func set_selected(value: String) -> void:
	selected = value
	if not is_node_ready(): return
	for button: Button in $Items.get_children():
		button.theme_type_variation = "Gold" if button.name == selected else "IconEntry"
