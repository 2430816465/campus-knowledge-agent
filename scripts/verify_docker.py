"""Verify Docker/Compose without saving resolved environment values or credentials."""
import argparse
import json
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--probe-mount', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
if os.name == 'nt':
    cli = Path('C:/Program Files/Docker/Docker/resources/bin/docker.exe')
    compose_dir = Path('//wsl.localhost/Ubuntu/home/dzy/campus-agent/deploy/dify-1.17.1/docker')
else:
    cli = Path(shutil.which('docker') or '/missing-docker')
    compose_dir = Path.home() / 'campus-agent/deploy/dify-1.17.1/docker'

def call(*arguments, timeout=20):
    environment = {**os.environ, 'PATH': str(cli.parent) + os.pathsep + os.environ.get('PATH', '')}
    result = subprocess.run([str(cli), *arguments], env=environment, capture_output=True, text=True,
                            encoding='utf-8', errors='replace', timeout=timeout)
    if result.returncode:
        raise RuntimeError('Docker command failed with exit ' + str(result.returncode))
    return result.stdout

report = {'checked_at': datetime.now().astimezone().isoformat(), 'cli': str(cli),
          'compose_directory': str(compose_dir), 'license_accepted_by_agent': False}
info = json.loads(call('info', '--format', '{{json .}}'))
report['engine'] = {key: info.get(key) for key in
                    ('ServerVersion', 'OSType', 'Architecture', 'NCPU', 'MemTotal',
                     'Containers', 'Images')}
report['compose_version'] = call('compose', 'version', '--short').strip()
config = json.loads(call('compose', '--project-directory', str(compose_dir),
                         'config', '--format', 'json'))
report['compose_config_valid'] = True
report['services'] = {name: {'image': service.get('image'), 'ports': service.get('ports', [])}
                      for name, service in config['services'].items()}
report['mount_probe_passed'] = False
if args.probe_mount:
    output = call('run', '--rm', '--mount',
                  f'type=bind,source={compose_dir},target=/proof,readonly',
                  'busybox:1.37.0', 'cat', '/proof/campus-prepare.json', timeout=150)
    prepared = json.loads(output)
    report['mount_probe_passed'] = prepared.get('version') == '1.17.1'
    image = json.loads(call('image', 'inspect', 'busybox:1.37.0'))[0]
    report['mount_probe_image_digests'] = image.get('RepoDigests')
report['dify_containers_started'] = False
destination = root / 'reports/docker-verification.json'
destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
