import { useEffect } from "react";

import { isEditableShortcutTarget, isSpacePanShortcut } from "./keyboardShortcuts";

type UseAppKeyboardShortcutsInput = {
  beginTemporaryPan: (hasSource: boolean) => boolean;
  clearDrafts: () => void;
  editingElementId: string | null;
  endTemporaryPan: () => void;
  fitCanvas: () => void;
  handleApplySplit: () => void;
  handleCancelBoxEdit: () => void;
  handleRedo: () => void;
  handleSaveElement: () => void;
  handleSelectTool: (tool: "select" | "draw") => void;
  handleStartBoxEdit: () => void;
  handleTogglePanMode: () => void;
  handleUndo: () => void;
  hasUnsavedGeometryChanges: boolean;
  selectedElementExists: boolean;
  splitRegionCount: number;
  workspaceHasSource: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
};

export function useAppKeyboardShortcuts({
  beginTemporaryPan,
  clearDrafts,
  editingElementId,
  endTemporaryPan,
  fitCanvas,
  handleApplySplit,
  handleCancelBoxEdit,
  handleRedo,
  handleSaveElement,
  handleSelectTool,
  handleStartBoxEdit,
  handleTogglePanMode,
  handleUndo,
  hasUnsavedGeometryChanges,
  selectedElementExists,
  splitRegionCount,
  workspaceHasSource,
  zoomIn,
  zoomOut,
}: UseAppKeyboardShortcutsInput) {
  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      const key = event.key.toLowerCase();
      const hasSystemModifier = event.ctrlKey || event.metaKey;

      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      if (isSpacePanShortcut(event) && beginTemporaryPan(workspaceHasSource)) {
        event.preventDefault();
        return;
      }

      if (hasSystemModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (hasSystemModifier && key === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (hasSystemModifier && key === "s") {
        event.preventDefault();
        handleSaveElement();
        return;
      }

      if (hasSystemModifier) {
        // WHY: 浏览器/系统组合键如 Cmd+R、Cmd+L、Ctrl+R 必须保留原生语义；
        // 项目内的单键工具切换只在没有 system modifier 时接管。
        return;
      }

      if (key === "escape") {
        event.preventDefault();
        if (editingElementId) {
          handleCancelBoxEdit();
          return;
        }
        clearDrafts();
        handleSelectTool("select");
        return;
      }

      if (key === "enter") {
        if (editingElementId && hasUnsavedGeometryChanges) {
          event.preventDefault();
          handleSaveElement();
          return;
        }
        if (splitRegionCount > 0) {
          event.preventDefault();
          handleApplySplit();
        }
        return;
      }

      if (key === "q") {
        event.preventDefault();
        handleSelectTool("select");
        return;
      }

      if (key === "w" && selectedElementExists) {
        event.preventDefault();
        handleStartBoxEdit();
        return;
      }

      if (key === "e" && workspaceHasSource) {
        event.preventDefault();
        handleSelectTool("draw");
        return;
      }

      if (key === "r" && workspaceHasSource) {
        event.preventDefault();
        handleTogglePanMode();
        return;
      }

      if (key === "+" || key === "=") {
        event.preventDefault();
        zoomIn();
        return;
      }

      if (key === "-") {
        event.preventDefault();
        zoomOut();
        return;
      }

      if (key === "0") {
        event.preventDefault();
        fitCanvas();
      }
    }

    function handleGlobalKeyUp(event: globalThis.KeyboardEvent) {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      if (isSpacePanShortcut(event)) {
        event.preventDefault();
        endTemporaryPan();
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
    };
  });

  useEffect(() => {
    window.addEventListener("blur", endTemporaryPan);
    return () => window.removeEventListener("blur", endTemporaryPan);
  }, [endTemporaryPan]);
}
