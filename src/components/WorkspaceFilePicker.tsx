import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Image, Search, X } from "lucide-react";
import { listWorkspaceTree } from "../lib/wailsBackend";
import type { FileTreeNode } from "../lib/wailsBackend";

const IMAGE_RE = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

function filesIn(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.flatMap((node) =>
    node.isDir ? filesIn(node.children || []) : [node]
  );
}

export function WorkspaceFilePicker({ imagesOnly, onSelect, onClose }: {
  imagesOnly: boolean;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void listWorkspaceTree().then((tree) => {
      if (!cancelled) setFiles(filesIn(tree));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return files.filter((file) => !imagesOnly || IMAGE_RE.test(file.path))
      .filter((file) =>
        !needle || file.path.toLocaleLowerCase().includes(needle)
      )
      .slice(0, 500);
  }, [files, imagesOnly, query]);

  return createPortal(
    <div className="workspace-file-picker-backdrop" onClick={onClose}>
      <section
        className="workspace-file-picker"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <strong>
            {imagesOnly ? "Select Workspace image" : "Select Workspace link"}
          </strong>
          <button type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <label>
          <Search size={15} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Workspace"
          />
        </label>
        <div>
          {loading
            ? <span>Loading…</span>
            : visible.length
            ? visible.map((file) => (
              <button
                type="button"
                key={file.path}
                onClick={() => onSelect(file.path)}
              >
                {IMAGE_RE.test(file.path)
                  ? <Image size={15} />
                  : <FileText size={15} />}
                <span>{file.path}</span>
              </button>
            ))
            : <span>No matching files.</span>}
        </div>
      </section>
    </div>,
    document.body,
  );
}
