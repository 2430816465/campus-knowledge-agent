extends RefCounted
const KEYS: Array[String] = ["scroll","events","summon","guild","battle","beast","taiji","estate","friends","forge","adventure","chest"]
static func texture(key: String) -> Texture2D:
	var index: int = KEYS.find(key)
	if index < 0:
		var legacy: AtlasTexture = GameIllustratedIcon.texture(key)
		var cropped := AtlasTexture.new()
		cropped.atlas = legacy.atlas
		var bounds: Rect2 = GameIllustratedIcon.icon_bounds(key)
		cropped.region = Rect2(legacy.region.position+bounds.position,bounds.size)
		cropped.filter_clip = true
		return cropped
	var atlas: Texture2D = load("res://assets/ui-foundation/icons.png")
	var result := AtlasTexture.new()
	result.atlas = atlas
	var cell: Vector2 = atlas.get_size()/Vector2(4,3)
	result.region = Rect2(Vector2(index%4,index/4)*cell,cell)
	result.filter_clip = true
	return result
