from __future__ import annotations

import shutil
from typing import Any

from fastapi import APIRouter, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from art_pipeline.course_planner.api_models import (
    CandidateBatchRequest,
    ChapterOrderRequest,
    ChapterSeedRequest,
    ImageAttemptCreateRequest,
    ImageAttemptPatchRequest,
    PromptVersionCreateRequest,
    PromptVersionPatchRequest,
    ScenePackCreateRequest,
    ScenePackPatchRequest,
)
from art_pipeline.course_planner.ai_tasks import (
    AiTaskFailedError,
    CoursePlannerAiService,
    collect_ai_task_records,
    read_ai_task_record,
    run_ai_task,
)
from art_pipeline.course_planner.import_to_pipeline import import_image_attempt_to_pipeline
from art_pipeline.course_planner.models import (
    Chapter,
    ChapterSeed,
    ImageAttempt,
    PromptVersion,
    ScenePack,
)
from art_pipeline.course_planner.prompt_builder import build_prompt_package
from art_pipeline.course_planner.store import CoursePlannerStore
from art_pipeline.course_planner.store_hierarchy import PromptVersionArchiveConflict
from art_pipeline.course_planner.upload_assets import (
    normalized_upload_png_bytes,
    resolve_course_planner_upload_path,
)

router = APIRouter(prefix="/api/course-planner")

def register_course_planner_routes(app: FastAPI) -> None:
    app.include_router(router)
@router.get("/state")
def get_course_planner_state(request: Request) -> dict[str, list[dict[str, object]]]:
    return _collect_state(_store(request))
@router.get("/scene-packs")
def get_scene_packs(request: Request) -> dict[str, list[dict[str, object]]]:
    return {"scenePacks": [pack.model_dump(mode="json") for pack in _store(request).list_scene_packs()]}
@router.post("/scene-packs")
def post_scene_pack(request: Request, payload: ScenePackCreateRequest) -> dict[str, object]:
    try:
        pack = _store(request).create_scene_pack(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"scenePack": pack.model_dump(mode="json")}
@router.patch("/scene-packs/{scenePackId}")
def patch_scene_pack(
    request: Request,
    scenePackId: str,
    payload: ScenePackPatchRequest,
) -> dict[str, object]:
    try:
        updates = payload.model_dump(exclude_unset=True)
        pack = _store(request).update_scene_pack(scenePackId, **updates)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Scene pack not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"scenePack": pack.model_dump(mode="json")}
