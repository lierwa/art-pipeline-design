# Course Planner 前置系统设计

日期：2026-06-27
状态：Draft for review
参考 PRD：`docs/Scene-Based-Language-Learning-PRD.md`
模块参考图：`docs/assets/0ce3a0ce-06b5-453c-8c14-8fc5730ef61c.png`

## 1. 目标

Course Planner 是现有 Art Pipeline 的前置场景规划系统。它负责决定“应该生成什么场景图”，并把最终确认的场景图和一组图像检测关键词交给现有 Art Pipeline。

它不负责真正的学习资料、词库、课程教学内容，也不在系统内调用生图模型。

## 2. 非目标

- 不做项目内生图。Codex 当前生图链路使用 Image1.5，不替代 ChatGPT Image2。
- 不做学习资料生成。
- 不做正式单词库、词频库、Vocabulary CMS。
- 不做 `learning_keywords`。
- 不做 `reason_zh`、`priority`、`include_in_detection` 等当前没有使用场景的关键词字段。
- 不做 StoryArc、强故事线引擎、复杂 dashboard。
- 不引入数据库、Temporal、Prefect、Dagster 或生产级 workflow engine。
- 不改现有 Art Pipeline 的 detect / mask / repair / export 主流程。

## 3. 产品主线

```text
Create Course
-> Create Space
-> AI Generate Chapters
-> Edit / Reorder Chapters
-> Select Chapter
-> AI Generate Scene Plan
-> Edit SceneCard / keywords
-> Generate Image2 Prompt
-> Copy prompt to ChatGPT Image2
-> Upload SceneVersion
-> AI Review SceneVersion
-> Lock one SceneVersion
-> Import to Existing Art Pipeline
-> Existing detect / mask / repair / export continues
```

模型或 AI 输出默认可以继续推进。人工审核是可见、可编辑、可回退的控制点，不是每一步的强制闸门。强制人工决策只保留在 `Lock SceneVersion` 和 `Import to Art Pipeline`。

## 4. 模块划分

参考图包含 4 个模块，不是完整页面模板。开发应围绕这些模块组织产品能力。

### 4.1 Space -> Chapter 拆分

目标：把一个 Space 拆成一组生活事件 chapter。

输入：

```text
space_title_zh
target_language
target_level
chapter_count
storyline_mode
space_type
notes
```

功能：

- 创建或编辑 Space。
- 通过本地 Codex 生成 chapter 候选。
- 接受、编辑、删除候选。
- 维护已选 chapter 列表。
- 调整 chapter 顺序。
- 锁定 chapter 序列。

输出：

```text
Chapter[]
- id
- space_id
- title_zh
- story_zh
- order
- status
```

### 4.2 Chapter Scene Designer

目标：为单个 chapter 设计场景、关键词和 Image2 prompt。

功能：

- 选择 chapter。
- 通过本地 Codex 生成 SceneCard 和 keywords。
- 编辑 SceneCard。
- 编辑 `keywords: string[]`。
- 生成 PromptPackage。
- 复制 prompt。
- 上传 ChatGPT Image2 结果。

SceneCard 保持薄模型：

```text
scene_story_zh
event_zh
layout_zh
character_actions_zh
style_notes_zh
```

Keywords 保持最薄结构：

```json
{
  "keywords": ["cup", "plate", "milk", "tissue"]
}
```

### 4.3 Image Attempt Review & Import

目标：管理外部 Image2 生成结果，并把最终锁定图导入 Art Pipeline。

功能：

- 上传多个 scene version。
- 查看当前 version 图片。
- 通过本地 Codex 做 AI Review。
- 显示 score、issues、revision_suggestion。
- 人工选择 approve / reject / keep。
- 锁定一个 final version。
- 导入现有 Art Pipeline。

### 4.4 Prompt Package 弹窗

目标：集中展示和复制 prompt。

功能：

- Full Prompt。
- Negative Constraints。
- Revision Prompt。
- Copy to clipboard。

Prompt 只用于复制到 ChatGPT Image2。系统不在本地生图。

## 5. 核心数据模型

只保留当前主线使用的字段。

```text
Course
- id
- name
- app_language
- target_language
- created_at
- updated_at

Space
- id
- course_id
- title_zh
- order

Chapter
- id
- space_id
- title_zh
- story_zh
- order
- status

SceneCard
- chapter_id
- scene_story_zh
- event_zh
- layout_zh
- character_actions_zh
- style_notes_zh

SceneKeywords
- chapter_id
- keywords: string[]

PromptPackage
- chapter_id
- full_prompt
- negative_prompt
- revision_prompt?
- created_at

SceneVersion
- id
- chapter_id
- version_index
- image_path
- status
- ai_review_id?
- imported_run_id?

AIReview
- id
- scene_version_id
- score
- issues: string[]
- revision_suggestion
- created_at

AiTask
- id
- type
- status
- input_path
- prompt_path
- raw_output_path
- result_path?
- error_path?
```

状态压缩为当前主线需要的最小集合：

```text
Chapter: draft | prompt_ready | has_versions | locked | imported
SceneVersion: uploaded | reviewed | approved | rejected | locked | imported
AiTask: queued | running | succeeded | failed
```

## 6. AI 能力

P0 只做 3 类真实 AI task：

```text
generate_chapters
generate_scene_plan
review_scene_version
```

统一规则：

- 使用本地 Codex。
- 输出 JSON。
- 后端用 Pydantic 校验。
- 校验失败就是 task failed。
- 不写假数据。
- 不写 fallback 业务结果。
- 不硬编码 demo 内容。
- 不复用现有 `codex_final_batch`，因为它绑定 element、mask、raw image 和贴图 finalizer。

