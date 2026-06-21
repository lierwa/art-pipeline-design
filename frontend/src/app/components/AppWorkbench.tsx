import type { ComponentProps } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";

import { AppCanvasWorkspace } from "../../features/canvas/AppCanvasWorkspace";
import { AppChromeOverlays } from "./AppChromeOverlays";
import { AppReviewPanel } from "../../features/inspector/AppReviewPanel";
import { PipelineRail } from "./PipelineRail";
import { TopAppBar } from "./TopAppBar";

export type AppWorkbenchProps = {
  topBar: ComponentProps<typeof TopAppBar>;
  rail: ComponentProps<typeof PipelineRail>;
  canvas: ComponentProps<typeof AppCanvasWorkspace>;
  review: ComponentProps<typeof AppReviewPanel>;
  chrome: ComponentProps<typeof AppChromeOverlays>;
};

export function AppWorkbench({ topBar, rail, canvas, review, chrome }: AppWorkbenchProps) {
  return (
    <div className="app-shell">
      <TopAppBar {...topBar} />
      <main className="workbench-grid-frame">
        <PanelGroup className="workbench-grid" orientation="horizontal">
          <Panel className="workbench-panel workbench-panel-rail" defaultSize="6%" minSize="96px" maxSize="168px">
            <PipelineRail {...rail} />
          </Panel>
          <PanelResizeHandle aria-label="Resize pipeline rail" className="workbench-panel-resize-handle">
            <span aria-hidden="true" />
          </PanelResizeHandle>
          <Panel className="workbench-panel workbench-panel-canvas" defaultSize="73%" minSize="720px">
            <AppCanvasWorkspace {...canvas} />
          </Panel>
          <PanelResizeHandle aria-label="Resize review panel" className="workbench-panel-resize-handle">
            <span aria-hidden="true" />
          </PanelResizeHandle>
          <Panel className="workbench-panel workbench-panel-review" defaultSize="21%" minSize="320px" maxSize="520px">
            <AppReviewPanel {...review} />
          </Panel>
        </PanelGroup>
      </main>
      <AppChromeOverlays {...chrome} />
    </div>
  );
}
