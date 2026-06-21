import { useState } from "react";

import type { CanvasTool } from "../../domain/workspace";

const CANVAS_ZOOM_MIN = 40;
const CANVAS_ZOOM_MAX = 200;
const CANVAS_ZOOM_FIT = 80;
const CANVAS_ZOOM_STEP = 5;
const CANVAS_WHEEL_ZOOM_SENSITIVITY = 0.04;
const CANVAS_GESTURE_ZOOM_SENSITIVITY = 60;

type CanvasPanOffset = {
  x: number;
  y: number;
};

function clampZoom(value: number) {
  return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, value));
}

export function useCanvasViewport() {
  const [tool, setTool] = useState<CanvasTool>("select");
  const [canvasZoom, setCanvasZoom] = useState(CANVAS_ZOOM_FIT);
  const [isPanMode, setIsPanMode] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [canvasPan, setCanvasPan] = useState<CanvasPanOffset>({ x: 0, y: 0 });

  function resetCanvasViewport() {
    setTool("select");
    setIsPanMode(false);
    setIsSpacePanning(false);
    setCanvasZoom(CANVAS_ZOOM_FIT);
    setCanvasPan({ x: 0, y: 0 });
  }

  function selectCanvasTool(nextTool: CanvasTool) {
    setTool(nextTool);
    setIsPanMode(false);
  }

  function beginTemporaryPan(hasSource: boolean) {
    if (!hasSource) {
      return false;
    }

    setIsSpacePanning(true);
    return true;
  }

  function endTemporaryPan() {
    setIsSpacePanning(false);
  }

  function zoomIn() {
    setCanvasZoom((current) => clampZoom(current + CANVAS_ZOOM_STEP));
  }

  function zoomOut() {
    setCanvasZoom((current) => clampZoom(current - CANVAS_ZOOM_STEP));
  }

  function zoomByWheel(hasSource: boolean, deltaY: number) {
    if (!hasSource) {
      return;
    }

    setCanvasZoom((current) => clampZoom(current - deltaY * CANVAS_WHEEL_ZOOM_SENSITIVITY));
  }

  function zoomByGesture(hasSource: boolean, scaleDelta: number) {
    if (!hasSource) {
      return;
    }

    setCanvasZoom((current) => clampZoom(current + scaleDelta * CANVAS_GESTURE_ZOOM_SENSITIVITY));
  }

  function fitCanvas() {
    setCanvasZoom(CANVAS_ZOOM_FIT);
    setCanvasPan({ x: 0, y: 0 });
  }

  function togglePanMode(hasSource: boolean) {
    if (!hasSource) {
      return false;
    }

    // WHY: 平移模式与绘制/框编辑互斥，视口层只切换工具和 pan 状态，
    // 草稿清理仍由 App 负责，避免把业务草稿生命周期藏进视图 hook。
    setTool("select");
    setIsPanMode((current) => !current);
    return true;
  }

  function panCanvas(deltaX: number, deltaY: number) {
    setCanvasPan((current) => ({
      x: current.x + deltaX,
      y: current.y + deltaY,
    }));
  }

  return {
    canvasPan,
    canvasZoom,
    isCanvasPanMode: isPanMode || isSpacePanning,
    isPanMode,
    isSpacePanning,
    tool,
    beginTemporaryPan,
    endTemporaryPan,
    fitCanvas,
    panCanvas,
    resetCanvasViewport,
    selectCanvasTool,
    setCanvasTool: setTool,
    togglePanMode,
    zoomByGesture,
    zoomByWheel,
    zoomIn,
    zoomOut,
  };
}
