# -*- coding: utf-8 -*-
from pathlib import Path
import json,hashlib,zipfile,sys
sys.stdout.reconfigure(encoding='utf-8')
p=Path(__file__).resolve().parents[1]
a=json.loads((p/'artifacts/optimization-1.21.0/resource-audit.json').read_text(encoding='utf-8'))
with zipfile.ZipFile(p.parent/'再来亿把-1.21.0-完整源码.zip') as z:
    for row in a['manifest']:
        assert hashlib.sha256(z.read('adventure-camp/'+row['path'])).hexdigest()==row['sha256'],row['path']
    assert not any('.liars-data/' in n or n.endswith('/dev-wallets.json') or n.endswith('.jks') for n in z.namelist())
phone=json.loads((p/'artifacts/optimization-1.21.0/staged/phone-check.json').read_text(encoding='utf-8'))
assert len(phone)==12
assert all(not x['errors'] and x['data']['overflow']==0 for x in phone)
for file in [p.parent/'再来亿把-1.21.0.apk',p.parent/'再来亿把.apk',p/'再来亿把.apk']:
    assert hashlib.sha256(file.read_bytes()).hexdigest()==a['apkSha256']
print('PASS: corresponding source archive matches all',len(a['manifest']),'runtime files; no private wallets/keys;12 staged phone checks;all delivery aliases match.')
