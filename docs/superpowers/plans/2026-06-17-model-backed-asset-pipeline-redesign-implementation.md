# 基于真实模型的资产拆分管线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved model-backed asset pipeline UI and data flow: real detection provider, reviewable candidates, manual box editing, parent/child split, multi-box merge, segmentation gate, and reviewed export.

**Architecture:** Keep the existing FastAPI + React app, but replace the demo proposal flow with provider-backed asset candidates. Backend owns candidate normalization, filtering, history, split, merge, and export rules. Frontend owns the pipeline shell, canvas selection/editing, asset tree, and context-sensitive actions using the approved reference image at `docs/assets/model-backed-pipeline-ui-v1.png`.

**Tech Stack:** FastAPI, Pydantic, Pillow, pytest, React 18, TypeScript, Vite, Vitest, Testing Library, Hugging Face Transformers Grounding DINO adapter, optional SAM2 adapter.

---

## References

- Product spec: `docs/superpowers/specs/2026-06-17-model-backed-asset-pipeline-redesign.md`
- Approved UI reference: `docs/assets/model-backed-pipeline-ui-v1.png`
- Grounding DINO Transformers model docs: https://huggingface.co/docs/transformers/en/model_doc/grounding-dino
- Grounding DINO tiny model card: https://huggingface.co/IDEA-Research/grounding-dino-tiny
- SAM2 repo: https://github.com/facebookresearch/sam2

## File Structure

Create backend files:

- `backend/art_pipeline/candidates.py` — candidate statuses, history, filtering, NMS, parent/child and merge helpers.
- `backend/art_pipeline/detection.py` — provider protocol, no-provider error, provider result normalization.
- `backend/art_pipeline/model_runners/__init__.py` — model runner package marker.
- `backend/art_pipeline/model_runners/grounding_dino.py` — local Grounding DINO runner using Transformers when model dependencies are installed.
- `backend/tests/test_candidates.py` — focused tests for filtering, NMS, edit, split, merge.
- `backend/tests/test_detection_api.py` — provider-backed detection endpoint tests.

Modify backend files:

- `backend/art_pipeline/elements.py` — extend `ElementRecord` into the candidate schema while preserving the `elements` API field name for this migration.
- `backend/art_pipeline/api.py` — replace `/api/workspace/auto-annotate` with `/api/workspace/detect`, add candidate edit/split/merge endpoints.
- `backend/art_pipeline/exporter.py` — export only accepted reviewed candidates and block missing masks by default.
- `backend/pyproject.toml` — add optional `model` dependencies for local Grounding DINO.
- `backend/tests/test_workspace_api.py` — remove self-validating `cv_proposals` expectations and update old workflow tests.

Create frontend files:

- `frontend/src/components/TopAppBar.tsx` — title, source selector label, run detection, save, export.
- `frontend/src/components/PipelineRail.tsx` — Upload, Detect, Review, Segment, Export stages.
- `frontend/src/components/AssetTreePanel.tsx` — parent/child asset tree and contextual actions.
- `frontend/src/components/ModelStatusStrip.tsx` — provider and count summary.
- `frontend/src/components/CanvasToolbar.tsx` — Select, Edit box, Draw, Split, Merge, Delete, zoom controls.
- `frontend/src/components/SelectionActionPanel.tsx` — single-selection and multi-selection action areas.

Modify frontend files:

- `frontend/src/workspace.ts` — candidate statuses, metadata, history, selection helper types, API response types.
- `frontend/src/App.tsx` — orchestration state, API calls, selection modes, split/merge/edit flows.
- `frontend/src/components/CanvasStage.tsx` — selected boxes, resize handles, drag editing, multi-select, merge preview.
- `frontend/src/styles.css` — implement approved dark pipeline layout.
- `frontend/src/App.test.tsx` — replace old button-flow tests with pipeline, detection, edit, split, merge, and export-guard tests.
- `frontend/package.json` and `frontend/package-lock.json` — add `lucide-react` for toolbar icons.

## Task 1: Candidate Domain Model

**Files:**

- Create: `backend/art_pipeline/candidates.py`
- Modify: `backend/art_pipeline/elements.py`
- Test: `backend/tests/test_candidates.py`

- [ ] **Step 1: Write failing tests for candidate statuses and history**

Add `backend/tests/test_candidates.py`:

```python
from art_pipeline.candidates import (
    CandidateStatus,
    edit_candidate_box,
)
from art_pipeline.elements import BoundingBox, CandidateHistoryEntry, ElementRecord


def test_edit_candidate_box_preserves_model_box_in_history() -> None:
    candidate = ElementRecord(
        id="element_001",
        name="cabinet",
        label="cabinet",
        status="model_detected",
        bbox=BoundingBox(x=10, y=20, w=100, h=120),
        sourceProvider="grounding_dino",
        sourcePrompt="cabinet",
        confidence=0.88,
    )

    edited = edit_candidate_box(
        candidate,
        BoundingBox(x=12, y=24, w=110, h=126),
        reason="manual_box_edit",
    )

    assert edited.status == "edited"
    assert edited.bbox.model_dump() == {"x": 12, "y": 24, "w": 110, "h": 126}
    assert edited.history[-1].kind == "manual_box_edit"
    assert edited.history[-1].before["bbox"] == {"x": 10, "y": 20, "w": 100, "h": 120}
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_candidates.py::test_edit_candidate_box_preserves_model_box_in_history -q
```

Expected: fail because `art_pipeline.candidates` and new fields do not exist.

- [ ] **Step 3: Implement candidate schema**

In `backend/art_pipeline/candidates.py`, add:

