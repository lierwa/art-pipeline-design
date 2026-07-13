from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from art_pipeline.course_planner.ai_tasks import (
    AiTaskFailedError,
    CoursePlannerAiService,
    run_ai_task,
)
from art_pipeline.course_planner.api_models import GenerateChapterPromptPackageRequest
from art_pipeline.course_planner.scene_package_errors import (
    ScenePackagePreconditionError,
)
from art_pipeline.course_planner.scene_package_prompt_generation import (
    require_prompt_generation_inputs,
)
from art_pipeline.course_planner.scene_package_route_helpers import (
    ai_task_http_exception,
    parse_json_model,
    scene_package_payload,
    store_for_request,
)


prompt_package_router = APIRouter(prefix="/api/course-planner")


@prompt_package_router.post(
    "/chapters/{chapterId}/scene-package/prompt-package/generate"
)
async def post_generate_chapter_prompt_package(
    request: Request,
    chapterId: str,
) -> dict[str, object]:
    payload = await parse_json_model(request, GenerateChapterPromptPackageRequest)
    store = store_for_request(request)
    try:
        chapter = store.get_chapter(chapterId)
        package = store.read_chapter_scene_package(chapterId)
        require_prompt_generation_inputs(package)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Chapter not found.") from exc
    except ScenePackagePreconditionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    service = CoursePlannerAiService(
        store=store,
        provider=request.app.state.course_planner_ai_provider,
    )

    try:
        generated, task = run_ai_task(
            store,
            "generate_chapter_prompt_package",
            {"chapter_id": chapterId},
            lambda: service.generate_chapter_prompt_package(
                chapter,
                package,
                feedback=payload.feedback,
            ),
        )
    except AiTaskFailedError as exc:
        raise ai_task_http_exception(exc) from exc
    return {
        **scene_package_payload(generated),
        "task": task.model_dump(mode="json"),
    }
