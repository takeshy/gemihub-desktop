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
import { useI18n } from "../i18n/context";
import { encryptWorkspaceFile } from "../lib/fileEncryption";
import { isEncryptedFile } from "../lib/hybridEncryption";
import {
  type FileTreeScope,
  isProtectedWorkspaceRoot,
} from "../lib/fileTreePaths";
import {
  createDirectoryRef,
  duplicateFileRef,
  type FileRef,
  fileRef,
  fileRefFromBackendPath,
  listFileHistoryRef,
  openContainingFolderRef,
  readFileRef,
  renameFileRef,
  restoreFileHistoryRef,
  trashFileRef,
  writeFileRef,
} from "../lib/fileRef";
import { dashboardPluginWidgetForPath } from "../dashboard/widgetRegistry";
import {
  createDirectory,
  duplicateFile,
  type FileHistoryEntry,
  type FileSearchResult,
  type FileTreeNode,
  inspectLocalPath,
  listFileHistory,
  listFileTree,
  listTrash,
  listWorkspaceTree,
  moveLocalPathIntoWorkspace,
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
      : [node.path]
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onOpen,
  onCreateFile,
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
  onOpen: (file: FileRef) => void;
  onCreateFile: (directory: string) => void;
  onMutated: () => void;
  onContextMenu: (node: FileTreeNode, file: FileRef, event: MouseEvent) => void;
  onDragExternal?: (node: FileTreeNode, file: FileRef | null) => void;
  onDropExternal?: (directory: string, fallbackPayload?: string) => void;
  externalSelection?: Set<string>;
  onExternalFileClick?: (
    node: FileTreeNode,
    file: FileRef,
    event: MouseEvent,
  ) => void;
  onPointerDragStart?: (
    node: FileTreeNode,
    file: FileRef,
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
  const ref = (path: string) => fileRef(scope, path);
  const mutate = async (kind: "file" | "folder" | "rename" | "delete") => {
    try {
      if (kind === "file") {
        onCreateFile(node.isDir ? node.path : parentPath(node.path));
        return;
      } else if (kind === "folder") {
        const name = prompt("New folder name")?.trim();
        if (name) {
          await createDirectoryRef(ref(
            joinPath(node.isDir ? node.path : parentPath(node.path), name),
          ));
        }
      } else if (kind === "rename") {
        const nextName = prompt("Rename", node.name)?.trim();
        if (nextName && nextName !== node.name) {
          await renameFileRef(
            ref(node.path),
            ref(joinPath(parentPath(node.path), nextName)),
          );
        }
      } else if (confirm(`Move ${node.path} to Trash?`)) {
        await trashFileRef(ref(node.path));
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
          scope === "files" && externalSelection?.has(node.path)
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
              ref(node.path),
              event,
            );
          }
        }}
        onDragStart={(event) => {
          const file = ref(node.path);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", file.path);
          event.dataTransfer.setData(
            "application/x-gemihub-tree-item",
            JSON.stringify({ file, name: node.name, isDir: node.isDir }),
          );
          onDragExternal?.(node, file);
        }}
        onDragEnd={() => {
          window.setTimeout(() => onDragExternal?.(node, null), 120);
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
          if (!isTreeRoot) onContextMenu(node, ref(node.path), event);
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
              ? onExternalFileClick(node, ref(node.path), event)
              : onOpen(ref(node.path));
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
          onCreateFile={onCreateFile}
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
  onOpenFile: (file: FileRef, created?: boolean) => void;
  onDirectoryBaseUnavailable: () => void;
  onCollapse: () => void;
}) {
  const { t: tr } = useI18n();
  const [nodes, setNodes] = useState<FileTreeNode[]>([]);
  const [workspaceNodes, setWorkspaceNodes] = useState<FileTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    new Set(["files:."])
  );
  const [query, setQuery] = useState("");
  const [createFileDialog, setCreateFileDialog] = useState<
    {
      directory: string;
      name: string;
      extension: string;
      customExtension: string;
    } | null
  >(null);
  const [contentResults, setContentResults] = useState<FileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [externalSelection, setExternalSelection] = useState<Set<string>>(
    new Set(),
  );
  const [lastSelectedExternal, setLastSelectedExternal] = useState("");
  const [draggedExternal, setDraggedExternal] = useState<
    Array<{ node: FileTreeNode; file: FileRef }>
  >([]);
  const [externalDropTarget, setExternalDropTarget] = useState<string | null>(
    null,
  );
  const draggedExternalRef = useRef<
    Array<{ node: FileTreeNode; file: FileRef }>
  >([]);
  const pointerDragRef = useRef<
    {
      node: FileTreeNode;
      file: FileRef;
      pointerId: number;
      startX: number;
      startY: number;
      active: boolean;
    } | null
  >(null);
  const suppressExternalClickUntilRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<
    { node: FileTreeNode; file: FileRef; x: number; y: number } | null
  >(null);
  const [encryptedModalFile, setEncryptedModalFile] = useState<FileRef | null>(
    null,
  );
  const [historyDialog, setHistoryDialog] = useState<
    { file: FileRef; entries: FileHistoryEntry[] } | null
  >(null);
  const [trashDialog, setTrashDialog] = useState<TrashEntry[] | null>(null);
  const [workspaceMove, setWorkspaceMove] = useState<
    {
      items: Array<{ path: string; name: string; isDir: boolean }>;
      destination: string;
      leaveLink: boolean;
      source: "files" | "local";
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
      if (!paths.length) return;
      const target = document.elementFromPoint(x, y)?.closest<HTMLElement>(
        "[data-workspace-drop]",
      );
      const destination = target?.dataset.workspaceDrop || "";
      void (async () => {
        const items: Array<{ path: string; name: string; isDir: boolean }> = [];
        for (const path of paths) {
          try {
            const info = await inspectLocalPath(path);
            if (info) {
              items.push({
                path: info.path,
                name: info.name,
                isDir: info.isDirectory,
              });
            }
          } catch { /* Invalid dropped paths are ignored. */ }
        }
        if (!items.length) return;
        setWorkspaceMove({
          items,
          destination,
          leaveLink: false,
          source: "local",
          busy: false,
          error: "",
        });
      })();
    });
    return () => dispose?.();
  }, []);
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

  const beginExternalMove = (node: FileTreeNode, file: FileRef | null) => {
    if (!file) {
      draggedExternalRef.current = [];
      setDraggedExternal([]);
      setExternalDropTarget(null);
      return;
    }
    let items: Array<{ node: FileTreeNode; file: FileRef }>;
    if (!node.isDir && externalSelection.has(file.path)) {
      items = Array.from(externalSelection).map((selectedPath) => {
        const name = selectedPath.split("/").pop() || selectedPath;
        return {
          node: { name, path: selectedPath, isDir: false, size: 0, modTime: 0 },
          file: fileRef("files", selectedPath),
        };
      });
    } else items = [{ node, file }];
    draggedExternalRef.current = items;
    setDraggedExternal(items);
  };
  const requestExternalDrop = (destination: string, fallbackPayload = "") => {
    let items = draggedExternalRef.current;
    if (!items.length && fallbackPayload) {
      try {
        const parsed = JSON.parse(fallbackPayload) as {
          file?: FileRef;
          name?: string;
          isDir?: boolean;
        };
        if (parsed.file && parsed.name) {
          items = [{
            file: parsed.file,
            node: {
              path: parsed.file.path,
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
      items: items.map(({ node, file }) => ({
        path: file.path,
        name: node.name,
        isDir: node.isDir,
      })),
      destination,
      leaveLink: false,
      source: "files",
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
    file: FileRef,
    event: MouseEvent,
  ) => {
    const path = file.path;
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
    openTreeFile(file);
  };
  const startPointerDrag = (
    node: FileTreeNode,
    file: FileRef,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0 || !event.isPrimary) return;
    pointerDragRef.current = {
      node,
      file,
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
        beginExternalMove(drag.node, drag.file);
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

  const openTreeFile = (file: FileRef) => {
    if (file.path.toLowerCase().endsWith(".encrypted")) {
      setEncryptedModalFile(file);
      return;
    }
    if (dashboardPluginWidgetForPath(file.path)) {
      onOpenFile(file);
      return;
    }
    void readFileRef(file).then((result) => {
      if (result && isEncryptedFile(result.content)) {
        setEncryptedModalFile(file);
      } else onOpenFile(file);
    }).catch(() => onOpenFile(file));
  };

  const encryptFromMenu = async () => {
    const selected = contextMenu;
    setContextMenu(null);
    if (!selected || selected.node.isDir) return;
    const password = prompt(tr("files.encryptPassword")) || "";
    if (!password) return;
    try {
      await encryptWorkspaceFile(selected.file, password);
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
      file: selected.file,
      entries: await listFileHistoryRef(selected.file),
    });
  };
  const duplicateFromMenu = async () => {
    const selected = contextMenu;
    if (!selected) return;
    setContextMenu(null);
    await duplicateFileRef(selected.file);
    await reload();
  };
  const trashFromMenu = async () => {
    const selected = contextMenu;
    if (!selected) return;
    setContextMenu(null);
    if (confirm(`Move ${selected.node.path} to Trash?`)) {
      await trashFileRef(selected.file);
      await reload();
    }
  };
  const openContainingFolderFromMenu = async () => {
    const selected = contextMenu;
    if (!selected) return;
    setContextMenu(null);
    try {
      await openContainingFolderRef(selected.file);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };
  const moveIntoWorkspaceFromMenu = () => {
    const selected = contextMenu;
    setContextMenu(null);
    if (!selected || selected.file.scope !== "files") return;
    setWorkspaceMove({
      items: [{
        path: selected.file.path,
        name: selected.node.name,
        isDir: selected.node.isDir,
      }],
      destination: "",
      leaveLink: false,
      source: "files",
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
        error: tr("files.duplicateNames"),
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
        const move = workspaceMove.source === "local"
          ? moveLocalPathIntoWorkspace
          : movePathIntoWorkspace;
        await move(
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
        workspaceMove.source === "files"
          ? workspaceMove.items.map((item) =>
            fileRefFromBackendPath(item.path).path.replace(/^\.\//, "")
          )
          : [],
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
    if (kind === "file") {
      setCreateFileDialog({
        directory: "",
        name: "",
        extension: ".md",
        customExtension: "",
      });
      return;
    }
    const name = prompt(
      "New folder name",
      "folder",
    )?.trim();
    if (!name) return;
    try {
      await createDirectoryRef(fileRef("workspace", name));
      await reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const submitCreateFile = async () => {
    if (!createFileDialog) return;
    const baseName = createFileDialog.name.trim();
    const extension =
      (createFileDialog.extension === "custom"
        ? createFileDialog.customExtension
        : createFileDialog.extension).trim();
    if (!baseName || !extension) return;
    const normalizedExtension = extension.startsWith(".")
      ? extension
      : `.${extension}`;
    const name =
      baseName.toLowerCase().endsWith(normalizedExtension.toLowerCase())
        ? baseName
        : `${baseName}${normalizedExtension}`;
    const file = fileRef(
      "workspace",
      joinPath(createFileDialog.directory, name),
    );
    try {
      await writeFileRef(file, "");
      setCreateFileDialog(null);
      await reload();
      onOpenFile(file, true);
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
            void openContainingFolderRef(fileRef("workspace", ".")).catch((
              error,
            ) => alert(error instanceof Error ? error.message : String(error)))}
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
                  onCreateFile={(directory) =>
                    setCreateFileDialog({
                      directory,
                      name: "",
                      extension: ".md",
                      customExtension: "",
                    })}
                  onMutated={() => void reload()}
                  onDropExternal={requestExternalDrop}
                  externalDropTarget={externalDropTarget}
                  onContextMenu={(node, file, event) => {
                    event.preventDefault();
                    setContextMenu({
                      node,
                      file,
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
                {draggedExternal.length ? tr("files.moveToRoot") : ""}
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
                      openTreeFile(fileRef("workspace", item.path))}
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
                  <span>{tr("files.workspaceExternal")}</span>
                  <small>{tr("files.multiSelectHint")}</small>
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
                  onCreateFile={() => undefined}
                  onMutated={() => void reload()}
                  onDragExternal={beginExternalMove}
                  externalSelection={externalSelection}
                  onExternalFileClick={selectExternalFile}
                  onPointerDragStart={startPointerDrag}
                  shouldSuppressClick={() =>
                    Date.now() < suppressExternalClickUntilRef.current}
                  onContextMenu={(node, file, event) => {
                    event.preventDefault();
                    setContextMenu({
                      node,
                      file,
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
          {contextMenu.file.scope === "files" && (
            <button type="button" onClick={moveIntoWorkspaceFromMenu}>
              <FolderOpen size={14} />Move into Workspace…
            </button>
          )}
          {!contextMenu.node.isDir && (
            <>
              {contextMenu.file.path.toLowerCase().endsWith(".encrypted")
                ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEncryptedModalFile(contextMenu.file);
                      setContextMenu(null);
                    }}
                  >
                    <LockKeyhole size={14} />
                    {tr("files.openEncrypted")}
                  </button>
                )
                : (
                  <button type="button" onClick={() => void encryptFromMenu()}>
                    <LockKeyhole size={14} />
                    {tr("files.encrypt")}
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
      {createFileDialog && (
        <div
          className="encrypted-file-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateFileDialog(null);
          }}
        >
          <section className="workspace-move-dialog create-file-dialog">
            <header>
              <strong>New file</strong>
              <button type="button" onClick={() => setCreateFileDialog(null)}>
                <X size={15} />
              </button>
            </header>
            <div>
              <label>
                <span>File name</span>
                <input
                  autoFocus
                  value={createFileDialog.name}
                  onChange={(event) =>
                    setCreateFileDialog({
                      ...createFileDialog,
                      name: event.target.value,
                    })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submitCreateFile();
                    if (event.key === "Escape") setCreateFileDialog(null);
                  }}
                />
              </label>
              <label>
                <span>Extension</span>
                <select
                  value={createFileDialog.extension}
                  onChange={(event) =>
                    setCreateFileDialog({
                      ...createFileDialog,
                      extension: event.target.value,
                    })}
                >
                  <option value=".md">.md</option>
                  <option value=".txt">.txt</option>
                  <option value=".yaml">.yaml</option>
                  <option value=".json">.json</option>
                  <option value=".html">.html</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {createFileDialog.extension === "custom" && (
                <label>
                  <span>Custom extension</span>
                  <input
                    value={createFileDialog.customExtension}
                    placeholder=".csv"
                    onChange={(event) =>
                      setCreateFileDialog({
                        ...createFileDialog,
                        customExtension: event.target.value,
                      })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitCreateFile();
                      if (event.key === "Escape") setCreateFileDialog(null);
                    }}
                  />
                </label>
              )}
            </div>
            <footer>
              <button type="button" onClick={() => setCreateFileDialog(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!createFileDialog.name.trim() ||
                  !(createFileDialog.extension === "custom"
                    ? createFileDialog.customExtension.trim()
                    : createFileDialog.extension)}
                onClick={() => void submitCreateFile()}
              >
                Create
              </button>
            </footer>
          </section>
        </div>
      )}
      {encryptedModalFile && (
        <EncryptedFileModal
          file={encryptedModalFile}
          onClose={() => setEncryptedModalFile(null)}
          onChanged={() => void reload()}
        />
      )}
      {historyDialog && (
        <div className="encrypted-file-modal-backdrop">
          <section className="file-lifecycle-dialog">
            <header>
              <strong>History · {historyDialog.file.path}</strong>
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
                        void restoreFileHistoryRef(historyDialog.file, entry.id)
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
              <strong>{tr("files.moveTitle")}</strong>
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
                  ? tr("files.moveConfirmOne").replace(
                    "{name}",
                    workspaceMove.items[0].name,
                  )
                  : tr("files.moveConfirmMany").replace(
                    "{count}",
                    String(workspaceMove.items.length),
                  )}
              </div>
              <label>
                <span>{tr("files.moveSource")}</span>
                <div className="workspace-move-sources">
                  {workspaceMove.items.map((item) => (
                    <small key={item.path}>
                      {fileRefFromBackendPath(item.path).path}
                    </small>
                  ))}
                </div>
              </label>
              <label>
                <span>{tr("files.moveDestination")}</span>
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
                    <span>{tr("files.leaveLink")}</span>
                  </label>
                  <small>
                    {navigator.platform.toLowerCase().includes("win")
                      ? tr("files.junctionHint")
                      : tr("files.symlinkHint")}
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
                {tr("common.cancel")}
              </button>
              <button
                type="button"
                className="primary"
                disabled={workspaceMove.busy}
                onClick={() => void confirmWorkspaceMove()}
              >
                {workspaceMove.busy
                  ? tr("files.moving")
                  : tr("files.moveAction")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </aside>
  );
}
