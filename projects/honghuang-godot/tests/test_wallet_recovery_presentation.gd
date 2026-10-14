extends SceneTree
var checks := 0
var failures: Array=[]
func check(value: bool,message: String) -> void:
	checks+=1
	if not value: failures.append(message); push_error(message)
func _initialize() -> void: _run.call_deferred()
func button_named(node: Node,text: String) -> Button:
	if node is Button and node.text==text: return node
	for child: Node in node.get_children():
		var found: Button=button_named(child,text)
		if found!=null: return found
	return null
func labels(node: Node) -> String:
	var parts: PackedStringArray=[]
	if node is Label: parts.append(node.text)
	for child: Node in node.get_children(): parts.append(labels(child))
	return "\n".join(parts)
func corrupt_slot(app: Control,slot: String,contents: String) -> String:
	app._load_slot(slot)
	var path: String=app.store._path
	app.store.release()
	var f: FileAccess=FileAccess.open(path,FileAccess.WRITE)
	f.store_string(contents); f.close()
	app._load_slot(slot)
	return path
func check_wallet_amount(app: Control,key: String,amount: int,shown: String,context: String) -> void:
	var value: Label=app.resource_labels[key]
	check(value.text=="%s\n%s" % [app.RESOURCE_NAMES[key],shown],context+" shows name and amount on separate lines "+key)
	check(value.tooltip_text=="%s %d" % [app.RESOURCE_NAMES[key],amount],context+" tooltip keeps exact amount "+key)
	check(not value.tooltip_text.contains("待恢复"),context+" clears recovery hint "+key)
func check_wallet_fits(app: Control,key: String) -> void:
	var value: Label=app.resource_labels[key]
	var font: Font=value.get_theme_font("font")
	var font_size: int=value.get_theme_font_size("font_size")
	for line: String in value.text.split("\n"):
		var required: float=font.get_string_size(line,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size).x
		check(required<=value.size.x+0.5,"320px wallet displays complete text without ellipsis: "+key+" "+line)
	check(value.get_line_count()==2,"320px wallet keeps both lines "+key)
	check(Rect2(Vector2.ZERO,Vector2(root.size)).grow(0.5).encloses(value.get_global_rect()),"320px wallet stays within the visible window "+key)
func test_large_wallet(app: Control) -> void:
	var previous_size: Vector2i=root.size
	var previous_scale: Vector2i=root.content_scale_size
	var previous_mode: int=root.content_scale_mode
	var saved_assets: Dictionary=app.state().resources.duplicate(true)
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size=Vector2i.ZERO
	root.size=Vector2i(320,844)
	app.state().resources=GameData.economy("ECONOMY").resourceCaps.duplicate(true)
	app._update_wallet()
	for i: int in 6: await process_frame
	var expected: Dictionary={"stone":"100.0万","xp":"100.0万","material":"99999","herb":"99999","ticket":"9999","fate":"100.0万"}
	for key: String in app.resource_labels:
		check_wallet_amount(app,key,int(app.state().resources[key]),expected[key],"resource cap")
		check_wallet_fits(app,key)
	# Presentation boundaries only; no probe balance is committed to a save.
	for probe: Dictionary in [{"amount":99999,"shown":"99999"},{"amount":100000,"shown":"10.0万"},{"amount":123456789,"shown":"1.2亿"}]:
		app.state().resources.stone=probe.amount
		app._update_wallet()
		for i: int in 3: await process_frame
		check_wallet_amount(app,"stone",probe.amount,probe.shown,"compact unit boundary")
		check_wallet_fits(app,"stone")
	app.state().resources=saved_assets
	root.content_scale_mode=previous_mode
	root.content_scale_size=previous_scale
	root.size=previous_size
	app._update_wallet()
	for i: int in 6: await process_frame
