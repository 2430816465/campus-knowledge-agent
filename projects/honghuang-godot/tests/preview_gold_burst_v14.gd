extends SceneTree
## Lighting look development; final-frame plate, not an actual playback recording.
func _initialize() -> void: run.call_deferred()
func run() -> void:
	root.size=Vector2i(1080,1920); root.position=Vector2i(-2400,40)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://video-production/output/gold-burst"))
	var scene:=TextureRect.new(); scene.texture=SummonMovie.LAST
	scene.expand_mode=TextureRect.EXPAND_IGNORE_SIZE
	scene.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var grade:=ShaderMaterial.new(); grade.shader=SummonMovie.PORTAL
	grade.set_shader_parameter("rarity_color",SummonMovie.quality_color("gold"))
	grade.set_shader_parameter("mythic_power",1.0); scene.material=grade; root.add_child(scene)
	for moment: float in [8.1,8.65,9.6,10.5]:
		grade.set_shader_parameter("reveal",smoothstep(7.7,8.9,moment))
		grade.set_shader_parameter("media_phase",moment-7.7)
		for i: int in 4: await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://video-production/output/gold-burst/look-%03d.png" % roundi(moment*100))
	quit()
