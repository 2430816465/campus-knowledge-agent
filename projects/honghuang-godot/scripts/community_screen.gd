class_name CommunityScreen
extends RefCounted
## Fixed-screen offline community. Only app.command changes persistent data.
const GUILD_TABS: Array[String]=["委托","商店","捐献","成员"]
const BOARD_TABS: Array[String]=["power","progress","contribution"]
const BOARD_NAMES: Dictionary={"power":"战力","progress":"历练","contribution":"贡献"}
const DONATION_COST: Dictionary={"stone":100,"material":15}

static func build_guild(app,parent: Node) -> void:
	var stack: VBoxContainer=_stack(app,parent)
	var s: Dictionary=app.state()
	var c: Dictionary=GameCommunity.snapshot(s)
	_banner(app,stack,"离线仙盟 · NPC同道")
	if c.guild.is_empty():
		_build_unjoined(app,stack)
		return
	var overview: VBoxContainer=_compact_card(app,stack)
	var name: Label=app.label(overview,str(c.guild.name),21,GameTheme.GOLD)
	name.max_lines_visible=1
	name.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
	name.tooltip_text=str(c.guild.name)
	var level: int=GameCommunity.level(c)
	var experience: int=int(c.guild.experience)
	app.label(overview,"%d级仙盟 · %s" % [level,"已达最高盟级" if level==10 else "再积累 %d 经验升级" % (300-experience%300)],17,GameTheme.JADE)
	app.label(overview,"可用贡献 %d · 累计贡献 %d" % [int(c.coins),int(c.totalContribution)],17)
	var current: String=str(app.get_meta("community_tab","委托"))
	if not current in GUILD_TABS: current="委托"
	var tabs: HBoxContainer=app.row(stack)
	for tab: String in GUILD_TABS:
		GameTheme.style_tab(app.button(tabs,tab,_guild_tab.bind(app,tab),tab==current),tab==current)
	match current:
		"商店": _build_shop(app,stack,s,c)
		"捐献": _build_donation(app,stack,s,c)
		"成员": _build_members(app,stack,s)
		_: _build_tasks(app,stack,s,c)
	var links: HBoxContainer=app.row(stack)
	if current=="委托":
		app.button(links,"经营",app._go.bind(0))
		app.button(links,"培养",app._go.bind(1))
	app.button(links,"仙榜",app._go.bind(7))
	app.button(links,"退出",_leave_confirm.bind(app),false,not _write_reason(app).is_empty())

static func build_ranking(app,parent: Node) -> void:
	var stack: VBoxContainer=_stack(app,parent)
	_banner(app,stack,"离线仙榜 · NPC参考")
	var board: String=str(app.community_board)
	if not board in BOARD_TABS: board="power"
	var tabs: HBoxContainer=app.row(stack)
	for board_id: String in BOARD_TABS:
		GameTheme.style_tab(app.button(tabs,str(BOARD_NAMES[board_id]),_ranking_tab.bind(app,board_id),board==board_id),board==board_id)
	var rows: Array=GameCommunity.ranking(app.state(),board)
	var own: VBoxContainer=_compact_card(app,stack)
	for entry: Dictionary in rows:
		if not entry.self: continue
		var summary: HBoxContainer=app.row(own)
		app.label(summary,"我 · 第 %d 名" % int(entry.rank),18,GameTheme.JADE)
		var score: Label=app.label(summary,"%s %d%s" % [str(BOARD_NAMES[board]),int(entry.score),"关" if board=="progress" else ""],18,GameTheme.GOLD)
		score.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT
		break
	var explanation: String={"power":"按上阵角色的培养与灵装计算。","progress":"按主线首次通关数计算。","contribution":"按累计贡献计算，兑换不会降分。"}[board]
	app.label(own,explanation,17,GameTheme.MUTED)
	var key: String="community_rank_page_"+board
	var page: int=_page(app,key,rows.size(),3)
	var list: VBoxContainer=app.column(stack)
	list.add_theme_constant_override("separation",4)
	for index: int in range(page*3,mini(rows.size(),page*3+3)): _rank_row(app,list,rows[index],board)
	_page_controls(app,stack,key,page,rows.size(),3)
	var links: HBoxContainer=app.row(stack)
	app.button(links,"我的仙盟",app._go.bind(6))
	app.button(links,"前往培养",app._go.bind(1))