@router.delete("/scene-packs/{scenePackId}")
def delete_scene_pack(request: Request, scenePackId: str) -> dict[str, object]:
    store = _store(request)
    try:
        pack = store.archive_scene_pack(scenePackId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Scene pack not found.") from exc
    return {"scenePack": pack.model_dump(mode="json")}
@router.post("/scene-packs/{scene_pack_id}/candidate-batches")
def post_candidate_batch(
    request: Request,
    scene_pack_id: str,
    payload: CandidateBatchRequest,
) -> dict[str, object]:
    return _run_candidate_route(
        request,
        scene_pack_id,
        payload.feedback,
        "generate_chapter_candidates",
    )
@router.post("/scene-packs/{scene_pack_id}/candidate-revisions")
def post_candidate_revision(
    request: Request,
    scene_pack_id: str,
    payload: CandidateBatchRequest,
) -> dict[str, object]:
    return _run_candidate_route(
        request,
        scene_pack_id,
        payload.feedback,
        "revise_chapter_candidates",
    )
@router.delete("/candidates/{candidate_id}")
def delete_ephemeral_candidate(candidate_id: str) -> dict[str, str | bool]:
    return {
        "candidateId": candidate_id,
        "candidatePersistence": "ephemeral",
        "deleted": True,
    }

def _run_candidate_route(
    request: Request,
    scene_pack_id: str,
    feedback: str,
    task_kind: str,
) -> dict[str, object]:
    store = _store(request)
    try:
        pack = store.get_scene_pack(scene_pack_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Scene pack not found.") from exc
    service = _ai_service(request, store)

    def run() -> list[dict[str, Any]]:
        return service.generate_chapter_candidates(pack, feedback=feedback)

    try:
        candidates, task = run_ai_task(
            store,
            task_kind,
            {"scene_pack_id": scene_pack_id},
            run,
        )
    except AiTaskFailedError as exc:
        raise _ai_task_http_error(exc) from exc
    return {
        "candidates": candidates,
        "candidatePersistence": "ephemeral",
        "task": task.model_dump(mode="json"),
    }
@router.get("/scene-packs/{scenePackId}/chapters")
def get_chapters(request: Request, scenePackId: str) -> dict[str, list[dict[str, object]]]:
    try:
        chapters = _store(request).list_chapters(scenePackId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Scene pack not found.") from exc
    return {"chapters": [chapter.model_dump(mode="json") for chapter in chapters]}
@router.post("/scene-packs/{scenePackId}/chapters")
def post_chapter(
    request: Request,
    scenePackId: str,
    payload: ChapterSeedRequest,
) -> dict[str, object]:
    store = _store(request)
    try:
        pack = store.get_scene_pack(scenePackId)
        seed = _chapter_seed_from_request(pack, payload)
        chapter = store.create_chapter_from_seed(pack.id, seed)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Scene pack not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"chapter": chapter.model_dump(mode="json")}
@router.patch("/scene-packs/{scenePackId}/chapter-order")
def patch_chapter_order(
    request: Request,
    scenePackId: str,
    payload: ChapterOrderRequest,
) -> dict[str, object]:
    store = _store(request)
    try:
        pack = store.get_scene_pack(scenePackId)
        updated = store.reorder_chapters(pack.id, payload.chapter_ids)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Scene pack not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"scenePack": updated.model_dump(mode="json")}
@router.delete("/scene-packs/{scenePackId}/chapters/{chapterId}")
def delete_chapter(request: Request, scenePackId: str, chapterId: str) -> dict[str, object]:
    store = _store(request)
    try:
        pack = store.get_scene_pack(scenePackId)
        if chapterId not in pack.chapter_ids:
            raise FileNotFoundError(chapterId)
        if store.list_prompt_versions(chapterId):
            raise HTTPException(
                status_code=409,
                detail="Chapter has prompt versions and cannot be deleted.",
            )
        _delete_chapter(store, pack, chapterId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Chapter not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"deletedChapterId": chapterId}
@router.get("/chapters/{chapterId}/prompt-versions")
def get_prompt_versions(request: Request, chapterId: str) -> dict[str, list[dict[str, object]]]:
    try:
        versions = _store(request).list_prompt_versions(chapterId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Chapter not found.") from exc
    return {"promptVersions": [version.model_dump(mode="json") for version in versions]}
@router.post("/chapters/{chapterId}/prompt-versions")
def post_prompt_version(
    request: Request,
    chapterId: str,
    payload: PromptVersionCreateRequest | None = None,
) -> dict[str, object]:
    store = _store(request)
    body = payload or PromptVersionCreateRequest()
    try:
        pack, chapter = _chapter_context(store, chapterId)
        source = store.get_prompt_version(body.source_version_id) if body.source_version_id else None
        if source is not None and source.chapter_id != chapter.id:
            raise ValueError("Source prompt version must belong to the target chapter.")
        generated = _ai_service(request, store).generate_prompt_version(
            pack,
            chapter,
            feedback=body.feedback,
            source_version=source,
        )
        version = store.create_prompt_version(chapter.id, generated)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Chapter not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"promptVersion": version.model_dump(mode="json")}
@router.post("/prompt-versions/{versionId}/duplicate")
def post_duplicate_prompt_version(request: Request, versionId: str) -> dict[str, object]:
    try:
        version = _store(request).duplicate_prompt_version(versionId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Prompt version not found.") from exc
    return {"promptVersion": version.model_dump(mode="json")}
@router.post("/chapters/{chapterId}/prompt-versions/{versionId}/adopt")
def post_adopt_prompt_version(
    request: Request,
    chapterId: str,
    versionId: str,
) -> dict[str, object]:
    store = _store(request)
    try:
        chapter = store.set_adopted_prompt_version(chapterId, versionId)
        versions = store.list_prompt_versions(chapter.id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Prompt version not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "chapter": chapter.model_dump(mode="json"),
        "promptVersions": [version.model_dump(mode="json") for version in versions],
    }
@router.patch("/prompt-versions/{versionId}")
def patch_prompt_version(
    request: Request,
    versionId: str,
    payload: PromptVersionPatchRequest,
) -> dict[str, object]:
    store = _store(request)
    try:
        version = store.get_prompt_version(versionId)
        updates = payload.model_dump(exclude_unset=True, mode="json")
        if updates.get("status") == "adopted":
            # WHY: Chapter 指针是采纳状态的唯一权威；兼容旧 PATCH API 时，
            # 也必须复用 hierarchy adoption 写边界来 demote 旧版本。
            updates.pop("status")
            if updates:
                version = store.update_prompt_version(version.model_copy(update=updates))
            store.set_adopted_prompt_version(version.chapter_id, version.id)
            updated = store.get_prompt_version(version.id)
        else:
            updated = store.update_prompt_version(version.model_copy(update=updates))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Prompt version not found.") from exc
    except PromptVersionArchiveConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"promptVersion": updated.model_dump(mode="json")}
@router.delete("/prompt-versions/{versionId}")
def delete_prompt_version(request: Request, versionId: str) -> dict[str, object]:
    try:
        updated = _store(request).archive_prompt_version(versionId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Prompt version not found.") from exc
    except PromptVersionArchiveConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"promptVersion": updated.model_dump(mode="json")}
@router.post("/prompt-versions/{versionId}/prompt-package")
def post_prompt_package(request: Request, versionId: str) -> dict[str, object]:
    store = _store(request)
    try:
        version = store.get_prompt_version(versionId)
        _, chapter = _chapter_context(store, version.chapter_id)
        package = build_prompt_package(
            version.scene_director_plan,
            version.cast_bindings,
            version.scene_vocabulary,
            version.prompt_tuning,
        )
        # WHY: adopted 状态的权威事实是 Chapter 指针；再生成 prompt package
        # 只能刷新内容，不能把仍被采纳的版本降级为 prompt_ready。
        next_status = "adopted" if chapter.adopted_prompt_version_id == version.id else "prompt_ready"
        updated = store.update_prompt_version(
            version.model_copy(update={"prompt_package": package, "status": next_status}),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Prompt version not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "promptPackage": updated.prompt_package.model_dump(mode="json"),
        "promptVersion": updated.model_dump(mode="json"),
    }
@router.get("/prompt-versions/{versionId}/image-attempts")
def get_image_attempts(request: Request, versionId: str) -> dict[str, list[dict[str, object]]]:
    try:
        attempts = _store(request).list_image_attempts(versionId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Prompt version not found.") from exc
    return {"imageAttempts": [attempt.model_dump(mode="json") for attempt in attempts]}
@router.post("/prompt-versions/{versionId}/image-attempts")
def post_image_attempt(
    request: Request,
    versionId: str,
    payload: ImageAttemptCreateRequest,
) -> dict[str, object]:
    try:
        attempt = _store(request).create_image_attempt(versionId, payload.uploaded_image_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Prompt version not found.") from exc
    return {"imageAttempt": attempt.model_dump(mode="json")}
@router.post("/prompt-versions/{versionId}/image-attempts/upload")
async def post_uploaded_image_attempt(
    request: Request,
    versionId: str,
    file: UploadFile = File(...),
) -> dict[str, object]:
    try:
        image_bytes = normalized_upload_png_bytes(await file.read())
        attempt = _store(request).create_uploaded_image_attempt(versionId, image_bytes)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Prompt version not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"imageAttempt": attempt.model_dump(mode="json")}
@router.post("/image-attempts/{attemptId}/review")
def post_image_attempt_review(
    request: Request,
    attemptId: str,
) -> dict[str, object]:
    store = _store(request)
    try:
        pack, chapter, version, attempt = _image_attempt_context(store, attemptId)
        review = _ai_service(request, store).review_image_attempt(pack, chapter, version, attempt)
        updated = store.update_image_attempt(
            attempt.model_copy(update={"status": "ai_reviewed", "ai_review": review}),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image attempt not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"imageAttempt": updated.model_dump(mode="json")}
@router.patch("/image-attempts/{attemptId}")
def patch_image_attempt(
    request: Request,
    attemptId: str,
    payload: ImageAttemptPatchRequest,
) -> dict[str, object]:
    store = _store(request)
    try:
        attempt = store.get_image_attempt(attemptId)
        updates = payload.model_dump(exclude_unset=True, mode="json")
        updated = store.update_image_attempt(attempt.model_copy(update=updates))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image attempt not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"imageAttempt": updated.model_dump(mode="json")}
@router.post("/image-attempts/{attemptId}/import")
def post_image_attempt_import(request: Request, attemptId: str) -> dict[str, object]:
    store = _store(request)
    try:
        _image_attempt_context(store, attemptId)
        result = import_image_attempt_to_pipeline(
            planner_store=store,
            workspace_root=request.app.state.workspace_root,
            image_attempt_id=attemptId,
        )
        updated = store.update_image_attempt(
            store.get_image_attempt(attemptId).model_copy(
                update={"status": "imported", "pipeline_import_id": result.run.id}
            ),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image attempt not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "runId": result.run.id,
        "run": result.run.model_dump(mode="json"),
        "imageAttempt": updated.model_dump(mode="json"),
    }
@router.get("/ai-tasks/{taskId}")
def get_ai_task(request: Request, taskId: str) -> dict[str, object]:
    try:
        return read_ai_task_record(_store(request), taskId).model_dump(mode="json")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="AI task not found.") from exc
