# PRD：Scene-Based Language Learning

# Course Scene Planner / 课程场景研发工作台 v1

版本：v1.0
状态：Draft for Engineering
目标阶段：本地单人工作台 MVP
适用项目：基于空间场景的多语言学习游戏
当前主语言：中文
当前学习目标语言：英语
未来学习目标语言：日语、韩语、西班牙语
生成方式：ChatGPT Image2 半自动生成
后置处理：现有 Art Pipeline V2 Demo / Codex / SAM2 / 检测与遮罩流水线

---

## 1. 背景

当前项目已经完成了一套后置 Art Pipeline Workbench。该系统的核心能力是：对已经生成好的单张场景 PNG，输入目标词表后，自动检测候选元素、生成分割遮罩、支持人工审核与编辑，并可通过 Codex 进行修复或重生成，最终导出贴纸资产包。现有项目已经具备上传、检测、点击检测、分割、修复、任务进度、导出、run/checkpoint 等能力，但还不是完整的项目上下游流水线。

现有业务链路以“已有图片”为起点：上传 PNG → 保存 detection vocabulary → 进入 detect stage → 生成候选元素 → 人工整理 → mask stage → SAM2 mask → accept mask → Codex final / repair → export asset pack。

本 PRD 要补齐的是该系统的前置部分：在图片生成之前，帮助用户完成课程研发、空间篇拆分、chapter 设计、场景故事线设计、学习物体规划、Image2 prompt package 生成、场景版本管理与审核，并最终把某个 chapter 的某个版本场景图导入现有 Art Pipeline 继续处理。

---

## 2. 产品定位

Course Scene Planner 是一个 **Scene-first 的课程场景研发工作台**。

它不是普通 Prompt 工具，也不是传统课程 CMS。它的核心职责是：

> 用 AI 辅助用户把一个语言学习课程拆解成可生成、可审核、可复用、可进入后置 pipeline 的生活场景库。

完整定位：

```text
空间篇规划
→ chapter 拆分
→ 单 chapter 场景设计
→ 学习物体规划
→ 高频词覆盖检查
→ Image2 prompt package 生成
→ 外部 Image2 半自动生图
→ 场景版本上传
→ AI 审核 + 人工审核
→ 锁定 chapter final version
→ 导入现有 Art Pipeline
```

---

## 3. 产品目标

### 3.1 核心目标

建立一个本地单人课程研发工作台，使用户可以系统化完成：

1. 创建语言学习课程项目；
2. 创建空间篇，例如室内家庭篇、室内办公篇、室外交通篇、室外机场篇；
3. 用 AI 辅助拆分 chapter；
4. 针对每个 chapter 生成 scene-first 的生活事件场景；
5. 规划该场景自然出现的学习物体；
6. 检查日常高频词覆盖缺口；
7. 生成可复制到 ChatGPT Image2 的 prompt package；
8. 上传 Image2 生成结果；
9. 对每个 scene version 做 AI 审核和人工审核；
10. 锁定一个 chapter 的最终场景版本；
11. 将该 scene version 导入现有 Art Pipeline，进入检测、遮罩、Codex 修复和导出流程。

---

## 4. 非目标

v1 不做以下内容：

1. 不直接在项目内调用 ChatGPT Image2；
2. 不做多人协作、权限、评论、任务分配；
3. 不引入生产级数据库；
4. 不引入 Temporal / Prefect / Dagster 等生产级 workflow engine；
5. 不重构现有 Art Pipeline 的核心四阶段 workflow；
6. 不做完整强故事线 Story Engine；
7. 不做完整多语言出词系统；
8. 不做短语、句型、语法、听力、发音等完整学习模块；
9. 不做游戏端发布、版本回滚、CDN、引擎工程导入；
10. 不替代后置 pipeline 的检测、遮罩、修复、导出能力。

---

## 5. 当前系统约束

### 5.1 技术约束

当前项目是本地 Web Workbench，前端为 React + TypeScript + Vite，后端为 FastAPI + Pydantic，并通过 workspace 文件系统保存 `state.json`、`workflow.json`、`tasks/*.json` 与 PNG/JSON 产物。当前任务系统是 JSON 文件 + 后台线程 + SSE，不是外部队列。

后端适合继续做本地 demo 的原因包括：单机文件 workspace 易调试，Pydantic + FastAPI API 边界清晰，provider factory 能隔离 demo/真实模型/测试注入。

因此 v1 继续采用：

```text
React + TypeScript + Vite
FastAPI + Pydantic
本地文件系统持久化
JSON schema
workspace / scene_library 文件夹
不引入数据库
不引入外部任务队列
```

### 5.2 产品约束

1. Image2 只能通过 ChatGPT 调用，因此本系统只生成 prompt，用户复制到 ChatGPT 生图；
2. Codex 内只能调用 Image1.5，因此不负责前置场景生成；
3. 一个 chapter 最终只采用一张图，但研发过程可以存在多个版本；
4. 现有 pipeline 只需要支持从 chapter / scene version 导入，不需要和前置模块深度耦合；
5. 第一版是本地单人工作台；
6. 第一阶段 app 主语言为中文，学习目标语言为英语；
7. 未来需要支持日语、韩语、西班牙语，因此数据结构必须支持多语言扩展。

---

## 6. 产品原则

### 6.1 Scene-first

课程研发从生活事件场景开始，而不是从单词表开始。

错误方向：

```text
先列单词
→ 再摆物体
→ 再生成图
```

正确方向：

```text
先设计生活事件
→ 物体从场景自然出现
→ 再抽取学习对象
→ 高频词只做覆盖提醒
```

### 6.2 AI suggests, human decides

AI 负责：

```text
生成候选
拆分 chapter
补充故事线
规划对象
检查缺口
生成 prompt
审核图片
提出修改建议
```

人工负责：

```text
选择
删除
合并
重排
编辑
批准
锁定
导入 pipeline
```

### 6.3 One chapter, one final image, multiple versions

每个 chapter 最终对应一张正式图，但可以存在多个 scene version：

```text
v001 rejected
v002 keep_as_alternate
v003 approved
v004 locked_for_pipeline
```

### 6.4 高频词是雷达，不是命令

高频词系统只负责提示：

```text
这个高价值词是否应该出现在当前场景？
它是否更适合分配到别的 chapter？
它是否会破坏场景真实性？
```

不得因为词频高就强行破坏场景逻辑。

### 6.5 弱故事线是基石，强故事线是增量层

路线 A：弱故事线，用于规模化覆盖日常生活场景。
路线 B：强故事线，用于未来构建职业者一日 / 一周的沉浸式漫画化体验。

