# 内测模拟服务契约

本模块只在当前电脑的独立 JSON 文件中运行；不连接网络、不发送聊天、不创建真实账号、不支付、不验证真实金融凭证。测试账号 ID 不是登录认证，客户端排名分数不具备反作弊能力。界面必须始终显示“内测模拟服务”。

## 调用

`GameOnlineMock.new(path, realm)`；默认 path 为 `user://mock-online-v1.json`。普通模拟 realm 为 `normal`，试用使用 `demo:A` 等，各 realm 的账号、档案、消息、公会、榜单与订单彼此隔离。

`command(account_id, device_id, operation, args)` 总返回 `{ok, error, data, mock:true, notice}`。先用 login 注册本地测试身份，昵称不作为账号标识。错误不提交任何状态；写失败、版本冲突、损坏文件均不覆盖原件。本机提交用原子目录写入锁串行化，锁内再检查修订号；每次写入使用唯一临时文件，flush和回读后替换（Linux原子rename；Windows依靠有效备份与中断恢复保护）。旧窗口被拒绝时须重新载入。此机制只保护本机模拟文件，不替代生产服务器数据库事务。

- 云档：cloud_upload(save,expected_revision)、cloud_download。下载只返回副本，调用方必须先用真实游戏存档验证器检查，再让玩家选择覆盖/取消并保留备份。冲突返回 CONFLICT 和现有云档，禁止静默覆盖。这里模拟两个设备，不是真实跨设备同步。
- 聊天：chat_send(text,channel,request_id)、chat_history(channel)。只有 world 和自身 guild。消息保留最近300条；同请求号重试不会重复。文本用原样纯文本控件，不能作为BBCode/HTML执行。
- 公会：guild_create(name)、guild_list、guild_join(guild_id)、guild_info、guild_leave(successor_id)。会长有其他成员时必须指定继任者；最后一名退出清除空公会。
- 排名：rank_submit(score,board)、rank_list(board)。board 为 power/challenge；只显示测试身份，分数更新立刻反映到本地服务，等分按ID排序。没有虚构真人在线数据。
- 支付：payment_products、payment_create(sku,request_id)、payment_settle(order_id,outcome)、payment_orders、payment_receipts。仅模拟成功/失败/取消；终态不能互改，重复回调幂等。paid订单返回唯一receipt_id与固定商品奖励。

## 收据接入边界

服务不直接修改 GameStore。游戏必须从服务中重新读取已支付的本账号/realm订单，并使用原子存档事务按receipt_id只发一次奖励；不能信任UI传来的任意奖励字典。若游戏写档失败，收据仍可重放，不能先标消费再丢失奖励。切换测试身份不能把资源合并进个人普通档。此环节由游戏集成层实现并验收。

## 后续真实服务器

替换相同适配器时需要真实认证、授权、TLS、服务端时间与经济验证、数据库事务和幂等键、消息限流/举报审核、隐私与数据删除流程、设备冲突版本策略、真实支付提供商签名验签和对账。当前模拟支付既不接外网也不声称可以商用收款。

## 已执行测试

`godot --headless --path . --script tests/test_online_mock.gd`

100项断言通过，覆盖两账号两设备、云档冲突/隔离、消息重试、公会隐私与会长转交、榜单更新、订单终态/重复回调/跨账号隔离、离线/磁盘失败回滚、旧窗口版本冲突、损坏文件保全。实际UI接入和游戏奖励事务需另测。

## 本机并发修复

预审真实双进程发现过旧的共享临时文件和“读版本后写入”竞态，原始失败证据保留为 docs/audits/preaudit-mock-race-native.json。当前提交改用 GameFileLock 的唯一所有者锁和每次唯一临时文件；失败、离线与冲突不提交内存副本，支付回执可在游戏保存失败后重试。修复后压力结果见相邻 fixed 文件，不用原100项顺序测试冒充并发证明。

## 显式恢复

restore_backup()验证最近服务备份、串行取得写入权、保留当前损坏文件，再以递增修订恢复整个本机服务。普通游戏档和虚拟设备游戏缓存不被修改。缺失主文件但存在备份时不会初始化空服务；登录前即可打开恢复界面。JSON写入保留完整浮点精度，云档生产进度等小数不会在服务端序列化时额外舍入。此处“服务端”仅指本机模拟模块。
