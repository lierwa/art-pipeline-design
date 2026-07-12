import { useEffect, useId, useState, type FormEvent } from "react";
import * as Tabs from "@radix-ui/react-tabs";

import { ControlledConfirmActionDialog } from "../../../shared/ui/ControlledConfirmActionDialog";
import {
  characterModelSheetUrl,
  sceneStyleReferenceImageUrl,
} from "../api";
import { useGlobalReferenceLibrary } from "../hooks/useGlobalReferenceLibrary";
import type { CharacterIpProfile, SceneStyleReference } from "../types";
import { CoursePlannerDrawer } from "./CoursePlannerChrome";
import "./globalReferenceLibrary.css";

type LibraryTab = "character" | "style";
type LibraryItem = CharacterIpProfile | SceneStyleReference;
type LibraryEditor = {
  kind: LibraryTab;
  id: string | null;
  initialName: string;
  name: string;
  file: File | null;
};

export type GlobalReferenceLibraryDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function GlobalReferenceLibraryDrawer({ isOpen, onClose }: GlobalReferenceLibraryDrawerProps) {
  const library = useGlobalReferenceLibrary(isOpen);
  const editorFormId = useId();
  const [activeTab, setActiveTab] = useState<LibraryTab>("character");
  const [editor, setEditor] = useState<LibraryEditor | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const previewUrl = useFilePreview(editor?.file ?? null);
  const isDirty = Boolean(editor && (editor.file || editor.name !== editor.initialName));

  function requestClose() {
    if (isDirty) {
      setPendingClose(true);
      return;
    }
    setEditor(null);
    onClose();
  }

  function openCreate(kind: LibraryTab) {
    library.clearError();
    setEditor({ kind, id: null, initialName: "", name: "", file: null });
  }

  function openEdit(kind: LibraryTab, item: LibraryItem) {
    library.clearError();
    setEditor({ kind, id: item.id, initialName: item.display_name, name: item.display_name, file: null });
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !editor.name.trim() || (!editor.id && !editor.file)) {
      return;
    }
    const input = {
      displayName: editor.name.trim(),
      ...(editor.file ? { file: editor.file } : {}),
    };
    const saved = editor.kind === "character"
      ? await library.saveCharacter(editor.id, input)
      : await library.saveStyle(editor.id, input);
    if (saved) {
      setEditor(null);
    }
  }

  async function confirmDelete() {
    if (!editor?.id) {
      return;
    }
    const deleted = editor.kind === "character"
      ? await library.removeCharacter(editor.id)
      : await library.removeStyle(editor.id);
    if (deleted) {
      setEditor(null);
    }
  }

  const canSave = Boolean(editor?.name.trim() && (editor.id || editor.file));
  const footer = editor ? (
    <>
      {editor.id ? (
        <button
          type="button"
          className="global-reference-library__delete"
          disabled={library.isMutating}
          onClick={() => setPendingDelete(true)}
        >
          删除
        </button>
      ) : null}
      <span className="global-reference-library__footer-spacer" />
      <button type="button" disabled={library.isMutating} onClick={() => setEditor(null)}>取消</button>
      <button
        type="submit"
        form={editorFormId}
        className="course-planner-primary-action"
        disabled={library.isMutating || !canSave}
      >
        {library.isMutating ? "保存中…" : editor.id ? "保存" : "创建"}
      </button>
    </>
  ) : null;

  return (
    <CoursePlannerDrawer
      title={editor ? editorTitle(editor) : "资料库"}
      isOpen={isOpen}
      modal
      onClose={requestClose}
      footer={footer}
    >
      {editor ? (
        <LibraryEditorForm
          editor={editor}
          formId={editorFormId}
          previewUrl={previewUrl}
          onChange={setEditor}
          onSubmit={submitEditor}
        />
      ) : (
        <LibraryList
          activeTab={activeTab}
          characterIps={library.characterIps}
          sceneStyles={library.sceneStyles}
          isLoading={library.isLoading}
          onTabChange={setActiveTab}
          onCreate={openCreate}
          onEdit={openEdit}
        />
      )}
      {library.error ? <p className="global-reference-library__error" role="alert">{library.error}</p> : null}

      <ControlledConfirmActionDialog
        isOpen={pendingClose}
        title="放弃未保存修改？"
        description="名称或图片尚未保存。"
        cancelLabel="继续编辑"
        confirmLabel="放弃修改"
        onOpenChange={setPendingClose}
        onConfirm={() => {
          setEditor(null);
          onClose();
        }}
      />
      <ControlledConfirmActionDialog
        isOpen={pendingDelete}
        title={`删除${editor?.kind === "character" ? "角色 IP" : "场景风格"}？`}
        description="删除后不能再供新的 Chapter 选择。"
        confirmLabel="确认删除"
        isConfirming={library.isMutating}
        onOpenChange={setPendingDelete}
        onConfirm={confirmDelete}
      />
    </CoursePlannerDrawer>
  );
}

