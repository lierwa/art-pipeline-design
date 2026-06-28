import { useEffect, useState } from "react";

type SceneCard = {
  chapter_id: string;
  title_zh: string;
  visual_brief_zh: string;
  image2_style: string;
};

type SceneKeywords = {
  chapter_id: string;
  keywords: string[];
};

type SceneCardEditorProps = {
  chapterId: string;
  isDisabled: boolean;
  isSaving: boolean;
  scene: SceneCard | null;
  keywords: SceneKeywords | null;
  onSave: (scene: SceneCard, keywords: SceneKeywords) => Promise<void>;
};

export function SceneCardEditor({ chapterId, isDisabled, isSaving, scene, keywords, onSave }: SceneCardEditorProps) {
  const [title, setTitle] = useState("");
  const [visualBrief, setVisualBrief] = useState("");
  const [imageStyle, setImageStyle] = useState("");
  const [keywordText, setKeywordText] = useState("");

  useEffect(() => {
    setTitle(scene?.title_zh ?? "");
    setVisualBrief(scene?.visual_brief_zh ?? "");
    setImageStyle(scene?.image2_style ?? "");
    setKeywordText((keywords?.keywords ?? []).join(", "));
  }, [keywords, scene]);

  async function saveSceneCard() {
    await onSave(
      {
        chapter_id: chapterId,
        title_zh: title.trim(),
        visual_brief_zh: visualBrief.trim(),
        image2_style: imageStyle.trim(),
      },
      {
        chapter_id: chapterId,
        keywords: parseKeywords(keywordText),
      },
    );
  }

  return (
    <section className="chapter-workspace-panel scene-card-editor" aria-label="Scene Card">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Scene Card</h2>
          <p>Chapter-scoped visual plan.</p>
        </div>
        <button
          type="button"
          className="course-planner-primary-action"
          disabled={isDisabled}
          onClick={() => void saveSceneCard()}
        >
          {isSaving ? "Saving Scene..." : "Save Scene"}
        </button>
      </div>

      <div className="chapter-workspace-form">
        <label>
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>Image2 Style</span>
          <input value={imageStyle} onChange={(event) => setImageStyle(event.target.value)} />
        </label>
        <label className="chapter-workspace-field-wide">
          <span>Visual Brief</span>
          <textarea value={visualBrief} rows={5} onChange={(event) => setVisualBrief(event.target.value)} />
        </label>
        <label className="chapter-workspace-field-wide">
          <span>Detection Keywords</span>
          <textarea value={keywordText} rows={3} onChange={(event) => setKeywordText(event.target.value)} />
        </label>
      </div>
    </section>
  );
}

function parseKeywords(value: string): string[] {
  // WHY: 关键词输入允许逗号或换行是为了降低编辑成本；保存前去重，保持 SceneKeywords 仍是唯一事实源。
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  );
}
