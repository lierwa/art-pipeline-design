from __future__ import annotations

from pathlib import Path

import pytest

import art_pipeline.codex_final_controller_launcher as launcher
from art_pipeline.codex_final_controller_launcher import (
    _controller_environment,
    build_codex_final_controller_command,
    controller_settings_from_env,
    start_codex_final_controllers,
    write_codex_final_controller_prompt,
    CodexFinalControllerSettings,
)
from art_pipeline.codex_final_sources import default_codex_generated_images_root
from art_pipeline.workspace.codex_final_tasks import CODEX_FINAL_LEASE_SECONDS


def test_controller_settings_default_to_three_controllers_and_six_subagents() -> None:
    settings = controller_settings_from_env({})

    assert settings.controller_count == 3
    assert settings.subagents_per_controller == 6


def test_controller_command_uses_one_cli_controller_with_six_subagents(tmp_path: Path) -> None:
    command = build_codex_final_controller_command(
        project_root=tmp_path / "repo",
        prompt_path=tmp_path / "workspace" / "tasks" / "task_a" / "controllers" / "controller-a" / "prompt.md",
        codex_command="codex",
        subagents_per_controller=6,
    )

    assert command.command == "codex"
    assert command.args[:10] == [
        "exec",
        "--json",
        "--ignore-user-config",
        "--ignore-rules",
        "--dangerously-bypass-approvals-and-sandbox",
        "-C",
        (tmp_path / "repo").as_posix(),
        "-c",
        "features.multi_agent=true",
        "-c",
    ]
    assert "agents.max_threads=6" in command.args
    assert command.args[-1] == "-"


def test_windows_codex_command_resolution_prefers_cmd_shim_over_extensionless_shim(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "codex").write_text("npm shim without Windows executable suffix", encoding="utf-8")
    (bin_dir / "codex.cmd").write_text("@echo off\r\n", encoding="utf-8")

    resolver = getattr(launcher, "_resolve_codex_command", lambda command, **_kwargs: command)
    resolved = resolver(
        "codex",
        env={"PATH": str(bin_dir)},
        platform_name="nt",
    )

    assert resolved == str(bin_dir / "codex.cmd")


def test_controller_launch_failure_is_written_to_events(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CODEX_FINAL_ALLOW_TEST_CONTROLLER_LAUNCH", "1")

    def fake_popen(*_args, **_kwargs):
        raise PermissionError("denied")

    monkeypatch.setattr(launcher.subprocess, "Popen", fake_popen)
    launch_error = getattr(launcher, "CodexFinalControllerLaunchError", RuntimeError)

    with pytest.raises(launch_error):
        start_codex_final_controllers(
            workspace_root=tmp_path / "workspace",
            task_id="task_202606240000000000_codex-final-batch",
            api_base_url="http://127.0.0.1:8766",
            settings=CodexFinalControllerSettings(
                controller_count=1,
                subagents_per_controller=6,
                codex_command="codex",
            ),
            project_root=tmp_path / "repo",
        )

    events_paths = list((tmp_path / "workspace").glob("tasks/*/controllers/*/events.jsonl"))
    assert len(events_paths) == 1
    events = events_paths[0].read_text(encoding="utf-8")
    assert "controller_launch_failed" in events
    assert "denied" in events


def test_controller_prompt_contains_claim_and_subagent_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generated_root = tmp_path / "generated-images"
    monkeypatch.setenv("CODEX_GENERATED_IMAGES_ROOT", str(generated_root))
    prompt_path = write_codex_final_controller_prompt(
        workspace_root=tmp_path / "workspace",
        task_id="task_202606240000000000_codex-final-batch",
        controller_id="controller-a",
        api_base_url="http://127.0.0.1:8766",
        run_id="run_demo",
        capacity=6,
    )

    prompt = prompt_path.read_text(encoding="utf-8")
    assert "/api/workspace/tasks/task_202606240000000000_codex-final-batch/codex-final/jobs/claim" in prompt
    assert "controller-a" in prompt
    assert "capacity: 6" in prompt
    assert "Do not read skills, memories, AGENTS files, repository files, or documentation before claiming work." in prompt
    assert "Your first action must be the claim request below." in prompt
    assert "curl --noproxy '*'" in prompt
    assert "Do not search the repository for API routes" in prompt
    assert "/api/workspace/tasks/task_202606240000000000_codex-final-batch/codex-final/jobs/<jobId>/heartbeat" in prompt
    assert "/api/workspace/tasks/task_202606240000000000_codex-final-batch/codex-final/jobs/<jobId>/fail" in prompt
    assert f'"leaseSeconds":{CODEX_FINAL_LEASE_SECONDS}' in prompt
    assert "/api/workspace/tasks/task_202606240000000000_codex-final-batch/codex-final/jobs/<jobId>/ingest" in prompt
    assert "Loop until claim returns no jobs" in prompt
    assert "selected_source=<actual PNG path or unknown>" in prompt
    assert "Controller-owned generated image fallback" in prompt
    assert "Use receiver_thread_id as codexThreadId" in prompt
    assert "Pick the newest `.png` file" in prompt
    assert "Close finished subagent threads before claiming more work" in prompt
    assert "Job: <jobId>" in prompt
    assert str(default_codex_generated_images_root()) in prompt
    assert "Spawn subagents" in prompt
    assert "Do not edit manifests, state.json, or final PNG files" in prompt
    assert "Do not wait for worker completion" not in prompt
    assert "Do not call ingest" not in prompt
    assert "After every claimed job has a receiver_thread_id" not in prompt
    assert "Backend-owned generated image recovery" not in prompt


def test_controller_prompt_does_not_use_detached_worker_handoff_as_primary_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CODEX_GENERATED_IMAGES_ROOT", str(tmp_path / "generated-images"))
    prompt_path = write_codex_final_controller_prompt(
        workspace_root=tmp_path / "workspace",
        task_id="task_202606240000000000_codex-final-batch",
        controller_id="controller-a",
        api_base_url="http://127.0.0.1:8766",
        run_id="run_demo",
        capacity=6,
    )

    prompt = prompt_path.read_text(encoding="utf-8")
    detached_worker_phrases = (
        "Do not wait for worker completion",
        "Do not call ingest",
        "Backend recovery will materialize",
        "After every claimed job has a receiver_thread_id",
        "this controller only dispatches subagents",
    )

    assert "spawn_agent prompt must include the exact line `Job: <jobId>`" in prompt
    assert "/codex-final/jobs/<jobId>/ingest" in prompt
    assert "Controller-owned generated image fallback" in prompt
    for phrase in detached_worker_phrases:
        assert phrase not in prompt


def test_controller_environment_preserves_proxy_but_bypasses_localhost() -> None:
    env = _controller_environment({"HTTPS_PROXY": "http://127.0.0.1:7890", "NO_PROXY": "example.com"})

    assert env["HTTPS_PROXY"] == "http://127.0.0.1:7890"
    assert env["NO_PROXY"] == "example.com,127.0.0.1,localhost,::1"
    assert env["no_proxy"] == "example.com,127.0.0.1,localhost,::1"