v1 必须支持路线 A，并为路线 B 预留数据结构，但不实现完整强故事线引擎。

### 6.6 前置模块与后置 pipeline 松耦合

前置模块只输出：

```text
scene image
chapter metadata
scene context
detection vocabulary
expected objects
prompt package
review result
```

后置 pipeline 只需要从 scene library 导入某个 scene version。当前项目已经存在完整的上传、detection vocabulary、候选元素审核、SAM2、Codex final/repair、导出能力，因此前置模块不应重做这些能力。

---

## 7. 用户角色

v1 只有一个用户角色：

### 课程研发者 / 制作人

职责：

1. 创建课程项目；
2. 设计空间篇；
3. 审核 AI 拆分的 chapter；
4. 编辑 scene card；
5. 判断学习物体是否合理；
6. 复制 prompt 到 ChatGPT Image2；
7. 上传生成图；
8. 审核 scene version；
9. 锁定最终版本；
10. 导入现有 pipeline。

---

## 8. 核心业务流程

### 8.1 总流程

```text
Create Course Project
  ↓
Create Space Category
  ↓
AI Generate Chapter Candidates
  ↓
Human Select / Edit / Reorder Chapters
  ↓
Create Scene Card
  ↓
AI Generate Scene Story + Object Plan
  ↓
Human Edit Scene Card
  ↓
Generate Prompt Package
  ↓
Copy Prompt to ChatGPT Image2
  ↓
Upload Generated Image
  ↓
AI Review Scene Version
  ↓
Human Review Scene Version
  ↓
Approve / Revise / Reject / Keep Alternate
  ↓
Lock Final Version
  ↓
Import to Existing Art Pipeline
```

### 8.2 导入后置 pipeline 流程

```text
Scene Library
  ↓
Select Course Project
  ↓
Select Space Category
  ↓
Select Chapter
  ↓
Select Scene Version
  ↓
Create Art Pipeline Run
  ↓
Copy image to run/source/original.png
  ↓
Write detection vocabulary
  ↓
Write scene_context.json
  ↓
Enter existing detect stage
```

现有 workspace 文件结构已经以 `runs/index.json`、`run_<timestamp>_<slug>/source/original.png`、`state.json`、`workflow.json`、`tasks/*.json` 等形式组织处理记录，因此导入逻辑应复用现有 run 结构，而不是新增一套 asset pipeline。

---

## 9. 信息架构

前端新增一个独立一级入口：

```text
Course Planner
```

主页面结构：

```text
Course Planner
├── Course Dashboard
├── Space Categories
├── Chapter Board
├── Scene Card Editor
├── Prompt Package
├── Scene Version Review
├── Story Arc Library
└── Vocabulary Knowledge Base
```

v1 必做：

```text
Course Dashboard
Space Categories
Chapter Board
Scene Card Editor
Prompt Package
Scene Version Review
Import to Pipeline
```

v1 可做轻量预留：

```text
Story Arc Library
Vocabulary Knowledge Base
```

---

## 10. 核心数据模型

### 10.1 CourseProject

课程项目。

```json
{
  "id": "course_home_en_a1",
  "name": "室内家庭篇 - 英语 A1",
  "app_language": "zh-CN",
  "target_languages": ["en"],
  "future_target_languages": ["ja", "ko", "es"],
  "ip_world": "cat_community",
  "default_storyline_mode": "weak",
  "status": "draft",
  "created_at": "2026-06-27T00:00:00Z",
  "updated_at": "2026-06-27T00:00:00Z"
}
```

字段说明：

| 字段                        | 说明                |
| ------------------------- | ----------------- |
| `app_language`            | App 主语言，v1 为中文    |
| `target_languages`        | 当前学习目标语言，v1 为英语   |
| `future_target_languages` | 未来计划支持语言          |
| `ip_world`                | IP 世界观，当前为猫系社区    |
| `default_storyline_mode`  | 默认故事线模式，v1 为 weak |

---

### 10.2 SpaceCategory

空间篇。

```json
{
  "id": "space_indoor_home",
  "course_project_id": "course_home_en_a1",
  "title_zh": "室内家庭篇",
  "description_zh": "围绕家庭室内生活空间设计的日常语言学习场景。",
  "scene_domain": "indoor_home",
  "target_level": "A1-A2",
  "chapter_count_target": 12,
  "storyline_mode": "weak",
  "status": "chapters_planning"
}
```

示例空间篇：

```text
室内家庭篇
室内办公篇
室外交通篇
室外机场篇
校园篇
餐厅篇
商店篇
医院篇
社区篇
公园篇
```

---

### 10.3 Chapter

Chapter 是课程场景单元，不等于房间名。

```json
{
  "id": "chapter_home_kitchen_breakfast_spill",
  "space_category_id": "space_indoor_home",
  "title_zh": "厨房早餐打翻",
  "short_title_zh": "厨房",
  "one_sentence_story_zh": "早晨厨房里，猫妈妈正在准备早餐，牛奶不小心洒在餐桌边，小猫拿纸巾帮忙清理。",
  "chapter_order": 3,
  "difficulty": "A1",
  "storyline_mode": "weak",
  "story_arc_id": null,
  "arc_order": null,
  "status": "scene_card_draft"
}
```

Chapter 状态：

```text
draft
ai_suggested
selected
scene_card_draft
object_plan_ready
prompt_ready
has_versions
version_locked
imported_to_pipeline
```

---

### 10.4 SceneCard

SceneCard 是前置模块的核心生产单位。

```json
{
  "id": "scene_card_home_kitchen_breakfast_spill_v1",
  "chapter_id": "chapter_home_kitchen_breakfast_spill",
  "scene_story_zh": "早晨厨房里，猫妈妈正在煎鸡蛋，牛奶洒在桌边，小猫拿纸巾帮忙擦。",
  "scene_event": {
    "main_action": "早餐准备中发生牛奶打翻的小意外",
    "environment_change": "餐桌边出现洒出的牛奶，小猫正在帮忙清理",
    "time_of_day": "morning",
    "mood": "warm_daily_life"
  },
  "spatial_layout": {
    "space_type": "indoor_isometric_box",
    "walls": 2,
    "front_open": true,
    "floor": "complete_isometric_floor",
    "layers": ["foreground", "midground", "background"],
    "occlusion_required": true
  },
  "characters": [
    {
      "character_id": "mother_cat",
      "role": "adult",
      "action_zh": "在炉灶前煎鸡蛋",
      "position": "background_left"
    },
    {
      "character_id": "child_cat",
      "role": "child",
      "action_zh": "拿着纸巾靠近洒出的牛奶",
      "position": "midground_right"
    }
  ],
  "visual_constraints": {
    "ip_species": "cat",
    "style": "medium_chibi",
    "avoid": [
      "catalog layout",
      "flat object grid",
      "collage",
      "floating objects",
      "toy collectible style"
    ]
  },
  "object_plan_id": "object_plan_home_kitchen_breakfast_spill_v1",
  "status": "ready_for_prompt"
}
```

