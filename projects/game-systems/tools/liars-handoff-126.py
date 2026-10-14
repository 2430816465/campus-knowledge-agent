"""Save this verified tavern-only batch without producing a release package."""
from pathlib import Path
from datetime import datetime
import difflib
import hashlib
import json
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
desktop = root.parent
backup = desktop / '备份-再骗一杯126流程审核前-20261002'
out = desktop / '当前最新修改-待整合/再骗一杯'
audit = root / 'artifacts/liars-126-audit'
stamp = datetime.now().astimezone().isoformat(timespec='seconds')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read_json = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
write_json = lambda p, data: p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

baseline = read_json(audit / 'apk-baseline.json')
assert baseline['version'] == '1.26.0' and baseline['moduleFiles'] == 78
assert baseline['liarsDifferences'] == [], 'Initial source must match the released tavern.'
# APK ZIP entries lacking the UTF-8 flag were initially decoded as CP437 by Python.
# Android consumes their UTF-8 byte names; keep the raw audit and a corrected comparison.
normalized_names = []
for entry in baseline['files']:
    try:
        decoded = entry['path'].encode('cp437').decode('utf-8')
    except UnicodeError:
        continue
    if decoded != entry['path']:
        normalized_names.append({'zipDecodedPath': entry['path'], 'utf8Path': decoded})
        entry['path'] = decoded
baseline['normalizedZipNames'] = normalized_names
write_json(audit / 'apk-verified-baseline.json', baseline)
ui = read_json(audit / 'final/ui-results.json')
assert len(ui['checks']) == 133 and not ui['issues'] and not ui['errors']
for rel in ['actions/results.json', 'feedback/browser-results.json',
            'automatic-drink/potion-results.json', 'turn-cues/results.json']:
    result = read_json(audit / rel)
    assert result['passed'] and not result['errors'], rel
for rel in ['artifacts/liars/browser-results.json',
            'artifacts/liars/phone-results.json', 'artifacts/liars-match/browser-results.json']:
    result = read_json(root / rel)
    assert result['passed'] and not result['errors'], rel

# Repeat the cheap rule checks and retain their real output, rather than a claimed count.
tests = sorted(str(p) for p in (root / 'tests').glob('liars*.test.mjs'))
unit = subprocess.run(['node', '--test', *tests], cwd=root, capture_output=True,
                      text=True, encoding='utf-8', errors='replace')
assert unit.returncode == 0, unit.stdout + unit.stderr
(audit / 'unit-tests.txt').write_text(unit.stdout + unit.stderr, encoding='utf-8')
assert 'tests 38' in unit.stdout and 'pass 38' in unit.stdout

delivery = read_json(desktop / '当前安装包资料-1.26.0/版本与打包/release-1.26.0/delivery.json')
packages = []
for name, key in [('再来亿把-1.26.0.apk', 'apkSha256'),
                  ('再来亿把-1.26.0-完整源码.zip', 'sourceZipSha256')]:
    p = desktop / name
    digest = sha(p)
    assert digest == delivery[key], 'Shipped package changed: ' + name
    packages.append({'name': name, 'sha256': digest, 'bytes': p.stat().st_size, 'unchanged': True})
assert read_json(root / 'package.json')['version'] == '1.26.0'
gradle = (root / 'android/app/build.gradle').read_text(encoding='utf-8')
assert "versionName '1.26.0'" in gradle and 'versionCode 32' in gradle
android = root / 'android/app/src/main/assets/web'
android_changes = [f['path'] for f in baseline['files']
                   if not (android / f['path']).is_file() or sha(android / f['path']) != f['sha256']]
assert not android_changes, 'Android assets must remain the released baseline.'

# Documentation reflects the now centred whole-match result panel.
readme = root / 'games/liars/README.md'
text = readme.read_text(encoding='utf-8')
text = text.replace('结算提示暂时替换手牌区域', '开牌和喝药提示替换手牌区域，整局结算在居中面板显示')
readme.write_text(text, encoding='utf-8')

out.mkdir(parents=True, exist_ok=True)
before, after, evidence = [out / s for s in ['修改前', '修改后', '验收']]
for p in [before, after, evidence]:
    p.mkdir(exist_ok=True)
files = []
patches = []

