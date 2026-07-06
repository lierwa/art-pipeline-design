const UUID_STEM_PATTERN = /^[0-9a-f]{8}(?:[-_\s]?[0-9a-f]{4}){3}[-_\s]?[0-9a-f]{12}$/i;

export function readableSceneMediaName(originalFilename: string, fallback: string): string {
  return normalizeHumanText(originalFilename.replace(/\.[^.]+$/, "")) ?? fallback;
}

export function normalizeHumanText(value: string): string | null {
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized || UUID_STEM_PATTERN.test(normalized)) {
    return null;
  }
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized;
}
