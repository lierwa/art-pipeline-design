export type ScenePackageMediaKind = "empty_scene_images" | "chapter_assets";

export function scenePackageMediaUrl(
  chapterId: string,
  mediaKind: ScenePackageMediaKind,
  mediaId: string,
): string {
  return `/api/course-planner/chapters/${chapterId}/scene-package/media/${mediaKind}/${mediaId}`;
}

export function loadScenePackageImage(
  chapterId: string,
  mediaKind: ScenePackageMediaKind,
  mediaId: string,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${mediaKind} image ${mediaId}.`));
    image.src = scenePackageMediaUrl(chapterId, mediaKind, mediaId);
  });
}
