# Art Pipeline V2 Extraction-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the demo as an extraction-first image-splitting pipeline where source pixels are preserved and Codex only completes explicitly marked missing regions.

**Architecture:** Python owns deterministic run state, mask contracts, source-pixel extraction, repair-task generation, QA, export, and the local annotation API. The first implementation proves the manual annotation loop end to end; segmentation models are isolated behind adapters so large model setup cannot block the core workflow. Codex repair is file-contract based: the project writes repair inputs and validates Codex-produced outputs.

**Tech Stack:** Python 3.11, FastAPI, Pillow, OpenCV, numpy, pytest, optional SAM2/GroundingDINO adapters, local filesystem run store.

---

## Scope

This plan replaces the previous Node generation-first demo. Existing runtime code, tests, package files, generated runs, and obsolete outputs may be removed. Keep the demo image and the new design/plan documents.

The first implementation must support this complete local loop:

```text
source image
  -> run folder
  -> manual annotation masks
  -> mask refinement
  -> source-pixel transparent assets
  -> Codex repair task folders for needs_completion assets
  -> QA of repaired assets
  -> export manifest, assets, masks, previews, and QA report
```

Automatic model proposals are included as adapters and CLI/API contracts. If local SAM2 or GroundingDINO dependencies are unavailable, the pipeline must still run through manual annotation.

## File Structure

Create this project structure:

```text
D:\work\art-pipeline-v2-demo
  pyproject.toml
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
    test_run_store.py
    test_annotations.py
    test_extraction.py
    test_repair_tasks.py
    test_qa.py
    test_exporter.py
    test_api.py
    test_proposals.py
  docs/
    superpowers/
      specs/
      plans/
```

Responsibilities:

- `paths.py`: safe run paths and asset id validation.
- `json_io.py`: deterministic JSON read/write.
- `image_io.py`: PNG loading, saving, hashing, dimensions.
- `run_store.py`: run creation and stage status.
- `annotations.py`: annotation schema validation and polygon-to-mask helpers.
- `masks.py`: mask validation and refinement.
- `extraction.py`: source image plus mask to RGBA asset using the user-approved canvas.
- `repair_tasks.py`: create Codex repair task folders and prompts.
- `qa.py`: validate incomplete and repaired assets.
- `exporter.py`: build final export files and provenance manifest.
- `proposals.py`: proposal adapter contract with graceful model-unavailable results.
- `api/app.py`: local annotation and pipeline API.
- `web/annotation-ui/*`: minimal browser UI for manual asset annotation.

## Task 1: Reset Runtime And Python Scaffold

**Purpose:** remove the obsolete runtime surface and create a Python package that can be invoked with `python -m art_pipeline`.

**Files:**
- Remove if present: `D:\work\art-pipeline-v2-demo\package.json`
- Remove if present: `D:\work\art-pipeline-v2-demo\package-lock.json`
- Remove if present: `D:\work\art-pipeline-v2-demo\node_modules`
- Remove if present: `D:\work\art-pipeline-v2-demo\config`
- Remove if present: `D:\work\art-pipeline-v2-demo\src\*.js`
- Remove if present: `D:\work\art-pipeline-v2-demo\test`
- Create: `D:\work\art-pipeline-v2-demo\pyproject.toml`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\__init__.py`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\__main__.py`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\test_scaffold.py`

- [ ] **Step 1: Move the demo image into the new source folder**

Run:

```powershell
New-Item -ItemType Directory -Force -Path D:\work\art-pipeline-v2-demo\source-demo
Move-Item -LiteralPath D:\work\art-pipeline-v2-demo\cat-bathroom-core-scene-v5.png -Destination D:\work\art-pipeline-v2-demo\source-demo\cat-bathroom-core-scene-v5.png
```

Expected: `source-demo\cat-bathroom-core-scene-v5.png` exists.

- [ ] **Step 2: Remove obsolete runtime files**

Run:

```powershell
Remove-Item -Recurse -Force -LiteralPath D:\work\art-pipeline-v2-demo\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -LiteralPath D:\work\art-pipeline-v2-demo\config -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -LiteralPath D:\work\art-pipeline-v2-demo\src -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -LiteralPath D:\work\art-pipeline-v2-demo\test -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -LiteralPath D:\work\art-pipeline-v2-demo\runs -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -LiteralPath D:\work\art-pipeline-v2-demo\outputs -ErrorAction SilentlyContinue
Remove-Item -Force -LiteralPath D:\work\art-pipeline-v2-demo\package.json -ErrorAction SilentlyContinue
Remove-Item -Force -LiteralPath D:\work\art-pipeline-v2-demo\package-lock.json -ErrorAction SilentlyContinue
Remove-Item -Force -LiteralPath D:\work\art-pipeline-v2-demo\README.md -ErrorAction SilentlyContinue
```

Expected: old Node runtime files are gone, `docs\superpowers` and `source-demo` remain.

- [ ] **Step 3: Write the failing scaffold test**

Create `D:\work\art-pipeline-v2-demo\tests\test_scaffold.py`:

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

- [ ] **Step 4: Run the test to verify it fails**

Run:

```powershell
python -m pytest tests/test_scaffold.py -q
```

Expected: FAIL because the `art_pipeline` package does not exist.

- [ ] **Step 5: Create the Python package scaffold**

Create `D:\work\art-pipeline-v2-demo\pyproject.toml`:

```toml
[build-system]
requires = ["setuptools>=70", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "art-pipeline-v2-demo"
version = "0.1.0"
description = "Extraction-first art asset splitting demo"
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
dev = [
  "pytest>=8.2.0",
  "httpx>=0.27.0"
]

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\__init__.py`:

```python
__all__ = ["__version__"]

__version__ = "0.1.0"
```

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\__main__.py`:

```python
from .cli import main


if __name__ == "__main__":
    raise SystemExit(main())
```

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`:

```python
from __future__ import annotations

import argparse


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="art_pipeline",
        description="Art Pipeline V2 extraction-first asset splitter",
    )
    parser.add_argument("--version", action="store_true", help="Print version and exit")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.version:
        print("Art Pipeline V2 0.1.0")
    return 0
```

- [ ] **Step 6: Install and verify**

Run:

```powershell
python -m pip install -e ".[dev]"
python -m pytest tests/test_scaffold.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add pyproject.toml src/art_pipeline tests/test_scaffold.py source-demo
git add -u
git commit -m "Scaffold extraction-first Python pipeline"
```

## Task 2: Run Store And Ingest

**Purpose:** create deterministic run folders and copy the source image without degrading it.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\paths.py`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\json_io.py`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\image_io.py`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\run_store.py`
- Modify: `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\helpers.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\test_run_store.py`

- [ ] **Step 1: Write the failing run-store test**

Create `D:\work\art-pipeline-v2-demo\tests\helpers.py`:

```python
from __future__ import annotations

from pathlib import Path

from PIL import Image


def write_test_png(path: Path, size: tuple[int, int] = (16, 12)) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    for y in range(2, size[1] - 2):
        for x in range(3, size[0] - 3):
            image.putpixel((x, y), (220, 120, 80, 255))
    image.save(path)
    return path
```

Create `D:\work\art-pipeline-v2-demo\tests\test_run_store.py`:

```python
from __future__ import annotations

from pathlib import Path

from art_pipeline.json_io import read_json
from art_pipeline.run_store import create_run, run_dir
from tests.helpers import write_test_png


def test_create_run_copies_source_and_writes_contract(tmp_path: Path):
    source = write_test_png(tmp_path / "input.png", size=(20, 14))

    run = create_run(tmp_path, "demo", source)
    base = run_dir(tmp_path, "demo")

    assert run["schema"] == "art-pipeline-v2-run@extraction-first"
    assert run["runId"] == "demo"
    assert run["source"]["path"] == "source/original.png"
    assert run["source"]["width"] == 20
    assert run["source"]["height"] == 14
    assert run["stages"]["ingest"] == "complete"
    assert (base / "source" / "original.png").exists()
    assert (base / "annotations").exists()
    assert (base / "assets" / "incomplete").exists()
    assert read_json(base / "run.json") == run


def test_create_run_rejects_path_like_run_id(tmp_path: Path):
    source = write_test_png(tmp_path / "input.png")

    try:
        create_run(tmp_path, "../bad", source)
    except ValueError as exc:
        assert "Invalid run id" in str(exc)
    else:
        raise AssertionError("create_run accepted an unsafe run id")
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
python -m pytest tests/test_run_store.py -q
```

Expected: FAIL because `art_pipeline.run_store` does not exist.

- [ ] **Step 3: Implement path, JSON, image, and run-store modules**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\paths.py`:

