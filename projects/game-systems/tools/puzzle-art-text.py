from pathlib import Path
root=Path(__file__).resolve().parent.parent
replacements={
 '按 ①→② 点亮紫色星点':'按一灯→二灯点亮紫色星印',
 '同字母传送门':'同颜色、同造型的传送门',
 '按编号串联两颗星':'按底座灯数由少到多串联两颗星',
 '橙色虚线镜面':'铜橙端头的裂镜',
 '依次穿过 ①②③':'按一灯→二灯→三灯依次点亮星印',
 '字母标识帮助你规划入口':'颜色和造型帮助你辨认入口',
 '青色开关会转动中央斜板':'青铜齿轮会转动中央镜面',
}
files=[root/'games/marble/puzzle-levels.js']
files+=list(Path('C:/Users/24308/Desktop/再弹一次').glob('*50*关*.md'))
for p in files:
 s=p.read_text(encoding='utf-8')
 for old,new in replacements.items():s=s.replace(old,new)
 p.write_text(s,encoding='utf-8')
print('Updated instruction wording to match non-letter art; node labels and geometry unchanged.')
