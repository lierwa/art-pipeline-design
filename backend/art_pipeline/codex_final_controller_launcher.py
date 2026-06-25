from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
from typing import Mapping
from uuid import uuid4

from art_pipeline.codex_final_sources import default_codex_generated_images_root
from art_pipeline.workspace.codex_final_tasks import CODEX_FINAL_LEASE_SECONDS


DEFAULT_CODEX_FINAL_CONTROLLER_COUNT = 3
DEFAULT_CODEX_FINAL_SUBAGENTS_PER_CONTROLLER = 6
WINDOWS_CODEX_EXECUTABLE_SUFFIXES = (".cmd", ".exe", ".bat")


class CodexFinalControllerLaunchError(RuntimeError):
    def __init__(self, message: str, *, started_count: int) -> None:
        super().__init__(message)
        self.started_count = started_count


@dataclass(frozen=True)
class CodexFinalControllerSettings:
    controller_count: int
    subagents_per_controller: int
    codex_command: str = "codex"


@dataclass(frozen=True)
class CodexFinalControllerCommand:
    command: str
    args: list[str]


@dataclass(frozen=True)
class CodexFinalControllerProcess:
    controller_id: str
    prompt_path: str
    events_path: str
    pid: int | None


def controller_settings_from_env(env: Mapping[str, str] | None = None) -> CodexFinalControllerSettings:
    source = env or os.environ
    return CodexFinalControllerSettings(
        controller_count=_positive_int(
            source.get("CODEX_FINAL_CONTROLLER_COUNT"),
            DEFAULT_CODEX_FINAL_CONTROLLER_COUNT,
        ),
        subagents_per_controller=_positive_int(
            source.get("CODEX_FINAL_SUBAGENTS_PER_CONTROLLER"),
            DEFAULT_CODEX_FINAL_SUBAGENTS_PER_CONTROLLER,
        ),
        codex_command=source.get("CODEX_FINAL_CODEX_COMMAND", "codex").strip() or "codex",
    )


def build_codex_final_controller_command(
    *,
    project_root: Path,
    prompt_path: Path,
    codex_command: str,
    subagents_per_controller: int,
) -> CodexFinalControllerCommand:
    return CodexFinalControllerCommand(
        command=codex_command,
        args=[
            "exec",
            "--json",
            "--ignore-user-config",
            "--ignore-rules",
            "--dangerously-bypass-approvals-and-sandbox",
            "-C",
            project_root.resolve().as_posix(),
            "-c",
            "features.multi_agent=true",
            "-c",
            f"agents.max_threads={subagents_per_controller}",
            "-",
        ],
    )


def _resolve_codex_command(
    command: str,
    *,
    env: Mapping[str, str] | None = None,
    platform_name: str | None = None,
) -> str:
    normalized = command.strip() or "codex"
    active_platform = platform_name or os.name
    if active_platform != "nt" or _has_path_separator(normalized) or Path(normalized).suffix:
        return normalized
    path_value = (env or os.environ).get("PATH", "")
    # WHY: npm 在 Windows 会同时放无后缀 shim 和 .cmd；Python Popen 可能先命中
    # 无后缀文件并报 WinError 5，显式偏向可执行后缀可保持 macOS/Linux 行为不变。
    for suffix in WINDOWS_CODEX_EXECUTABLE_SUFFIXES:
        resolved = _first_path_file(f"{normalized}{suffix}", path_value)
        if resolved is not None:
            return str(resolved)
    return normalized


