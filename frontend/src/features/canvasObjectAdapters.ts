import type { WorkspaceElement } from "../domain/workspace";
import type { CanvasObjectBox, CanvasObjectView } from "./canvasObjects";

type WorkspaceElementCanvasAssetUrls = {
  maskUrl: string | null;
  thumbnailUrl: string | null;
};

export function workspaceElementToCanvasObject(
  element: WorkspaceElement,
  urls: WorkspaceElementCanvasAssetUrls,
): CanvasObjectView {
  return {
    id: element.id,
    displayName: element.name,
    editableName: element.label ?? element.name,
    box: boxToCanvasObjectBox(element.bbox),
    thumbnailUrl: urls.thumbnailUrl,
    maskUrl: urls.maskUrl,
    maskBox: boxToCanvasObjectBox(element.canvas),
    isVisible: element.visible,
    isLocked: false,
  };
}

function boxToCanvasObjectBox(box: WorkspaceElement["bbox"]): CanvasObjectBox {
  // WHY: pipeline 的 bbox/canvas 没有旋转语义；共享画布对象必须显式补 0，
  // 避免 Assembly 的 rotation-aware surface 和 pipeline surface 产生两个几何协议。
  return {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rotationDeg: 0,
  };
}
