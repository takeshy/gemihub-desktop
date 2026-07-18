import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Copy,
  File,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers3,
  LockKeyhole,
  History,
  RotateCcw,
  Trash2,
  Pencil,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { EncryptedFileModal } from "./EncryptedFileModal";
import { encryptWorkspaceFile } from "../lib/fileEncryption";
import { isEncryptedFile } from "../lib/hybridEncryption";
import {
  createDirectory,
  duplicateFile,
  listFileHistory,
  listTrash,
  listFileTree,
  listProjectTree,
  readFile,
  restoreFileHistory,
  restoreTrash,
  renameFile,
  searchFiles,
  searchProjectFiles,
  selectDirectoryBase,
  setDirectoryBase,
  trashFile,
  writeFile,
  type FileSearchResult,
  type FileTreeNode,
  type FileHistoryEntry,
  type TrashEntry,
} from "../lib/wailsBackend";

type TreeMode = "files" | "project";
const PROJECT_ROOTS = ["Dashboards", "Memos", "Secrets", "skills", "workflows"];

export function projectTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return PROJECT_ROOTS.flatMap((name) => nodes.filter((node) => node.isDir && node.name.toLowerCase() === name.toLowerCase()));
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function visibleTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;
  return nodes.flatMap((node) => {
    const children = visibleTree(node.children ?? [], query);
    if (node.name.toLowerCase().includes(normalized) || children.length) {
      return [{ ...node, children }];
    }
    return [];
  });
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onOpen,
  onMutated,
  onContextMenu,
  scope,
}: {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onMutated: () => void;
  onContextMenu: (node: FileTreeNode, path: string, event: MouseEvent) => void;
  scope: TreeMode;
}) {
  const isOpen = expanded.has(node.path);
  const protectedProjectRoot = scope === "project" && depth === 0;
  const scopedPath = (path: string) => scope === "files" ? `workspace://${path}` : path;
  const mutate = async (kind: "file" | "folder" | "rename" | "delete") => {
    try {
      if (kind === "file") {
        const name = prompt("New file name", "untitled.md")?.trim();
        if (name) await writeFile(scopedPath(joinPath(node.isDir ? node.path : parentPath(node.path), name)), "");
      } else if (kind === "folder") {
        const name = prompt("New folder name")?.trim();
        if (name) await createDirectory(scopedPath(joinPath(node.isDir ? node.path : parentPath(node.path), name)));
      } else if (kind === "rename") {
        const nextName = prompt("Rename", node.name)?.trim();
        if (nextName && nextName !== node.name) {
          await renameFile(scopedPath(node.path), scopedPath(joinPath(parentPath(node.path), nextName)));
        }
      } else if (confirm(`Move ${node.path} to Trash?`)) {
        await trashFile(scopedPath(node.path));
      }
      onMutated();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <div className="file-tree-row" style={{ paddingLeft: 8 + depth * 14 }} onContextMenu={(event) => onContextMenu(node, scopedPath(node.path), event)}>
        <button
          type="button"
          className="file-tree-entry"
          onClick={() => node.isDir ? onToggle(node.path) : onOpen(scopedPath(node.path))}
          title={node.path}
        >
          <span className="file-tree-chevron">
            {node.isDir ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
          </span>
          {node.isDir ? (isOpen ? <FolderOpen size={15} /> : <Folder size={15} />) : <File size={15} />}
          <span>{node.name}</span>
        </button>
        <div className="file-tree-row-actions">
          {node.isDir && <button type="button" onClick={() => void mutate("file")} title="New file"><FilePlus2 size={13} /></button>}
          {node.isDir && <button type="button" onClick={() => void mutate("folder")} title="New folder"><FolderPlus size={13} /></button>}
          {!protectedProjectRoot && <button type="button" onClick={() => void mutate("rename")} title="Rename"><Pencil size={13} /></button>}
          {!protectedProjectRoot && <button type="button" onClick={() => void mutate("delete")} title="Delete"><X size={13} /></button>}
        </div>
      </div>
      {node.isDir && isOpen && (node.children ?? []).map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onOpen={onOpen}
          onMutated={onMutated}
          onContextMenu={onContextMenu}
          scope={scope}
        />
      ))}
    </>
  );
}

