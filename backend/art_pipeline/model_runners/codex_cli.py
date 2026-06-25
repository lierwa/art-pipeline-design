from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from art_pipeline.codex_assets import CodexAssetRequest


Runner = Callable[..., subprocess.CompletedProcess[str]]


class CodexCliAssetProvider:
    name = "codex_cli"

    def __init__(
        self,
        codex_bin: str | None = None,
        runner: Runner = subprocess.run,
        timeout_seconds: int = 900,
        sandbox: str | None = None,
        generated_images_root: Path | None = None,
    ) -> None:
        self.codex_bin = codex_bin or _default_codex_bin()
        self.runner = runner
        self.timeout_seconds = timeout_seconds
        self.sandbox = sandbox or _default_sandbox()
        self.generated_images_root = generated_images_root or _default_generated_images_root()

    def generate(self, request: CodexAssetRequest) -> dict[str, Any]:
        args = [
            self.codex_bin,
            "-a",
            "never",
            "exec",
            "--json",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            self.sandbox,
            "--cd",
            str(request.work_dir),
            "--image",
            *[str(path) for path in request.image_paths],
        ]
        model = os.getenv("ART_PIPELINE_CODEX_MODEL", "").strip()
        if model:
            args.extend(["--model", model])

        if self.runner is subprocess.run:
            return self._generate_streaming(args, request)
        return self._generate_with_runner(args, request)

    def _generate_with_runner(self, args: list[str], request: CodexAssetRequest) -> dict[str, Any]:
        started = time.monotonic()
        try:
            result = self.runner(
                args,
                cwd=request.work_dir,
                input=request.prompt,
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("Codex CLI was not found on PATH.") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Codex CLI image generation timed out.") from exc

        metadata = self._metadata_from_completed_result(args, request, result, started)
        _write_diagnostics(request.work_dir, args, request.prompt, result.stdout, result.stderr, metadata)
        if result.returncode != 0:
            raise RuntimeError(_failure_message(result))
        if not request.raw_output_path.exists():
            thread_id = metadata.get("codexThreadId")
            if thread_id:
                _copy_latest_thread_image(
                    self.generated_images_root,
                    str(thread_id),
                    request.raw_output_path,
                )
        if not request.raw_output_path.exists():
            raise RuntimeError("Codex CLI finished without creating codex_raw.png.")
        metadata["timing"]["rawOutputSeconds"] = _elapsed_seconds(started)
        return metadata

    def _generate_streaming(self, args: list[str], request: CodexAssetRequest) -> dict[str, Any]:
        started = time.monotonic()
        stdout_lines: list[str] = []
        stderr_lines: list[str] = []
        metadata: dict[str, Any] = {"timing": {"processStartedAt": time.time()}}
        try:
            process = subprocess.Popen(
                args,
                cwd=request.work_dir,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=os.name != "nt",
            )
        except FileNotFoundError as exc:
            raise RuntimeError("Codex CLI was not found on PATH.") from exc

        stdout_thread = _start_reader(process.stdout, stdout_lines)
        stderr_thread = _start_reader(process.stderr, stderr_lines)
        if process.stdin is not None:
            process.stdin.write(request.prompt)
            process.stdin.close()

        seen_stdout = 0
        thread_id: str | None = None
        stable_signature: tuple[str, int, int] | None = None
        stable_count = 0
        deadline = time.monotonic() + self.timeout_seconds
        try:
            while True:
                if time.monotonic() > deadline:
                    _terminate_process(process)
                    raise RuntimeError("Codex CLI image generation timed out.")

                new_lines = stdout_lines[seen_stdout:]
                seen_stdout = len(stdout_lines)
                thread_id = thread_id or _thread_id_from_json_lines(new_lines)
                if thread_id:
                    metadata["codexThreadId"] = thread_id
                    candidate = _latest_thread_image(self.generated_images_root, thread_id)
                    if candidate is not None:
                        signature = _file_signature(candidate)
                        if signature == stable_signature:
                            stable_count += 1
                        else:
                            stable_signature = signature
                            stable_count = 1
                        if stable_count >= 2:
                            request.raw_output_path.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copyfile(candidate, request.raw_output_path)
                            metadata["timing"]["rawOutputSeconds"] = _elapsed_seconds(started)
                            _terminate_process(process)
                            break

                if process.poll() is not None:
                    if thread_id and not request.raw_output_path.exists():
                        _copy_latest_thread_image(
                            self.generated_images_root,
                            thread_id,
                            request.raw_output_path,
                        )
                    metadata["timing"]["rawOutputSeconds"] = (
                        _elapsed_seconds(started) if request.raw_output_path.exists() else None
                    )
                    break
                time.sleep(0.5)
        finally:
            _join_reader(stdout_thread)
            _join_reader(stderr_thread)
            metadata["timing"]["processFinishedAt"] = time.time()
            metadata["timing"]["processSeconds"] = _elapsed_seconds(started)
            _write_diagnostics(
                request.work_dir,
                args,
                request.prompt,
                "".join(stdout_lines),
                "".join(stderr_lines),
                metadata,
            )

        if process.returncode not in {0, None} and not request.raw_output_path.exists():
            raise RuntimeError(_failure_message_from_text(process.returncode, "".join(stdout_lines), "".join(stderr_lines)))
        if not request.raw_output_path.exists():
            raise RuntimeError("Codex CLI finished without creating codex_raw.png.")
        return metadata

    def _metadata_from_completed_result(
        self,
        args: list[str],
        request: CodexAssetRequest,
        result: subprocess.CompletedProcess[str],
        started: float,
    ) -> dict[str, Any]:
        _ = args
        _ = request
        thread_id = _thread_id_from_json_lines((result.stdout or "").splitlines())
        return {
            "codexThreadId": thread_id,
            "timing": {
                "processSeconds": _elapsed_seconds(started),
                "rawOutputSeconds": None,
            },
        }


def _failure_message(result: subprocess.CompletedProcess[str]) -> str:
    stderr = (result.stderr or "").strip()
    stdout = (result.stdout or "").strip()
    detail = stderr or stdout or f"exit code {result.returncode}"
    # WHY: CLI 失败详情可能很长；API 只返回前缀，保留可诊断性同时避免把整段会话刷到前端。
    return f"Codex CLI image generation failed: {detail[:800]}"


def _failure_message_from_text(returncode: int | None, stdout: str, stderr: str) -> str:
    detail = stderr.strip() or stdout.strip() or f"exit code {returncode}"
    return f"Codex CLI image generation failed: {detail[:800]}"


def _thread_id_from_json_lines(lines: list[str]) -> str | None:
    for line in lines:
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if payload.get("type") == "thread.started":
            thread_id = payload.get("thread_id")
            if isinstance(thread_id, str) and thread_id:
                return thread_id
    return None


def _copy_latest_thread_image(generated_root: Path, thread_id: str, target: Path) -> None:
    candidate = _latest_thread_image(generated_root, thread_id)
    if candidate is None:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(candidate, target)


def _latest_thread_image(generated_root: Path, thread_id: str) -> Path | None:
    thread_dir = generated_root / thread_id
    if not thread_dir.exists():
        return None
    images = [path for path in thread_dir.glob("*.png") if path.is_file()]
    if not images:
        return None
    return max(images, key=lambda path: path.stat().st_mtime_ns)


def _file_signature(path: Path) -> tuple[str, int, int]:
    stat = path.stat()
    return (str(path), stat.st_size, stat.st_mtime_ns)


def _start_reader(stream: Any, target: list[str]) -> threading.Thread:
    def read_lines() -> None:
        if stream is None:
            return
        for line in stream:
            target.append(line)

    thread = threading.Thread(target=read_lines, daemon=True)
    thread.start()
    return thread


def _join_reader(thread: threading.Thread) -> None:
    thread.join(timeout=1)


def _terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    try:
        # WHY: Codex CLI 是一个 wrapper + vendor binary 进程树；按进程组终止可避免
        # raw 图已经落盘后仍留下继续总结/查文件的子进程。
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGTERM)
        else:
            process.terminate()
        process.wait(timeout=5)
    except Exception:
        process.kill()


