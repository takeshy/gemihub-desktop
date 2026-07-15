import { useEffect, useState, type DragEvent, type MouseEvent } from "react";
import yaml from "js-yaml";
import { Calendar, CalendarClock, CheckSquare, ChevronRight, GripVertical, Hash, List, Plus, Type, X } from "lucide-react";

export type FrontmatterPropertyType = "text" | "number" | "checkbox" | "date" | "datetime" | "list";

export interface FrontmatterProperty {
  id: string;
  key: string;
  value: unknown;
  type: FrontmatterPropertyType;
}

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
  hasFrontmatter: boolean;
  valid: boolean;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
let propertyID = 0;

const typeLabels: Record<FrontmatterPropertyType, string> = {
  text: "Text",
  number: "Number",
  checkbox: "Checkbox",
  date: "Date",
  datetime: "Date & time",
  list: "List",
};

const typeIcons = {
  text: Type,
  number: Hash,
  checkbox: CheckSquare,
  date: Calendar,
  datetime: CalendarClock,
  list: List,
} satisfies Record<FrontmatterPropertyType, typeof Type>;

const allTypes = Object.keys(typeLabels) as FrontmatterPropertyType[];

function nextPropertyID(): string {
  propertyID += 1;
  return `frontmatter-${propertyID}`;
}

function isComplex(value: unknown): boolean {
  return Array.isArray(value) || (value !== null && typeof value === "object");
}

function inferType(value: unknown): FrontmatterPropertyType {
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return value.some((item) => item !== null && typeof item === "object") ? "text" : "list";
  if (value instanceof Date) return "date";
  if (typeof value === "string" && DATETIME_RE.test(value)) return "datetime";
  if (typeof value === "string" && DATE_RE.test(value)) return "date";
  return "text";
}

function propertiesFrom(frontmatter: Record<string, unknown>): FrontmatterProperty[] {
  return Object.entries(frontmatter).map(([key, value]) => ({ id: nextPropertyID(), key, value, type: inferType(value) }));
}

function convertValue(value: unknown, type: FrontmatterPropertyType): unknown {
  if (type === "checkbox") return typeof value === "boolean" ? value : String(value).toLowerCase() === "true";
  if (type === "number") {
    const number = Number(value);
    return Number.isNaN(number) ? 0 : number;
  }
  if (type === "list") {
    if (Array.isArray(value)) return value.map(String);
    return String(value ?? "").trim() ? [String(value)] : [];
  }
  if (isComplex(value)) return value;
  return value == null ? "" : typeof value === "boolean" ? String(value) : value;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: content, raw: "", hasFrontmatter: false, valid: true };
  try {
    const parsed = match[1].trim() ? yaml.load(match[1], { schema: yaml.JSON_SCHEMA }) : {};
    if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
      return { frontmatter: {}, body: content, raw: match[1], hasFrontmatter: true, valid: false };
    }
    return { frontmatter: (parsed ?? {}) as Record<string, unknown>, body: content.slice(match[0].length), raw: match[1], hasFrontmatter: true, valid: true };
  } catch {
    return { frontmatter: {}, body: content, raw: match[1], hasFrontmatter: true, valid: false };
  }
}

export function serializeFrontmatter(properties: FrontmatterProperty[], body: string): string {
  if (properties.length === 0) return body;
  const frontmatter: Record<string, unknown> = {};
  for (const property of properties) {
    if (property.key.trim()) frontmatter[property.key.trim()] = convertValue(property.value, property.type);
  }
  if (Object.keys(frontmatter).length === 0) return body;
  return `---\n${yaml.dump(frontmatter, { lineWidth: -1, noRefs: true })}---\n${body}`;
}

export function replaceFrontmatterBody(content: string, body: string): string {
  const parsed = parseFrontmatter(content);
  if (!parsed.hasFrontmatter || !parsed.valid) return body;
  return content.slice(0, content.length - parsed.body.length) + body;
}

