"""A bounded, fresh evidence run for the 2026-10-08 framework baseline."""
import json, os, pathlib, re, subprocess, sys, time
project = pathlib.Path(__file__).resolve().parents[1]
engine = project.parent / 'tools/godot-4.6.3/Godot_v4.6.3-stable_win64_console.exe'
output = project / 'evidence/framework-tests'
output.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
env['APPDATA'] = env['LOCALAPPDATA'] = str(project / 'runtime-home')
names = sys.argv[1:] or ['test_framework.gd', 'test_framework_rules.gd',
    'test_framework_boundaries.gd', 'test_framework_free_currency.gd',
    'test_framework_ui.gd', 'test_framework_flow.gd', 'test_framework_retained.gd', 'test_combat.gd',
    'test_combat_expansion.gd', 'test_storage.gd', 'test_interrupted_save.gd',
    'test_summon_movie_v08.gd', 'test_summon_results_v11.gd', 'test_activities_v08.gd',
    'test_expedition.gd', 'test_community.gd']
results = []
def decode_output(data):
    try: return data.decode('utf-8')
    except UnicodeDecodeError: return data.decode('gb18030', 'replace')
for name in names:
    start = time.monotonic()
    command = [str(engine), '--headless', '--path', str(project), '--script',
        'res://tests/' + name, '--log-file', str(output / (name + '.engine.log'))]
    if name != 'test_framework_free_currency.gd': command += ['--', '--balanced-economy']
    try:
        p = subprocess.run(command, env=env, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, timeout=60)
        text = decode_output(p.stdout); code = p.returncode
    except subprocess.TimeoutExpired as e:
        text = decode_output(e.stdout or b'') + '\nTIMEOUT after 60 seconds\n'; code = -1
    passed = code == 0 and 'SCRIPT ERROR:' not in text and not re.search(r'^ERROR:', text, re.M)
    (output / (name + '.log')).write_text(text, encoding='utf-8')
    results.append(dict(file=name, passed=passed, code=code,
        seconds=round(time.monotonic()-start, 2)))
    print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    if not passed: print(text[-9000:], flush=True)
(output / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print('TOTAL:', len(results), 'FAILURES:', sum(not r['passed'] for r in results), flush=True)
sys.exit(0 if results and all(r['passed'] for r in results) else 1)
