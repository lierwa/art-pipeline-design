# 猫咪社区主角团 IP 与轻游戏贴纸画风定版

日期：2026-06-30

## 目标

为 Course Planner 和后续 Image2 prompt 落地确定四主角 IP 与画风基准。当前方向不再继续发散成更多角色候选，而是收敛为一套可生成、可审核、可拆分、可重绘的角色与场景风格规范。

核心定位：

```text
猫咪社区日常任务协作小队
```

四主角不是普通萌宠集合，而是四种解决日常场景问题的方式：发起行动、观察记录、稳定判断、动手执行。这个定位服务于生活场景章节、物体记忆、Prompt Version、Image Attempt 审核和贴纸资产拆分。

## 设计依据

- 项目需求：`Course Planner` 需要把角色 IP 写入 `CastBinding`、参考图和 prompt invariants，否则最终 Image2 prompt 会退回泛化的“孩子/家长/学生”角色。
- 资产管线需求：`Sticker Asset Pipeline` 需要对象边界清晰、遮挡关系可解释、重绘区域可控，不能让可拆分物体之间依赖阴影关系。
- 行业实践：角色定版应先固定 character bible / model sheet / style bible，再生成大规模场景图；先锁剪影、配件、花纹、动作语言和禁用项，再扩职业装与场景。
- 当前参考图：主参考使用 `docs/image-reference/01_主方向_生活化猫咪主角团.png`、`04_主角轮廓与动作板.png`、`05_生活场景适配换装板.png`。场景结构参考可吸收 `06/07` 的箱庭任务逻辑，但不作为角色主方向。
- 本轮风格基准候选：`docs/image-reference/08_style_baseline_light_game_sticker.png`。

## 风格结论

主方向选择：

```text
轻游戏 / 贴纸资产风
```

但保留少量温暖绘本气质。最终不是完整氛围绘本，也不是纯扁平贴纸，而是：

```text
轻游戏贴纸资产为主，温暖绘本感为辅
```

推荐比例：

- 结构与边界：70% 轻游戏/贴纸资产。
- 色彩与亲和力：20% 温暖绘本。
- 材质纹理：10% 内部轻纹理，不能污染边缘。

## 阴影规则

本项目不是完全禁止阴影。真正禁止的是：

```text
可拆分物体之间用阴影表达关系
```

### 允许

- 桌子、柜体、墙面这类大场景结构可使用轻量承托阴影，让画面站得住。
- 背景家具可有非常克制的面阴影或底部阴影，但它应属于场景光照，不应成为可拆分前景资产的一部分。
- 角色和物体内部可以有轻微体积明暗，用来表达形体。
- 前后关系优先靠遮挡、轮廓相交、手部抓握、接触点和层级顺序表达。

### 禁止

- 杯子、盘子、纸巾、牛奶盒、勺子等可拆分物体靠投影说明它们在桌面上的位置。
- 一个待拆物体的阴影落在另一个待拆物体上。
- 用接触阴影把角色脚、手、道具和桌面“粘”在一起。
- 用环境遮蔽、暗角、模糊投影解决对象关系。
- 让阴影进入 mask 边界，导致抠图时无法判断阴影归属。

### 实现取舍

WHY：如果完全去掉桌下和柜体承托阴影，完整场景会失去空间可信度；但如果每个可拆物体都带接触影，Segment 和 Repair 会无法判断阴影归属。  
TRADE-OFF：保留非目标资产的大结构承托阴影，禁止小物体之间的关系阴影。可拆分对象的关系必须靠几何接触和遮挡表达。

## 白边与描边规则

当前基准图中左数第三只猫出现白边，而其他角色没有同等白边，这是不合格的混合风格。

定版规则：

- 场景图内不使用随机白色贴纸边。
- 如果需要“贴纸感”，所有前景角色和可拆物体必须使用统一轮廓策略。
- 推荐场景图使用深色外轮廓 + 局部高亮边，不使用厚白边。
- 贴纸导出阶段可以通过后处理统一加白边，但那属于导出效果，不属于原始场景画风。

WHY：场景图需要服务检测、分割和重绘。混用白边会让模型误把白边当成角色本体，也会破坏不同角色的画风一致性。  
TRADE-OFF：原始场景牺牲一点“成品贴纸海报感”，换取更稳定的拆分边界；导出贴纸时再统一加边。

## 四主角角色圣经 v0.1

### 团团

- 职责：情绪发动机，负责发起行动和把问题变成任务。
- 剪影：云团一样的圆蓬松外轮廓，身形短圆。
- 固定识别物：黄色小斜挎包、蓬松尾巴、积极前倾姿态。
- 动作语言：举爪、擦桌、搬小物、主动靠近事件中心。
- 禁用变化：不能变瘦长，不能去掉蓬松轮廓，不能只靠职业装识别。

### 阿布