```python
from __future__ import annotations

import re
from pathlib import Path

SAFE_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


def validate_id(value: str, label: str) -> str:
    if not SAFE_ID.match(value):
        raise ValueError(f"Invalid {label}: {value!r}")
    return value


def project_root_from_cwd(cwd: Path | None = None) -> Path:
    return (cwd or Path.cwd()).resolve()


def run_dir(project_root: Path, run_id: str) -> Path:
    validate_id(run_id, "run id")
    return project_root / "runs" / run_id
```

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\json_io.py`:

```python
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
```

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\image_io.py`:

```python
from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_dimensions(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


def require_png(path: Path) -> None:
    with Image.open(path) as image:
        if image.format != "PNG":
            raise ValueError(f"Expected PNG image: {path}")
```

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\run_store.py`:

```python
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from .image_io import image_dimensions, require_png, sha256_file
from .json_io import read_json, write_json
from .paths import run_dir, validate_id

RUN_SCHEMA = "art-pipeline-v2-run@extraction-first"

RUN_DIRS = [
    "source",
    "proposals/masks",
    "annotations/masks",
    "masks/refined",
    "masks/debug",
    "assets/incomplete",
    "repairs",
    "qa/assets",
    "export/assets",
    "export/masks",
]


def create_run(project_root: Path, run_id: str, source: Path) -> dict[str, Any]:
    validate_id(run_id, "run id")
    source = source.resolve()
    require_png(source)

    base = run_dir(project_root, run_id)
    for relative in RUN_DIRS:
        (base / relative).mkdir(parents=True, exist_ok=True)

    target = base / "source" / "original.png"
    shutil.copyfile(source, target)
    width, height = image_dimensions(target)
    run = {
        "schema": RUN_SCHEMA,
        "runId": run_id,
        "source": {
            "path": "source/original.png",
            "sha256": sha256_file(target),
            "width": width,
            "height": height,
        },
        "stages": {
            "ingest": "complete",
            "propose": "pending",
            "annotate": "pending",
            "refineMasks": "pending",
            "extract": "pending",
            "repairTasks": "pending",
            "qa": "pending",
            "export": "pending",
        },
    }
    write_json(base / "run.json", run)
    return run


def load_run(project_root: Path, run_id: str) -> dict[str, Any]:
    return read_json(run_dir(project_root, run_id) / "run.json")


def save_run(project_root: Path, run_id: str, run: dict[str, Any]) -> None:
    write_json(run_dir(project_root, run_id) / "run.json", run)


def update_stage(project_root: Path, run_id: str, stage: str, status: str) -> None:
    run = load_run(project_root, run_id)
    if stage not in run["stages"]:
        raise ValueError(f"Unknown stage: {stage}")
    run["stages"][stage] = status
    save_run(project_root, run_id, run)
```

- [ ] **Step 4: Add the ingest CLI**

Replace `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py` with:

```python
from __future__ import annotations

import argparse
from pathlib import Path

from .run_store import create_run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="art_pipeline",
        description="Art Pipeline V2 extraction-first asset splitter",
    )
    subparsers = parser.add_subparsers(dest="command")

    ingest = subparsers.add_parser("ingest", help="Create a run from a source PNG")
    ingest.add_argument("--source", required=True, type=Path)
    ingest.add_argument("--run", required=True)
    ingest.add_argument("--project-root", default=Path.cwd(), type=Path)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "ingest":
        run = create_run(args.project_root.resolve(), args.run, args.source)
        print(f"Run created: {run['runId']}")
        return 0
    parser.print_help()
    return 0
```

- [ ] **Step 5: Verify**

Run:

```powershell
python -m pytest tests/test_run_store.py tests/test_scaffold.py -q
python -m art_pipeline ingest --source source-demo/cat-bathroom-core-scene-v5.png --run cat_bathroom_demo
```

Expected: tests PASS and CLI prints `Run created: cat_bathroom_demo`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/art_pipeline tests
git commit -m "Add extraction-first run ingest"
```

## Task 3: Annotation Contract And Manual Mask Authoring

**Purpose:** define asset units, canvases, masks, modes, and user-owned annotation state.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\annotations.py`
- Modify: `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\test_annotations.py`

- [ ] **Step 1: Write the failing annotation tests**

Create `D:\work\art-pipeline-v2-demo\tests\test_annotations.py`:

```python
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from art_pipeline.annotations import (
    AnnotationAsset,
    AnnotationSet,
    Canvas,
    rasterize_polygon_mask,
    validate_annotation_set,
    write_annotation_set,
    load_annotation_set,
)


def test_annotation_set_round_trips_and_requires_canvas(tmp_path: Path):
    mask = tmp_path / "cat.png"
    Image.new("L", (30, 20), 0).save(mask)
    annotations = AnnotationSet(
        assets=[
            AnnotationAsset(
                id="cat",
                name="Cat",
                mode="needs_completion",
                bbox=Canvas(x=4, y=5, w=10, h=8),
                canvas=Canvas(x=2, y=3, w=16, h=12),
                mask="annotations/masks/cat.png",
                layer=10,
                notes="Complete only the hidden lower edge.",
            )
        ]
    )

    validate_annotation_set(annotations, image_size=(30, 20))
    write_annotation_set(tmp_path / "assets.json", annotations)
    loaded = load_annotation_set(tmp_path / "assets.json")

    assert loaded.assets[0].id == "cat"
    assert loaded.assets[0].canvas.w == 16
    assert loaded.assets[0].mode == "needs_completion"


def test_annotation_rejects_completion_canvas_tighter_than_bbox():
    annotations = AnnotationSet(
        assets=[
            AnnotationAsset(
                id="cat",
                name="Cat",
                mode="needs_completion",
                bbox=Canvas(x=5, y=5, w=10, h=10),
                canvas=Canvas(x=6, y=5, w=8, h=10),
                mask="annotations/masks/cat.png",
                layer=1,
            )
        ]
    )

    try:
        validate_annotation_set(annotations, image_size=(40, 40))
    except ValueError as exc:
        assert "canvas must contain bbox" in str(exc)
    else:
        raise AssertionError("Invalid completion canvas was accepted")


def test_rasterize_polygon_mask_writes_source_size_mask(tmp_path: Path):
    mask_path = tmp_path / "mask.png"

    rasterize_polygon_mask(
        mask_path,
        image_size=(12, 10),
        points=[(2, 2), (9, 2), (9, 7), (2, 7)],
    )

    mask = np.array(Image.open(mask_path))
    assert mask.shape == (10, 12)
    assert mask[4, 4] == 255
    assert mask[0, 0] == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_annotations.py -q
```

Expected: FAIL because `art_pipeline.annotations` does not exist.

- [ ] **Step 3: Implement annotation models and polygon masks**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\annotations.py`:

```python
from __future__ import annotations

from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from PIL import Image
from pydantic import BaseModel, Field

from .json_io import read_json, write_json
from .paths import validate_id

AssetMode = Literal["visible_only", "needs_completion", "completed_by_codex", "rejected"]


class Canvas(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(gt=0)
    h: int = Field(gt=0)

    def contains(self, other: "Canvas") -> bool:
        return (
            self.x <= other.x
            and self.y <= other.y
            and self.x + self.w >= other.x + other.w
            and self.y + self.h >= other.y + other.h
        )

    def within(self, image_size: tuple[int, int]) -> bool:
        width, height = image_size
        return self.x + self.w <= width and self.y + self.h <= height


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


def validate_annotation_set(annotations: AnnotationSet, image_size: tuple[int, int]) -> None:
    seen: set[str] = set()
    for asset in annotations.assets:
        validate_id(asset.id, "asset id")
        if asset.id in seen:
            raise ValueError(f"Duplicate asset id: {asset.id}")
        seen.add(asset.id)
        if not asset.bbox.within(image_size):
            raise ValueError(f"bbox outside source image: {asset.id}")
        if not asset.canvas.within(image_size):
            raise ValueError(f"canvas outside source image: {asset.id}")
        if not asset.canvas.contains(asset.bbox):
            raise ValueError(f"canvas must contain bbox: {asset.id}")
        if asset.mode == "needs_completion" and asset.canvas.w * asset.canvas.h <= asset.bbox.w * asset.bbox.h:
            raise ValueError(f"needs_completion canvas must leave completion space: {asset.id}")


def write_annotation_set(path: Path, annotations: AnnotationSet) -> None:
    write_json(path, annotations.model_dump(mode="json"))


def load_annotation_set(path: Path) -> AnnotationSet:
    return AnnotationSet.model_validate(read_json(path))


def rasterize_polygon_mask(path: Path, image_size: tuple[int, int], points: list[tuple[int, int]]) -> None:
    if len(points) < 3:
        raise ValueError("Polygon mask requires at least three points")
    width, height = image_size
    mask = np.zeros((height, width), dtype=np.uint8)
    polygon = np.array(points, dtype=np.int32)
    cv2.fillPoly(mask, [polygon], 255)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(mask, mode="L").save(path)
```

