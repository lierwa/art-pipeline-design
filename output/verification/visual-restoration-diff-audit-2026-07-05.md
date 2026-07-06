# Visual Restoration Diff Audit - 2026-07-05

## 结论

当前实现没有达到两张参考图的还原标准，不能交差。问题不是单个按钮或局部间距，而是 Chapter 页面和 Assembly 编辑器在信息架构、区域比例、内容密度、操作模型和浏览器实际呈现上都存在明显偏差。

本文件只记录差异点，不包含任何代码修改方案。

## 对比材料

- Chapter 参考图：`D:\work\art-pipeline-v2-demo\output\design\chapter-page-separated-assembly-reference-imagegen.png`
- Chapter 当前浏览器截图：`D:\work\art-pipeline-v2-demo\output\verification\chapter-route-1920x1080.png`
- Chapter 并排对比图：`D:\work\art-pipeline-v2-demo\output\verification\chapter-reference-vs-current.png`
- Assembly 参考图：`D:\work\art-pipeline-v2-demo\output\design\placement-editor-reference-imagegen.png`
- Assembly 当前浏览器截图：`D:\work\art-pipeline-v2-demo\output\verification\assembly-route-1920x1080.png`
- Assembly 并排对比图：`D:\work\art-pipeline-v2-demo\output\verification\assembly-reference-vs-current.png`

## Chapter 页面差异

### 1. 页面整体比例不一致

- 参考图的 Chapter 页面是一个清晰的 5 步工作台，左侧进度栏固定，右侧主体内容在第一屏内形成稳定的两列卡片布局。
- 当前页面虽然也分成左侧进度栏和主体区，但主体区整体更扁、更压缩，右侧留白和卡片高度比例与参考图不一致。
- 当前截图中页面内容集中在上半部分，第一屏下半部出现大面积空白；参考图的卡片纵向分布更均衡。

### 2. 左侧 Studio Progress 进度栏状态不一致

- 参考图状态为：Prompt Complete、Empty Scene Complete、Images Complete、Assembly In Progress、Final Locked。
- 当前状态为：Prompt Pending、Empty Scene Ready、Images Ready、Assembly Ready、Final Pending。
- 当前状态表达没有还原参考图的阶段语义，导致用户无法从侧栏看出“前置步骤已完成、当前正在 Assembly、Final 被锁定”的流程。
- 参考图中完成态使用绿色 check，当前完成/准备/等待状态视觉没有形成相同的流程层级。

### 3. Chapter 标题区域不一致

- 参考图标题是 `Chapter 02 - Breakfast Time`，下方有一句明确说明：`Prepare the scene assets and assembly for this chapter.`
- 当前标题和副标题使用了实际业务文本，视觉层级、字号和行高都更紧凑。
- 参考图标题区和下方卡片之间有更明确的呼吸空间；当前标题区更贴近内容卡片。

### 4. Prompt Facts 卡片不一致

- 参考图的 Prompt Facts 是左上主卡片，内部指标行包括 Characters、Target Objects、Avoid Objects、Style、Time & Place。
- 当前指标包括 Characters、Target Objects、Avoid Objects、Style、Spatial Contract，字段集合与参考图不同。
- 参考图的指标区域是一个独立的横向 summary 容器，按钮位于卡片底部左侧。
- 当前指标和按钮更紧凑，按钮位置、卡片内边距、字段间隔都没有还原参考图。
- 参考图没有在 Prompt Facts 标题右侧显示 Pending badge；当前有 Pending badge，改变了卡片语义和视觉重心。

### 5. Empty Scene 卡片不一致

- 参考图 Empty Scene 卡片中，图片在左侧，标题、规格、主按钮和两个次按钮在右侧，形成清晰的媒体对象布局。
- 当前 Empty Scene 中图片占比更大，右侧信息和按钮更挤，按钮层级和排列没有贴近参考图。
- 参考图主按钮 `Select as Empty Scene` 是右侧信息区域的核心动作；当前对应按钮视觉存在但和参考图的位置、长度、周边间距不一致。
- 参考图两个次按钮在主按钮下方并排；当前上传按钮被放到卡片底部左侧，操作结构与参考图不同。
- 参考图图片是横向厨房场景，当前图片是等距空房间；这导致卡片视觉重心和尺寸关系都不同。