```python
from __future__ import annotations

from typing import Literal

from art_pipeline.elements import BoundingBox, ElementRecord


CandidateStatus = Literal[
    "model_detected",
    "edited",
    "child",
    "merged",
    "accepted",
    "rejected",
    "exported",
]

def edit_candidate_box(
    candidate: ElementRecord,
    bbox: BoundingBox,
    reason: str = "manual_box_edit",
) -> ElementRecord:
    before = candidate.model_dump(mode="json")
    edited = candidate.model_copy(
        update={
            "bbox": bbox,
            "canvas": bbox,
            "status": "edited",
        }
    )
    after = edited.model_dump(mode="json")
    history = [
        *candidate.history,
        CandidateHistoryEntry(
            kind=reason,
            before={
                "bbox": before["bbox"],
                "label": before.get("label"),
                "status": before["status"],
            },
            after={
                "bbox": after["bbox"],
                "label": after.get("label"),
                "status": after["status"],
            },
        ),
    ]
    return edited.model_copy(update={"history": history})
```

In `backend/art_pipeline/elements.py`, add the history entry model above `ElementRecord`, then update `ElementStatus` and `ElementRecord` fields:

```python
from datetime import datetime, timezone
from typing import Any


class CandidateHistoryEntry(BaseModel):
    kind: str
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    before: dict[str, Any]
    after: dict[str, Any]
```

```python
ElementStatus = Literal[
    "model_detected",
    "edited",
    "child",
    "merged",
    "accepted",
    "rejected",
    "exported",
]
```

Add fields to `ElementRecord`:

```python
    label: str | None = None
    sourceProvider: str | None = None
    sourcePrompt: str | None = None
    history: list[CandidateHistoryEntry] = Field(default_factory=list)
    mergedInto: str | None = None
    exportParent: bool = False
```

- [ ] **Step 4: Run the candidate test**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_candidates.py::test_edit_candidate_box_preserves_model_box_in_history -q
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/art_pipeline/candidates.py backend/art_pipeline/elements.py backend/tests/test_candidates.py
git commit -m "feat: add reviewed asset candidate model"
```

## Task 2: Detection Provider Contract And No-Fallback API

**Files:**

- Create: `backend/art_pipeline/detection.py`
- Modify: `backend/art_pipeline/api.py`
- Test: `backend/tests/test_detection_api.py`

- [ ] **Step 1: Write failing API tests**

Add `backend/tests/test_detection_api.py`:

```python
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from art_pipeline.api import create_app


def test_detect_fails_when_no_provider_is_configured(tmp_path: Path) -> None:
    app = create_app(workspace_root=tmp_path / "workspace", detection_provider=None)
    client = TestClient(app)
    upload = client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )
    assert upload.status_code == 200

    response = client.post("/api/workspace/detect")

    assert response.status_code == 503
    assert response.json()["detail"] == "Detection provider is not configured."


