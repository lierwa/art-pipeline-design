type SceneKeywords = {
  keywords: string[];
};

type DetectionKeywordsEditorProps = {
  keywords: SceneKeywords | null;
};

export function DetectionKeywordsEditor({ keywords }: DetectionKeywordsEditorProps) {
  const chips = keywords?.keywords ?? [];

  return (
    <section className="chapter-workspace-panel detection-keywords-editor" aria-label="Detection Keywords">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Detection Keywords</h2>
          <p>Read-only keywords sent to detection.</p>
        </div>
      </div>
      {chips.length > 0 ? (
        <div className="chapter-workspace-chip-list">
          {chips.map((keyword) => (
            <span key={keyword} className="chapter-workspace-chip">
              {keyword}
            </span>
          ))}
        </div>
      ) : (
        <p className="course-planner-empty">No detection keywords saved.</p>
      )}
    </section>
  );
}
