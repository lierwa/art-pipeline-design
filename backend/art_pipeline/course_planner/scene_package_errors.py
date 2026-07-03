class ScenePackageValidationError(ValueError):
    pass


class ScenePackagePreconditionError(ValueError):
    pass


class ScenePackageChildNotFoundError(FileNotFoundError):
    pass


class UnknownCompleteSceneImageError(ScenePackageChildNotFoundError):
    pass


class UnknownEmptySceneImageError(ScenePackageChildNotFoundError):
    pass