---

### 10.5 LearningObjectPlan

学习物体规划。

```json
{
  "id": "object_plan_home_kitchen_breakfast_spill_v1",
  "chapter_id": "chapter_home_kitchen_breakfast_spill",
  "target_language": "en",
  "natural_objects": [
    "table",
    "chair",
    "cup",
    "plate",
    "egg",
    "pan",
    "milk",
    "tissue",
    "spoon",
    "sink"
  ],
  "must_include_objects": [
    "table",
    "cup",
    "plate",
    "milk",
    "tissue"
  ],
  "optional_objects": [
    "fork",
    "bowl",
    "bottle",
    "knife",
    "towel"
  ],
  "high_frequency_candidates": [
    {
      "word": "bowl",
      "decision": "add_if_natural",
      "reason_zh": "厨房高频物体，可自然放在餐桌或水槽旁。"
    },
    {
      "word": "sofa",
      "decision": "reject_for_this_scene",
      "reason_zh": "高频但不属于厨房早餐场景，应分配到客厅 chapter。"
    }
  ],
  "rejected_objects": [
    {
      "word": "printer",
      "reason_zh": "不符合家庭厨房场景。"
    }
  ],
  "future_language_items": {
    "actions": ["cook", "pour", "wipe", "hold"],
    "states": ["wet", "clean", "dirty", "empty"],
    "prepositions": ["on", "under", "next to", "behind"]
  }
}
```

---

### 10.6 VocabularyItem

v1 可以用轻量本地 JSON 维护，不需要正式数据库。

```json
{
  "lemma": "cup",
  "pos": "noun",
  "target_language": "en",
  "zh": "杯子",
  "level": "A1",
  "is_concrete_object": true,
  "is_visualizable": true,
  "scene_tags": ["kitchen", "dining_room", "office", "cafe"],
  "object_category": "container",
  "daily_frequency_score": 5,
  "visual_clarity_score": 5,
  "pipeline_detectability_score": 5,
  "cross_scene_reuse_score": 5
}
```

v1 内部规则字段：

| 字段                             | 说明        |
| ------------------------------ | --------- |
| `daily_frequency_score`        | 日常出现频率    |
| `visual_clarity_score`         | 是否容易被画出来  |
| `pipeline_detectability_score` | 是否适合检测/分割 |
| `cross_scene_reuse_score`      | 是否跨场景复用   |
| `scene_tags`                   | 适合出现的场景标签 |

未来正式词频库字段预留：

```json
{
  "cefr": "A1",
  "oxford3000": true,
  "evp_level": "A1",
  "frequency_rank": 850,
  "frequency_source": "future_external_vocab_kb",
  "corpus_frequency_per_million": null
}
```

---

### 10.7 PromptPackage

Image2 生成包。

```json
{
  "id": "prompt_pkg_home_kitchen_breakfast_spill_v1",
  "scene_card_id": "scene_card_home_kitchen_breakfast_spill_v1",
  "prompt_language": "en",
  "copy_mode": "chatgpt_image2",
  "full_prompt_en": "...",
  "short_prompt_en": "...",
  "revision_prompt_en": null,
  "negative_prompt_en": "...",
  "must_include_objects": [
    "table",
    "cup",
    "plate",
    "milk",
    "tissue"
  ],
  "style_rules": [
    "single-species cat community",
    "medium chibi proportions",
    "warm daily-life illustration",
    "isometric box room"
  ],
  "spatial_rules": [
    "two walls and one complete floor",
    "front side open",
    "foreground, midground, background layers",
    "real occlusion between objects"
  ],
  "review_checklist": [
    "active daily-life event",
    "clear character actions",
    "objects naturally placed",
    "not a catalog image",
    "P0 objects visible or partially visible"
  ]
}
```

---

### 10.8 SceneVersion

场景版本。

```json
{
  "id": "scene_ver_home_kitchen_breakfast_spill_003",
  "chapter_id": "chapter_home_kitchen_breakfast_spill",
  "scene_card_id": "scene_card_home_kitchen_breakfast_spill_v1",
  "prompt_package_id": "prompt_pkg_home_kitchen_breakfast_spill_v1",
  "version_index": 3,
  "image_path": "scene_library/course_home_en_a1/space_indoor_home/chapter_home_kitchen_breakfast_spill/versions/v003/image.png",
  "source": "chatgpt_image2_manual_upload",
  "ai_review_id": "ai_review_scene_ver_003",
  "human_review": {
    "decision": "approved",
    "notes_zh": "空间结构成立，牛奶和纸巾明确，厨房物体自然。",
    "reviewed_at": "2026-06-27T00:00:00Z"
  },
  "status": "approved"
}
```

SceneVersion 状态：

```text
uploaded
ai_review_pending
ai_reviewed
revision_needed
human_review_pending
approved
rejected
keep_as_alternate
locked_for_pipeline
imported_to_pipeline
```

---

### 10.9 AIReviewResult

AI 审核结果。

```json
{
  "id": "ai_review_scene_ver_003",
  "scene_version_id": "scene_ver_home_kitchen_breakfast_spill_003",
  "overall_score": 86,
  "decision": "pass_with_minor_issues",
  "checks": {
    "active_event": {
      "score": 5,
      "passed": true,
      "comment_zh": "有明确的早餐打翻事件。"
    },
    "isometric_space": {
      "score": 4,
      "passed": true,
      "comment_zh": "两面墙和地面结构基本成立。"
    },
    "not_catalog": {
      "score": 5,
      "passed": true,
      "comment_zh": "不是平铺物体清单。"
    },
    "p0_objects_visible": {
      "score": 4,
      "passed": true,
      "missing_objects": [],
      "weak_objects": ["tissue"]
    },
    "occlusion": {
      "score": 4,
      "passed": true,
      "comment_zh": "存在合理遮挡。"
    },
    "pipeline_readiness": {
      "score": 4,
      "passed": true,
      "comment_zh": "主要物体可检测，但纸巾较小。"
    }
  },
  "revision_suggestions": [
    "让小猫手里的纸巾更清晰一些。",
    "让洒出的牛奶边缘更明显。"
  ]
}
```

