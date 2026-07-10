# 团团 IP 转译参考图 Prompt

## 文件

- 概设源：`docs/image-reference/最新版-主角团.png`
- 风格源：用户提供的等距房间手游截图
- 输出图：`docs/image-reference/09_tuantuan_scene_ready_reference.png`
- 生成时间：2026-07-09
- 用途：生成“角色 IP 概设 -> 等距房间实机小角色”的参考图，供 scene 级资源绑定使用。

## 旧稿处置

上一版“45 度视角等比缩放展示”废弃，不作为合格参考。

WHY：等比缩小只能测试可见性，不能定义 IP 如何从概设转译到实机场景。这里需要的是有参考意义的角色转译图：既要保留概设身份锚点，也要明确最终进入等距场景后的线条、比例、细节密度和配饰规则。

## 定位

`最新版-主角团.png` 定义左一白猫“团团”的身份：白猫、头顶黄色花、黄色斜挎包、点状背带、圆身体、小尾巴。它是概设源，不是直接可绑定的实机角色图。

新图必须回答：这个角色如果进入用户截图那种等距房间手游，应该如何被画出来。实机图要像截图里的小猫：线条清楚、轮廓简单、色块干净、细节少，不用线条表现毛发。

## 最终 Prompt

```text
Use case: stylized-concept
Asset type: character IP translation reference sheet for scene-level resource binding
Input images: Image A, finalized main-cast concept image 最新版-主角团.png, identity source; Image B, mobile isometric room game screenshot, target in-game character style and scale reference.
Primary request: Generate one useful character IP reference sheet for the leftmost white cat from Image A, showing how this concept design should be translated into the small isometric room-game cat style seen in Image B. This is a reference sheet for future image generation, not a final exported sprite sheet.
Core decision: The image may include both a simplified concept anchor and in-game translation views. The in-game translation must be the main focus.
Subject identity to preserve: white round cat; yellow flower sprout on head; yellow crossbody pouch; yellow dotted diagonal strap; compact body; tiny paws; small tail; pale pink ears and cheeks; simple bead eyes if large enough. The cat should remain recognizable mainly by flower, bag, strap, white rounded silhouette, and tail.
Layout: plain warm cream background. Use a clean reference-sheet layout with no labels or text. Left side: one simplified concept anchor of the character, larger than game scale, front-ish view, but with clean simple outline and no fluffy fur lines. Center: the main in-game translation, a 45-degree top-down isometric view, standing pose, same style and visual weight as the small cats in Image B. Right side: two smaller in-game validation views, one slight walking/standing variation and one rear or side-leaning 45-degree view, both still in the same isometric room-game style. Bottom: one tiny scene-scale test of the cat standing on a small pastel pink isometric floor tile patch, to verify it fits the room scale.
In-game style rules: Match Image B's small cats: thick clean warm brown outline, flat pastel fills, simple rounded silhouette, minimal internal lines, no visible fur texture, no wavy fur outline, no scalloped fuzzy outline, no hair strokes, no complex facial detail. Do not try to draw fur with lines. Use only smooth outer contour and one or two simple silhouette bumps if absolutely needed.
Camera and pose rules: The main in-game view must clearly be 45-degree top-down isometric: slight top of head visible, feet placed on an isometric floor plane, side volume visible, face not straight-on. The body must look rotated, not like a front-facing sticker. The bag strap wraps diagonally around the body in perspective, and the pouch sits on the visible front-side hip. The pouch must not float in the belly center and must not randomly switch sides across views.
Concept anchor rules: The concept anchor can be larger and clearer, but it must already be simplified toward the game style. It should not show detailed fur, glossy eyes, painterly shading, or portrait-level detail.
Composition/framing: Keep all characters compact and small-game usable. Do not make the main character a large vertical sticker. Use even spacing and no decorative frames.
Lighting/mood: flat, soft, minimal. No strong cast shadows, no gradients, no ambient occlusion, no glossy highlights. A tiny pale grounding oval is acceptable only for the in-game views.
Color palette: warm white cat, yellow flower, yellow pouch, yellow dotted strap, pale pink ears and cheeks, warm dark brown outline, pastel cream background, pastel pink tile test.
Quality constraints: Reference usefulness matters more than cuteness. The sheet must clarify identity, style simplification, 45-degree isometric translation, and bag placement. The tiny scene-scale version must still read as the same character by flower, bag, strap, and white silhouette.
Avoid: eight-direction grid, simply scaling one drawing into smaller copies, portrait sheet, sticker style, wavy fur lines, scalloped fluffy outline, detailed fur strokes, glossy eyes, complex expression, extra clothing, extra props, extra characters, text, labels, UI, arrows, strong shadows, 3D render, bag in the belly center, inconsistent strap or pouch side.
```

## 合格标准

- 这张图是 IP 转译参考图，不是最终 sprite sheet。
- 必须同时说明“角色是谁”和“进入等距场景后应该怎么画”。
- 实机转译版是主体，必须像用户参考游戏里的小猫。
- 不得用波浪线、碎毛线、复杂轮廓线表现毛发。
- 45 度俯视要成立，不能又变成正面贴纸。
- 挎包位置必须跟身体透视一致，不在肚子正中漂浮。

## 资源面板映射

在 scene 级资源面板中，`最新版-主角团.png` 应作为：

```json
{
  "category": "character",
  "resourceName": "主角团定稿概设",
  "sourceRole": "concept_group",
  "bindableAsCast": false
}
```

`09_tuantuan_scene_ready_reference.png` 应作为：

```json
{
  "category": "character",
  "resourceName": "团团 IP 转译参考图",
  "sourceRole": "ip_translation_reference",
  "conceptSourceIds": ["最新版-主角团"],
  "bindableAsCast": true
}
```