static func _stack(app,parent: Node) -> VBoxContainer:
	var stack: VBoxContainer=app.column(parent)
	stack.add_theme_constant_override("separation",6)
	return stack

static func _compact_card(app,parent: Node,pad: int=6) -> VBoxContainer:
	var panel: PanelContainer=PanelContainer.new()
	panel.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel",GameTheme.box(GameTheme.PANEL,Color("c4b184"),10,pad))
	parent.add_child(panel)
	var inner: VBoxContainer=app.column(panel)
	inner.add_theme_constant_override("separation",4)
	return inner

static func _banner(app,parent: Node,badge: String) -> void:
	var hero: Control=Control.new()
	hero.custom_minimum_size.y=42
	hero.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	hero.clip_contents=true
	parent.add_child(hero)
	var art: TextureRect=app.picture(hero,"res://assets/ui-v08/home-immortal.png",0,TextureRect.STRETCH_KEEP_ASPECT_COVERED)
	art.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var shade: ColorRect=ColorRect.new()
	shade.color=Color(0.08,0.23,0.32,0.65)
	shade.mouse_filter=Control.MOUSE_FILTER_IGNORE
	hero.add_child(shade)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var text: Label=app.label(hero,"仙盟" if badge.contains("仙盟") else "仙榜",26,GameTheme.LIGHT)
	text.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	text.offset_left=52
	text.offset_right=-12
	text.vertical_alignment=VERTICAL_ALIGNMENT_CENTER
	var icon: Control=GameIllustratedIcon.icon(hero,"guild" if badge.contains("仙盟") else "rank",false)
	icon.position=Vector2(8,1)
	icon.size=Vector2(40,40)
	var mode: Label=app.label(hero,"离线同道" if badge.contains("仙盟") else "NPC参考",11,GameTheme.LIGHT)
	mode.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mode.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT
	mode.vertical_alignment=VERTICAL_ALIGNMENT_CENTER
	mode.offset_right=-12

static func _avatar(app,parent: Node,id: String,height: int=42) -> TextureRect:
	var image: TextureRect=app.picture(parent,"res://assets/avatars/%s-premium.webp" % id,height)
	image.custom_minimum_size.x=height
	image.size_flags_horizontal=Control.SIZE_SHRINK_CENTER
	return image

static func _build_unjoined(app,parent: Node) -> void:
	app.label(parent,"选择仙盟，与同道共修。",17,GameTheme.JADE)
	for sect: Dictionary in GameCommunity.SECTS:
		var box: VBoxContainer=_compact_card(app,parent)
		var row: HBoxContainer=app.row(box)
		_avatar(app,row,str(sect.portrait),56)
		var text: VBoxContainer=app.column(row)
		text.add_theme_constant_override("separation",4)
		app.label(text,str(sect.name),20,GameTheme.GOLD)
		app.label(text,str(sect.motto),17)
		var join: Button=app.button(row,"加入",_join_confirm.bind(app,sect),true,not _write_reason(app).is_empty())
		join.custom_minimum_size.x=64
		join.size_flags_horizontal=Control.SIZE_SHRINK_CENTER
	app.button(parent,"创建自己的仙盟",_create_modal.bind(app),true,not _write_reason(app).is_empty())
	var links: HBoxContainer=app.row(parent)
	app.button(links,"三界仙榜",app._go.bind(7))
	app.button(links,"返回修行",app._go.bind(5))
	var reason: String=_write_reason(app)
	if not reason.is_empty(): app.label(parent,reason,17,GameTheme.RED)

static func _build_tasks(app,parent: Node,s: Dictionary,c: Dictionary) -> void:
	app.label(parent,"每日 UTC 00:00 刷新",17,GameTheme.MUTED)
	for task: Dictionary in GameCommunity.TASKS:
		var box: VBoxContainer=_compact_card(app,parent)
		var row: HBoxContainer=app.row(box)
		var text: VBoxContainer=app.column(row)
		text.add_theme_constant_override("separation",4)
		var progress: int=int(c.donations) if task.id=="donate" else GameCommunity.task_progress(s,str(task.id))
		var goal: String={"donate":"捐献","estate":"经营","cultivation":"培养"}[str(task.id)]
		app.label(text,"%s · %s %d/%d" % [str(task.name),goal,mini(progress,int(task.target)),int(task.target)],17,GameTheme.JADE)
		app.label(text,"%s · 贡献 %d" % [app.cost(task.reward),int(task.coins)],17)
		var reason: String=_write_reason(app)
		if reason.is_empty(): reason=task_reason(s,c,task)
		var action: String="领取"
		if str(task.id) in c.claimed: action="已领取"
		elif progress<int(task.target): action="未完成"
		elif reason.contains("容量"): action="背包满"
		elif not reason.is_empty(): action="只读"
		var button: Button=app.button(row,action,_claim_confirm.bind(app,task),true,not reason.is_empty())
		button.custom_minimum_size.x=76
		button.size_flags_horizontal=Control.SIZE_SHRINK_CENTER
		button.tooltip_text=reason
	app.label(parent,"委托贡献同额增加仙盟经验。",17,GameTheme.MUTED)

