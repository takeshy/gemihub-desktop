import { useEffect, useMemo, useState } from "react";
import { Code, LayoutGrid, Pencil, Plus, X } from "lucide-react";
import yaml from "js-yaml";
import { KanbanDashboardWidget } from "./DashboardWidgets";
import { type FileRef } from "../lib/fileRef";
import { type KanbanDefinition, parseKanbanDefinition } from "./dashboardData";

type KanbanFileMode = "display" | "edit" | "raw";

function serialize(definition: KanbanDefinition): string {
  return yaml.dump(definition, { lineWidth: -1, noRefs: true }).trimEnd() +
    "\n";
}

export function KanbanFileView(
  { content, path, editRequest, isDark, onChange, onOpenFile }: {
    content: string;
    path: string;
    editRequest?: number;
    isDark: boolean;
    onChange: (content: string) => void;
    onOpenFile: (file: FileRef) => void;
  },
) {
  const definition = useMemo(() => parseKanbanDefinition(content), [content]);
  const [mode, setMode] = useState<KanbanFileMode>(() =>
    definition ? "display" : "raw"
  );
  useEffect(() => {
    if (editRequest && definition) setMode("edit");
  }, [definition, editRequest]);
  const updateDefinition = (next: KanbanDefinition) =>
    onChange(serialize(next));
  const updateFromBoard = (next: Record<string, unknown>) => {
    const { kanban: _kanban, ...board } = next;
    updateDefinition({ ...(definition || {}), ...board });
  };

  return (
    <div className="kanban-file-view">
      <header>
        <span title={path}>
          <LayoutGrid size={14} />
          {path.split(/[\\/]/).pop()?.replace(/\.kanban$/i, "") || "Kanban"}
        </span>
        <div className="structured-file-modes">
          <button
            type="button"
            className={mode === "display" ? "active" : ""}
            disabled={!definition}
            onClick={() => setMode("display")}
          >
            <LayoutGrid size={13} />Display
          </button>
          <button
            type="button"
            className={mode === "edit" ? "active" : ""}
            disabled={!definition}
            onClick={() => setMode("edit")}
          >
            <Pencil size={13} />Edit
          </button>
          <button
            type="button"
            className={mode === "raw" ? "active" : ""}
            onClick={() => setMode("raw")}
          >
            <Code size={13} />Raw
          </button>
        </div>
      </header>
      {mode === "raw" || !definition
        ? (
          <textarea
            className="raw-editor widget-raw-editor"
            value={content}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            aria-label="Kanban YAML"
          />
        )
        : (
          <div className="kanban-file-display">
            <KanbanDashboardWidget
              config={{
                ...definition,
                kanban: path,
              }}
              isDark={isDark}
              onChange={updateFromBoard}
              onOpenFile={onOpenFile}
            />
            {mode === "edit" && (
              <KanbanDefinitionEditor
                definition={definition}
                onChange={updateDefinition}
                onClose={() => setMode("display")}
              />
            )}
          </div>
        )}
    </div>
  );
}

function KanbanDefinitionEditor({ definition, onChange, onClose }: {
  definition: KanbanDefinition;
  onChange: (definition: KanbanDefinition) => void;
  onClose: () => void;
}) {
  const columns = Array.isArray(definition.columns)
    ? definition.columns.map((item) =>
      typeof item === "string"
        ? { value: item, label: item }
        : { value: item.value || "", label: item.label || item.value || "" }
    )
    : [];
  const patch = (next: Partial<KanbanDefinition>) =>
    onChange({ ...definition, ...next });
  return (
    <aside className="kanban-file-edit-panel">
      <header>
        <div>
          <LayoutGrid size={16} />
          <strong>Edit Kanban</strong>
        </div>
        <button type="button" onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </header>
      <div>
        <label>
          <span>Board title</span>
          <input
            value={definition.title || ""}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </label>
        <label>
          <span>Folder</span>
          <input
            value={definition.folder || ""}
            onChange={(event) => patch({ folder: event.target.value })}
            placeholder="Tasks"
          />
        </label>
        <label>
          <span>Status property</span>
          <input
            value={definition.statusProperty || "status"}
            onChange={(event) => patch({ statusProperty: event.target.value })}
          />
        </label>
        <label>
          <span>Title property</span>
          <input
            value={definition.titleProperty || "title"}
            onChange={(event) => patch({ titleProperty: event.target.value })}
          />
        </label>
        <label>
          <span>Timeline for status history</span>
          <input
            value={definition.timelineName || ""}
            onChange={(event) => patch({ timelineName: event.target.value })}
            placeholder="Timeline (leave blank to disable)"
          />
        </label>
        <section>
          <strong>Columns</strong>
          {columns.map((column, index) => (
            <div
              className="kanban-file-column"
              key={`${column.value}:${index}`}
            >
              <input
                value={column.value}
                placeholder="Value"
                onChange={(event) =>
                  patch({
                    columns: columns.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, value: event.target.value }
                        : item
                    ),
                  })}
              />
              <input
                value={column.label}
                placeholder="Label"
                onChange={(event) =>
                  patch({
                    columns: columns.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, label: event.target.value }
                        : item
                    ),
                  })}
              />
              <button
                type="button"
                onClick={() =>
                  patch({
                    columns: columns.filter((_, itemIndex) =>
                      itemIndex !== index
                    ),
                  })}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="kanban-file-add"
            onClick={() =>
              patch({
                columns: [...columns, {
                  value: `column-${columns.length + 1}`,
                  label: "New column",
                }],
              })}
          >
            <Plus size={13} />Add column
          </button>
        </section>
        <label className="kanban-file-check">
          <input
            type="checkbox"
            checked={definition.showUnspecified === true}
            onChange={(event) =>
              patch({ showUnspecified: event.target.checked })}
          />
          <span>Show unmatched cards</span>
        </label>
      </div>
    </aside>
  );
}
