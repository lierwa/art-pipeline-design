# Art Pipeline V2 Extraction-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the demo as an extraction-first image-splitting pipeline where source pixels are preserved and Codex only completes explicitly marked missing regions.

**Architecture:** Python owns deterministic filesystem contracts, mask processing, RGBA extraction, repair-task generation, QA, export, and the local annotation API. The first build proves the manual annotation loop end to end; model proposals are optional adapters so SAM2/GroundingDINO setup cannot block the core workflow.

**Tech Stack:** Python 3.11, FastAPI, Pillow, OpenCV, numpy, pydantic, pytest, optional SAM2/GroundingDINO adapters.

---

## Why This Plan Is Compact

The previous plan was too mechanical: 10 tasks and 62 checkbox steps, with simple scaffold work and complex QA/export work all forced through the same verbose TDD pattern.

This version uses 5 execution tasks:

| Task | Complexity | Purpose |
|---|---:|---|
| 1. Reset And Scaffold | Simple | Remove old runtime, create Python package |
| 2. Core Extraction Contracts | Complex | Run state, annotations, masks, source-pixel extraction |
| 3. Codex Repair, QA, Export | Complex | Repair task folders, preserve/missing-mask QA, export |
| 4. Local Annotation API/UI | Medium | Manual mask authoring and missing-mask editing |
| 5. Demo Verification | Medium | Real demo run and final documentation |

Simple tasks use direct implementation plus smoke tests. Complex tasks use focused tests first because they protect important invariants.

## Scope

Replace the old Node generation-first demo. Existing runtime code, generated runs, obsolete generated outputs, and package files may be removed. Keep:

- `source-demo/cat-bathroom-core-scene-v5.png`, moving the existing demo image there if needed;
- `docs/superpowers/specs/2026-06-16-art-pipeline-v2-extraction-first-design.md`;
- this plan.

The first implementation must support:

```text
source image
  -> run folder
  -> manual annotation masks
  -> refined masks
  -> transparent source-pixel assets
  -> Codex repair task folders for needs_completion assets
  -> QA of repaired assets
  -> export manifest, assets, masks, previews, QA report
```

Automatic proposals are a fallback contract in this pass. If SAM2/GroundingDINO are unavailable, the system still works through manual annotation.

## Target File Structure

```text
D:\work\art-pipeline-v2-demo
  pyproject.toml
  README.md
  source-demo/
    cat-bathroom-core-scene-v5.png
  src/
    art_pipeline/
      __init__.py
      __main__.py
      cli.py
      paths.py
      json_io.py
      image_io.py
      run_store.py
      annotations.py
      masks.py
      extraction.py
      repair_tasks.py
      qa.py
      exporter.py
      proposals.py
      api/
        __init__.py
        app.py
      web/
        annotation-ui/
          index.html
          app.js
          styles.css
  tests/
    helpers.py
    test_scaffold.py
    test_core_extraction.py
    test_repair_export.py
    test_api.py
    test_end_to_end.py
```

## Core Contracts

These contracts must remain stable across tasks.

### Run State

`runs/<run_id>/run.json`:

```json
{
  "schema": "art-pipeline-v2-run@extraction-first",
  "runId": "cat_bathroom_demo",
  "source": {
    "path": "source/original.png",
    "sha256": "<hash>",
    "width": 768,
    "height": 768
  },
  "stages": {
    "ingest": "complete",
    "propose": "pending",
    "annotate": "pending",
    "refineMasks": "pending",
    "extract": "pending",
    "repairTasks": "pending",
    "qa": "pending",
    "export": "pending"
  }
}
```

### Annotation Asset

`runs/<run_id>/annotations/assets.json`:

```json
{
  "schema": "art-pipeline-v2-annotations@extraction-first",
  "assets": [
    {
      "id": "cat",
      "name": "Cat",
      "mode": "needs_completion",
      "bbox": { "x": 110, "y": 500, "w": 220, "h": 170 },
      "canvas": { "x": 90, "y": 480, "w": 260, "h": 220 },
      "mask": "annotations/masks/cat.png",
      "layer": 80,
      "notes": "Complete only marked missing region."
    }
  ]
}
```

