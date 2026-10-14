"""Synthetic algorithm tests only. No real WeChat evidence is generated here."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_evidence import compare, load_events, sha


def truth(body="测试", order=1, contact="test-contact-a", message="g1"):
    return dict(run_id="test-run", scenario="S05", message_id=message, sender_record_id="independent-log",
                streamer_id="receiver", contact_id=contact, direction="INBOUND", body=body, order=order,
                kind="TEXT", arrived_at_ms=1000, cutoff_at_ms=2000, delivery_confirmed="true")


def candidate(**changes):
    item=dict(body="测试", native_message_id="native-1", streamer_id="receiver", contact_id="test-contact-a",
              direction="INBOUND", order=1, kind="TEXT", identity_verified=True, direction_verified=True,
              order_verified=True, message_boundary_verified=True, automatic=True, binding_origin="observed_identifier")
    item.update(changes)
    return item


def event(items=None, at=1500, mode=None, run="test-run", source="notification"):
    return dict(source=source, at_ms=at, event_id="synthetic-unit-only", payload=dict(schema=1,
                type="NOTIFICATION_POSTED", run_id=run, scenario="S05", armed=True,
                data=dict(candidates=items or [], mode=mode)))


def write_export(path, rows):
    final_hash = rows[-1]["hash"] if rows else "0"
    header = dict(export_schema=2, record_type="EXPORT_START", export_id="synthetic-export-only",
                  expected_event_count=len(rows), last_event_hash=final_hash)
    footer = dict(export_schema=2, record_type="EXPORT_END", export_id="synthetic-export-only",
                  event_count=len(rows), last_event_hash=final_hash)
    path.write_text("\n".join(json.dumps(row) for row in [header, *rows, footer])+"\n", encoding="utf-8")


class AuditTests(unittest.TestCase):
    def test_user_click_is_not_legacy_background_success_even_if_flagged_automatic(self):
        result=compare([truth()], [event([candidate()],mode="USER_TRIGGERED_VISIBLE_SAMPLE")])
        self.assertEqual(0,result["A"])
        self.assertEqual(0,result["raw_automatic_observations"])

    def test_no_denominator_is_not_success(self):
        r=compare([], [event([candidate()])]); self.assertIsNone(r["sample_recall"]); self.assertEqual("NOT_TESTED",r["sample_status"])
    def test_missing_message_uses_g_as_denominator(self):
        r=compare([truth(),truth(body="丢失",order=2,message="g2")],[event([candidate()])]); self.assertEqual(2,r["G"]); self.assertEqual(0.5,r["sample_recall"])
    def test_zero_events_means_all_missing(self):
        self.assertEqual(1,compare([truth()],[])["missing_or_incorrect"])
    def test_unknown_contact_cannot_pass(self):
        self.assertEqual(0,compare([truth()],[event([candidate(contact_id=None,identity_verified=False)])])["A"])
    def test_wrong_person_does_not_pass(self):
        r=compare([truth()],[event([candidate(contact_id="other")])]); self.assertEqual(0,r["A"]); self.assertEqual(1,r["wrong_contact_observations"])
    def test_correct_capture_does_not_hide_a_wrong_person_capture(self):
        r=compare([truth()],[event([candidate(),candidate(native_message_id="wrong",contact_id="other")])])
        self.assertEqual(1,r["A"]); self.assertEqual("FAIL",r["sample_status"])
    def test_additional_false_message_is_not_hidden_by_perfect_recall(self):
        r=compare([truth()],[event([candidate(),candidate(native_message_id="spurious",body="incorrect",order=2)])])
        self.assertEqual(1,r["A"]); self.assertEqual("FAIL",r["sample_status"])
    def test_equal_body_two_real_messages_are_not_collapsed(self):
        items=[candidate(),candidate(native_message_id="native-2",order=2)]
        self.assertEqual(2,compare([truth(),truth(order=2,message="g2")],[event(items)])["A"])
    def test_single_capture_cannot_satisfy_two_repeats(self):
        self.assertEqual(1,compare([truth(),truth(order=2,message="g2")],[event([candidate()])])["A"])
    def test_cross_channel_same_native_id_is_one(self):
        self.assertEqual(1,compare([truth()],[event([candidate()]),event([candidate()],source="accessibility")])["A"])
    def test_manual_sample_never_counts(self):
        self.assertEqual(0,compare([truth()],[event([candidate()],mode="USER_DELAYED_SAMPLE")])["A"])
    def test_later_opening_is_not_background_success(self):
        r=compare([truth()],[event([candidate()],at=2500)]); self.assertEqual(0,r["A"]); self.assertEqual(1,r["outcomes"][0]["late_observations"])
    def test_existing_old_text_is_not_new_message(self):
        self.assertEqual(0,compare([truth()],[event([candidate()],at=500)])["A"])
    def test_wrong_run_does_not_count(self):
        self.assertEqual(0,compare([truth()],[event([candidate()],run="other-run")])["A"])
    def test_order_not_inferred_from_text(self):
        self.assertEqual(0,compare([truth()],[event([candidate(order=None,order_verified=False)])])["A"])
    def test_direction_unknown_does_not_pass(self):
        self.assertEqual(0,compare([truth()],[event([candidate(direction="UNKNOWN")])])["A"])
    def test_manual_identity_repair_does_not_pass(self):
        self.assertEqual(0,compare([truth()],[event([candidate(binding_origin="manual_repair")])])["A"])
    def test_mixed_native_ids_are_ambiguous(self):
        r=compare([truth()],[event([candidate(),candidate(native_message_id="different")])]); self.assertEqual(0,r["A"])
    def test_mock_never_auto_opens_g1_gate(self):
        self.assertIn("NOT_PASSED",compare([truth()],[event([candidate()])])["g1_gate"])
    def test_body_change_breaks_evidence_chain(self):
        raw=json.dumps(dict(schema=1,event_id="synthetic",at_ms=1,elapsed_ms=1,source="health"))
        digest=sha(raw)
        row=dict(seq=1,event_id="synthetic",at_ms=1,elapsed_ms=1,source="health",payload_json=raw,payload_sha256=digest,prev_hash="0",hash=sha(f"0|synthetic|1|{digest}"))
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic-unit-only.jsonl"
            write_export(path,[row]); self.assertEqual(1,len(load_events(path)))
            row["payload_json"]="tampered"
            write_export(path,[row])
            with self.assertRaises(ValueError): load_events(path)
    def test_truncated_export_is_rejected(self):
        raw=json.dumps(dict(schema=1)); digest=sha(raw)
        row=dict(seq=2,event_id="synthetic",at_ms=1,source="health",payload_json=raw,payload_sha256=digest,prev_hash="0",hash=sha(f"0|synthetic|1|{digest}"))
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic-unit-only.jsonl"; write_export(path,[row])
            with self.assertRaises(ValueError): load_events(path)
    def test_envelope_source_and_elapsed_cannot_be_changed(self):
        raw=json.dumps(dict(schema=1,event_id="synthetic",at_ms=1,elapsed_ms=1,source="health"))
        digest=sha(raw)
        row=dict(seq=1,event_id="synthetic",at_ms=1,elapsed_ms=1,source="health",payload_json=raw,payload_sha256=digest,prev_hash="0",hash=sha(f"0|synthetic|1|{digest}"))
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic-unit-only.jsonl"
            for changes in ({"source":"notification"},{"elapsed_ms":999}):
                write_export(path,[dict(row,**changes)])
                with self.assertRaises(ValueError): load_events(path)

    def test_valid_prefix_without_completion_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic-unit-only.jsonl"; write_export(path,[])
            path.write_text(path.read_text(encoding="utf-8").splitlines()[0]+"\n",encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"completion marker missing"): load_events(path)

    def test_legacy_diagnostic_read_does_not_silently_pass(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic-unit-only.jsonl"; path.write_text("",encoding="utf-8")
            with self.assertRaises(ValueError): load_events(path)
            self.assertEqual([],load_events(path,allow_legacy=True))

    def test_export_count_and_id_and_final_hash_are_checked(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic-unit-only.jsonl"
            for changes in ({"event_count":1},{"export_id":"other"},{"last_event_hash":"wrong"}):
                write_export(path,[]); lines=path.read_text(encoding="utf-8").splitlines()
                lines[-1]=json.dumps(dict(json.loads(lines[-1]),**changes)); path.write_text("\n".join(lines),encoding="utf-8")
                with self.assertRaises(ValueError): load_events(path)

    def test_event_after_completion_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic-unit-only.jsonl"; write_export(path,[])
            path.write_text(path.read_text(encoding="utf-8")+'{}\n',encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"after export completion"): load_events(path)

    def test_complete_empty_export_does_not_prove_capture(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic-unit-only.jsonl"; write_export(path,[])
            self.assertEqual("NOT_TESTED",compare([],load_events(path))["sample_status"])


if __name__ == "__main__": unittest.main()
