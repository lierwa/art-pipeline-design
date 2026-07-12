class ScenePackageValidationError(ValueError):
    pass


class ScenePackagePreconditionError(ValueError):
    pass


class LibraryItemInUseError(ScenePackagePreconditionError):
    def __init__(self, *, item_kind: str, referenced_chapter_count: int) -> None:
        self.item_kind = item_kind
        self.referenced_chapter_count = referenced_chapter_count
        super().__init__(
            f"{item_kind} is used by {referenced_chapter_count} Chapter(s)."
        )


class ScenePackageChildNotFoundError(FileNotFoundError):
    pass


class UnknownCompleteSceneImageError(ScenePackageChildNotFoundError):
    pass


class UnknownEmptySceneImageError(ScenePackageChildNotFoundError):
    pass