- [ ] **Step 4: Add CLI command to validate annotations**

Modify `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py` by adding imports:

```python
from .annotations import load_annotation_set, validate_annotation_set
from .run_store import create_run, load_run, run_dir, update_stage
```

Add this parser block inside `build_parser()`:

```python
    validate_annotations = subparsers.add_parser("validate-annotations", help="Validate run annotations")
    validate_annotations.add_argument("--run", required=True)
    validate_annotations.add_argument("--project-root", default=Path.cwd(), type=Path)
```

Add this command branch inside `main()` before the help fallback:

```python
    if args.command == "validate-annotations":
        project_root = args.project_root.resolve()
        run = load_run(project_root, args.run)
        base = run_dir(project_root, args.run)
        annotations = load_annotation_set(base / "annotations" / "assets.json")
        validate_annotation_set(
            annotations,
            image_size=(run["source"]["width"], run["source"]["height"]),
        )
        update_stage(project_root, args.run, "annotate", "complete")
        print(f"Annotations valid: {len(annotations.assets)} assets")
        return 0
```

- [ ] **Step 5: Verify**

Run:

```powershell
python -m pytest tests/test_annotations.py tests/test_run_store.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/art_pipeline tests
git commit -m "Add annotation contract"
```

## Task 4: Mask Refinement And Source-Pixel Extraction

**Purpose:** convert user-approved source-size masks into transparent RGBA assets using stable asset canvases.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\masks.py`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\extraction.py`
- Modify: `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\test_extraction.py`

- [ ] **Step 1: Write the failing extraction tests**

Create `D:\work\art-pipeline-v2-demo\tests\test_extraction.py`:

```python
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from art_pipeline.annotations import AnnotationAsset, Canvas
from art_pipeline.extraction import extract_asset
from art_pipeline.masks import refine_mask, validate_mask_size


def test_validate_mask_size_rejects_wrong_dimensions(tmp_path: Path):
    mask_path = tmp_path / "mask.png"
    Image.new("L", (4, 5), 255).save(mask_path)

    try:
        validate_mask_size(mask_path, image_size=(5, 5))
    except ValueError as exc:
        assert "Mask dimensions" in str(exc)
    else:
        raise AssertionError("Wrong-size mask was accepted")


def test_refine_mask_removes_tiny_noise(tmp_path: Path):
    source = tmp_path / "source.png"
    refined = tmp_path / "refined.png"
    image = Image.new("L", (12, 12), 0)
    image.putpixel((1, 1), 255)
    for y in range(4, 9):
        for x in range(4, 9):
            image.putpixel((x, y), 255)
    image.save(source)

    stats = refine_mask(source, refined, image_size=(12, 12), min_region_area=10)
    mask = np.array(Image.open(refined))

    assert stats["visiblePixels"] == 25
    assert mask[1, 1] == 0
    assert mask[6, 6] == 255


def test_extract_asset_uses_canvas_and_preserves_source_pixels(tmp_path: Path):
    source = tmp_path / "source.png"
    mask = tmp_path / "mask.png"
    output = tmp_path / "asset.png"
    image = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    alpha = Image.new("L", (10, 10), 0)
    for y in range(3, 7):
        for x in range(3, 7):
            image.putpixel((x, y), (10 * x, 20, 30, 255))
            alpha.putpixel((x, y), 255)
    image.save(source)
    alpha.save(mask)

    asset = AnnotationAsset(
        id="box",
        name="Box",
        mode="visible_only",
        bbox=Canvas(x=3, y=3, w=4, h=4),
        canvas=Canvas(x=2, y=2, w=7, h=7),
        mask="annotations/masks/box.png",
        layer=1,
    )

    result = extract_asset(source, mask, asset, output)
    exported = Image.open(output).convert("RGBA")

    assert result["canvas"] == {"x": 2, "y": 2, "w": 7, "h": 7}
    assert exported.size == (7, 7)
    assert exported.getpixel((1, 1)) == (30, 20, 30, 255)
    assert exported.getpixel((0, 0))[3] == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_extraction.py -q
```

Expected: FAIL because `masks.py` and `extraction.py` do not exist.

- [ ] **Step 3: Implement mask refinement**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\masks.py`:

```python
from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image


def load_mask(path: Path) -> np.ndarray:
    mask = np.array(Image.open(path).convert("L"))
    return np.where(mask > 127, 255, 0).astype(np.uint8)


def validate_mask_size(path: Path, image_size: tuple[int, int]) -> None:
    with Image.open(path) as image:
        if image.size != image_size:
            raise ValueError(f"Mask dimensions {image.size} do not match source image {image_size}: {path}")


def refine_mask(
    source: Path,
    output: Path,
    image_size: tuple[int, int],
    min_region_area: int = 16,
) -> dict[str, Any]:
    validate_mask_size(source, image_size)
    mask = load_mask(source)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    refined = np.zeros_like(mask)
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area >= min_region_area:
            refined[labels == label] = 255
    kernel = np.ones((3, 3), dtype=np.uint8)
    refined = cv2.morphologyEx(refined, cv2.MORPH_CLOSE, kernel)
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(refined, mode="L").save(output)
    return {
        "visiblePixels": int(np.count_nonzero(refined)),
        "width": int(refined.shape[1]),
        "height": int(refined.shape[0]),
    }
```

- [ ] **Step 4: Implement extraction**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\extraction.py`:

```python
from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from .annotations import AnnotationAsset
from .masks import validate_mask_size


def extract_asset(
    source_image: Path,
    mask_path: Path,
    asset: AnnotationAsset,
    output: Path,
) -> dict[str, Any]:
    with Image.open(source_image).convert("RGBA") as source:
        validate_mask_size(mask_path, source.size)
        with Image.open(mask_path).convert("L") as mask:
            box = (
                asset.canvas.x,
                asset.canvas.y,
                asset.canvas.x + asset.canvas.w,
                asset.canvas.y + asset.canvas.h,
            )
            crop = source.crop(box)
            alpha = mask.crop(box)
            crop.putalpha(alpha)
            output.parent.mkdir(parents=True, exist_ok=True)
            crop.save(output)
            visible_pixels = sum(1 for value in alpha.getdata() if value > 0)
            if visible_pixels == 0:
                raise ValueError(f"Extracted asset has no visible pixels: {asset.id}")
            return {
                "assetId": asset.id,
                "output": str(output),
                "visiblePixels": visible_pixels,
                "canvas": asset.canvas.model_dump(),
                "sourcePixelsOnly": True,
            }
```

- [ ] **Step 5: Add refine and extract CLI commands**

Modify `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py` imports:

```python
from .extraction import extract_asset
from .json_io import write_json
from .masks import refine_mask
```

Add parser blocks:

```python
    refine = subparsers.add_parser("refine-masks", help="Refine annotation masks")
    refine.add_argument("--run", required=True)
    refine.add_argument("--project-root", default=Path.cwd(), type=Path)

    extract = subparsers.add_parser("extract", help="Extract transparent assets")
    extract.add_argument("--run", required=True)
    extract.add_argument("--project-root", default=Path.cwd(), type=Path)
```

Add command branches:

```python
    if args.command == "refine-masks":
        project_root = args.project_root.resolve()
        run = load_run(project_root, args.run)
        base = run_dir(project_root, args.run)
        annotations = load_annotation_set(base / "annotations" / "assets.json")
        image_size = (run["source"]["width"], run["source"]["height"])
        for asset in annotations.assets:
            refine_mask(
                base / asset.mask,
                base / "masks" / "refined" / f"{asset.id}.png",
                image_size=image_size,
            )
        update_stage(project_root, args.run, "refineMasks", "complete")
        print(f"Masks refined: {len(annotations.assets)}")
        return 0

    if args.command == "extract":
        project_root = args.project_root.resolve()
        base = run_dir(project_root, args.run)
        annotations = load_annotation_set(base / "annotations" / "assets.json")
        results = []
        for asset in annotations.assets:
            results.append(
                extract_asset(
                    base / "source" / "original.png",
                    base / "masks" / "refined" / f"{asset.id}.png",
                    asset,
                    base / "assets" / "incomplete" / f"{asset.id}.png",
                )
            )
        write_json(base / "assets" / "extraction_report.json", {"assets": results})
        update_stage(project_root, args.run, "extract", "complete")
        print(f"Assets extracted: {len(results)}")
        return 0
```

