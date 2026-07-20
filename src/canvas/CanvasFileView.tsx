import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  BoxSelect,
  FileText,
  Focus,
  Link2,
  Maximize,
  MousePointer2,
  Palette,
  Plus,
  Redo2,
  StickyNote,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { useI18n } from "../i18n/context";
import { safeExternalUrl } from "../lib/sanitizeHtml";
import { readFile, readLocalFile } from "../lib/wailsBackend";
import { pathDirName } from "../lib/wikiLinks";
import {
  CANVAS_MIN_HEIGHT,
  CANVAS_MIN_WIDTH,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  type CanvasData,
  type CanvasEdge,
  canvasId,
  type CanvasNode,
  type CanvasNodeType,
  type CanvasSide,
  closestSide,
  edgeCurve,
  parseCanvas,
  serializeCanvas,
  sidePoint,
} from "./model";

type Mode = "view" | "edit" | "raw";
type Drag =
  | {
    kind: "pan";
    id: number;
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  }
  | {
    kind: "move";
    id: number;
    nodeId: string;
    worldX: number;
    worldY: number;
    x: number;
    y: number;
  }
  | {
    kind: "resize";
    id: number;
    nodeId: string;
    worldX: number;
    worldY: number;
    width: number;
    height: number;
  }
  | null;

const COLORS: Record<string, string> = {
  "": "#64748b",
  "1": "#ef4444",
  "2": "#f97316",
  "3": "#eab308",
  "4": "#22c55e",
  "5": "#06b6d4",
  "6": "#8b5cf6",
};
const SIDES: CanvasSide[] = ["top", "right", "bottom", "left"];

function clone(data: CanvasData): CanvasData {
  return {
    nodes: data.nodes.map((node) => ({ ...node })),
    edges: data.edges.map((edge) => ({ ...edge })),
  };
}

function resolveFilePath(canvasPath: string, target: string): string {
  if (/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(target)) return target;
  const base = pathDirName(canvasPath);
  const separator = base.includes("\\") ? "\\" : "/";
  return base
    ? `${base.replace(/[\\/]$/, "")}${separator}${target.replace(/^[\\/]/, "")}`
    : target;
}

function CanvasFileCard(
  { canvasPath, node, onOpen, isDark }: {
    canvasPath: string;
    node: CanvasNode;
    onOpen: (path: string) => void;
    isDark: boolean;
  },
) {
  const { t: tr } = useI18n();
  const path = resolveFilePath(canvasPath, node.file || "");
  const [state, setState] = useState<
    { loading: boolean; content: string; fileName: string; error: string }
  >({ loading: true, content: "", fileName: "", error: "" });
  useEffect(() => {
    let live = true;
    if (!node.file) {
      setState({
        loading: false,
        content: "",
        fileName: "",
        error: tr("canvas.fileMissing"),
      });
      return;
    }
    setState((value) => ({ ...value, loading: true, error: "" }));
    const load = /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path)
      ? readLocalFile(path)
      : readFile(path);
    void load.then((result) => {
      if (!live) return;
      setState({
        loading: false,
        content: result?.content || "",
        fileName: result?.fileName || node.file || "",
        error: result ? "" : tr("canvas.fileNotFound"),
      });
    }).catch(() =>
      live &&
      setState({
        loading: false,
        content: "",
        fileName: node.file || "",
        error: tr("canvas.fileReadFailed"),
      })
    );
    return () => {
      live = false;
    };
  }, [node.file, path]);
  const lower = state.fileName.toLowerCase();
  return (
    <button
      type="button"
      className="canvas-file-preview"
      onDoubleClick={(event) => {
        event.stopPropagation();
        onOpen(path);
      }}
      title={`${path}\n${tr("canvas.openHint")}`}
    >
      <div className="canvas-card-heading">
        <FileText size={15} />
        <span>{node.file || "File"}</span>
      </div>
      <div className="canvas-card-preview">
        {state.loading && (
          <span className="canvas-muted">{tr("common.loading")}</span>
        )}
        {state.error && <span className="canvas-error">{state.error}</span>}
        {!state.loading && !state.error &&
          /\.(?:png|jpe?g|gif|webp|svg)$/i.test(lower) && (
          <img src={state.content} alt={state.fileName} />
        )}
        {!state.loading && !state.error && /\.(?:md|markdown)$/i.test(lower) &&
          <MarkdownPreview content={state.content} isDark={isDark} />}
        {!state.loading && !state.error &&
          !/\.(?:png|jpe?g|gif|webp|svg|md|markdown)$/i.test(lower) && (
          <pre>{state.content.slice(0, 1200)}</pre>
        )}
      </div>
    </button>
  );
}