def write_codex_final_controller_prompt(
    *,
    workspace_root: Path,
    task_id: str,
    controller_id: str,
    api_base_url: str,
    run_id: str | None,
    capacity: int,
) -> Path:
    controller_dir = _controller_dir(workspace_root, task_id, controller_id)
    controller_dir.mkdir(parents=True, exist_ok=True)
    prompt_path = controller_dir / "prompt.md"
    query = f"?runId={run_id}" if run_id else ""
    jobs_url = f"{api_base_url}/api/workspace/tasks/{task_id}/codex-final/jobs"
    claim_url = f"{jobs_url}/claim{query}"
    job_url_template = f"{jobs_url}/<jobId>"
    generated_images_root = default_codex_generated_images_root()
    claim_body = _compact_json(
        {
            "controllerId": controller_id,
            "capacity": capacity,
            "leaseSeconds": CODEX_FINAL_LEASE_SECONDS,
        }
    )
    heartbeat_body = (
        f'{{"controllerId":"{controller_id}","leaseToken":"<leaseToken>",'
        f'"phase":"agent_running","leaseSeconds":{CODEX_FINAL_LEASE_SECONDS}}}'
    )
    # WHY: Codex worker 的生命周期跟随 parent controller；controller 退出后 worker 可能被 abort。
    # 因此正常链路必须由 controller 等待 worker 完成并 ingest，backend recovery 只处理崩溃/迟到图片兜底。
    prompt_path.write_text(
        "\n".join(
            [
                "# Codex Final Controller",
                "",
                f"Controller id: {controller_id}",
                f"Workspace root: {workspace_root.resolve()}",
                f"Task id: {task_id}",
                f"API base URL: {api_base_url}",
                f"Run id: {run_id or '-'}",
                f"capacity: {capacity}",
                "",
                "You were dispatched as a machine subagent for this single controller job.",
                "Do not read skills, memories, AGENTS files, repository files, or documentation before claiming work.",
                "Your first action must be the claim request below.",
                "",
                "You are a Codex final controller, not an image worker.",
                "All local API calls must use curl with `--noproxy '*'` so localhost is not sent through shell proxies.",
                "Do not search the repository for API routes; the routes below are the authoritative controller contract.",
                "",
                "Loop until claim returns no jobs:",
                f"1. Claim jobs with: curl --noproxy '*' -sS -X POST '{claim_url}' "
                "-H 'Content-Type: application/json' "
                f"-d '{claim_body}'",
                f"2. For every claimed job, immediately heartbeat: curl --noproxy '*' -sS -X POST '{job_url_template}/heartbeat{query}' "
                "-H 'Content-Type: application/json' "
                f"-d '{heartbeat_body}'",
                "3. Spawn subagents for the claimed jobs, up to this controller capacity.",
                "4. Each spawn_agent prompt must include the exact line `Job: <jobId>` before any other job details.",
                "5. Each subagent must read the job prompt and visual brief, then use image generation only.",
                f"6. Ingest success: curl --noproxy '*' -sS -X POST '{job_url_template}/ingest{query}' "
                "-H 'Content-Type: application/json' "
                f"-d '{{\"controllerId\":\"{controller_id}\",\"leaseToken\":\"<leaseToken>\",\"selectedSourcePath\":\"<selected_source>\",\"qaNote\":\"<qa_note>\",\"codexThreadId\":\"<codex_thread_id>\"}}'",
                "7. If a worker returns `selected_source=unknown`, a nonexistent path, or an image-path error, "
                "do not fail immediately. Use that worker's receiver_thread_id as `<workerThreadId>` and inspect "
                f"`{generated_images_root}/<workerThreadId>/` for the newest `.png`; if it exists, ingest that path.",
                "8. If ingest rejects a worker-selected path because the file does not exist, run the same "
                "`generated_images/<workerThreadId>` lookup once before calling fail.",
                f"9. Report retryable failure only after generated_images lookup finds no file: curl --noproxy '*' -sS -X POST '{job_url_template}/fail{query}' "
                "-H 'Content-Type: application/json' "
                f"-d '{{\"controllerId\":\"{controller_id}\",\"leaseToken\":\"<leaseToken>\",\"error\":\"<error>\",\"retryable\":true}}'",
                "10. Close finished subagent threads before claiming more work.",
                "",
                "Subagent output contract:",
                "selected_source=<actual PNG path or unknown>",
                "qa_note=<one short sentence>",
                "codex_thread_id=<thread id if available>",
                "",
                "Controller-owned generated image fallback:",
                "- Store the receiver_thread_id returned by spawn_agent for each job.",
                "- Use receiver_thread_id as codexThreadId when the worker does not provide one.",
                f"- The fallback lookup root is `{generated_images_root}/<receiver_thread_id>/`.",
                "- Pick the newest `.png` file in that directory and pass it as selectedSourcePath.",
                "- Backend recovery also scans this root when controller leases expire or controller ingest never completes.",
                "",
                "Do not edit manifests, state.json, or final PNG files.",
                "Do not run local transparency/postprocess scripts.",
                "Do not start one Codex CLI per asset; this controller owns a rolling subagent pool.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return prompt_path


def start_codex_final_controllers(
    *,
    workspace_root: Path,
    task_id: str,
    api_base_url: str,
    run_id: str | None = None,
    settings: CodexFinalControllerSettings | None = None,
    project_root: Path | None = None,
) -> list[CodexFinalControllerProcess]:
    resolved_settings = settings or controller_settings_from_env()
    if resolved_settings.controller_count <= 0:
        return []
    if os.environ.get("PYTEST_CURRENT_TEST") and os.environ.get("CODEX_FINAL_ALLOW_TEST_CONTROLLER_LAUNCH") != "1":
        return []
    project = project_root or _project_root()
    codex_command = _resolve_codex_command(resolved_settings.codex_command)
    processes: list[CodexFinalControllerProcess] = []
    for index in range(1, resolved_settings.controller_count + 1):
        controller_id = _next_controller_id(index)
        prompt_path = write_codex_final_controller_prompt(
            workspace_root=workspace_root,
            task_id=task_id,
            controller_id=controller_id,
            api_base_url=api_base_url,
            run_id=run_id,
            capacity=resolved_settings.subagents_per_controller,
        )
        command = build_codex_final_controller_command(
            project_root=project,
            prompt_path=prompt_path,
            codex_command=codex_command,
            subagents_per_controller=resolved_settings.subagents_per_controller,
        )
        events_path = prompt_path.with_name("events.jsonl")
        # WHY: `codex exec [PROMPT]` 不会把文件路径当成 prompt 文件读取；
        # 用 `-` 走 stdin，避免 controller 只收到一个路径字符串后空转。
        with prompt_path.open("rb") as prompt, events_path.open("ab") as events:
            try:
                process = subprocess.Popen(  # noqa: S603 - command is configured local Codex CLI.
                    [command.command, *command.args],
                    cwd=project.resolve(),
                    env=_controller_environment(os.environ),
                    stdin=prompt,
                    stdout=events,
                    stderr=events,
                    start_new_session=os.name != "nt",
                )
            except OSError as exc:
                _write_controller_launch_failure_event(events_path, command, exc)
                message = (
                    f"Codex controller launch failed for {controller_id}: "
                    f"{type(exc).__name__}: {exc}"
                )
                raise CodexFinalControllerLaunchError(
                    message,
                    started_count=len(processes),
                ) from exc
        processes.append(
            CodexFinalControllerProcess(
                controller_id=controller_id,
                prompt_path=prompt_path.as_posix(),
                events_path=events_path.as_posix(),
                pid=process.pid,
            )
        )
    return processes


def _controller_dir(workspace_root: Path, task_id: str, controller_id: str) -> Path:
    return workspace_root / "tasks" / task_id / "controllers" / controller_id


def _next_controller_id(index: int) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    return f"controller_{timestamp}_{index}_{uuid4().hex[:8]}"


def _positive_int(raw: str | None, default: int) -> int:
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(0, value)


def _compact_json(payload: Mapping[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _has_path_separator(command: str) -> bool:
    return "/" in command or "\\" in command


def _first_path_file(filename: str, path_value: str) -> Path | None:
    for raw_directory in path_value.split(os.pathsep):
        directory = raw_directory.strip().strip('"')
        if not directory:
            continue
        candidate = Path(directory) / filename
        if candidate.is_file():
            return candidate
    return None


def _write_controller_launch_failure_event(
    events_path: Path,
    command: CodexFinalControllerCommand,
    error: OSError,
) -> None:
    payload = {
        "event": "controller_launch_failed",
        "command": [command.command, *command.args],
        "errorType": type(error).__name__,
        "error": str(error),
    }
    events_path.write_text(
        f"{json.dumps(payload, ensure_ascii=False)}\n",
        encoding="utf-8",
    )


def _controller_environment(source: Mapping[str, str]) -> dict[str, str]:
    env = dict(source)
    no_proxy_entries = _merged_no_proxy_entries(
        env.get("NO_PROXY") or env.get("no_proxy") or ""
    )
    no_proxy = ",".join(no_proxy_entries)
    # WHY: Codex CLI 需要外网访问模型服务，但 controller claim/heartbeat/ingest
    # 必须直连本机 FastAPI；只覆盖 no_proxy，避免破坏用户全局代理配置。
    env["NO_PROXY"] = no_proxy
    env["no_proxy"] = no_proxy
    return env


def _merged_no_proxy_entries(raw: str) -> list[str]:
    entries = [entry.strip() for entry in raw.split(",") if entry.strip()]
    for required in ("127.0.0.1", "localhost", "::1"):
        if required not in entries:
            entries.append(required)
    return entries


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]