- [ ] **Step 6: Verify**

Run:

```powershell
python -m pytest tests/test_extraction.py tests/test_annotations.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/art_pipeline tests
git commit -m "Extract source-pixel assets"
```

## Task 5: Codex Repair Task Contracts

**Purpose:** create file-bounded repair tasks for `needs_completion` assets without calling a hidden Codex API.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\repair_tasks.py`
- Modify: `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\test_repair_tasks.py`

- [ ] **Step 1: Write the failing repair-task tests**

Create `D:\work\art-pipeline-v2-demo\tests\test_repair_tasks.py`:

```python
from __future__ import annotations

from pathlib import Path

from PIL import Image

from art_pipeline.annotations import AnnotationAsset, AnnotationSet, Canvas, write_annotation_set
from art_pipeline.repair_tasks import create_repair_tasks


def test_create_repair_tasks_only_for_completion_assets(tmp_path: Path):
    base = tmp_path / "runs" / "demo"
    (base / "source").mkdir(parents=True)
    (base / "annotations").mkdir()
    (base / "assets" / "incomplete").mkdir(parents=True)
    Image.new("RGBA", (30, 20), (100, 150, 200, 255)).save(base / "source" / "original.png")
    Image.new("RGBA", (12, 10), (0, 0, 0, 0)).save(base / "assets" / "incomplete" / "cat.png")
    Image.new("RGBA", (8, 8), (0, 0, 0, 255)).save(base / "assets" / "incomplete" / "mat.png")
    missing = Image.new("L", (12, 10), 0)
    for y in range(6, 9):
        for x in range(4, 8):
            missing.putpixel((x, y), 255)
    (base / "repairs" / "cat").mkdir(parents=True)
    missing.save(base / "repairs" / "cat" / "missing_mask.png")
    write_annotation_set(
        base / "annotations" / "assets.json",
        AnnotationSet(
            assets=[
                AnnotationAsset(
                    id="cat",
                    name="Cat",
                    mode="needs_completion",
                    bbox=Canvas(x=5, y=5, w=8, h=6),
                    canvas=Canvas(x=4, y=4, w=12, h=10),
                    mask="annotations/masks/cat.png",
                    layer=10,
                ),
                AnnotationAsset(
                    id="mat",
                    name="Mat",
                    mode="visible_only",
                    bbox=Canvas(x=1, y=1, w=8, h=8),
                    canvas=Canvas(x=1, y=1, w=8, h=8),
                    mask="annotations/masks/mat.png",
                    layer=5,
                ),
            ]
        ),
    )

    tasks = create_repair_tasks(base)

    assert [task["assetId"] for task in tasks] == ["cat"]
    assert (base / "repairs" / "cat" / "incomplete_asset.png").exists()
    assert (base / "repairs" / "cat" / "preserve_mask.png").exists()
    assert (base / "repairs" / "cat" / "repair_prompt.md").exists()
    assert "modify only pixels inside missing_mask.png" in (base / "repairs" / "cat" / "repair_prompt.md").read_text(encoding="utf-8")
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
python -m pytest tests/test_repair_tasks.py -q
```

Expected: FAIL because `art_pipeline.repair_tasks` does not exist.

- [ ] **Step 3: Implement repair task creation**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\repair_tasks.py`:

```python
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from PIL import Image

from .annotations import load_annotation_set
from .json_io import write_json


def _write_preserve_mask(asset_png: Path, output: Path) -> None:
    with Image.open(asset_png).convert("RGBA") as image:
        alpha = image.getchannel("A")
        output.parent.mkdir(parents=True, exist_ok=True)
        alpha.save(output)


def _write_source_crop(source: Path, canvas: dict[str, int], output: Path) -> None:
    with Image.open(source).convert("RGBA") as image:
        box = (canvas["x"], canvas["y"], canvas["x"] + canvas["w"], canvas["y"] + canvas["h"])
        crop = image.crop(box)
        output.parent.mkdir(parents=True, exist_ok=True)
        crop.save(output)


def _prompt(asset_id: str, asset_name: str) -> str:
    return f"""# Codex Repair Task: {asset_name}

Asset id: {asset_id}

Inputs in this folder:
- source_crop.png: original scene pixels around the asset canvas.
- scene_context.png: larger source context for style and structure.
- incomplete_asset.png: current transparent asset extracted from source pixels.
- preserve_mask.png: pixels that must remain unchanged.
- missing_mask.png: the only region that may be completed.
- guide_overlay.png: visual guide for the preserve and missing regions.

Required output:
- completed_asset.png: same width and height as incomplete_asset.png, RGBA PNG.
- repair_report.json: JSON report with assetId, status, output, and notes.

Rules:
- Preserve every visible pixel inside preserve_mask.png.
- modify only pixels inside missing_mask.png.
- Do not redraw the whole object.
- Do not alter existing colors, line work, expression, silhouette, or visible details.
- Match the source_crop.png style and object structure.
- Keep transparent background outside the object.
"""


def create_repair_tasks(base: Path) -> list[dict[str, Any]]:
    annotations = load_annotation_set(base / "annotations" / "assets.json")
    source = base / "source" / "original.png"
    tasks: list[dict[str, Any]] = []
    for asset in annotations.assets:
        if asset.mode != "needs_completion":
            continue
        folder = base / "repairs" / asset.id
        incomplete = base / "assets" / "incomplete" / f"{asset.id}.png"
        missing = folder / "missing_mask.png"
        if not missing.exists():
            raise FileNotFoundError(f"Missing completion mask for {asset.id}: {missing}")
        folder.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(incomplete, folder / "incomplete_asset.png")
        shutil.copyfile(source, folder / "scene_context.png")
        _write_preserve_mask(incomplete, folder / "preserve_mask.png")
        _write_source_crop(source, asset.canvas.model_dump(), folder / "source_crop.png")
        shutil.copyfile(missing, folder / "guide_overlay.png")
        (folder / "repair_prompt.md").write_text(_prompt(asset.id, asset.name), encoding="utf-8")
        task = {
            "assetId": asset.id,
            "folder": f"repairs/{asset.id}",
            "prompt": f"repairs/{asset.id}/repair_prompt.md",
            "status": "pending",
        }
        write_json(folder / "repair_task.json", task)
        tasks.append(task)
    write_json(base / "repairs" / "repair_tasks.json", {"tasks": tasks})
    return tasks
```

- [ ] **Step 4: Add the repair-task CLI**

Add parser block to `cli.py`:

```python
    repair_tasks = subparsers.add_parser("create-repair-tasks", help="Create Codex repair task folders")
    repair_tasks.add_argument("--run", required=True)
    repair_tasks.add_argument("--project-root", default=Path.cwd(), type=Path)
```

Add import:

```python
from .repair_tasks import create_repair_tasks
```

Add command branch:

```python
    if args.command == "create-repair-tasks":
        project_root = args.project_root.resolve()
        base = run_dir(project_root, args.run)
        tasks = create_repair_tasks(base)
        update_stage(project_root, args.run, "repairTasks", "complete")
        print(f"Repair tasks created: {len(tasks)}")
        return 0
```

- [ ] **Step 5: Verify**

Run:

```powershell
python -m pytest tests/test_repair_tasks.py tests/test_extraction.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/art_pipeline tests
git commit -m "Create Codex repair task contracts"
```

## Task 6: Repair QA

**Purpose:** reject Codex outputs that change preserved pixels, write outside `missing_mask`, or generate too much new content.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\qa.py`
- Modify: `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\test_qa.py`

- [ ] **Step 1: Write the failing QA tests**

Create `D:\work\art-pipeline-v2-demo\tests\test_qa.py`:

```python
from __future__ import annotations

from pathlib import Path

from PIL import Image

from art_pipeline.qa import validate_repair_output


def _write_repair_case(base: Path) -> None:
    base.mkdir(parents=True)
    incomplete = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    preserve = Image.new("L", (8, 8), 0)
    missing = Image.new("L", (8, 8), 0)
    for y in range(2, 5):
        for x in range(2, 5):
            incomplete.putpixel((x, y), (100, 80, 60, 255))
            preserve.putpixel((x, y), 255)
    for y in range(5, 7):
        for x in range(3, 6):
            missing.putpixel((x, y), 255)
    incomplete.save(base / "incomplete_asset.png")
    preserve.save(base / "preserve_mask.png")
    missing.save(base / "missing_mask.png")


