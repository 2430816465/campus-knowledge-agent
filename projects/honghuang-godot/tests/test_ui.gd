extends SceneTree
var failures: int=0
var checks: int=0
var app: Control
func _initialize() -> void:
	_run.call_deferred()
func check(value: bool, message: String) -> void:
	checks+=1
	if not value:
		failures+=1
		push_error("UI ASSERT: "+message)
func _run() -> void:
	app=load("res://scenes/main.tscn").instantiate()
	app.set_meta("ui_test",true)
	root.add_child(app)
	await process_frame
	check(app.state().owned.size()==3,"ordinary initial roster remains three")
	for viewport: Vector2i in [Vector2i(360,800),Vector2i(540,960),Vector2i(800,960)]:
		root.size=viewport
		await process_frame
		for i: int in 5:
			app._go(i)
			await process_frame
			check(app.nav.get_child_count()==5,"fixed five navigation")
			check(app.body.get_child_count()>0,"page content exists")
	app._summon(1)
	check(not app.has_meta(SummonScreen.ACTIVE_CINEMATIC),"normal UI excludes unapproved summon prototype")
	for frame: int in 3: await process_frame
	check(app.state().resources.ticket==11,"summon UI submits once")
	check(app.modal_box!=null,"summon outcome shows committed cards")
	app._draw_history()
	app._pool_rules()
	app._exchange()
	app._wish_choices()
	app._team()
	app._presets()
	app._preparation()
	app._synergy()
	app._building_list()
	app._show_building("spring")
	app._show_plot("p2")
	app._build_at("farm","p2")
	check(app.state().buildings.size()==3,"build submitted through UI")
	app._show_building("farm-1")
	app._local_mail()
	app._activities()
	app._settings()
	app._save_status()
	app._close_modal()
	for c: Dictionary in GameData.content("CHARACTERS"):
		app._open_character(str(c.id))
		await process_frame
		check(app.body.find_child("SingleScreenCharacter",true,false)!=null and app.body.find_child("SingleScreenCharacter",true,false).character_id==str(c.id),"character page "+str(c.id))
	app._start_main(1)
	await process_frame
	check(is_instance_valid(app.battle_view),"battle native scene opened")
	var battle: Dictionary=app.last_battle
	var legal: Array=GameCombat.legal_targets(battle,"attack")
	app.battle_view._select_unit(str(legal[0]))
	check(app.battle_view.target_id==str(legal[0]),"manual target selection uses legal target")
	if battle.get("autoOnly",false):
		check(GameCombat.auto_act(battle),"new locked combat uses its canonical automatic action")
		app.battle_view.target_id=""
	else: app.battle_view._act()
	check(app.battle_view.target_id.is_empty(),"manual action clears target after real act")
	var steps: int=0
	while battle.get("result")==null and steps<500:
		check(GameCombat.auto_act(battle),"real combat action works")
		steps+=1
	check(battle.get("result")=="win","normal starting team wins stage1")
	app.battle_view._refresh()
	app._battle_finished(battle)
	check(app.settlement.get("ok",false),"battle settlement persisted")
	check(app.state().cleared.has(1),"real clear reward reached state")
	app.battle_view._report()
	app._leave_battle()
	app._gear_bag()
	check(not app.state().equipment.items.is_empty(),"actual main battle drops an equipment item")
	if app.state().equipment.items.is_empty():
		app.store.release()
		quit(1)
		return
	var artifact: Dictionary=app.state().equipment.items[0]
	app._gear_detail(str(artifact.id))
	app._gear_choices("nezha",str(artifact.slot))
	app.command("equipArtifact",{"id":artifact.id,"characterId":"nezha"})
	check(GameEquipment.equipped_by(app.state(),str(artifact.id))=="nezha","equipment UI command changes real combat loadout")
	app._gear_enhance(str(artifact.id),4,[])
	app._idle_missions()
	app._idle_choose(str(GameEconomy.extension_rules().idleMissions[0].id),[])
	app._shop()
	app._local_mail()
	app._activities()
	app._open_character("nezha")
	for preset: Dictionary in GameData.economy("DEMO_PRESETS"):
		app._load_slot("demo:"+str(preset.id))
		await process_frame
		check(app.state().demo!=null,"demo isolated "+str(preset.id))
		for i: int in 5: app._go(i); await process_frame
	app._load_slot("demo:expedition-project")
	app.page=2
	app.subpage="秘境"
	app._render()
	app._start_expedition("danfire")
	await process_frame
	check(app.state().expeditions.active!=null,"expedition launched")
	check(is_instance_valid(app.battle_view),"expedition uses native battle")
	app._leave_battle()
	app._load_slot("normal")
	check(app.state().owned.size()<14,"demo did not leak roster")
	var ordinary_resources: Dictionary=app.state().resources.duplicate(true)
	app._mock_menu()
	app.mock_account="test_a"
	app.mock_device="device_1"
	app.mock_realm="normal"
	app._mock_login("测试仙友甲")
	check(app.state().get("mockAccount")=="test_a","mock login enters isolated account save")
	app._mock_cloud()
	var uploaded: Dictionary=app._mock_command("cloud_upload",{"save":app.state().duplicate(true),"expected_revision":0})
	check(uploaded.ok,"mock cloud upload works from UI account")
	app._mock_import(uploaded.data,int(app.state().revision),false)
	app._mock_chat()
	var sent: Dictionary=app._mock_command("chat_send",{"text":"测试消息 <b>保持纯文本</b>","channel":"world"})
	check(sent.ok,"mock chat accepts plain text")
	app._mock_chat()
	app._mock_guild()
	var guild: Dictionary=app._mock_command("guild_create",{"name":"测试仙盟"})
	check(guild.ok,"mock guild create")
	app._mock_guild()
	app._mock_rank()
	app._mock_command("rank_submit",{"board":"power","score":GameEquipment.team_power(app.state())})
	app._mock_rank()
	app._mock_payment()
	var order: Dictionary=app._mock_command("payment_create",{"sku":"test_small","request_id":"ui-test-payment"})
	check(order.ok,"mock payment creates one fake order")
	app._mock_order(order.data)
	var receipt: Dictionary=app._mock_command("payment_settle",{"order_id":order.data.id,"outcome":"paid"})
	check(receipt.ok,"mock payment paid callback")
	var tickets: int=int(app.state().resources.ticket)
	app._mock_redeem(receipt.data)
	check(app.state().resources.ticket==tickets+3,"canonical mock receipt credits mock save")
	app._mock_redeem(receipt.data)
	check(app.state().resources.ticket==tickets+3,"mock receipt repeated UI credit does not duplicate")
	app._load_slot("normal")
	check(app.state().resources==ordinary_resources,"mock flow never changes ordinary assets")
	app.queue_free()
	await process_frame
	print("UI TEST: %d checks, %d failures" % [checks,failures])
	quit(1 if failures else 0)
