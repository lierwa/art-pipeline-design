import { useMemo } from "react";
import Tags from "@yaireo/tagify/react";
import "@yaireo/tagify/dist/tagify.css";

type DetectionVocabularyPanelProps = {
  labels: string[];
  disabled: boolean;
  className?: string;
  onSave: (labels: string[]) => void;
};

type VocabularyOption = {
  value: string;
};

type TagifyChangeEvent = CustomEvent<{
  value: string;
}>;

const tagifySettings = {
  delimiters: ",|，|;|；|\\n",
  duplicates: false,
  trim: true,
  editTags: false,
  dropdown: {
    enabled: false,
  },
  a11y: {
    inputAriaLabel: "Detection label",
  },
};

export function DetectionVocabularyPanel({
  labels,
  disabled,
  className,
  onSave,
}: DetectionVocabularyPanelProps) {
  // WHY: 检测词表是模型 prompt 的唯一权威来源；标签编辑、粘贴拆分和 caret 行为交给成熟的 Tagify，业务边界只做归一化。
  const normalizedLabels = useMemo(() => normalizeVocabulary(labels), [labels]);
  const tagifyValue = useMemo(
    () => normalizedLabels.map((label) => ({ value: label })),
    [normalizedLabels],
  );

  function handleChange(event: TagifyChangeEvent) {
    if (disabled) {
      return;
    }

    const normalizedNextLabels = normalizeVocabulary(parseTagifyValue(event.detail.value));
    if (hasSameLabels(normalizedLabels, normalizedNextLabels)) {
      return;
    }

    onSave(normalizedNextLabels);
  }

  return (
    <section
      className={["detection-vocabulary-panel", className ?? ""].filter(Boolean).join(" ")}
      aria-label="Detection vocabulary"
    >
      <Tags
        className="detection-vocabulary-input"
        placeholder="Object name"
        readOnly={disabled}
        settings={tagifySettings}
        value={tagifyValue}
        onChange={(event) => handleChange(event as TagifyChangeEvent)}
      />
    </section>
  );
}

function hasSameLabels(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((label, index) => label === right[index]);
}

function normalizeVocabulary(labels: string[]): string[] {
  const seenLabels = new Set<string>();
  const normalizedLabels: string[] = [];

  for (const label of labels) {
    for (const labelPart of label.split(/[,\n，；;]+/)) {
      const normalizedLabel = labelPart.trim().toLowerCase();
      if (!normalizedLabel || seenLabels.has(normalizedLabel)) {
        continue;
      }
      seenLabels.add(normalizedLabel);
      normalizedLabels.push(normalizedLabel);
    }
  }

  return normalizedLabels;
}

function parseTagifyValue(rawValue: string): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsedValue)) {
      return [rawValue];
    }

    return parsedValue.flatMap((tag) => {
      if (!isVocabularyOption(tag)) {
        return [];
      }
      return [tag.value];
    });
  } catch {
    return [rawValue];
  }
}

function isVocabularyOption(value: unknown): value is VocabularyOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof value.value === "string"
  );
}
