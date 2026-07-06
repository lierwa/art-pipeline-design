# Visual Restoration Iteration Log - 2026-07-05

## Iteration 0: Patch Hygiene And Baseline

### 当前基线

- 当前视觉基线失败。控制端已检查 `output/verification/chapter-reference-vs-current.png`、`output/verification/assembly-reference-vs-current.png`，并已产出 `output/verification/visual-restoration-diff-audit-2026-07-05.md`；并排图与 diff audit 均显示 Chapter dashboard 与 Assembly editor 未达到参考图。
- `git diff --stat` 与 `git status --short -uall -- docs frontend output scene_library` 显示脏文件集中在 Course Planner UI、Course Planner tests、计划/审计文档、`output` 设计与验证产物、以及 `scene_library` 浏览器 QA 数据；本轮未发现无关业务目录混入修复 pass。
- `output/design` 与 `output/verification` 下的 PNG/MD 是设计、审计和验证产物，不是 runtime code，不得被后续实现当作运行时依赖。
- `scene_library/scene_packs/.../scene_package` 当前是生成的浏览器 QA fixture state，只能临时保留/后续替换；一旦存在 test-only 或 screenshot-only fixtures，这些文件不得作为 product data staged，也不得推广成生产业务规则或运行时默认数据。
- 旧失败视觉补丁必须按区域重写，不再继续叠加 fallback、projection、兼容分支或内部字段反推 UI。

### 脏文件分类

