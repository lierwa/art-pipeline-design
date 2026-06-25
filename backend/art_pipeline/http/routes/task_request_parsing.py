from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from art_pipeline.workspace.codex_final_tasks import CodexFinalIngestRequest


async def json_body(request: Request) -> dict[str, Any]:
    raw_body = await request.body()
    if not raw_body:
        return {}
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object.")
    return payload


def element_ids_from_request(request: dict[str, Any]) -> list[str] | None:
    element_ids = request.get("elementIds")
    if element_ids is None:
        return None
    if not isinstance(element_ids, list) or not all(isinstance(item, str) for item in element_ids):
        raise HTTPException(status_code=400, detail="elementIds must be a list of strings.")
    return element_ids


def prompt_hints_from_request(request: dict[str, Any]) -> dict[str, str]:
    prompt_hints = request.get("promptHints", {})
    if not isinstance(prompt_hints, dict):
        raise HTTPException(status_code=400, detail="promptHints must be an object.")
    return {
        element_id: hint.strip()
        for element_id, hint in prompt_hints.items()
        if isinstance(element_id, str) and isinstance(hint, str) and hint.strip()
    }


def force_from_request(request: dict[str, Any]) -> bool:
    return bool(request.get("force", False))


def codex_final_ingest_request_from_body(body: dict[str, Any]) -> CodexFinalIngestRequest:
    selected_source_path = body.get("selectedSourcePath")
    if not isinstance(selected_source_path, str) or not selected_source_path.strip():
        raise ValueError("selectedSourcePath is required.")
    qa_note = body.get("qaNote", "")
    codex_thread_id = body.get("codexThreadId")
    controller_id = body.get("controllerId")
    lease_token = body.get("leaseToken")
    # WHY: 这个端点由人工/agent 回传调用，缺字段属于业务校验失败；
    # 手动解析可以保持 API 语义稳定为 400，而不是 FastAPI schema 422。
    return CodexFinalIngestRequest(
        selectedSourcePath=selected_source_path,
        qaNote=qa_note if isinstance(qa_note, str) else "",
        codexThreadId=codex_thread_id if isinstance(codex_thread_id, str) else None,
        controllerId=controller_id if isinstance(controller_id, str) else None,
        leaseToken=lease_token if isinstance(lease_token, str) else None,
    )