### 6. Library Selection 卡片不一致

- 参考图 Library Selection 是左列中部的大卡片，四个条目纵向排列，每行有标题、副标题、状态和必要动作。
- 当前 Library Selection 行高更低，整体更压缩，没有还原参考图的大卡片体量。
- 参考图 Character IP 和 Reference Library 行的右侧动作按钮尺寸更稳定；当前按钮更靠右且视觉密度更高。
- 参考图 Style references 显示 Complete，当前显示 Unreviewed；状态语义不一致。
- 参考图条目之间分隔更轻，当前每行边框更明显，整体更像表格而不是参考图里的工作流卡片。

### 7. Images 卡片不一致

- 参考图 Images 卡片显示 3 complete images，列表有 3 个完整图像条目。
- 当前 Images 卡片只有 1 complete image，列表密度和滚动/批量管理场景没有被还原。
- 参考图每行包含缩略图、名称、分辨率、文件大小、Complete 状态、Send to Pipeline、Delete Image。
- 当前虽然有相似字段，但行高、缩略图尺寸、按钮间距和右侧操作密度都不一致。
- 参考图 Upload Complete Scene Image 按钮位于列表底部左侧，当前位置相似但整体卡片高度和上下留白不同。

### 8. Assembly 入口卡片不一致

- 参考图中的 Chapter 页面只展示 Assembly 的摘要和 `Open Assembly Editor` 入口，不嵌入摆放编辑器本体。
- 当前已经做到了不嵌入编辑器，但摘要卡片没有视觉还原参考图。
- 参考图 Assembly 状态为 `0 placements`，Assets 为 `0 available`，Target coverage 为 `0 target objects`，Readiness blockers 为 `Place at least one Chapter Asset.`
- 当前显示 `Ready`、`1 placements`、`No target objects`、`Ready for final lock.`，业务状态和参考图不一致。
- 参考图摘要区是三个并列的轻量信息盒；当前信息盒高度、间距、文字层级都更紧凑。
- 参考图 `Open Assembly Editor` 按钮是该卡片唯一强动作；当前按钮位置相似，但视觉比例没有贴近参考图。

### 9. Final 卡片不一致

- 参考图 Final 状态为 Locked，左侧有 lock icon，右上角为 `Lock Final`。
- 当前 Final 显示 Not locked，状态语义不一致。
- 参考图 placeholder 图块更大且与说明文字形成横向布局；当前图块更小，说明文字位置和卡片高度不同。
- 参考图中 Final 卡片与 Images 卡片、Assembly 卡片之间的网格比例更统一；当前 Final 卡片显得更压缩。

### 10. Chapter 页面的信息密度不一致

- 参考图以“工作台摘要”为目标，信息展示克制，卡片内有足够空间。
- 当前把更多真实状态、badge 和边框塞进卡片，视觉上更碎。
- 当前页面文字整体偏小，卡片行高偏低，导致页面不像参考图那样清楚地区分“章节级概览”和“局部操作”。

## Assembly 编辑器差异

### 1. Assembly 没有达到独立产品级编辑器的视觉规模

- 参考图是完整的全屏编辑器：左侧资源栏、中间画布、右侧图层/属性栏、顶部工具栏、底部状态栏。
- 当前虽然已经拆成独立路由，但实际呈现仍像一个嵌在页面里的工具区，尤其画布和侧栏的比例没有达到参考图的编辑器感。
- 参考图中编辑器的主工作区被画布占据；当前中间区域有大量黑色空白，画布内容没有按参考图方式填满可用空间。

### 2. 顶部工具栏不一致

- 参考图左侧是 `Assembly` 下拉和 `Chapter 02 - Breakfast Time` 下拉。
- 当前顶部是返回按钮、`Assembly` 文本和实际章节标题，信息结构不同。
- 参考图中间有一组明确的 icon tools：选择、手形平移、移动、框选/裁切、锁定。
- 当前中间只突出一个选择按钮，其他工具被放在右侧或缺失，工具分组不符合参考图。
- 参考图右侧有 undo、redo、zoom 下拉、Save、更多菜单。
- 当前右侧有 placement count、undo/redo、fit/zoom 类按钮、Saved、Save，顺序、密度、状态和参考图不同。

