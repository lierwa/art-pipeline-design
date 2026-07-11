# 全局角色与场景风格资料库 Drawer 设计

日期：2026-07-11  
状态：设计已确认，等待规格复核

## 1. 背景

当前 Course Planner 允许 Chapter 绑定 Character IP 和 Reference Image，但创建入口、领域模型和管理层级不完整：

- Chapter 只能绑定已有 Character IP，却没有正确的上游资料准备入口。
- Character IP 同时保存名称、文字 invariants、personality、多个参考图和状态，产生多条身份事实源。
- 通用 Reference Library 通过 tags、notes 和 prompt role 同时解释角色、风格、场景和 other，职责过宽。
- 最新 `docs/image-reference/character-ip/v1-confirmed` 与 `v2-confirmed` 已经采用“一张图片对应一个角色、图片内部展示多视角”的资产形态，但当前产品模型仍把各图片当成可任意组合的 Reference Image。

本设计用一个位于 Scene 页面的全局资料库 Drawer，建立 Character IP 和 Scene Style Reference 的最小创建与管理闭环。Chapter 只使用资料，不创建或修改资料。

本规格取代 `2026-06-30-cat-ip-light-game-sticker-style-design.md` 中关于 Character IP 数据字段、多个 Reference Asset ID 和 Prompt Binding Contract 的旧设计。旧文档可以作为历史美术讨论保留，但不得继续作为实现依据。

## 2. 目标

- 在创建 Chapter 之前，用户可以从 Scene 页面准备全局 Character IP 和 Scene Style Reference。
- Character IP 只有名称和一张多视角 Character Model Sheet。
- Scene Style Reference 只有名称和一张参考图。
- Chapter 可以选择多个 Character IP 和一张 Scene Style Reference，但不能创建、编辑或删除全局资料。
- 最终 Prompt Package 使用所选角色设定图和场景风格参考图作为视觉输入。
- 资料替换影响后续生成，但不会改写历史生成结果。
- 复用现有 `CoursePlannerDrawer`，并在通用 Drawer 边界增加简单、可访问的开合动画。

## 3. 非目标

- 不创建独立资料库页面或新顶级导航。
- 不创建 Scene 私有资料集合或 Scene 可用性过滤。
- 不创建 Character IP 的文字身份约束、性格提示、标签、分类、状态或版本管理 UI。
- 不创建 Scene Style Profile、风格规则、镜头参数、色彩参数或文字风格描述。
- 不在 Chapter 中增加资料创建、上传、编辑或删除入口。
- 不自动导入 `docs/image-reference` 下的设计资料。
- 不拆分 Character Model Sheet 内部视角为多个权威参考资产。
- 不新增动画库。

## 4. 设计依据

