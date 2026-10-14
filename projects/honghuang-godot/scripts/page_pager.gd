class_name PagePager
extends RefCounted
## Paginates existing native controls without replacing their transaction callbacks.
var content: Control
var viewport: Control
var bar: HBoxContainer
var tracked: Array[Control]=[]
var pages: Array=[]
var current: int=0
var busy: bool=false
var active: bool=true
var previous: Button
var next: Button
var counter: Label
var canvas_roots: Array[Control]=[]

func setup(target: Control,area: Control,controls: HBoxContainer) -> void:
	content=target
	viewport=area
	bar=controls
	bar.name="PageControls"
	bar.custom_minimum_size.y=42
	previous=GameTheme.button("‹ 上一页",func()->void: show_page(current-1))
	previous.custom_minimum_size.y=40
	bar.add_child(previous)
	counter=GameTheme.label("",14,GameTheme.GOLD)
	counter.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	bar.add_child(counter)
	next=GameTheme.button("下一页 ›",func()->void: show_page(current+1))
	next.custom_minimum_size.y=40
	bar.add_child(next)
	bar.hide()
	viewport.resized.connect(_resize)
	rebuild.call_deferred()

func _resize() -> void:
	if not busy: rebuild.call_deferred()

func _valid() -> bool:
	return active and is_instance_valid(content) and is_instance_valid(viewport) and is_instance_valid(bar) and content.is_inside_tree()

func dispose() -> void:
	active=false
	if is_instance_valid(viewport) and viewport.resized.is_connected(_resize): viewport.resized.disconnect(_resize)

func rebuild() -> void:
	if busy or not _valid(): return
	busy=true
	for node: Control in tracked:
		if is_instance_valid(node): node.show()
	for canvas: Control in canvas_roots:
		if is_instance_valid(canvas):
			canvas.set_meta("page_pager_active",false)
			canvas.custom_minimum_size.y=float(canvas.get_meta("page_original_minimum",0))
	canvas_roots.clear()
	tracked.clear()
	bar.hide()
	var tree: SceneTree=content.get_tree()
	await tree.process_frame
	if not _valid(): busy=false; return
	await tree.process_frame
	if not _valid(): busy=false; return
	var available: float=maxf(180.0,viewport.size.y)
	pages.clear()
	if content.get_combined_minimum_size().y<=available+1.0:
		pages.append([])
		current=0
		busy=false
		return
	bar.show()
	await tree.process_frame
	if not _valid(): busy=false; return
	available=maxf(180.0,viewport.size.y-8.0)
	var units: Array=[]
	for child: Node in content.get_children():
		if child is Control and child.visible: _collect(child,[],available,units)
	var chunk: Array=[]
	var height: float=0.0
	var spacing: float=float(content.get_theme_constant("separation"))
	for unit: Dictionary in units:
		var required: float=float(unit.height)+spacing
		if not chunk.is_empty() and height+required>available:
			pages.append(chunk)
			chunk=[]
			height=0
		chunk.append(unit)
		height+=required
	if not chunk.is_empty(): pages.append(chunk)
	if pages.is_empty(): pages.append([])
	show_page(clampi(current,0,pages.size()-1))
	busy=false

func _collect(node: Control,parents: Array,limit: float,units: Array) -> void:
	# Some legacy screens place one native VBox inside a drawing Control.
	# Only explicitly opted-in canvases may be split; card walls and activities
	# keep their own all-visible layout and are never paginated accidentally.
	if node.has_meta("page_content"):
		var inner: Control=node.get_node_or_null(NodePath(str(node.get_meta("page_content"))))
		if is_instance_valid(inner):
			if not canvas_roots.has(node):
				node.set_meta("page_original_minimum",node.custom_minimum_size.y)
				canvas_roots.append(node)
			var branch: Array=parents.duplicate()
			branch.append(node)
			_collect(inner,branch,limit,units)
			return
	var height: float=node.get_combined_minimum_size().y
	var children: Array=[]
	for child: Node in node.get_children():
		if child is Control and child.visible: children.append(child)
	if height<=limit-40 or children.is_empty() or not (node is VBoxContainer or node is PanelContainer or node is MarginContainer or node is GridContainer):
		var path: Array=parents.duplicate()
		path.append(node)
		for item: Control in path:
			if not tracked.has(item): tracked.append(item)
		units.append({"nodes":[node],"path":path,"height":height+_overhead(parents)})
		return
	var branch: Array=parents.duplicate()
	branch.append(node)
	if node is GridContainer:
		for start: int in range(0,children.size(),node.columns):
			var group: Array=[]
			var tallest: float=0
			for index: int in range(start,mini(children.size(),start+node.columns)):
				group.append(children[index])
				tallest=maxf(tallest,children[index].get_combined_minimum_size().y)
			var path: Array=branch.duplicate()
			path.append_array(group)
			for item: Control in path:
				if not tracked.has(item): tracked.append(item)
			units.append({"nodes":group,"path":path,"height":tallest+_overhead(branch)})
	else:
		for child: Control in children: _collect(child,branch,limit,units)

func _overhead(parents: Array) -> float:
	var result: float=0
	for parent: Control in parents:
		if parent is PanelContainer: result+=parent.get_theme_stylebox("panel").get_minimum_size().y
		elif parent is VBoxContainer: result+=parent.get_theme_constant("separation")
		elif parent is MarginContainer: result+=parent.get_theme_constant("margin_top")+parent.get_theme_constant("margin_bottom")
	return result

func show_page(index: int) -> void:
	if not _valid() or pages.is_empty(): return
	current=clampi(index,0,pages.size()-1)
	for node: Control in tracked:
		if is_instance_valid(node): node.hide()
	for unit: Dictionary in pages[current]:
		for node: Control in unit.path:
			if is_instance_valid(node): node.show()
	for canvas: Control in canvas_roots:
		if not is_instance_valid(canvas): continue
		canvas.set_meta("page_pager_active",true)
		var inner: Control=canvas.get_node_or_null(NodePath(str(canvas.get_meta("page_content"))))
		if is_instance_valid(inner):
			var height: float=inner.get_combined_minimum_size().y
			canvas.custom_minimum_size.y=height
			inner.size.y=height
	bar.visible=pages.size()>1
	previous.disabled=current==0
	next.disabled=current==pages.size()-1
	counter.text="%d / %d 页" % [current+1,pages.size()]
	content.set_meta("page_count",pages.size())
	content.set_meta("page_index",current)
