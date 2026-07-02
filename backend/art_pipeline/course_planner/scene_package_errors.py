class ScenePackageValidationError(ValueError):
    pass


class ScenePackagePreconditionError(ValueError):
    pass


class ScenePackageChildNotFoundError(FileNotFoundError):
    pass


class UnknownBaseCandidateError(ScenePackagePreconditionError):
    pass


class UnknownCompleteSceneImageError(ScenePackageChildNotFoundError):
    pass
