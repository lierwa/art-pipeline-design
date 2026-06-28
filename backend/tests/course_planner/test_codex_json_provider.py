from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, ConfigDict, ValidationError

from art_pipeline.course_planner.codex_json_provider import CodexJsonProvider


class ExampleOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str


def test_codex_json_provider_extracts_json_block(tmp_path: Path) -> None:
    def runner(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        command = list(args[0])
        output_index = command.index("--output-last-message") + 1
        final_message_path = Path(command[output_index])
        final_message_path.write_text('<json>{"title":"浴室"}</json>', encoding="utf-8")
        assert "--output-schema" in command
        assert kwargs["cwd"] == tmp_path / "artifacts"
        return subprocess.CompletedProcess(
            args=["codex"],
            returncode=0,
            stdout='{"type":"thread.started","thread_id":"abc"}\n{"type":"turn.completed"}\n',
            stderr="diagnostic",
        )

    provider = CodexJsonProvider(codex_bin="codex", runner=runner)

    result = provider.run_json_task(
        prompt="return json",
        output_model=ExampleOutput,
        artifact_dir=tmp_path / "artifacts",
    )

    assert result == ExampleOutput(title="浴室")
    assert (tmp_path / "artifacts" / "raw_output.txt").read_text(encoding="utf-8") == (
        '{"type":"thread.started","thread_id":"abc"}\n{"type":"turn.completed"}\n'
    )
    assert (tmp_path / "artifacts" / "final_message.txt").read_text(encoding="utf-8") == (
        '<json>{"title":"浴室"}</json>'
    )
    assert (tmp_path / "artifacts" / "stderr.log").read_text(encoding="utf-8") == "diagnostic"
    command = json.loads((tmp_path / "artifacts" / "command.json").read_text(encoding="utf-8"))
    assert command["args"][0] == "codex"
    assert "--output-last-message" in command["args"]
    assert command["promptChars"] == len("return json")


def test_codex_json_provider_extracts_direct_json_from_final_message(tmp_path: Path) -> None:
    def runner(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        _ = kwargs
        command = list(args[0])
        output_index = command.index("--output-last-message") + 1
        Path(command[output_index]).write_text('{"title":"阳台"}', encoding="utf-8")
        return subprocess.CompletedProcess(
            args=["codex"],
            returncode=0,
            stdout='{"type":"turn.completed"}\n',
            stderr="",
        )

    provider = CodexJsonProvider(codex_bin="codex", runner=runner)

    result = provider.run_json_task(
        prompt="return json",
        output_model=ExampleOutput,
        artifact_dir=tmp_path / "artifacts",
    )

    assert result == ExampleOutput(title="阳台")


def test_codex_json_provider_rejects_invalid_schema(tmp_path: Path) -> None:
    def runner(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        _ = kwargs
        command = list(args[0])
        output_index = command.index("--output-last-message") + 1
        Path(command[output_index]).write_text('{"name":"wrong field"}', encoding="utf-8")
        return subprocess.CompletedProcess(
            args=["codex"],
            returncode=0,
            stdout='{"type":"turn.completed"}\n',
            stderr="",
        )

    provider = CodexJsonProvider(codex_bin="codex", runner=runner)

    with pytest.raises(ValidationError):
        provider.run_json_task(
            prompt="return json",
            output_model=ExampleOutput,
            artifact_dir=tmp_path / "artifacts",
        )

    assert (tmp_path / "artifacts" / "raw_output.txt").exists()
    assert (tmp_path / "artifacts" / "error.json").exists()
    assert (tmp_path / "artifacts" / "final_message.txt").exists()


def test_codex_json_provider_surfaces_json_error_event_before_stdin_notice(
    tmp_path: Path,
) -> None:
    def runner(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        _ = args
        _ = kwargs
        return subprocess.CompletedProcess(
            args=["codex"],
            returncode=1,
            stdout=(
                '{"type":"error","message":"{\\"error\\":'
                '{\\"code\\":\\"invalid_json_schema\\",'
                '\\"message\\":\\"Missing id\\"}}"}\n'
            ),
            stderr="Reading prompt from stdin...\n",
        )

    provider = CodexJsonProvider(codex_bin="codex", runner=runner)

    with pytest.raises(RuntimeError) as exc_info:
        provider.run_json_task(
            prompt="return json",
            output_model=ExampleOutput,
            artifact_dir=tmp_path / "artifacts",
        )

    assert "invalid_json_schema" in str(exc_info.value)
    assert "Missing id" in str(exc_info.value)


def test_codex_json_provider_rejects_missing_final_message_without_reusing_stale_file(
    tmp_path: Path,
) -> None:
    artifact_dir = tmp_path / "artifacts"
    artifact_dir.mkdir()
    (artifact_dir / "final_message.txt").write_text('{"title":"stale"}', encoding="utf-8")

    def runner(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        _ = args
        _ = kwargs
        return subprocess.CompletedProcess(
            args=["codex"],
            returncode=0,
            stdout='{"type":"turn.completed"}\n',
            stderr="",
        )

    provider = CodexJsonProvider(codex_bin="codex", runner=runner)

    with pytest.raises(RuntimeError, match="final message"):
        provider.run_json_task(
            prompt="return json",
            output_model=ExampleOutput,
            artifact_dir=artifact_dir,
        )

    assert not (artifact_dir / "final_message.txt").exists()
    assert (artifact_dir / "error.json").exists()


def test_codex_json_provider_removes_stale_error_after_success(tmp_path: Path) -> None:
    artifact_dir = tmp_path / "artifacts"
    artifact_dir.mkdir()
    (artifact_dir / "error.json").write_text('{"error":"stale"}', encoding="utf-8")

    def runner(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        _ = kwargs
        command = list(args[0])
        output_index = command.index("--output-last-message") + 1
        Path(command[output_index]).write_text('{"title":"阳台"}', encoding="utf-8")
        return subprocess.CompletedProcess(args=["codex"], returncode=0, stdout="{}", stderr="")

    provider = CodexJsonProvider(codex_bin="codex", runner=runner)

    provider.run_json_task(
        prompt="return json",
        output_model=ExampleOutput,
        artifact_dir=artifact_dir,
    )

    assert not (artifact_dir / "error.json").exists()


def test_codex_json_provider_clears_stale_stream_artifacts_on_launch_failure(
    tmp_path: Path,
) -> None:
    artifact_dir = tmp_path / "artifacts"
    artifact_dir.mkdir()
    (artifact_dir / "raw_output.txt").write_text("stale stdout", encoding="utf-8")
    (artifact_dir / "stderr.log").write_text("stale stderr", encoding="utf-8")

    def runner(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        _ = args
        _ = kwargs
        raise FileNotFoundError("missing codex")

    provider = CodexJsonProvider(codex_bin="codex", runner=runner)

    with pytest.raises(RuntimeError, match="not found"):
        provider.run_json_task(
            prompt="return json",
            output_model=ExampleOutput,
            artifact_dir=artifact_dir,
        )

    assert _optional_text(artifact_dir / "raw_output.txt") == ""
    assert _optional_text(artifact_dir / "stderr.log") == ""
    assert (artifact_dir / "command.json").exists()
    assert (artifact_dir / "error.json").exists()


def test_codex_json_provider_clears_stale_stream_artifacts_on_missing_output(
    tmp_path: Path,
) -> None:
    artifact_dir = tmp_path / "artifacts"
    artifact_dir.mkdir()
    (artifact_dir / "raw_output.txt").write_text("stale stdout", encoding="utf-8")
    (artifact_dir / "stderr.log").write_text("stale stderr", encoding="utf-8")

    def runner(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        _ = args
        _ = kwargs
        return subprocess.CompletedProcess(args=["codex"], returncode=0, stdout="", stderr="")

    provider = CodexJsonProvider(codex_bin="codex", runner=runner)

    with pytest.raises(RuntimeError, match="final message"):
        provider.run_json_task(
            prompt="return json",
            output_model=ExampleOutput,
            artifact_dir=artifact_dir,
        )

    assert (artifact_dir / "raw_output.txt").read_text(encoding="utf-8") == ""
    assert (artifact_dir / "stderr.log").read_text(encoding="utf-8") == ""


def _optional_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")