### 3. 左侧 Assets 面板不一致

- 参考图左侧 Assets 面板展示了可处理大量资源的 3 列网格。
- 当前只展示单个 asset card，无法体现“资源有很多”的目标场景。
- 参考图资源卡片为紧凑缩略图网格：图片、名称、类型标签、小状态点。
- 当前资源卡片占用高度更大，信息密度低，无法承载大量资源。
- 参考图顶部有搜索框、过滤入口、grid/list 切换，以及 All / Target / Prop / Scene 分组 chip。
- 当前有搜索和 chip，但整体间距、控件尺寸、排列密度没有还原参考图。
- 参考图底部有 Used / Unused 图例；当前没有等价的资源使用状态图例。
- 当前 asset card 中出现 unlink/action icon 区域，参考图资源卡片没有这种展开式操作区。

### 4. 资源数量和真实使用场景不一致

- 参考图明确展示了多个资源：Cute Cat、Breakfast Bowl、Milk Cup、Toast Plate、Napkin、Orange、Jam Jar、Knife、Spoon、Plant、Table Mat、Tissue Box 等。
- 当前只显示 `Chapter asset 001` 一个资源。
- 这导致左侧资源栏没有验证多资源滚动、多列网格、卡片截断、已用/未用状态、资源筛选等关键场景。
- 如果当前数据不足，也应该用布局骨架证明多资源状态不会挤爆；当前没有做到。

### 5. 中间 Canvas 区域不一致

- 参考图 Canvas 区域显示 `Canvas 1024 x 768` 标识，并以房间背景填满主要画布。
- 当前顶部没有还原同样的 Canvas 标识结构。
- 参考图画布内容是横向房间，直接铺满中间工作区，黑色或空白背景很少。
- 当前画布是等距空房间图片，周围有大面积黑色空白，视觉焦点严重偏离参考图。
- 参考图选中对象位于画面中心偏下，和真实室内背景形成自然摆放关系。
- 当前选中对象在等距房间左侧，且对象和背景比例、透视关系与参考图不一致。
- 参考图画布底部有悬浮 zoom 控件；当前主要 zoom 控制在顶部工具栏，缺少参考图中的画布内悬浮控制。

### 6. 画布操作手柄不一致

- 参考图选中对象有明显边框、角点、边点和顶部控制点，适合拖拽/缩放。
- 当前也有选中框，但选框尺寸、控制点样式、对象锚点和参考图不一致。
- 参考图对象选框与对象贴合度更高；当前对象选框更像按图片矩形粗略框选。
- 当前没有表现出参考图中围绕对象的精细编辑体验。

### 7. 右侧 Layers 面板不一致

- 参考图右侧 Layers 列表展示多个层：Cute Cat、Breakfast Bowl、Milk Cup、Toast Plate、Napkin、Room 等。
- 当前只有一个 `Chapter asset 001`。
- 参考图每个 layer row 包含可见性、锁定、缩略图、名称、类型和更多操作。
- 当前 layer row 信息更少，行结构不完整，无法支撑图层管理场景。
- 参考图 Layers 顶部有新增、复制、上移、下移、删除等 icon 操作。
- 当前顶部按钮更少且语义不完全一致。
- 参考图 Layers 列表高密度但可读；当前列表区域空旷，缺少多层排序和密度验证。

### 8. 右侧 Properties / Placement 面板不一致

- 参考图 Properties 位于 Layers 下方，显示 Target badge、Position、Size、Rotation 等产品化字段。
- 当前字段为 `cx`、`cy`、`w`、`h`、`rotation_deg` 等偏内部数据结构的命名。
- 参考图字段使用 px 等用户可理解单位；当前使用归一化小数，暴露了内部坐标模型。
- 参考图属性面板更紧凑，用户可以快速调整位置、尺寸、旋转。
- 当前属性面板字段多、分组长、滚动感强，没有参考图的轻量编辑效率。
- 当前出现 Dependencies 区域，参考图没有该区域，属于对当前编辑任务不必要的界面噪音。

### 9. 右侧栏宽度和内容密度不一致

