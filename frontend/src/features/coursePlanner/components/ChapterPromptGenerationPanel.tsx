import * as Tabs from "@radix-ui/react-tabs";
import { Check, Copy, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  chapterPromptStatus,
  chapterPromptStatusLabel,
} from "../domain/chapterPromptStatus";
import type {
  ChapterScenePackage,
  CharacterIpProfile,
  SceneStyleReference,
} from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type ChapterPromptGenerationPanelProps = {
  characterIps: CharacterIpProfile[];
  isGeneratingPrompt: boolean;
  onClearSceneStyle: () => Promise<ChapterScenePackage | null>;
  onGeneratePrompt: (feedback: string) => Promise<ChapterScenePackage | null>;
  onSelectCharacters: (characterIpIds: string[]) => Promise<ChapterScenePackage | null>;
  onSelectSceneStyle: (sceneStyleId: string) => Promise<ChapterScenePackage | null>;
  scenePackage: ChapterScenePackage;
  sceneStyles: SceneStyleReference[];
};

type PromptTab = "empty" | "complete";

export function ChapterPromptGenerationPanel({
  characterIps,
  isGeneratingPrompt,
  onClearSceneStyle,
  onGeneratePrompt,
  onSelectCharacters,
  onSelectSceneStyle,
  scenePackage,
  sceneStyles,
}: ChapterPromptGenerationPanelProps) {
  const [activeTab, setActiveTab] = useState<PromptTab>("empty");
  const [feedback, setFeedback] = useState("");
  const [isSavingSetup, setIsSavingSetup] = useState(false);
  const [copiedTab, setCopiedTab] = useState<PromptTab | null>(null);
  const promptPackage = scenePackage.current_prompt_package;
  const status = chapterPromptStatus(
    scenePackage,
    characterIps,
    sceneStyles,
    isGeneratingPrompt,
  );
  const statusLabel = chapterPromptStatusLabel(status);
  const canGenerate = scenePackage.selected_character_ip_ids.length >= 1
    && scenePackage.selected_character_ip_ids.length <= 2
    && Boolean(scenePackage.scene_style_reference_id)
    && !isGeneratingPrompt
    && !isSavingSetup;
  const selectedIds = useMemo(
    () => new Set(scenePackage.selected_character_ip_ids),
    [scenePackage.selected_character_ip_ids],
  );

  useEffect(() => {
    setFeedback(promptPackage?.generation_feedback ?? "");
  }, [promptPackage?.generated_at, promptPackage?.generation_feedback]);

  async function toggleCharacter(characterIpId: string) {
    const nextIds = selectedIds.has(characterIpId)
      ? scenePackage.selected_character_ip_ids.filter((id) => id !== characterIpId)
      : [...scenePackage.selected_character_ip_ids, characterIpId];
    if (nextIds.length > 2) {
      return;
    }
    await runSetupMutation(() => onSelectCharacters(nextIds));
  }

  async function selectStyle(sceneStyleId: string) {
    await runSetupMutation(() => (
      sceneStyleId ? onSelectSceneStyle(sceneStyleId) : onClearSceneStyle()
    ));
  }

  async function runSetupMutation(operation: () => Promise<ChapterScenePackage | null>) {
    setIsSavingSetup(true);
    try {
      await operation();
    } finally {
      setIsSavingSetup(false);
    }
  }

  async function copyActivePrompt() {
    if (!promptPackage) {
      return;
    }
    const prompt = activeTab === "empty"
      ? promptPackage.empty_scene_prompt
      : promptPackage.complete_scene_prompt;
    await navigator.clipboard.writeText(prompt);
    setCopiedTab(activeTab);
  }

  const statusTone = status === "prompt_ready"
    ? "success"
    : status === "needs_regeneration"
      ? "warning"
      : "info";

  return (
    <section
      aria-label="Prompt Generation"
      className="chapter-studio-panel chapter-prompt-generation"
    >
      <div className="chapter-studio-panel-heading chapter-prompt-generation__heading">
        <div>
          <h2>Prompt Generation</h2>
          <p>Select up to two Character IPs and one Scene Style, then let AI build both prompts.</p>
        </div>
        <CoursePlannerStatusBadge
          ariaLabel={statusLabel}
          label={statusLabel}
          role="status"
          tone={statusTone}
        />
      </div>

      <div className="chapter-prompt-generation__setup">
        <fieldset className="chapter-prompt-generation__characters" disabled={isSavingSetup || isGeneratingPrompt}>
          <legend>Character IPs</legend>
          <span>{scenePackage.selected_character_ip_ids.length} of 2 selected</span>
          <div className="chapter-prompt-generation__character-grid">
            {characterIps.map((character) => {
              const selected = selectedIds.has(character.id);
              const blocked = !selected && selectedIds.size >= 2;
              return (
                <label key={character.id} className={selected ? "is-selected" : undefined}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={blocked}
                    onChange={() => void toggleCharacter(character.id)}
                  />
                  <span>{character.display_name}</span>
                  {selected ? <Check size={14} aria-hidden="true" /> : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="course-planner-field" htmlFor="chapter-prompt-scene-style">
          <span>Scene style</span>
          <select
            id="chapter-prompt-scene-style"
            disabled={isSavingSetup || isGeneratingPrompt}
            value={scenePackage.scene_style_reference_id ?? ""}
            onChange={(event) => void selectStyle(event.target.value)}
          >
            <option value="">Select a Scene Style</option>
            {sceneStyles.map((style) => (
              <option key={style.id} value={style.id}>{style.display_name}</option>
            ))}
          </select>
        </label>
      </div>

      {promptPackage ? (
        <GeneratedPromptOutput
          activeTab={activeTab}
          copiedTab={copiedTab}
          onActiveTabChange={setActiveTab}
          onCopy={() => void copyActivePrompt()}
          scenePackage={scenePackage}
        />
      ) : (
        <div className="chapter-prompt-generation__empty">
          <Sparkles size={20} aria-hidden="true" />
          <p>Both prompts, AI-directed actions, and object constraints will appear here.</p>
        </div>
      )}

      <div className="chapter-prompt-generation__feedback">
        <label className="course-planner-field" htmlFor="chapter-prompt-feedback">
          <span>Generation feedback</span>
          <textarea
            id="chapter-prompt-feedback"
            value={feedback}
            placeholder="Ask AI to adjust action, framing, spatial relationships, or constraints."
            onChange={(event) => setFeedback(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="course-planner-primary-action"
          disabled={!canGenerate}
          onClick={() => void onGeneratePrompt(feedback.trim())}
        >
          <Sparkles size={15} aria-hidden="true" />
          {isGeneratingPrompt
            ? "Generating…"
            : promptPackage
              ? "Regenerate Prompt"
              : "Generate Prompt"}
        </button>
      </div>
    </section>
  );
}

function GeneratedPromptOutput({
  activeTab,
  copiedTab,
  onActiveTabChange,
  onCopy,
  scenePackage,
}: {
  activeTab: PromptTab;
  copiedTab: PromptTab | null;
  onActiveTabChange: (tab: PromptTab) => void;
  onCopy: () => void;
  scenePackage: ChapterScenePackage;
}) {
  const promptPackage = scenePackage.current_prompt_package;
  if (!promptPackage) {
    return null;
  }
  const copyLabel = activeTab === "empty"
    ? "Copy Empty Scene Prompt"
    : "Copy Complete Scene Prompt";

  return (
    <div className="chapter-prompt-generation__output">
      <Tabs.Root value={activeTab} onValueChange={(value) => onActiveTabChange(value as PromptTab)}>
        <div className="chapter-prompt-generation__tabs-row">
          <Tabs.List className="global-reference-library__tabs" aria-label="Generated prompt type">
            <Tabs.Trigger value="empty">Empty Scene Prompt</Tabs.Trigger>
            <Tabs.Trigger value="complete">Complete Scene Prompt</Tabs.Trigger>
          </Tabs.List>
          <button type="button" className="course-planner-secondary-action" aria-label={copyLabel} onClick={onCopy}>
            {copiedTab === activeTab ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copiedTab === activeTab ? "Copied" : "Copy"}
          </button>
        </div>
        <Tabs.Content className="chapter-prompt-generation__prompt" value="empty">
          {promptPackage.empty_scene_prompt}
        </Tabs.Content>
        <Tabs.Content className="chapter-prompt-generation__prompt" value="complete">
          {promptPackage.complete_scene_prompt}
        </Tabs.Content>
      </Tabs.Root>

      <div className="chapter-prompt-generation__facts">
        <PromptFact title="AI cast directions" items={promptPackage.cast_directions.map((item) => item.action)} />
        <PromptFact title="Target objects" items={scenePackage.target_objects.map((item) => item.label)} />
        <PromptFact title="Avoid objects" items={scenePackage.avoid_objects.map((item) => item.label)} />
      </div>
    </div>
  );
}

function PromptFact({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>None</p>}
    </div>
  );
}