function nodeColor(node: CanvasNode): string {
  return node.color?.startsWith("#")
    ? node.color
    : COLORS[node.color || ""] || COLORS[""];
}

export function CanvasFileView(
  { content, path, onChange, onOpenPath, isDark }: {
    content: string;
    path: string;
    onChange: (content: string) => void;
    onOpenPath: (path: string) => void;
    isDark: boolean;
  },
) {
  const { t: tr } = useI18n();
  const parseMessages = useMemo(() => ({
    invalidShape: tr("canvas.invalidShape"),
    parseFailed: tr("canvas.parseFailed"),
  }), [tr]);
  const initial = useMemo(() => parseCanvas(content, parseMessages), [
    path,
    parseMessages,
  ]);
  const [data, setData] = useState<CanvasData>(initial.data);
  const [parseError, setParseError] = useState(initial.error);
  const [raw, setRaw] = useState(content);
  const [mode, setMode] = useState<Mode>("view");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<
    { nodeId: string; side: CanvasSide } | null
  >(null);
  const [pan, setPan] = useState({ x: 72, y: 72 });
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<CanvasData[]>([]);
  const redoRef = useRef<CanvasData[]>([]);
  const initializedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const parsed = parseCanvas(content, parseMessages);
    setData(parsed.data);
    setRaw(content);
    setParseError(parsed.error);
    setSelectedNode(null);
    setSelectedEdge(null);
    undoRef.current = [];
    redoRef.current = [];
    initializedRef.current = false;
  }, [path, parseMessages]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    const next = serializeCanvas(data);
    setRaw(next);
    setParseError("");
    onChangeRef.current(next);
  }, [data]);

  const worldPoint = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: (clientX - (rect?.left || 0) - pan.x) / zoom,
      y: (clientY - (rect?.top || 0) - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const commit = useCallback((change: (current: CanvasData) => CanvasData) => {
    setData((current) => {
      undoRef.current.push(clone(current));
      if (undoRef.current.length > 80) undoRef.current.shift();
      redoRef.current = [];
      return change(current);
    });
  }, []);

  const undo = useCallback(() => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    setData((current) => {
      redoRef.current.push(clone(current));
      return previous;
    });
  }, []);
  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    setData((current) => {
      undoRef.current.push(clone(current));
      return next;
    });
  }, []);

  const deleteSelection = useCallback(() => {
    if (mode !== "edit" || (!selectedNode && !selectedEdge)) return;
    commit((current) => ({
      nodes: selectedNode
        ? current.nodes.filter((node) => node.id !== selectedNode)
        : current.nodes,
      edges: current.edges.filter((edge) =>
        edge.id !== selectedEdge &&
        (!selectedNode ||
          (edge.fromNode !== selectedNode && edge.toNode !== selectedNode))
      ),
    }));
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [commit, mode, selectedEdge, selectedNode]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        !viewportRef.current?.contains(document.activeElement) &&
        document.activeElement !== document.body
      ) return;
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") {
        setConnectFrom(null);
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [deleteSelection, redo, undo]);

  const fit = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || !data.nodes.length) {
      setZoom(1);
      setPan({ x: 72, y: 72 });
      return;
    }
    const minX = Math.min(...data.nodes.map((node) => node.x));
    const minY = Math.min(...data.nodes.map((node) => node.y));
    const maxX = Math.max(...data.nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...data.nodes.map((node) => node.y + node.height));
    const nextZoom = Math.max(
      .2,
      Math.min(
        1.5,
        Math.min(
          (rect.width - 120) / Math.max(200, maxX - minX),
          (rect.height - 120) / Math.max(120, maxY - minY),
        ),
      ),
    );
    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 - (minX + (maxX - minX) / 2) * nextZoom,
      y: rect.height / 2 - (minY + (maxY - minY) / 2) * nextZoom,
    });
  }, [data.nodes]);

  const addNode = useCallback((type: CanvasNodeType) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const point = worldPoint(
      (rect?.left || 0) + (rect?.width || 800) / 2,
      (rect?.top || 0) + (rect?.height || 500) / 2,
    );
    const id = canvasId();
    const patch: Partial<CanvasNode> = type === "text"
      ? { text: tr("canvas.textCard") }
      : type === "group"
      ? { label: tr("canvas.group"), width: 520, height: 340 }
      : type === "file"
      ? { file: prompt(tr("canvas.filePrompt")) || "" }
      : { url: prompt("URL") || "https://" };
    commit((current) => ({
      ...current,
      nodes: [...current.nodes, {
        id,
        type,
        x: Math.round(point.x - CANVAS_NODE_WIDTH / 2),
        y: Math.round(point.y - CANVAS_NODE_HEIGHT / 2),
        width: CANVAS_NODE_WIDTH,
        height: CANVAS_NODE_HEIGHT,
        ...patch,
      }],
    }));
    setSelectedNode(id);
  }, [commit, worldPoint]);

  const updateNode = useCallback(
    (id: string, patch: Partial<CanvasNode>, history = true) => {
      const apply = (current: CanvasData) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === id ? { ...node, ...patch } : node
        ),
      });
      if (history) commit(apply);
      else setData(apply);
    },
    [commit],
  );

  const updateEdge = useCallback((id: string, patch: Partial<CanvasEdge>) => {
    setData((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === id ? { ...edge, ...patch } : edge
      ),
    }));
  }, []);

  const connect = useCallback((toNode: CanvasNode, toSide: CanvasSide) => {
    if (!connectFrom || connectFrom.nodeId === toNode.id) {
      setConnectFrom({ nodeId: toNode.id, side: toSide });
      return;
    }
    commit((current) => ({
      ...current,
      edges: [...current.edges, {
        id: canvasId(),
        fromNode: connectFrom.nodeId,
        fromSide: connectFrom.side,
        toNode: toNode.id,
        toSide,
        toEnd: "arrow",
      }],
    }));
    setConnectFrom(null);
  }, [commit, connectFrom]);

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.kind === "pan") {
      setPan({
        x: drag.panX + event.clientX - drag.clientX,
        y: drag.panY + event.clientY - drag.clientY,
      });
      return;
    }
    const point = worldPoint(event.clientX, event.clientY);
    if (drag.kind === "move") {
      updateNode(drag.nodeId, {
        x: Math.round((drag.x + point.x - drag.worldX) / 10) * 10,
        y: Math.round((drag.y + point.y - drag.worldY) / 10) * 10,
      }, false);
    } else {updateNode(drag.nodeId, {
        width: Math.max(
          CANVAS_MIN_WIDTH,
          Math.round((drag.width + point.x - drag.worldX) / 10) * 10,
        ),
        height: Math.max(
          CANVAS_MIN_HEIGHT,
          Math.round((drag.height + point.y - drag.worldY) / 10) * 10,
        ),
      }, false);}
  };

  const beginNodeMove = (event: ReactPointerEvent, node: CanvasNode) => {
    if (
      mode !== "edit" ||
      (event.target as HTMLElement).closest("button,textarea,input,a")
    ) return;
    event.stopPropagation();
    undoRef.current.push(clone(data));
    redoRef.current = [];
    const point = worldPoint(event.clientX, event.clientY);
    setDrag({
      kind: "move",
      id: event.pointerId,
      nodeId: node.id,
      worldX: point.x,
      worldY: point.y,
      x: node.x,
      y: node.y,
    });
    setSelectedNode(node.id);
    setSelectedEdge(null);
    viewportRef.current?.setPointerCapture(event.pointerId);
  };

  const nodeMap = useMemo(
    () => new Map(data.nodes.map((node) => [node.id, node])),
    [data.nodes],
  );
  const orderedNodes = useMemo(
    () =>
      [...data.nodes].sort((a, b) =>
        Number(b.type === "group") - Number(a.type === "group")
      ),
    [data.nodes],
  );
  const selectedNodeValue = selectedNode
    ? nodeMap.get(selectedNode)
    : undefined;
  const selectedEdgeValue = selectedEdge
    ? data.edges.find((edge) => edge.id === selectedEdge)
    : undefined;

  const switchMode = (next: Mode) => {
    if (mode === "raw" && next !== "raw") {
      const parsed = parseCanvas(raw, parseMessages);
      setParseError(parsed.error);
      if (parsed.error) return;
      setData(parsed.data);
      onChange(serializeCanvas(parsed.data));
    }
    setMode(next);
    setConnectFrom(null);
  };

  if (mode === "raw") {
    return (
      <div className="canvas-editor">
        <div className="canvas-toolbar">
          <div className="canvas-mode-tabs">
            <button onClick={() => switchMode("view")}>
              {tr("canvas.view")}
            </button>
            <button onClick={() => switchMode("edit")}>
              {tr("common.edit")}
            </button>
            <button className="active">JSON</button>
          </div>
          {parseError && (
            <span className="canvas-parse-error">{parseError}</span>
          )}
        </div>
        <textarea
          className="raw-editor canvas-raw"
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            setParseError(parseCanvas(event.target.value, parseMessages).error);
            onChange(event.target.value);
          }}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="canvas-editor">
      <div className="canvas-toolbar">
        <div className="canvas-mode-tabs">
          <button
            className={mode === "view" ? "active" : ""}
            onClick={() => switchMode("view")}
          >
            <MousePointer2 size={14} />
            {tr("canvas.view")}
          </button>
          <button
            className={mode === "edit" ? "active" : ""}
            onClick={() => switchMode("edit")}
          >
            <BoxSelect size={14} />
            {tr("common.edit")}
          </button>
          <button onClick={() => switchMode("raw")}>JSON</button>
        </div>
        {mode === "edit" && (
          <>
            <span className="canvas-toolbar-separator" />
            <button
              title={tr("canvas.textCard")}
              onClick={() => addNode("text")}
            >
              <StickyNote size={16} />
              <span>{tr("canvas.textCard")}</span>
            </button>
            <button title={tr("canvas.file")} onClick={() => addNode("file")}>
              <FileText size={16} />
              <span>{tr("canvas.file")}</span>
            </button>
            <button title={tr("canvas.link")} onClick={() => addNode("link")}>
              <Link2 size={16} />
              <span>{tr("canvas.link")}</span>
            </button>
            <button title={tr("canvas.group")} onClick={() => addNode("group")}>
              <Plus size={16} />
              <span>{tr("canvas.group")}</span>
            </button>
            <button
              title={tr("common.undo")}
              onClick={undo}
              disabled={!undoRef.current.length}
            >
              <Undo2 size={16} />
            </button>
            <button
              title={tr("common.redo")}
              onClick={redo}
              disabled={!redoRef.current.length}
            >
              <Redo2 size={16} />
            </button>
            <button
              title={tr("common.delete")}
              onClick={deleteSelection}
              disabled={!selectedNode && !selectedEdge}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
        <span className="canvas-toolbar-spacer" />
        <button
          title={tr("canvas.zoomOut")}
          onClick={() => setZoom((value) => Math.max(.2, value - .1))}
        >
          <ZoomOut size={16} />
        </button>
        <span className="canvas-zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          title={tr("canvas.zoomIn")}
          onClick={() => setZoom((value) => Math.min(3, value + .1))}
        >
          <ZoomIn size={16} />
        </button>
        <button title={tr("canvas.fit")} onClick={fit}>
          <Focus size={16} />
        </button>
      </div>
      {parseError && (
        <div className="canvas-error-banner">
          {parseError}
          <button onClick={() => switchMode("raw")}>
            {tr("canvas.fixJson")}
          </button>
        </div>
      )}
      <div
        ref={viewportRef}
        className={`canvas-viewport ${
          mode === "edit" ? "is-editing" : "is-viewing"
        }`}
        tabIndex={0}
        onWheel={(event) => {
          event.preventDefault();
          const rect = viewportRef.current?.getBoundingClientRect();
          if (!rect) return;
          const old = zoom;
          const next = Math.max(
            .2,
            Math.min(3, old * (event.deltaY > 0 ? .9 : 1.1)),
          );
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          setZoom(next);
          setPan({
            x: x - (x - pan.x) / old * next,
            y: y - (y - pan.y) / old * next,
          });
        }}
        onPointerDown={(event) => {
          if (
            (event.target as HTMLElement) !== event.currentTarget &&
            !(event.target as HTMLElement).classList.contains("canvas-world")
          ) return;
          setSelectedNode(null);
          setSelectedEdge(null);
          setConnectFrom(null);
          setDrag({
            kind: "pan",
            id: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            panX: pan.x,
            panY: pan.y,
          });
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={pointerMove}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event
              .currentTarget.releasePointerCapture(event.pointerId);
          }
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <div
          className="canvas-world"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <svg className="canvas-edges" viewBox="-100000 -100000 200000 200000">
            <defs>
              <marker
                id="canvas-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {data.edges.map((edge) => {
              const from = nodeMap.get(edge.fromNode);
              const to = nodeMap.get(edge.toNode);
              if (!from || !to) return null;
              const fromSide = edge.fromSide || closestSide(from, to);
              const toSide = edge.toSide || closestSide(to, from);
              const start = sidePoint(from, fromSide);
              const end = sidePoint(to, toSide);
              const curve = edgeCurve(start, end, fromSide, toSide);
              return (
                <g
                  key={edge.id}
                  className={`canvas-edge ${
                    selectedEdge === edge.id ? "selected" : ""
                  }`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedEdge(edge.id);
                    setSelectedNode(null);
                  }}
                >
                  <path className="canvas-edge-hit" d={curve} />
                  <path
                    className="canvas-edge-line"
                    d={curve}
                    style={{
                      stroke: edge.color?.startsWith("#")
                        ? edge.color
                        : COLORS[edge.color || ""],
                    }}
                    markerStart={edge.fromEnd === "arrow"
                      ? "url(#canvas-arrow)"
                      : undefined}
                    markerEnd={edge.toEnd !== "none"
                      ? "url(#canvas-arrow)"
                      : undefined}
                  />
                  {edge.label && (
                    <text
                      x={(start.x + end.x) / 2}
                      y={(start.y + end.y) / 2 - 8}
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {orderedNodes.map((node) => {
            const selected = selectedNode === node.id;
            const accent = nodeColor(node);
            const style = {
              left: node.x,
              top: node.y,
              width: node.width,
              height: node.height,
              ["--canvas-accent" as string]: accent,
            } as CSSProperties;
            return (
              <div
                key={node.id}
                className={`canvas-node canvas-node-${node.type} ${
                  selected ? "selected" : ""
                }`}
                style={style}
                onPointerDown={(event) => beginNodeMove(event, node)}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedNode(node.id);
                  setSelectedEdge(null);
                }}
              >
                <div className="canvas-node-accent" />
                {node.type === "group" && (mode === "edit"
                  ? (
                    <input
                      className="canvas-group-label"
                      value={node.label || ""}
                      placeholder={tr("canvas.group")}
                      onChange={(event) =>
                        updateNode(
                          node.id,
                          { label: event.target.value },
                          false,
                        )}
                    />
                  )
                  : (
                    <div className="canvas-group-label">
                      {node.label || tr("canvas.group")}
                    </div>
                  ))}
                {node.type === "text" && (mode === "edit"
                  ? (
                    <textarea
                      className="canvas-text-editor"
                      value={node.text || ""}
                      onChange={(event) =>
                        updateNode(
                          node.id,
                          { text: event.target.value },
                          false,
                        )}
                    />
                  )
                  : (
                    <div className="canvas-markdown">
                      <MarkdownPreview
                        content={node.text || ""}
                        isDark={isDark}
                      />
                    </div>
                  ))}
                {node.type === "file" && (
                  <CanvasFileCard
                    canvasPath={path}
                    node={node}
                    onOpen={onOpenPath}
                    isDark={isDark}
                  />
                )}
                {node.type === "link" && (() => {
                  const safeUrl = node.url ? safeExternalUrl(node.url) : null;
                  return (
                    <a
                      className="canvas-link-card"
                      href={safeUrl || "#"}
                      target={safeUrl ? "_blank" : undefined}
                      rel="noreferrer"
                      onClick={(event) =>
                        (mode === "edit" || !safeUrl) && event.preventDefault()}
                    >
                      <div className="canvas-card-heading">
                        <Link2 size={15} />
                        <span>{node.label || node.url || "Link"}</span>
                      </div>
                      {safeUrl
                        ? (
                          <iframe
                            title={safeUrl}
                            src={safeUrl}
                            sandbox="allow-scripts allow-forms"
                            referrerPolicy="no-referrer"
                          />
                        )
                        : (
                          <div className="canvas-link-host">
                            {node.url || tr("canvas.urlMissing")}
                          </div>
                        )}
                    </a>
                  );
                })()}
                {mode === "edit" && selected && (
                  <>
                    <div className="canvas-node-actions">
                      <button
                        title={tr("canvas.color")}
                        onClick={(event) => {
                          event.stopPropagation();
                          const keys = Object.keys(COLORS);
                          const current = keys.indexOf(node.color || "");
                          updateNode(node.id, {
                            color: keys[(current + 1) % keys.length],
                          });
                        }}
                      >
                        <Palette size={14} />
                      </button>
                      {node.type === "file" && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            const file = prompt(
                              tr("canvas.filePath"),
                              node.file || "",
                            );
                            if (file !== null) updateNode(node.id, { file });
                          }}
                        >
                          <FileText size={14} />
                        </button>
                      )}
                      {node.type === "link" && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            const url = prompt("URL", node.url || "");
                            if (url !== null) updateNode(node.id, { url });
                          }}
                        >
                          <Link2 size={14} />
                        </button>
                      )}
                    </div>
                    {SIDES.map((side) => (
                      <button
                        key={side}
                        className={`canvas-connect canvas-connect-${side} ${
                          connectFrom?.nodeId === node.id &&
                            connectFrom.side === side
                            ? "active"
                            : ""
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          connect(node, side);
                        }}
                        title={tr("canvas.connect")}
                      >
                        <ArrowRight size={11} />
                      </button>
                    ))}
                    <button
                      className="canvas-resize"
                      title={tr("canvas.resize")}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        undoRef.current.push(clone(data));
                        redoRef.current = [];
                        const point = worldPoint(event.clientX, event.clientY);
                        setDrag({
                          kind: "resize",
                          id: event.pointerId,
                          nodeId: node.id,
                          worldX: point.x,
                          worldY: point.y,
                          width: node.width,
                          height: node.height,
                        });
                        viewportRef.current?.setPointerCapture(event.pointerId);
                      }}
                    >
                      <Maximize size={12} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {!data.nodes.length && !parseError && (
          <div className="canvas-empty">
            <StickyNote size={32} />
            <strong>{tr("canvas.empty")}</strong>
            <span>
              {mode === "edit"
                ? tr("canvas.emptyEditHint")
                : tr("canvas.emptyViewHint")}
            </span>
            {mode === "view" && (
              <button onClick={() => setMode("edit")}>
                {tr("canvas.startEditing")}
              </button>
            )}
          </div>
        )}
        {connectFrom && (
          <div className="canvas-connect-hint">
            {tr("canvas.connectHint")}
          </div>
        )}
        {mode === "edit" && (selectedNodeValue || selectedEdgeValue) && (
          <aside
            className="canvas-properties"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <strong>
              {selectedNodeValue
                ? ({
                  text: tr("canvas.textCard"),
                  file: tr("canvas.fileCard"),
                  link: tr("canvas.linkCard"),
                  group: tr("canvas.group"),
                }[selectedNodeValue.type])
                : tr("canvas.edge")}
            </strong>
            {selectedNodeValue?.type === "file" && (
              <label>
                {tr("canvas.file")}
                <input
                  value={selectedNodeValue.file || ""}
                  onChange={(event) =>
                    updateNode(selectedNodeValue.id, {
                      file: event.target.value,
                    }, false)}
                />
              </label>
            )}
            {selectedNodeValue?.type === "link" && (
              <>
                <label>
                  URL<input
                    value={selectedNodeValue.url || ""}
                    onChange={(event) =>
                      updateNode(selectedNodeValue.id, {
                        url: event.target.value,
                      }, false)}
                  />
                </label>
                <label>
                  {tr("canvas.label")}
                  <input
                    value={selectedNodeValue.label || ""}
                    onChange={(event) =>
                      updateNode(selectedNodeValue.id, {
                        label: event.target.value,
                      }, false)}
                  />
                </label>
              </>
            )}
            {selectedNodeValue?.type === "group" && (
              <label>
                {tr("canvas.label")}
                <input
                  value={selectedNodeValue.label || ""}
                  onChange={(event) =>
                    updateNode(selectedNodeValue.id, {
                      label: event.target.value,
                    }, false)}
                />
              </label>
            )}
            {selectedEdgeValue && (
              <>
                <label>
                  {tr("canvas.label")}
                  <input
                    value={selectedEdgeValue.label || ""}
                    onChange={(event) =>
                      updateEdge(selectedEdgeValue.id, {
                        label: event.target.value,
                      })}
                  />
                </label>
                <div className="canvas-property-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedEdgeValue.fromEnd === "arrow"}
                      onChange={(event) =>
                        updateEdge(selectedEdgeValue.id, {
                          fromEnd: event.target.checked ? "arrow" : "none",
                        })}
                    />
                    {tr("canvas.startArrow")}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedEdgeValue.toEnd !== "none"}
                      onChange={(event) =>
                        updateEdge(selectedEdgeValue.id, {
                          toEnd: event.target.checked ? "arrow" : "none",
                        })}
                    />
                    {tr("canvas.endArrow")}
                  </label>
                </div>
              </>
            )}
            <span>{tr("canvas.color")}</span>
            <div className="canvas-color-row">
              {Object.entries(COLORS).map(([key, color]) => (
                <button
                  key={key}
                  type="button"
                  className={(selectedNodeValue?.color ||
                      selectedEdgeValue?.color || "") === key
                    ? "active"
                    : ""}
                  style={{ background: color }}
                  title={key || tr("canvas.defaultColor")}
                  onClick={() =>
                    selectedNodeValue
                      ? updateNode(selectedNodeValue.id, { color: key })
                      : selectedEdgeValue &&
                        updateEdge(selectedEdgeValue.id, { color: key })}
                />
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