- 参考图右侧栏宽度约为紧凑 inspector，能同时看到 Layers 和 Placement 的主要内容。
- 当前右侧栏更宽但信息没有更高效，反而出现更多纵向分组和空白。
- 参考图右侧信息分为两个明确 tab：Layers 和 Properties；当前也有 tab，但实际内容组织没有还原参考图密度。

### 10. 底部状态栏不一致

- 参考图底部状态栏左侧为 `All changes saved`，中间显示 selected、X、Y、W、H、R，右侧有 Preview 和 Export。
- 当前底部状态栏只显示保存状态、selected 和坐标信息，右侧 Preview / Export 入口未按参考图还原。
- 参考图状态栏是编辑器的一部分，当前状态栏视觉权重更弱。

### 11. 保存状态和动作状态不一致

- 参考图右上角 Save 是明确主动作。
- 当前同时出现 Saved badge 和 disabled Save，状态层级和参考图不同。
- 参考图底部也有保存状态，顶部 Save 用于主动保存；当前顶部保存区更像状态堆叠。

### 12. 图像内容不一致导致布局还原失真

- Assembly 参考图使用真实室内横向场景作为画布背景。
- 当前使用等距空房间图，画布长宽比、空间感、对象尺度都与参考图差异很大。
- 这不是单纯素材不同的问题，因为素材差异直接影响了画布占比、选中对象位置、侧栏遮挡和编辑器的空间感。

### 13. 操作模型不一致

- 参考图的操作模型是：从左侧资产网格拖/选资源，在中间画布定位，在右侧图层和属性里精修。
- 当前左侧资源不足、右侧只有单层、属性暴露内部字段，导致这个操作模型没有被浏览器截图证明。
- 参考图强调 icon button 和专业编辑器工具栏；当前仍有部分操作以文本或内部字段方式暴露。

### 14. 可扩展性验证不足

- 参考图验证了“很多资源”和“多层对象”的场景。
- 当前浏览器截图只验证了 1 个资源、1 个 placement、1 个 layer。
- 这无法证明布局在用户要求的资源很多场景下可用。

## 用户红框重点差异

### 1. 顶部中间工具组没有还原

- 用户红框标出的参考图顶部中间工具组包含一排专业编辑器 icon button：选择、手形平移、移动、框选/画布适配、锁定。
- 这组工具在参考图中位于画布上方的中心区域，和左侧页面导航、右侧保存/撤销区域明显分组。
- 当前实现只有一个突出的选择按钮，其他工具散落到右侧或没有以同组方式呈现。
- 当前顶部工具栏没有形成“编辑工具组”的产品心智，用户无法一眼判断当前处于选择、拖动画布、移动对象还是锁定状态。
- 这不是普通图标差异，而是编辑器基础操作模型没有按参考图落位。

### 2. 画布底部悬浮缩放控件没有还原

- 用户红框标出的参考图画布底部有一条悬浮缩放控件，包含缩小、当前缩放比例、放大、适配/全屏类按钮。
- 该控件直接覆盖在画布底部中心，是画布局部操作，不属于全局顶部工具栏。
- 当前实现没有在画布内还原这条悬浮控件，缩放相关操作主要挤在顶部右侧。
- 当前做法降低了画布直操感，也破坏了参考图里“画布区域自己管理缩放”的空间关系。
- 后续实现必须把缩放条作为画布内控件处理，而不是只保留顶部 zoom 按钮。

### 3. 右侧 Layers 列表没有还原红框里的多层密度

- 用户红框标出的参考图 Layers 区域是高密度多层列表，不是单条 layer 展示。
- 每行 layer 都包含可见性、锁定、缩略图、对象名称、对象类型和更多操作入口。
- 参考图列表中至少能看到 Cute Cat、Breakfast Bowl、Milk Cup、Toast Plate、Napkin、Room 等多层对象。
- 当前实现只有一个 `Chapter asset 001`，无法验证图层排序、选择、多层管理和行内操作。
- 当前 row 结构过空，信息密度不足，没有还原参考图中图层管理面板的产品级形态。
- 后续验收必须使用多 placement / 多 layer 状态截图，不能继续用单 layer 截图交差。

### 4. 右侧 Placement 属性面板没有还原红框里的用户字段