AI 成功写入规则：

```text
generate_chapters:
  写入 Space 下的 chapter 草案列表，用户可编辑和排序。

generate_scene_plan:
  写入当前 Chapter 的 SceneCard 和 keywords，用户可编辑。

review_scene_version:
  写入 AIReview，更新 SceneVersion 为 reviewed。
```

AI 失败规则：

```text
Codex 失败: task failed，不改业务数据。
JSON 解析失败: task failed，不改业务数据。
Pydantic 校验失败: task failed，不改业务数据。
```

## 7. Prompt 生成

PromptPackage 不负责生图，只负责生产可复制到 ChatGPT Image2 的 prompt。

输入：

```text
Chapter
SceneCard
keywords[]
AIReview? 仅用于 revision_prompt
```

输出：

```text
full_prompt
negative_prompt
revision_prompt?
```

P0 使用确定性 `prompt_builder.py` 生成 prompt。这里是格式化胶水，不是智能判断，不需要额外 AI task。

## 8. Import to Art Pipeline

Course Planner 和 Art Pipeline 的唯一硬连接点是 import。

导入输入：

```text
locked scene image
keywords[]
scene_context
prompt reference
```

导入输出到现有 run：

```text
workspace/runs/run_<timestamp>_<slug>/
  source/original.png
  state.json
  workflow.json
  scene_context.json
```

规则：

- `WorkspaceState.detectionVocabulary = keywords[]`。
- `elements = []`。
- `workflow.json` 使用现有 `initialize_upload_workflow`。
- 导入成功后现有 detect stage 可以直接运行。
- 导入失败不改变 SceneVersion 的 locked 状态。
- 不修改现有 detect / mask / repair / export 主流程。

## 9. 文件结构

后端新增：

```text
backend/art_pipeline/course_planner/
  __init__.py
  models.py
  store.py
  routes.py
  ai_tasks.py
  codex_json_provider.py
  prompt_builder.py
  import_to_pipeline.py
```

测试新增：

```text
backend/tests/course_planner/
  test_store.py
  test_ai_tasks.py
  test_prompt_builder.py
  test_import_to_pipeline.py
  test_routes.py
```

前端新增：

```text
frontend/src/features/coursePlanner/
  api.ts
  types.ts
  hooks/
  components/
```

`scene_library` 文件结构：

```text
scene_library/
  index.json
  courses/
    course_<slug>/
      course.json
      spaces/
        space_<slug>/
          space.json
          chapters.json
          chapters/
            chapter_<slug>/
              chapter.json
              scene_card.json
              keywords.json
              prompt_package.json
              versions/
                v001/
                  image.png
                  scene_version.json
                  ai_review.json
              ai_tasks/
                task_<timestamp>_<type>/
                  task.json
                  input.json
                  prompt.md
                  raw_output.txt
                  result.json
                  error.json
```

## 10. 技术依据

- FastAPI 多文件和 `APIRouter` 用于模块化 API，参考 FastAPI 官方 Bigger Applications 文档。
- Pydantic 用于后端模型、请求响应、AI JSON 输出校验，参考 Pydantic 官方 Models 文档。
- 前端沿用 React + TypeScript + Vite。表单复杂度如果超过本地状态可维护范围，再引入 react-hook-form；客户端运行时 schema 校验如果成为真实边界，再引入 zod。
- 文件持久化沿用项目现有 JSON + 原子写入 + lock 模式，不引入数据库。

参考链接：

- https://fastapi.tiangolo.com/tutorial/bigger-applications/
- https://pydantic.dev/docs/validation/latest/concepts/models/
- https://react-hook-form.com/get-started
- https://zod.dev/

## 11. 验收标准

必须满足：

- 可以创建 Course 和 Space。
- 可以生成、编辑、排序 chapter。
- 可以为 chapter 生成 SceneCard 和 `keywords: string[]`。
- 可以编辑并保存 SceneCard 和 keywords。
- 可以生成并复制 Image2 prompt。
- 可以上传多个 SceneVersion。
- 可以对 SceneVersion 运行 AI Review。
- 同一 chapter 只能锁定一个 SceneVersion。
- 可以把 locked SceneVersion 导入现有 Art Pipeline run。
- 导入后的 `state.json.detectionVocabulary` 等于 keywords。
- AI task 失败不写业务数据。
- 没有硬编码 demo 结果。
- 没有 learning keyword、词库、lesson 数据。

## 12. 测试范围

后端 P0 测试覆盖：

- scene_library store 原子读写。
- keywords 保持 `string[]`。
- AI JSON 校验失败不写业务数据。
- `generate_chapters` 成功写入 chapter 草案。
- `generate_scene_plan` 成功写入 SceneCard 和 keywords。
- `review_scene_version` 成功写入 AIReview。
- SceneVersion lock 唯一性。
- import 创建 workspace run。
- import 写入 `detectionVocabulary = keywords`。
- import 失败不污染 scene_library。

前端 P0 测试覆盖：

- Course Planner 主流程的关键交互。
- chapter 列表编辑和排序。
- keywords 编辑。
- prompt 生成和复制按钮状态。
- scene version 上传、review、lock、import 按钮状态。

## 13. 开放问题

没有阻塞实现的开放问题。UI 视觉稿需要重新基于 4 个模块做模块级设计，不把参考图当完整页面照搬。

## 14. 自审

- 无未定空项。
- 模型字段已按当前使用场景收窄。
- AI 能力只保留 3 个真实任务。
- keywords 没有提前设计学习资料字段。
- Import 是 Course Planner 与 Art Pipeline 的唯一硬连接点。
- P0 专注主线闭环，不扩成课程 CMS。
