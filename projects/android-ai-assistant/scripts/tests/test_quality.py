import csv
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import prepare_quality
import score_quality


class QualityTest(unittest.TestCase):
    def test_synthetic_cases_explicitly_marked_and_unique(self):
        cases = [prepare_quality.make_case(i * 10 + j + 1, category, j) for i, category in enumerate(prepare_quality.CATEGORIES) for j in range(10)]
        self.assertEqual(100, len({c['id'] for c in cases}))
        self.assertTrue(all(c['provenance'] == 'SYNTHETIC_NOT_REAL_WECHAT' for c in cases))
        for case in cases:
            rows = sorted(case['conversation']['messages'], key=lambda row: row['order'])
            self.assertEqual('CONTACT', rows[-1]['speaker'])
            self.assertFalse(rows[-1]['actualSent'])
            self.assertEqual('CONFIRMED', rows[-1]['status'])
            self.assertEqual(len(rows), len({row['id'] for row in rows}))

    def test_long_history_has_early_middle_and_late_truth(self):
        c = prepare_quality.make_case(1, 'long_history', 0)
        rows = c['conversation']['messages']
        self.assertEqual(1000, len(rows))
        self.assertIn('5月18日', rows[34]['body']); self.assertIn('咖啡过敏', rows[409]['body']); self.assertIn('体检', rows[898]['body'])

    def test_refusal_has_explicit_stop_contact(self):
        self.assertIn('不要再联系', prepare_quality.make_case(1, 'refusal', 0)['conversation']['messages'][-1]['body'])

    def test_no_model_run_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'run-summary.json').write_text(json.dumps(dict(real_interface_calls=False, cases=100)))
            with self.assertRaises(ValueError): score_quality.evaluate(root, root / 'missing.csv')

    def test_small_run_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'run-summary.json').write_text(json.dumps(dict(real_interface_calls=True, cases=1)))
            with self.assertRaises(ValueError): score_quality.evaluate(root, root / 'missing.csv')

    def fixture(self, directory):
        root = Path(directory); (root / 'grading').mkdir()
        (root / 'run-summary.json').write_text(json.dumps(dict(real_interface_calls=True, cases=100)))
        mapping = [dict(id='SYN-%03d' % i, ordinary='A', full='B', input_sha256='fixture-' + str(i)) for i in range(100)]
        rows = []
        for m in mapping:
            (root / 'grading' / (m['id'] + '.json')).write_text(json.dumps(dict(input_sha256=m['input_sha256'])))
            m['grading_sha256'] = hashlib.sha256((root / 'grading' / (m['id'] + '.json')).read_bytes()).hexdigest()
            (root / (m['id'] + '-full-audit.json')).write_text(json.dumps(dict(case_input_sha256=m['input_sha256'], components=[dict(name=n, state='SUCCEEDED') for n in ['Jev', '狗头军师', '恋爱大师']])))
            (root / (m['id'] + '-ordinary-audit.json')).write_text(json.dumps(dict(input_sha256=m['input_sha256'])))
            for variant in ['A', 'B']:
                row = dict(case_id=m['id'], variant=variant, judge='UNIT_TEST_FIXTURE_NOT_REAL_JUDGE', input_sha256=m['input_sha256'], grading_sha256=m['grading_sha256'], notes='fixture')
                row.update({c: '1' for c in score_quality.CRITERIA}); row.update({c: '3' for c in score_quality.RATINGS}); rows.append(row)
        (root / 'blind-mapping.json').write_text(json.dumps(dict(rows=mapping)))
        return root, rows

    def write_scores(self, root, rows):
        path = root / 'scores.csv'
        with path.open('w', encoding='utf-8', newline='') as h:
            w = csv.DictWriter(h, fieldnames=prepare_quality.SCORE_FIELDS); w.writeheader(); w.writerows(rows)
        return path

    def test_blank_scores_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root, rows = self.fixture(directory); rows[0]['host_style'] = ''
            with self.assertRaises(ValueError): score_quality.evaluate(root, self.write_scores(root, rows))

    def test_all_five_conditions_required_threshold_exactly_95(self):
        # Arithmetic fixture only; no public quality report is written.
        with tempfile.TemporaryDirectory() as directory:
            root, rows = self.fixture(directory)
            for row in rows[:10]: row['key_history'] = '0'
            report = score_quality.evaluate(root, self.write_scores(root, rows)); self.assertEqual(95, report['passed']['full']); self.assertTrue(report['full_meets_95'])
            rows[11]['respects_boundaries'] = '0'
            report = score_quality.evaluate(root, self.write_scores(root, rows)); self.assertFalse(report['full_meets_95'])

    def test_default_component_skipped_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root, rows = self.fixture(directory); path = root / 'SYN-000-full-audit.json'; audit = json.loads(path.read_text()); audit['components'][0]['state'] = 'USER_DISABLED'; path.write_text(json.dumps(audit))
            with self.assertRaises(ValueError): score_quality.evaluate(root, self.write_scores(root, rows))

    def test_dual_skill_architecture_keeps_95_gate_and_records_jev_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            root, rows = self.fixture(directory)
            (root / 'run-summary.json').write_text(json.dumps(dict(real_interface_calls=True, cases=100, architecture='DUAL_SKILL_V1')))
            for path in root.glob('*-full-audit.json'):
                audit = json.loads(path.read_text()); audit['components'][0]['state'] = 'USER_DISABLED'; path.write_text(json.dumps(audit))
            report = score_quality.evaluate(root, self.write_scores(root, rows))
            self.assertFalse(report['jev_included']); self.assertEqual('DUAL_SKILL_V1', report['architecture'])
            self.assertTrue(report['full_meets_95'])
            for row in rows[:12]: row['key_history'] = '0'
            self.assertFalse(score_quality.evaluate(root, self.write_scores(root, rows))['full_meets_95'])

    def test_architecture_change_cannot_relabel_existing_results(self):
        with tempfile.TemporaryDirectory() as directory:
            root, rows = self.fixture(directory)
            (root / 'run-summary.json').write_text(json.dumps(dict(real_interface_calls=True, cases=100, architecture='DUAL_SKILL_V1')))
            with self.assertRaises(ValueError): score_quality.evaluate(root, self.write_scores(root, rows))
            (root / 'run-plan.json').write_text(json.dumps(dict(architecture='JEV_DUAL_SKILL_V1')))
            with self.assertRaises(ValueError): score_quality.evaluate(root, self.write_scores(root, rows))

    def test_scores_from_different_input_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root, rows = self.fixture(directory); rows[3]['input_sha256'] = 'different-run'
            with self.assertRaises(ValueError): score_quality.evaluate(root, self.write_scores(root, rows))

    def test_scores_from_different_outputs_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root, rows = self.fixture(directory); rows[3]['grading_sha256'] = 'different-outputs'
            with self.assertRaises(ValueError): score_quality.evaluate(root, self.write_scores(root, rows))


if __name__ == '__main__': unittest.main()