- 用户红框标出的参考图 Placement 面板是紧凑 inspector，顶部有 Placement 标题和 Target badge。
- 参考图字段按用户操作语言组织：Position 的 X/Y，Size 的 W/H，Rotation，且使用 px 等可理解单位。
- 当前实现暴露 `cx`、`cy`、`w`、`h`、`rotation_deg` 这类内部数据结构字段。
- 当前面板还加入了 Runtime role、Dependencies 等参考图没有的区域，增加了噪音。
- 当前属性面板纵向更长、更像数据调试面板，不像参考图里的设计工具 inspector。
- 后续实现必须把属性字段收敛成参考图中的 Position / Size / Rotation 操作，不允许把内部归一化坐标直接暴露给用户。

### 5. 红框区域必须作为 Assembly 的阻塞级验收项

- 顶部中间工具组、画布底部缩放条、右侧 Layers 列表、右侧 Placement 面板都属于 Assembly 编辑器的核心操作区。
- 这四个区域没有还原时，即使三栏布局存在，也不能判定 Assembly 编辑器达标。
- 后续浏览器校验必须单独截图检查这四个红框区域，不得只看整体页面轮廓。

## 全盘复查补充：Assembly 未框区域差异

用户红框只是指出部分关键失败区域，不能代表完整复查范围。以下按 Assembly 整屏区域补充未框出的差异，后续整改必须逐项覆盖。

### 1. 顶部左侧导航区不一致

- 参考图左上角是菜单/模块 icon、`Assembly` 下拉、章节名 `Chapter 02 - Breakfast Time` 下拉，表达的是“当前编辑器 + 当前章节上下文”。
- 当前左上角是返回按钮、`Assembly` 文本和中文章节标题，缺少参考图中的双下拉结构。
- 参考图的左侧导航区和中间工具区之间有清晰分隔线；当前左侧信息和中间工具组之间的空间关系更松散。
- 当前标题区没有还原参考图中可切换模块/章节的产品形态。

### 2. 顶部右侧命令区不一致

- 参考图右侧命令区从左到右是 undo、redo、`100%` zoom 下拉、Save、更多菜单。
- 当前右侧额外显示 `1 placements`、fit/zoom in/zoom out 类按钮、Saved badge、disabled Save。
- 当前命令数量更多但层级更乱，和参考图“少量全局命令”的组织方式不一致。
- 参考图 Save 是明确可点击主动作；当前 Save 被置灰，同时旁边又有 Saved badge，状态表达重复。
- 参考图的更多菜单在最右侧；当前没有按参考图还原该入口。

### 3. Assets 面板标题和过滤区不一致

- 参考图 Assets 标题在左上，右侧有 filter icon；当前标题下直接显示 `1 available`，改变了标题区密度。
- 参考图搜索框、grid/list 切换、filter icon 的位置关系更紧凑；当前 grid/list toggle 靠右但整体控件尺寸和间距不一致。
- 参考图的 All / Target / Prop / Scene chip 行与资源网格紧密衔接；当前 chip 行下方插入了上传 icon 按钮，打断资源浏览节奏。
- 当前上传入口不在参考图同一位置，改变了资产面板的操作模型。

### 4. Assets 网格内容不一致

- 参考图左侧资源池显示 3 列多行卡片，能证明资源很多时的浏览方式。
- 当前只有单个卡片，且卡片内出现了 unlink 状态、定位/复制/删除操作按钮。
- 参考图卡片更像资源浏览项，动作轻，主要信息是缩略图、名称、类型和使用状态点。
- 当前卡片更像资源详情卡，占用空间过大，不适合大量资源浏览。
- 当前没有验证资源名称截断、多行滚动、资源类型筛选、已用/未用状态等真实资源池场景。

### 5. Assets 面板底部不一致

- 参考图底部有 Used / Unused 图例，用于解释资源卡片左上角状态点。
- 当前没有还原该图例，导致资源状态点的含义不可见。
- 参考图左下角 `All changes saved` 位于全局底部状态栏，不属于资源卡片内部。
- 当前保存状态也在底部，但由于左侧资源区内容不足，视觉上没有形成参考图中的资源池完成形态。

### 6. Canvas 标题栏不一致

