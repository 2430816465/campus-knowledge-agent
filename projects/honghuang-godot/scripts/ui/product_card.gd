extends PanelContainer
signal purchase_requested(product_id: String)
var product_id: String = ""
func _ready() -> void:
	$Content/Buy.pressed.connect(func() -> void: purchase_requested.emit(product_id))
func configure(data: Dictionary) -> void:
	product_id = str(data.get("id",""))
	$Content/Title.text = str(data.get("title","商品"))
	$Content/Description.text = str(data.get("description",""))
	$Content/Buy.text = str(data.get("price_text","未配置价格"))
	$Content/Buy.disabled = not bool(data.get("can_buy",false))
	$Content/Buy.tooltip_text = str(data.get("reason",""))
