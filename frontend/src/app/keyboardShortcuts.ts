export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
  );
}

export function isSpacePanShortcut(event: globalThis.KeyboardEvent): boolean {
  return event.code === "Space" || event.key === " " || event.key === "Spacebar";
}