def test_validate_repair_accepts_pixels_inside_missing_mask(tmp_path: Path):
    folder = tmp_path / "repairs" / "cat"
    _write_repair_case(folder)
    completed = Image.open(folder / "incomplete_asset.png").convert("RGBA")
    completed.putpixel((4, 5), (90, 70, 50, 255))
    completed.save(folder / "completed_asset.png")

    report = validate_repair_output(folder, asset_id="cat")

    assert report["status"] == "pass"
    assert report["generatedPixels"] == 1
    assert report["changedPreservePixels"] == 0


def test_validate_repair_rejects_changed_preserve_pixels(tmp_path: Path):
    folder = tmp_path / "repairs" / "cat"
    _write_repair_case(folder)
    completed = Image.open(folder / "incomplete_asset.png").convert("RGBA")
    completed.putpixel((3, 3), (255, 0, 0, 255))
    completed.save(folder / "completed_asset.png")

    report = validate_repair_output(folder, asset_id="cat")

    assert report["status"] == "fail"
    assert "preserve_pixels_changed" in report["issues"]


def test_validate_repair_rejects_pixels_outside_missing_mask(tmp_path: Path):
    folder = tmp_path / "repairs" / "cat"
    _write_repair_case(folder)
    completed = Image.open(folder / "incomplete_asset.png").convert("RGBA")
    completed.putpixel((7, 7), (90, 70, 50, 255))
    completed.save(folder / "completed_asset.png")

    report = validate_repair_output(folder, asset_id="cat")

    assert report["status"] == "fail"
    assert "pixels_outside_missing_mask" in report["issues"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_qa.py -q
```

Expected: FAIL because `art_pipeline.qa` does not exist.

- [ ] **Step 3: Implement repair QA**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\qa.py`:

```python
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from .json_io import write_json


def _rgba(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"), dtype=np.int16)


def _mask(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("L")) > 127


def validate_repair_output(
    folder: Path,
    asset_id: str,
    preserve_tolerance: int = 2,
    warn_ratio: float = 0.15,
    fail_ratio: float = 0.30,
) -> dict[str, Any]:
    incomplete_path = folder / "incomplete_asset.png"
    completed_path = folder / "completed_asset.png"
    preserve_path = folder / "preserve_mask.png"
    missing_path = folder / "missing_mask.png"
    incomplete = _rgba(incomplete_path)
    completed = _rgba(completed_path)
    preserve = _mask(preserve_path)
    missing = _mask(missing_path)

    issues: list[str] = []
    if incomplete.shape != completed.shape:
        issues.append("dimensions_changed")
    if preserve.shape != incomplete.shape[:2] or missing.shape != incomplete.shape[:2]:
        issues.append("mask_dimensions_invalid")

    changed = np.any(np.abs(completed - incomplete) > preserve_tolerance, axis=2)
    changed_preserve = int(np.count_nonzero(changed & preserve))
    outside_missing = int(np.count_nonzero(changed & ~preserve & ~missing))
    generated_pixels = int(np.count_nonzero(changed & missing))
    missing_area = int(np.count_nonzero(missing))
    generated_ratio = generated_pixels / missing_area if missing_area else 0.0

    if changed_preserve:
        issues.append("preserve_pixels_changed")
    if outside_missing:
        issues.append("pixels_outside_missing_mask")
    if generated_ratio > fail_ratio:
        issues.append("generated_area_too_large")
    elif generated_ratio > warn_ratio:
        issues.append("requires_human_approval")

    report = {
        "schema": "art-pipeline-v2-qa-report@extraction-first",
        "assetId": asset_id,
        "status": "fail" if any(issue != "requires_human_approval" for issue in issues) else "pass",
        "issues": issues,
        "changedPreservePixels": changed_preserve,
        "pixelsOutsideMissingMask": outside_missing,
        "generatedPixels": generated_pixels,
        "generatedAreaRatio": generated_ratio,
    }
    write_json(folder / "qa_report.json", report)
    return report
```

- [ ] **Step 4: Add validate CLI**

Add parser block:

```python
    validate = subparsers.add_parser("validate", help="Validate repair outputs")
    validate.add_argument("--run", required=True)
    validate.add_argument("--project-root", default=Path.cwd(), type=Path)
```

Add import:

```python
from .qa import validate_repair_output
```

Add command branch:

```python
    if args.command == "validate":
        project_root = args.project_root.resolve()
        base = run_dir(project_root, args.run)
        tasks_path = base / "repairs" / "repair_tasks.json"
        reports = []
        if tasks_path.exists():
            from .json_io import read_json
            for task in read_json(tasks_path)["tasks"]:
                reports.append(validate_repair_output(base / task["folder"], task["assetId"]))
        write_json(base / "qa" / "qa_report.json", {"repairs": reports})
        update_stage(project_root, args.run, "qa", "complete")
        print(f"Repair outputs validated: {len(reports)}")
        return 0
```

- [ ] **Step 5: Verify**

Run:

```powershell
python -m pytest tests/test_qa.py tests/test_repair_tasks.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/art_pipeline tests
git commit -m "Validate Codex repair outputs"
```

## Task 7: Export Manifest, Assets, Masks, And Previews

**Purpose:** write final assets with provenance and avoid exporting failed repairs.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\exporter.py`
- Modify: `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\test_exporter.py`

- [ ] **Step 1: Write the failing export tests**

Create `D:\work\art-pipeline-v2-demo\tests\test_exporter.py`:

```python
from __future__ import annotations

from pathlib import Path

from PIL import Image

from art_pipeline.annotations import AnnotationAsset, AnnotationSet, Canvas, write_annotation_set
from art_pipeline.exporter import export_run
from art_pipeline.json_io import read_json, write_json


def test_export_run_uses_completed_asset_only_after_passing_qa(tmp_path: Path):
    base = tmp_path / "runs" / "demo"
    (base / "annotations").mkdir(parents=True)
    (base / "assets" / "incomplete").mkdir(parents=True)
    (base / "masks" / "refined").mkdir(parents=True)
    (base / "repairs" / "cat").mkdir(parents=True)
    Image.new("RGBA", (8, 8), (1, 2, 3, 255)).save(base / "assets" / "incomplete" / "cat.png")
    Image.new("RGBA", (8, 8), (9, 8, 7, 255)).save(base / "repairs" / "cat" / "completed_asset.png")
    Image.new("L", (20, 20), 255).save(base / "masks" / "refined" / "cat.png")
    write_annotation_set(
        base / "annotations" / "assets.json",
        AnnotationSet(
            assets=[
                AnnotationAsset(
                    id="cat",
                    name="Cat",
                    mode="needs_completion",
                    bbox=Canvas(x=1, y=1, w=8, h=8),
                    canvas=Canvas(x=1, y=1, w=10, h=10),
                    mask="annotations/masks/cat.png",
                    layer=10,
                )
            ]
        ),
    )
    write_json(base / "repairs" / "cat" / "qa_report.json", {
        "assetId": "cat",
        "status": "pass",
        "generatedAreaRatio": 0.08,
        "issues": [],
    })

    result = export_run(base)

    manifest = read_json(base / "export" / "manifest.json")
    assert result["assetCount"] == 1
    assert (base / "export" / "assets" / "cat.png").exists()
    assert manifest["assets"][0]["mode"] == "completed_by_codex"
    assert manifest["assets"][0]["generatedAreaRatio"] == 0.08


def test_export_run_rejects_failed_repair(tmp_path: Path):
    base = tmp_path / "runs" / "demo"
    (base / "annotations").mkdir(parents=True)
    (base / "assets" / "incomplete").mkdir(parents=True)
    (base / "repairs" / "cat").mkdir(parents=True)
    Image.new("RGBA", (8, 8), (1, 2, 3, 255)).save(base / "assets" / "incomplete" / "cat.png")
    Image.new("RGBA", (8, 8), (9, 8, 7, 255)).save(base / "repairs" / "cat" / "completed_asset.png")
    write_annotation_set(
        base / "annotations" / "assets.json",
        AnnotationSet(
            assets=[
                AnnotationAsset(
                    id="cat",
                    name="Cat",
                    mode="needs_completion",
                    bbox=Canvas(x=1, y=1, w=6, h=6),
                    canvas=Canvas(x=1, y=1, w=8, h=8),
                    mask="annotations/masks/cat.png",
                    layer=10,
                )
            ]
        ),
    )
    write_json(base / "repairs" / "cat" / "qa_report.json", {
        "assetId": "cat",
        "status": "fail",
        "generatedAreaRatio": 0.40,
        "issues": ["generated_area_too_large"],
    })

    try:
        export_run(base)
    except ValueError as exc:
        assert "failed repair" in str(exc)
    else:
        raise AssertionError("Failed repair was exported")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_exporter.py -q
```

Expected: FAIL because `art_pipeline.exporter` does not exist.

- [ ] **Step 3: Implement export**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\exporter.py`:

```python
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from .annotations import load_annotation_set
from .json_io import read_json, write_json


def _copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def _contact_sheet(asset_paths: list[Path], output: Path) -> None:
    thumbnails: list[Image.Image] = []
    for path in asset_paths:
        image = Image.open(path).convert("RGBA")
        image.thumbnail((128, 128))
        tile = Image.new("RGBA", (160, 160), (245, 245, 245, 255))
        tile.alpha_composite(image, ((160 - image.width) // 2, (140 - image.height) // 2))
        draw = ImageDraw.Draw(tile)
        draw.text((8, 142), path.stem[:20], fill=(0, 0, 0, 255))
        thumbnails.append(tile)
    width = max(160, 160 * min(4, len(thumbnails) or 1))
    height = 160 * max(1, (len(thumbnails) + 3) // 4)
    sheet = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    for index, tile in enumerate(thumbnails):
        sheet.alpha_composite(tile, ((index % 4) * 160, (index // 4) * 160))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def export_run(base: Path) -> dict[str, Any]:
    annotations = load_annotation_set(base / "annotations" / "assets.json")
    export_dir = base / "export"
    exported_assets: list[Path] = []
    manifest_assets: list[dict[str, Any]] = []
    for asset in sorted(annotations.assets, key=lambda item: item.layer):
        incomplete = base / "assets" / "incomplete" / f"{asset.id}.png"
        final_source = incomplete
        mode = asset.mode
        generated_ratio = 0.0
        requires_human_approval = False
        if asset.mode == "needs_completion":
            qa_path = base / "repairs" / asset.id / "qa_report.json"
            qa = read_json(qa_path)
            if qa["status"] != "pass":
                raise ValueError(f"Cannot export failed repair: {asset.id}")
            final_source = base / "repairs" / asset.id / "completed_asset.png"
            mode = "completed_by_codex"
            generated_ratio = qa.get("generatedAreaRatio", 0.0)
            requires_human_approval = generated_ratio > 0.15
        target = export_dir / "assets" / f"{asset.id}.png"
        _copy(final_source, target)
        mask_source = base / "masks" / "refined" / f"{asset.id}.png"
        if mask_source.exists():
            _copy(mask_source, export_dir / "masks" / f"{asset.id}.png")
        exported_assets.append(target)
        manifest_assets.append({
            "id": asset.id,
            "name": asset.name,
            "mode": mode,
            "layer": asset.layer,
            "sourceAsset": str(incomplete.relative_to(base)).replace("\\", "/"),
            "finalAsset": str(target.relative_to(base)).replace("\\", "/"),
            "sourcePixelsPreserved": True,
            "generatedAreaRatio": generated_ratio,
            "requiresHumanApproval": requires_human_approval,
        })
    manifest = {
        "schema": "art-pipeline-v2-export-manifest@extraction-first",
        "assets": manifest_assets,
    }
    level = {
        "schema": "art-pipeline-v2-level@extraction-first",
        "assets": [
            {"id": item["id"], "path": item["finalAsset"], "layer": item["layer"]}
            for item in manifest_assets
        ],
    }
    write_json(export_dir / "manifest.json", manifest)
    write_json(export_dir / "level.json", level)
    write_json(export_dir / "qa_report.json", {"assets": manifest_assets})
    _contact_sheet(exported_assets, export_dir / "contact_sheet.png")
    return {"assetCount": len(manifest_assets), "exportDir": str(export_dir)}
```

- [ ] **Step 4: Add export CLI**

Add parser block:

```python
    export = subparsers.add_parser("export", help="Export final assets")
    export.add_argument("--run", required=True)
    export.add_argument("--project-root", default=Path.cwd(), type=Path)
```

Add import:

```python
from .exporter import export_run
```

Add command branch:

```python
    if args.command == "export":
        project_root = args.project_root.resolve()
        result = export_run(run_dir(project_root, args.run))
        update_stage(project_root, args.run, "export", "complete")
        print(f"Exported assets: {result['assetCount']}")
        return 0
```

- [ ] **Step 5: Verify**

Run:

```powershell
python -m pytest tests/test_exporter.py tests/test_qa.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/art_pipeline tests
git commit -m "Export extracted asset pack"
```

## Task 8: Local Annotation API And Minimal UI

**Purpose:** provide a browser surface for manual annotations, mask authoring, and missing-mask editing.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\api\__init__.py`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\api\app.py`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\web\annotation-ui\index.html`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\web\annotation-ui\app.js`
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\web\annotation-ui\styles.css`
- Modify: `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\test_api.py`

- [ ] **Step 1: Write the failing API tests**

Create `D:\work\art-pipeline-v2-demo\tests\test_api.py`:

```python
from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api.app import create_app
from art_pipeline.run_store import create_run
from tests.helpers import write_test_png


def test_api_saves_annotations_and_polygon_mask(tmp_path: Path):
    source = write_test_png(tmp_path / "source.png", size=(30, 20))
    create_run(tmp_path, "demo", source)
    client = TestClient(create_app(project_root=tmp_path))

    response = client.post(
        "/api/runs/demo/masks/polygon",
        json={
            "assetId": "cat",
            "points": [[4, 4], [14, 4], [14, 12], [4, 12]],
        },
    )
    assert response.status_code == 200
    assert response.json()["mask"] == "annotations/masks/cat.png"
    assert (tmp_path / "runs" / "demo" / "annotations" / "masks" / "cat.png").exists()

    annotations = {
        "schema": "art-pipeline-v2-annotations@extraction-first",
        "assets": [
            {
                "id": "cat",
                "name": "Cat",
                "mode": "visible_only",
                "bbox": {"x": 4, "y": 4, "w": 10, "h": 8},
                "canvas": {"x": 4, "y": 4, "w": 10, "h": 8},
                "mask": "annotations/masks/cat.png",
                "layer": 10,
                "notes": "",
            }
        ],
    }
    response = client.put("/api/runs/demo/annotations", json=annotations)
    assert response.status_code == 200
    assert response.json()["assetCount"] == 1


def test_api_saves_missing_mask_for_completion_asset(tmp_path: Path):
    source = write_test_png(tmp_path / "source.png", size=(30, 20))
    create_run(tmp_path, "demo", source)
    client = TestClient(create_app(project_root=tmp_path))

    response = client.post(
        "/api/runs/demo/repairs/cat/missing-mask",
        json={"width": 8, "height": 6, "points": [[1, 1], [6, 1], [6, 4], [1, 4]]},
    )

    assert response.status_code == 200
    assert (tmp_path / "runs" / "demo" / "repairs" / "cat" / "missing_mask.png").exists()
    assert Image.open(tmp_path / "runs" / "demo" / "repairs" / "cat" / "missing_mask.png").size == (8, 6)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_api.py -q
```

Expected: FAIL because the API package does not exist.

- [ ] **Step 3: Implement the FastAPI app**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\api\__init__.py`:

```python
from .app import create_app

__all__ = ["create_app"]
```

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\api\app.py`:

```python
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from art_pipeline.annotations import AnnotationSet, rasterize_polygon_mask, validate_annotation_set, write_annotation_set
from art_pipeline.run_store import load_run, run_dir, update_stage


class PolygonRequest(BaseModel):
    assetId: str
    points: list[tuple[int, int]]


class MissingMaskRequest(BaseModel):
    width: int
    height: int
    points: list[tuple[int, int]]


def create_app(project_root: Path) -> FastAPI:
    project_root = project_root.resolve()
    app = FastAPI(title="Art Pipeline V2")
    static_root = Path(__file__).resolve().parents[1] / "web" / "annotation-ui"
    app.mount("/ui", StaticFiles(directory=static_root, html=True), name="ui")

    @app.get("/api/runs/{run_id}/source")
    def source_image(run_id: str):
        base = run_dir(project_root, run_id)
        return FileResponse(base / "source" / "original.png", media_type="image/png")

    @app.put("/api/runs/{run_id}/annotations")
    def save_annotations(run_id: str, annotations: AnnotationSet):
        run = load_run(project_root, run_id)
        validate_annotation_set(annotations, (run["source"]["width"], run["source"]["height"]))
        base = run_dir(project_root, run_id)
        write_annotation_set(base / "annotations" / "assets.json", annotations)
        update_stage(project_root, run_id, "annotate", "complete")
        return {"assetCount": len(annotations.assets)}

    @app.post("/api/runs/{run_id}/masks/polygon")
    def save_polygon_mask(run_id: str, request: PolygonRequest):
        run = load_run(project_root, run_id)
        base = run_dir(project_root, run_id)
        relative = f"annotations/masks/{request.assetId}.png"
        rasterize_polygon_mask(
            base / relative,
            image_size=(run["source"]["width"], run["source"]["height"]),
            points=request.points,
        )
        return {"mask": relative}

    @app.post("/api/runs/{run_id}/repairs/{asset_id}/missing-mask")
    def save_missing_mask(run_id: str, asset_id: str, request: MissingMaskRequest):
        base = run_dir(project_root, run_id)
        relative = f"repairs/{asset_id}/missing_mask.png"
        rasterize_polygon_mask(
            base / relative,
            image_size=(request.width, request.height),
            points=request.points,
        )
        return {"mask": relative}

    return app
```

- [ ] **Step 4: Add minimal annotation UI files**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\web\annotation-ui\index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Art Pipeline V2</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main>
      <section class="toolbar">
        <input id="run-id" value="cat_bathroom_demo" aria-label="Run id">
        <button id="load-source">Load</button>
        <button id="save-mask">Save Polygon Mask</button>
      </section>
      <section class="workspace">
        <canvas id="scene" width="900" height="700"></canvas>
        <aside>
          <label>Asset id <input id="asset-id" value="asset_001"></label>
          <label>Name <input id="asset-name" value="Asset 001"></label>
          <label>Mode
            <select id="asset-mode">
              <option value="visible_only">visible_only</option>
              <option value="needs_completion">needs_completion</option>
            </select>
          </label>
          <button id="save-annotations">Add/Save Annotation</button>
          <button id="save-missing-mask">Save Missing Mask</button>
          <pre id="status"></pre>
        </aside>
      </section>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
```

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\web\annotation-ui\styles.css`:

```css
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #f5f7f8;
  color: #172026;
}