def make_synthetic_scene_bytes() -> bytes:
    image = Image.new("RGBA", (120, 90), (245, 245, 245, 255))
    for x in range(12, 42):
        for y in range(16, 48):
            image.putpixel((x, y), (220, 64, 64, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_detect_uses_configured_provider_without_cv_fallback(tmp_path: Path) -> None:
    class StaticProvider:
        name = "test_provider"

        def detect(self, image, vocabulary, prompt):
            return [
                {
                    "label": "cabinet",
                    "confidence": 0.88,
                    "bbox": {"x": 10, "y": 12, "w": 30, "h": 40},
                    "sourcePrompt": "cabinet",
                }
            ]

    app = create_app(
        workspace_root=tmp_path / "workspace",
        detection_provider=StaticProvider(),
    )
    client = TestClient(app)
    client.post(
        "/api/workspace/source",
        files={"file": ("scene.png", make_synthetic_scene_bytes(), "image/png")},
    )

    response = client.post("/api/workspace/detect")

    assert response.status_code == 200
    body = response.json()
    assert body["elements"][0]["label"] == "cabinet"
    assert body["elements"][0]["status"] == "model_detected"
    assert body["elements"][0]["sourceProvider"] == "test_provider"
    assert body["elements"][0]["source"] != "auto_cv"
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_detection_api.py -q
```

Expected: fail because `create_app` does not accept `detection_provider` and `/api/workspace/detect` does not exist.

- [ ] **Step 3: Implement provider protocol**

Add `backend/art_pipeline/detection.py`:

```python
from __future__ import annotations

from typing import Protocol

from PIL import Image
from pydantic import BaseModel

from art_pipeline.elements import BoundingBox


DEFAULT_ASSET_VOCABULARY = [
    "cat",
    "bathtub",
    "sink",
    "bathroom cabinet",
    "mirror",
    "window",
    "curtain",
    "towel",
    "basket",
    "stool",
    "bottle",
    "plant",
    "shelf",
    "rug",
]


class DetectionProviderNotConfigured(RuntimeError):
    pass


class DetectionResult(BaseModel):
    label: str
    confidence: float
    bbox: BoundingBox
    sourcePrompt: str


class DetectionProvider(Protocol):
    name: str

    def detect(
        self,
        image: Image.Image,
        vocabulary: list[str],
        prompt: str,
    ) -> list[dict]:
        raise NotImplementedError
```

Avoid adding any CV fallback provider.

- [ ] **Step 4: Add app provider injection and `/detect` route**

In `backend/art_pipeline/api.py`, change signature:

```python
def create_app(workspace_root: Path | None = None, detection_provider=None) -> FastAPI:
```

Inside `create_app`, set:

```python
    app.state.detection_provider = detection_provider
```

Add route near the current auto-annotate route:

```python
    @app.post("/api/workspace/detect")
    def detect_workspace() -> WorkspaceState:
        provider = app.state.detection_provider
        if provider is None:
            raise HTTPException(status_code=503, detail="Detection provider is not configured.")
        root = app.state.workspace_root
        state = _read_state(root)
        if state.source is None:
            raise HTTPException(status_code=400, detail="Upload a source image before detection.")
        source_image = Image.open(_source_path(root))
        source_image.load()
        raw_results = provider.detect(
            source_image,
            DEFAULT_ASSET_VOCABULARY,
            ". ".join(DEFAULT_ASSET_VOCABULARY),
        )
        generated = _detection_results_to_elements(root, state, source_image, provider.name, raw_results)
        next_state = WorkspaceState(source=state.source, elements=generated)
        _write_state(root, next_state)
        return next_state
```

Add helper `_detection_results_to_elements` using `ElementRecord` with `status="model_detected"`, `label=result["label"]`, `sourceProvider=provider.name`, `sourcePrompt=result["sourcePrompt"]`, `confidence=result["confidence"]`, and `bbox=BoundingBox.model_validate(result["bbox"])`.

- [ ] **Step 5: Run tests**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_detection_api.py -q
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add backend/art_pipeline/detection.py backend/art_pipeline/api.py backend/tests/test_detection_api.py
git commit -m "feat: add model detection provider endpoint"
```

## Task 3: Filtering And Duplicate Suppression

**Files:**

- Modify: `backend/art_pipeline/candidates.py`
- Modify: `backend/art_pipeline/api.py`
- Test: `backend/tests/test_candidates.py`

- [ ] **Step 1: Write filtering and NMS tests**

Add tests to `backend/tests/test_candidates.py`:

```python
from art_pipeline.candidates import filter_detection_results


def test_filter_detection_results_drops_generic_and_out_of_vocab_labels() -> None:
    raw = [
        {"label": "cabinet", "confidence": 0.88, "bbox": {"x": 0, "y": 0, "w": 50, "h": 50}, "sourcePrompt": "cabinet"},
        {"label": "bathroom", "confidence": 0.99, "bbox": {"x": 0, "y": 0, "w": 100, "h": 100}, "sourcePrompt": "bathroom"},
        {"label": "basket stool", "confidence": 0.70, "bbox": {"x": 10, "y": 10, "w": 20, "h": 20}, "sourcePrompt": "basket stool"},
    ]

    filtered = filter_detection_results(raw, vocabulary=["cabinet", "basket", "stool"], min_confidence=0.45)

    assert [item["label"] for item in filtered] == ["cabinet"]


def test_filter_detection_results_runs_nms_per_label() -> None:
    raw = [
        {"label": "plant", "confidence": 0.90, "bbox": {"x": 10, "y": 10, "w": 100, "h": 100}, "sourcePrompt": "plant"},
        {"label": "plant", "confidence": 0.80, "bbox": {"x": 12, "y": 12, "w": 96, "h": 96}, "sourcePrompt": "plant"},
        {"label": "bottle", "confidence": 0.82, "bbox": {"x": 12, "y": 12, "w": 96, "h": 96}, "sourcePrompt": "bottle"},
    ]

    filtered = filter_detection_results(raw, vocabulary=["plant", "bottle"], min_confidence=0.45)

    assert [(item["label"], item["confidence"]) for item in filtered] == [
        ("plant", 0.90),
        ("bottle", 0.82),
    ]
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_candidates.py::test_filter_detection_results_drops_generic_and_out_of_vocab_labels backend/tests/test_candidates.py::test_filter_detection_results_runs_nms_per_label -q
```

Expected: fail because `filter_detection_results` does not exist.

- [ ] **Step 3: Implement filtering helpers**

In `backend/art_pipeline/candidates.py`, add:

```python
GENERIC_LABELS = {
    "bathroom",
    "room",
    "wall",
    "floor",
    "object",
    "furniture",
    "background",
}


def filter_detection_results(
    raw_results: list[dict],
    vocabulary: list[str],
    min_confidence: float = 0.45,
    nms_iou_threshold: float = 0.65,
) -> list[dict]:
    vocab = {label.strip().lower() for label in vocabulary}
    filtered = []
    for item in raw_results:
        label = str(item["label"]).strip().lower()
        if label in GENERIC_LABELS:
            continue
        if label not in vocab:
            continue
        if float(item["confidence"]) < min_confidence:
            continue
        filtered.append({**item, "label": label, "confidence": float(item["confidence"])})
    filtered.sort(key=lambda item: item["confidence"], reverse=True)
    kept: list[dict] = []
    for item in filtered:
        if any(
            item["label"] == existing["label"]
            and _box_iou(item["bbox"], existing["bbox"]) > nms_iou_threshold
            for existing in kept
        ):
            continue
        kept.append(item)
    return kept


def _box_iou(left: dict, right: dict) -> float:
    left_x1 = left["x"]
    left_y1 = left["y"]
    left_x2 = left["x"] + left["w"]
    left_y2 = left["y"] + left["h"]
    right_x1 = right["x"]
    right_y1 = right["y"]
    right_x2 = right["x"] + right["w"]
    right_y2 = right["y"] + right["h"]
    intersection_x1 = max(left_x1, right_x1)
    intersection_y1 = max(left_y1, right_y1)
    intersection_x2 = min(left_x2, right_x2)
    intersection_y2 = min(left_y2, right_y2)
    if intersection_x2 <= intersection_x1 or intersection_y2 <= intersection_y1:
        return 0.0
    intersection = (intersection_x2 - intersection_x1) * (intersection_y2 - intersection_y1)
    left_area = left["w"] * left["h"]
    right_area = right["w"] * right["h"]
    return intersection / (left_area + right_area - intersection)
```

- [ ] **Step 4: Wire filtering into `/detect`**

In `backend/art_pipeline/api.py`, call `filter_detection_results` before converting provider results to elements.

- [ ] **Step 5: Run backend detection tests**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_candidates.py backend/tests/test_detection_api.py -q
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add backend/art_pipeline/candidates.py backend/art_pipeline/api.py backend/tests/test_candidates.py
git commit -m "feat: filter model detection candidates"
```

## Task 4: Candidate Edit, Split, And Merge APIs

**Files:**

- Modify: `backend/art_pipeline/candidates.py`
- Modify: `backend/art_pipeline/api.py`
- Test: `backend/tests/test_workspace_api.py`

- [ ] **Step 1: Write API tests for edit, child, and merge**

Add tests to `backend/tests/test_workspace_api.py`:

```python
def test_patch_element_updates_box_and_status(client: TestClient) -> None:
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "cabinet",
                "label": "cabinet",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
                "sourceProvider": "test_provider",
                "sourcePrompt": "cabinet",
                "confidence": 0.88,
            }
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.patch(
        "/api/workspace/elements/element_001",
        json={"bbox": {"x": 12, "y": 22, "w": 35, "h": 45}, "label": "bathroom cabinet"},
    )

    assert response.status_code == 200
    element = response.json()["state"]["elements"][0]
    assert element["status"] == "edited"
    assert element["label"] == "bathroom cabinet"
    assert element["history"][-1]["kind"] == "manual_edit"


def test_post_child_element_preserves_parent(client: TestClient) -> None:
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "cabinet",
                "label": "cabinet",
                "status": "model_detected",
                "bbox": {"x": 10, "y": 20, "w": 80, "h": 60},
                "sourceProvider": "test_provider",
                "sourcePrompt": "cabinet",
                "confidence": 0.88,
            }
        ],
    }
    client.put("/api/workspace/state", json=state)

    response = client.post(
        "/api/workspace/elements/element_001/children",
        json={"label": "pink bottle", "bbox": {"x": 30, "y": 36, "w": 10, "h": 20}},
    )

    assert response.status_code == 200
    elements = response.json()["state"]["elements"]
    assert elements[0]["id"] == "element_001"
    assert elements[1]["parentId"] == "element_001"
    assert elements[1]["status"] == "child"


