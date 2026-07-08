import { useState, type DragEvent } from "react";
import { ExternalLink, GripVertical, Trash2 } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { CoursePlannerIconButton, CoursePlannerIconLink } from "./CoursePlannerChrome";
import type { Chapter } from "../types";

type SelectedChapterSequenceProps = {
  chapters: Chapter[];
  deletingChapterId: string | null;
  isReordering: boolean;
  onDeleteChapter: (chapterId: string) => void;
  onReorderChapters: (chapterIds: string[]) => void;
};

export function SelectedChapterSequence({
  chapters,
  deletingChapterId,
  isReordering,
  onDeleteChapter,
  onReorderChapters,
}: SelectedChapterSequenceProps) {
  const [draggedChapterId, setDraggedChapterId] = useState<string | null>(null);
  const isBusy = isReordering;

  function handleDrop(event: DragEvent<HTMLElement>, targetChapterId: string) {
    event.preventDefault();
    if (!draggedChapterId || draggedChapterId === targetChapterId) {
      return;
    }
    const nextIds = reorderedChapterIds(chapters, draggedChapterId, targetChapterId);
    setDraggedChapterId(null);
    onReorderChapters(nextIds);
  }

  return (
    <section className="selected-chapter-sequence" aria-label="Chapter list">
      <div className="planning-panel-header">
        <div>
          <h2>Chapter List</h2>
          <p>{chapters.length > 0 ? "拖拽排序，打开 Designer 继续处理 Scene Studio。" : "接受候选后会出现在这里。"}</p>
        </div>
      </div>

      <ol className="selected-sequence-list">
        {chapters.length > 0 ? (
          chapters.map((chapter, index) => {
            const isDeleting = deletingChapterId === chapter.id;
            const isDeleteDisabled = isDeleting;
            const deleteActionLabel = `${isDeleting ? "Deleting" : "Delete"} Chapter ${chapter.title}`;
            const deleteButton = (
              <CoursePlannerIconButton
                ariaLabel={deleteActionLabel}
                disabled={isDeleteDisabled}
              >
                <Trash2 size={14} aria-hidden="true" />
              </CoursePlannerIconButton>
            );

            return (
              <li
                key={chapter.id}
                className="selected-sequence-item"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, chapter.id)}
              >
                <CoursePlannerIconButton
                  className="chapter-drag-handle"
                  ariaLabel={`Drag handle for ${chapter.title}`}
                  draggable={!isBusy}
                  disabled={isBusy}
                  onDragStart={() => setDraggedChapterId(chapter.id)}
                  onDragEnd={() => setDraggedChapterId(null)}
                >
                  <GripVertical size={16} aria-hidden="true" />
                </CoursePlannerIconButton>
                <div className="selected-sequence-content">
                  <span>#{index + 1}</span>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.summary}</p>
                </div>
                <div
                  className="selected-sequence-actions"
                  role="group"
                  aria-label={`Chapter actions for ${chapter.title}`}
                >
                  <CoursePlannerIconLink
                    to={`/course-planner/chapters/${encodeURIComponent(chapter.id)}`}
                    ariaLabel={`Open Designer for ${chapter.title}`}
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                  </CoursePlannerIconLink>
                  {isDeleteDisabled ? (
                    deleteButton
                  ) : (
                    <ConfirmActionDialog
                      trigger={deleteButton}
                      title="Delete Chapter"
                      description={`Delete ${chapter.title} from this Scene Pack's accepted Chapter list.`}
                      confirmLabel="Delete Chapter"
                      onConfirm={() => onDeleteChapter(chapter.id)}
                    />
                  )}
                </div>
              </li>
            );
          })
        ) : (
          <li className="course-planner-empty">No accepted Chapters.</li>
        )}
      </ol>

    </section>
  );
}

function reorderedChapterIds(chapters: Chapter[], draggedChapterId: string, targetChapterId: string): string[] {
  // WHY: 排序只提交 Chapter id 顺序；具体 sortOrder 由后端/状态层回写，避免 UI 复制章节排序规则。
  const ids = chapters.map((chapter) => chapter.id);
  const fromIndex = ids.indexOf(draggedChapterId);
  const toIndex = ids.indexOf(targetChapterId);
  if (fromIndex < 0 || toIndex < 0) {
    return ids;
  }
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
