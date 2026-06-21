from __future__ import annotations

from fastapi import HTTPException

from art_pipeline.elements import ElementRecord, WorkspaceState, validate_element_id


def select_extraction_targets(
    state: WorkspaceState,
    element_ids: list[str] | None,
) -> list[ElementRecord]:
    if element_ids is None:
        targets = [
            element
            for element in state.elements
            if is_extractable_element(element, include_extracted=False)
        ]
    else:
        by_id = {element.id: element for element in state.elements}
        targets = []
        for element_id in element_ids:
            try:
                validate_element_id(element_id)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            element = by_id.get(element_id)
            if element is None:
                raise HTTPException(status_code=404, detail="Element not found.")
            if not is_extractable_element(element):
                raise HTTPException(
                    status_code=400,
                    detail=f"Element {element.id} is not extractable.",
                )
            targets.append(element)

    if not targets:
        raise HTTPException(status_code=400, detail="No extractable elements selected.")
    return targets


def is_extractable_element(
    element: ElementRecord,
    include_extracted: bool = True,
) -> bool:
    statuses = {"accepted", "extract_ready"}
    if include_extracted:
        statuses.add("extracted")
    return element.status in statuses and element.mode != "rejected"