def test_merge_elements_creates_new_candidate_and_hides_originals(client: TestClient) -> None:
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {"id": "element_001", "name": "plant a", "label": "plant", "status": "model_detected", "bbox": {"x": 10, "y": 10, "w": 20, "h": 20}},
            {"id": "element_002", "name": "plant b", "label": "plant", "status": "model_detected", "bbox": {"x": 26, "y": 12, "w": 18, "h": 22}},
        ],
    }
    client.put("/api/workspace/state", json=state)

    response = client.post(
        "/api/workspace/elements/merge",
        json={"elementIds": ["element_001", "element_002"], "label": "plant"},
    )

    assert response.status_code == 200
    elements = response.json()["state"]["elements"]
    merged = [element for element in elements if element["status"] == "merged"][0]
    assert merged["bbox"] == {"x": 10, "y": 10, "w": 34, "h": 24}
    assert {elements[0]["mergedInto"], elements[1]["mergedInto"]} == {merged["id"]}
```

- [ ] **Step 2: Run failing API tests**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_workspace_api.py::test_patch_element_updates_box_and_status backend/tests/test_workspace_api.py::test_post_child_element_preserves_parent backend/tests/test_workspace_api.py::test_merge_elements_creates_new_candidate_and_hides_originals -q
```

Expected: fail because endpoints do not exist.

- [ ] **Step 3: Implement candidate operations**

In `backend/art_pipeline/candidates.py`, add helpers:

```python
def union_boxes(boxes: list[BoundingBox]) -> BoundingBox:
    left = min(box.x for box in boxes)
    top = min(box.y for box in boxes)
    right = max(box.x + box.w for box in boxes)
    bottom = max(box.y + box.h for box in boxes)
    return BoundingBox(x=left, y=top, w=right - left, h=bottom - top)


def create_child_candidate(parent: ElementRecord, child_id: str, label: str, bbox: BoundingBox) -> ElementRecord:
    return ElementRecord(
        id=child_id,
        name=label,
        label=label,
        status="child",
        bbox=bbox,
        canvas=bbox,
        parentId=parent.id,
        source="manual_child",
        sourceProvider="manual",
        sourcePrompt=label,
        confidence=None,
    )
```

- [ ] **Step 4: Add edit, child, and merge routes**

In `backend/art_pipeline/api.py`, add:

```python
    @app.patch("/api/workspace/elements/{element_id}")
    def patch_element(element_id: str, payload: dict) -> dict:
        root = app.state.workspace_root
        state = _read_state(root)
        elements = []
        updated = None
        for element in state.elements:
            if element.id != element_id:
                elements.append(element)
                continue
            bbox = BoundingBox.model_validate(payload.get("bbox", element.bbox.model_dump()))
            updated = edit_candidate_box(element, bbox, reason="manual_edit")
            if "label" in payload:
                updated = updated.model_copy(update={"label": payload["label"], "name": payload["label"]})
            elements.append(updated)
        if updated is None:
            raise HTTPException(status_code=404, detail="Element not found.")
        next_state = WorkspaceState(source=state.source, elements=elements)
        _write_state(root, next_state)
        return {"element": updated.model_dump(mode="json"), "state": next_state.model_dump(mode="json")}
```

Add matching child and merge routes with `next_element_id`, `create_child_candidate`, and `union_boxes`.

- [ ] **Step 5: Run API tests**

Run:

