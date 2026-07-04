import "./assemblyEditorDependencyMocks";
import { useEffect, useMemo, useRef, useState } from "react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import {
  cleanup,
  describe,
  expect,
  fireEvent,
  it,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "../app/appTestHarness";
import type { DirectChapterAssetUploadInput } from "../../src/features/coursePlanner/api";
import {
  buildAssemblyReadiness,
  isAssemblyReady,
} from "../../src/features/coursePlanner/assembly/assemblyReadiness";
import { exportAssemblyPreviewFile } from "../../src/features/coursePlanner/assembly/assemblyExport";
import { buildTldrawAssemblySnapshot } from "../../src/features/coursePlanner/assembly/tldrawAssemblyAdapter";
import {
  applySnapshotToEditor,
  createAssemblyCameraFitState,
  readPlacementSelectionState,
  syncSelectionToEditor,
  type AssemblyEditorShapeLike,
} from "../../src/features/coursePlanner/components/AssemblyEditorCanvas";
import { ChapterSceneStudio } from "../../src/features/coursePlanner/components/ChapterSceneStudio";
import { studioStatusLabel } from "../../src/features/coursePlanner/pages/ChapterWorkspacePage";
import type {
  AsyncStatusMap,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
} from "../../src/features/coursePlanner/types";
import {
  characterIpFixture,
  referenceImageFixture,
  sceneAsset,
  snapshot,
  studioChapterFixture,
  studioScenePackageFixture,
  studioScenePackFixture,
} from "./chapterWorkspaceFixtures";

import {
  ASSEMBLY_AUTOSAVE_DEBOUNCE_MS,
  AssemblyEditorHarness,
  type AssemblyEditorHarnessControls,
  advanceAutosaveCycle,
  advanceAutosaveTime,
  buildLockedFinalScene,
  buildSnapshot,
  flushAsyncScenePackage,
  mockCanvasBlob,
  mockScenePackageImages,
  scenePackageWithDependentPlacements,
  scenePackageWithGroupedPlacements,
  scenePackageWithReplacementCandidate,
  scenePackageWithTwoPlacements,
  scenePackageWithTwoPlacementsConfig,
} from "./assemblyEditorHarness";
import { createMockAssemblyEditor, layerLabels } from "./assemblyEditorTestUtils";

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
    callback(performance.now());
    return 1;
  }) as typeof requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", (() => undefined) as typeof cancelAnimationFrame);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});


describe("Chapter Scene Studio assembly canvas bridge", () => {
  it("fits the camera on first load and Empty Scene replacement, but not for selection-only sync", () => {
    const scenePackage = studioScenePackageFixture();
    const replacementScenePackage = studioScenePackageFixture({
      current_empty_scene_image_id: "empty_scene_002",
      empty_scene_images: [
        studioScenePackageFixture().empty_scene_images[0],
        {
          ...studioScenePackageFixture().empty_scene_images[0],
          id: "empty_scene_002",
          original_filename: "kitchen-02.png",
          width: 800,
          height: 600,
        },
      ],
      assembly: {
        ...scenePackage.assembly,
        empty_scene_image_id: "empty_scene_002",
      },
    });
    const editor = createMockAssemblyEditor();
    const isApplyingSnapshotRef = { current: false };
    const fitStateRef = createAssemblyCameraFitState();

    applySnapshotToEditor(
      editor,
      buildSnapshot(scenePackage),
      isApplyingSnapshotRef,
      fitStateRef,
    );
    syncSelectionToEditor(editor, "placement_bowl");
    syncSelectionToEditor(editor, null);
    applySnapshotToEditor(
      editor,
      buildSnapshot(replacementScenePackage),
      isApplyingSnapshotRef,
      fitStateRef,
    );

    expect(editor.zoomToBounds).toHaveBeenCalledTimes(2);
    expect(editor.select).toHaveBeenCalledTimes(1);
    expect(editor.selectNone).toHaveBeenCalledTimes(1);
  });

  it("clears trusted background selection instead of surfacing it as a placement selection", () => {
    const editor = createMockAssemblyEditor({
      selectedShapes: [
        {
          id: "shape:assembly:background:empty_scene_001",
          meta: { kind: "background", source: "assembly-editor" },
          x: 0,
          y: 0,
          rotation: 0,
          props: { w: 1024, h: 1024 },
          isLocked: true,
        },
      ],
    });

    expect(readPlacementSelectionState(editor)).toEqual({
      placementId: null,
      shouldClearSelection: true,
    });
  });
});
