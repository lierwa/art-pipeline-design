from __future__ import annotations

import json
import os
import re
import subprocess
import time
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

Runner = Callable[..., subprocess.CompletedProcess[str]]
ModelT = TypeVar("ModelT", bound=BaseModel)


class CodexJsonProvider:
    def __init__(
        self,
        codex_bin: str | None = None,
        runner: Runner = subprocess.run,
        timeout_seconds: int = 900,
    ) -> None:
        self.codex_bin = codex_bin or _default_codex_bin()
        self.runner = runner
        self.timeout_seconds = timeout_seconds

    def run_json_task(
        self,
        *,
        prompt: str,
        output_model: type[ModelT],
        artifact_dir: Path,
    ) -> ModelT:
        artifact_dir = Path(artifact_dir).resolve()
        artifact_dir.mkdir(parents=True, exist_ok=True)
        final_message_path = artifact_dir / "final_message.txt"
        raw_output_path = artifact_dir / "raw_output.txt"
        stderr_path = artifact_dir / "stderr.log"
        error_path = artifact_dir / "error.json"
        output_schema_path = artifact_dir / "output_schema.json"
        for stale_path in (final_message_path, raw_output_path, stderr_path, error_path):
            if stale_path.exists():
                stale_path.unlink()
        output_schema_path.write_text(
            json.dumps(output_model.model_json_schema(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        args = [
            self.codex_bin,
            "-a",
            "never",
            "exec",
            "--json",
            "--output-last-message",
            str(final_message_path),
            "--output-schema",
            str(output_schema_path),
            "--ephemeral",
            "--skip-git-repo-check",
        ]
        started = time.monotonic()
        _write_command(artifact_dir, args, prompt, None, started)
        try:
            result = self.runner(
                args,
                cwd=artifact_dir,
                input=prompt,
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            _write_error(artifact_dir, "Codex CLI was not found on PATH.")
            raise RuntimeError("Codex CLI was not found on PATH.") from exc
        except subprocess.TimeoutExpired as exc:
            _write_error(artifact_dir, "Codex CLI JSON task timed out.")
            raise RuntimeError("Codex CLI JSON task timed out.") from exc

        _write_artifacts(artifact_dir, args, prompt, result, started)
        if result.returncode != 0:
            message = _failure_message(result)
            _write_error(artifact_dir, message)
            raise RuntimeError(message)

        try:
            if not final_message_path.exists():
                raise RuntimeError("Codex CLI did not write final message output.")
            json_text = _extract_json_payload(final_message_path.read_text(encoding="utf-8"))
            return output_model.model_validate_json(json_text)
        except (OSError, RuntimeError, ValueError, ValidationError) as exc:
            _write_error(artifact_dir, str(exc))
            raise


def _extract_json_payload(raw_output: str) -> str:
    match = re.search(r"<json>\s*(.*?)\s*</json>", raw_output, flags=re.DOTALL | re.IGNORECASE)
    if match is not None:
        return match.group(1).strip()
    payload = raw_output.strip()
    if not payload:
        raise ValueError("Codex CLI returned empty output.")
    json.loads(payload)
    return payload


def _write_artifacts(
    artifact_dir: Path,
    args: list[str],
    prompt: str,
    result: subprocess.CompletedProcess[str],
    started: float,
) -> None:
    (artifact_dir / "raw_output.txt").write_text(result.stdout or "", encoding="utf-8")
    (artifact_dir / "stderr.log").write_text(result.stderr or "", encoding="utf-8")
    _write_command(artifact_dir, args, prompt, result.returncode, started)


def _write_command(
    artifact_dir: Path,
    args: list[str],
    prompt: str,
    returncode: int | None,
    started: float,
) -> None:
    command = {
        "args": args,
        "promptChars": len(prompt),
        "returncode": returncode,
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }
    (artifact_dir / "command.json").write_text(
        json.dumps(command, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _write_error(artifact_dir: Path, message: str) -> None:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (artifact_dir / "error.json").write_text(
        json.dumps({"error": message[:2000]}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _failure_message(result: subprocess.CompletedProcess[str]) -> str:
    detail = _json_event_error_message(result.stdout or "")
    detail = detail or (result.stderr or "").strip() or (result.stdout or "").strip()
    if not detail:
        detail = f"exit code {result.returncode}"
    # WHY: Codex 输出可能包含整段模型会话；错误摘要保留诊断线索但避免污染任务 artifact。
    return f"Codex CLI JSON task failed: {detail[:800]}"


def _json_event_error_message(raw_output: str) -> str:
    for line in raw_output.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        message = _event_message(event)
        if message:
            return message
    return ""


def _event_message(event: dict[str, object]) -> str:
    if event.get("type") == "error":
        message = event.get("message")
        if isinstance(message, str):
            return message.strip()
    if event.get("type") == "turn.failed":
        error = event.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str):
                return message.strip()
    return ""


def _default_codex_bin() -> str:
    # WHY: Windows App Execution Alias 可能不能从 Python 子进程启动；cmd wrapper 与终端行为一致。
    if os.name == "nt":
        return "codex.cmd"
    return "codex"
