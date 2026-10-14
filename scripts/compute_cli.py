"""Generic cooperating-resource wrapper. Does not schedule or inspect models."""
import argparse
import json
import os
import subprocess
import sys

from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.compute_coordination import Coordinator, ComputeBusy


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", help="Absolute shared path; default CAMPUS_COMPUTE_DIR / LOCALAPPDATA")
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("status", help="Observe OS ownership and journal; no GPU/model probe")
    ack = sub.add_parser("ack", help="Clear quarantine ONLY after external idle/orphan verification")
    ack.add_argument("--token", required=True)
    ack.add_argument("--evidence", required=True, help="Non-secret note describing external verification")
    hold = sub.add_parser("hold", help="Reserve training priority and wrap an external command")
    hold.add_argument("--role", choices=["training"], required=True)
    hold.add_argument("--timeout", type=float, default=60)
    hold.add_argument("--readiness-ack", help="Required attestation: external idle/VRAM/unmanaged-client verification")
    hold.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    if args.action == "hold":
        command = args.command[1:] if args.command[:1] == ["--"] else args.command
        if not command:
            parser.error("hold requires -- external-command [arguments]")
        if not args.readiness_ack or not args.readiness_ack.strip():
            parser.error("Reservation is not GPU readiness: --readiness-ack is required after external verification")
    try:
        coordinator = Coordinator(args.directory)
        if args.action == "status":
            print(json.dumps(coordinator.status(), ensure_ascii=False, indent=2))
        elif args.action == "ack":
            coordinator.acknowledge_quarantine(args.token, evidence=args.evidence)
            print(json.dumps({"quarantine_acknowledged": args.token}))
        else:
            with coordinator.training(timeout=args.timeout) as lease:
                # This records the caller's attestation; it does not measure GPU.
                lease.confirm_readiness(args.readiness_ack)
                lease.mark_started()  # durable before spawning a possibly GPU-using child
                environment = dict(os.environ, CAMPUS_COMPUTE_DIR=str(coordinator.directory),
                                   CAMPUS_COMPUTE_RESERVATION_TOKEN=lease.token)
                try:
                    child = subprocess.Popen(command, env=environment, shell=False, close_fds=True)
                except OSError:
                    lease.mark_completed()  # no child was created
                    raise
                # Deliberately no subprocess.run/context-manager: interruption must
                # not implicitly kill a live external command. Orphans quarantine.
                returncode = child.wait()
                lease.mark_completed()  # direct child ended; descendants must be accounted for externally
                return returncode if returncode >= 0 else 1
        return 0
    except ComputeBusy as error:
        print(json.dumps({"deferred": True, "reason": error.reason}), file=sys.stderr)
        return 75
    except KeyboardInterrupt:
        print("Interrupted; no child/process was stopped. Inspect status for quarantine.", file=sys.stderr)
        return 130
    except (ValueError, OSError) as error:
        print(f"Coordination error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
