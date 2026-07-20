import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  FolderSearch,
  History,
  LockKeyhole,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { EncryptedFileModal } from "./EncryptedFileModal";
import { encryptWorkspaceFile } from "../lib/fileEncryption";
import { isEncryptedFile } from "../lib/hybridEncryption";
import {
  type FileTreeScope,
  isProtectedWorkspaceRoot,
  scopedTreePath,
} from "../lib/fileTreePaths";
import { dashboardPluginWidgetForPath } from "../dashboard/widgetRegistry";
import {
  createDirectory,
  copyLocalPathIntoWorkspace,
  duplicateFile,
  type FileHistoryEntry,
  type FileSearchResult,
  type FileTreeNode,
  listFileHistory,
  listFileTree,
  listTrash,
  listWorkspaceTree,
  movePathIntoWorkspace,
  onWailsFileDrop,
  openContainingFolder,
  readFile,
  renameFile,
  restoreFileHistory,
  restoreTrash,
  searchWorkspaceFiles,
  setDirectoryBase,
  type TrashEntry,
  trashFile,
  writeFile,
} from "../lib/wailsBackend";

type TreeMode = FileTreeScope;

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function normalizedFsPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase();
}

function isSameOrNestedPath(path: string, base: string): boolean {
  const candidate = normalizedFsPath(path);
  const root = normalizedFsPath(base);
  return !!candidate && !!root &&
    (candidate === root || candidate.startsWith(`${root}/`));
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

function treeFilePaths(nodes: FileTreeNode[], expanded: Set<string>): string[] {
  return nodes.flatMap((node) =>
    node.isDir
      ? expanded.has(`files:${node.path}`)
        ? treeFilePaths(node.children ?? [], expanded)
        : []
      : [scopedTreePath("files", node.path)]
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onOpen,
  onMutated,
  onContextMenu,
  onDragExternal,
  onDropExternal,
  externalSelection,
  onExternalFileClick,
  onPointerDragStart,
  shouldSuppressClick,
  externalDropTarget,
  isTreeRoot = false,
  scope,
}: {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onMutated: () => void;
  onContextMenu: (node: FileTreeNode, path: string, event: MouseEvent) => void;
  onDragExternal?: (node: FileTreeNode, path: string) => void;
  onDropExternal?: (directory: string, fallbackPayload?: string) => void;
  externalSelection?: Set<string>;
  onExternalFileClick?: (
    node: FileTreeNode,
    path: string,
    event: MouseEvent,
  ) => void;
  onPointerDragStart?: (
    node: FileTreeNode,
    path: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  shouldSuppressClick?: () => boolean;
  externalDropTarget?: string | null;
  isTreeRoot?: boolean;
  scope: TreeMode;
}) {
  const expansionKey = `${scope}:${node.path}`;
  const isOpen = expanded.has(expansionKey);
  const protectedWorkspaceRoot =
    (scope === "workspace" && isProtectedWorkspaceRoot(node, depth)) ||
    isTreeRoot;
  const scopedPath = (path: string) => scopedTreePath(scope, path);
  const mutate = async (kind: "file" | "folder" | "rename" | "delete") => {
    try {
      if (kind === "file") {
        const name = prompt("New file name", "untitled.md")?.trim();
        if (name) {
          await writeFile(
            scopedPath(
              joinPath(node.isDir ? node.path : parentPath(node.path), name),
            ),
            "",
          );
        }
      } else if (kind === "folder") {
        const name = prompt("New folder name")?.trim();
        if (name) {
          await createDirectory(
            scopedPath(
              joinPath(node.isDir ? node.path : parentPath(node.path), name),
            ),
          );
        }
      } else if (kind === "rename") {
        const nextName = prompt("Rename", node.name)?.trim();
        if (nextName && nextName !== node.name) {
          await renameFile(
            scopedPath(node.path),
            scopedPath(joinPath(parentPath(node.path), nextName)),
          );
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
      <div
        className={`file-tree-row ${scope === "files" ? "external" : ""} ${
          scope === "files" && externalSelection?.has(scopedPath(node.path))
            ? "selected"
            : ""
        } ${
          scope === "workspace" && node.isDir &&
            externalDropTarget === node.path
            ? "external-drop-target"
            : ""
        }`}
        data-workspace-drop={scope === "workspace" && node.isDir
          ? node.path
          : undefined}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={false}
        onPointerDown={(event) => {
          if (scope === "files") {
            onPointerDragStart?.(
              node,
              scopedPath(node.path),
              event,
            );
          }
        }}
        onDragStart={(event) => {
          const path = scopedPath(node.path);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", path);
          event.dataTransfer.setData(
            "application/x-gemihub-tree-item",
            JSON.stringify({ path, name: node.name, isDir: node.isDir }),
          );
          onDragExternal?.(node, path);
        }}
        onDragEnd={() => {
          window.setTimeout(() => onDragExternal?.(node, ""), 120);
        }}
        onDragOver={(event) => {
          if (scope === "workspace" && node.isDir && onDropExternal) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          if (scope === "workspace" && node.isDir && onDropExternal) {
            event.preventDefault();
            event.stopPropagation();
            onDropExternal(
              node.path,
              event.dataTransfer.getData("application/x-gemihub-tree-item"),
            );
          }
        }}
        onContextMenu={(event) => {
          if (!isTreeRoot) onContextMenu(node, scopedPath(node.path), event);
        }}
      >
        <button
          type="button"
          draggable={false}
          className="file-tree-entry"
          onClick={(event) => {
            if (scope === "files" && shouldSuppressClick?.()) return;
            node.isDir
              ? onToggle(node.path)
              : scope === "files" && onExternalFileClick
              ? onExternalFileClick(node, scopedPath(node.path), event)
              : onOpen(scopedPath(node.path));
          }}
          title={node.path}
        >
          <span className="file-tree-chevron">
            {node.isDir
              ? (isOpen
                ? <ChevronDown size={14} />
                : <ChevronRight size={14} />)
              : null}
          </span>
          {node.isDir
            ? (isOpen ? <FolderOpen size={15} /> : <Folder size={15} />)
            : <File size={15} />}
          <span>{node.name}</span>
        </button>
        <div className="file-tree-row-actions">
          {node.isDir && !isTreeRoot && (
            <button
              type="button"
              onClick={() => void mutate("file")}
              title="New file"
            >
              <FilePlus2 size={13} />
            </button>
          )}
          {node.isDir && !isTreeRoot && (
            <button
              type="button"
              onClick={() => void mutate("folder")}
              title="New folder"
            >
              <FolderPlus size={13} />
            </button>
          )}
          {!protectedWorkspaceRoot && (
            <button
              type="button"
              onClick={() => void mutate("rename")}
              title="Rename"
            >
              <Pencil size={13} />
            </button>
          )}
          {!protectedWorkspaceRoot && (
            <button
              type="button"
              onClick={() => void mutate("delete")}
              title="Delete"
            >
              <X size={13} />
            </button>
          )}
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
          onDragExternal={onDragExternal}
          onDropExternal={onDropExternal}
          externalSelection={externalSelection}
          onExternalFileClick={onExternalFileClick}
          onPointerDragStart={onPointerDragStart}
          shouldSuppressClick={shouldSuppressClick}
          externalDropTarget={externalDropTarget}
          scope={scope}
        />
      ))}
    </>
  );
}

export function FileTree({
  directoryBase,
  workspacePath,
  onOpenFile,
  onDirectoryBaseUnavailable,
  onCollapse,
}: {
  directoryBase: string;
  workspacePath: string;
  onOpenFile: (path: string) => void;
  onDirectoryBaseUnavailable: () => void;
  onCollapse: () => void;
}) {
  const [nodes, setNodes] = useState<FileTreeNode[]>([]);
  const [workspaceNodes, setWorkspaceNodes] = useState<FileTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    new Set(["files:."])
  );
  const [query, setQuery] = useState("");
  const [contentResults, setContentResults] = useState<FileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [externalSelection, setExternalSelection] = useState<Set<string>>(
    new Set(),
  );
  const [lastSelectedExternal, setLastSelectedExternal] = useState("");
  const [draggedExternal, setDraggedExternal] = useState<
    Array<{ node: FileTreeNode; path: string }>
  >([]);
  const [externalDropTarget, setExternalDropTarget] = useState<string | null>(
    null,
  );
  const draggedExternalRef = useRef<
    Array<{ node: FileTreeNode; path: string }>
  >([]);
  const pointerDragRef = useRef<
    {
      node: FileTreeNode;
      path: string;
      pointerId: number;
      startX: number;
      startY: number;
      active: boolean;
    } | null
  >(null);
  const suppressExternalClickUntilRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<
    { node: FileTreeNode; path: string; x: number; y: number } | null
  >(null);
  const [encryptedModalPath, setEncryptedModalPath] = useState("");
  const [historyDialog, setHistoryDialog] = useState<
    { path: string; entries: FileHistoryEntry[] } | null
  >(null);
  const [trashDialog, setTrashDialog] = useState<TrashEntry[] | null>(null);
  const [workspaceMove, setWorkspaceMove] = useState<
    {
      items: Array<{ path: string; name: string; isDir: boolean }>;
      destination: string;
      leaveLink: boolean;
      busy: boolean;
      error: string;
    } | null
  >(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (directoryBase) {
        try {
          await setDirectoryBase(directoryBase);
          setNodes(await listFileTree());
        } catch {
          setNodes([]);
          onDirectoryBaseUnavailable();
        }
      } else setNodes([]);
      try {
        setWorkspaceNodes(await listWorkspaceTree());
      } catch {
        setWorkspaceNodes([]);
      }
    } finally {
      setLoading(false);
    }
  }, [directoryBase, onDirectoryBaseUnavailable, workspacePath]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const dispose = onWailsFileDrop((x, y, paths) => {
      const target = document.elementFromPoint(x, y)?.closest<HTMLElement>(
        "[data-workspace-drop]",
      );
      if (!target || !paths.length) return;
      const destination = target.dataset.workspaceDrop || "";
      void (async () => {
        const errors: string[] = [];
        for (const path of paths) {
          const name = path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
          if (!name) continue;
          try {
            await copyLocalPathIntoWorkspace(path, destination, name);
          } catch (error) {
            errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        await reload();
        window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
        if (errors.length) alert(errors.join("\n"));
      })();
    });
    return () => dispose?.();
  }, [reload]);
  useEffect(() => {
    setExternalSelection(new Set());
  }, [directoryBase]);
  useEffect(() => {
    const listener = () => void reload();
    window.addEventListener("llm-hub:file-tree-refresh", listener);
    return () =>
      window.removeEventListener("llm-hub:file-tree-refresh", listener);
  }, [reload]);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized || !workspacePath) {
      setContentResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchWorkspaceFiles(normalized, 30).then(setContentResults).catch(
        () => setContentResults([]),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [workspacePath, query]);

  const filtered = useMemo(() => visibleTree(workspaceNodes, query), [
    workspaceNodes,
    query,
  ]);
  const externalFiltered = useMemo(() => visibleTree(nodes, query), [
    nodes,
    query,
  ]);
  const visibleExternalFilePaths = useMemo(
    () => treeFilePaths(externalFiltered, expanded),
    [expanded, externalFiltered],
  );
  const visibleContentResults = contentResults;
  const rootName = directoryBase.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ||
    directoryBase;
  const showExternal = !!directoryBase && !!workspacePath &&
    !isSameOrNestedPath(directoryBase, workspacePath) &&
    !isSameOrNestedPath(workspacePath, directoryBase);

  const beginExternalMove = (node: FileTreeNode, path: string) => {
    if (!path) {
      draggedExternalRef.current = [];
      setDraggedExternal([]);
      setExternalDropTarget(null);
      return;
    }
    let items: Array<{ node: FileTreeNode; path: string }>;
    if (!node.isDir && externalSelection.has(path)) {
      items = Array.from(externalSelection).map((selectedPath) => {
        const relative = selectedPath.replace(/^workspace:\/\//, "");
        const name = relative.split("/").pop() || relative;
        return {
          node: { name, path: relative, isDir: false, size: 0, modTime: 0 },
          path: selectedPath,
        };
      });
    } else items = [{ node, path }];
    draggedExternalRef.current = items;
    setDraggedExternal(items);
  };
  const requestExternalDrop = (destination: string, fallbackPayload = "") => {
    let items = draggedExternalRef.current;
    if (!items.length && fallbackPayload) {
      try {
        const parsed = JSON.parse(fallbackPayload) as {
          path?: string;
          name?: string;
          isDir?: boolean;
        };
        if (parsed.path && parsed.name) {
          items = [{
            path: parsed.path,
            node: {
              path: parsed.path.replace(/^workspace:\/\//, ""),
              name: parsed.name,
              isDir: parsed.isDir === true,
              size: 0,
              modTime: 0,
            },
          }];
        }
      } catch { /* Ignore invalid native drag payloads. */ }
    }
    if (!items.length) return;
    setWorkspaceMove({
      items: items.map(({ node, path }) => ({
        path,
        name: node.name,
        isDir: node.isDir,
      })),
      destination,
      leaveLink: false,
      busy: false,
      error: "",
    });
    draggedExternalRef.current = [];
    setDraggedExternal([]);
    setExternalDropTarget(null);
  };
  useEffect(() => {
    const dragOver = (event: DragEvent) => {
      if (!draggedExternalRef.current.length) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-workspace-drop]")
        : null;
      if (!target) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };
    const dragEnter = (event: DragEvent) => {
      if (!draggedExternalRef.current.length) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-workspace-drop]")
        : null;
      if (target) {
        setExternalDropTarget(target.dataset.workspaceDrop || "");
      } else setExternalDropTarget(null);
    };
    const drop = (event: DragEvent) => {
      if (!draggedExternalRef.current.length) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-workspace-drop]")
        : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      requestExternalDrop(
        target.dataset.workspaceDrop || "",
        event.dataTransfer?.getData("application/x-gemihub-tree-item") || "",
      );
    };
    document.addEventListener("dragover", dragOver, true);
    document.addEventListener("dragenter", dragEnter, true);
    document.addEventListener("drop", drop, true);
    return () => {
      document.removeEventListener("dragover", dragOver, true);
      document.removeEventListener("dragenter", dragEnter, true);
      document.removeEventListener("drop", drop, true);
    };
  });
  const selectExternalFile = (
    node: FileTreeNode,
    path: string,
    event: MouseEvent,
  ) => {
    if (event.ctrlKey || event.metaKey) {
      setExternalSelection((current) => {
        const next = new Set(current);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      setLastSelectedExternal(path);
      return;
    }
    if (event.shiftKey && lastSelectedExternal) {
      const start = visibleExternalFilePaths.indexOf(lastSelectedExternal);
      const end = visibleExternalFilePaths.indexOf(path);
      if (start >= 0 && end >= 0) {
        setExternalSelection(
          new Set(
            visibleExternalFilePaths.slice(
              Math.min(start, end),
              Math.max(start, end) + 1,
            ),
          ),
        );
      }
      return;
    }
    setExternalSelection(new Set([path]));
    setLastSelectedExternal(path);
    openTreeFile(path);
  };
  const startPointerDrag = (
    node: FileTreeNode,
    path: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0 || !event.isPrimary) return;
    pointerDragRef.current = {
      node,
      path,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (
        !drag.active &&
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >=
          6
      ) {
        drag.active = true;
        suppressExternalClickUntilRef.current = Date.now() + 300;
        beginExternalMove(drag.node, drag.path);
      }
      if (!drag.active) return;
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-workspace-drop]");
      const destination = target?.dataset.workspaceDrop ?? "";
      setExternalDropTarget(target ? destination : null);
    };
    const finish = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      pointerDragRef.current = null;
      if (!drag.active) return;
      suppressExternalClickUntilRef.current = Date.now() + 300;
      const target = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-workspace-drop]");
      if (!target) {
        draggedExternalRef.current = [];
        setDraggedExternal([]);
        setExternalDropTarget(null);
        return;
      }
      const destination = target.dataset.workspaceDrop || "";
      requestExternalDrop(destination);
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", finish, true);
    return () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", finish, true);
    };
  });

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  const openTreeFile = (path: string) => {
    if (path.toLowerCase().endsWith(".encrypted")) {
      setEncryptedModalPath(path);
      return;
    }
    if (dashboardPluginWidgetForPath(path)) {
      onOpenFile(path);
      return;
    }
    void readFile(path).then((file) => {
      if (file && isEncryptedFile(file.content)) setEncryptedModalPath(path);
      else onOpenFile(path);
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
  const showHistory = async () => {
    const selected = contextMenu;
    if (!selected) return;
    setContextMenu(null);
    setHistoryDialog({
      path: selected.path,
      entries: await listFileHistory(selected.path),
    });
  };
  const duplicateFromMenu = async () => {
    const selected = contextMenu;
    if (!selected) return;
    setContextMenu(null);
    await duplicateFile(selected.path);
    await reload();
  };
  const trashFromMenu = async () => {
    const selected = contextMenu;
    if (!selected) return;
    setContextMenu(null);
    if (confirm(`Move ${selected.node.path} to Trash?`)) {
      await trashFile(selected.path);
      await reload();
    }
  };
  const openContainingFolderFromMenu = async () => {
    const selected = contextMenu;
    if (!selected) return;
    setContextMenu(null);
    try {
      await openContainingFolder(selected.path);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };
  const moveIntoWorkspaceFromMenu = () => {
    const selected = contextMenu;
    setContextMenu(null);
    if (!selected || !selected.path.startsWith("files://")) return;
    setWorkspaceMove({
      items: [{
        path: selected.path,
        name: selected.node.name,
        isDir: selected.node.isDir,
      }],
      destination: "",
      leaveLink: false,
      busy: false,
      error: "",
    });
  };
  const confirmWorkspaceMove = async () => {
    if (!workspaceMove || workspaceMove.busy) return;
    const names = workspaceMove.items.map((item) =>
      item.name.toLocaleLowerCase()
    );
    if (new Set(names).size !== names.length) {
      setWorkspaceMove({
        ...workspaceMove,
        error:
          "同名のファイルが含まれているため、まとめて同じ移動先へ移動できません。",
      });
      return;
    }
    setWorkspaceMove({ ...workspaceMove, busy: true, error: "" });
    try {
      window.dispatchEvent(new Event("llm-hub:release-dashboard-files"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.setTimeout(resolve, 50))
        )
      );
      for (const [index, item] of workspaceMove.items.entries()) {
        await movePathIntoWorkspace(
          item.path,
          workspaceMove.destination,
          item.name,
          workspaceMove.leaveLink && item.isDir,
        );
        if (index % 10 === 9) {
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
      const moved = new Set(
        workspaceMove.items.map((item) =>
          item.path.replace(/^files:\/\//, "").replace(/^\.\//, "")
        ),
      );
      const withoutMoved = (items: FileTreeNode[]): FileTreeNode[] =>
        items
          .filter((item) => !moved.has(item.path))
          .map((item) =>
            item.children
              ? { ...item, children: withoutMoved(item.children) }
              : item
          );
      setNodes((current) => withoutMoved(current));
      setWorkspaceMove(null);
      setExternalSelection(new Set());
      await reload();
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
    } catch (error) {
      setWorkspaceMove((current) =>
        current
          ? {
            ...current,
            busy: false,
            error: error instanceof Error ? error.message : String(error),
          }
          : null
      );
    }
  };

  const createAtRoot = async (kind: "file" | "folder") => {
    const name = prompt(
      kind === "file" ? "New file name" : "New folder name",
      kind === "file" ? "untitled.md" : "folder",
    )?.trim();
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
        <button
          type="button"
          className="workspace-directory-open"
          title="Open Workspace in Explorer"
          aria-label="Open Workspace in Explorer"
          onClick={() =>
            void openContainingFolder("workspace://.").catch((error) =>
              alert(error instanceof Error ? error.message : String(error))
            )}
        >
          <FolderOpen size={16} />
        </button>
        <strong className="file-tree-title" title={workspacePath}>
          Workspace
        </strong>
        {workspacePath && (
          <>
            <button
              type="button"
              onClick={() => void createAtRoot("file")}
              title="New file"
            >
              <FilePlus2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => void createAtRoot("folder")}
              title="New folder"
            >
              <FolderPlus size={15} />
            </button>
            <button
              type="button"
              onClick={() => void listTrash().then(setTrashDialog)}
              title="Trash"
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
        <button
          type="button"
          className="file-tree-refresh"
          onClick={() => void reload()}
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </button>
        <button
          type="button"
          className="file-tree-collapse"
          onClick={onCollapse}
          title="Collapse FileTree"
        >
          <ChevronsLeft size={16} />
        </button>
      </div>
      {workspacePath && (
        <>
          <label className="file-tree-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files"
            />
          </label>
          <div
            className={`file-tree-scroll ${
              draggedExternal.length ? "accept-external-drop" : ""
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              requestExternalDrop(
                "",
                event.dataTransfer.getData("application/x-gemihub-tree-item"),
              );
            }}
          >
            <section
              className="file-tree-block workspace-block"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                requestExternalDrop(
                  "",
                  event.dataTransfer.getData("application/x-gemihub-tree-item"),
                );
              }}
            >
              {filtered.map((node) => (
                <TreeRow
                  key={node.path}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  onToggle={(path) =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      const key = `workspace:${path}`;
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })}
                  onOpen={openTreeFile}
                  onMutated={() => void reload()}
                  onDropExternal={requestExternalDrop}
                  externalDropTarget={externalDropTarget}
                  onContextMenu={(node, path, event) => {
                    event.preventDefault();
                    setContextMenu({
                      node,
                      path,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  scope="workspace"
                />
              ))}
              {filtered.length === 0 && (
                <div className="file-tree-workspace-empty">
                  Workspace is empty.
                </div>
              )}
              <div
                className={`workspace-tree-drop-zone ${
                  draggedExternal.length ? "active" : ""
                } ${externalDropTarget === "" ? "external-drop-target" : ""}`}
                data-workspace-drop=""
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  requestExternalDrop(
                    "",
                    event.dataTransfer.getData(
                      "application/x-gemihub-tree-item",
                    ),
                  );
                }}
              >
                {draggedExternal.length ? "Workspace直下へ移動" : ""}
              </div>
            </section>
            {query.trim() && visibleContentResults.some((item) =>
              item.preview
            ) && (
              <section className="file-tree-content-results">
                <strong>Content</strong>
                {visibleContentResults.filter((item) => item.preview).map((
                  item,
                ) => (
                  <button
                    key={`${item.path}:${item.line}`}
                    type="button"
                    onClick={() =>
                      openTreeFile(scopedTreePath("workspace", item.path))}
                  >
                    <span>{item.path}{item.line ? `:${item.line}` : ""}</span>
                    <small>{item.preview}</small>
                  </button>
                ))}
              </section>
            )}
            {showExternal && (
              <section className="file-tree-block external-block">
                <header>
                  <span>Workspace外</span>
                  <small>Ctrl/Cmd・Shiftで複数選択</small>
                </header>
                <TreeRow
                  key={directoryBase}
                  node={{
                    name: rootName,
                    path: ".",
                    isDir: true,
                    size: 0,
                    modTime: 0,
                    children: externalFiltered,
                  }}
                  depth={0}
                  expanded={expanded}
                  onToggle={(path) =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      const key = `files:${path}`;
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })}
                  onOpen={openTreeFile}
                  onMutated={() => void reload()}
                  onDragExternal={beginExternalMove}
                  externalSelection={externalSelection}
                  onExternalFileClick={selectExternalFile}
                  onPointerDragStart={startPointerDrag}
                  shouldSuppressClick={() =>
                    Date.now() < suppressExternalClickUntilRef.current}
                  onContextMenu={(node, path, event) => {
                    event.preventDefault();
                    setContextMenu({
                      node,
                      path,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  isTreeRoot
                  scope="files"
                />
              </section>
            )}
          </div>
        </>
      )}
      {contextMenu && (
        <div
          className="file-tree-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => void openContainingFolderFromMenu()}
          >
            <FolderSearch size={14} />Open in Explorer
          </button>
          {contextMenu.path.startsWith("files://") && (
            <button type="button" onClick={moveIntoWorkspaceFromMenu}>
              <FolderOpen size={14} />Move into Workspace…
            </button>
          )}
          {!contextMenu.node.isDir && (
            <>
              {contextMenu.path.toLowerCase().endsWith(".encrypted")
                ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEncryptedModalPath(contextMenu.path);
                      setContextMenu(null);
                    }}
                  >
                    <LockKeyhole size={14} />暗号化ファイルを開く
                  </button>
                )
                : (
                  <button type="button" onClick={() => void encryptFromMenu()}>
                    <LockKeyhole size={14} />ファイルを暗号化
                  </button>
                )}
              <button type="button" onClick={() => void duplicateFromMenu()}>
                <Copy size={14} />Duplicate
              </button>
              <button type="button" onClick={() => void showHistory()}>
                <History size={14} />History
              </button>
            </>
          )}
          <button type="button" onClick={() => void trashFromMenu()}>
            <Trash2 size={14} />Move to Trash
          </button>
        </div>
      )}
      {encryptedModalPath && (
        <EncryptedFileModal
          path={encryptedModalPath}
          onClose={() => setEncryptedModalPath("")}
          onChanged={() => void reload()}
        />
      )}
      {historyDialog && (
        <div className="encrypted-file-modal-backdrop">
          <section className="file-lifecycle-dialog">
            <header>
              <strong>History · {historyDialog.path}</strong>
              <button onClick={() => setHistoryDialog(null)}>
                <X size={15} />
              </button>
            </header>
            <div>
              {historyDialog.entries.length === 0
                ? <p>No saved versions.</p>
                : historyDialog.entries.map((entry) => (
                  <article key={entry.id}>
                    <span>
                      {new Date(entry.timestamp).toLocaleString()} ·{" "}
                      {entry.size.toLocaleString()} bytes
                    </span>
                    <button
                      onClick={() =>
                        void restoreFileHistory(historyDialog.path, entry.id)
                          .then(async () => {
                            await reload();
                            setHistoryDialog(null);
                          })}
                    >
                      <RotateCcw size={13} />Restore
                    </button>
                  </article>
                ))}
            </div>
          </section>
        </div>
      )}
      {trashDialog && (
        <div className="encrypted-file-modal-backdrop">
          <section className="file-lifecycle-dialog">
            <header>
              <strong>Trash</strong>
              <button onClick={() => setTrashDialog(null)}>
                <X size={15} />
              </button>
            </header>
            <div>
              {trashDialog.length === 0
                ? <p>Trash is empty.</p>
                : trashDialog.map((entry) => (
                  <article key={entry.id}>
                    <span>
                      {entry.originalPath}
                      <small>
                        {new Date(entry.deletedAt).toLocaleString()}
                      </small>
                    </span>
                    <button
                      onClick={() =>
                        void restoreTrash(entry.id).then(async () => {
                          await reload();
                          setTrashDialog(await listTrash());
                        })}
                    >
                      <RotateCcw size={13} />Restore
                    </button>
                  </article>
                ))}
            </div>
          </section>
        </div>
      )}
      {workspaceMove && (
        <div className="encrypted-file-modal-backdrop">
          <section className="workspace-move-dialog">
            <header>
              <strong>Workspaceへ移動</strong>
              <button
                type="button"
                disabled={workspaceMove.busy}
                onClick={() => setWorkspaceMove(null)}
              >
                <X size={15} />
              </button>
            </header>
            <div>
              <div className="workspace-move-warning">
                {workspaceMove.items.length === 1
                  ? workspaceMove.items[0].name
                  : `${workspaceMove.items.length}個のファイル`}を別ディレクトリへ移動します。よろしいですか？
              </div>
              <label>
                <span>移動元</span>
                <div className="workspace-move-sources">
                  {workspaceMove.items.map((item) => (
                    <small key={item.path}>
                      {item.path.replace(/^files:\/\//, "")}
                    </small>
                  ))}
                </div>
              </label>
              <label>
                <span>移動先</span>
                <input
                  value={workspaceMove.destination
                    ? `Workspace/${workspaceMove.destination}`
                    : "Workspace/"}
                  disabled
                />
              </label>
              {workspaceMove.items.length === 1 &&
                workspaceMove.items[0].isDir && (
                <>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={workspaceMove.leaveLink}
                      disabled={workspaceMove.busy}
                      onChange={(event) =>
                        setWorkspaceMove({
                          ...workspaceMove,
                          leaveLink: event.target.checked,
                        })}
                    />
                    <span>元の場所にリンクを残す</span>
                  </label>
                  <small>
                    {navigator.platform.toLowerCase().includes("win")
                      ? "WindowsのディレクトリJunctionを作成します。"
                      : "シンボリックリンクを作成します。"}
                  </small>
                </>
              )}
              {workspaceMove.error && (
                <div className="settings-status">{workspaceMove.error}</div>
              )}
            </div>
            <footer>
              <button
                type="button"
                disabled={workspaceMove.busy}
                onClick={() => setWorkspaceMove(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="primary"
                disabled={workspaceMove.busy}
                onClick={() => void confirmWorkspaceMove()}
              >
                {workspaceMove.busy ? "移動中…" : "移動する"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </aside>
  );
}
