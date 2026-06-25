# Agent Engineering System Prompt（强约束版）

---

# 0. Global Principles

## MUST

- 优先使用成熟开源方案
- 所有设计必须基于行业最佳实践或开源实现
- 保持系统最小复杂度
- 保持代码可读性与可维护性

## MUST NOT

- 凭经验设计系统
- 无依据自研基础设施
- 忽略已有成熟方案

---

# 1. Open Source First

## MUST

- 所有功能必须优先调研开源实现
- 校验 / ORM / 鉴权 / 错误处理必须使用成熟库
- 不使用开源方案必须有明确理由

## MUST NOT

- 重复造轮子
- 自研已有成熟能力模块

---

# 2. Design Before Code

## MUST

- 编码前必须确认是否存在成熟方案
- 必须确认行业标准实现方式
- 必须确认是否存在可参考开源项目

## MUST NOT

- 未调研直接实现
- 凭经验设计架构

---

# 3. Abstraction & Reuse

## MUST

- 重复逻辑 ≥ 2 次必须抽象
- ≥ 3 次必须提取公共模块
- 优先级：middleware > service > util

## MUST NOT

- 复制粘贴逻辑
- 重复实现同一能力

---

# 4. Code Simplicity

## MUST

- 函数职责单一
- 嵌套层级 ≤ 3
- 优先清晰表达而非复杂技巧

## MUST NOT

- 函数 > 100 行
- 深层嵌套逻辑

---

# 5. Chinese Comments

## MUST

- 核心逻辑必须中文注释
- 必须说明 WHY 与 TRADE-OFF

## MUST NOT

- 解释代码表面行为

---

# 6. Continuous Refactoring

## MUST

- 每次修改必须优化旧代码结构
- 必须减少或不增加复杂度

## MUST NOT

- 只新增不优化
- 持续堆积逻辑

---

# 7. Decision Discipline

## MUST

- 所有设计必须有依据：
  - 开源项目
  - 官方文档
  - 行业实践

## MUST NOT

- 我觉得 / 习惯这样写
- 无依据技术选型

---

# 8. Complexity Control

## MUST

- 文件 ≤ 500 行
- 函数 ≤ 100 行
- 模块职责清晰
- 测试文件必须集中放在所属 package 的 `tests/` 目录下，并按源码/业务层级镜像组织
- 测试专用 helper 也必须放在 `tests/` 内，不得混入正常运行时代码目录

## MUST NOT

- 职责混乱模块
- 难以理解的复杂逻辑
- 在 `src/`、`lib/`、`ui/`、`tools/`、`prompts/` 等正常项目目录中新增 `*.test.*` / `*.spec.*`

---

# 9. Pre-Output Checklist

## MUST

- 使用成熟方案
- 避免重复逻辑
- 已完成抽象
- 有中文 WHY 注释
- 优化旧代码
- 有设计依据

## MUST NOT

- 任一项不满足仍继续输出

---

# 10. Hard Stop Rules

## MUST STOP IF

- 未调研直接实现
- 重复造轮子
- 未抽象重复逻辑
- 缺少关键设计注释
- 不理解既有领域状态 / progress-store / lesson-bank 的职责边界

## ACTION

- 停止代码生成
- 进入设计或重构阶段
- 先向用户确认，不要自行设计替代方案

---

# 11. Windows + macOS 双系统兼容（新增硬约束）

## MUST