```bash
.venv/bin/python -m pytest backend/tests/test_workspace_api.py::test_patch_element_updates_box_and_status backend/tests/test_workspace_api.py::test_post_child_element_preserves_parent backend/tests/test_workspace_api.py::test_merge_elements_creates_new_candidate_and_hides_originals -q
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add backend/art_pipeline/candidates.py backend/art_pipeline/api.py backend/tests/test_workspace_api.py
git commit -m "feat: add candidate edit split and merge APIs"
```

## Task 5: Frontend Types And API Client Calls

**Files:**

- Modify: `frontend/src/workspace.ts`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing frontend API-flow tests**

In `frontend/src/App.test.tsx`, add:

```typescript
it("runs model detection through the detect endpoint", async () => {
  const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/workspace/state") {
      return jsonResponse({ source: loadedState.source, elements: [] });
    }
    if (input === "/api/workspace/detect" && init?.method === "POST") {
      return jsonResponse({
        source: loadedState.source,
        elements: [
          {
            id: "element_001",
            name: "cabinet",
            label: "cabinet",
            status: "model_detected",
            bbox: { x: 10, y: 20, w: 30, h: 40 },
            canvas: { x: 10, y: 20, w: 30, h: 40 },
            sourceProvider: "grounding_dino",
            sourcePrompt: "cabinet",
            confidence: 0.88,
            parentId: null,
            history: [],
            visible: true,
          },
        ],
      });
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  });

  try {
    render(<App />);
    await screen.findByText("Art Asset Pipeline");
    await userEvent.click(screen.getByRole("button", { name: /Run Detection|运行检测/i }));
    expect(await screen.findByText("cabinet")).toBeInTheDocument();
  } finally {
    restoreFetch();
  }
});
```

- [ ] **Step 2: Run failing frontend test**

Run:

```bash
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm test -- --run src/App.test.tsx -t "runs model detection"
```

Expected: fail because app still calls `/api/workspace/auto-annotate`.

- [ ] **Step 3: Update frontend candidate types**

In `frontend/src/workspace.ts`, replace `ElementStatus` with:

```typescript
export type ElementStatus =
  | "model_detected"
  | "edited"
  | "child"
  | "merged"
  | "accepted"
  | "rejected"
  | "exported";
```

Add fields to `WorkspaceElement`:

```typescript
  label: string | null;
  sourceProvider: string | null;
  sourcePrompt: string | null;
  history: Array<{
    kind: string;
    at: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }>;
  mergedInto: string | null;
  exportParent: boolean;
```

Update `normalizeWorkspaceState` defaults for new fields.

- [ ] **Step 4: Point detection call at new endpoint**

In `frontend/src/App.tsx`, rename `handleAutoAnnotate` to `handleRunDetection` and change fetch URL to `/api/workspace/detect`. Set status strings to Chinese or concise English matching the reference image.

- [ ] **Step 5: Run frontend test**

Run:

```bash
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm test -- --run src/App.test.tsx -t "runs model detection"
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/workspace.ts frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: wire frontend to model detection endpoint"
```

## Task 6: Pipeline Shell Matching Approved Reference

**Files:**

- Create: `frontend/src/components/TopAppBar.tsx`
- Create: `frontend/src/components/PipelineRail.tsx`
- Create: `frontend/src/components/ModelStatusStrip.tsx`
- Create: `frontend/src/components/CanvasToolbar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Install icons**

Run:

```bash
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm install lucide-react@^0.468.0
```

Expected: `package.json` and `package-lock.json` update with `lucide-react`.

- [ ] **Step 2: Write shell layout test**

In `frontend/src/App.test.tsx`, add:

```typescript
it("shows the pipeline rail, canvas toolbar, asset panel, and model status strip", async () => {
  const restoreFetch = installFetchMock(async (input: RequestInfo | URL) => {
    if (input === "/api/workspace/state") {
      return jsonResponse({ source: loadedState.source, elements: [] });
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  });

  try {
    render(<App />);
    expect(await screen.findByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Detect")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Segment")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit box/i })).toBeInTheDocument();
    expect(screen.getByText(/GroundingDINO/)).toBeInTheDocument();
  } finally {
    restoreFetch();
  }
});
```

- [ ] **Step 3: Run failing shell test**

Run:

```bash
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm test -- --run src/App.test.tsx -t "pipeline rail"
```

Expected: fail because new shell components do not exist.

- [ ] **Step 4: Add shell components**

Create components with explicit props:

```typescript
export type PipelineStep = {
  id: "upload" | "detect" | "review" | "segment" | "export";
  label: string;
  detail: string;
  state: "done" | "active" | "blocked";
};
```

`PipelineRail` renders the five steps. `TopAppBar` renders title, filename, Run Detection, Save, Export. `CanvasToolbar` renders icon buttons for Select, Edit box, Draw, Split, Merge, Delete. `ModelStatusStrip` renders provider and counts.

- [ ] **Step 5: Replace old top toolbar and grid CSS**

In `App.tsx`, render the shell with concrete component props:

```tsx
<div className="pipeline-app-shell">
  <TopAppBar
    source={workspace.source}
    isDetecting={isAnnotating}
    onRunDetection={() => void handleRunDetection()}
    onSave={() => void handleSaveElement()}
    onExport={() => void handleExportAssetPack()}
  />
  <main className="pipeline-workbench">
    <PipelineRail steps={pipelineSteps} />
    <section className="canvas-work-area">
      <CanvasToolbar tool={tool} onSelectTool={handleSelectTool} zoomPercent={80} />
      <CanvasStage
        sourceUrl={sourceUrl}
        source={workspace.source}
        overlays={overlays}
        overlayElements={overlayElements}
        selectedElementId={selectedElementId}
        sourceDetails={sourceDetails}
        tool={tool}
        draftRegion={draftRegion}
        splitRegions={splitRegions}
        missingMaskRegion={missingMaskRegion}
        assetCacheKey={assetCacheKey}
        canSplit={selectedElement !== null}
        canDrawMissingMask={canDrawMissingMask}
        onToggleOverlay={handleOverlayToggle}
        onSelectTool={handleSelectTool}
        onDraftRegionChange={setDraftRegion}
        onAddSplitRegion={(region) => setSplitRegions((current) => [...current, region])}
        onMissingMaskRegionChange={setMissingMaskRegion}
        onCompleteMissingMaskRegion={(region) => void handleCompleteMissingMaskRegion(region)}
        onClearDrafts={clearDrafts}
        onApplySplit={() => void handleApplySplit()}
      />
    </section>
    <AssetTreePanel
      elements={workspace.elements}
      selectedElementIds={selectedElementIds}
      onSelectElement={handleSelectElement}
      onToggleElementSelection={handleToggleElementSelection}
    />
  </main>
  <ModelStatusStrip providerName="GroundingDINO + SAM2" elements={workspace.elements} warnings={warnings} />
