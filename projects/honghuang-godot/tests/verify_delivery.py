"""Test the exact player-facing PowerShell merger against both delivery sets."""
import hashlib, json, os, pathlib, subprocess, time, zipfile
root=pathlib.Path(__file__).resolve().parents[1]
output=root.parent/'delivery-v0.5'
verification=output/('part-verification-'+str(time.time_ns()))
verification.mkdir()
with zipfile.ZipFile(output/'Honghuang-0.5-START-HERE.zip') as z:
    for name in z.namelist():
        p=pathlib.PurePosixPath(name)
        assert not p.is_absolute() and '..' not in p.parts
    z.extractall(verification)
manifest=json.loads((verification/'SHA256-MANIFEST.json').read_text(encoding='utf-8'))
results=[]
for package in ('Windows','Source'):
    entry=manifest[package]
    for part in entry['parts']:
        assert part['bytes']<20_000_000
        os.link(output/part['name'],verification/part['name'])
    result=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(verification/'Merge-And-Extract.ps1'),'-Package',package],
        cwd=verification,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
    log=result.stdout.decode('utf-8','replace')
    (root/('evidence/merge-'+package+'.log')).write_text(log,encoding='utf-8')
    assert result.returncode==0,log
    archive=verification/entry['archive']
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==entry['sha256']
    folder=verification/pathlib.Path(entry['archive']).stem
    assert folder.is_dir()
    if package=='Windows':
        for name in ('Honghuang.exe','Honghuang.pck'):
            assert hashlib.sha256((folder/name).read_bytes()).digest()==hashlib.sha256((output/'Honghuang-0.5-Windows-x64'/name).read_bytes()).digest()
    else:
        assert (folder/'project.godot').is_file()
        for name in ('scripts/main.gd','scripts/summon_screen.gd','scripts/estate_view.gd','scripts/battle_view.gd'):
            assert hashlib.sha256((folder/name).read_bytes()).digest()==hashlib.sha256((root/name).read_bytes()).digest()
        assert not (folder/'runtime-home').exists() and not (folder/'.godot').exists()
    results.append(dict(package=package,parts=len(entry['parts']),passed=True,archive_sha256=entry['sha256'],directory=str(folder)))
    print('MERGE / EXTRACT VERIFIED:',package,flush=True)
# A second run must refuse to overwrite an existing game folder.
repeat=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(verification/'Merge-And-Extract.ps1'),'-Package','Windows'],
    cwd=verification,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=20)
assert repeat.returncode!=0,'Merger did not protect the existing directory'
report=dict(results=results,existing_directory_protected=True,all_parts_below_20mb=True,failures=[])
(root/'evidence/delivery-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(output/'delivery-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('DELIVERY VERIFIED; existing files protected',flush=True)