static func _build_shop(app,parent: Node,s: Dictionary,c: Dictionary) -> void:
	app.label(parent,"每日 UTC 00:00 刷新额度",17,GameTheme.MUTED)
	var page: int=_page(app,"community_shop_page",GameCommunity.SHOP.size(),2)
	for index: int in range(page*2,mini(GameCommunity.SHOP.size(),page*2+2)):
		var offer: Dictionary=GameCommunity.SHOP[index]
		var used: int=int(c.purchases.get(offer.id,0))
		var box: VBoxContainer=_compact_card(app,parent)
		var row: HBoxContainer=app.row(box)
		var text: VBoxContainer=app.column(row)
		text.add_theme_constant_override("separation",4)
		app.label(text,str(offer.name)+" · "+app.cost(offer.reward),17,GameTheme.GOLD)
		app.label(text,("测试免费 · 余量 %d/%d" % [int(offer.limit)-used,int(offer.limit)]) if GameEconomy.free_currency() else "贡献 %d · 余量 %d/%d" % [int(offer.price),int(offer.limit)-used,int(offer.limit)],17)
		var reason: String=_write_reason(app)
		if reason.is_empty(): reason=shop_reason(s,c,offer)
		var button: Button=app.button(row,"兑换",_buy_confirm.bind(app,offer),true,not reason.is_empty())
		button.custom_minimum_size.x=68
		button.size_flags_horizontal=Control.SIZE_SHRINK_CENTER
		if not reason.is_empty():
			var caption: String=reason
			if reason.contains("额度已用尽"): caption="今日兑换额度已用尽。"
			elif reason.contains("容量"): caption="资源容量不足，请先消耗。"
			app.label(box,caption,17,GameTheme.MUTED)
	_page_controls(app,parent,"community_shop_page",page,GameCommunity.SHOP.size(),2)

static func _build_donation(app,parent: Node,s: Dictionary,c: Dictionary) -> void:
	var box: VBoxContainer=_compact_card(app,parent,12)
	app.label(box,"同心捐献",21,GameTheme.GOLD)
	app.label(box,"灵石 100 · 灵材 15",17)
	app.label(box,"获得贡献 50 · 仙盟经验 50",17,GameTheme.JADE)
	app.label(box,"今日 %d / 3 次 · UTC 00:00 刷新" % int(c.donations),17,GameTheme.MUTED)
	var reason: String=_write_reason(app)
	if reason.is_empty(): reason=donation_reason(s,c)
	app.button(box,"捐献一次",_donate_confirm.bind(app),true,not reason.is_empty())
	if not reason.is_empty(): app.label(box,reason,17,GameTheme.MUTED)
	app.label(parent,"贡献可在宝阁兑换；累计贡献参与仙榜。",17,GameTheme.MUTED)

static func _build_members(app,parent: Node,s: Dictionary) -> void:
	app.label(parent,"我与六位离线 NPC 同道",17,GameTheme.MUTED)
	var members: Array=[{"name":"我的仙府","portrait":str(s.team[0]),"self":true}]
	for entry: Dictionary in GameCommunity.ranking(s,"power"):
		if not entry.self: members.append(entry)
	var page: int=_page(app,"community_member_page",members.size(),3)
	var list: VBoxContainer=app.column(parent)
	list.add_theme_constant_override("separation",4)
	for index: int in range(page*3,mini(members.size(),page*3+3)):
		var member: Dictionary=members[index]
		var box: VBoxContainer=_compact_card(app,list,5)
		var row: HBoxContainer=app.row(box)
		_avatar(app,row,str(member.portrait),42)
		app.label(row,str(member.name),17,GameTheme.JADE if member.self else GameTheme.TEXT)
		var badge: Label=app.label(row,"我" if member.self else "NPC",17,GameTheme.JADE if member.self else GameTheme.MUTED)
		badge.size_flags_horizontal=Control.SIZE_SHRINK_END
		badge.autowrap_mode=TextServer.AUTOWRAP_OFF
	_page_controls(app,parent,"community_member_page",page,members.size(),3)

