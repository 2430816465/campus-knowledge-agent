"""Packaging-only tests; stdlib, no Godot installation or network required."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location('package_release', Path(__file__).resolve().parents[1] / 'tools/package-release.py')
pkg = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pkg)


class PackagingTests(unittest.TestCase):
    def test_source_filters(self):
        for name in ['.godot/imported/a.ctex', '.git/config', 'docs/ui-reference/art.jpg',
                     'docs/ui-estate.png.import', 'tests/result.log',
                     'art-source/facility/alpha-qa.png',
                     'art-source/new-roster/chenqi.png', 'art-source/new-roster/chenqi.png.import',
                     'art-source/godot-facilities/mine-original.png',
                     'saves/normal.json', 'tests/__pycache__/a.pyc']:
            self.assertFalse(pkg.keep_source(Path(name)), name)
        for name in ['project.godot', 'data/game-data.json', 'assets/fonts/LICENSE.txt',
                     'tests/test_combat.gd', 'tests/fixtures/combat-reference.json',
                     'docs/ui-estate.png', 'docs/audits/preaudit-content.json',
                     'docs/audits/preaudit-fixed-mock-race.log',
                     'art-source/facility/source-manifest.json', 'art-source/facility/mine-prompt.txt']:
            self.assertTrue(pkg.keep_source(Path(name)), name)

    def test_originals_are_separate_and_reference_studies_are_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            names = ['art-source/new-roster/chenqi.png',
                     'art-source/new-roster/generation_manifest.json',
                     'art-source/godot-facilities/mine-original.png',
                     'art-source/godot-facilities/mine-prompt.txt',
                     'art-source/godot-facilities/mine-foundation-qa.png',
                     'docs/ui-reference/study.jpg', 'assets/portraits/chenqi-premium.webp',
                     'art-source/chapter-backgrounds/danfire-original.png']
            for name in names:
                p = root / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(b'fixture')
            source = {str(p.relative_to(root)) for p in pkg.source_inventory(root)}
            originals = {str(p.relative_to(root)) for p in pkg.art_inventory(root)}
            self.assertEqual(originals, set(names[:4] + [names[7]]))
            self.assertEqual(source, {names[1], names[3], names[6]})

    def fixture(self, root):
        data = root / 'payload.txt'
        data.write_text('洪荒众仙府\n' * 300, encoding='utf-8')
        archive = root / 'Toy.zip'
        pkg.make_zip(archive, [(data, 'Toy/payload.txt')])
        info = pkg.split_archive(archive, root, volume_bytes=70)
        pkg.write_reassembly(info, root, 'Toy')
        return info, data

    def test_volume_hash_and_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            info, data = self.fixture(root)
            self.assertGreater(len(info['parts']), 1)
            pkg.verify_parts(info, root)
            result = subprocess.run(['sh', str(root / 'Reassemble-Toy.sh')], cwd='/tmp', capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertEqual((root / 'Toy/payload.txt').read_bytes(), data.read_bytes())
            result = subprocess.run(['sh', str(root / 'Reassemble-Toy.sh')], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0, 'must refuse overwriting existing directory')

    def test_corrupt_or_missing_part_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            info, _ = self.fixture(root)
            p = root / info['parts'][0]['file']
            p.write_bytes(b'x' * p.stat().st_size)
            with self.assertRaises(RuntimeError): pkg.verify_parts(info, root)
            result = subprocess.run(['sh', str(root / 'Reassemble-Toy.sh')], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / 'Toy').exists())
            p.unlink()
            result = subprocess.run(['sh', str(root / 'Reassemble-Toy.sh')], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / 'Toy').exists())

    def test_safe_windows_reassembly(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            cmd = (root / 'Reassemble-Toy.cmd').read_text().lower()
            for forbidden in ['executionpolicy', 'bypass', 'powershell', '.ps1', 'download', 'start-process', 'runas',
                              "in ('", 'for /r', 'dir /s', '.json']:
                self.assertNotIn(forbidden, cmd)
            for needed in ['certutil.exe', '-hashfile', 'sha256', 'copy /b', 'tar.exe', 'if exist', 'check_hash',
                           'usebackq skip=1', 'hh_hash_report', 'hh_parts_here']:
                self.assertIn(needed, cmd)
            self.assertEqual(cmd.count('cd /d "%~dp0.."'), 1)
            self.assertLess(cmd.index(':parts_ready'), cmd.index('if exist "toy"'))

    def test_windows_guides_retain_exact_files_and_checksums(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            info, _ = self.fixture(root)
            info['archive'] = 'Honghuang-0.4-Windows-x64.zip'
            pkg.write_windows_guides({'status': 'SMOKE ONLY', 'archives': [info]}, root)
            guide = (root / 'Windows-先看这里.txt').read_text(encoding='utf-8-sig')
            manual = (root / 'Windows-手动合并.txt').read_text(encoding='utf-8-sig')
            for part in info['parts']:
                self.assertIn(part['file'], guide)
                self.assertIn(f'certutil -hashfile "{part["file"]}" SHA256', manual)
                self.assertIn(part['sha256'], manual)
            self.assertIn(info['sha256'], manual)
            self.assertIn('直接父目录', guide)
            self.assertIn('没有实际执行 Windows', guide)

    def test_player_manuals_are_required_and_locatable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'source'
            manuals = ['启动与交付.md', '试玩指南.md', 'Godot存档与恢复.md', '交付验收报告.md', 'LOCAL_MOCK_SERVICES.md']
            for relative in ['tools/licenses/license.txt', 'assets/fonts/LICENSE.txt'] + ['docs/' + name for name in manuals]:
                p = root / relative
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(relative, encoding='utf-8')
            target = Path(tmp) / 'player'
            target.mkdir()
            (target / 'Honghuang.exe').write_bytes(b'fixture')
            with patch.object(pkg, 'ROOT', root):
                pkg.copy_runtime_notices(target)
                readme = (target / 'README-先看这里.txt').read_text(encoding='utf-8-sig')
                for name in manuals:
                    self.assertEqual((target / name).read_bytes(), (root / 'docs' / name).read_bytes())
                    self.assertIn(name, readme)
                self.assertIn('docs/audits/', readme)
                (root / 'docs/交付验收报告.md').unlink()
                other = Path(tmp) / 'missing-report'
                other.mkdir()
                with self.assertRaisesRegex(RuntimeError, '交付验收报告'):
                    pkg.copy_runtime_notices(other)

    def test_strict_attachment_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            p = root / 'bad.zip'
            p.write_bytes(b'x')
            with self.assertRaises(ValueError): pkg.split_archive(p, root, 20_000_000)

    def test_archive_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / 'data'
            data.write_bytes(b'hello')
            with self.assertRaises(RuntimeError): pkg.make_zip(root / 'bad.zip', [(data, '../escape')])


if __name__ == '__main__': unittest.main()
