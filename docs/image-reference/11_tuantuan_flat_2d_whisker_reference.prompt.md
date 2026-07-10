# 团团二维平面胡须版参考 Prompt

## 文件

- 概设源：`docs/image-reference/最新版-主角团.png`
- 风格源：用户提供的等距房间手游截图
- 反例源：`docs/image-reference/09_tuantuan_scene_ready_reference.png`
- 输出图：`docs/image-reference/11_tuantuan_flat_2d_whisker_reference.png`
- 生成时间：2026-07-09
- 用途：重做团团的可绑定角色参考，改为平面二维画法，并补回胡须识别点。

## 旧稿处置

`09_tuantuan_scene_ready_reference.png` 作为旧稿反例保留，不作为当前合格绑定图。

WHY：旧稿太想表达等距体块和结构关系，出现了头部侧面线、身体穿插线、包带绕体透视等结构信息。用户要的是参考游戏那种平面二维小角色：靠外轮廓、表情符号、配饰符号成立，而不是靠结构线解释体积。

## 最终 Prompt

```text
Use case: stylized-concept
Asset type: flat 2D character reference sheet for a small isometric mobile room game
Input images: Image A, finalized main-cast concept image 最新版-主角团.png, identity source; Image B, mobile isometric room game screenshot, target small-cat style and in-game scale; Image C, previous generated sheet, use only as a negative example of too much structural linework.
Primary request: Redesign the leftmost white cat "TuanTuan" from Image A as a flat 2D game character reference that can sit inside the isometric room style of Image B. Do not draw it as a structural isometric turnaround. It should feel like a flat 2D sprite placed in the scene.
Identity to preserve: white round cat; yellow flower on a green sprout; yellow crossbody pouch; yellow dotted diagonal strap; small tail; pale pink ears and cheeks; simple black bead eyes; small mouth; visible cat whiskers. Whiskers are required: draw two short thin warm-brown whisker strokes on each cheek, simple and readable, thinner than the outer outline.
Core drawing rule: Use a flat 2D illustration approach. The character is made from simple filled shapes and a clean outer contour. Do not use internal contour lines to explain head volume, cheek volume, body side planes, shoulder structure, or leg construction. No line should look like it is trying to preserve 3D structure.
Linework rules: thick clean warm-brown outer outline; very few internal lines; no line tangles; no overlapping construction lines; no head side arc; no body side contour; no structural fold lines; no fur strokes; no wavy fur outline; no scalloped fuzzy outline. The only internal lines should be face, whiskers, ears, flower stem, strap/pouch details, and tiny paw hints if necessary.
Bag and strap rules: Treat the strap and pouch like flat graphic shapes on top of the body, not a 3D belt wrapping around a volume. The yellow dotted strap is one clean diagonal band across the front. The yellow pouch sits clearly on the lower front-side of the body. Avoid hidden behind-body strap segments and avoid complex intersections where strap, arm, body, and bag all cross.
Style target: Match Image B's small cats: cute flat mobile game art, simple round silhouette, pastel fills, thick brown outline, low detail, no realistic fur, no glossy eyes, no painterly shading. The cat should look usable at tiny room scale.
Layout: plain warm cream background, no text and no labels. Center: one main flat 2D TuanTuan sprite, front-ish 3/4 view suitable for placing in the isometric room. Left: one simplified front view to show identity details and whiskers clearly. Right: one small rear/side simplified check with the same flat line style, only if it can remain clean and not structural. Bottom: one tiny scene-scale test standing on a small pastel pink isometric floor tile patch.
Pose and personality: soft, cute, lively but simple. Keep a gentle small mouth, bead eyes, round cheeks, and short paws. The expression should be cute and readable, not dead-eyed, not over-excited.
Flower rule: The green sprout can be slightly taller than Image A and the yellow flower must stay readable, but do not overgrow it into a separate prop.
Lighting: flat color with minimal soft tint only. No cast shadows except a tiny pale oval if needed. No gradients that create 3D volume.
Avoid: structural isometric turnaround, 3D volume drawing, perspective construction lines, head side line, cheek contour line, body contour line, tangled overlapping linework, wrapping strap behind body, detailed fur, wavy/scalloped outline, hair strokes, glossy eyes, realistic texture, extra accessories, extra characters, text, labels, UI, arrows, sticker halo, simply scaling one drawing into several sizes.
```

## 判断标准

- 胡须必须出现：每边 2 条短线，细于外轮廓。
- 角色应该像平面二维 sprite，不像体块结构图。
- 线条必须少，不能出现头部侧面线、身体结构线、复杂包带穿插。
- 黄包和点状背带保留，但按平面贴片画法处理。
- 小尺寸场景测试里仍能看出：白猫、黄花、黄包、胡须。
