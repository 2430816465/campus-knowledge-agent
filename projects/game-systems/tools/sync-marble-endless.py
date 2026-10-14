from pathlib import Path
import shutil

root = Path(__file__).resolve().parent.parent
source = root / 'games/marble'
destination = Path('C:/Users/24308/Desktop/再弹一次')
for name in ['state.js', 'state-endless.js', 'physics.js', 'endless-data.js',
             'puzzle-solutions.js', 'puzzle.html', 'puzzle.css', 'puzzle-levels.js', 'puzzle-state.js', 'puzzle-render.js', 'puzzle-art.js', 'puzzle-tutorial.js', 'puzzle-main.js', 'puzzle-aim.js', 'endless-audio.js', 'ui-endless.js', 'main.js', 'style.css', 'endless.css', 'render-endless.js']:
    text = (source / name).read_text(encoding='utf-8')
    if name == 'style.css':
        text = text.replace('../../assets/fonts/camp-display.woff', 'assets/fonts/camp-display.woff').replace('../../assets/pixel/', 'assets/pixel/').replace('../tower/美术/hero/新勇者四向待机-透明.png', 'assets/hero.png')
    if name == 'puzzle.css':
        text = text.replace('../../assets/fonts/camp-display.woff', 'assets/fonts/camp-display.woff').replace('../../assets/reference/pixel-camp.png', 'assets/pixel-camp.png')
    if name == 'puzzle.html':
        text = text.replace('<script src="../shared/wood-ui.js"></script>', '').replace('<script type="module" src="../shared/camp-wallet.js"></script>', '').replace('<script type="module" src="../shared/legibility.js"></script>', '')
    if name == 'render-endless.js':
        text = text.replace('../tower/assets/art/hero/battle-isolated.png', 'assets/hero-battle.png').replace('../tower/assets/art/monsters/knight_black/remade/idle-clean.png', 'assets/enemies/knight_black.png')
    if name in ['style.css', 'puzzle.css', 'puzzle.html', 'render-endless.js']:
        (destination / name).write_text(text, encoding='utf-8')
    else:
        shutil.copyfile(source / name, destination / name)
index = destination / 'index.html'
text = index.read_text(encoding='utf-8')
text = text.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-game-ui="marble">')
if 'href="endless.css"' not in text:
    text = text.replace('</head>', '<link rel="stylesheet" href="endless.css"></head>')
index.write_text(text, encoding='utf-8')
shutil.copyfile(root / 'assets/reference/pixel-camp.png', destination / 'assets/pixel-camp.png')
shutil.copytree(source / 'assets/puzzle', destination / 'assets/puzzle', dirs_exist_ok=True)
shutil.copyfile(root / 'games/tower/assets/art/hero/battle-isolated.png', destination / 'assets/hero-battle.png')
shutil.copyfile(root / 'output/endless/剑魂音效试听.wav', destination / '剑魂音效试听.wav')
for name in ['marble-endless-check.mjs', 'marble-endless-balance.mjs']:
    text = (root / 'tools' / name).read_text(encoding='utf-8').replace('../games/marble/', '../')
    (destination / 'tests' / name).write_text(text, encoding='utf-8')
for name in ['endless-balance.test.mjs', 'endless-remake.test.mjs', 'endless-pushback.test.mjs', 'puzzle-normal.test.mjs']:
    text = (root / 'tests' / name).read_text(encoding='utf-8').replace('../games/marble/', '../')
    (destination / 'tests' / name).write_text(text, encoding='utf-8')
notes = source / '无尽模式平衡-验收说明.md'
if notes.exists():
    shutil.copyfile(notes, destination / notes.name)
pushback_notes = source / '全敌击退-验收说明.md'
if pushback_notes.exists():
    shutil.copyfile(pushback_notes, destination / pushback_notes.name)
for name in ['普通闯关-验收说明.md', '普通版50关清单.md']:
    notes = source / name
    if notes.exists():
        shutil.copyfile(notes, destination / name)
overview = root / 'output/puzzle-normal-v2/地图总览.html'
if overview.exists():
    (destination / '50关地图总览.html').write_text(overview.read_text(encoding='utf-8').replace('../../games/marble/', './'), encoding='utf-8')
print('Synced endless game, assets, audio preview and tests to desktop standalone.')