def preserve(rel, original=None, old_bytes=None):
    current = root / rel
    if old_bytes is None and original is not None:
        old_bytes = original.read_bytes()
    new_bytes = current.read_bytes()
    dest = after / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(current, dest)
    if old_bytes is not None:
        dest = before / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(old_bytes)
    old_hash = hashlib.sha256(old_bytes).hexdigest() if old_bytes is not None else None
    new_hash = hashlib.sha256(new_bytes).hexdigest()
    change = 'unchanged' if old_hash == new_hash else 'added' if old_hash is None else 'modified'
    files.append({'path': rel, 'change': change, 'beforeSHA256': old_hash,
                  'afterSHA256': new_hash, 'bytes': len(new_bytes)})
    if change != 'unchanged':
        try:
            patches.append(''.join(difflib.unified_diff(
                (old_bytes or b'').decode('utf-8-sig').splitlines(keepends=True),
                new_bytes.decode('utf-8-sig').splitlines(keepends=True),
                fromfile='a/' + rel if old_bytes is not None else '/dev/null',
                tofile='b/' + rel)))
        except UnicodeDecodeError:
            patches.append('Binary files differ: ' + rel + '\n')

for current in sorted((root / 'games/liars').rglob('*')):
    if current.is_file():
        rel = current.relative_to(root).as_posix()
        original = backup / 'liars' / current.relative_to(root / 'games/liars')
        preserve(rel, original if original.is_file() else None)

# A released ZIP is read only for original test/tool copies that predate this task.
with zipfile.ZipFile(desktop / '再来亿把-1.26.0-完整源码.zip') as archive:
    lookup = {}
    for entry in archive.namelist():
        parts = entry.split('/')
        if len(parts) >= 2 and parts[-2] in ['tests', 'tools']:
            lookup.setdefault('/'.join(parts[-2:]), []).append(entry)
    for current in sorted((root / 'tests').glob('liars*')):
        if not current.is_file():
            continue
        rel = current.relative_to(root).as_posix()
        original = backup / current.name
        candidates = lookup.get(rel, [])
        old = original.read_bytes() if original.is_file() else archive.read(candidates[0]) if len(candidates) == 1 else None
        preserve(rel, old_bytes=old)
    for name in ['liars-match-balance.mjs', 'liars-apk-audit.py', 'liars-handoff-126.py']:
        rel = 'tools/' + name
        candidates = lookup.get(rel, [])
        preserve(rel, old_bytes=archive.read(candidates[0]) if len(candidates) == 1 else None)

# Save the actual reports/screenshots. Do not copy the APK extraction or any release binaries.
for name in ['final', 'actions', 'feedback', 'automatic-drink', 'turn-cues', 'skill-client-final']:
    shutil.copytree(audit / name, evidence / name, dirs_exist_ok=True)
for name in ['apk-baseline.json', 'apk-verified-baseline.json', 'unit-tests.txt']:
    shutil.copy2(audit / name, evidence / name)
(evidence / 'baseline').mkdir(exist_ok=True)
shutil.copy2(audit / 'baseline/ui-results.json', evidence / 'baseline/ui-results.json')
for name in ['568x320-finished.png', '1280x800-selected.png', '740x360-selected.png']:
    if (audit / 'baseline' / name).is_file():
        shutil.copy2(audit / 'baseline' / name, evidence / 'baseline' / name)
for name in ['liars', 'liars-match']:
    dest = evidence / name
    dest.mkdir(exist_ok=True)
    for source in (root / 'artifacts' / name).glob('*'):
        if source.is_file() and source.suffix in ['.json', '.png']:
            shutil.copy2(source, dest / source.name)

runtime = []
for entry in baseline['files']:
    if entry['path'].startswith('games/liars/'):
        p = root / entry['path']
        assert p.is_file(), 'Tavern resource deleted: ' + entry['path']
        runtime.append({**entry, 'currentSHA256': sha(p), 'changed': sha(p) != entry['sha256']})
changed_runtime = [f['path'] for f in runtime if f['changed']]
assert len(changed_runtime) == 8, changed_runtime
assert not any(f['changed'] and '/assets/' in f['path'] for f in runtime)
manifest = {'updatedAt': stamp, 'source': str(root), 'batch': '再骗一杯',
            'version': '1.26.0', 'versionCode': 32, 'apkProduced': False,
            'androidAssetsChanged': android_changes, 'shippedPackages': packages,
            'files': files, 'tavernRuntime': runtime, 'changedRuntimeFiles': changed_runtime,
            'testedViewports': ['568x320', '667x375', '740x360', '844x390', '915x412', '1024x768', '1280x800'],
            'layoutScenes': 133, 'layoutIssues': 0, 'ruleTests': 38,
            'physicalAndroidTested': False}
write_json(out / '修改清单及SHA256.json', manifest)
(out / '源码差异.patch').write_text(''.join(patches), encoding='utf-8')