- 职责：观察者，负责发现细节、记录、检查。
- 剪影：修长身体，大耳朵，长尾巴，站姿更直。
- 固定识别物：大圆眼镜、绿色观察本或记录本、绿色小包。
- 动作语言：写字、观察、指认、比对清单。
- 禁用变化：眼镜不能消失，不能变成普通学生或普通学者猫。

### 麦麦

- 职责：稳定器，负责慢判断、稳定情绪和维持节奏。
- 剪影：敦厚橘猫，宽脸，半眯眼，体量最大。
- 固定识别物：连帽衫或围巾、慢半拍表情、抱杯或抱食物的稳定动作。
- 动作语言：双手捧杯、慢慢看、站在中间稳定局面。
- 禁用变化：不能过度活泼，不能失去半眯眼和敦厚体量。

### 点点

- 职责：执行者，负责动手、跑腿、收尾。
- 剪影：更灵活的三花猫，身体姿态有对角线动势。
- 固定识别物：图形化黑橘脸部分割、发夹、斜挎工具包。
- 动作语言：伸手放置、擦拭、奔跑、完成任务。
- 禁用变化：脸部花纹不能随机漂移，不能只变成普通三花猫。

## 画面生成硬约束

Prompt 和审核都必须检查以下规则：

- 四主角必须保持同一套描边、色彩、材质和边缘策略。
- 不允许某一个角色单独出现白边或发光边。
- 服装是场景适配层，不能覆盖角色本体识别点。
- 可拆分物体边界必须清楚，边缘不得被毛发、投影、纹理噪点污染。
- 角色和道具关系必须通过可见抓握、遮挡或接触表达。
- 不允许生成泛化人类角色替代：孩子、学生、家长等只能作为语义职责，不能作为最终 cast。
- 不允许无指派的额外主角或额外猫抢占画面。

## Prompt Binding Contract

每个 Prompt Version 必须把角色写成 `CastBinding`，不能只写“孩子/家长/学生”。

```json
{
  "castBindings": [
    {
      "characterId": "tuantuan",
      "displayName": "团团",
      "roleInScene": "main",
      "actionIntent": "发起整理动作，主动擦桌或搬动物品",
      "referenceImageIds": ["cat-ip-tuantuan-v0"],
      "invariants": [
        "fluffy round white cat silhouette",
        "yellow crossbody pouch",
        "cheerful forward helper posture",
        "same outline strategy as other cast members"
      ]
    },
    {
      "characterId": "abu",
      "displayName": "阿布",
      "roleInScene": "support",
      "actionIntent": "观察并记录场景中的细节",
      "referenceImageIds": ["cat-ip-abu-v0"],
      "invariants": [
        "slender beige-brown cat",
        "large round glasses",
        "green observation notebook",
        "careful thoughtful posture"
      ]
    },
    {
      "characterId": "maimai",
      "displayName": "麦麦",
      "roleInScene": "support",
      "actionIntent": "稳定场面，慢慢捧杯或观察任务进度",
      "referenceImageIds": ["cat-ip-maimai-v0"],
      "invariants": [
        "stocky orange tabby",
        "half-lidded calm eyes",
        "hoodie or scarf",
        "slow steady posture"
      ]
    },
    {
      "characterId": "diandian",
      "displayName": "点点",
      "roleInScene": "main",
      "actionIntent": "动手执行，放置纸巾或收拾小物",
      "referenceImageIds": ["cat-ip-diandian-v0"],
      "invariants": [
        "lively calico cat",
        "graphic black-orange face split",
        "hair clip",
        "diagonal sling tool bag"
      ]
    }
  ]
}
```

负面约束需要补充：

```text
no inconsistent white outline, no random sticker halo, no object-to-object contact shadows between separable assets, no generic human-role substitutes, no extra unassigned main cats, no mixed outline styles, no shadow-dependent object relationships
```

## 第一轮验证场景

只做小样验证，不进入批量生产。

1. 厨房早餐/餐桌整理  
   目标：验证杯子、盘子、纸巾、牛奶盒、桌子和四主角的关系能否在轻游戏贴纸风下成立。

2. 客厅收拾玩具/抱枕  
   目标：验证软性物体、家具、角色动作和场景承托阴影的边界。

3. 学校走廊/书包整理  
   目标：验证角色换装后是否仍能被认出，且不退化成普通学生角色。

## 通过标准

- 四主角脱离职业装仍可识别。
- 场景看起来站得住，但可拆分物体之间没有关系阴影依赖。
- 同一张图内所有主角的描边、白边、纹理策略一致。
- 关键小物体可以被独立检测、分割或重绘。
- Prompt 能明确写出 `CastBinding` 和 invariants，而不是依赖“可爱猫咪”这种泛化描述。
- 角色画风与场景物体画风一致，不像贴上去的素材。

## 下一步

1. 用本 spec 生成三张小样验证图。
2. 对每张图做 shadow audit、outline audit、cast identity audit。
3. 如果三张小样都通过，再把角色参考图拆成四个正式 reference asset id。
4. 再把 `Prompt Binding Contract` 接入 Course Planner 的 Tune Prompt / Prompt Package 生成链路。
