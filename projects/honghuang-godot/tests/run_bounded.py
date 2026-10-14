"""Execute the real Godot suites with per-process timeouts and retained evidence."""
import json, os, pathlib, subprocess, sys, time
project = pathlib.Path(__file__).resolve().parents[1]
engine = project.parent / 'tools/godot-4.6.3/Godot_v4.6.3-stable_win64_console.exe'
output = project / 'evidence/final-tests'
output.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
env['APPDATA'] = env['LOCALAPPDATA'] = str(project / 'runtime-home')
names = sys.argv[1:]
files = [project / 'tests' / name for name in names] if names else sorted((project / 'tests').glob('test_*.gd'))
results = []
if names and (output / 'results.json').exists():
    results = [r for r in json.loads((output / 'results.json').read_text(encoding='utf-8')) if r['file'] not in names]
for file in files:
    start = time.monotonic()
    command = [str(engine), '--headless', '--path', str(project), '--script', 'res://tests/' + file.name, '--log-file', str(output / (file.stem + '.engine.log'))]
    # Balanced-economy regression suites retain their original debit assertions.
    if file.name != 'test_free_currency.gd': command += ['--', '--balanced-economy']
    try:
        result = subprocess.run(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
        text = result.stdout.decode('utf-8', 'replace')
        code = result.returncode
    except subprocess.TimeoutExpired as error:
        text = (error.stdout or b'').decode('utf-8', 'replace') + '\nTIMEOUT after 120 seconds\n'
        code = -1
    passed = code == 0 and 'SCRIPT ERROR:' not in text and '\nERROR:' not in text
    (output / (file.stem + '.log')).write_text(text, encoding='utf-8')
    results.append(dict(file=file.name, passed=passed, code=code, seconds=round(time.monotonic()-start, 2)))
    print(('PASS ' if passed else 'FAIL ') + file.name, flush=True)
    if not passed: print(text[-14000:], flush=True)
(output / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print('TOTAL:', len(results), 'FAILURES:', sum(not r['passed'] for r in results), flush=True)
sys.exit(0 if results and all(r['passed'] for r in results) else 1)
