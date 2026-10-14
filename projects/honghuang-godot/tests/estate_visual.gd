extends Control
var estate: EstateView
func _ready() -> void:
	get_window().size = Vector2i(900,760)
	ThemeDB.fallback_font = load("res://assets/fonts/NotoSansSC-Regular.otf")
	estate = load("res://scenes/estate.tscn").instantiate()
	add_child(estate)
	estate.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var s: Dictionary = GameData.all().initialState.duplicate(true)
	s.unlockedRegions = [0,1,2]
	var i := 2
	for type in ["farm","alchemy","forge","library","arena"]:
		s.buildings.append({"id":type,"type":type,"plot":"p%d"%i,"level":1,"readyAt":0,"queue":[],"assigned":null,"progress":0})
		i += 1
	estate.set_state(s)
	estate.set_zoom(0.84)
	estate.building_selected.connect(func(id): print("SELECT_BUILDING ",id))
	estate.plot_selected.connect(func(id): print("SELECT_PLOT ",id))
	estate.move_previewed.connect(func(id,plot): print("MOVE_PREVIEW ",id," => ",plot))
func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		if event.keycode==KEY_E: estate.set_editing(not estate.editing)
		if event.keycode==KEY_R: estate.reset_camera()
		if event.keycode==KEY_S:
			var result := get_viewport().get_texture().get_image().save_png("res://docs/estate-native-visual.png")
			print("NATIVE_SCREENSHOT ",result)
