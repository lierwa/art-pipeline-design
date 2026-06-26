from __future__ import annotations

import argparse
import json
import shutil
import sys
import textwrap
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


PANEL_SIZE = (360, 300)
TEXT_PANEL_SIZE = (720, 300)
PADDING = 18
BACKGROUND = (9, 14, 24)
PANEL_BG = (13, 21, 34)
BORDER = (56, 78, 110)
TEXT = (232, 239, 250)
MUTED = (155, 170, 195)
FAIL = (244, 96, 108)
PASS = (90, 220, 150)


def write_codex_final_visual_audit(
    *,
    workspace_root: Path,
    element_id: str,
    output_path: Path,
    summary_path: Path | None = None,
    comparison_workspace_root: Path | None = None,
    generation_error: str | None = None,
) -> dict[str, Any]:
    element = _load_element(workspace_root, element_id)
    job_dir = _latest_job_dir(workspace_root, element_id)
    report = _read_quality_report(job_dir)
    status = _status_from_report(report, generation_error)
    image_paths = _audit_image_paths(
        workspace_root=workspace_root,
        element_id=element_id,
        job_dir=job_dir,
        comparison_workspace_root=comparison_workspace_root,
    )
    summary: dict[str, Any] = {
        "elementId": element_id,
        "name": str(element.get("label") or element.get("name") or element_id),
        "status": status,
        "qualityErrors": list(report.get("errors") or []),
        "qualityWarnings": list(report.get("warnings") or []),
        "metrics": dict(report.get("metrics") or {}),
        "jobDirPath": _posix(job_dir),
        "generationError": generation_error,
        "imagePaths": {key: _posix(path) if path else None for key, path in image_paths.items()},
    }
    _render_audit_sheet(summary, image_paths, output_path)
    if summary_path:
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary


