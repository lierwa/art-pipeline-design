from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from art_pipeline.elements import ElementRecord


@dataclass(frozen=True)
class PlannedExport:
    element: ElementRecord
    source_asset_path: str
    export_asset_path: str
    source_mask_path: str | None
    export_mask_path: str
    derive_mask_from_asset: bool
    warnings: list[str]


@dataclass
class ExportPlan:
    planned: list[PlannedExport]
    blocked: list[dict[str, str]]
    warnings: list[str]
    repair_qa_reports: dict[str, Any]


@dataclass(frozen=True)
class MaterializedExports:
    exported_elements: list[dict[str, Any]]
    manifest_elements: list[dict[str, Any]]
    placements: list[dict[str, Any]]


@dataclass(frozen=True)
class ExportDocuments:
    summary: dict[str, Any]
    manifest: dict[str, Any]
    level: dict[str, Any]
    qa_report: dict[str, Any]