`canvas` must contain `bbox`. For `needs_completion`, extraction must use `canvas`, not the tight visible-pixel bbox, so Codex has space to complete missing regions.

### Codex Repair Folder

```text
runs/<run_id>/repairs/<asset_id>/
  source_crop.png
  scene_context.png
  incomplete_asset.png
  preserve_mask.png
  missing_mask.png
  guide_overlay.png
  repair_prompt.md
  completed_asset.png
  repair_report.json
  qa_report.json
```

`preserve_mask.png` defines pixels Codex must not modify. `missing_mask.png` defines the only pixels Codex may fill.

## Task 1: Reset And Scaffold

**Complexity:** Simple

**Purpose:** remove the obsolete runtime and create a Python package that can run with `python -m art_pipeline`.

**Files:**
- Remove old Node/demo runtime: `package.json`, `package-lock.json`, `node_modules`, old `src`, old `test`, old `runs`, old `outputs`, old `config`.
- Create: `pyproject.toml`
- Create: `src/art_pipeline/__init__.py`
- Create: `src/art_pipeline/__main__.py`
- Create: `src/art_pipeline/cli.py`
- Create: `tests/test_scaffold.py`

- [ ] Move the demo image to `source-demo/cat-bathroom-core-scene-v5.png`.

- [ ] Delete obsolete runtime files and create the package scaffold.

`pyproject.toml` must include:

```toml
[project]
name = "art-pipeline-v2-demo"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn>=0.30.0",
  "pillow>=10.4.0",
  "opencv-python>=4.10.0.84",
  "numpy>=2.0.0",
  "pydantic>=2.8.0"
]

[project.optional-dependencies]
dev = ["pytest>=8.2.0", "httpx>=0.27.0"]

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

- [ ] Add a CLI help smoke test.

`tests/test_scaffold.py` must assert:

```python
import subprocess
import sys


