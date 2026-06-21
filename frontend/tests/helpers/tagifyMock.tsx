import { useMemo, useState } from "react";

type TagifyValue = {
  value: string;
};

type MockTagifyProps = {
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  settings?: {
    a11y?: {
      inputAriaLabel?: string;
    };
  };
  value?: TagifyValue[];
  onChange?: (event: CustomEvent<{ value: string }>) => void;
};

export function MockTagify({
  className,
  placeholder,
  readOnly,
  settings,
  value,
  onChange,
}: MockTagifyProps) {
  const [draft, setDraft] = useState("");
  const labels = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const inputLabel = settings?.a11y?.inputAriaLabel ?? "Tags input field";

  function emitChange(nextLabels: TagifyValue[]) {
    onChange?.(
      new CustomEvent("change", {
        detail: { value: JSON.stringify(nextLabels) },
      }),
    );
  }

  function commitDraft(rawValue: string) {
    if (!rawValue.trim()) {
      return;
    }

    emitChange([...labels, { value: rawValue }]);
    setDraft("");
  }

  return (
    <div className="tags-input">
      <div className={["tagify", className ?? ""].filter(Boolean).join(" ")}>
        {labels.map((label) => (
          <span className="tagify__tag" key={label.value} title={label.value}>
            <button
              type="button"
              aria-label={`Remove ${label.value}`}
              className="tagify__tag__removeBtn"
              disabled={readOnly}
              onClick={() => emitChange(labels.filter((item) => item.value !== label.value))}
            />
            <span className="tagify__tag-text">{label.value}</span>
          </span>
        ))}
        <input
          aria-label={inputLabel}
          className="tagify__input"
          disabled={readOnly}
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== ",") {
              return;
            }
            event.preventDefault();
            commitDraft(draft);
          }}
          onPaste={(event) => {
            const pastedText = event.clipboardData.getData("text");
            if (!/[,\n，；;]/.test(pastedText)) {
              return;
            }
            event.preventDefault();
            commitDraft(pastedText);
          }}
        />
      </div>
    </div>
  );
}