---

### 10.10 PipelineImportPackage

导入现有 pipeline 的交接包。

```json
{
  "id": "pipeline_import_home_kitchen_breakfast_spill_v003",
  "scene_version_id": "scene_ver_home_kitchen_breakfast_spill_003",
  "course_project_id": "course_home_en_a1",
  "space_category_id": "space_indoor_home",
  "chapter_id": "chapter_home_kitchen_breakfast_spill",
  "source_image": "scene_library/course_home_en_a1/space_indoor_home/chapter_home_kitchen_breakfast_spill/versions/v003/image.png",
  "detection_vocabulary": [
    "table",
    "chair",
    "cup",
    "plate",
    "egg",
    "pan",
    "milk",
    "tissue",
    "spoon",
    "sink"
  ],
  "expected_objects": [
    {
      "word": "milk",
      "priority": "P0",
      "visibility": "partial_ok"
    },
    {
      "word": "tissue",
      "priority": "P0",
      "visibility": "clear_preferred"
    },
    {
      "word": "cup",
      "priority": "P0",
      "visibility": "clear"
    }
  ],
  "scene_context": {
    "app_language": "zh-CN",
    "target_language": "en",
    "story_zh": "早晨厨房里，猫妈妈正在准备早餐，牛奶不小心洒在餐桌边，小猫拿纸巾帮忙清理。",
    "scene_type": "indoor_isometric_box",
    "ip_world": "cat_community"
  },
  "created_art_pipeline_run_id": null,
  "status": "ready_to_import"
}
```

---

## 11. 文件结构设计

新增 `scene_library/`，与现有 `workspace/` 并列。

```text
project_root/
  scene_library/
    courses/
      course_home_en_a1/
        course.json
        vocabulary/
          vocabulary_items.json
          scene_tags.json
        spaces/
          space_indoor_home/
            space.json
            chapters/
              chapter_home_kitchen_breakfast_spill/
                chapter.json
                scene_card.json
                object_plan.json
                prompt_packages/
                  prompt_pkg_v001.json
                  prompt_pkg_v002.json
                versions/
                  v001/
                    image.png
                    ai_review.json
                    human_review.json
                    prompt_package.json
                  v002/
                    image.png
                    ai_review.json
                    human_review.json
                    prompt_package.json
                  v003/
                    image.png
                    ai_review.json
                    human_review.json
                    prompt_package.json
                pipeline_imports/
                  import_v003.json
        story_arcs/
          arc_delivery_cat_one_day.json
```

现有 pipeline 仍保留：

```text
workspace/
  runs/
    index.json
    run_<timestamp>_<slug>/
      source/original.png
      state.json
      workflow.json
      tasks/
      elements/
      export/
```

---

## 12. 功能需求

## 12.1 Course Dashboard

### 目标

让用户查看当前课程研发整体进度。

### 功能

1. 创建 Course Project；
2. 查看所有 Course Project；
3. 查看空间篇数量；
4. 查看 chapter 数量；
5. 查看 scene version 数量；
6. 查看已锁定版本数量；
7. 查看已导入 pipeline 数量；
8. 查看待审核版本数量。

### 页面信息

```text
Course Name
App Language
Target Language
Space Count
Chapter Count
Locked Scene Versions
Imported Pipeline Runs
Pending Reviews
```

### 验收标准

1. 用户可以创建一个新课程；
2. 用户可以进入某个课程；
3. 系统能统计课程下的空间篇、chapter、版本、待审核数量；
4. 所有数据写入本地 `scene_library/courses/<course_id>/course.json`。

---

## 12.2 Space Category Planner

### 目标

让用户创建空间篇，并通过 AI 辅助拆分 chapter 候选。

### 输入

```text
空间篇名称：室内家庭篇
目标等级：A1-A2
目标 chapter 数：12
故事线模式：weak
场景风格：isometric box
```

### AI 输出

```json
{
  "space_title_zh": "室内家庭篇",
  "chapter_candidates": [
    {
      "title_zh": "玄关雨天回家",
      "short_title_zh": "玄关",
      "one_sentence_story_zh": "雨天回家后，小猫在玄关收伞、脱鞋，爸爸猫挂起湿外套。",
      "reason_zh": "覆盖鞋、伞、外套、门、地垫等高频家庭入口物体。"
    },
    {
      "title_zh": "厨房早餐打翻",
      "short_title_zh": "厨房",
      "one_sentence_story_zh": "早晨厨房里，猫妈妈准备早餐时牛奶洒了，小猫拿纸巾帮忙清理。",
      "reason_zh": "覆盖厨房、餐具、食物、清洁相关高频物体。"
    }
  ]
}
```

### 人工操作

```text
Accept
Reject
Edit
Merge
Duplicate
Reorder
Lock Chapter List
```

### 验收标准

1. 输入空间篇名称后，可生成 chapter 候选；
2. 每个候选必须包含 `title_zh`、`short_title_zh`、`one_sentence_story_zh`、`reason_zh`；
3. 用户可以删除、编辑、重排；
4. 用户锁定后，系统生成 chapter JSON；
5. 被锁定的 chapter 进入 Chapter Board。

---

## 12.3 Chapter Board

### 目标

以看板形式管理一个 SpaceCategory 下的所有 chapter。

### 展示字段

```text
Chapter Title
One Sentence Story
Status
Difficulty
P0 Object Count
Scene Version Count
Locked Version
Pipeline Import Status
```

### 状态列

```text
Draft
Scene Card Ready
Prompt Ready
Versions Uploaded
Review Needed
Approved
Locked
Imported
```

### 验收标准

1. 可按状态筛选 chapter；
2. 可进入 Scene Card Editor；
3. 可看到每个 chapter 是否已有版本；
4. 可看到是否已导入 pipeline；
5. 可手动新增 chapter。

---

## 12.4 Scene Card Editor

### 目标

针对单个 chapter 细化场景设计。

### 模块

```text
A. 基本信息
B. 一句话故事线
C. 场景事件
D. 空间结构
E. 角色与动作
F. 物体规划
G. 风格规则
H. 遮挡规则
I. Prompt Preview
```

### AI 辅助能力

1. 根据 chapter 生成 SceneCard；
2. 优化一句话故事线；
3. 生成角色动作；
4. 生成空间布局；
5. 生成自然物体列表；
6. 生成 P0/P1/P2 物体分级；
7. 检查是否违反 Scene Director；
8. 生成 prompt package。

### Scene Director 校验规则

必须检查：

