import { useState, type DragEvent } from "react";
import { Link } from "react-router";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
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
          <p>{chapters.length > 0 ? "拖拽排序，打开 Designer 继续做 Prompt Version。" : "接受候选后会出现在这里。"}</p>
        </div>
      </div>

      <ol className="selected-sequence-list">
        {chapters.length > 0 ? (
          chapters.map((chapter, index) => {
            const isDeleting = deletingChapterId === chapter.id;
            const isDeleteDisabled = isDeleting;
            const deleteButton = (
              <button
                type="button"
                aria-label={`Delete Chapter ${chapter.title}`}
                disabled={isDeleteDisabled}
              >
                {isDeleting ? "Deleting..." : "Trash"}
              </button>
            );

            return (
              <li
                key={chapter.id}
                className="selected-sequence-item"
                draggable={!isBusy}
                onDragStart={() => setDraggedChapterId(chapter.id)}
                onDragEnd={() => setDraggedChapterId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, chapter.id)}
              >
                <button
                  type="button"
                  className="chapter-drag-handle"
                  aria-label={`Drag handle for ${chapter.title}`}
                  disabled={isBusy}
                >
                  ::
                </button>
                <div>
                  <span>#{index + 1}</span>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.summary}</p>
                </div>
                <div className="selected-sequence-actions">
                  <Link to={`/course-planner/chapters/${encodeURIComponent(chapter.id)}`} aria-label={`Open Designer for ${chapter.title}`}>
                    Open Designer
                  </Link>
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