static func _rank_row(app,parent: Node,entry: Dictionary,board: String) -> void:
	var box: VBoxContainer=_compact_card(app,parent,5)
	if entry.self: box.get_parent().add_theme_stylebox_override("panel",GameTheme.box(Color("d5e6ef"),GameTheme.JADE,10,5))
	var row: HBoxContainer=app.row(box)
	var rank: Label=app.label(row,str(int(entry.rank)),18,GameTheme.GOLD)
	rank.size_flags_horizontal=Control.SIZE_SHRINK_CENTER
	rank.custom_minimum_size.x=20
	_avatar(app,row,str(entry.portrait),40)
	var text: VBoxContainer=app.column(row)
	text.add_theme_constant_override("separation",0)
	app.label(text,str(entry.name),17,GameTheme.JADE if entry.self else GameTheme.TEXT)
	app.label(text,"我 · 实际存档" if entry.self else "NPC · 离线参考",14,GameTheme.JADE if entry.self else GameTheme.MUTED)
	var score: Label=app.label(row,str(int(entry.score))+("关" if board=="progress" else ""),17,GameTheme.GOLD)
	score.size_flags_horizontal=Control.SIZE_SHRINK_END
	score.autowrap_mode=TextServer.AUTOWRAP_OFF

static func _page(app,key: String,count: int,per_page: int) -> int:
	return clampi(int(app.get_meta(key,0)),0,maxi(0,int(ceil(float(count)/per_page))-1))

static func _page_controls(app,parent: Node,key: String,page: int,count: int,per_page: int) -> void:
	var pages: int=maxi(1,int(ceil(float(count)/per_page)))
	var row: HBoxContainer=app.row(parent)
	app.button(row,"上一页",_change_page.bind(app,key,page-1),false,page==0)
	var text: Label=app.label(row,"%d / %d" % [page+1,pages],17,GameTheme.MUTED)
	text.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	text.size_flags_horizontal=Control.SIZE_SHRINK_CENTER
	text.autowrap_mode=TextServer.AUTOWRAP_OFF
	app.button(row,"下一页",_change_page.bind(app,key,page+1),false,page==pages-1)

static func _change_page(app,key: String,page: int) -> void:
	app.set_meta(key,maxi(0,page))
	app._render()

static func donation_reason(s: Dictionary,c: Dictionary) -> String:
	if int(c.donations)>=3: return "今日三次捐献已完成，等待 UTC 零点刷新。"
	if not GameEconomy.can_afford(s,DONATION_COST): return "需灵石 100、灵材 15；当前资源不足。"
	return ""

static func task_reason(s: Dictionary,c: Dictionary,task: Dictionary) -> String:
	if str(task.id) in c.claimed: return "今日奖励已领取，等待 UTC 零点刷新。"
	var progress: int = int(c.donations) if task.id=="donate" else GameCommunity.task_progress(s,str(task.id))
	if progress<int(task.target): return "委托尚未完成。"
	if not GameEconomy.refund_room(s,task.reward): return "资源容量不足，请先消耗后领取。"
	return ""

static func shop_reason(s: Dictionary,c: Dictionary,offer: Dictionary) -> String:
	if GameCommunity.level(c)<int(offer.level): return "需仙盟 %d 级，当前 %d 级。" % [int(offer.level),GameCommunity.level(c)]
	if int(c.purchases.get(offer.id,0))>=int(offer.limit): return "今日兑换额度已用尽，等待 UTC 零点刷新。"
	if not GameEconomy.free_currency() and int(c.coins)<int(offer.price): return "需贡献 %d，当前可用 %d。" % [int(offer.price),int(c.coins)]
	if not GameEconomy.refund_room(s,offer.reward): return "资源容量不足，请先消耗后兑换。"
	return ""

static func _write_reason(app) -> String:
	if app.store.corruption: return "存档待恢复，暂时无法提交操作。"
	if app.store.readonly: return "当前存档只读，暂时无法提交操作。"
	return ""