```text
是否是生活事件
是否正在发生
是否有角色动作
角色是否改变环境状态
是否有真实空间结构
是否有前中后层
是否允许遮挡
是否避免 catalog 图
是否避免平铺物体清单
是否符合猫系 IP
是否符合中度 Q 版
```

### 验收标准

1. 用户可以手动编辑所有 SceneCard 字段；
2. AI 生成内容不直接覆盖用户内容，必须以 suggestion 形式出现；
3. 用户点击 Apply 后才写入；
4. SceneCard 可保存为 draft；
5. SceneCard 通过基础校验后，状态变为 `ready_for_prompt`。

---

## 12.5 Learning Object Planner

### 目标

在 Scene-first 原则下规划可学习物体，并进行高频词覆盖检查。

### 物体分级

```text
P0 / must_include_objects：必须出现
P1 / recommended_objects：推荐出现
P2 / optional_objects：可选出现
Reject：不适合本场景
Future：未来用于动作、状态、介词、短语
```

### 内部评分规则

每个候选物体计算 `scene_learning_value_score`：

```text
learning_value =
  0.30 * scene_fit_score
+ 0.20 * daily_frequency_score
+ 0.15 * visual_clarity_score
+ 0.15 * learning_level_score
+ 0.10 * interaction_score
+ 0.05 * cross_scene_reuse_score
+ 0.05 * pipeline_detectability_score
```

字段说明：

| 字段                             | 说明           |
| ------------------------------ | ------------ |
| `scene_fit_score`              | 是否自然属于当前场景   |
| `daily_frequency_score`        | 日常出现频率       |
| `visual_clarity_score`         | 是否容易视觉表达     |
| `learning_level_score`         | 是否适合当前学习等级   |
| `interaction_score`            | 是否能产生动作      |
| `cross_scene_reuse_score`      | 是否跨场景复用      |
| `pipeline_detectability_score` | 是否适合检测、分割、遮罩 |

### 决策规则

```text
score >= 4.3 且 scene_fit >= 4：P0
score >= 3.5 且 scene_fit >= 3：P1
score >= 2.5：P2
scene_fit < 2：Reject or Move to another chapter
```

### 高频词处理

系统不能直接把高频词塞进场景，只能提出建议：

```text
建议加入当前场景
建议移到其他 chapter
建议未来使用
建议拒绝
```

示例：

```json
{
  "word": "sofa",
  "daily_frequency_score": 5,
  "scene_fit_score": 1,
  "decision": "move_to_another_chapter",
  "suggested_chapter": "客厅收拾玩具",
  "reason_zh": "sofa 是高频家庭词，但不适合厨房早餐打翻场景。"
}
```

### 验收标准

1. 系统可以从 SceneCard 自动生成自然物体列表；
2. 用户可以修改 P0/P1/P2；
3. 系统可以提示高频缺口；
4. 高频缺口必须经过人工确认；
5. 导入 pipeline 时，P0/P1/P2 可转成 detection vocabulary；
6. Future language items 不进入 v1 pipeline detection，但必须保存。

---

## 12.6 Prompt Package Generator

### 目标

生成可复制到 ChatGPT Image2 的 prompt package。

### Prompt 类型

```text
Full Prompt：完整生成 prompt
Short Prompt：较短版本
Revision Prompt：基于某个 scene version 审核结果生成的修改 prompt
Negative Constraints：负向约束
Checklist：审核清单
```

### Full Prompt 内容结构

```text
1. Image task
2. Scene story
3. Spatial layout
4. Characters and actions
5. Must-include objects
6. Optional objects
7. Occlusion rules
8. Style rules
9. Negative constraints
10. Output expectation
```

### Prompt 示例模板

```text
Create an isometric cutaway illustration for a scene-based language learning game.

Scene:
A warm morning kitchen scene in a small cat family home. The mother cat is cooking eggs at the stove, while a small child cat is holding a tissue near spilled milk on the edge of the dining table. The scene should feel like an active daily-life event, not a staged catalog image.

Spatial layout:
Use an isometric box room with two visible walls and one complete floor. The front side is open like a cutaway. Keep clear foreground, midground, and background layers. Use real spatial perspective and natural occlusion.

Characters:
Use a single-species cat community. Medium chibi proportions, about 2.4 to 2.7 heads tall. Characters must be performing actions and changing the environment.

Must include objects:
table, cup, plate, milk, tissue, pan.

Optional objects:
egg, spoon, bowl, sink, towel, chair.

Do not create:
catalog object layout, flat object grid, collage, floating objects, toy collectible style, fantasy creatures, mixed animal species.

The final image should be suitable for later object detection and segmentation.
```

### 验收标准

1. 用户可以一键复制 Full Prompt；
2. 用户可以一键复制 Revision Prompt；
3. PromptPackage 以 JSON 保存；
4. PromptPackage 必须引用 SceneCard 和 ObjectPlan；
5. PromptPackage 生成后，Chapter 状态变为 `prompt_ready`。

---

## 12.7 Scene Version Upload

### 目标

用户从 ChatGPT Image2 生成图片后，把结果上传回本地系统，形成 chapter 的 scene version。

### 功能

1. 上传 PNG/JPG；
2. 自动生成 version index；
3. 关联 prompt package；
4. 生成缩略图；
5. 保存图片；
6. 进入 AI Review。

### 上传规则

```text
一个 chapter 可以有多个 scene version
每个 version 必须关联一个 prompt package
同一时间只能有一个 locked_for_pipeline version
```

### 验收标准

1. 用户可以上传图片；
2. 图片保存到对应 chapter 的 `versions/vXXX/image.png`；
3. 系统生成 SceneVersion JSON；
4. 上传后状态为 `ai_review_pending`；
5. 上传失败时不破坏已有版本。

---

## 12.8 AI Review

### 目标

对上传的 scene version 做结构化审核，帮助用户判断是否需要重生图或修改 prompt。

### 审核项

| 审核项                | 说明                  |
| ------------------ | ------------------- |
| active_event       | 是否有正在发生的生活事件        |
| character_action   | 角色是否在执行动作           |
| environment_change | 是否改变环境状态            |
| spatial_structure  | 是否有真实空间结构           |
| isometric_box      | 室内是否符合等距盒子          |
| outdoor_l_shape    | 室外是否形成 L 形空间边界      |
| layer_depth        | 是否有前中后层             |
| occlusion          | 是否存在合理遮挡            |
| not_catalog        | 是否避免 catalog / 平铺清单 |
| p0_object_coverage | P0 物体是否出现           |
| object_naturalness | 物体是否自然出现            |
| pipeline_readiness | 是否适合后续检测/遮罩         |
| ip_consistency     | 是否符合猫系社区            |
| style_consistency  | 是否符合中度 Q 版          |