- 参考图 Canvas 区域顶部显示 `Canvas` 和 `1024 x 768`，让用户知道当前画布规格。
- 当前画布顶部没有同等清晰的规格信息。
- 参考图 Canvas 标题栏在左侧资源栏和右侧 inspector 之间形成清楚的工作区边界。
- 当前中间画布区边界依赖大面积黑色背景，缺少参考图中的工作区标题语义。

### 7. Canvas 背景与画布填充不一致

- 参考图是横向室内房间背景，几乎填满中间画布，画布本身就是主要工作内容。
- 当前是等距空房间背景，四周黑色空白过大，实际可编辑内容没有填满中间区域。
- 参考图的背景带有窗户、墙面、地板、柜子等视觉参照，利于判断摆放位置。
- 当前背景缺少真实室内参照，摆放编辑器更像素材预览，不像场景摆放工具。
- 当前中间区域视觉权重集中在一张方图和黑底，不是参考图中的“画布即工作台”。

### 8. Canvas 对象尺度不一致

- 参考图中猫对象在房间里占比较适中，位于画面中下部，和地板透视关系自然。
- 当前猫对象巨大，占据房间左下较大区域，且与等距背景的透视关系不自然。
- 参考图选中框围绕对象形成编辑控制；当前选中框包住大块图片矩形，视觉上更像选中了一张贴图。
- 当前对象尺度会误导后续位置、尺寸、碰撞或目标覆盖判断。

### 9. Canvas 外部噪音不一致

- 当前画布右下角出现 `Get a license for production` 一类外部提示，参考图没有该噪音。
- 这类提示不应出现在产品级浏览器验收截图中。
- 如果来自第三方组件或素材库，后续验收前必须处理或替换，否则会污染视觉交付。

### 10. 右侧 tab 区域不一致

- 参考图右侧 tab 为 Layers / Properties，tab 与下面内容紧密连接。
- 当前也有 Layers / Properties，但 tab 下面的布局更像普通表单面板，密度和内容层级不一致。
- 参考图 Layers 和 Placement 在同一 inspector 列内形成“层列表 + 当前选中属性”的连续编辑流。
- 当前分组更重、边框更多，操作路径被切成多个大块，效率低。

### 11. Layers 顶部工具行不一致

- 参考图 Layers 顶部工具行包含新增、复制、上移、下移、删除等图标按钮。
- 当前右侧顶部工具按钮数量、样式、含义和参考图不一致。
- 参考图这些按钮紧贴 Layers 列表，是图层管理的局部操作。
- 当前操作按钮和列表之间距离、视觉层级没有还原，且缺少多层场景证明按钮状态。

### 12. Layer row 内容不一致

- 参考图 layer row 中缩略图尺寸、对象名、类型、副操作和拖拽把手都清晰。
- 当前 row 只有一个对象，名称 `Chapter asset 001` 偏系统编号，不像用户可识别资源名。
- 当前缺少多 row 的选中态、hover 目标、锁定/可见性状态组合验证。
- 当前无法判断图层排序、拖拽重排、锁定后不可编辑等交互会怎样呈现。

### 13. Properties 字段层级不一致

- 参考图 Placement 面板字段少而明确，只呈现摆放编辑必要字段。
- 当前 Properties 面板包含 Name、Linked target、Runtime role、Transform、Dependencies 等多个业务/内部分组。
- 当前字段层级把“调试数据”和“用户编辑字段”混在一起，削弱了摆放编辑器的工具感。
- 参考图中的 Target badge 是状态标识；当前 Runtime role 用 segmented control 呈现，语义不一致。

### 14. 底部状态栏右侧操作不一致

- 参考图底部右侧有 Preview 和 Export，且与坐标状态栏在同一底栏。
- 当前底部右侧没有按参考图呈现 Preview / Export 入口。
- 参考图底栏同时承担保存状态、选区状态、坐标信息和输出入口。
- 当前底栏只证明了部分状态显示，没有完成参考图的编辑器收口能力。

### 15. Assembly 可用数据状态不一致

- 参考图通过多个 assets、多个 layers、一个 selected placement 证明编辑器进入真实工作状态。
- 当前只有 1 asset、1 layer、1 placement，无法验证用户要求的“大量资源”状态。
- 视觉验收时必须使用多资源、多图层、多对象的数据集，否则无法判断布局是否会再次挤成一坨。

