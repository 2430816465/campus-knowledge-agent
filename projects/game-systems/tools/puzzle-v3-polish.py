from pathlib import Path
import json

root = Path(__file__).resolve().parent.parent
levels_path = root / 'games/marble/puzzle-levels.js'
text = levels_path.read_text(encoding='utf-8')
levels = json.loads(text.split('export const LEVELS = ', 1)[1].rstrip().rstrip(';'))
hints = {
    2: '借墙面完成一次折返，观察入射角与反射角。出口要求至少反弹一次。',
    3: '青色斜镜改变方向；借镜折返后进入出口，出口要求至少反弹一次。',
    5: '观察顶部与侧墙的反射关系，把至少两次反弹连起来。',
    11: '上下石梁形成夹层，观察边墙与斜镜，寻找绕开阻挡的折返路线。',
    22: '石墙和斜镜改变入门路线；穿门后在另一侧折返，点亮机关。',
    29: '一次性镜面与永久镜面同场。借反射点亮机关，再寻找出口。',
    36: '同发依次点亮两颗星，还需穿过传送门。规划石梁与镜面的折返路线。',
    37: '先穿过传送门，再借一次性镜面折返取印；传送不改变方向。',
    38: '先穿门换位，再分裂两路。两颗子弹珠必须同发点亮两枚分流印。',
    44: '三面镜子提供不同支路；先确定分裂方向，再让两路共同点亮分流印。',
    48: '传送门、碎镜和石梁交织。同发按序点亮两颗星，并完成门镜条件。',
    50: '先穿门换位，再分裂两路；还需借碎镜反射，同发完成两枚分流印。',
}
for n, hint in hints.items():
    levels[n-1]['hint'] = hint
    levels[n-1]['objective'] = hint
levels[26]['nodes'][0]['kind'] = 'key'
levels_path.write_text('// Campaign 3: fixed authored geometry with wider reflection passages.\nexport const LEVELS = '+json.dumps(levels, ensure_ascii=False, indent=2)+';\n', encoding='utf-8')

main_path = root / 'games/marble/puzzle-main.js'
main = main_path.read_text(encoding='utf-8').replace("runId:'marble-ruins-level-'", "runId:'marble-ruins-v2-level-'").replace('按青色虚线瞄准', '沿青/金虚线瞄准')
main_path.write_text(main, encoding='utf-8')

render_path = root / 'games/marble/puzzle-render.js'
render = render_path.read_text(encoding='utf-8')
render = render.replace("disk(e.x,e.y,20,ready?", "disk(e.x,e.y,e.r,ready?").replace("c.arc(e.x,e.y,17,0,Math.PI*2)", "c.arc(e.x,e.y,e.r-3,0,Math.PI*2)")
render = render.replace("g.level.boss?'守卫核心':'出口',e.x,e.y+33", "g.level.boss?'守卫核心':e.minBounces?e.minBounces+'弹出口':'出口',e.x,e.y+e.r+13")
render_path.write_text(render, encoding='utf-8')