- 所有脚本必须跨平台：优先使用 Node/Bun 脚本，不依赖仅 Unix 可用命令（如 `cp`、`mv`、`rm`、`sed -i`）
- 文件路径必须使用 `path.join/path.resolve` 或等价跨平台 API，不得手写 `\` 或 `/` 拼接
- 涉及原生模块（`node-gyp`/平台预编译包/optionalDependencies）时，必须验证 `darwin + win32` 双平台安装行为
- 构建链涉及 bun 时，若存在 shebang + Node runtime 混用风险，必须显式指定运行时（例如 `bun run --bun ...`）
- 新增依赖后，必须执行最小双端校验：
  - 本机（当前系统）完成安装 + 构建
  - 在 CI 或另一系统（Windows/macOS）至少完成 install/lockfile 校验
- lockfile 必须可复现，不得通过“仅本机可用”的临时依赖规避问题

## MUST NOT

- 通过添加单一平台包（如仅 `*-darwin-*` 或仅 `*-win32-*`）解决跨平台问题
- 把平台相关问题隐藏在 README 文案中而不修复脚本/依赖声明
- 在未做双平台验证前宣称“问题已解决”

## Pre-merge Checklist（跨平台）

- 是否存在平台专属二进制/可选依赖？若有，是否已验证双平台可解析
- 是否使用了 shell 专属语法（bash/zsh）导致 Windows 失败
- 是否存在路径大小写、分隔符、换行符（CRLF/LF）兼容风险
- CI 是否至少覆盖 `macOS + Windows` 的 install 或 build 任务之一

@CODEGRAPH.md

---

# 12. Node_Modules 禁扫硬约束（新增）

## MUST

- 必须禁止扫描 `node_modules`（含任意层级子目录）
- 必须通过 `package.json` / lockfile / 包管理器摘要命令获取依赖信息
- 若任务需要依赖分析，优先读取源码与锁文件，不得读取依赖安装产物目录

## MUST NOT

- 不得执行 `ls/find/tree/du` 等命令扫描 `node_modules`
- 不得对 `node_modules` 执行 `grep/glob/read`
- 不得以“排障”为由绕过该限制

## ACTION

- 一旦需要访问 `node_modules`，必须先停止并向用户确认
- 若用户未明确授权，保持禁止访问

---

# 13. Anti-AI-Code Rules（新增）

## MUST

- 新增抽象必须有明确职责，并满足至少一个条件：
  - 有两个及以上当前真实调用方；
  - 隔离了明确的外部协议、平台差异、生命周期或副作用边界；
  - 显著降低了当前复杂度，而不只是转发调用。
- 单一事实必须有单一权威来源；其他模块只能读取、投影或适配，不得各自重新推导一套。
- 临时兼容代码必须写明保留原因、影响范围和删除条件。
- 跨模块数据必须有稳定结构；`unknown`、metadata、字符串协议只能停留在边界层，并尽快校验/收窄。
- 测试必须说明它保护的业务不变量、协议边界、错误路径或真实回归风险。

## MUST NOT

- 不得为了“未来可能需要”提前构造没有当前职责的 manager / coordinator / registry / engine / kernel 层。
- 不得用宏大命名包装薄转发逻辑，让代码显得有架构但没有独立价值。
- 不得把 demo 样例、固定文案、固定选项或临时数据形状写成生产业务规则。
- 不得保留多个同等权威入口、状态来源或协议解释器。
- 不得让测试与实现同构到一起改一起过；测试不能只覆盖 happy path 来制造安全感。

## Interpretation

- 这些规则不禁止 `registry`、`engine`、`kernel` 等名称本身；它们禁止没有当前职责的空泛层。
- 如果某一层隔离外部协议、生命周期、插件发现、进程管理或副作用边界，它是允许的。
- 单调用方抽象如果隔离 host、平台、IO、副作用或外部协议，也可以保留。

---

# 14. Patch Hygiene（补丁清算硬约束）

## MUST

- 修复失败、用户指出无效、或新根因推翻旧假设时，下一次修改前必须先清算旧补丁。
- 必须审计当前 diff，并明确旧改动是删除、保留还是重写。
- 已证明错误的实现、兜底、helper、测试、注释和命名必须删除或重写。
- 保留旧补丁必须说明它保护的真实业务不变量或协议边界。
- 最终交付必须说明旧补丁如何处置。

## MUST NOT

- 不得在错误补丁上继续叠 if/else、fallback、projection 或 UI 反推逻辑。
- 不得修改测试去保护已经被证明错误的行为。
- 不得留下重复事实源、重复 parser、重复状态机、死接口或误导性命名。
- 不得以“后面再清理”为由保留已知错误代码。

## HARD STOP

- 如果无法判断旧补丁应删除还是保留，停止实现，先做根因分析和 diff 分类。
- 如果用户指出“之前的代码是错的”，必须先输出旧补丁处置方案，再提出新实现方案。