static func _guild_tab(app,tab: String) -> void:
	app.set_meta("community_tab",tab)
	app._render()

static func _ranking_tab(app,board: String) -> void:
	app.community_board=board
	app._render()

static func _join_confirm(app,sect: Dictionary) -> void:
	var box: VBoxContainer = app._modal("加入"+str(sect.name))
	app.label(box,str(sect.motto),21,GameTheme.GOLD)
	app.label(box,"离线仙盟 · NPC同道\n加入免费，仙盟从 1 级开始。完成委托、捐献可积累贡献与仙盟经验。",17)
	app.button(box,"确认加入",_submit.bind(app,"guildJoin",{"id":str(sect.id)},"已加入"+str(sect.name)),true)
	app.button(box,"稍后再说",app._close_modal)

static func _create_modal(app) -> void:
	var box: VBoxContainer = app._modal("创建仙盟")
	app.label(box,"以一方仙盟之名，与 NPC 同道同行。",18,GameTheme.GOLD)
	app.label(box,"免费创建 · 盟名 2 至 12 字\n离线仙盟，仅存于当前存档。",17,GameTheme.MUTED)
	var field: LineEdit = app._field(box,"","输入仙盟名称")
	field.max_length=12
	var submit: Button = app.button(box,"创建仙盟",_create.bind(app,field),true,true)
	field.text_changed.connect(func(value: String) -> void:
		var title: String=value.strip_edges()
		submit.disabled=title.length()<2 or title.length()>12 or title.contains("\n"))
	app.button(box,"取消",app._close_modal)

static func _create(app,field: LineEdit) -> void:
	_submit(app,"guildCreate",{"name":field.text.strip_edges()},"仙盟已创建")

static func _leave_confirm(app) -> void:
	var c: Dictionary=GameCommunity.snapshot(app.state())
	var box: VBoxContainer=app._modal("退出仙盟")
	app.label(box,"确认退出%s？" % str(c.guild.name),21,GameTheme.GOLD)
	app.label(box,"当前仙盟的等级与经验会结束。个人可用贡献、累计贡献及今日捐献、领取、兑换记录保留；再次加入或创建从 1 级开始。",17)
	app.button(box,"确认退出",_submit.bind(app,"guildLeave",{},"已退出仙盟"),true)
	app.button(box,"留在仙盟",app._close_modal)

static func _donate_confirm(app) -> void:
	var box: VBoxContainer=app._modal("同心捐献")
	app.label(box,"测试免费捐献 · 货币不消耗" if GameEconomy.free_currency() else "消耗 灵石 100 · 灵材 15",21,GameTheme.GOLD)
	app.label(box,"获得贡献 50、仙盟经验 50。今日最多三次，UTC 零点刷新。",17)
	app.button(box,"确认捐献",_submit.bind(app,"guildDonate",{},"捐献成功 · 贡献 +50"),true)
	app.button(box,"取消",app._close_modal)

static func _buy_confirm(app,offer: Dictionary) -> void:
	var box: VBoxContainer=app._modal("兑换"+str(offer.name))
	app.label(box,"测试免费兑换 · 贡献不消耗" if GameEconomy.free_currency() else "消耗贡献 %d" % int(offer.price),21,GameTheme.GOLD)
	app.label(box,"获得 %s\n兑换一次占用今日一份额度。" % app.cost(offer.reward),17)
	app.button(box,"确认兑换",_submit.bind(app,"guildBuy",{"id":str(offer.id)},"已兑换"+str(offer.name)),true)
	app.button(box,"取消",app._close_modal)

static func _claim_confirm(app,task: Dictionary) -> void:
	var box: VBoxContainer=app._modal(str(task.name))
	app.label(box,str(task.description),21,GameTheme.GOLD)
	app.label(box,"奖励 %s\n贡献 +%d · 仙盟经验 +%d" % [app.cost(task.reward),int(task.coins),int(task.coins)],17)
	app.button(box,"确认领取",_submit.bind(app,"guildClaim",{"id":str(task.id)},"仙盟委托奖励已领取"),true)
	app.button(box,"取消",app._close_modal)

static func _submit(app,operation: String,args: Dictionary,success: String) -> void:
	var result: Dictionary=app.command(operation,args)
	if result.get("ok",false):
		app._close_modal()
		app.toast(success)