### 输出

```json
{
  "overall_score": 82,
  "decision": "revise_recommended",
  "blocking_issues": [
    {
      "type": "missing_p0_object",
      "object": "tissue",
      "severity": "high",
      "suggestion_zh": "让小猫手里明确拿着纸巾。"
    }
  ],
  "minor_issues": [
    {
      "type": "weak_occlusion",
      "severity": "medium",
      "suggestion_zh": "让餐椅部分遮挡桌腿，增强空间真实性。"
    }
  ],
  "revision_prompt_hints_en": [
    "Make the tissue clearly visible in the child cat's hand.",
    "Add natural partial occlusion between the chair and the table legs."
  ]
}
```

### 决策规则

```text
score >= 85：pass
score 70-84：pass_with_minor_issues / revise_recommended
score 50-69：revision_required
score < 50：reject_recommended
```

### 验收标准

1. 上传图片后可以触发 AI Review；
2. AI Review 输出结构化 JSON；
3. Review 结果展示在 Scene Version Review 页面；
4. Blocking issues 必须明显标红；
5. 系统可基于 review 生成 Revision Prompt；
6. 用户仍可覆盖 AI 结论。

---

## 12.9 Human Review

### 目标

让用户对 AI Review 后的 scene version 做最终判断。

### 决策类型

```text
Approve
Reject
Revise
Keep as Alternate
Lock for Pipeline
```

### 决策含义

| 决策                | 含义                       |
| ----------------- | ------------------------ |
| Approve           | 图可以作为合格候选                |
| Reject            | 图废弃，不再参与后续               |
| Revise            | 需要重生图，生成 revision prompt |
| Keep as Alternate | 保留为备选，不进入 pipeline       |
| Lock for Pipeline | 锁定为该 chapter 当前正式图       |

### 验收标准

1. 用户可以查看一个 chapter 的所有版本；
2. 用户可以比较 AI score、缺失对象、审核问题；
3. 用户可以对每个版本做决策；
4. 同一 chapter 只能存在一个 `locked_for_pipeline`；
5. 锁定版本后可以导入现有 pipeline。

---

## 12.10 Import to Existing Art Pipeline

### 目标

把锁定的 scene version 导入现有 Art Pipeline。

### 入口

在 Scene Version Review 页面提供：

```text
Import to Pipeline
```

在现有 Art Pipeline 上传页新增：

```text
Import from Scene Library
```

### 导入内容

```text
image.png
detection_vocabulary
expected_objects
scene_context
prompt_package reference
chapter metadata
```

### 后端行为

1. 创建新的 `workspace/runs/run_<timestamp>_<slug>/`；
2. 复制 scene version image 到 `source/original.png`；
3. 创建 `state.json`；
4. 创建 `workflow.json`；
5. 写入 `scene_context.json`；
6. 写入 detection vocabulary；
7. 更新 run index；
8. 返回新 runId；
9. 前端跳转到现有 pipeline detect stage。

### 验收标准

1. 用户点击 Import 后生成一个新 pipeline run；
2. 新 run 中的 source/original.png 与 scene version 图片一致；
3. detection vocabulary 自动填入；
4. 现有 detect stage 可以直接运行；
5. 导入记录写回 SceneVersion；
6. 导入失败时不改变 SceneVersion 锁定状态。

---

## 13. Storyline 设计

## 13.1 路线 A：弱故事线

v1 主做路线 A。

结构：

```text
Space Category
  → Independent Chapters
    → Scene Cards
      → Scene Versions
```

特点：

```text
每个 chapter 独立成立
共享猫系社区世界观
可以有轻微时间顺序
不强制连续剧情
优先覆盖生活场景和高频物体
```

示例：室内家庭篇

```text
1. 玄关雨天回家
2. 客厅收拾玩具
3. 厨房早餐打翻
4. 浴室洗手擦毛巾
5. 卧室睡前整理书包
6. 阳台晾衣服
```

---

## 13.2 路线 B：强故事线

v1 只做数据结构预留，不做完整 Story Engine。

结构：

```text
StoryArc
  → Character
  → Time Span
  → Ordered Chapters
  → Continuity Notes
```

示例：

```json
{
  "id": "arc_delivery_cat_one_day",
  "title_zh": "快递猫的一天",
  "arc_type": "career_day",
  "main_character": "delivery_cat",
  "time_span": "one_day",
  "chapters": [
    {
      "chapter_id": "chapter_home_bedroom_wakeup",
      "arc_order": 1,
      "time_of_day": "morning",
      "continuity_note_zh": "快递猫起床准备上班。"
    },
    {
      "chapter_id": "chapter_street_delivery_package",
      "arc_order": 2,
      "time_of_day": "morning",
      "continuity_note_zh": "快递猫骑车穿过街道送包裹。"
    }
  ]
}
```

v2 可扩展方向：

```text
职业者的一天
职业者的一周
角色成长线
漫画式连续场景
同一角色跨场景状态变化
```

---

## 14. 多语言设计

### 14.1 v1 范围

```text
App 主语言：中文
学习目标语言：英语
```

### 14.2 数据结构要求

所有可学习对象必须预留多语言字段：

```json
{
  "concept_id": "object_cup",
  "labels": {
    "zh-CN": "杯子",
    "en": "cup",
    "ja": null,
    "ko": null,
    "es": null
  },
  "pos": "noun",
  "scene_tags": ["kitchen", "dining_room", "office"]
}
```

### 14.3 v1 展示

v1 只展示：

```text
中文解释
英文学习词
```

### 14.4 v2 扩展

未来支持：

```text
英文
日语
韩语
西班牙语
多语言同一 concept 映射
语言切换
多语言 prompt adaptation
```

---

## 15. API 设计建议

v1 可以全部走本地 FastAPI。

### 15.1 Course APIs

```http
GET /api/course-planner/courses
POST /api/course-planner/courses
GET /api/course-planner/courses/{courseId}
PATCH /api/course-planner/courses/{courseId}
DELETE /api/course-planner/courses/{courseId}
```

### 15.2 Space APIs

```http
GET /api/course-planner/courses/{courseId}/spaces
POST /api/course-planner/courses/{courseId}/spaces
GET /api/course-planner/spaces/{spaceId}
PATCH /api/course-planner/spaces/{spaceId}
```

### 15.3 AI Chapter Suggestion APIs

```http
POST /api/course-planner/spaces/{spaceId}/ai/suggest-chapters
POST /api/course-planner/spaces/{spaceId}/chapters/apply-suggestions
```