export function FileTree({
  directoryBase,
  onDirectoryBaseChange,
  projectPath,
  openFilesOnStartup,
  onOpenFile,
  onCollapse,
}: {
  directoryBase: string;
  onDirectoryBaseChange: (path: string) => void;
  projectPath: string;
  openFilesOnStartup: boolean;
  onOpenFile: (path: string) => void;
  onCollapse: () => void;
}) {
  const [nodes, setNodes] = useState<FileTreeNode[]>([]);
  const [projectNodes, setProjectNodes] = useState<FileTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [contentResults, setContentResults] = useState<FileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [treeMode, setTreeMode] = useState<TreeMode>(() =>
    localStorage.getItem("llm-hub:fileTreeMode") === "files" ? "files" : "project"
  );
  const [contextMenu, setContextMenu] = useState<{ node: FileTreeNode; path: string; x: number; y: number } | null>(null);
  const [encryptedModalPath, setEncryptedModalPath] = useState("");
  const [historyDialog, setHistoryDialog] = useState<{ path: string; entries: FileHistoryEntry[] } | null>(null);
  const [trashDialog, setTrashDialog] = useState<TrashEntry[] | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (directoryBase) {
        await setDirectoryBase(directoryBase);
        setNodes(await listFileTree());
      } else setNodes([]);
      if (treeMode === "project") setProjectNodes(await listProjectTree());
    } finally {
      setLoading(false);
    }
  }, [directoryBase, projectPath, treeMode]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const listener = () => void reload();
    window.addEventListener("llm-hub:file-tree-refresh", listener);
    return () => window.removeEventListener("llm-hub:file-tree-refresh", listener);
  }, [reload]);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized || (treeMode === "files" && !directoryBase)) {
      setContentResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void (treeMode === "project" ? searchProjectFiles(normalized, 30) : searchFiles(normalized, 30)).then(setContentResults).catch(() => setContentResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [directoryBase, query, treeMode]);

  const modeNodes = useMemo(() => treeMode === "project" ? projectNodes : nodes, [nodes, projectNodes, treeMode]);
  const filtered = useMemo(() => visibleTree(modeNodes, query), [modeNodes, query]);
  const visibleContentResults = useMemo(() => treeMode === "project" ? contentResults.filter((item) => PROJECT_ROOTS.some((root) => item.path === root || item.path.toLowerCase().startsWith(`${root.toLowerCase()}/`))) : contentResults, [contentResults, treeMode]);
  const rootName = directoryBase.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || directoryBase;

  useEffect(() => {
    if (openFilesOnStartup) setTreeMode("files");
  }, [openFilesOnStartup]);

  useEffect(() => {
    localStorage.setItem("llm-hub:fileTreeMode", treeMode);
  }, [treeMode]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("blur", close); };
  }, [contextMenu]);

  const openTreeFile = (path: string) => {
    if (path.toLowerCase().endsWith(".encrypted")) { setEncryptedModalPath(path); return; }
    void readFile(path).then((file) => {
      if (file && isEncryptedFile(file.content)) setEncryptedModalPath(path); else onOpenFile(path);
    }).catch(() => onOpenFile(path));
  };

  const encryptFromMenu = async () => {
    const selected = contextMenu;
    setContextMenu(null);
    if (!selected || selected.node.isDir) return;
    const password = prompt("暗号化パスワードを入力してください") || "";
    if (!password) return;
    try {
      await encryptWorkspaceFile(selected.path, password);
      await reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };
  const showHistory = async () => { const selected=contextMenu;if(!selected)return;setContextMenu(null);setHistoryDialog({path:selected.path,entries:await listFileHistory(selected.path)}); };
  const duplicateFromMenu = async () => { const selected=contextMenu;if(!selected)return;setContextMenu(null);await duplicateFile(selected.path);await reload(); };
  const trashFromMenu = async () => { const selected=contextMenu;if(!selected)return;setContextMenu(null);if(confirm(`Move ${selected.node.path} to Trash?`)){await trashFile(selected.path);await reload();} };

  const chooseDirectory = async () => {
    const selected = await selectDirectoryBase();
    if (selected) onDirectoryBaseChange(selected);
  };

  const switchTreeMode = (mode: TreeMode) => {
    setTreeMode(mode);
    setQuery("");
    setContentResults([]);
  };

  const createAtRoot = async (kind: "file" | "folder") => {
    const name = prompt(kind === "file" ? "New file name" : "New folder name", kind === "file" ? "untitled.md" : "folder")?.trim();
    if (!name) return;
    try {
      if (kind === "file") await writeFile(`workspace://${name}`, "");
      else await createDirectory(`workspace://${name}`);
      await reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <aside className="file-tree-panel">
      <div className="file-tree-mode-bar">
        <div role="tablist" aria-label="Tree source">
          <button type="button" role="tab" aria-selected={treeMode === "files"} className={treeMode === "files" ? "active" : ""} onClick={() => switchTreeMode("files")}><Folder size={14} />Files</button>
          <button type="button" role="tab" aria-selected={treeMode === "project"} className={treeMode === "project" ? "active" : ""} onClick={() => switchTreeMode("project")}><Layers3 size={14} />Workspace</button>
        </div>
        {(directoryBase || treeMode === "project") && <button type="button" className="file-tree-refresh" onClick={() => void reload()} title="Refresh"><RefreshCw size={15} className={loading ? "spin" : ""} /></button>}
        <button type="button" className="file-tree-collapse" onClick={onCollapse} title="Collapse FileTree"><ChevronsLeft size={16} /></button>
      </div>
      {treeMode === "files" && <header className="file-tree-header">
        <button type="button" className="file-tree-root" onClick={() => void chooseDirectory()} title={directoryBase || "Open directory"}><FolderOpen size={16} /><span><small>FILES</small><strong>{directoryBase ? rootName : "Open directory"}</strong></span></button>
        <div className="file-tree-actions">
          {directoryBase && <>
            <button type="button" onClick={() => void createAtRoot("file")} title="New file"><FilePlus2 size={15} /></button>
            <button type="button" onClick={() => void createAtRoot("folder")} title="New folder"><FolderPlus size={15} /></button>
          </>}
          {directoryBase && <button type="button" onClick={() => void listTrash().then(setTrashDialog)} title="Trash"><Trash2 size={15} /></button>}
        </div>
      </header>}
      {((treeMode === "files" && directoryBase) || (treeMode === "project" && projectPath)) && (
        <>
          <label className="file-tree-search">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={treeMode === "project" ? "Search workspace resources" : "Search files"} />
          </label>
          <div className="file-tree-scroll">
            {filtered.map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                depth={0}
                expanded={expanded}
                onToggle={(path) => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(path)) next.delete(path); else next.add(path);
                  return next;
                })}
                onOpen={openTreeFile}
                onMutated={() => void reload()}
                onContextMenu={(node, path, event) => {
                  event.preventDefault();
                  setContextMenu({ node, path, x: event.clientX, y: event.clientY });
                }}
                scope={treeMode}
              />
            ))}
            {treeMode === "project" && filtered.length === 0 && <div className="file-tree-project-empty">No project resource directories.</div>}
            {query.trim() && visibleContentResults.some((item) => item.preview) && (
              <section className="file-tree-content-results">
                <strong>Content</strong>
                {visibleContentResults.filter((item) => item.preview).map((item) => (
                  <button key={`${item.path}:${item.line}`} type="button" onClick={() => openTreeFile(treeMode === "files" ? `workspace://${item.path}` : item.path)}>
                    <span>{item.path}{item.line ? `:${item.line}` : ""}</span>
                    <small>{item.preview}</small>
                  </button>
                ))}
              </section>
            )}
          </div>
        </>
      )}
      {contextMenu && (
        <div className="file-tree-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          {!contextMenu.node.isDir && <>
            {contextMenu.path.toLowerCase().endsWith(".encrypted")
              ? <button type="button" onClick={() => { setEncryptedModalPath(contextMenu.path); setContextMenu(null); }}><LockKeyhole size={14} />暗号化ファイルを開く</button>
              : <button type="button" onClick={() => void encryptFromMenu()}><LockKeyhole size={14} />ファイルを暗号化</button>}
            <button type="button" onClick={() => void duplicateFromMenu()}><Copy size={14} />Duplicate</button>
            <button type="button" onClick={() => void showHistory()}><History size={14} />History</button>
          </>}
          <button type="button" onClick={() => void trashFromMenu()}><Trash2 size={14} />Move to Trash</button>
        </div>
      )}
      {encryptedModalPath && <EncryptedFileModal path={encryptedModalPath} onClose={() => setEncryptedModalPath("")} onChanged={() => void reload()} />}
      {historyDialog && <div className="encrypted-file-modal-backdrop"><section className="file-lifecycle-dialog"><header><strong>History · {historyDialog.path}</strong><button onClick={() => setHistoryDialog(null)}><X size={15}/></button></header><div>{historyDialog.entries.length===0?<p>No saved versions.</p>:historyDialog.entries.map((entry)=><article key={entry.id}><span>{new Date(entry.timestamp).toLocaleString()} · {entry.size.toLocaleString()} bytes</span><button onClick={() => void restoreFileHistory(historyDialog.path,entry.id).then(async()=>{await reload();setHistoryDialog(null);})}><RotateCcw size={13}/>Restore</button></article>)}</div></section></div>}
      {trashDialog && <div className="encrypted-file-modal-backdrop"><section className="file-lifecycle-dialog"><header><strong>Trash</strong><button onClick={() => setTrashDialog(null)}><X size={15}/></button></header><div>{trashDialog.length===0?<p>Trash is empty.</p>:trashDialog.map((entry)=><article key={entry.id}><span>{entry.originalPath}<small>{new Date(entry.deletedAt).toLocaleString()}</small></span><button onClick={() => void restoreTrash(entry.id).then(async()=>{await reload();setTrashDialog(await listTrash());})}><RotateCcw size={13}/>Restore</button></article>)}</div></section></div>}
    </aside>
  );
}