note = f'''# 再骗一杯：1.26.0 UI、动作流程与自动喝药（待整合）

完成于 {stamp}。当前有效源码：`{root.as_posix()}`。已完成本批修改与源码验收，未生成安装包、未改版本号、未写 Android assets。后续与其他批次一起整合。

## 事实、判断与边界

- 实际读取桌面《再来亿把-1.26.0.apk》，版本 1.26.0 / code 32；修改前 78 个再骗一杯运行文件与 APK 逐文件一致，不凭图片判断安装包状态。原始对照见 `验收/apk-baseline.json`。
- 发现短横屏整局结算被底部区域裁切，重开/返回按钮不可见；选牌说明挤入操作列，选中手牌可能遮挡药量标题。出牌阶段原本缺少统一动作音效和角色动作，喝药仍有选择过程。
- 按每步所属座位组织提示，取消额外喝药选择，不改变牌堆真假、诅咒瓶随机性、机器人思考时间和既有 1.26 营地结算政策。版面、身份指向采用真实 DOM 和截图验证；音效和 Android 震动桥验证调用，不能替代实体手机的实际听感与触感。

## 已完成

1. 小屏手牌与出牌/质疑按钮各自保持在框内，选牌说明和药量标题可见；快捷语放在座位内侧避免盖住人物；菜单触控区域 44×44。整局结算改为居中面板，获胜者、回执及重开/返回操作完整显示。
2. 出牌角色和最新牌堆同步高亮、推牌动作与落牌动画，配合出牌音效及短震动；牌仍只留在各自面前。角色名旁精简显示“打出×张／正在出牌／刚出×张”。
3. 当前出牌者面前显示 30 秒倒计时；本人新回合有提示音和短震动，最后 5 秒增加音效提醒、紧迫颜色和一次震动，其他座位不显示无关计时。
4. 质疑角色播放完整开牌动作；箭头指向被质疑角色的牌堆。中央放大该手牌，原座位牌保留，逐张标真/假；明确显示真假判定与应喝药角色。万能小偷与桌牌均按真牌判定。
5. 判定展示结束，权威规则直接进入自动喝药，无按钮、无选择、无额外等候，真人与机器人相同。完整喝药动作 1.8 秒，随后才显示安全药效果或石化；结果展示与下一轮由服务器推进，一次质疑只喝一瓶。
6. 保留声音/震动/减少晃动开关，暂停与页面隐藏不会重复触发音效和震动；断线重连按服务器时间恢复动作。规则与说明同步删除旧的喝药等待文案，精简重复结算文字，取消旧键盘喝药操作。

## 验收

- 38/38 规则与表现单元回归，包括所有桌牌和合法 1—3 张牌组合、真牌/万能牌、含假牌、最新一手归属、超时随机代出、每局四角色唯一、自动喝药恰好一次、音效/震动去重、暂停和减少晃动。
- 7 种尺寸 × 19 个场景，共 133 画面：568×320、667×375、740×360、844×390、915×412、1024×768、1280×800；出牌、选牌、快捷语、质疑、翻牌、真/假结果、喝药、安全、石化、结算、规则/菜单/记录均无所检查的出框、遮挡和资源/脚本错误。报告与最终截图在 `验收/final`。
- 四个实际 WebSocket 客户端轮流出牌：四座的动作、高亮、提示音和震动桥调用正确；计时与最后 5 秒提醒仅属于当前玩家；重复快照不重复播放。`验收/turn-cues/results.json`。
- 四客户端经营地第五入口完成真实整局，累计 16 次开牌与 16 次自动喝药，验证进入/准备/开始、私牌隔离、断线重连、结算一次、重开药量重置和未完局退出。完整整局测试不使用直接结束的夹具。`验收/liars/browser-results.json`。
- 四真人共享匹配、队列取消、快捷语、单人加三机器人实际完成牌局、重新匹配和手机 Worker 兜底均通过。`验收/liars-match/browser-results.json`。
- 实际 Java LanSocketServer + 实际手机权威 Worker，四客户端通过模拟 Android 接口通信：120ms 延迟、30 秒超时出一张、重连、质疑后自动喝药及下一轮、房主后台关房通过。此项不是四台实体手机。`验收/liars/phone-results.json`。
- 四角色 48 帧完整开牌/喝药动作，真牌+小偷由质疑者喝药、混合假牌由出牌者喝药，安全药与石化、暂停恢复、静音/减少晃动/关闭震动通过；这些分支使用受控权威夹具，不等同随机统计。`验收/actions`、`验收/feedback`、`验收/automatic-drink`。
- 原始 develop-web-game 客户端运行完成，最终状态与截图已查看；其截图仅含 Canvas 背景，DOM 角色/按钮以完整 UI 截图验收。`验收/skill-client-final`。

## 整合交接

- 8 个运行文件：{', '.join('`' + p.removeprefix('games/liars/') + '`' for p in changed_runtime)}。全部 78 个原运行文件仍存在，美术资源 SHA256 未变；其他小游戏的待整合源码保留。
- `修改前` 保留本批开始时的模块及原测试；`修改后` 为当前模块、相关测试和工具副本。`源码差异.patch` 和 `修改清单及SHA256.json` 可用于逐文件整合。不要把旧批次整目录覆盖回当前工程。
- 两个已发行 APK/完整源码 ZIP 的 SHA256 与 1.26.0 发行记录完全一致；Android assets 的 972 个发行文件逐文件核对未变。旧安装包不含本批修改，后续重新生成资源清单与统一打包。
- 没有实体 Android 设备测试：最终合包后仍须验收真实手机震动/声音、系统导航安全区、方向切换及实体双手机局域网。当前也没有公共服务器部署，远程陌生人匹配依赖后续服务器配置。
'''
(out / '完成说明.md').write_text(note, encoding='utf-8')