## 全盘复查补充：Chapter 未框区域差异

以下按 Chapter 整屏区域补充未框出的差异，避免只盯 Assembly 导致 Chapter 页面继续偏离参考图。

### 1. Chapter 页面外框与空间使用不一致

- 参考图整体像一个完整工作台，左侧进度栏和右侧内容区域共同填满第一屏。
- 当前右侧主体内容在第一屏内明显偏上，底部留白过多。
- 参考图内容卡片纵向节奏更均衡；当前卡片高度压缩，右侧区域尤其紧凑。
- 当前页面不像参考图那样形成稳定的“章节工作台”结构。

### 2. Chapter 左侧进度栏尺寸和语义不一致

- 参考图左侧步骤卡片更高，step number、标题、状态和右侧图标层级清楚。
- 当前步骤卡片更扁，状态文案和边框强调不一致。
- 参考图当前步骤 Assembly 高亮且状态为 In Progress；当前 Assembly 为 Ready。
- 参考图 Final 是 Locked 并带锁；当前 Final 是 Pending，没有体现流程锁定。

### 3. Chapter 顶部保存状态不一致

- 参考图右上角有轻量 Saved 状态，和页面标题同一行。
- 当前右上角也有 Saved，但位置更靠屏幕右侧，与标题区域关系更弱。
- 参考图保存状态不抢视觉；当前因为主体卡片偏小，Saved 显得更孤立。

### 4. Chapter 主网格比例不一致

- 参考图左列和右列的宽度比例稳定，左列承载 Prompt Facts、Library、Assembly，右列承载 Empty Scene、Images、Final。
- 当前虽然也是两列，但左列卡片和右列卡片的高度节奏不同，整体更像压缩后的后台表单。
- 参考图各卡片之间的 gutter 更统一；当前部分卡片之间间距偏紧，底部大片空白又过松。
- 当前没有还原参考图“卡片占满并组织第一屏”的视觉节奏。

### 5. Chapter 卡片标题和状态层级不一致

- 参考图卡片标题大、状态少，用户先读任务块，再读详情。
- 当前多个卡片塞入 Pending / Ready / Saved 等 badge，状态噪音更高。
- 参考图的状态更多体现在左侧 progress 和具体行内；当前状态在卡片标题区、行内、按钮旁重复出现。
- 当前缺少明确的信息优先级。

### 6. Empty Scene 素材形态不一致

- 参考图 Empty Scene 是真实厨房横图，卡片中图片和文字/按钮形成横向媒体布局。
- 当前 Empty Scene 是等距空房间图，比例和视觉语义都不同。
- 当前图片过于像 Assembly 的空场景底图，弱化了 Chapter 页“选定空镜图”的含义。
- 参考图的 Empty Scene 更像已选中的 production image；当前更像一个候选素材占位。

### 7. Images 列表验证不足

- 参考图 Images 列表有 3 个 complete images，用来证明列表行密度和批量操作。
- 当前只有 1 个 complete image，无法验证多图列表的高度、按钮列对齐和滚动边界。
- 当前单行布局看似可用，但不代表多行状态不会再次挤压。

### 8. Final 状态和锁定关系不一致

- 参考图 Final 是 Locked，说明 Chapter 仍未进入最终生成/导出流程。
- 当前 Final 是 Not locked，但右上仍有 Lock Final 按钮，状态和参考图不一致。
- 参考图 placeholder 与说明文字的比例更像最终阶段摘要；当前 placeholder 更小，说明文字更孤立。
- 当前 Final 区域没有还原“锁定前不可继续”的流程含义。

### 9. Chapter 与 Assembly 的关系仍需更明确

- 参考图 Chapter 中的 Assembly 只是一个摘要卡片和进入编辑器按钮。
- 当前已经没有嵌入完整编辑器，但 Assembly 摘要显示了 `1 placements` 和 `Ready for final lock.`，让它看起来像已完成状态。
- 参考图中的 Assembly 是 In Progress 且仍有 blockers，强调需要进入独立编辑器处理。
- 当前 Chapter 状态会误导用户以为 Assembly 已经完成，不符合参考图流程。

### 10. Chapter 数据夹具不一致影响视觉验收

