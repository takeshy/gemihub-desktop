import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, Plus, Trash2, X } from "lucide-react";
import type { KanbanAttachment, KanbanChecklistItem } from "./kanbanTask";

export interface KanbanTaskInput {
  title: string;
  status: string;
  due: string;
  description: string;
  checklist: KanbanChecklistItem[];
  attachments: KanbanAttachment[];
  files: File[];
}

export function KanbanTaskModal({
  mode,
  columns,
  initial,
  onSubmit,
  onClose,
}: {
  mode: "new" | "edit";
  columns: Array<{ value: string; label: string }>;
  initial?: Partial<KanbanTaskInput>;
  onSubmit: (input: KanbanTaskInput) => void | Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [status, setStatus] = useState(
    initial?.status ?? columns[0]?.value ?? "",
  );
  const [due, setDue] = useState(initial?.due ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [checklist, setChecklist] = useState<KanbanChecklistItem[]>(
    () => (initial?.checklist ?? []).map((item) => ({ ...item })),
  );
  const [attachments, setAttachments] = useState<KanbanAttachment[]>(
    () => (initial?.attachments ?? []).map((item) => ({ ...item })),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="kanban-task-backdrop" onMouseDown={onClose}>
      <form
        className="kanban-task-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim() || saving) return;
          setSaving(true);
          setError("");
          void Promise.resolve(onSubmit({
            title: title.trim(),
            status,
            due,
            description,
            checklist: checklist.filter((item) => item.text.trim()),
            attachments,
            files,
          })).then(onClose).catch((caught: unknown) => {
            setError(caught instanceof Error ? caught.message : String(caught));
            setSaving(false);
          });
        }}
      >
        <header>
          <strong>{mode === "new" ? "New task" : "Edit task"}</strong>
          <button type="button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="kanban-task-form">
          <label>
            <span>Title</span>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Task title"
            />
          </label>
          <div className="kanban-task-form-row">
            <label>
              <span>Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {columns.map((column) => (
                  <option key={column.value} value={column.value}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Due date</span>
              <input
                type="date"
                value={due}
                onChange={(event) => setDue(event.target.value)}
              />
            </label>
          </div>
          <label>
            <span>Description</span>
            <textarea
              rows={6}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Markdown is supported"
            />
          </label>
          <section className="kanban-task-list">
            <header>
              <strong>Checklist</strong>
              <button
                type="button"
                onClick={() =>
                  setChecklist((current) => [
                    ...current,
                    { text: "", completed: false },
                  ])}
              >
                <Plus size={13} /> Add item
              </button>
            </header>
            {checklist.map((item, index) => (
              <div key={index}>
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={(event) =>
                    setChecklist((current) =>
                      current.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, completed: event.target.checked }
                          : entry
                      )
                    )}
                />
                <input
                  value={item.text}
                  onChange={(event) =>
                    setChecklist((current) =>
                      current.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, text: event.target.value }
                          : entry
                      )
                    )}
                  placeholder="Checklist item"
                />
                <button
                  type="button"
                  onClick={() =>
                    setChecklist((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index)
                    )}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>
          <section className="kanban-task-list kanban-task-attachments">
            <header>
              <strong>Attachments</strong>
              <button type="button" onClick={() => fileInput.current?.click()}>
                <Paperclip size={13} /> Add files
              </button>
              <input
                ref={fileInput}
                hidden
                type="file"
                multiple
                onChange={(event) => {
                  setFiles((current) => [
                    ...current,
                    ...Array.from(event.target.files ?? []),
                  ]);
                  event.target.value = "";
                }}
              />
            </header>
            {[
              ...attachments.map((item) => ({
                key: item.path,
                label: item.label,
                stored: true,
              })),
              ...files.map((item, index) => ({
                key: `${item.name}-${index}`,
                label: item.name,
                stored: false,
              })),
            ].map((item, index) => (
              <div key={item.key}>
                <Paperclip size={14} />
                <span>{item.label}</span>
                <button
                  type="button"
                  onClick={() =>
                    item.stored
                      ? setAttachments((current) =>
                        current.filter((_, i) => i !== index)
                      )
                      : setFiles((current) =>
                        current.filter((_, i) =>
                          i !== index - attachments.length
                        )
                      )}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>
          {error && <p className="dashboard-widget-error">{error}</p>}
        </div>
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="primary"
            disabled={!title.trim() || saving}
          >
            {saving ? "Saving…" : mode === "new" ? "Create" : "Save"}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
