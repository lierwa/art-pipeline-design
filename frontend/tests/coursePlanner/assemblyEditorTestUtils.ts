export function layerLabels(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(".assembly-layer-row"))
    .map((row) => {
      const label = row.querySelector<HTMLElement>(".assembly-layer-name, .asset-tree-copy strong, .assembly-layer-row-label > span:last-child");
      return normalizeLayerRowLabel(label?.textContent ?? row.textContent ?? "");
    })
    .filter((label) => (
      label.startsWith("Breakfast bowl") ||
      label.startsWith("Cleanup cloth") ||
      label.startsWith("Breakfast props") ||
      label.startsWith("Spoon") ||
      label.startsWith("Group 1")
    ));
}

function normalizeLayerRowLabel(label: string) {
  return label
    .replace(/[▾▸·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