- 复用项目现有 `CoursePlannerDrawer`，保持 Scene、Chapter 和 Assembly 的共享交互边界，避免资料库专属抽屉实现。
- 继续使用 FastAPI、Pydantic 和现有文件存储协议处理验证、路由与持久化，不引入新的 ORM 或媒体基础设施。
- 使用原生 CSS `transform` 与 `opacity` transition 完成简单 Drawer 动画；该能力无需引入额外依赖，并支持 [`prefers-reduced-motion`](https://developer.mozilla.org/docs/Web/CSS/@media/prefers-reduced-motion)。
- OpenAI 图像生成支持使用一张或多张参考图，并对输入图进行高保真处理；官方同时提示重复角色仍可能出现一致性偏差。因此本设计优先减少互相竞争的角色事实源，并把一个角色的多视角统一放在一张 Model Sheet 中。[OpenAI Image Generation Guide](https://developers.openai.com/api/docs/guides/image-generation)

## 5. 领域模型

### 5.1 Character IP

```text
Character IP
├── id
├── name
└── current_model_sheet_id
```

Character IP 是全局可复用的角色身份。名称和当前 Character Model Sheet 是它仅有的业务事实。

### 5.2 Character Model Sheet

一张 Character Model Sheet 只描述一个角色，但可在同一张图片中包含正面、侧面、背面和 3/4 视角。它是该 Character IP 的单一权威视觉来源。

各视角不得在资料库 UI 中显示为多个上传项、多个参考图计数或多个同权威资产。若未来生成流程需要某个单视角裁剪，只能把它视为可重新生成的派生输入，不能成为第二个角色事实源。

### 5.3 Scene Style Reference

```text
Scene Style Reference
├── id
├── name
└── current_image_id
```

Scene Style Reference 是全局可复用的命名图片。图片可以是一张代表场景，也可以是一张统一 moodboard；系统不再从它派生或保存另一套文字风格规则。

### 5.4 Chapter 选择

```text
Chapter Scene Package
├── cast_assignments
│   └── character_ip_id + role_label + action_intent
└── scene_style_reference_id: SceneStyleReferenceId
```

- 一个 Chapter 可以选择多个 Character IP。
- 一个 Chapter 选择一张 Scene Style Reference。
- Chapter 引用全局 ID，不复制或重新定义资料内容。
- Chapter 只提供选择、解除选择和业务动作信息，不提供资料管理能力。

## 6. 信息架构

### 6.1 入口

- 在 Scene 页面现有二级导航栏右侧增加一个 `资料库` 按钮。
- 按钮位于现有页面上下文中，不成为 Chapter Board 的同级导航项。
- 点击后从右侧打开现有共享 `CoursePlannerDrawer`。
- 底层 Scene 页面保持原布局，不移动三栏、不替换内容、不新增路由。

### 6.2 Drawer 列表

Drawer 只有两个 Tab：

- `角色 IP`
- `场景风格`

每个 Tab 顶部只有一个创建按钮。卡片只显示：

- 完整图片缩略图；
- 名称；
- 编辑按钮。

第一版不显示搜索、筛选、状态、标签、数量、使用统计、Scene 归属或解释文案。

Character IP 卡片必须 contain-fit 展示完整 Model Sheet，不得只裁出一个角色视角，也不得把内部视角拆成多张缩略图。

### 6.3 创建

点击创建后，当前 Drawer 内容切换为创建表单，不叠加 Modal 或第二层 Drawer。

Character IP 表单只有：

- `名称`；
- `角色设定图`。

Scene Style Reference 表单只有：

- `名称`；
- `场景风格参考图`。

名称和图片均为必填。底部只有 `取消` 和创建按钮。创建成功后返回对应列表并定位新卡片。

### 6.4 编辑

- 编辑复用同一个 Drawer 内容区。
- 允许修改名称或替换当前图片。
- 不允许清空图片后保存。
- 存在未保存修改时，返回或关闭使用现有确认对话框询问是否丢弃。
- 保存成功后返回列表并定位已修改卡片。

### 6.5 删除

- 删除入口只出现在编辑状态。
- 删除前使用现有确认对话框。
- 未被任何 Chapter 使用时允许删除。
- 被一个或多个 Chapter 使用时禁止删除，并显示使用它的 Chapter 数量。
- 用户必须先从这些 Chapter 解除选择。
- 不引入归档、停用或软删除业务状态。
- 删除资料记录后，已经被历史生成快照引用的不可变媒体文件仍然保留。

## 7. Chapter 使用流程

Chapter Studio 只消费资料：

1. 用户选择一个或多个全局 Character IP。
2. 用户选择一张全局 Scene Style Reference。
3. 系统投影当前 Chapter 文本 Prompt。
4. Prompt Package 同时提供：
   - 文本 Prompt；
   - 所选角色当前 Character Model Sheet；
   - 所选 Scene Style Reference 当前图片。
5. 用户在外部 ChatGPT/Image2 完成生成并上传结果。

如果资料不存在，Chapter 只提示用户返回 Scene 页面的资料库创建；不得在 Chapter 内嵌创建表单、上传按钮或快速新建入口。

Character IP 与 Scene Style Reference 都完成选择后，Chapter 才达到 Prompt Ready；不再提供 style `confirmed_empty` 路径。

## 8. 替换与历史快照

资料库 UI 始终只展示一个当前图片，但媒体存储必须保持历史可追溯：

- 替换图片时写入一个新的不可变媒体文件。
- 资料记录切换 `current_*_id` 指针，不覆盖旧文件。
- Chapter 当前选择实时解析资料记录指向的最新图片。
- 上传生成结果时，结果记录实际使用的图片 ID 和 Prompt Snapshot。
- 后续替换全局图片只影响下一次生成。
- 历史生成结果继续引用当时的旧媒体文件。

该内部快照协议不暴露为用户可操作的版本管理 UI。

## 9. 原子性与错误处理

- 创建操作一次接收名称和图片，对用户表现为一个原子动作。
- 图片存储成功但资料记录创建失败时，必须清理本次孤立文件。
- 替换失败时保留原图片指针，不产生半更新状态。
- 重名、空名称、缺少图片或无效 PNG 在写入前拒绝。
- 第一版沿用当前 Course Planner 的 PNG 媒体约束，不扩展格式。
- 请求失败时保留表单字段和本地图片预览，允许直接重试。
- 创建、保存和删除期间禁用重复提交。
- 删除引用冲突使用稳定错误类型，并返回引用 Chapter 数量。

## 10. 通用 Drawer 动画

动画属于共享 `CoursePlannerDrawer`，所有消费方统一获得，不由资料库页面单独实现。

打开：

- Drawer 从 `translateX(100%)` 到 `translateX(0)`；
- 时长 `180ms`；
- easing 为 `ease-out`；
- backdrop 在 `150ms` 内从透明淡入现有遮罩透明度。

关闭：

- Drawer 在 `160ms` 内向右滑出；
- easing 为 `ease-in`；
- backdrop 同时淡出；
- 退出动画结束后再卸载 DOM；
- 退出阶段禁用 Drawer 指针交互。

约束：

- 无 backdrop 的 overlay Drawer 仍执行位移动画，但不生成遮罩。
- 不使用弹簧、回弹、缩放、模糊或内容逐项动画。
- Drawer 内列表与表单切换不增加额外页面动画。
- `prefers-reduced-motion: reduce` 时禁用位移动画并直接完成显隐。
- 消费方继续只使用 `isOpen` 和 `onClose`，不维护动画阶段。

## 11. 当前错误设计清算

本次实现必须重写冲突模型，不得在旧模型上继续增加兼容字段或 fallback。

必须删除或替换：

- Character IP 的 `visual_invariants`；
- Character IP 的 `personality_cues`；
- Character IP 的多个 `reference_image_ids`；
- Character IP 的 `available/archived` 状态；
- 通用 Reference Library 的 `tags`、`notes` 和 `available/deleted` 业务状态；
- `character/style/scene/other` prompt role；
- Chapter 内 Character IP 创建和 Reference Image 上传入口；
- 风格为空的 `confirmed_empty` 替代路径；
- 把 Model Sheet 内部视角展示成多个参考图的 UI 和测试。

允许保留：

- 稳定媒体 ID、尺寸、存储路径、原文件名和创建时间等媒体协议元数据；
- Chapter Cast Assignment 的 Chapter 本地角色职责与动作意图；
- 历史生成结果已经持久化的 Prompt 和媒体快照。

保留项的理由是隔离媒体存储协议、Chapter 本地业务意图和历史不可变事实，不构成第二套 Character IP 或风格权威来源。

## 12. 验证策略

### 12.1 后端

- Character IP 创建只接受名称和一个 Model Sheet。
- Scene Style Reference 创建只接受名称和一个图片。
- 创建与替换失败不会留下孤立媒体或半更新记录。
- Character IP 名称在 Character IP Library 内唯一；Scene Style Reference 名称在 Scene Style Reference Library 内唯一。
- 被 Chapter 引用的资料不能删除。
- 替换图片不会改写历史生成快照。
- Prompt Package 正确解析多个 Character IP 和一张 Scene Style Reference。
- 旧字段和通用 prompt role 不再被接受。

### 12.2 前端

- Scene 二级导航右侧显示一个资料库按钮。
- 点击按钮复用共享 Drawer，不改变底层 Scene 布局。
- Drawer 只有两个 Tab 和最小卡片元素。
- Character Model Sheet 始终作为一张完整图片展示。
- 创建、编辑、未保存确认、删除确认和引用冲突路径均被覆盖。
- Chapter 不出现创建、上传、编辑或删除全局资料的入口。
- 重复提交和失败重试行为被覆盖。

### 12.3 动画与可访问性

- 打开与关闭阶段 class/state 正确。
- 关闭动画结束后才卸载。
- overlay 与 backdrop 两种用法都正确。
- `prefers-reduced-motion` 下不执行位移动画。
- ESC、关闭按钮和 backdrop 点击仍沿用共享 Drawer 行为。

### 12.4 视觉与跨平台

- 使用真实 Scene 页面捕获资料库 Drawer 的 1920×1080 截图。
- 验证 Drawer 不重排底层 Scene 三栏。
- Windows 本机完成安装、测试和构建。
- macOS CI 至少完成依赖安装与前后端构建/测试校验。
- 所有媒体路径继续使用跨平台路径 API，持久化路径保持 POSIX 相对格式。

## 13. 验收标准

- 用户可以在 Scene 页面打开资料库并创建 Character IP 或 Scene Style Reference。
- 创建 Character IP 时只能填写名称和上传一张完整 Model Sheet。
- 创建 Scene Style Reference 时只能填写名称和上传一张图片。
- Chapter 只能选择资料，不能管理资料。
- Prompt Package 同时包含文本、角色 Model Sheet 和场景风格参考图。
- 资料替换不破坏历史生成结果。
- 被使用资料无法删除。
- 通用 Drawer 具有已确认的简单滑入/滑出动画和 reduced-motion 支持。
- 旧的多事实源字段、通用 Reference Library 解释器和错误 UI 均被清理。