### 15.4 Chapter APIs

```http
GET /api/course-planner/spaces/{spaceId}/chapters
POST /api/course-planner/spaces/{spaceId}/chapters
GET /api/course-planner/chapters/{chapterId}
PATCH /api/course-planner/chapters/{chapterId}
POST /api/course-planner/chapters/{chapterId}/reorder
```

### 15.5 Scene Card APIs

```http
GET /api/course-planner/chapters/{chapterId}/scene-card
POST /api/course-planner/chapters/{chapterId}/scene-card/ai/generate
PATCH /api/course-planner/scene-cards/{sceneCardId}
POST /api/course-planner/scene-cards/{sceneCardId}/validate
```

### 15.6 Object Plan APIs

```http
GET /api/course-planner/chapters/{chapterId}/object-plan
POST /api/course-planner/chapters/{chapterId}/object-plan/ai/generate
PATCH /api/course-planner/object-plans/{objectPlanId}
POST /api/course-planner/object-plans/{objectPlanId}/score
```

### 15.7 Prompt Package APIs

```http
POST /api/course-planner/scene-cards/{sceneCardId}/prompt-packages
GET /api/course-planner/prompt-packages/{promptPackageId}
POST /api/course-planner/prompt-packages/{promptPackageId}/revision
```

### 15.8 Scene Version APIs

```http
GET /api/course-planner/chapters/{chapterId}/versions
POST /api/course-planner/chapters/{chapterId}/versions/upload
GET /api/course-planner/scene-versions/{sceneVersionId}
PATCH /api/course-planner/scene-versions/{sceneVersionId}
POST /api/course-planner/scene-versions/{sceneVersionId}/lock
```

### 15.9 Review APIs

```http
POST /api/course-planner/scene-versions/{sceneVersionId}/ai-review
PATCH /api/course-planner/scene-versions/{sceneVersionId}/human-review
```

### 15.10 Pipeline Import APIs

```http
POST /api/course-planner/scene-versions/{sceneVersionId}/import-to-pipeline
GET /api/course-planner/pipeline-imports/{importId}
```

---

## 16. 前端页面需求

## 16.1 Course Dashboard

布局：

```text
左侧：Course List
右侧：Selected Course Overview
底部：Recent Activity / Pending Review
```

核心组件：

```text
CourseCard
CourseStats
CreateCourseDialog
RecentSceneVersions
PendingReviewList
```

---

## 16.2 Space Category Planner

布局：

```text
上方：Space 基本信息
中间：AI Chapter Suggestions
右侧：Selected Chapter Draft List
底部：Lock Chapter List
```

核心组件：

```text
SpaceForm
GenerateChapterSuggestionsButton
ChapterSuggestionList
SelectedChapterList
ChapterReorderPanel
```

---

## 16.3 Chapter Board

布局：

```text
按状态分列的 board
```

核心组件：

```text
ChapterCard
StatusColumn
FilterBar
ChapterSearch
```

---

## 16.4 Scene Card Editor

布局：

```text
左侧：Scene Card 表单
中间：Object Plan
右侧：AI Suggestions / Validation / Prompt Preview
```

核心组件：

```text
SceneStoryEditor
SpatialLayoutEditor
CharacterActionEditor
ObjectPlanEditor
SceneDirectorChecklist
PromptPreviewPanel
```

---

## 16.5 Prompt Package Page

布局：

```text
左侧：Prompt 类型 tabs
右侧：复制按钮与版本信息
底部：PromptPackage JSON preview
```

核心组件：

```text
FullPromptPanel
ShortPromptPanel
RevisionPromptPanel
NegativePromptPanel
CopyButton
PromptHistoryList
```

---

## 16.6 Scene Version Review

布局：

```text
左侧：Version Gallery
中间：Image Preview
右侧：AI Review + Human Decision
底部：Import to Pipeline
```

核心组件：

```text
SceneVersionGallery
ImagePreview
AIReviewScoreCard
IssueList
RevisionPromptButton
HumanDecisionPanel
LockVersionButton
ImportToPipelineButton
```

---

## 17. 状态机

### 17.1 Chapter 状态机

```text
draft
  ↓
ai_suggested
  ↓
selected
  ↓
scene_card_draft
  ↓
scene_card_ready
  ↓
object_plan_ready
  ↓
prompt_ready
  ↓
has_uploaded_versions
  ↓
version_approved
  ↓
version_locked
  ↓
imported_to_pipeline
```

### 17.2 SceneVersion 状态机

```text
uploaded
  ↓
ai_review_pending
  ↓
ai_reviewed
  ↓
human_review_pending
  ↓
approved / rejected / revision_needed / keep_as_alternate
  ↓
locked_for_pipeline
  ↓
imported_to_pipeline
```

### 17.3 PromptPackage 状态机

```text
draft
  ↓
generated
  ↓
copied
  ↓
used_for_version
  ↓
revision_generated
```

---

## 18. MVP 范围

### 18.1 P0 必须完成

1. CourseProject 创建与列表；
2. SpaceCategory 创建；
3. AI chapter 候选生成；
4. chapter 人工编辑、删除、重排、锁定；
5. SceneCard 编辑；
6. LearningObjectPlan 编辑；
7. 内部规则物体评分；
8. PromptPackage 生成与复制；
9. SceneVersion 上传；
10. AI Review 结构化结果；
11. Human Review 决策；
12. Lock Version；
13. Import to Existing Pipeline；
14. 本地 JSON 文件持久化；
15. 基础测试。

### 18.2 P1 应完成

1. StoryArc 轻量数据结构；
2. Chapter 之间弱顺序关系；
3. Revision Prompt 自动生成；
4. Object coverage dashboard；
5. Scene Director 自动校验；
6. SceneVersion 对比视图；
7. VocabularyItem 本地 JSON 管理。

### 18.3 P2 暂缓

1. 完整强故事线引擎；
2. 正式词频语料库接入；
3. 多语言完整学习词导出；
4. 批量 prompt 生成；
5. 批量 scene version 上传；
6. 生产级任务队列；
7. 多用户权限；
8. 游戏工程交付。

---

## 19. 验收标准总表

