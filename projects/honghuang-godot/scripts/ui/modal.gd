extends Control
signal confirmed
signal cancelled
func _ready() -> void:
	resized.connect(_layout)
	_layout.call_deferred()
	$Center/Panel/Content/Header/Close.pressed.connect(func() -> void: cancelled.emit())
	$Center/Panel/Content/Actions/Confirm.pressed.connect(func() -> void: confirmed.emit())
	$Center/Panel/Content/Actions/Cancel.pressed.connect(func() -> void: cancelled.emit())
	$Center/Panel/Content/Actions/Confirm.grab_focus()
func set_title(value: String) -> void: $Center/Panel/Content/Header/Title.text = value
func content() -> VBoxContainer: return $Center/Panel/Content/Body
func _layout() -> void:
	$Center/Panel.custom_minimum_size.x = minf(450,maxf(260,size.x-32))
func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		cancelled.emit()
		get_viewport().set_input_as_handled()