- 参考图使用 `Chapter 02 - Breakfast Time`、厨房空镜、3 张完整图、多资源预期、Final Locked 等一组固定状态。
- 当前使用中文章节标题、等距素材、1 张完整图、1 个 placement 等另一组状态。
- 如果继续用当前数据截图，视觉对比会持续混入“数据不同”和“布局不同”两类问题。
- 后续浏览器校验必须准备与参考图等价的视觉验收数据，否则不能判断还原程度。

## 全盘复查补充：必须补齐的验收截图

### 1. Assembly 全屏截图

- 必须保留 1920 x 1080 全屏浏览器截图。
- 必须能看到顶部完整工具栏、左侧多资源池、中间画布、右侧多层列表和 Placement 面板、底部状态栏。
- 必须使用多资源、多 placement、多 layer 的数据状态。

### 2. Assembly 局部截图

- 顶部工具栏局部截图：验证左侧上下文、中间工具组、右侧命令组。
- 左侧 Assets 局部截图：验证搜索、过滤、chip、3 列资源网格、Used / Unused 图例。
- 中间 Canvas 局部截图：验证横向场景填充、选中框、画布内缩放条。
- 右侧 Inspector 局部截图：验证多层 Layers 列表和 Placement 用户字段。
- 底部状态栏局部截图：验证保存状态、坐标状态、Preview / Export。

### 3. Chapter 全屏截图

- 必须保留 1920 x 1080 全屏浏览器截图。
- 必须能看到左侧 5 步流程和右侧 6 个业务卡片。
- 必须使用与参考图等价的阶段状态：Prompt Complete、Empty Scene Complete、Images Complete、Assembly In Progress、Final Locked。

### 4. Chapter 局部截图

- 左侧 progress 局部截图：验证状态语义和当前步骤。
- 顶部标题局部截图：验证标题、副标题和 Saved 状态。
- 左列卡片局部截图：验证 Prompt Facts、Library Selection、Assembly 摘要。
- 右列卡片局部截图：验证 Empty Scene、Images、Final。

## 全盘复查补充：不能再作为通过依据的内容

- 不能只因为路由拆分完成就认为 Assembly 还原完成。
- 不能只因为三栏结构存在就认为 Assembly 编辑器达标。
- 不能只因为单元测试和 build 通过就认为视觉达标。
- 不能只截一张没有多资源、多图层状态的浏览器图就交差。
- 不能只修用户红框区域，未框出的导航、资源池、画布、底栏、数据状态也必须一起复查。

## 跨页面共同差异

### 1. 状态数据没有对齐参考图

- Chapter 参考图强调 Prompt/Empty Scene/Images 已完成，Assembly 进行中，Final 锁定。
- 当前 Chapter 和 Assembly 使用了另一组真实/测试状态，导致视觉和流程语义都不一致。
- 如果还原参考图是验收目标，截图数据也必须进入可比状态。

### 2. 页面视觉密度不一致

- 参考图中的密度是产品级工作台：信息完整但不拥挤。
- 当前 Chapter 偏压缩，Assembly 则在画布区过空、侧栏区信息不足。
- 两个页面都没有达到参考图的“该密集的地方密集，该留白的地方留白”的平衡。

### 3. 浏览器校验不能只看测试通过

- 当前自动测试和 build 通过不能证明视觉还原成功。
- 两张并排对比图已经证明视觉验收失败。
- 后续必须继续用浏览器截图和并排对比图判断，不得只凭单元测试或构建成功交差。

## 当前阻塞级失败项

1. Assembly 编辑器中间画布没有还原参考图的主工作区比例。
2. Assembly 左侧 Assets 面板没有还原多资源网格和高密度资源池。
3. Assembly 右侧 Layers / Properties 没有还原多层列表和产品化属性字段。
4. Chapter 页面状态和卡片比例没有还原参考图。
5. 当前截图数据状态与参考图不一致，导致无法进行严格视觉验收。

## 后续验收口径

- 必须重新生成 Chapter 和 Assembly 的 1920 x 1080 浏览器截图。
- 必须重新生成两张并排对比图。
- 只有在并排图中主要布局、区域比例、控件密度、状态表达和操作模型都接近参考图后，才能说还原完成。
- 在这之前，不能用 `npm test` 或 `npm run build` 通过来替代视觉验收。