| 文件 | 分类 | 处置说明 |
| --- | --- | --- |
| `frontend/src/app/routes/AppRoutes.tsx` | Keep | 保留 Chapter 与 Assembly 的独立路由和 immersive shell 边界。 |
| `frontend/src/features/coursePlanner/pages/ChapterWorkspacePage.tsx` | Keep | 保留 Chapter dashboard 路由接入共享 workspace hook 的边界；页面视觉由子组件后续重写。 |
| `frontend/src/features/coursePlanner/pages/ChapterAssemblyEditorPage.tsx` | Keep | 保留 Assembly 独立编辑器路由，不把编辑器重新嵌回 Chapter。 |
| `frontend/src/features/coursePlanner/hooks/useChapterScenePackageWorkspace.ts` | Keep | 保留共享 scene-package 加载/mutation 单一事实源边界。 |
| `frontend/src/features/coursePlanner/scenePackageMedia.ts` | Keep | 保留 scene-package media URL/图片加载边界，支持 empty/complete/asset/final media。 |
| `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceController.ts` | Keep | 保留 draft、selection、autosave、save、retry controller 行为；`onRegisterLockFinalFlush` / `onLockFinalStateChange` 需审查/移除，除非恢复真实调用方或规划明确的 Assembly-route lock-final flow。 |
| `frontend/src/features/coursePlanner/components/useAssemblyWorkspaceSaveController.ts` | Keep | 保留保存/重试副作用边界；flush helper 需随 `onRegisterLockFinalFlush` 一起审查/移除，除非恢复真实调用方或规划明确的 Assembly-route lock-final flow。 |
| `frontend/src/features/coursePlanner/components/assemblyCanvasControls.ts` | Keep | 保留 canvas control contract；后续只调整使用位置和可用状态。 |
| `frontend/src/features/coursePlanner/components/assemblyLayerTreeModel.ts` | Keep | 保留 react-arborist/tree draft adapter 与 layer move/group 逻辑；row 呈现后续重写。 |
| `frontend/src/features/coursePlanner/components/AssemblyWorkspacePanel.tsx` | Rewrite visually | 重写 Assembly 产品壳、顶栏、三栏结构和底栏；保留 controller 接线。 |
| `frontend/src/features/coursePlanner/components/AssemblyWorkspaceFeedback.tsx` | Rewrite visually | 重写为参考图 top toolbar/command group，不保留失败的状态堆叠。 |
| `frontend/src/features/coursePlanner/components/AssemblyAssetPoolPanel.tsx` | Rewrite visually | 重写资源池密度、3 列网格、Used/Unused 图例和卡片动作层级。 |
| `frontend/src/features/coursePlanner/components/assemblyAssetPoolBrowser.tsx` | Rewrite visually | 重写搜索、filter、grid/list 控件密度；筛选逻辑可按需保留。 |
| `frontend/src/features/coursePlanner/components/AssemblyEditorCanvas.tsx` | Rewrite visually | 重写 Canvas header、填充比例、选中控制点和画布内缩放控件。 |
| `frontend/src/features/coursePlanner/components/AssemblyLayerTree.tsx` | Rewrite visually | 重写 Layers toolbar、多层 row 密度、visibility/lock/thumb/more affordance。 |
| `frontend/src/features/coursePlanner/components/AssemblyPlacementProperties.tsx` | Rewrite visually | 重写 Placement inspector；移除用户可见的 `cx/cy/w/h/rotation_deg` 内部字段投影。 |
| `frontend/src/features/coursePlanner/components/ChapterSceneStudio.tsx` | Rewrite visually | 重写 Chapter dashboard 比例、progress states、Assembly summary 与卡片布局。 |
| `frontend/src/features/coursePlanner/components/PromptFactsPanel.tsx` | Rewrite visually | 重写 Prompt Facts 字段集合、摘要密度和标题区状态噪音。 |
| `frontend/src/features/coursePlanner/components/LibrarySelectionPanel.tsx` | Rewrite visually | 重写 Library rows 的工作流卡片密度和状态层级。 |
| `frontend/src/features/coursePlanner/components/EmptySceneImagesPanel.tsx` | Rewrite visually | 重写 Empty Scene 横向 media-object 布局。 |
| `frontend/src/features/coursePlanner/components/CompleteSceneImagesPanel.tsx` | Rewrite visually | 重写多 complete images 列表密度与操作列。 |
| `frontend/src/features/coursePlanner/components/FinalScenePanel.tsx` | Rewrite visually | 重写 Final locked state 与横向摘要布局。 |
| `frontend/src/features/coursePlanner/components/assemblyWorkspace.css` | Rewrite visually | 重写 Assembly editor shell/layout/canvas/inspector/footer 视觉。 |
| `frontend/src/features/coursePlanner/components/assemblyEditorShell.css` | Rewrite visually | 重写新增 editor shell 样式，避免在旧失败布局上继续补样式。 |
| `frontend/src/features/coursePlanner/components/chapterStudioLayout.css` | Rewrite visually | 重写 Chapter progress/main grid 第一屏比例。 |
| `frontend/src/features/coursePlanner/components/chapterMediaPanels.css` | Rewrite visually | 重写 Chapter media card/list 布局。 |
| `frontend/src/features/coursePlanner/components/coursePlannerPanels.css` | Rewrite visually | 重写 Chapter panel/card/shared panel 样式中失败的布局假设。 |
| `frontend/src/features/coursePlanner/components/coursePlanner.css` | Rewrite visually | 清理/复核旧 selector 变更，避免保留只服务失败布局的共享样式。 |
| `frontend/src/features/coursePlanner/components/assemblyDisplayNames.ts` | Remove | Remove 范围包含 helper 文件，以及所有依赖 ID-derived fallback naming 的 import、usage、test assertion；单删文件会破坏 runtime，必须按调用点一起替换为可比 fixture 或明确展示边界。 |
| `frontend/src/features/coursePlanner/components/mediaDisplayNames.ts` | Remove | Remove 范围包含 helper 文件，以及所有依赖 ID-derived fallback naming 的 import、usage、test assertion；单删文件会破坏 runtime，必须按调用点一起替换为测试夹具真实名称或窄展示适配。 |
| `frontend/tests/coursePlanner/assemblyEditorHarness.tsx` | Rewrite visually | 重写为多资源、多 layer、选中 placement 的浏览器/单测可比状态。 |
| `frontend/tests/coursePlanner/assemblyEditorHarnessComponent.tsx` | Rewrite visually | 重写测试 harness UI 接线，服务视觉参考状态。 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor.test.tsx` | Rewrite visually | 重写 Assembly shell/assets/canvas/footer 断言。 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-final.test.tsx` | Rewrite visually | 重写 final/lock flow 断言，匹配独立 Assembly 路由。 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-layers.test.tsx` | Rewrite visually | 重写多 layer 和 layer toolbar 断言。 |
| `frontend/tests/coursePlanner/chapter-workspace-assembly-editor-properties.test.tsx` | Rewrite visually | 重写 Position/Size/Rotation 用户字段断言，禁止内部字段外露。 |
| `frontend/tests/coursePlanner/chapter-workspace.test.tsx` | Rewrite visually | 重写 Chapter dashboard reference fixture 与布局语言断言。 |
| `frontend/tests/coursePlanner/chapter-workspace-library-actions.test.tsx` | Rewrite visually | 重写 Library/Chapter 卡片状态和动作断言。 |
| `frontend/tests/coursePlanner/chapter-scene-package-workspace-stale-load.test.tsx` | Keep | 保留共享 hook 防 stale-load 回写的边界测试。 |
| `docs/superpowers/plans/2026-07-05-placement-editor-redesign.md` | Keep | 保留历史设计计划文档。 |
| `docs/superpowers/plans/2026-07-05-placement-editor-visual-restoration-iteration.md` | Keep | 保留本轮视觉修复迭代计划。 |
| `output/verification/visual-restoration-diff-audit-2026-07-05.md` | Keep | 保留失败差异审计，作为后续视觉 gate 输入。 |
| `output/verification/visual-restoration-iteration-log-2026-07-05.md` | Keep | 本文件，记录 patch hygiene baseline。 |
| `output/design/alternate-chapter-page-strict-redraw-imagegen.png` | Keep | 设计参考产物，不是 runtime code。 |
| `output/design/chapter-page-separated-assembly-reference-imagegen.png` | Keep | Chapter 接受参考图，不是 runtime code。 |
| `output/design/placement-editor-reference-imagegen.png` | Keep | Assembly 接受参考图，不是 runtime code。 |
| `output/design/rejected-chapter-page-with-invented-actions-imagegen.png` | Keep | 被拒设计样张，用于避免回退到错误方向。 |
| `output/design/rejected-chapter-workspace-embedded-assembly-imagegen.png` | Keep | 被拒设计样张，用于约束不得重新嵌入 Assembly。 |
| `output/verification/assembly-reference-vs-current.png` | Keep | 当前失败对比图，验证产物。 |
| `output/verification/assembly-route-1920x1080-retry.png` | Keep | 当前/重试 Assembly 浏览器截图，验证产物。 |
| `output/verification/assembly-route-1920x1080.png` | Keep | 当前 Assembly 浏览器截图，验证产物。 |
| `output/verification/chapter-reference-vs-current.png` | Keep | 当前失败对比图，验证产物。 |
| `output/verification/chapter-route-1920x1080.png` | Keep | 当前 Chapter 浏览器截图，验证产物。 |
| `scene_library/scene_packs/scene_pack_3cff5bc75d25/chapters/chapter_96eb047029b6/scene_package/package.json` | Keep temporarily / Replace | 浏览器 QA fixture state，仅临时用于截图复现；一旦有 test-only/screenshot-only fixture，不得作为 product data staged。 |
| `scene_library/scene_packs/scene_pack_3cff5bc75d25/chapters/chapter_96eb047029b6/scene_package/assembly.json` | Keep temporarily / Replace | 浏览器 QA fixture assembly 数据，仅临时用于截图复现；一旦有 test-only/screenshot-only fixture，不得作为 product data staged。 |
| `scene_library/scene_packs/scene_pack_3cff5bc75d25/chapters/chapter_96eb047029b6/scene_package/assets/chapter_asset_001.png` | Keep temporarily / Replace | 浏览器 QA fixture 图片，仅临时用于截图复现；一旦有 test-only/screenshot-only fixture，不得作为 product data staged。 |
| `scene_library/scene_packs/scene_pack_3cff5bc75d25/chapters/chapter_96eb047029b6/scene_package/complete_images/complete_scene_001.png` | Keep temporarily / Replace | 浏览器 QA fixture 图片，仅临时用于截图复现；一旦有 test-only/screenshot-only fixture，不得作为 product data staged。 |
| `scene_library/scene_packs/scene_pack_3cff5bc75d25/chapters/chapter_96eb047029b6/scene_package/empty_scene_images/empty_scene_001.png` | Keep temporarily / Replace | 浏览器 QA fixture 图片，仅临时用于截图复现；一旦有 test-only/screenshot-only fixture，不得作为 product data staged。 |

### Patch hygiene 约束

- 后续实现先重写失败区域，不在旧视觉补丁上继续叠 `if/else`、fallback、projection 或 UI 反推逻辑。
- `AssemblyPlacementProperties.tsx` 中的 transform 内部字段外露是明确待移除行为，后续改为 Position X/Y、Size W/H、Rotation 等用户字段。
- 名称 fallback helper 若无法证明是窄展示边界，就移除并用 fixture 中真实可读名称支撑视觉验证；Remove 覆盖 helper 文件、import/usage、以及依赖 ID-derived fallback naming 的测试断言。
- Chapter 与 Assembly 的路由分离、共享 scene-package hook、Assembly autosave/save/retry 边界是本轮保留基础；`onRegisterLockFinalFlush` / `onLockFinalStateChange` 不作为默认保留边界，除非恢复真实调用方或规划明确的 Assembly-route lock-final flow。

### 自审

- 已覆盖当前 tracked 与 untracked 的 Course Planner UI/test/docs/verification/QA fixture 文件。
- 已明确当前 baseline failed。
- 已明确 `output/design`、`output/verification` 是验证/设计产物，不是 runtime code。
- 已明确 `scene_library` 生成状态只作为浏览器 QA 数据临时保留/后续替换，且不得在 test-only/screenshot-only fixture 存在后作为 product data staged。
- 已明确旧失败视觉补丁将重写，不再叠加 fallback/projection 代码。

## Iteration 8: Browser Visual Gate

### Verification

- `npm test -- --run tests/coursePlanner`: passed，19 个测试文件 / 128 个测试通过。
- `npm run build`: passed；Vite 仍输出既有 large chunk warning，未作为本轮新增失败处理。
- `node tools/capture-course-planner-screenshots.mjs`: passed，已重新生成 Chapter / Assembly 的 1920x1080 截图、关键区域裁剪和 reference-vs-current 对比图。

### Visual Inspection

- Chapter dashboard 已恢复为独立工作台视图：progress rail、Prompt Facts、Library、Empty Scene、Complete Images、Assembly summary、Final Scene 均在首屏形成可扫描布局。
- Assembly editor 已恢复独立编辑器壳：顶部 command bar、左侧密集资产池、中央画布、右侧 Layers / Placement inspector、底部状态栏均可见。
- Placement inspector 已移除 `cx` / `cy` / `w` / `h` / `rotation_deg` 等内部字段外露，改为 Position X/Y、Width、Height、Rotation 等用户字段；像素输入仍写回 normalized manifest。
- 旧失败现象已清算：稀疏资产面板、黑色/空画布 gutter、单层 inspector、内部 transform 字段、Chapter dashboard 被压扁、错误 progress states 均不再作为当前视觉状态出现。
- Remaining blocker: Assembly canvas 右下角仍可见 tldraw `Get a license for production` prompt。tldraw 官方 license 文档要求生产环境提供有效 `licenseKey` / license 才能移除生产提示；本轮没有用 CSS 隐藏该提示。最终无噪声视觉验收需要提供有效 tldraw license key，或替换 canvas renderer。

### Post-review fixes

- Fixed P1: Back to Chapter 现在会在普通左键导航前 flush 可保存的 dirty Assembly manifest，避免 debounce timer 在 unmount 时被清掉导致坐标编辑丢失；新增 `edit -> Back before 800ms` 回归测试。
- Fixed P2: 视觉截图工具新增 macOS Chrome / Chromium / Edge app bundle 候选路径，并由 `course-planner-browser-candidates.mjs` 单独提供可测候选列表。
- Re-ran focused red/green targets: `npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx tests/coursePlanner/course-planner-visual-screenshot-tool.test.ts` passed，2 个文件 / 10 个测试通过。

### Post-delivery bugfix: conflict alert layout

- Fixed user-reported Assembly conflict state where `New package data arrived from the server...` occupied the editor grid row and pushed the canvas/assets/inspector out of view.
- Root cause: `AssemblyWorkspaceFeedback` returned a fragment, so conflict/readiness banners became direct `.assembly-product-shell` grid children. The shell grid only reserved rows for topbar/editor/statusbar, so the banner consumed the editor row.
- Fix: `AssemblyWorkspaceFeedback` now renders one `.assembly-workspace-feedback` grid child containing the topbar and compact status banners; `.assembly-product-shell` keeps editor and statusbar as separate rows.
- Regression test: server-conflict status must live under `.assembly-workspace-feedback`, while the Assembly asset pool remains mounted.
- Re-ran `npm test -- --run tests/coursePlanner`: passed，19 个测试文件 / 128 个测试通过。
- Re-ran `npm run build`: passed；仍只有既有 Vite large chunk warning。
- Re-ran `node tools/capture-course-planner-screenshots.mjs`: passed，常规 Chapter / Assembly 截图和对比图已重新生成。

### Post-delivery bugfix: false server conflict on Assembly edit

- Fixed root cause behind user-reported “操作 assembly 直接报错”: Assembly dirty/conflict comparison used `JSON.stringify(scenePackage.assembly)`, so backend-only `updated_at` changes were treated as real remote content edits while the author was editing locally.
- `manifestKeyOf` is now the single authority for Assembly dirty/conflict keys and excludes `updated_at`; controller and save commit paths now use that same key instead of ad hoc `JSON.stringify`.
- Preserved real conflict behavior: material server changes to placements/groups/layer order still enter server-conflict and keep local draft for Retry.
- Added regression test: local edit survives a background package refresh that only changes `assembly.updated_at`, without showing `New package data arrived...`.
- Red test before fix failed with the conflict message present; after fix `npm test -- --run tests/coursePlanner/chapter-workspace-assembly-editor-autosave.test.tsx` passed，10 个测试通过。
- Re-ran `npm test -- --run tests/coursePlanner`: passed，19 个测试文件 / 129 个测试通过。
- Re-ran `npm run build`: passed；仍只有既有 Vite large chunk warning。