def test_module_help_runs():
    result = subprocess.run(
        [sys.executable, "-m", "art_pipeline", "--help"],
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0
    assert "Art Pipeline V2" in result.stdout
```

- [ ] Verify:

```powershell
python -m pip install -e ".[dev]"
python -m pytest tests/test_scaffold.py -q
```

- [ ] Commit:

```powershell
git add -A
git commit -m "Scaffold extraction-first Python pipeline"
```

## Task 2: Core Extraction Contracts

**Complexity:** Complex

**Purpose:** implement run state, annotation validation, mask refinement, and source-pixel extraction.

**Files:**
- Create: `src/art_pipeline/paths.py`
- Create: `src/art_pipeline/json_io.py`
- Create: `src/art_pipeline/image_io.py`
- Create: `src/art_pipeline/run_store.py`
- Create: `src/art_pipeline/annotations.py`
- Create: `src/art_pipeline/masks.py`
- Create: `src/art_pipeline/extraction.py`
- Modify: `src/art_pipeline/cli.py`
- Create: `tests/helpers.py`
- Create: `tests/test_core_extraction.py`

- [ ] Write focused tests before implementation.

`tests/test_core_extraction.py` must cover:

- `create_run()` copies the source PNG to `runs/<id>/source/original.png`;
- unsafe run ids such as `../bad` are rejected;
- annotation assets require safe ids, valid modes, source-sized masks, and `canvas` containing `bbox`;
- `needs_completion` assets must leave canvas space beyond the visible bbox;
- polygon masks rasterize at source image size;
- mask refinement removes tiny noise and preserves meaningful regions;
- extraction outputs an RGBA PNG using `canvas`;
- extraction preserves source RGB values under the mask and transparent alpha outside it.

- [ ] Implement shared utilities.

Required function signatures:

```python
# paths.py
def validate_id(value: str, label: str) -> str: ...
def run_dir(project_root: Path, run_id: str) -> Path: ...

# json_io.py
def read_json(path: Path) -> Any: ...
def write_json(path: Path, value: Any) -> None: ...

# image_io.py
def sha256_file(path: Path) -> str: ...
def image_dimensions(path: Path) -> tuple[int, int]: ...
def require_png(path: Path) -> None: ...
```

- [ ] Implement run store and ingest CLI.

Required functions:

```python
def create_run(project_root: Path, run_id: str, source: Path) -> dict[str, Any]: ...
def load_run(project_root: Path, run_id: str) -> dict[str, Any]: ...
def save_run(project_root: Path, run_id: str, run: dict[str, Any]) -> None: ...
def update_stage(project_root: Path, run_id: str, stage: str, status: str) -> None: ...
```

CLI:

```powershell
python -m art_pipeline ingest --source source-demo/cat-bathroom-core-scene-v5.png --run cat_bathroom_demo
```

- [ ] Implement annotation models and mask authoring helpers.

Use pydantic models:

```python
AssetMode = Literal["visible_only", "needs_completion", "completed_by_codex", "rejected"]

class Canvas(BaseModel):
    x: int
    y: int
    w: int
    h: int

class AnnotationAsset(BaseModel):
    id: str
    name: str
    mode: AssetMode
    bbox: Canvas
    canvas: Canvas
    mask: str
    layer: int
    notes: str = ""

class AnnotationSet(BaseModel):
    schema: str = "art-pipeline-v2-annotations@extraction-first"
    assets: list[AnnotationAsset]
```

Required helpers:

```python
def validate_annotation_set(annotations: AnnotationSet, image_size: tuple[int, int]) -> None: ...
def load_annotation_set(path: Path) -> AnnotationSet: ...
def write_annotation_set(path: Path, annotations: AnnotationSet) -> None: ...
def rasterize_polygon_mask(path: Path, image_size: tuple[int, int], points: list[tuple[int, int]]) -> None: ...
```

- [ ] Implement mask refinement and extraction.

Required functions:

```python
def validate_mask_size(path: Path, image_size: tuple[int, int]) -> None: ...
def refine_mask(source: Path, output: Path, image_size: tuple[int, int], min_region_area: int = 16) -> dict[str, Any]: ...
def extract_asset(source_image: Path, mask_path: Path, asset: AnnotationAsset, output: Path) -> dict[str, Any]: ...
```

Extraction must crop by `asset.canvas`, apply the cropped mask as alpha, and reject empty visible assets.

- [ ] Add CLI commands:

```powershell
python -m art_pipeline validate-annotations --run <run_id>
python -m art_pipeline refine-masks --run <run_id>
python -m art_pipeline extract --run <run_id>
```

- [ ] Verify:

```powershell
python -m pytest tests/test_core_extraction.py tests/test_scaffold.py -q
```

- [ ] Commit:

```powershell
git add src/art_pipeline tests
git commit -m "Add extraction core contracts"
```

## Task 3: Codex Repair, QA, And Export

**Complexity:** Complex

**Purpose:** create repair task folders, validate Codex outputs, and export final assets with provenance.

**Files:**
- Create: `src/art_pipeline/repair_tasks.py`
- Create: `src/art_pipeline/qa.py`
- Create: `src/art_pipeline/exporter.py`
- Modify: `src/art_pipeline/cli.py`
- Create: `tests/test_repair_export.py`

- [ ] Write focused tests before implementation.

`tests/test_repair_export.py` must cover:

- repair tasks are created only for `needs_completion` assets;
- repair task folder contains `source_crop.png`, `scene_context.png`, `incomplete_asset.png`, `preserve_mask.png`, `missing_mask.png`, `guide_overlay.png`, `repair_prompt.md`;
- missing `missing_mask.png` fails repair task creation;
- QA passes when Codex changes pixels only inside `missing_mask`;
- QA fails when preserved pixels change;
- QA fails when pixels are generated outside `missing_mask`;
- export uses `completed_asset.png` only after QA passes;
- export refuses failed repairs;
- visible-only assets export from `assets/incomplete`.

- [ ] Implement repair task creation.

Required function:

```python
def create_repair_tasks(base: Path) -> list[dict[str, Any]]: ...
```

The generated `repair_prompt.md` must include these exact constraints:

```text
Preserve every visible pixel inside preserve_mask.png.
Modify only pixels inside missing_mask.png.
Do not redraw the whole object.
Keep transparent background outside the object.
Output completed_asset.png with the same size as incomplete_asset.png.
Write repair_report.json.
```

- [ ] Implement repair QA.

Required function:

```python
def validate_repair_output(
    folder: Path,
    asset_id: str,
    preserve_tolerance: int = 2,
    warn_ratio: float = 0.15,
    fail_ratio: float = 0.30,
) -> dict[str, Any]: ...
```

QA report fields:

```json
{
  "schema": "art-pipeline-v2-qa-report@extraction-first",
  "assetId": "cat",
  "status": "pass",
  "issues": [],
  "changedPreservePixels": 0,
  "pixelsOutsideMissingMask": 0,
  "generatedPixels": 12,
  "generatedAreaRatio": 0.08
}
```

`requires_human_approval` is a warning issue only. Other issues fail the asset.

- [ ] Implement export.

Required function:

```python
def export_run(base: Path) -> dict[str, Any]: ...
```

Export outputs:

```text
export/assets/<asset_id>.png
export/masks/<asset_id>.png
export/manifest.json
export/level.json
export/contact_sheet.png
export/qa_report.json
```

`manifest.json` must record `mode`, `sourceAsset`, `finalAsset`, `sourcePixelsPreserved`, `generatedAreaRatio`, and `requiresHumanApproval`.

- [ ] Add CLI commands:

```powershell
python -m art_pipeline create-repair-tasks --run <run_id>
python -m art_pipeline validate --run <run_id>
python -m art_pipeline export --run <run_id>
```

- [ ] Verify:

```powershell
python -m pytest tests/test_repair_export.py tests/test_core_extraction.py -q
```

- [ ] Commit:

```powershell
git add src/art_pipeline tests
git commit -m "Add Codex repair QA and export"
```

## Task 4: Local Annotation API And Minimal UI

**Complexity:** Medium

**Purpose:** provide a local browser workflow for manual asset polygons, annotation saving, and missing-mask authoring.

**Files:**
- Create: `src/art_pipeline/api/__init__.py`
- Create: `src/art_pipeline/api/app.py`
- Create: `src/art_pipeline/web/annotation-ui/index.html`
- Create: `src/art_pipeline/web/annotation-ui/app.js`
- Create: `src/art_pipeline/web/annotation-ui/styles.css`
- Create: `src/art_pipeline/proposals.py`
- Modify: `src/art_pipeline/cli.py`
- Create: `tests/test_api.py`

- [ ] Write API tests.

`tests/test_api.py` must cover:

- `GET /api/runs/{run_id}/source` returns the source PNG;
- `POST /api/runs/{run_id}/masks/polygon` writes `annotations/masks/<asset_id>.png`;
- `PUT /api/runs/{run_id}/annotations` validates and writes `annotations/assets.json`;
- `POST /api/runs/{run_id}/repairs/{asset_id}/missing-mask` writes a canvas-sized `missing_mask.png`;
- `python -m art_pipeline propose --run <run_id>` writes a fallback `proposals/proposals.json` when no model is configured.

- [ ] Implement FastAPI app.

Required endpoint behavior:

```text
GET  /api/runs/{run_id}/source
PUT  /api/runs/{run_id}/annotations
POST /api/runs/{run_id}/masks/polygon
POST /api/runs/{run_id}/repairs/{asset_id}/missing-mask
```

`create_app(project_root: Path) -> FastAPI` must mount the static UI at `/ui`.

- [ ] Implement minimal UI.

The UI must be able to:

- load the source image for a run id;
- click polygon points on the canvas;
- save the polygon as an annotation mask;
- add or replace an asset in an in-memory asset list;
- save all annotations;
- save the current polygon as a missing mask relative to the selected asset canvas.

This UI is intentionally utilitarian. It only needs to be good enough to drive the demo.

- [ ] Implement proposal fallback.

Required function:

```python
def generate_proposals(base: Path) -> dict[str, Any]: ...
```

If no model is configured, write:

```json
{
  "schema": "art-pipeline-v2-proposals@extraction-first",
  "status": "manual_annotation_required",
  "reason": "No local proposal model is configured; use the annotation UI to define assets.",
  "proposals": []
}
```

- [ ] Add CLI commands:

```powershell
python -m art_pipeline propose --run <run_id>
python -m art_pipeline serve --port 8765
```

- [ ] Verify:

```powershell
python -m pytest tests/test_api.py tests/test_core_extraction.py tests/test_repair_export.py -q
python -m art_pipeline serve --port 8765
```

Open `http://127.0.0.1:8765/ui/` and confirm the UI loads. Stop the server after the check.

- [ ] Commit:

```powershell
git add src/art_pipeline tests
git commit -m "Add local annotation API and UI"
```

## Task 5: Demo Verification And Documentation

**Complexity:** Medium

**Purpose:** prove the complete manual extraction and Codex repair loop works on a fixture and document how to run the real demo.

**Files:**
- Create: `tests/test_end_to_end.py`
- Create: `README.md`
- Update as needed: any modules touched by integration bugs discovered during this task.

- [ ] Add an automated end-to-end fixture test.

The test must:

1. create a run from a synthetic PNG;
2. rasterize at least one annotation mask;
3. mark the asset `needs_completion`;
4. refine mask and extract asset;
5. create a canvas-sized `missing_mask`;
6. generate repair tasks;
7. simulate a Codex `completed_asset.png` that edits only inside `missing_mask`;
8. validate repair output;
9. export the pack.

Expected final assertions:

```python
assert report["status"] == "pass"
assert result["assetCount"] == 1
assert (base / "export" / "assets" / "asset_001.png").exists()
assert (base / "export" / "manifest.json").exists()
```

- [ ] Write README with the real demo flow.

The README must include:

```powershell
python -m pip install -e ".[dev]"
python -m art_pipeline ingest --source source-demo/cat-bathroom-core-scene-v5.png --run cat_bathroom_demo
python -m art_pipeline propose --run cat_bathroom_demo
python -m art_pipeline serve --port 8765
python -m art_pipeline validate-annotations --run cat_bathroom_demo
python -m art_pipeline refine-masks --run cat_bathroom_demo
python -m art_pipeline extract --run cat_bathroom_demo
python -m art_pipeline create-repair-tasks --run cat_bathroom_demo
python -m art_pipeline validate --run cat_bathroom_demo
python -m art_pipeline export --run cat_bathroom_demo
```

It must also explain that Codex reads each `repair_prompt.md` and writes `completed_asset.png` plus `repair_report.json`.

- [ ] Run all automated tests:

```powershell
python -m pytest -q
```

- [ ] Run the real demo through at least asset extraction.

Required evidence:

```text
runs/cat_bathroom_demo/source/original.png
runs/cat_bathroom_demo/annotations/assets.json
runs/cat_bathroom_demo/assets/incomplete/*.png
runs/cat_bathroom_demo/repairs/<asset_id>/repair_prompt.md
runs/cat_bathroom_demo/export/manifest.json
runs/cat_bathroom_demo/export/contact_sheet.png
```

If the real Codex repair image is not produced during this task, export visible-only assets and leave repair task folders ready for Codex completion. Do not fake a completed repair for the real demo.

- [ ] Commit:

```powershell
git add README.md tests src/art_pipeline
git commit -m "Verify extraction-first demo loop"
```

## Final Acceptance

The implementation is accepted when:

- old generation-first asset creation is gone;
- source image ingestion creates a valid run;
- annotation data defines asset units, canvas, mode, layer, and mask;
- source-pixel extraction creates transparent PNG assets;
- `needs_completion` assets produce Codex repair task folders;
- QA rejects Codex outputs that alter preserved pixels or write outside `missing_mask`;
- export records provenance and generated area ratio;
- a local UI can create masks and missing masks;
- all tests pass with `python -m pytest -q`;
- no ComfyUI, Diffusers, or OpenAI API key is required.