</div>
```

In `styles.css`, define `.pipeline-app-shell`, `.pipeline-workbench`, `.pipeline-rail`, `.canvas-work-area`, `.asset-tree-panel`, `.model-status-strip`.

- [ ] **Step 6: Run shell test**

Run:

```bash
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm test -- --run src/App.test.tsx -t "pipeline rail"
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/components/TopAppBar.tsx frontend/src/components/PipelineRail.tsx frontend/src/components/ModelStatusStrip.tsx frontend/src/components/CanvasToolbar.tsx frontend/src/styles.css
git commit -m "feat: add pipeline workbench shell"
```

## Task 7: Asset Tree And Contextual Actions

**Files:**

- Create: `frontend/src/components/AssetTreePanel.tsx`
- Create: `frontend/src/components/SelectionActionPanel.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Write asset tree tests**

Add:

```typescript
it("renders parent children and switches actions for single and multi selection", async () => {
  const treeState = {
    source: loadedState.source,
    elements: [
      {
        id: "element_001",
        name: "cabinet",
        label: "cabinet",
        status: "edited",
        bbox: { x: 10, y: 10, w: 80, h: 90 },
        canvas: { x: 10, y: 10, w: 80, h: 90 },
        parentId: null,
        sourceProvider: "grounding_dino",
        sourcePrompt: "cabinet",
        confidence: 0.88,
        history: [],
        visible: true,
      },
      {
        id: "element_002",
        name: "plant",
        label: "plant",
        status: "child",
        bbox: { x: 20, y: 20, w: 20, h: 20 },
        canvas: { x: 20, y: 20, w: 20, h: 20 },
        parentId: "element_001",
        sourceProvider: "manual",
        sourcePrompt: "plant",
        confidence: 0.86,
        history: [],
        visible: true,
      },
    ],
  };
  const restoreFetch = installFetchMock(async (input: RequestInfo | URL) => {
    if (input === "/api/workspace/state") return jsonResponse(treeState);
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  });

  try {
    render(<App />);
    expect(await screen.findByText("cabinet")).toBeInTheDocument();
    expect(screen.getByText("plant")).toBeInTheDocument();
    await userEvent.click(screen.getByText("cabinet"));
    expect(screen.getByRole("button", { name: /Add child/i })).toBeInTheDocument();
  } finally {
    restoreFetch();
  }
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm test -- --run src/App.test.tsx -t "renders parent children"
```

Expected: fail because asset tree does not exist.

- [ ] **Step 3: Implement tree grouping**

Create `AssetTreePanel.tsx` that groups root candidates by `parentId === null`, nests children by `parentId`, and hides `mergedInto !== null` by default.

- [ ] **Step 4: Implement contextual actions**

Create `SelectionActionPanel.tsx`:

- no selection: shows Run Detection.
- one selection: shows Edit box, Add child, Run detect inside, Split parent, Accept.
- multiple selections: shows selected count and Merge into one asset.

- [ ] **Step 5: Run asset tree test**

Run:

```bash
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm test -- --run src/App.test.tsx -t "renders parent children"
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/components/AssetTreePanel.tsx frontend/src/components/SelectionActionPanel.tsx frontend/src/styles.css
git commit -m "feat: add asset tree review actions"
```

## Task 8: Canvas Selection, Box Editing, And Merge Preview

**Files:**

