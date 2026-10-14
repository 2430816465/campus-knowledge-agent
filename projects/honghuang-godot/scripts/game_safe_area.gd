class_name GameSafeArea
extends RefCounted
## Shared layout boundary only. It never resizes the native window, changes the
## logical viewport scale, or modifies the estate camera / combat state.
const TEST_INSETS: StringName = &"ui_test_safe_insets"
const TEST_SCREEN_RECT: StringName = &"ui_test_safe_screen_rect"
const TEST_SCREEN_TRANSFORM: StringName = &"ui_test_safe_screen_transform"

static func uses_device_safe_area() -> bool:
	return DisplayServer.get_name() != "headless" and OS.get_name() in ["Android","iOS"]

static func rect_for(control: Control) -> Rect2:
	var bounds := Rect2(Vector2.ZERO,control.size)
	var window: Window=control.get_window()
	# Explicit, non-persisted test inputs exercise real containers on desktop and
	# headless executors. Normal desktop runs intentionally use zero device insets.
	if window.has_meta(TEST_INSETS):
		return inset_rect(bounds,window.get_meta(TEST_INSETS))
	if window.has_meta(TEST_SCREEN_RECT):
		var transform: Transform2D=window.get_meta(TEST_SCREEN_TRANSFORM) if window.has_meta(TEST_SCREEN_TRANSFORM) else control.get_screen_transform()
		return from_screen(bounds,window.get_meta(TEST_SCREEN_RECT),transform)
	if not uses_device_safe_area(): return bounds
	var screen_rect: Rect2=Rect2(DisplayServer.get_display_safe_area())
	return from_screen(bounds,screen_rect,control.get_screen_transform())

static func from_screen(bounds: Rect2,screen_rect: Rect2,local_to_screen: Transform2D) -> Rect2:
	if not screen_rect.has_area() or is_zero_approx(local_to_screen.determinant()): return bounds
	# CanvasItem's screen transform includes viewport stretching, letterboxing,
	# scale and native window position. Map physical pixels back exactly once.
	var local_rect: Rect2=local_to_screen.affine_inverse()*screen_rect
	var visible: Rect2=bounds.intersection(local_rect)
	return visible if visible.has_area() else bounds

static func inset_rect(bounds: Rect2,insets: Vector4) -> Rect2:
	var left: float=clampf(insets.x,0,maxf(0,bounds.size.x-1))
	var top: float=clampf(insets.y,0,maxf(0,bounds.size.y-1))
	var right: float=clampf(insets.z,0,maxf(0,bounds.size.x-left-1))
	var bottom: float=clampf(insets.w,0,maxf(0,bounds.size.y-top-1))
	return Rect2(bounds.position+Vector2(left,top),bounds.size-Vector2(left+right,top+bottom))
