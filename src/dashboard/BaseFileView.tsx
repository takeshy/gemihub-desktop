import { useCallback, useEffect, useState } from "react";
import {
  Code,
  Database,
  Loader2,
  Pencil,
  RefreshCw,
  TableProperties,
} from "lucide-react";
import { fileInventory, readFile } from "../lib/wailsBackend";
import type { BaseQueryData } from "./baseEngine";
import { queryBaseFiles } from "./baseEngine";
import type { BaseDefinition } from "./dashboardData";
import { BaseConfigEditor } from "./BaseConfigEditor";
import { BaseViewRenderer } from "./BaseViewRenderer";
import { KanbanCardModal } from "./KanbanCardModal";

export function BaseFileView({
  content,
  path,
  onChange,
  onOpenPath,
  isDark,
}: {
  content: string;
  path: string;
  onChange: (content: string) => void;
  onOpenPath: (path: string) => void;
  isDark: boolean;
}) {
  const [mode, setMode] = useState<"display" | "edit" | "raw">("display");
  const [selectedView, setSelectedView] = useState("");
  const [data, setData] = useState<BaseQueryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewPath, setPreviewPath] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const inventory = await fileInventory();
      const files = await Promise.all(inventory.map(async (entry) => {
        const markdown = !entry.binary && /\.md(?:own)?$/i.test(entry.path);
        const source = markdown ? await readFile(entry.path) : null;
        return {
          id: entry.path,
          name: entry.path,
          mimeType: markdown ? "text/markdown" : "application/octet-stream",
          modifiedTime: new Date(entry.modTime || Date.now()).toISOString(),
          createdTime: new Date(
            entry.createdTime || entry.modTime || Date.now(),
          ).toISOString(),
          content: source?.content,
        };
      }));
      const queried = queryBaseFiles(content, selectedView, files);
      setData(queried);
      setSelectedView(queried.view.name);
      setError("");
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [content, selectedView, refreshKey]);

  useEffect(() => {
    if (mode === "display") void load();
  }, [load, mode]);

  const definition = data?.compiled.config as unknown as
    | BaseDefinition
    | undefined;
  return (
    <div className="base-file-view">
      <header>
        <span title={path}>
          <Database size={13} />
          {path || "Base"}
        </span>
        {data && data.compiled.config.views.length > 1 && (
          <select
            value={selectedView}
            onChange={(event) => setSelectedView(event.target.value)}
          >
            {data.compiled.config.views.map((view) => (
              <option key={view.name}>{view.name}</option>
            ))}
          </select>
        )}
        <div>
          <button
            type="button"
            className={mode === "display" ? "active" : ""}
            onClick={() => setMode("display")}
            title="Display Base"
          >
            <TableProperties size={13} />Display
          </button>
          <button
            type="button"
            className={mode === "edit" ? "active" : ""}
            onClick={() => setMode("edit")}
            title="Edit Base configuration"
          >
            <Pencil size={13} />Edit
          </button>
          <button
            type="button"
            className={mode === "raw" ? "active" : ""}
            onClick={() => setMode("raw")}
            title="Edit raw YAML"
          >
            <Code size={13} />Raw
          </button>
          {mode === "display" && (
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </header>
      {mode === "raw"
        ? (
          <textarea
            className="raw-editor widget-raw-editor"
            value={content}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            aria-label="Base YAML"
          />
        )
        : mode === "edit"
        ? (
          <BaseConfigEditor
            content={content}
            onChange={onChange}
            viewName={selectedView}
          />
        )
        : loading
        ? (
          <div className="dashboard-widget-loading centered">
            <Loader2 size={18} className="spin" />
          </div>
        )
        : error
        ? <div className="dashboard-widget-error centered">{error}</div>
        : data
        ? (
          <BaseViewRenderer
            data={data}
            definition={definition || null}
            onOpenPath={setPreviewPath}
          />
        )
        : null}
      {previewPath && (
        <KanbanCardModal
          path={previewPath}
          isDark={isDark}
          onNavigate={() => {
            const target = previewPath;
            setPreviewPath("");
            onOpenPath(target);
          }}
          onSaved={() => setRefreshKey((value) => value + 1)}
          onClose={() => setPreviewPath("")}
        />
      )}
    </div>
  );
}