- Modify: `frontend/src/components/CanvasStage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Write canvas edit test**

Add:

```typescript
it("edits the selected box with drag handles and sends a patch request", async () => {
  const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/workspace/state") return jsonResponse(loadedState);
    if (input === "/api/workspace/elements/element_001" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      expect(body.bbox.w).toBeGreaterThan(30);
      return jsonResponse({ element: { ...loadedState.elements[0], status: "edited" }, state: loadedState });
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  });

  try {
    render(<App />);
    await screen.findByText("Region 1");
    await userEvent.click(screen.getByText("Region 1"));
    await userEvent.click(screen.getByRole("button", { name: /Edit box/i }));
    const handle = await screen.findByTestId("resize-handle-element_001-se");
    fireEvent.pointerDown(handle, { clientX: 210, clientY: 190 });
    fireEvent.pointerMove(handle, { clientX: 260, clientY: 220 });
    fireEvent.pointerUp(handle, { clientX: 260, clientY: 220 });
    await userEvent.click(screen.getByRole("button", { name: /Apply/i }));
  } finally {
    restoreFetch();
  }
});
```

- [ ] **Step 2: Run failing canvas test**

Run:

```bash
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm test -- --run src/App.test.tsx -t "edits the selected box"
```

Expected: fail because resize handles and edit mode do not exist.

- [ ] **Step 3: Add canvas edit mode**

In `CanvasStage.tsx`, add props:

```typescript
editingElementId: string | null;
selectedElementIds: string[];
mergePreview: Box | null;
onBoxDraftChange: (elementId: string, bbox: Box) => void;
```

Render eight handles for the selected editing element with test ids:

```text
resize-handle-${element.id}-nw
resize-handle-${element.id}-n
resize-handle-${element.id}-ne
resize-handle-${element.id}-e
resize-handle-${element.id}-se
resize-handle-${element.id}-s
resize-handle-${element.id}-sw
resize-handle-${element.id}-w
```

- [ ] **Step 4: Add keyboard nudging**

In `App.tsx`, add `keydown` handling while edit mode is active:

- Arrow keys move selected draft by 1px.
- Shift + Arrow keys move by 10px.

- [ ] **Step 5: Add merge preview rendering**

When multiple candidates are selected, compute union bbox in frontend and pass it as `mergePreview`. Canvas renders dashed amber outline matching the approved reference.

- [ ] **Step 6: Run canvas tests**

Run:

```bash
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm test -- --run src/App.test.tsx -t "edits the selected box"
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/components/CanvasStage.tsx frontend/src/styles.css
git commit -m "feat: add canvas box editing and merge preview"
```

## Task 9: Local Grounding DINO Runner And Segmentation Gate

**Files:**

- Modify: `backend/pyproject.toml`
- Create: `backend/art_pipeline/model_runners/grounding_dino.py`
- Modify: `backend/art_pipeline/api.py`
- Modify: `backend/art_pipeline/exporter.py`
- Test: `backend/tests/test_detection_api.py`
- Test: `backend/tests/test_workspace_api.py`

- [ ] **Step 1: Add optional model dependencies**

In the existing `[project.optional-dependencies]` block in `backend/pyproject.toml`, keep the current `dev` list and add this sibling `model` list:

```toml
model = [
  "torch>=2.2",
  "torchvision>=0.17",
  "transformers>=4.45",
  "safetensors>=0.4",
]
```

Keep model dependencies optional so normal tests do not download model weights.

- [ ] **Step 2: Write runner smoke test with monkeypatched Transformers objects**

Add to `backend/tests/test_detection_api.py`:

```python
def test_grounding_dino_provider_formats_prompt_and_normalizes_results(monkeypatch: pytest.MonkeyPatch) -> None:
    import torch
    from PIL import Image

    class FakeInputs(dict):
        input_ids = torch.tensor([[1, 2, 3]])

        def to(self, device):
            return self

    class FakeProcessor:
        captured_text = ""

        def __call__(self, images, text, return_tensors):
            FakeProcessor.captured_text = text
            return FakeInputs(pixel_values=torch.zeros((1, 3, 8, 8)))

        def post_process_grounded_object_detection(self, outputs, input_ids, box_threshold, text_threshold, target_sizes):
            return [
                {
                    "scores": torch.tensor([0.88]),
                    "labels": ["cabinet"],
                    "boxes": torch.tensor([[10.0, 12.0, 40.0, 52.0]]),
                }
            ]

    class FakeModel:
        def to(self, device):
            return self

        def __call__(self, **inputs):
            return object()

    class FakeAutoProcessor:
        @staticmethod
        def from_pretrained(model_id):
            return FakeProcessor()

    class FakeAutoModel:
        @staticmethod
        def from_pretrained(model_id):
            return FakeModel()

    import art_pipeline.model_runners.grounding_dino as module

    monkeypatch.setattr(module, "AutoProcessor", FakeAutoProcessor)
    monkeypatch.setattr(module, "AutoModelForZeroShotObjectDetection", FakeAutoModel)
    monkeypatch.setattr(module.torch.backends.mps, "is_available", lambda: False)

    provider = module.GroundingDinoProvider()
    results = provider.detect(Image.new("RGB", (100, 80)), ["cabinet", "plant"], "ignored")

    assert FakeProcessor.captured_text == "cabinet. plant."
    assert results == [
        {
            "label": "cabinet",
            "confidence": 0.88,
            "bbox": {"x": 10, "y": 12, "w": 30, "h": 40},
            "sourcePrompt": "cabinet",
        }
    ]
```

- [ ] **Step 3: Implement GroundingDinoProvider**

Create `backend/art_pipeline/model_runners/grounding_dino.py`:

```python
from __future__ import annotations

import torch
from PIL import Image
from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor


class GroundingDinoProvider:
    name = "grounding_dino"

    def __init__(self, model_id: str = "IDEA-Research/grounding-dino-tiny") -> None:
        self.model_id = model_id
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.processor = AutoProcessor.from_pretrained(model_id)
        self.model = AutoModelForZeroShotObjectDetection.from_pretrained(model_id).to(self.device)

    def detect(self, image: Image.Image, vocabulary: list[str], prompt: str) -> list[dict]:
        text = ". ".join(vocabulary) + "."
        inputs = self.processor(images=image.convert("RGB"), text=text, return_tensors="pt").to(self.device)
        with torch.no_grad():
            outputs = self.model(**inputs)
        target_sizes = torch.tensor([image.size[::-1]], device=self.device)
        processed = self.processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            box_threshold=0.35,
            text_threshold=0.25,
            target_sizes=target_sizes,
        )[0]
        results = []
        for score, label, box in zip(processed["scores"], processed["labels"], processed["boxes"]):
            x1, y1, x2, y2 = [float(value) for value in box.tolist()]
            results.append(
                {
                    "label": str(label).strip().lower(),
                    "confidence": round(float(score), 4),
                    "bbox": {
                        "x": round(x1),
                        "y": round(y1),
                        "w": round(x2 - x1),
                        "h": round(y2 - y1),
                    },
                    "sourcePrompt": str(label).strip().lower(),
                }
            )
        return results
