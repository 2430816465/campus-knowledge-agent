extends VBoxContainer
## Time is supplied by the caller; screenshots never depend on the wall clock.
func configure(data: Dictionary) -> void:
	$Message.text = str(data.get("message","暂无内容"))
	$Progress.visible = data.has("progress")
	$Progress.value = clampf(float(data.get("progress",0)),0,100)
	$Countdown.visible = data.has("seconds")
	var seconds: int = maxi(0,int(data.get("seconds",0)))
	$Countdown.text = "%02d:%02d" % [seconds/60,seconds%60]