# Preserve every earlier batch entry and promote only this completed batch.
for marker, prefix in [(desktop / '当前最新源码说明.md', '当前最新修改-待整合/'),
                       (desktop / '当前最新修改-待整合/当前最新修改说明.md', '')]:
    text = marker.read_text(encoding='utf-8-sig')
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith('更新于 '):
            lines[i] = f'更新于 {stamp}。'
        if line.startswith('当前最新源码位于 '):
            lines[i] = f'当前最新源码位于 `{root.as_posix()}`。最新完成《再骗一杯》UI、动作提示及自动喝药，等待与其他修改统一打包；其他批次状态见各自记录。版本仍为 1.26.0 / code 32，未生成或覆盖安装包，未更新 Android assets。'
        if line.startswith('- 最新完成：') and '再骗一杯' not in line:
            lines[i] = line.replace('- 最新完成：', '- 已完成：', 1)
    entry = f'- 最新完成：再骗一杯手牌/按钮/快捷语/结算布局修复，出牌动作与声音震动提示、当前座位倒计时及最后5秒提醒，质疑与真假牌指向，取消选择并自动喝药。[完成说明]({prefix}再骗一杯/完成说明.md)。38 项回归、7 尺寸133画面、四客户端整局、实际 Java LAN 与手机 Worker 检查通过；未测试实体手机。源码副本、差异、SHA256 与截图已保存。'
    lines = [s for s in lines if not (s.startswith('- 最新完成：再骗一杯') or s.startswith('- 已完成：再骗一杯'))]
    at = next(i for i, s in enumerate(lines) if s.startswith('- 已完成：') or s.startswith('- 已保留'))
    lines.insert(at, entry)
    marker.write_text('\n'.join(lines) + '\n', encoding='utf-8')

heading = '## 再骗一杯：1.26.0 UI、动作流程与自动喝药（当前最新，待整合）'
progress = root / 'progress.md'
text = progress.read_text(encoding='utf-8')
if heading not in text:
    progress.write_text(text + f'''\n\n{heading}
- 实际读取已发行 1.26.0 APK，修改前全部78个再骗一杯运行文件一致。修复短横屏结算裁切、手牌/按钮/选牌说明布局与快捷语遮挡，菜单44×44；每次出牌的角色与牌堆动作、音效/震动、本人回合与最后5秒提示已补齐。
- 质疑箭头、完整开牌动作、中央真假牌与原地牌堆、输家喝药身份保持清晰；移除选择/手动喝药与额外等候，规则权威直接自动喝药，完整动作1.8秒后再显示安全药效果或石化。
- PASS38/38回归，7尺寸133画面无所测出框/遮挡/脚本资源错误；四实际WebSocket玩家完整整局16次开牌与喝药，四座出牌提示、匹配与机器人完整牌局通过。实际Java LAN+实际Worker四客户端模拟安卓桥、120ms延迟、30秒超时与重连通过。完整动作48帧与真假惩罚分支另用受控夹具验证。
- 已运行原始skill client并查看最终Canvas截图与状态；UI依据全页DOM截图。没有实体安卓设备，音效/震动仅验证API调用，不能声称实际触感。
- 未生成APK、未改版本1.26.0/code32、Android assets972发行文件不变；已发行APK/ZIP SHA256不变。其他待整合批次保留。
- 交接：{(out / '完成说明.md').as_posix()}。\n''', encoding='utf-8')
print(json.dumps({'saved': str(out), 'runtimeChanges': changed_runtime,
                  'moduleFilesPreserved': len(runtime), 'layoutScenes': 133,
                  'shippedPackagesUnchanged': True, 'apkProduced': False}, ensure_ascii=False))
