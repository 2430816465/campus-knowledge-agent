extends Control
const Presenter = preload("res://scripts/ui/forge_presenter.gd")
func _ready() -> void:
	$Scroll/Content/Cards/Old.configure(Presenter.sample(false))
	$Scroll/Content/Cards/New.configure(Presenter.sample(true))
	$Scroll/Content/Reward.configure({"heading":"奖励格","name":"灵石","icon":"stone","stat":"奖励样例","quantity":"×999999999"})
	$Scroll/Content/Product.configure({"id":"preview-only","title":"既有商品卡 · 开发样例","description":"价格必须由已有商品配置提供；此处禁止购买。","price_text":"未配置价格","can_buy":false,"reason":"展示样例，没有购买业务"})
	$Scroll/Content/Status.configure({"message":"加载中 · 固定检查状态","progress":60,"seconds":30})
	$Scroll/Content/OpenModal.pressed.connect(func() -> void:
		var modal: Control = load("res://scenes/ui/components/modal.tscn").instantiate()
		add_child(modal)
		modal.confirmed.connect(modal.queue_free)
		modal.cancelled.connect(modal.queue_free)
		var label := Label.new()
		label.text = "确认与取消信号由调用者处理。"
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		modal.content().add_child(label))
