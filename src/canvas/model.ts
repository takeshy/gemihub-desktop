export const CANVAS_NODE_WIDTH = 280;
export const CANVAS_NODE_HEIGHT = 180;
export const CANVAS_MIN_WIDTH = 120;
export const CANVAS_MIN_HEIGHT = 72;

export type CanvasNodeType = "text" | "file" | "link" | "group";
export type CanvasSide = "top" | "right" | "bottom" | "left";
export type CanvasEnd = "none" | "arrow";

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toNode: string;
  toSide?: CanvasSide;
  toEnd?: CanvasEnd;
  color?: string;
  label?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasParseResult {
  data: CanvasData;
  error: string;
}

const isSide = (value: unknown): value is CanvasSide =>
  value === "top" || value === "right" || value === "bottom" || value === "left";
const isEnd = (value: unknown): value is CanvasEnd => value === "none" || value === "arrow";

export function parseCanvas(content: string): CanvasParseResult {
  try {
    const value = JSON.parse(content.trim() || '{"nodes":[],"edges":[]}') as Record<string, unknown>;
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
      return { data: { nodes: [], edges: [] }, error: "Canvasにはnodesとedgesの配列が必要です。" };
    }
    const nodes: CanvasNode[] = value.nodes.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const node = item as Record<string, unknown>;
      if (typeof node.id !== "string" || typeof node.x !== "number" || typeof node.y !== "number") return [];
      const type: CanvasNodeType = node.type === "file" || node.type === "link" || node.type === "group" ? node.type : "text";
      return [{
        id: node.id,
        type,
        x: node.x,
        y: node.y,
        width: typeof node.width === "number" ? node.width : CANVAS_NODE_WIDTH,
        height: typeof node.height === "number" ? node.height : CANVAS_NODE_HEIGHT,
        ...(typeof node.color === "string" ? { color: node.color } : {}),
        ...(typeof node.text === "string" ? { text: node.text } : {}),
        ...(typeof node.file === "string" ? { file: node.file } : {}),
        ...(typeof node.subpath === "string" ? { subpath: node.subpath } : {}),
        ...(typeof node.url === "string" ? { url: node.url } : {}),
        ...(typeof node.label === "string" ? { label: node.label } : {}),
        ...(typeof node.background === "string" ? { background: node.background } : {}),
        ...(node.backgroundStyle === "cover" || node.backgroundStyle === "ratio" || node.backgroundStyle === "repeat" ? { backgroundStyle: node.backgroundStyle } : {}),
      }];
    });
    const ids = new Set(nodes.map((node) => node.id));
    const edges: CanvasEdge[] = value.edges.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const edge = item as Record<string, unknown>;
      if (typeof edge.id !== "string" || typeof edge.fromNode !== "string" || typeof edge.toNode !== "string") return [];
      if (!ids.has(edge.fromNode) || !ids.has(edge.toNode)) return [];
      return [{
        id: edge.id,
        fromNode: edge.fromNode,
        toNode: edge.toNode,
        ...(isSide(edge.fromSide) ? { fromSide: edge.fromSide } : {}),
        ...(isSide(edge.toSide) ? { toSide: edge.toSide } : {}),
        ...(isEnd(edge.fromEnd) ? { fromEnd: edge.fromEnd } : {}),
        ...(isEnd(edge.toEnd) ? { toEnd: edge.toEnd } : {}),
        ...(typeof edge.color === "string" ? { color: edge.color } : {}),
        ...(typeof edge.label === "string" ? { label: edge.label } : {}),
      }];
    });
    return { data: { nodes, edges }, error: "" };
  } catch (error) {
    return { data: { nodes: [], edges: [] }, error: error instanceof Error ? `Canvas JSONを解析できません: ${error.message}` : "Canvas JSONを解析できません。" };
  }
}

export function serializeCanvas(data: CanvasData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function canvasId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

export function sidePoint(node: CanvasNode, side: CanvasSide): { x: number; y: number } {
  if (side === "top") return { x: node.x + node.width / 2, y: node.y };
  if (side === "right") return { x: node.x + node.width, y: node.y + node.height / 2 };
  if (side === "bottom") return { x: node.x + node.width / 2, y: node.y + node.height };
  return { x: node.x, y: node.y + node.height / 2 };
}

export function closestSide(from: CanvasNode, to: CanvasNode): CanvasSide {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top");
}

export function edgeCurve(from: { x: number; y: number }, to: { x: number; y: number }, fromSide: CanvasSide, toSide: CanvasSide): string {
  const distance = Math.max(60, Math.hypot(to.x - from.x, to.y - from.y) * .35);
  const vector = (side: CanvasSide) => side === "left" ? [-distance, 0] : side === "right" ? [distance, 0] : side === "top" ? [0, -distance] : [0, distance];
  const a = vector(fromSide);
  const b = vector(toSide);
  return `M ${from.x} ${from.y} C ${from.x + a[0]} ${from.y + a[1]}, ${to.x + b[0]} ${to.y + b[1]}, ${to.x} ${to.y}`;
}