func _run() -> void:
	var app: Control=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	app._go(0) # This test inspects construction recovery, now a separate tab.
	app.set_process(false)
	check(app.command("summon",{"count":1}).ok,"real first draw creates nondefault ordinary balance")
	check(app.command("summon",{"count":1}).ok,"real next commit creates valid nondefault backup")
	var writer: GameStore=app.store
	var directory: String=writer.base_dir
	var actual: Dictionary=writer.state.resources.duplicate(true)
	var backup: Dictionary=GameStore.decode_save(FileAccess.get_file_as_string(writer._path+".backup"))
	check(backup.ok and backup.data.resources.ticket!=12,"backup has actual earned/spent values, not defaults")
	var reader: GameStore=GameStore.new(directory)
	var read: Dictionary=reader.load_slot("normal")
	check(read.ok and reader.readonly and not reader.corruption,"another live writer yields valid readonly state")
	app.store=reader
	app._render()
	for key: String in app.resource_labels:
		check_wallet_amount(app,key,int(actual[key]),str(actual[key]),"valid readonly wallet")
	check(is_instance_valid(app.estate) and labels(app.body).contains("当前存档只读"),"legitimate writer-lock readonly retains real estate content")
	writer.release()
	reader.release()
	var primary: String=reader._path
	var damaged: FileAccess=FileAccess.open(primary,FileAccess.WRITE)
	damaged.store_string("isolated round-3 corruption presentation fixture"); damaged.close()
	var corrupt: GameStore=GameStore.new(directory)
	var loaded: Dictionary=corrupt.load_slot("normal")
	check(not loaded.ok and corrupt.corruption and corrupt.readonly,"broken checksum enters corruption readonly state")
	app.store=corrupt
	var placeholder_before: String=JSON.stringify(app.state())
	var damaged_before: String=FileAccess.get_file_as_string(primary)
	app._render()
	app._save_load_error(loaded)
	for key: String in app.resource_labels:
		check(app.resource_labels[key].text=="%s —" % app.RESOURCE_NAMES[key],"corrupt wallet masks placeholder "+key)
		check(app.resource_labels[key].tooltip_text.contains("待恢复"),"recovery status explained for "+key)
	check(app.wallet.text=="资源待恢复","alternate wallet text also hides placeholder amounts")
	check(JSON.stringify(app.state())==placeholder_before and FileAccess.get_file_as_string(primary)==damaged_before,"wallet rendering never changes state or damaged file")
	app._close_modal()
	for page: int in 5:
		app._go(page)
		check(labels(app.body).contains("存档待恢复") and not labels(app.body).contains("历练 0 / 12") and not is_instance_valid(app.estate),"navigation %d shows recovery instead of unknown progress or starter estate" % page)
		check(button_named(app.body,"恢复最近有效备份")!=null and button_named(app.body,"选择已有存档导入")!=null,"navigation %d retains recovery and import actions" % page)
	app._settings()
	check(labels(app.modal_box).contains("存档待恢复") and not labels(app.modal_box).contains("声音与演出"),"settings does not present unloaded defaults as saved settings")
	app._go(0)
	check(button_named(app.body,"返回普通档")==null and button_named(app.body,"重置此展示起点")==null,"corrupt ordinary save cannot escape into a new normal save or reset")
	corrupt.fail_writes=true
	app._restore_backup()
	button_named(app.modal_box,"确认").pressed.emit()
	check(corrupt.corruption and corrupt.readonly and app.resource_labels.ticket.text==app.RESOURCE_NAMES.ticket+" —","failed restore keeps unknown balance masked")
	for key: String in app.resource_labels:
		check(app.resource_labels[key].text==app.RESOURCE_NAMES[key]+" —" and app.resource_labels[key].tooltip_text.contains("待恢复"),"failed restore masks every resource and tooltip "+key)
	corrupt.fail_writes=false
	app._restore_backup()
	button_named(app.modal_box,"确认").pressed.emit()
	check(not corrupt.corruption and not corrupt.readonly,"actual confirmed backup restore returns writable valid state")
	check(app.state().resources==backup.data.resources,"restoration uses actual backup assets")
	check(is_instance_valid(app.estate) and not labels(app.body).contains("存档待恢复"),"successful recovery returns to actual estate and progress")
	for key: String in app.resource_labels:
		check_wallet_amount(app,key,int(backup.data.resources[key]),str(backup.data.resources[key]),"successful restore")
	await test_large_wallet(app)
	var normal_path: String=app.store._path
	var ordinary_raw: String=FileAccess.get_file_as_string(normal_path)
	var ordinary_assets: Dictionary=app.state().resources.duplicate(true)
	var broken_demo: String="round-3 isolated demo corrupt original"
	var demo_path: String=corrupt_slot(app,"demo:roster",broken_demo)
	check(app.store.corruption and labels(app.body).contains("存档待恢复"),"failed demo slot load immediately renders actual recovery state")
	check(button_named(app.body,"返回普通档")!=null and button_named(app.body,"重置此展示起点")!=null,"corrupt demo exposes normal exit and isolated reset")
	button_named(app.body,"返回普通档").pressed.emit()
	check(app.store.slot=="normal" and not app.store.corruption and app.state().resources==ordinary_assets,"corrupt demo exit reaches intact ordinary profile")
	check(FileAccess.get_file_as_string(normal_path)==ordinary_raw and FileAccess.get_file_as_string(demo_path)==broken_demo,"leaving corrupt demo changes neither file")
	app._load_slot("demo:roster")
	button_named(app.body,"重置此展示起点").pressed.emit()
	check(labels(app.modal_box).contains("损坏原件会保留") and labels(app.modal_box).contains("普通档"),"reset explicitly confirms preserved bad file and isolated scope")
	button_named(app.modal_box,"取消").pressed.emit()
	check(app.store.corruption and FileAccess.get_file_as_string(demo_path)==broken_demo,"cancelled reset preserves broken demo")
	app.store.fail_writes=true
	app._reset_demo()
	button_named(app.modal_box,"确认").pressed.emit()
	check(app.store.corruption and app.resource_labels.ticket.text==app.RESOURCE_NAMES.ticket+" —","failed isolated reset keeps recovery state")
	app.store.fail_writes=false
	app._reset_demo()
	button_named(app.modal_box,"确认").pressed.emit()
	check(app.store.slot=="demo:roster" and not app.store.corruption and not app.store.readonly and app.state().demo=="roster","confirmed reset stays in demo and clears corruption")
	check(is_instance_valid(app.estate) and not labels(app.body).contains("存档待恢复"),"confirmed reset restores usable real demo content")
	var preserved: bool=false
	for filename: String in DirAccess.get_files_at(directory):
		if filename.begins_with(demo_path.get_file()+".") and FileAccess.get_file_as_string(directory.path_join(filename))==broken_demo: preserved=true
	check(preserved,"actual store reset preserves corrupt demo original")
	check(FileAccess.get_file_as_string(normal_path)==ordinary_raw,"demo reset never rewrites ordinary save")
	var mock_path: String=corrupt_slot(app,"mock:normal:test_a:device_1","round-3 isolated ordinary mock corruption")
	check(app.store.corruption and button_named(app.body,"返回普通档")!=null,"corrupt ordinary mock profile retains normal exit")
	check(button_named(app.body,"重置此展示起点")==null,"ordinary mock profile cannot use demo reset")
	app._reset_demo()
	check(not is_instance_valid(app.overlay) and app.store.corruption,"direct reset entry rejects ordinary mock without confirmation or mutation")
	button_named(app.body,"返回普通档").pressed.emit()
	check(app.store.slot=="normal" and app.state().resources==ordinary_assets,"corrupt mock exit returns to intact ordinary assets")
	check(FileAccess.get_file_as_string(normal_path)==ordinary_raw and FileAccess.get_file_as_string(mock_path)=="round-3 isolated ordinary mock corruption","leaving corrupt mock preserves both independent files")
	app.audio.set_backgrounded(true)
	app.queue_free()
	await process_frame
	await create_timer(0.1).timeout
	var f: FileAccess=FileAccess.open("res://docs/audits/round-3-wallet-recovery-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"round":3,"checks":checks,"failures":failures,"nativeVisual":false,"scenarios":["Valid save, other active writer: actual numbers","Corrupt save: unknown dashes","Failed recovery: dashes retained","Confirmed backup recovery: actual numbers return","320px wallet: resource caps and compact-unit boundaries fit; tooltip retains exact amounts"]},"  "));f.close()
	print("WALLET RECOVERY ROUND 3: %d checks, %d failures" % [checks,failures.size()])
	quit(0 if failures.is_empty() else 1)