main {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.toolbar,
aside {
  display: flex;
  gap: 8px;
  align-items: center;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 12px;
}

canvas {
  max-width: 100%;
  background: white;
  border: 1px solid #aab4bd;
}

aside {
  align-items: stretch;
  flex-direction: column;
}

label {
  display: grid;
  gap: 4px;
}
```

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\web\annotation-ui\app.js`:

```javascript
const canvas = document.querySelector("#scene");
const context = canvas.getContext("2d");
const statusEl = document.querySelector("#status");
let image = new Image();
let points = [];
let assets = [];
let lastCanvas = null;

function status(value) {
  statusEl.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round((event.clientX - rect.left) * (canvas.width / rect.width));
  const y = Math.round((event.clientY - rect.top) * (canvas.height / rect.height));
  points.push([x, y]);
  draw();
});

function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (image.complete) context.drawImage(image, 0, 0);
  context.strokeStyle = "#ff3355";
  context.lineWidth = 2;
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (points.length > 2) context.closePath();
  context.stroke();
}

document.querySelector("#load-source").addEventListener("click", () => {
  const runId = document.querySelector("#run-id").value;
  image = new Image();
  image.onload = () => {
    canvas.width = image.width;
    canvas.height = image.height;
    draw();
    status("source loaded");
  };
  image.src = `/api/runs/${runId}/source?cache=${Date.now()}`;
});

document.querySelector("#save-mask").addEventListener("click", async () => {
  const runId = document.querySelector("#run-id").value;
  const assetId = document.querySelector("#asset-id").value;
  const response = await fetch(`/api/runs/${runId}/masks/polygon`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({assetId, points})
  });
  status(await response.json());
});

document.querySelector("#save-annotations").addEventListener("click", async () => {
  const runId = document.querySelector("#run-id").value;
  const assetId = document.querySelector("#asset-id").value;
  const name = document.querySelector("#asset-name").value;
  const mode = document.querySelector("#asset-mode").value;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x + 1;
  const h = Math.max(...ys) - y + 1;
  const pad = mode === "needs_completion" ? 24 : 0;
  lastCanvas = {
    x: Math.max(0, x - pad),
    y: Math.max(0, y - pad),
    w: Math.min(canvas.width - Math.max(0, x - pad), w + pad * 2),
    h: Math.min(canvas.height - Math.max(0, y - pad), h + pad * 2)
  };
  const nextAsset = {
    id: assetId,
    name,
    mode,
    bbox: {x, y, w, h},
    canvas: lastCanvas,
    mask: `annotations/masks/${assetId}.png`,
    layer: assets.length * 10 + 10,
    notes: ""
  };
  assets = assets.filter((asset) => asset.id !== assetId);
  assets.push(nextAsset);
  const annotations = {
    schema: "art-pipeline-v2-annotations@extraction-first",
    assets
  };
  const response = await fetch(`/api/runs/${runId}/annotations`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(annotations)
  });
  status(await response.json());
});

document.querySelector("#save-missing-mask").addEventListener("click", async () => {
  const runId = document.querySelector("#run-id").value;
  const assetId = document.querySelector("#asset-id").value;
  const asset = assets.find((item) => item.id === assetId);
  const assetCanvas = asset ? asset.canvas : lastCanvas;
  if (!assetCanvas) {
    status("save annotation before saving missing mask");
    return;
  }
  const relativePoints = points.map(([x, y]) => [x - assetCanvas.x, y - assetCanvas.y]);
  const response = await fetch(`/api/runs/${runId}/repairs/${assetId}/missing-mask`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({width: assetCanvas.w, height: assetCanvas.h, points: relativePoints})
  });
  status(await response.json());
});
```

- [ ] **Step 5: Add serve CLI**

Add imports:

```python
import uvicorn
from .api.app import create_app
```

Add parser block:

```python
    serve = subparsers.add_parser("serve", help="Start local annotation UI")
    serve.add_argument("--project-root", default=Path.cwd(), type=Path)
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", default=8765, type=int)
```

Add command branch:

```python
    if args.command == "serve":
        app = create_app(args.project_root.resolve())
        uvicorn.run(app, host=args.host, port=args.port)
        return 0
```

- [ ] **Step 6: Verify**

Run:

```powershell
python -m pytest tests/test_api.py tests/test_annotations.py -q
```

Expected: PASS.

Manual check:

```powershell
python -m art_pipeline serve --port 8765
```

Open `http://127.0.0.1:8765/ui/` and confirm the page loads.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/art_pipeline tests
git commit -m "Add local annotation UI"
```

## Task 9: Proposal Adapter Contracts

**Purpose:** expose proposal generation without making large model setup a hard dependency.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\src\art_pipeline\proposals.py`
- Modify: `D:\work\art-pipeline-v2-demo\src\art_pipeline\cli.py`
- Create: `D:\work\art-pipeline-v2-demo\tests\test_proposals.py`

- [ ] **Step 1: Write the failing proposal tests**

Create `D:\work\art-pipeline-v2-demo\tests\test_proposals.py`:

```python
from __future__ import annotations

from pathlib import Path

from art_pipeline.json_io import read_json
from art_pipeline.proposals import generate_proposals
from art_pipeline.run_store import create_run
from tests.helpers import write_test_png


def test_generate_proposals_writes_manual_fallback_when_models_are_unavailable(tmp_path: Path):
    source = write_test_png(tmp_path / "source.png", size=(24, 18))
    create_run(tmp_path, "demo", source)

    result = generate_proposals(tmp_path / "runs" / "demo")

    assert result["status"] == "manual_annotation_required"
    assert result["proposals"] == []
    saved = read_json(tmp_path / "runs" / "demo" / "proposals" / "proposals.json")
    assert saved["status"] == "manual_annotation_required"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
python -m pytest tests/test_proposals.py -q
```

Expected: FAIL because `art_pipeline.proposals` does not exist.

- [ ] **Step 3: Implement proposal fallback contract**

Create `D:\work\art-pipeline-v2-demo\src\art_pipeline\proposals.py`:

```python
from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from .json_io import write_json


def _write_empty_overlay(source: Path, output: Path) -> None:
    image = Image.open(source).convert("RGBA")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, image.width - 1, image.height - 1), outline=(255, 80, 80, 255), width=2)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def generate_proposals(base: Path) -> dict[str, Any]:
    result = {
        "schema": "art-pipeline-v2-proposals@extraction-first",
        "status": "manual_annotation_required",
        "reason": "No local proposal model is configured; use the annotation UI to define assets.",
        "proposals": [],
    }
    write_json(base / "proposals" / "proposals.json", result)
    _write_empty_overlay(base / "source" / "original.png", base / "proposals" / "overlay.png")
    return result
```

- [ ] **Step 4: Add proposal CLI**

Add import:

```python
from .proposals import generate_proposals
```

Add parser block:

```python
    propose = subparsers.add_parser("propose", help="Generate candidate object proposals")
    propose.add_argument("--run", required=True)
    propose.add_argument("--project-root", default=Path.cwd(), type=Path)
```

Add command branch:

```python
    if args.command == "propose":
        project_root = args.project_root.resolve()
        result = generate_proposals(run_dir(project_root, args.run))
        update_stage(project_root, args.run, "propose", "complete")
        print(f"Proposal status: {result['status']}")
        return 0
```

- [ ] **Step 5: Verify**

Run:

```powershell
python -m pytest tests/test_proposals.py tests/test_run_store.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/art_pipeline tests
git commit -m "Add proposal fallback contract"
```

## Task 10: End-To-End Demo Fixture And Documentation

**Purpose:** prove the core extraction-first loop runs on the demo image with manual annotation data and a simulated Codex repair output.

**Files:**
- Create: `D:\work\art-pipeline-v2-demo\tests\test_end_to_end.py`
- Create: `D:\work\art-pipeline-v2-demo\README.md`

- [ ] **Step 1: Write the end-to-end test**

Create `D:\work\art-pipeline-v2-demo\tests\test_end_to_end.py`:

```python
from __future__ import annotations

from pathlib import Path

from PIL import Image

from art_pipeline.annotations import AnnotationAsset, AnnotationSet, Canvas, rasterize_polygon_mask, write_annotation_set
from art_pipeline.extraction import extract_asset
from art_pipeline.exporter import export_run
from art_pipeline.masks import refine_mask
from art_pipeline.qa import validate_repair_output
from art_pipeline.repair_tasks import create_repair_tasks
from art_pipeline.run_store import create_run, run_dir
from tests.helpers import write_test_png


def test_manual_extraction_to_repair_to_export(tmp_path: Path):
    source = write_test_png(tmp_path / "scene.png", size=(40, 30))
    create_run(tmp_path, "demo", source)
    base = run_dir(tmp_path, "demo")
    rasterize_polygon_mask(
        base / "annotations" / "masks" / "asset_001.png",
        image_size=(40, 30),
        points=[(10, 8), (22, 8), (22, 18), (10, 18)],
    )
    write_annotation_set(
        base / "annotations" / "assets.json",
        AnnotationSet(
            assets=[
                AnnotationAsset(
                    id="asset_001",
                    name="Asset 001",
                    mode="needs_completion",
                    bbox=Canvas(x=10, y=8, w=12, h=10),
                    canvas=Canvas(x=8, y=6, w=18, h=16),
                    mask="annotations/masks/asset_001.png",
                    layer=1,
                )
            ]
        ),
    )
    refine_mask(
        base / "annotations" / "masks" / "asset_001.png",
        base / "masks" / "refined" / "asset_001.png",
        image_size=(40, 30),
    )
    extract_asset(
        base / "source" / "original.png",
        base / "masks" / "refined" / "asset_001.png",
        AnnotationSet.model_validate_json((base / "annotations" / "assets.json").read_text()).assets[0],
        base / "assets" / "incomplete" / "asset_001.png",
    )
    missing = Image.new("L", (18, 16), 0)
    for y in range(11, 14):
        for x in range(8, 12):
            missing.putpixel((x, y), 255)
    (base / "repairs" / "asset_001").mkdir(parents=True)
    missing.save(base / "repairs" / "asset_001" / "missing_mask.png")
    create_repair_tasks(base)
    completed = Image.open(base / "repairs" / "asset_001" / "incomplete_asset.png").convert("RGBA")
    completed.putpixel((9, 12), (220, 120, 80, 255))
    completed.save(base / "repairs" / "asset_001" / "completed_asset.png")
    report = validate_repair_output(base / "repairs" / "asset_001", "asset_001")
    result = export_run(base)

    assert report["status"] == "pass"
    assert result["assetCount"] == 1
    assert (base / "export" / "assets" / "asset_001.png").exists()
    assert (base / "export" / "manifest.json").exists()
```

- [ ] **Step 2: Run the end-to-end test**

Run:

```powershell
python -m pytest tests/test_end_to_end.py -q
```

Expected: PASS.

- [ ] **Step 3: Write README**

Create `D:\work\art-pipeline-v2-demo\README.md`:

```markdown
# Art Pipeline V2 Demo

This project is an extraction-first scene splitting demo.

The source image is the visual source of truth. The pipeline extracts transparent assets from original pixels. Codex is only used as a constrained repair worker for user-marked missing regions.

## Quick Start

```powershell
python -m pip install -e ".[dev]"
python -m art_pipeline ingest --source source-demo/cat-bathroom-core-scene-v5.png --run cat_bathroom_demo
python -m art_pipeline propose --run cat_bathroom_demo
python -m art_pipeline serve --port 8765
```

Open `http://127.0.0.1:8765/ui/` and draw annotation polygons.

After annotation:

```powershell
python -m art_pipeline validate-annotations --run cat_bathroom_demo
python -m art_pipeline refine-masks --run cat_bathroom_demo
python -m art_pipeline extract --run cat_bathroom_demo
python -m art_pipeline create-repair-tasks --run cat_bathroom_demo
```

For each `needs_completion` asset, Codex reads `runs/<run_id>/repairs/<asset_id>/repair_prompt.md` and writes:

```text
completed_asset.png
repair_report.json
```

Then run:

```powershell
python -m art_pipeline validate --run cat_bathroom_demo
python -m art_pipeline export --run cat_bathroom_demo
```

Outputs are written to `runs/<run_id>/export`.
```

- [ ] **Step 4: Run all tests**

Run:

```powershell
python -m pytest -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add README.md tests/test_end_to_end.py
git commit -m "Document extraction-first demo loop"
```

## Manual Demo Run

After all tasks pass, run the real demo image:

```powershell
python -m art_pipeline ingest --source source-demo/cat-bathroom-core-scene-v5.png --run cat_bathroom_demo
python -m art_pipeline propose --run cat_bathroom_demo
python -m art_pipeline serve --port 8765
```

In the browser:

1. load `cat_bathroom_demo`;
2. draw at least three asset polygons;
3. save masks;
4. save annotations;
5. mark at least one asset as `needs_completion`;
6. create a missing mask for that asset.

Then run:

```powershell
python -m art_pipeline validate-annotations --run cat_bathroom_demo
python -m art_pipeline refine-masks --run cat_bathroom_demo
python -m art_pipeline extract --run cat_bathroom_demo
python -m art_pipeline create-repair-tasks --run cat_bathroom_demo
```

For one repair folder, ask Codex to follow `repair_prompt.md` and write `completed_asset.png`.

Then run:

```powershell
python -m art_pipeline validate --run cat_bathroom_demo
python -m art_pipeline export --run cat_bathroom_demo
python -m pytest -q
```

Acceptance evidence:

- `runs/cat_bathroom_demo/assets/incomplete/*.png` contains transparent source-pixel assets.
- `runs/cat_bathroom_demo/repairs/<asset_id>/repair_prompt.md` exists for the completion asset.
- `runs/cat_bathroom_demo/repairs/<asset_id>/qa_report.json` reports preservation and generated area.
- `runs/cat_bathroom_demo/export/manifest.json` records provenance.
- `runs/cat_bathroom_demo/export/contact_sheet.png` exists.

## Plan Self-Review

Spec coverage:

- Source-pixel authority: Tasks 4, 6, and 7.
- Manual annotation source of truth: Tasks 3 and 8.
- Asset canvas for completion: Tasks 3 and 4.
- Codex repair folder contract: Task 5.
- Preserve and missing mask QA: Task 6.
- Export provenance and previews: Task 7.
- No ComfyUI, Diffusers, or API key dependency: reflected in the Python dependency set and repair task contract.
- Model proposal fallback: Task 9.

No unresolved markers remain in this plan. Function names and JSON property names are consistent across tasks.