@router.get("/uploads/{asset_path:path}")
def get_uploaded_asset(request: Request, asset_path: str) -> FileResponse:
    try:
        path = resolve_course_planner_upload_path(
            request.app.state.scene_library_root,
            asset_path,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Upload asset not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return FileResponse(path, media_type="image/png")
def _store(request: Request) -> CoursePlannerStore:
    return CoursePlannerStore(request.app.state.scene_library_root)
def _ai_service(request: Request, store: CoursePlannerStore) -> CoursePlannerAiService:
    return CoursePlannerAiService(store=store, provider=request.app.state.course_planner_ai_provider)
def _chapter_seed_from_request(pack: ScenePack, payload: ChapterSeedRequest) -> ChapterSeed:
    data = payload.model_dump(mode="json")
    data.update({"scene_pack_id": pack.id, "scene_pack_title": pack.title, "chapter_id": "pending"})
    return ChapterSeed.model_validate(data)

def _delete_chapter(store: CoursePlannerStore, pack: ScenePack, chapter_id: str) -> None:
    if chapter_id not in pack.chapter_ids:
        raise FileNotFoundError(chapter_id)
    next_ids = [item for item in pack.chapter_ids if item != chapter_id]
    store._write_model(store._scene_pack_path(pack.id), pack.model_copy(update={"chapter_ids": next_ids}))
    chapter_root = store._chapter_path(pack.id, chapter_id).parent
    if chapter_root.exists():
        shutil.rmtree(chapter_root)

def _chapter_context(store: CoursePlannerStore, chapter_id: str) -> tuple[ScenePack, Chapter]:
    chapter, scene_pack_id = store._find_chapter(chapter_id)
    return store.get_scene_pack(scene_pack_id), chapter

def _image_attempt_context(
    store: CoursePlannerStore,
    attempt_id: str,
) -> tuple[ScenePack, Chapter, PromptVersion, ImageAttempt]:
    attempt = store.get_image_attempt(attempt_id)
    version = store.get_prompt_version(attempt.prompt_version_id)
    pack, chapter = _chapter_context(store, version.chapter_id)
    return pack, chapter, version, attempt

def _collect_state(store: CoursePlannerStore) -> dict[str, list[dict[str, object]]]:
    scene_packs = store.list_scene_packs()
    chapters: list[Chapter] = []
    prompt_versions: list[PromptVersion] = []
    image_attempts: list[ImageAttempt] = []
    for pack in scene_packs:
        pack_chapters = store.list_chapters(pack.id)
        chapters.extend(pack_chapters)
        for chapter in pack_chapters:
            versions = store.list_prompt_versions(chapter.id)
            prompt_versions.extend(versions)
            for version in versions:
                image_attempts.extend(store.list_image_attempts(version.id))
    return {
        "scenePacks": [pack.model_dump(mode="json") for pack in scene_packs],
        "chapters": [chapter.model_dump(mode="json") for chapter in chapters],
        "promptVersions": [version.model_dump(mode="json") for version in prompt_versions],
        "imageAttempts": [attempt.model_dump(mode="json") for attempt in image_attempts],
        "tasks": collect_ai_task_records(store),
    }

def _ai_task_http_error(error: AiTaskFailedError) -> HTTPException:
    public_message = "Course Planner AI task failed. Check the AI task record for diagnostics."
    task_payload = error.task.model_dump(mode="json")
    # WHY: 任务 artifact/记录保留原始 provider 错误，HTTP 错误只返回可读摘要，避免 UI 泄露整段 JSON schema 诊断。
    task_payload["error"] = public_message
    return HTTPException(
        status_code=502,
        detail={
            "message": public_message,
            "task": task_payload,
        },
    )
