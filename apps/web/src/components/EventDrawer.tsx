import type {
  Entry,
  EntryAttachment,
  EntryUnitId,
  EntryUnitProfile,
  EventKind,
  Importance,
} from "@desktopcal/shared";
import {
  getEntryMarkerSymbol,
  kindLabels,
} from "@desktopcal/shared";
import { ChangeEvent, FormEvent, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { AttachmentRepository, EntryDraft } from "../repositories/EntryRepository";

interface EventDrawerProps {
  open: boolean;
  date: string;
  entry?: Entry;
  draft?: EntryDraft;
  saving?: boolean;
  error?: string;
  unitProfiles: Record<EntryUnitId, EntryUnitProfile>;
  attachmentRepository: AttachmentRepository;
  onClose(): void;
  onSave(draft: EntryDraft): Promise<void>;
  onDelete(entry: Entry): Promise<void>;
}

const kindOptions: EventKind[] = ["event", "duration"];

function defaultDraft(date: string): EntryDraft {
  return {
    title: "",
    date,
    unit: "work",
    kind: "event",
    importance: 3,
    attachments: [],
  };
}

function entryToDraft(entry: Entry): EntryDraft {
  return {
    localId: entry.localId,
    unit: entry.unit,
    title: entry.title,
    date: entry.date,
    time: entry.time,
    kind: entry.kind,
    importance: entry.importance,
    completed: entry.completed ?? false,
    note: entry.note,
    attachments: entry.attachments,
  };
}

export function EventDrawer({
  open,
  date,
  entry,
  draft: initialDraft,
  unitProfiles,
  saving,
  error,
  attachmentRepository,
  onClose,
  onSave,
  onDelete,
}: EventDrawerProps) {
  const [draft, setDraft] = useState<EntryDraft>(() => defaultDraft(date));
  const [attachmentError, setAttachmentError] = useState<string | undefined>();
  const isEditing = Boolean(entry);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    setDraft(entry ? entryToDraft(entry) : initialDraft ?? defaultDraft(date));
    setAttachmentError(undefined);
  }, [date, entry, initialDraft, open]);

  const title = useMemo(() => (isEditing ? "编辑事件" : "新增事件"), [isEditing]);
  const unitOptions = useMemo(() => Object.values(unitProfiles), [unitProfiles]);
  const unitProfile = unitProfiles[draft.unit ?? "work"] ?? unitProfiles.work;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      return;
    }
    await onSave(draft);
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (files.length === 0) {
      return;
    }
    setAttachmentError(undefined);
    try {
      const nextAttachments = await Promise.all(files.map((file) => attachmentRepository.add(file)));
      setDraft((current) => ({
        ...current,
        attachments: [...(current.attachments ?? []), ...nextAttachments],
      }));
    } catch (uploadError) {
      setAttachmentError(uploadError instanceof Error ? uploadError.message : "附件保存失败");
    }
  }

  async function removeAttachment(attachment: EntryAttachment) {
    if (attachment.localBlobKey) {
      await attachmentRepository.remove(attachment.localBlobKey);
    }
    setDraft((current) => ({
      ...current,
      attachments: (current.attachments ?? []).filter((item) => item.id !== attachment.id),
    }));
  }

  return (
    <aside className={`eventDrawer${open ? " open" : ""}`} aria-hidden={!open}>
      <div className="drawerHeader">
        <div>
          <p className="eyebrow">{entry?.isLegacy ? "Legacy" : "Event"}</p>
          <h3>{title}</h3>
        </div>
        <button className="iconButton" type="button" aria-label="关闭事件抽屉" onClick={onClose}>
          ×
        </button>
      </div>

      <form className="drawerForm" onSubmit={submit}>
        <label>
          <span>标题</span>
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })}
            aria-label="标题"
            autoFocus={open}
            required
          />
        </label>
        <div className="fieldGrid">
          <label>
            <span>日期</span>
            <input
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.currentTarget.value })}
              aria-label="日期"
              type="date"
              required
            />
          </label>
          <label>
            <span>时间</span>
            <input
              value={draft.time ?? ""}
              onChange={(event) => setDraft({ ...draft, time: event.currentTarget.value })}
              aria-label="时间"
              type="time"
            />
          </label>
        </div>

        <div className="unitGrid">
          <label>
            <span>单位</span>
            <select
              value={draft.unit ?? "work"}
              onChange={(event) =>
                setDraft({ ...draft, unit: event.currentTarget.value as EntryUnitId })
              }
              aria-label="单位"
            >
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <div className="unitPreview" aria-label="显示规则">
            <span className={`marker level${draft.importance}`}>
              {getEntryMarkerSymbol(unitProfile.shape, draft.kind ?? "event")}
            </span>
            <strong>{unitProfile.label}</strong>
            <em>{kindLabels[draft.kind ?? "event"]}</em>
          </div>
        </div>

        <fieldset>
          <legend>事件类型</legend>
          <div className="segments wide">
            {kindOptions.map((kind) => (
              <button
                aria-pressed={draft.kind === kind}
                className={draft.kind === kind ? "segment active" : "segment"}
                key={kind}
                type="button"
                onClick={() => setDraft({ ...draft, kind })}
              >
                {kindLabels[kind]}
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          <span>重要性</span>
          <div className="starRating" role="radiogroup" aria-label="重要性">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                aria-checked={draft.importance === value}
                className={draft.importance >= value ? "starButton active" : "starButton"}
                key={value}
                role="radio"
                type="button"
                onClick={() => setDraft({ ...draft, importance: value as Importance })}
              >
                ★
              </button>
            ))}
          </div>
        </label>

        <label>
          <span>状态</span>
          <label className="inlineCheckbox">
            <input
              checked={draft.completed ?? false}
              onChange={(event) => setDraft({ ...draft, completed: event.currentTarget.checked })}
              type="checkbox"
            />
            已完成
          </label>
        </label>

        <label>
          <span>备注</span>
          <textarea
            value={draft.note ?? ""}
            onChange={(event) => setDraft({ ...draft, note: event.currentTarget.value })}
            aria-label="备注"
            rows={4}
          />
        </label>

        <section className="attachmentSection">
          <div className="attachmentHeader">
            <span>附件</span>
            <label className="fileButton">
              添加
              <input type="file" multiple onChange={uploadFiles} aria-label="添加附件" />
            </label>
          </div>
          {attachmentError ? <p className="errorText">{attachmentError}</p> : null}
          <ul className="attachmentList">
            {(draft.attachments ?? []).map((attachment) => (
              <AttachmentRow
                attachment={attachment}
                attachmentRepository={attachmentRepository}
                key={attachment.id}
                onRemove={removeAttachment}
              />
            ))}
          </ul>
        </section>

        {error ? <p className="errorText">{error}</p> : null}
        <div className="drawerActions">
          {entry ? (
            <button
              className="dangerButton"
              disabled={saving}
              type="button"
              onClick={() => onDelete(entry)}
            >
              删除
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primaryButton" disabled={saving || !draft.title.trim()} type="submit">
            保存
          </button>
        </div>
      </form>
    </aside>
  );
}

interface AttachmentRowProps {
  attachment: EntryAttachment;
  attachmentRepository: AttachmentRepository;
  onRemove(attachment: EntryAttachment): Promise<void>;
}

function AttachmentRow({ attachment, attachmentRepository, onRemove }: AttachmentRowProps) {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;

    async function loadPreview() {
      if (!attachment.localBlobKey || !attachment.mime.startsWith("image/")) {
        return;
      }
      const blob = await attachmentRepository.get(attachment.localBlobKey);
      if (!blob || !alive || typeof globalThis.URL.createObjectURL !== "function") {
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    }

    void loadPreview();
    return () => {
      alive = false;
      if (objectUrl && typeof globalThis.URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attachment, attachmentRepository]);

  return (
    <li className="attachmentItem">
      {previewUrl ? <img src={previewUrl} alt="" /> : <span className="fileGlyph">□</span>}
      <div>
        <strong>{attachment.name}</strong>
        <span>{Math.ceil(attachment.size / 1024)} KB</span>
      </div>
      <button type="button" onClick={() => void onRemove(attachment)} aria-label={`移除 ${attachment.name}`}>
        ×
      </button>
    </li>
  );
}
