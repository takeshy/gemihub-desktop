import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Folder } from "lucide-react";
import { type FileTreeNode, listWorkspaceTree } from "../lib/wailsBackend";

function folderPaths(nodes: FileTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.isDir ? [node.path, ...folderPaths(node.children || [])] : []
  ).sort((left, right) => left.localeCompare(right));
}

export function WorkspaceFolderPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [parent, setParent] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || folders.length) return;
    setLoading(true);
    void listWorkspaceTree().then((tree) => setFolders(folderPaths(tree)))
      .finally(() => setLoading(false));
  }, [folders.length, open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const children = useMemo(() => {
    const prefix = parent ? `${parent}/` : "";
    return folders.filter((path) => {
      if (!path.startsWith(prefix) || path === parent) return false;
      return !path.slice(prefix.length).includes("/");
    });
  }, [folders, parent]);
  const crumbs = parent ? parent.split("/") : [];
  return (
    <div className="workspace-folder-picker" ref={rootRef}>
      <div>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Workspace folder"
        />
        <button
          type="button"
          title="Browse folders"
          onClick={() => setOpen(!open)}
        >
          <Folder size={15} />
        </button>
      </div>
      {open && (
        <aside>
          <nav>
            <button type="button" onClick={() => setParent("")}>
              Workspace
            </button>
            {crumbs.map((crumb, index) => {
              const path = crumbs.slice(0, index + 1).join("/");
              return (
                <span key={path}>
                  <ChevronRight size={11} />
                  <button type="button" onClick={() => setParent(path)}>
                    {crumb}
                  </button>
                </span>
              );
            })}
          </nav>
          {loading
            ? <p>Loading…</p>
            : children.length === 0
            ? <p>No subfolders</p>
            : (
              <ul>
                {children.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(path);
                        setOpen(false);
                      }}
                    >
                      <Folder size={14} />
                      {path.split("/").pop()}
                      {value === path && (
                        <Check className="selected" size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      title="Open folder"
                      onClick={() => setParent(path)}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </aside>
      )}
    </div>
  );
}
