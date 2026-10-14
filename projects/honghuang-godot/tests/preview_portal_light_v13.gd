extends SceneTree
## Fast lighting review on the real final video frame, before full media validation.
func _initialize() -> void: run.call_deferred()
func run() -> void:
	root.size = Vector2i(1080,1920); root.position = Vector2i(-2400,40)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://video-production/output/portal-light"))
	var scene := TextureRect.new(); scene.texture = SummonMovie.LAST
	scene.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	scene.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var grade := ShaderMaterial.new(); grade.shader = SummonMovie.PORTAL
	grade.set_shader_parameter("reveal",1.0); grade.set_shader_parameter("media_phase",11.0-1.0/30.0-7.7)
	scene.material = grade; root.add_child(scene)
	for q: String in ["gold","purple","blue"]:
		grade.set_shader_parameter("rarity_color",SummonMovie.quality_color(q))
		for i: int in 4: await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://video-production/output/portal-light/preview-"+q+".png")
	quit()
