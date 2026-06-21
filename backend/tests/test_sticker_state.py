from art_pipeline.detection import DEFAULT_ASSET_VOCABULARY
from art_pipeline.elements import ElementRecord, WorkspaceState
from art_pipeline.vocabulary import normalize_detection_vocabulary


def test_workspace_and_element_defaults_support_sticker_flow() -> None:
    state = WorkspaceState.model_validate({"source": None, "elements": []})
    element = ElementRecord.model_validate(
        {"id": "element_001", "name": "cat", "bbox": {"x": 1, "y": 2, "w": 3, "h": 4}}
    )
    assert "bucket" in state.detectionVocabulary
    assert "bucket" in DEFAULT_ASSET_VOCABULARY
    assert element.assetRole == "sticker"
    assert element.segmentationStatus == "not_started"
    assert element.repairStatus == "not_required"
    assert element.exportStatus == "not_ready"


def test_default_detection_vocabulary_uses_core_demo_objects_only() -> None:
    state = WorkspaceState.model_validate({"source": None, "elements": []})
    assert state.detectionVocabulary == [
        "cat",
        "bathtub",
        "toilet",
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
        "bucket",
        "basin",
    ]
    assert "cat collar" not in state.detectionVocabulary
    assert "floor tile" not in state.detectionVocabulary


def test_detection_vocabulary_normalization() -> None:
    assert normalize_detection_vocabulary([" Cat ", "cat", "water   bucket"]) == ["cat", "water bucket"]