| 模块            | 验收标准                                 |
| ------------- | ------------------------------------ |
| Course        | 可以创建、保存、进入课程                         |
| Space         | 可以创建空间篇，并 AI 生成 chapter 候选           |
| Chapter       | 可以编辑、删除、重排、锁定                        |
| SceneCard     | 可以生成、编辑、保存、校验                        |
| ObjectPlan    | 可以生成 P0/P1/P2/Reject 物体              |
| 高频词规则         | 可以提示缺口，但不强制加入                        |
| PromptPackage | 可以生成 Full/Short/Revision prompt 并复制  |
| SceneVersion  | 可以上传多个版本                             |
| AIReview      | 可以输出结构化评分和问题                         |
| HumanReview   | 可以 Approve/Reject/Revise/Keep/Lock   |
| Import        | 可以创建现有 pipeline run 并进入 detect stage |
| Persistence   | 所有数据保存到本地 scene_library              |
| Safety        | 导入失败不破坏 scene_library 数据             |
| Compatibility | 不破坏现有 workspace/runs 结构              |

---

## 20. 工程实现建议

### 20.1 不要把当前四阶段 workflow 硬拉长

当前文档明确建议，后续扩展不应直接把现有四阶段 workflow 拉成大量 if/else，而应该明确 Asset Graph、Workflow Cursor、Execution Records 三类事实源。

因此本 PRD 建议：

```text
Course Planner 独立保存 scene_library
Art Pipeline 继续保存 workspace/runs
两者通过 PipelineImportPackage 衔接
```

### 20.2 v1 不引入生产级 workflow engine

继续本地 demo 的最低成本路线是保留 FastAPI + 文件 workspace + JSON task，适合单人/小团队本地验证，不需要多 worker、权限和长期可恢复任务。

### 20.3 新增代码建议

前端：

```text
frontend/src/features/coursePlanner/
  components/
  hooks/
  pages/
  types.ts
  api.ts
```

后端：

```text
backend/art_pipeline/course_planner/
  models.py
  store.py
  routes.py
  ai_chapter.py
  ai_scene_card.py
  ai_review.py
  prompt_builder.py
  import_to_pipeline.py
```

路由注册：

```text
backend/art_pipeline/api.py
  include_router(course_planner_router)
```

测试：

```text
backend/tests/course_planner/
frontend/src/features/coursePlanner/__tests__/
```

---

## 21. 关键业务规则

### 21.1 Chapter 规则

1. Chapter 必须是生活事件，不是静态空间名；
2. Chapter 必须有一句话故事线；
3. Chapter 必须可被生成成单张 isometric scene；
4. Chapter 必须能自然产生学习对象；
5. Chapter 可以属于 StoryArc，也可以独立存在。

### 21.2 SceneCard 规则

1. 必须有正在发生的事件；
2. 必须有角色动作；
3. 必须有环境状态变化；
4. 室内必须符合 isometric box；
5. 室外必须有 L-shaped outdoor boundary；
6. 必须允许遮挡；
7. 不允许 catalog / 平铺清单 / 拼贴图；
8. 必须符合猫系社区 IP。

### 21.3 ObjectPlan 规则

1. P0 物体应尽量在图中明确出现；
2. P1 物体推荐出现；
3. P2 物体可选；
4. 高频但不适配当前场景的词应移动到其他 chapter；
5. Future language items 只保存，不进入 v1 检测主流程。

### 21.4 SceneVersion 规则

1. 一个 chapter 可有多个版本；
2. 一个 chapter 只能有一个 locked version；
3. rejected version 不可导入 pipeline；
4. keep_as_alternate version 可保留但不可默认导入；
5. imported version 必须记录 pipeline run id。

---

## 22. 风险与应对

### 22.1 AI 拆分 chapter 过于泛泛

风险：AI 生成“厨房、客厅、浴室”这种静态空间。
应对：AI prompt 强制 chapter = event，不是 room name。

### 22.2 Prompt 生成图变成 catalog 图

风险：Image2 倾向把物体摆清楚，变成物品展示图。
应对：PromptPackage 强制 active event、character action、environment change、occlusion、not catalog。

### 22.3 高频词破坏 Scene-first

风险：为了覆盖词汇，场景变得不真实。
应对：高频词只做 radar，不做 hard requirement；scene_fit_score 权重最高。

### 22.4 AI Review 不稳定

风险：AI 审核可能误判。
应对：AI Review 只提供建议，最终由 Human Review 决策。

### 22.5 前置和后置 pipeline 耦合过深

风险：一改前置影响后置稳定性。
应对：只通过 PipelineImportPackage 衔接，不改变现有 detect/mask/generate/export 主流程。

### 22.6 文件系统数据越来越多

风险：scene_library 膨胀，检索变慢。
应对：v1 接受；v2 再考虑 SQLite 或轻量索引。

---

## 23. 后续版本规划

### v1：本地课程研发工作台

```text
弱故事线
中文 app 主语言
英语目标语言
Scene Library
Prompt Package
Scene Version Review
Import to Pipeline
```

### v1.5：批量研发效率提升

```text
批量 chapter 生成
批量 prompt package
版本对比增强
coverage dashboard
revision prompt 自动化
```

### v2：强故事线 StoryArc

```text
职业者的一天
职业者的一周
角色连续状态
漫画式章节流
StoryArc Board
```

### v3：多语言学习对象

```text
英语、日语、韩语、西语
concept-based vocabulary mapping
多语言导出
多语言学习内容生成
```

### v4：生产级协作与发布

```text
多人协作
数据库
权限
任务队列
游戏工程交付
版本发布
资产 lineage
```

---

## 24. 最终交付定义

v1 完成后，用户应该能够完成以下闭环：

```text
创建“室内家庭篇 - 英语 A1”
→ AI 拆出 12 个家庭生活 chapter
→ 人工选择并编辑 chapter
→ 为“厨房早餐打翻”生成 SceneCard
→ 规划 milk / cup / plate / tissue 等学习物体
→ 生成 Image2 prompt
→ 复制到 ChatGPT 生成图片
→ 上传 v001 / v002 / v003 多个版本
→ AI 审核每个版本
→ 人工锁定 v003
→ 一键导入现有 Art Pipeline
→ 自动带入 detection vocabulary
→ 进入现有 detect / mask / Codex / export 流程
```

---

## 25. PRD 总结

Course Scene Planner v1 的核心不是“自动生成图片”，而是把语言学习游戏的前置课程研发流程结构化：

```text
空间篇
→ chapter
→ scene-first 故事
→ 学习物体规划
→ prompt package
→ scene version
→ AI + 人工审核
→ pipeline import
```

它与现有 Art Pipeline 的关系是：

```text
Course Scene Planner：决定应该生成什么场景
Art Pipeline：处理已经生成好的场景图
```

第一版坚持：

```text
本地单人
半自动 Image2
Scene-first
弱故事线优先
强故事线预留
内部高频规则优先
正式词频库后接
松耦合导入现有 pipeline
```