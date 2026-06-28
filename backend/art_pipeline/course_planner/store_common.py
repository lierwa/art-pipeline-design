from __future__ import annotations

import re

SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


def validate_slug(value: str, label: str) -> str:
    if not SLUG_PATTERN.fullmatch(value):
        raise ValueError(
            f"{label} {value!r} must be a slug containing only letters, numbers, "
            "underscores, and hyphens."
        )
    return value


def require_match(actual: str, expected: str, label: str) -> None:
    if actual != expected:
        raise ValueError(f"{label} must match {expected!r}.")