def run_codex_final_visual_rerun(
    *,
    source_workspace_root: Path,
    element_id: str,
    work_root: Path,
    output_path: Path,
    summary_path: Path | None = None,
    prompt_hint: str | None = None,
    timeout_seconds: int = 900,
    overwrite_work_root: bool = True,
) -> dict[str, Any]:
    # WHY: 真实重跑必须隔离在临时副本里。否则一次失败的视觉验证会污染用户
    # 正在操作的 workspace，反而让回归定位变得更混乱。
    if work_root.exists() and overwrite_work_root:
        shutil.rmtree(work_root)
    if not work_root.exists():
        shutil.copytree(source_workspace_root, work_root)

    generation_error: str | None = None
    try:
        from art_pipeline.codex_assets import generate_codex_final_asset
        from art_pipeline.elements import WorkspaceState
        from art_pipeline.model_runners.codex_cli import CodexCliAssetProvider

        state = WorkspaceState.model_validate_json((work_root / "state.json").read_text(encoding="utf-8"))
        provider = CodexCliAssetProvider(timeout_seconds=timeout_seconds)
        next_state, _, _ = generate_codex_final_asset(
            work_root,
            state,
            element_id,
            provider,
            prompt_hint=prompt_hint,
        )
        (work_root / "state.json").write_text(next_state.model_dump_json(indent=2), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001 - visual harness must preserve evidence after failure.
        generation_error = str(exc)

    return write_codex_final_visual_audit(
        workspace_root=work_root,
        element_id=element_id,
        output_path=output_path,
        summary_path=summary_path,
        comparison_workspace_root=source_workspace_root,
        generation_error=generation_error,
    )


def _load_element(workspace_root: Path, element_id: str) -> dict[str, Any]:
    state_path = workspace_root / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    for element in state.get("elements", []):
        if element.get("id") == element_id:
            return dict(element)
    raise ValueError(f"Element {element_id} not found in {state_path}.")


def _latest_job_dir(workspace_root: Path, element_id: str) -> Path:
    job_root = workspace_root / "elements" / element_id / "codex_final" / "job"
    if not job_root.exists():
        raise ValueError(f"No Codex final job directory for {element_id}.")
    jobs = [path for path in job_root.iterdir() if path.is_dir()]
    if not jobs:
        raise ValueError(f"No Codex final jobs under {job_root}.")
    return max(jobs, key=lambda path: path.stat().st_mtime_ns)


def _read_quality_report(job_dir: Path) -> dict[str, Any]:
    report_path = job_dir / "quality_report.json"
    if not report_path.exists():
        return {"status": "missing_quality_report", "errors": [], "warnings": [], "metrics": {}}
    return json.loads(report_path.read_text(encoding="utf-8"))


def _status_from_report(report: dict[str, Any], generation_error: str | None) -> str:
    if generation_error:
        return "failed"
    status = str(report.get("status") or "unknown")
    return status


def _audit_image_paths(
    *,
    workspace_root: Path,
    element_id: str,
    job_dir: Path,
    comparison_workspace_root: Path | None,
) -> dict[str, Path | None]:
    current_final = workspace_root / "elements" / element_id / "codex_final" / "transparent_asset.png"
    old_final = None
    if comparison_workspace_root is not None:
        old_candidate = comparison_workspace_root / "elements" / element_id / "codex_final" / "transparent_asset.png"
        if old_candidate.exists():
            old_final = old_candidate
    if old_final is None and current_final.exists():
        old_final = current_final
    return {
        "source_crop": workspace_root / "elements" / element_id / "sam2_edge" / "source_crop.png",
        "mask_cutout": workspace_root / "elements" / element_id / "sam2_edge" / "transparent_asset.png",
        "previous_final": old_final,
        "codex_raw": job_dir / "codex_raw.png",
        "candidate": job_dir / "candidate_asset.png",
        "promoted_final": current_final if current_final.exists() else None,
    }


def _render_audit_sheet(
    summary: dict[str, Any],
    image_paths: dict[str, Path | None],
    output_path: Path,
) -> None:
    columns = 3
    rows = 3
    width = PADDING + columns * (PANEL_SIZE[0] + PADDING)
    height = PADDING + 46 + rows * (PANEL_SIZE[1] + PADDING)
    canvas = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    title = f"{summary['name']} | {summary['status']}"
    draw.text((PADDING, PADDING), title, fill=PASS if summary["status"] == "passed" else FAIL, font=_font(24))

    panels = [
        ("source_crop", "source_crop"),
        ("mask_cutout", "mask cutout"),
        ("previous_final", "previous final"),
        ("codex_raw", "new codex_raw"),
        ("candidate", "new candidate"),
        ("promoted_final", "promoted final"),
    ]
    start_y = PADDING + 46
    for index, (key, label) in enumerate(panels):
        x = PADDING + (index % columns) * (PANEL_SIZE[0] + PADDING)
        y = start_y + (index // columns) * (PANEL_SIZE[1] + PADDING)
        _draw_image_panel(canvas, draw, label, image_paths.get(key), (x, y))

    text_x = PADDING
    text_y = start_y + 2 * (PANEL_SIZE[1] + PADDING)
    _draw_text_panel(canvas, draw, _quality_text(summary), (text_x, text_y))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, format="PNG")


def _draw_image_panel(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    label: str,
    image_path: Path | None,
    origin: tuple[int, int],
) -> None:
    x, y = origin
    draw.rounded_rectangle((x, y, x + PANEL_SIZE[0], y + PANEL_SIZE[1]), radius=8, fill=PANEL_BG, outline=BORDER, width=2)
    draw.text((x + 12, y + 10), label, fill=TEXT, font=_font(18))
    image_box = (x + 12, y + 44, PANEL_SIZE[0] - 24, PANEL_SIZE[1] - 56)
    if image_path is None or not image_path.exists():
        draw.text((image_box[0], image_box[1]), "missing", fill=MUTED, font=_font(16))
        return
    with Image.open(image_path) as opened:
        image = opened.convert("RGBA")
    fitted = _fit_on_checkerboard(image, (image_box[2], image_box[3]))
    canvas.paste(fitted, (image_box[0], image_box[1]))


def _draw_text_panel(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    text: str,
    origin: tuple[int, int],
) -> None:
    x, y = origin
    draw.rounded_rectangle((x, y, x + TEXT_PANEL_SIZE[0], y + TEXT_PANEL_SIZE[1]), radius=8, fill=PANEL_BG, outline=BORDER, width=2)
    draw.text((x + 12, y + 10), "quality report", fill=TEXT, font=_font(18))
    wrapped: list[str] = []
    for line in text.splitlines():
        wrapped.extend(textwrap.wrap(line, width=78) or [""])
    draw.multiline_text((x + 12, y + 44), "\n".join(wrapped[:12]), fill=MUTED, font=_font(15), spacing=5)


def _quality_text(summary: dict[str, Any]) -> str:
    errors = ", ".join(summary.get("qualityErrors") or []) or "none"
    warnings = ", ".join(summary.get("qualityWarnings") or []) or "none"
    metrics = summary.get("metrics") or {}
    metric_lines = [
        f"{key}: {value}"
        for key, value in metrics.items()
        if key in {
            "candidateVisibleArea",
            "visibleAreaRatio",
            "visibleChromaResiduePixels",
            "backgroundAlphaPollutionPixels",
            "alphaIou",
            "visibleChangeRatio",
            "meanRgbaDelta",
            "hasCandidateAlpha",
        }
    ]
    error = summary.get("generationError")
    lines = [
        f"status: {summary.get('status')}",
        f"errors: {errors}",
        f"warnings: {warnings}",
        *metric_lines,
    ]
    if error:
        lines.append(f"generation_error: {error}")
    return "\n".join(lines)


def _fit_on_checkerboard(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    board = _checkerboard(size)
    image.thumbnail(size, Image.Resampling.LANCZOS)
    x = (size[0] - image.width) // 2
    y = (size[1] - image.height) // 2
    board.paste(image, (x, y), image)
    return board.convert("RGB")


def _checkerboard(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size, (18, 26, 40))
    draw = ImageDraw.Draw(image)
    cell = 14
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if ((x // cell) + (y // cell)) % 2 == 0:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(28, 38, 56))
    return image


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _posix(path: Path) -> str:
    return path.as_posix()


def _main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Run or render a Codex final visual audit sheet.")
    parser.add_argument("--workspace-root", required=True, type=Path)
    parser.add_argument("--element-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--summary", type=Path)
    parser.add_argument("--work-root", type=Path)
    parser.add_argument("--prompt-hint")
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--audit-only", action="store_true")
    args = parser.parse_args(argv)

    if args.audit_only:
        summary = write_codex_final_visual_audit(
            workspace_root=args.workspace_root,
            element_id=args.element_id,
            output_path=args.output,
            summary_path=args.summary,
        )
    else:
        if args.work_root is None:
            parser.error("--work-root is required unless --audit-only is set")
        summary = run_codex_final_visual_rerun(
            source_workspace_root=args.workspace_root,
            element_id=args.element_id,
            work_root=args.work_root,
            output_path=args.output,
            summary_path=args.summary,
            prompt_hint=args.prompt_hint,
            timeout_seconds=args.timeout_seconds,
        )
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if summary.get("status") == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