export function FrontmatterEditor({ parsed, readOnly = false, onChange }: { parsed: ParsedFrontmatter; readOnly?: boolean; onChange: (content: string) => void }) {
  const [properties, setProperties] = useState(() => propertiesFrom(parsed.frontmatter));
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("gemihub-desktop:frontmatter-collapsed") === "true");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);

  useEffect(() => {
    setProperties(propertiesFrom(parsed.frontmatter));
  }, [parsed.raw]);

  const commit = (next: FrontmatterProperty[]) => {
    setProperties(next);
    onChange(serializeFrontmatter(next, parsed.body));
  };

  const update = (index: number, patch: Partial<FrontmatterProperty>) => {
    const next = [...properties];
    next[index] = { ...next[index], ...patch };
    commit(next);
  };

  const remove = (index: number) => commit(properties.filter((_, itemIndex) => itemIndex !== index));
  const add = () => commit([...properties, { id: nextPropertyID(), key: "", value: "", type: "text" }]);

  const drop = (event: DragEvent, target: number) => {
    event.preventDefault();
    if (dragIndex === null || dragIndex === target) return;
    const next = [...properties];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    setDragOver(null);
    commit(next);
  };

  const openMenu = (event: MouseEvent, index: number) => {
    if (readOnly) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, index });
  };

  return (
    <section className="frontmatter-editor">
      <button type="button" className="frontmatter-heading" onClick={() => setCollapsed((current) => { const next = !current; localStorage.setItem("gemihub-desktop:frontmatter-collapsed", String(next)); return next; })}>
        <ChevronRight size={14} className={collapsed ? "" : "expanded"} /> Properties
      </button>
      {!collapsed && <>
        {!parsed.valid && <div className="frontmatter-invalid">Frontmatter contains invalid YAML. Edit it in Raw mode.</div>}
        {parsed.valid && <div className="frontmatter-properties">
          {properties.map((property, index) => {
            const Icon = typeIcons[property.type];
            return <div key={property.id} className={`frontmatter-property ${dragOver === index && dragIndex !== index ? "drag-over" : ""} ${dragIndex === index ? "dragging" : ""}`} draggable={!readOnly} onDragStart={(event) => { setDragIndex(index); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => { event.preventDefault(); setDragOver(index); }} onDrop={(event) => drop(event, index)} onDragEnd={() => { setDragIndex(null); setDragOver(null); }} onContextMenu={(event) => openMenu(event, index)}>
              <span className="frontmatter-type" title={typeLabels[property.type]}>{!readOnly && <GripVertical size={13} className="frontmatter-grip" />}<Icon size={14} /></span>
              {readOnly ? <strong>{property.key}</strong> : <input className="frontmatter-key" value={property.key} placeholder="key" onChange={(event) => update(index, { key: event.target.value })} />}
              <PropertyValue property={property} readOnly={readOnly} onChange={(value) => update(index, { value })} />
            </div>;
          })}
        </div>}
        {!readOnly && parsed.valid && <button type="button" className="frontmatter-add" onClick={add}><Plus size={14} /> Add property</button>}
      </>}
      {menu && <><button type="button" className="frontmatter-menu-backdrop" aria-label="Close property menu" onClick={() => setMenu(null)} /><div className="frontmatter-menu" style={{ left: menu.x, top: menu.y }}>
        <small>Property type</small>
        {allTypes.map((type) => { const Icon = typeIcons[type]; return <button type="button" className={properties[menu.index]?.type === type ? "selected" : ""} key={type} onClick={() => { const property = properties[menu.index]; update(menu.index, { type, value: convertValue(property.value, type) }); setMenu(null); }}><Icon size={14} />{typeLabels[type]}</button>; })}
        <button type="button" className="danger" onClick={() => { remove(menu.index); setMenu(null); }}><X size={14} />Remove</button>
      </div></>}
    </section>
  );
}

function PropertyValue({ property, readOnly, onChange }: { property: FrontmatterProperty; readOnly: boolean; onChange: (value: unknown) => void }) {
  if (property.type === "checkbox") return <label className="frontmatter-checkbox"><input type="checkbox" checked={Boolean(property.value)} disabled={readOnly} onChange={(event) => onChange(event.target.checked)} /></label>;
  if (property.type === "list") return <ListValue values={Array.isArray(property.value) ? property.value.map(String) : []} readOnly={readOnly} onChange={onChange} />;
  const complex = isComplex(property.value);
  const value = complex ? yaml.dump(property.value, { lineWidth: -1, noRefs: true }).trimEnd() : String(property.value ?? "");
  if (readOnly || complex) return <span className="frontmatter-value-text">{value}</span>;
  const inputType = property.type === "number" ? "number" : property.type === "date" ? "date" : property.type === "datetime" ? "datetime-local" : "text";
  return <input className="frontmatter-value" type={inputType} value={property.type === "datetime" ? value.replace(" ", "T").slice(0, 16) : value} onChange={(event) => onChange(property.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} />;
}

function ListValue({ values, readOnly, onChange }: { values: string[]; readOnly: boolean; onChange: (value: unknown) => void }) {
  const [input, setInput] = useState("");
  const add = () => { const value = input.trim(); if (value) onChange([...values, value]); setInput(""); };
  return <div className="frontmatter-list">{values.map((value, index) => <span key={`${value}-${index}`}>{value}{!readOnly && <button type="button" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><X size={10} /></button>}</span>)}{!readOnly && <input value={input} placeholder="+" onChange={(event) => setInput(event.target.value)} onBlur={add} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } if (event.key === "Backspace" && !input && values.length) onChange(values.slice(0, -1)); }} />}</div>;
}

export function AddFrontmatterButton({ onClick }: { onClick: () => void }) {
  return <div className="frontmatter-add-bar"><button type="button" onClick={onClick}><Plus size={14} /> Add properties</button></div>;
}