function LibraryList({
  activeTab,
  characterIps,
  sceneStyles,
  isLoading,
  onTabChange,
  onCreate,
  onEdit,
}: {
  activeTab: LibraryTab;
  characterIps: CharacterIpProfile[];
  sceneStyles: SceneStyleReference[];
  isLoading: boolean;
  onTabChange: (tab: LibraryTab) => void;
  onCreate: (kind: LibraryTab) => void;
  onEdit: (kind: LibraryTab, item: LibraryItem) => void;
}) {
  return (
    <Tabs.Root
      className="global-reference-library"
      value={activeTab}
      onValueChange={(value) => onTabChange(value as LibraryTab)}
    >
      <div className="global-reference-library__toolbar">
        <Tabs.List className="global-reference-library__tabs" aria-label="资料库类型">
          <Tabs.Trigger value="character">角色 IP</Tabs.Trigger>
          <Tabs.Trigger value="style">场景风格</Tabs.Trigger>
        </Tabs.List>
        <button type="button" className="course-planner-primary-action" onClick={() => onCreate(activeTab)}>
          {activeTab === "character" ? "创建角色 IP" : "创建场景风格"}
        </button>
      </div>
      <Tabs.Content className="global-reference-library__content" value="character">
        <LibraryItems kind="character" items={characterIps} isLoading={isLoading} onEdit={onEdit} />
      </Tabs.Content>
      <Tabs.Content className="global-reference-library__content" value="style">
        <LibraryItems kind="style" items={sceneStyles} isLoading={isLoading} onEdit={onEdit} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function LibraryItems({
  kind,
  items,
  isLoading,
  onEdit,
}: {
  kind: LibraryTab;
  items: LibraryItem[];
  isLoading: boolean;
  onEdit: (kind: LibraryTab, item: LibraryItem) => void;
}) {
  if (isLoading) {
    return <p className="global-reference-library__status">加载中…</p>;
  }
  if (items.length === 0) {
    return <p className="global-reference-library__empty">暂无{kind === "character" ? "角色 IP" : "场景风格"}</p>;
  }
  return (
    <div className="global-reference-library__grid">
      {items.map((item) => (
        <article className="global-reference-library__card" key={item.id}>
          <img
            src={kind === "character" ? characterModelSheetUrl(item.id) : sceneStyleReferenceImageUrl(item.id)}
            alt={kind === "character" ? `${item.display_name}角色设定图` : `${item.display_name}场景风格参考图`}
            width={272}
            height={180}
            loading="lazy"
          />
          <div className="global-reference-library__card-row">
            <strong title={item.display_name}>{item.display_name}</strong>
            <button type="button" onClick={() => onEdit(kind, item)}>编辑</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function LibraryEditorForm({
  editor,
  formId,
  previewUrl,
  onChange,
  onSubmit,
}: {
  editor: LibraryEditor;
  formId: string;
  previewUrl: string | null;
  onChange: (editor: LibraryEditor) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const nameId = `${formId}-display-name`;
  const fileId = `${formId}-png-file`;
  const fileLabelId = `${fileId}-label`;
  const currentImageUrl = editor.id
    ? editor.kind === "character" ? characterModelSheetUrl(editor.id) : sceneStyleReferenceImageUrl(editor.id)
    : null;
  const imageLabel = editor.kind === "character" ? "角色设定图" : "场景风格参考图";
  const resolvedPreviewUrl = previewUrl ?? currentImageUrl;

  return (
    <form id={formId} className="global-reference-library__form" onSubmit={onSubmit}>
      <label className="course-planner-field" htmlFor={nameId}>
        <span>名称</span>
        <input
          id={nameId}
          name="displayName"
          autoComplete="off"
          value={editor.name}
          onChange={(event) => onChange({ ...editor, name: event.currentTarget.value })}
        />
      </label>
      <div className="course-planner-field">
        <span id={fileLabelId}>{imageLabel}</span>
        <div className="global-reference-library__file-row">
          <input
            id={fileId}
            className="global-reference-library__file-input"
            type="file"
            name="pngFile"
            accept="image/png"
            aria-required={!editor.id}
            aria-labelledby={fileLabelId}
            onChange={(event) => onChange({ ...editor, file: event.currentTarget.files?.[0] ?? null })}
          />
          <label className="global-reference-library__file-action" htmlFor={fileId}>选择 PNG</label>
          <span className="global-reference-library__file-name">
            {editor.file?.name ?? (editor.id ? "保留当前图片" : "尚未选择文件")}
          </span>
        </div>
      </div>
      <div className="global-reference-library__preview-frame">
        {resolvedPreviewUrl ? (
          <img
            className="global-reference-library__preview"
            src={resolvedPreviewUrl}
            alt={`${editor.name || "未命名"}${imageLabel}预览`}
          />
        ) : <p>PNG 预览会显示在这里</p>}
      </div>
    </form>
  );
}

function editorTitle(editor: LibraryEditor): string {
  const label = editor.kind === "character" ? "角色 IP" : "场景风格";
  return `${editor.id ? "编辑" : "创建"}${label}`;
}

function useFilePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url;
}