```

- [ ] **Step 4: Configure provider only when explicitly requested**

In `api.py`, keep default `detection_provider=None`. Add a small factory that reads `ART_PIPELINE_DETECTION_PROVIDER=grounding_dino` for local manual runs. If unset, detection returns 503.

- [ ] **Step 5: Add export mask blocking test**

In `backend/tests/test_workspace_api.py`, add:

```python
def test_export_blocks_accepted_candidates_without_masks(client: TestClient) -> None:
    state = {
        "source": {"filename": "original.png", "path": "source/original.png", "width": 120, "height": 90},
        "elements": [
            {
                "id": "element_001",
                "name": "cabinet",
                "label": "cabinet",
                "status": "accepted",
                "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
                "canvas": {"x": 10, "y": 20, "w": 30, "h": 40},
                "mask": None,
                "sourceProvider": "grounding_dino",
                "sourcePrompt": "cabinet",
                "confidence": 0.88,
                "history": [],
                "visible": True,
            }
        ],
    }
    assert client.put("/api/workspace/state", json=state).status_code == 200

    response = client.post("/api/workspace/export", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["exportableCount"] == 0
    assert body["blockedCount"] == 1
    assert body["blockedElements"][0]["reason"] == "accepted_asset_missing_mask"
```

- [ ] **Step 6: Update exporter rule**

In `backend/art_pipeline/exporter.py`, block accepted candidates with `mask is None` unless an explicit debug export flag is present.

- [ ] **Step 7: Run backend tests**

Run:

```bash
.venv/bin/python -m pytest backend/tests -q
```

Expected: pass without requiring model weights.

- [ ] **Step 8: Commit**

```bash
git add backend/pyproject.toml backend/art_pipeline/model_runners/__init__.py backend/art_pipeline/model_runners/grounding_dino.py backend/art_pipeline/api.py backend/art_pipeline/exporter.py backend/tests/test_detection_api.py backend/tests/test_workspace_api.py
git commit -m "feat: add configurable grounding dino detection runner"
```

## Task 10: Remove Legacy Auto-CV Flow And Final Verification

**Files:**

- Modify: `backend/art_pipeline/proposals.py`
- Modify: `backend/art_pipeline/api.py`
- Modify: `backend/tests/test_workspace_api.py`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `README.md`

- [ ] **Step 1: Delete product usage of `/auto-annotate`**

Remove the frontend Auto Annotate button and remove calls to `/api/workspace/auto-annotate`. Keep no visible UI path to `cv_proposals`.

- [ ] **Step 2: Make old auto-annotate endpoint return a migration error or delete it**

Preferred behavior:

```python
@app.post("/api/workspace/auto-annotate")
def auto_annotate_removed() -> None:
    raise HTTPException(
        status_code=410,
        detail="Auto annotate was replaced by model-backed detection. Use /api/workspace/detect.",
    )
```

- [ ] **Step 3: Remove self-validating CV tests**

Delete tests that assert `cv_proposals` returns "some" candidates for demo images. Replace them with tests for the 410 endpoint and provider-backed detection.

- [ ] **Step 4: Update README**

Document:

- How to start backend and frontend.
- Detection requires `ART_PIPELINE_DETECTION_PROVIDER=grounding_dino`.
- No-provider detection returns a clear error.
- Accepted assets require masks for default export.
- Approved UI reference lives at `docs/assets/model-backed-pipeline-ui-v1.png`.

- [ ] **Step 5: Run full verification**

Run:

```bash
.venv/bin/python -m pytest backend/tests -q
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm test -- --run
cd frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm run build
```

Expected:

- Backend tests pass.
- Frontend tests pass.
- Frontend build exits 0.

- [ ] **Step 6: Manual browser verification**

Start the app and verify against `docs/assets/model-backed-pipeline-ui-v1.png`:

```bash
screen -dmS art-pipeline-backend zsh -lc 'cd /Users/guojunxi/Desktop/work/word-book-repos/art-pipeline-design && .venv/bin/python -m uvicorn art_pipeline.api:app --reload --app-dir backend --host 127.0.0.1 --port 8000'
screen -dmS art-pipeline-frontend zsh -lc 'cd /Users/guojunxi/Desktop/work/word-book-repos/art-pipeline-design/frontend && /Users/guojunxi/.nvm/versions/node/v21.7.3/bin/npm run dev -- --host 127.0.0.1 --port 5174'
```

Open `http://127.0.0.1:5174/` and check:

- left pipeline rail is visible.
- central canvas dominates.
- right asset tree supports parent/child rows.
- selecting a candidate shows single-selection actions.
- selecting multiple candidates shows merge action.
- Run Detection fails clearly when provider is not configured.

- [ ] **Step 7: Commit**

```bash
git add README.md backend/art_pipeline/proposals.py backend/art_pipeline/api.py backend/tests/test_workspace_api.py frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "chore: remove legacy auto cv annotation flow"
```

## Self-Review Checklist

- Spec coverage: tasks cover real detection, no heuristic fallback, pipeline layout, box editing, split, merge, asset tree, export mask gate, and non-self-validating tests.
- Scope split: this is one integrated implementation plan because backend candidate semantics and frontend review UI must change together to produce a usable pipeline. Repair and inpainting remain out of scope.
- Type consistency: backend `ElementRecord` and frontend `WorkspaceElement` both use `label`, `sourceProvider`, `sourcePrompt`, `history`, `mergedInto`, `exportParent`, and the same candidate statuses.
- Verification: every task has a failing test step, passing test step, and commit step.
