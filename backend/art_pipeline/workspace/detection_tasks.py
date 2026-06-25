from __future__ import annotations

import threading
import time
from pathlib import Path

from fastapi import HTTPException

from art_pipeline.detection import DetectionProvider
from art_pipeline.detection_results import (
    detection_result_to_element,
    iter_detection_results,
)
from art_pipeline.elements import ElementRecord
from art_pipeline.http.helpers import require_source_image
from art_pipeline.workspace.state_updates import replace_workspace_elements
from art_pipeline.workspace.store import (
    clear_generated_workspace_outputs,
    read_state,
    write_state,
)
from art_pipeline.workspace.tasks import (
    WorkspaceTask,
    WorkspaceTaskItem,
    append_task_item,
    create_workspace_task,
    read_workspace_task,
    replace_task_items,
    set_task_item_status,
)


DETECTION_PROVIDER_ITEM_ID = "__detection_provider__"
DETECTION_STREAM_ITEM_DELAY_SECONDS = 0.08


def start_detection_batch(root: Path, provider: DetectionProvider) -> WorkspaceTask:
    task = create_workspace_task(
        root,
        "detection_batch",
        [
            WorkspaceTaskItem(
                elementId=DETECTION_PROVIDER_ITEM_ID,
                name="Detection provider",
                message="Running detection provider.",
            )
        ],
    )
    task = set_task_item_status(
        root,
        task.taskId,
        DETECTION_PROVIDER_ITEM_ID,
        "running",
        "Running detection provider.",
    )
    thread = threading.Thread(
        target=_run_detection_batch,
        args=(root, task.taskId, provider),
        daemon=True,
    )
    thread.start()
    return task


def _run_detection_batch(root: Path, task_id: str, provider: DetectionProvider) -> None:
    source_image = require_source_image(root)
    original_state = read_state(root)
    write_state(root, replace_workspace_elements(original_state, []))
    set_task_item_status(
        root,
        task_id,
        DETECTION_PROVIDER_ITEM_ID,
        "running",
        "Clearing previous detection candidates.",
    )

    wrote_any = False
    next_index = 1
    try:
        for result in iter_detection_results(provider, source_image, original_state.detectionVocabulary):
            if not wrote_any:
                clear_generated_workspace_outputs(root)
                write_state(root, replace_workspace_elements(read_state(root), []))
            element_id = f"element_{next_index:03d}"
            item = WorkspaceTaskItem(
                elementId=element_id,
                name=result.label,
                message="Waiting to stream detection candidate.",
            )
            append_task_item(root, task_id, item)
            set_task_item_status(
                root,
                task_id,
                item.elementId,
                "running",
                "Preparing detection candidate.",
            )
            try:
                element = detection_result_to_element(
                    root,
                    source_image,
                    provider.name,
                    result,
                    item.elementId,
                    next_index,
                )
                _append_detected_element(root, element)
                wrote_any = True
                set_task_item_status(
                    root,
                    task_id,
                    item.elementId,
                    "succeeded",
                    "Detection candidate ready.",
                    {"thumbnail": element.thumbnail},
                )
                next_index += 1
            except Exception as exc:  # noqa: BLE001 - each streamed candidate must fail independently.
                set_task_item_status(root, task_id, item.elementId, "failed", str(exc))
            # WHY: provider chunk 可能一次返回多框；短暂停顿让基于 SSE 快照刷新的第一版 UI
            # 能明确看到候选框逐个落到主画布。若后续改成真正写入事件流，可删除这个 UX 间隔。
            time.sleep(DETECTION_STREAM_ITEM_DELAY_SECONDS)
    except HTTPException as exc:
        if not wrote_any:
            write_state(root, original_state)
            set_task_item_status(
                root,
                task_id,
                DETECTION_PROVIDER_ITEM_ID,
                "failed",
                str(exc.detail),
            )
            return
        set_task_item_status(
            root,
            task_id,
            DETECTION_PROVIDER_ITEM_ID,
            "failed",
            f"Partial detection failed after streaming candidates: {exc.detail}",
        )
        return

    if not wrote_any:
        clear_generated_workspace_outputs(root)
        write_state(root, replace_workspace_elements(read_state(root), []))
        set_task_item_status(
            root,
            task_id,
            DETECTION_PROVIDER_ITEM_ID,
            "skipped",
            "No detection candidates matched the current vocabulary.",
        )
        return
    _remove_internal_provider_item(root, task_id)


def _remove_internal_provider_item(root: Path, task_id: str) -> None:
    task = read_workspace_task(root, task_id)
    replace_task_items(
        root,
        task_id,
        [item for item in task.items if item.elementId != DETECTION_PROVIDER_ITEM_ID],
    )


def _append_detected_element(root: Path, element: ElementRecord) -> None:
    state = read_state(root)
    next_state = replace_workspace_elements(state, [*state.elements, element])
    write_state(root, next_state)
