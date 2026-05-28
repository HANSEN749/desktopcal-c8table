"""uv-managed command surface for DesktopCal."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")


def find_root() -> Path:
    current = Path.cwd().resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "pyproject.toml").exists() and (candidate / "package.json").exists():
            return candidate
    return Path(__file__).resolve().parents[2]


ROOT = find_root()
ACTIVE_CHANGE = ROOT / "harness" / "changes" / "active"
PARKING_DIR = ROOT / "harness" / "changes" / "parking"
ARCHIVE_DIR = ROOT / "harness" / "changes" / "archive"
INDEX_FILE = ROOT / "harness" / "changes" / "INDEX.json"


@dataclass(frozen=True)
class ToolCheck:
    name: str
    command: str
    required: bool = True


def run(command: Sequence[str], *, cwd: Path = ROOT) -> int:
    print(f"$ {' '.join(command)}", flush=True)
    completed = subprocess.run(
        subprocess.list2cmdline(command) if os.name == "nt" else list(command),
        cwd=cwd,
        check=False,
        shell=os.name == "nt",
    )
    return completed.returncode


def capture(command: Sequence[str]) -> tuple[int, str]:
    completed = subprocess.run(
        subprocess.list2cmdline(command) if os.name == "nt" else list(command),
        cwd=ROOT,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=os.name == "nt",
    )
    return completed.returncode, completed.stdout.strip()


def command_exists(command: str) -> bool:
    return shutil.which(command) is not None


def webview2_status() -> tuple[bool, str]:
    if os.name != "nt":
        return True, "not Windows; WebView2 check skipped"
    try:
        import winreg

        keys = [
            (
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients"
                r"\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            ),
            (
                winreg.HKEY_CURRENT_USER,
                r"SOFTWARE\Microsoft\EdgeUpdate\Clients"
                r"\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            ),
        ]
        for hive, path in keys:
            try:
                with winreg.OpenKey(hive, path) as key:
                    version, _ = winreg.QueryValueEx(key, "pv")
                    if version:
                        return True, f"WebView2 runtime {version}"
            except OSError:
                continue
    except Exception as exc:  # pragma: no cover - Windows registry varies.
        return False, f"unable to inspect registry: {exc}"
    return False, "WebView2 runtime not found in standard registry locations"


def cmd_doctor(_: argparse.Namespace) -> int:
    checks = [
        ToolCheck("uv", "uv"),
        ToolCheck("node", "node"),
        ToolCheck("npm", "npm"),
        ToolCheck("rustc", "rustc"),
        ToolCheck("cargo", "cargo"),
    ]
    failures = 0
    for check in checks:
        if not command_exists(check.command):
            marker = "FAIL" if check.required else "WARN"
            print(f"{marker} {check.name}: command not found")
            failures += int(check.required)
            continue
        code, output = capture([check.command, "--version"])
        if code == 0:
            print(f"OK   {check.name}: {output.splitlines()[0] if output else 'available'}")
        else:
            print(f"FAIL {check.name}: {output}")
            failures += int(check.required)

    webview_ok, webview_message = webview2_status()
    print(f"{'OK' if webview_ok else 'FAIL'}   webview2: {webview_message}")
    failures += 0 if webview_ok else 1

    if (ROOT / "node_modules" / ".bin" / ("tauri.cmd" if os.name == "nt" else "tauri")).exists():
        code, output = capture(["npx", "tauri", "--version"])
        print(f"{'OK' if code == 0 else 'WARN'}  tauri-cli: {output or 'installed'}")
    else:
        print("WARN  tauri-cli: run npm install first")

    if failures:
        print(
            "\nInstall missing required tools, then re-run: "
            "uv run --no-editable desktopcal doctor"
        )
        return 1
    return 0


def cmd_dev(_: argparse.Namespace) -> int:
    return run(["npm", "run", "dev"])


def cmd_build(_: argparse.Namespace) -> int:
    return run(["npm", "run", "build"])


def cmd_test(_: argparse.Namespace) -> int:
    py = run([sys.executable, "-m", "pytest", "tests"])
    ts = run(["npm", "test"])
    return py or ts


def cmd_lint(_: argparse.Namespace) -> int:
    commands = [
        [sys.executable, "-m", "ruff", "check", "."],
        [sys.executable, "-m", "mypy", "src/desktopcal"],
        ["npm", "run", "lint"],
    ]
    status = 0
    for command in commands:
        status = run(command) or status
    status = harness_lint() or status
    return status


def safe_change_name(name: str) -> str:
    allowed = []
    for char in name.lower().strip():
        if char.isalnum():
            allowed.append(char)
        elif char in {" ", "_", "-"}:
            allowed.append("-")
    normalized = "".join(allowed).strip("-")
    while "--" in normalized:
        normalized = normalized.replace("--", "-")
    if not normalized:
        raise ValueError("change name must contain at least one letter or number")
    return normalized


def write_change_template(change_dir: Path, name: str) -> None:
    change_dir.mkdir(parents=True, exist_ok=False)
    (change_dir / "reviews").mkdir()
    (change_dir / "summary.md").write_text(
        f"# {name}\n\nStatus: active\n\nPurpose: Track the structured work for `{name}`.\n",
        encoding="utf-8",
    )
    (change_dir / "spec.md").write_text(
        "# Spec\n\n## Goal\n\nTBD\n\n## Acceptance Criteria\n\n- TBD\n",
        encoding="utf-8",
    )
    (change_dir / "plan.md").write_text(
        "# Plan\n\n## Implementation\n\n- TBD\n\n## Validation\n\n- TBD\n",
        encoding="utf-8",
    )
    (change_dir / "tasks.md").write_text(
        "# Tasks\n\n- [ ] Define implementation tasks after spec/plan review.\n",
        encoding="utf-8",
    )
    (change_dir / "reviews" / "review.md").write_text(
        "# Review\n\nPlan review pending.\n",
        encoding="utf-8",
    )


def reindex_changes() -> None:
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    PARKING_DIR.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, str]] = []
    change_roots = [
        ("active", ACTIVE_CHANGE),
        ("parking", PARKING_DIR),
        ("archive", ARCHIVE_DIR),
    ]
    for state, parent in change_roots:
        if not parent.exists():
            continue
        if state == "active":
            candidates = [parent] if (parent / "summary.md").exists() else []
        else:
            candidates = [path for path in parent.iterdir() if path.is_dir()]
        for candidate in candidates:
            entries.append(
                {
                    "name": candidate.name,
                    "state": state,
                    "summary": str(candidate.relative_to(ROOT) / "summary.md"),
                }
            )
    INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
    INDEX_FILE.write_text(json.dumps({"changes": entries}, indent=2) + "\n", encoding="utf-8")


def harness_lint() -> int:
    required = [
        ROOT / "AGENTS.md",
        ROOT / "docs" / "ECL.md",
        ROOT / "docs" / "STATUS.md",
        ROOT / "docs" / "ARCHITECTURE.md",
        ROOT / "docs" / "DEVELOPMENT.md",
        ACTIVE_CHANGE / "summary.md",
        ACTIVE_CHANGE / "spec.md",
        ACTIVE_CHANGE / "plan.md",
        ACTIVE_CHANGE / "tasks.md",
        INDEX_FILE,
    ]
    failures = 0
    for path in required:
        if not path.exists():
            print(f"FAIL missing {path.relative_to(ROOT)}")
            failures += 1
        elif path.is_file() and not path.read_text(encoding="utf-8").strip():
            print(f"FAIL empty {path.relative_to(ROOT)}")
            failures += 1

    if INDEX_FILE.exists():
        try:
            json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"FAIL invalid INDEX.json: {exc}")
            failures += 1

    for path in ROOT.rglob("*"):
        if path.is_dir() or ".git" in path.parts or "node_modules" in path.parts:
            continue
        if path.suffix.lower() in {".md", ".json", ".toml", ".py", ".ts", ".tsx", ".rs"}:
            try:
                path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                print(f"FAIL non-UTF-8 text file {path.relative_to(ROOT)}")
                failures += 1

    if failures == 0:
        print("OK harness lint passed")
    return 1 if failures else 0


def cmd_harness(args: argparse.Namespace) -> int:
    command = args.harness_command
    if command == "new":
        if (ACTIVE_CHANGE / "summary.md").exists():
            print("Active change already exists; close or park it first.")
            return 1
        name = safe_change_name(args.name or "new-change")
        write_change_template(ACTIVE_CHANGE, name)
        reindex_changes()
        return 0
    if command == "reindex":
        reindex_changes()
        print("OK rebuilt harness/changes/INDEX.json")
        return 0
    if command == "lint":
        reindex_changes()
        return harness_lint()
    if command == "evolve-check":
        print("OK no auto-evolve threshold configured beyond archive counting yet")
        return 0
    if command in {"close", "park", "resume"}:
        print(f"{command} is reserved for the next harness iteration.")
        return 1
    raise AssertionError(f"unhandled harness command {command}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="desktopcal")
    subparsers = parser.add_subparsers(dest="command", required=True)

    for name, handler in [
        ("doctor", cmd_doctor),
        ("dev", cmd_dev),
        ("build", cmd_build),
        ("test", cmd_test),
        ("lint", cmd_lint),
    ]:
        sub = subparsers.add_parser(name)
        sub.set_defaults(handler=handler)

    harness = subparsers.add_parser("harness")
    harness_sub = harness.add_subparsers(dest="harness_command", required=True)
    harness_new = harness_sub.add_parser("new")
    harness_new.add_argument("name", nargs="?")
    for command in ["close", "park", "resume", "reindex", "lint", "evolve-check"]:
        harness_sub.add_parser(command)
    harness.set_defaults(handler=cmd_harness)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.handler(args))


if __name__ == "__main__":
    sys.exit(main())
