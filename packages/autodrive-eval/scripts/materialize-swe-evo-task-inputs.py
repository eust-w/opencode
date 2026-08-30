#!/usr/bin/env python3

import argparse
import hashlib
import json
from pathlib import Path

import pyarrow as pa


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize the frozen SWE-EVO Arrow rows for the host executor")
    parser.add_argument("--arrow", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text())
    arrow_sha256 = hashlib.sha256(args.arrow.read_bytes()).hexdigest()
    if arrow_sha256 != manifest["source"]["sha256"]:
        raise ValueError("SWE-EVO Arrow SHA-256 does not match the frozen manifest")

    with pa.memory_map(str(args.arrow), "r") as source:
        rows = pa.ipc.open_stream(source).read_all().to_pylist()

    tasks = {task["instanceID"]: task for task in manifest["tasks"]}
    inputs = []
    for row in rows:
        task = tasks.get(row["instance_id"])
        if task is None:
            raise ValueError(f"Arrow row is outside the frozen manifest: {row['instance_id']}")
        if row["log_parser"] not in {
            "parse_log_pytest",
            "parse_log_pytest_options",
            "parse_log_pytest_pydantic",
            "parse_log_pytest_v2",
        }:
            raise ValueError(f"Unsupported SWE-EVO log parser: {row['log_parser']}")
        expected = {
            "repo": row["repo"],
            "baseCommit": row["base_commit"],
            "environmentSetupCommit": row["environment_setup_commit"],
            "image": row["image"],
            "failToPassCount": len(row["FAIL_TO_PASS"]),
            "passToPassCount": len(row["PASS_TO_PASS"]),
        }
        actual = {key: task[key] for key in expected}
        if actual != expected:
            raise ValueError(f"Arrow row does not match the frozen manifest: {row['instance_id']}")
        inputs.append(
            {
                "schemaVersion": 1,
                "instanceID": row["instance_id"],
                "repo": row["repo"],
                "baseCommit": row["base_commit"],
                "environmentSetupCommit": row["environment_setup_commit"],
                "image": row["image"],
                "problemStatement": row["problem_statement"],
                "testPatch": row["test_patch"],
                "testCommand": row["test_cmds"],
                "logParser": row["log_parser"],
                "failToPass": row["FAIL_TO_PASS"],
                "passToPass": row["PASS_TO_PASS"],
                "source": {
                    "commit": manifest["source"]["commit"],
                    "sha256": arrow_sha256,
                },
            }
        )

    if len(inputs) != 48 or {item["instanceID"] for item in inputs} != set(tasks):
        raise ValueError("SWE-EVO Arrow rows do not cover the frozen 48-task manifest exactly")

    args.output.mkdir(parents=True, exist_ok=True)
    for item in inputs:
        target = args.output / f"{item['instanceID']}.json"
        target.write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": "materialized", "tasks": len(inputs), "sourceSHA256": arrow_sha256}))


if __name__ == "__main__":
    main()
