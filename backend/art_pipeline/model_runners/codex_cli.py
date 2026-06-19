from __future__ import annotations

import os
import subprocess
from collections.abc import Callable
from pathlib import Path

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
    ) -> None:
        self.codex_bin = codex_bin or _default_codex_bin()
        self.runner = runner
        self.timeout_seconds = timeout_seconds
        self.sandbox = sandbox or _default_sandbox()

    def generate(self, request: CodexAssetRequest) -> None:
        args = [
            self.codex_bin,
            "-a",
            "never",
            "exec",
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

        if result.returncode != 0:
            raise RuntimeError(_failure_message(result))
        if not Path(request.output_path).exists():
            raise RuntimeError("Codex CLI finished without writing final_asset.png.")


def _failure_message(result: subprocess.CompletedProcess[str]) -> str:
    stderr = (result.stderr or "").strip()
    stdout = (result.stdout or "").strip()
    detail = stderr or stdout or f"exit code {result.returncode}"
    # WHY: CLI 失败详情可能很长；API 只返回前缀，保留可诊断性同时避免把整段会话刷到前端。
    return f"Codex CLI image generation failed: {detail[:800]}"


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
