from __future__ import annotations


def normalize_detection_vocabulary(values: list[str]) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for value in values:
        label = " ".join(value.strip().lower().split())
        if label and label not in seen:
            seen.add(label)
            labels.append(label)
    if not labels:
        raise ValueError("Detection vocabulary must contain at least one label.")
    return labels
