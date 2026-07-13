from __future__ import annotations

import shutil
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Request

from art_pipeline.course_planner.api_models import (
    CandidateBatchRequest,
    ChapterOrderRequest,
    ChapterSeedRequest,
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
from art_pipeline.course_planner.import_to_pipeline import (
    import_final_chapter_scene_to_pipeline,
)
from art_pipeline.course_planner.models import Chapter, ChapterSeed, ScenePack
from art_pipeline.course_planner.scene_package_errors import (
    ScenePackagePreconditionError,
)
from art_pipeline.course_planner.scene_package_routes import (
    register_scene_package_routes,
)
from art_pipeline.course_planner.scene_package_route_helpers import (
    ai_task_http_exception,
)
from art_pipeline.course_planner.store import CoursePlannerStore

router = APIRouter(prefix="/api/course-planner")


def register_course_planner_routes(app: FastAPI) -> None:
    app.include_router(router)
    register_scene_package_routes(app)


@router.get("/state")
def get_course_planner_state(request: Request) -> dict[str, list[dict[str, object]]]:
    return _collect_state(_store(request))


@router.get("/scene-packs")
def get_scene_packs(request: Request) -> dict[str, list[dict[str, object]]]:
    return {
        "scenePacks": [
            pack.model_dump(mode="json") for pack in _store(request).list_scene_packs()
        ]
    }


@router.post("/scene-packs")
def post_scene_pack(
    request: Request,
    payload: ScenePackCreateRequest,
) -> dict[str, object]:
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
        pack = _store(request).update_scene_pack(
            scenePackId,
            **payload.model_dump(exclude_unset=True),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Scene pack not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"scenePack": pack.model_dump(mode="json")}


@router.delete("/scene-packs/{scenePackId}")
def delete_scene_pack(request: Request, scenePackId: str) -> dict[str, object]:
    try:
        pack = _store(request).archive_scene_pack(scenePackId)
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
        raise ai_task_http_exception(exc) from exc
    return {
        "candidates": candidates,
        "candidatePersistence": "ephemeral",
        "task": task.model_dump(mode="json"),
    }


@router.get("/scene-packs/{scenePackId}/chapters")
def get_chapters(
    request: Request,
    scenePackId: str,
) -> dict[str, list[dict[str, object]]]:
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
        store.get_scene_pack(scenePackId)
        updated = store.reorder_chapters(scenePackId, payload.chapter_ids)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Scene pack not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"scenePack": updated.model_dump(mode="json")}


@router.delete("/scene-packs/{scenePackId}/chapters/{chapterId}")
def delete_chapter(
    request: Request,
    scenePackId: str,
    chapterId: str,
) -> dict[str, object]:
    store = _store(request)
    try:
        pack = store.get_scene_pack(scenePackId)
        if chapterId not in pack.chapter_ids:
            raise FileNotFoundError(chapterId)
        _delete_chapter(store, pack, chapterId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Chapter not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"deletedChapterId": chapterId}


@router.post("/chapters/{chapterId}/scene-package/final-scene/import")
def post_import_final_scene(request: Request, chapterId: str) -> dict[str, object]:
    try:
        result = import_final_chapter_scene_to_pipeline(
            planner_store=_store(request),
            workspace_root=request.app.state.workspace_root,
            chapter_id=chapterId,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Chapter or final scene not found.") from exc
    except ScenePackagePreconditionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"run": result.run.model_dump(mode="json")}


@router.get("/ai-tasks/{taskId}")
def get_ai_task(request: Request, taskId: str) -> dict[str, object]:
    try:
        return read_ai_task_record(_store(request), taskId).model_dump(mode="json")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="AI task not found.") from exc


def _store(request: Request) -> CoursePlannerStore:
    return CoursePlannerStore(request.app.state.scene_library_root)


def _ai_service(request: Request, store: CoursePlannerStore) -> CoursePlannerAiService:
    return CoursePlannerAiService(
        store=store,
        provider=request.app.state.course_planner_ai_provider,
    )


def _chapter_seed_from_request(pack: ScenePack, payload: ChapterSeedRequest) -> ChapterSeed:
    data = payload.model_dump(mode="json")
    data.update(
        {
            "scene_pack_id": pack.id,
            "scene_pack_title": pack.title,
            "chapter_id": "pending",
        }
    )
    return ChapterSeed.model_validate(data)


def _delete_chapter(store: CoursePlannerStore, pack: ScenePack, chapter_id: str) -> None:
    next_ids = [item for item in pack.chapter_ids if item != chapter_id]
    store._write_model(
        store._scene_pack_path(pack.id),
        pack.model_copy(update={"chapter_ids": next_ids}),
    )
    chapter_root = store._chapter_path(pack.id, chapter_id).parent
    if chapter_root.exists():
        shutil.rmtree(chapter_root)


def _collect_state(store: CoursePlannerStore) -> dict[str, list[dict[str, object]]]:
    scene_packs = store.list_scene_packs()
    chapters: list[Chapter] = []
    for pack in scene_packs:
        chapters.extend(store.list_chapters(pack.id))
    return {
        "scenePacks": [pack.model_dump(mode="json") for pack in scene_packs],
        "chapters": [chapter.model_dump(mode="json") for chapter in chapters],
        "tasks": collect_ai_task_records(store),
    }
