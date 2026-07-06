import { describe, expect, it } from "vitest";

import { workspaceElementToCanvasObject } from "../src/features/canvas/CanvasStage";
import type { WorkspaceElement } from "../src/domain/workspace";
import { loadedState } from "./app/appFixtures";

describe("workspaceElementToCanvasObject", () => {
  it("keeps only canvas interaction geometry and display metadata", () => {
    const element = {
      ...(loadedState.elements[0] as unknown as WorkspaceElement),
      bbox: { x: 12, y: 24, w: 48, h: 96 },
      canvas: { x: 10, y: 20, w: 52, h: 100 },
      label: "Sticker body label",
      mask: "body-mask.webp",
      name: "Sticker body",
      thumbnail: "body.webp",
      visible: false,
    };

    expect(workspaceElementToCanvasObject(element, {
      maskUrl: "/masks/body-mask.webp",
      thumbnailUrl: "/thumbs/body.webp",
    })).toEqual({
      id: element.id,
      displayName: "Sticker body",
      editableName: "Sticker body label",
      box: { x: 12, y: 24, w: 48, h: 96, rotationDeg: 0 },
      maskBox: { x: 10, y: 20, w: 52, h: 100, rotationDeg: 0 },
      maskUrl: "/masks/body-mask.webp",
      thumbnailUrl: "/thumbs/body.webp",
      isVisible: false,
      isLocked: false,
    });
  });
});