def _write_diagnostics(
    work_dir: Path,
    args: list[str],
    prompt: str,
    stdout: str,
    stderr: str,
    metadata: dict[str, Any],
) -> None:
    work_dir.mkdir(parents=True, exist_ok=True)
    (work_dir / "codex_stdout.jsonl").write_text(stdout, encoding="utf-8")
    (work_dir / "codex_stderr.log").write_text(stderr, encoding="utf-8")
    (work_dir / "timing.json").write_text(json.dumps(metadata.get("timing", {}), indent=2), encoding="utf-8")
    command = {"args": args, "promptChars": len(prompt), "prompt": prompt}
    (work_dir / "codex_command.json").write_text(json.dumps(command, indent=2), encoding="utf-8")


def _elapsed_seconds(started: float) -> float:
    return round(time.monotonic() - started, 3)


def _default_sandbox() -> str:
    # WHY: Codex 的 Windows workspace sandbox 在当前桌面环境会挡住 nested CLI 的文件写入；
    # 生成 job 已被限制在独立目录，Windows 默认放宽以保证系统按钮可真实产出文件。
    if os.name == "nt":
        return "danger-full-access"
    return "workspace-write"


def _default_codex_bin() -> str:
    # WHY: Windows app execution aliases may resolve to a protected WindowsApps exe from Python;
    # npm's codex.cmd wrapper is the same CLI path PowerShell uses and is launchable from FastAPI.
    if os.name == "nt":
        return "codex.cmd"
    return "codex"


def _default_generated_images_root() -> Path:
    codex_home = os.getenv("CODEX_HOME", "").strip()
    base = Path(codex_home).expanduser() if codex_home else Path.home() / ".codex"
    return base / "generated_images"
