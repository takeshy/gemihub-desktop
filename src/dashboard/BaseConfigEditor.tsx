import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import yaml from "js-yaml";
import {
  listWorkspaceFiles,
  readWorkspaceFile,
} from "../lib/wailsBackend";
import { parseFrontmatter } from "../components/FrontmatterEditor";

type BaseRoot = Record<string, unknown> & {
  views?: BaseView[];
  formulas?: Record<string, string>;
  properties?: Record<string, { displayName?: string; [key: string]: unknown }>;
};
type BaseView = Record<string, unknown> & {
  type: string;
  name: string;
  filters?: unknown;
  order?: string[];
  sort?: Array<{ property: string; direction: "ASC" | "DESC" }>;
  limit?: number;
};
type FilterTerm = { property: string; operator: string; value: string };

export function BaseConfigEditor(
  { content, onChange, viewName }: {
    content: string;
    onChange: (content: string) => void;
    viewName?: string;
  },
) {
  const root = useMemo(() => parseBase(content), [content]);
  const views = root.views ?? [];
  const activeView = views.find((view) => view.name === viewName) ?? views[0];
  const sourceFolder = extractFolder(activeView?.filters) ??
    extractFolder(root.filters) ?? "";
  const [vaultFields, setVaultFields] = useState<string[]>([]);
  const [vaultFolders, setVaultFolders] = useState<string[]>([]);
  const [vaultDateFields, setVaultDateFields] = useState<string[]>([
    "file.ctime",
    "file.mtime",
  ]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = (await listWorkspaceFiles()).filter((entry) =>
        !entry.binary && /\.md(?:own)?$/i.test(entry.path) &&
        (!sourceFolder || entry.path.startsWith(`${sourceFolder}/`))
      ).slice(0, 1000);
      const files = await Promise.all(
        entries.map((entry) => readWorkspaceFile(entry.path)),
      );
      const fields = new Set<string>([
        "file.name",
        "file.path",
        "file.folder",
        "file.ext",
        "file.size",
        "file.ctime",
        "file.mtime",
        "file.tags",
      ]);
      const folders = new Set<string>();
      const dateFields = new Set<string>(["file.ctime", "file.mtime"]);
      for (const entry of entries) {
        const parts = entry.path.split("/");
        for (let index = 1; index < parts.length; index++) {
          folders.add(parts.slice(0, index).join("/"));
        }
      }
      for (const file of files) {
        if (file) {
          for (const [key, value] of Object.entries(parseFrontmatter(file.content).frontmatter)) {
            fields.add(key);
            if (isDateFieldValue(value)) dateFields.add(key);
          }
        }
      }
      if (!cancelled) {
        setVaultFields([...fields].sort());
        setVaultFolders([...folders].sort());
        setVaultDateFields([...dateFields].sort());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceFolder]);
  const formulaFields = Object.keys(root.formulas ?? {}).map((name) =>
    `formula.${name}`
  );
  const fieldNames = [
    ...new Set([
      ...vaultFields,
      ...formulaFields,
      ...(activeView?.order ?? []),
    ]),
  ];
  const commit = (next: BaseRoot) => onChange(dumpBase(next));
  const updateView = (patch: Partial<BaseView>) => {
    if (!activeView) return;
    commit({
      ...root,
      views: views.map((view) =>
        view === activeView ? cleanView({ ...view, ...patch }) : view
      ),
    });
  };
  const updateProperties = (
    properties: NonNullable<BaseRoot["properties"]>,
  ) => {
    const next = { ...root };
    if (Object.keys(properties).length) next.properties = properties;
    else delete next.properties;
    commit(next);
  };
  if (!activeView) return <div className="gemihub-base-empty">No views</div>;
  const viewType = activeView.type === "cards" || activeView.type === "list"
    ? activeView.type
    : "table";
  return (
    <div className="gemihub-base-editor">
      <label className="gemihub-base-field">
        <span>View type</span>
        <select
          value={viewType}
          onChange={(event) => updateView({ type: event.target.value })}
        >
          <option value="table">Table</option>
          <option value="cards">Cards</option>
          <option value="list">List</option>
        </select>
      </label>
      <FieldsEditor
        label={viewType === "table" ? "Columns" : "Properties"}
        order={activeView.order ?? []}
        fieldNames={fieldNames}
        allowAlias={viewType === "table"}
        properties={root.properties ?? {}}
        onOrderChange={(order) =>
          updateView({ order: order.length ? order : undefined })}
        onAliasChange={(id, alias) => {
          const properties = { ...(root.properties ?? {}) };
          const trimmed = alias.trim();
          if (trimmed) {
            properties[id] = {
              ...properties[id],
              displayName: trimmed,
            };
          } else if (properties[id]) {
            const { displayName: _, ...rest } = properties[id];
            if (Object.keys(rest).length) properties[id] = rest;
            else delete properties[id];
          }
          updateProperties(properties);
        }}
      />
      {viewType === "cards" && (
        <CardOptions
          view={activeView}
          fieldNames={fieldNames}
          onChange={updateView}
        />
      )}
      {viewType === "list" && (
        <label className="gemihub-base-check">
          <input
            type="checkbox"
            checked={activeView.indentProperties === true}
            onChange={(event) =>
              updateView({
                indentProperties: event.target.checked ? true : undefined,
              })}
          />Indent properties
        </label>
      )}
      <FilterEditor
        filters={activeView.filters}
        fieldNames={fieldNames}
        dateFieldNames={vaultDateFields}
        folderNames={vaultFolders}
        onChange={(filters) => updateView({ filters })}
      />
      <div className="gemihub-base-grid">
        <label className="gemihub-base-field">
          <span>Sort</span>
          <select
            value={sortString(activeView.sort)}
            onChange={(event) =>
              updateView({ sort: parseSort(event.target.value) })}
          >
            <option value="">Default</option>
            <option value="-mtime">Modified (newest)</option>
            <option value="mtime">Modified (oldest)</option>
            <option value="-ctime">Created (newest)</option>
            <option value="ctime">Created (oldest)</option>
            <option value="name">Name (A–Z)</option>
            <option value="-name">Name (Z–A)</option>
            {fieldNames.map((field) => (
              <option key={field} value={field}>{field} ↑</option>
            ))}
          </select>
        </label>
        <label className="gemihub-base-field">
          <span>Limit</span>
          <input
            type="number"
            min={1}
            value={activeView.limit ?? ""}
            onChange={(event) =>
              updateView({
                limit: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              })}
          />
        </label>
      </div>
      <details className="gemihub-base-raw">
        <summary>Raw base YAML</summary>
        <textarea
          value={content}
          onChange={(event) => onChange(event.target.value)}
          rows={8}
          spellCheck={false}
        />
      </details>
    </div>
  );
}

function FieldsEditor({
  label,
  order,
  fieldNames,
  allowAlias,
  properties,
  onOrderChange,
  onAliasChange,
}: {
  label: string;
  order: string[];
  fieldNames: string[];
  allowAlias: boolean;
  properties: NonNullable<BaseRoot["properties"]>;
  onOrderChange: (order: string[]) => void;
  onAliasChange: (id: string, alias: string) => void;
}) {
  const dragIndex = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const available = fieldNames.filter((field) => !order.includes(field));
  return (
    <div className="gemihub-base-section">
      <label>{label}</label>
      {order.length === 0 && <p>Fields are selected automatically.</p>}
      <div className="gemihub-base-order">
        {order.map((field, index) => (
          <div
            key={field}
            draggable
            onDragStart={() => {
              dragIndex.current = index;
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(index);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={() => {
              if (dragIndex.current !== null) {
                const next = [...order];
                const [item] = next.splice(dragIndex.current, 1);
                next.splice(index, 0, item);
                onOrderChange(next);
              }
              dragIndex.current = null;
              setOver(null);
            }}
            className={over === index ? "over" : ""}
          >
            <GripVertical size={12} />
            <span>{field}</span>
            {allowAlias && (
              <input
                value={properties[field]?.displayName ?? ""}
                placeholder={defaultLabel(field)}
                onChange={(event) => onAliasChange(field, event.target.value)}
              />
            )}
            <RemoveButton
              onClick={() =>
                onOrderChange(order.filter((_, item) => item !== index))}
            />
          </div>
        ))}
      </div>
      <select
        value=""
        disabled={!available.length}
        onChange={(event) => {
          if (event.target.value) {
            onOrderChange([
              ...order,
              event.target.value,
            ]);
          }
        }}
      >
        <option value="">Add field</option>
        {available.map((field) => <option key={field}>{field}</option>)}
      </select>
    </div>
  );
}

function CardOptions(
  { view, fieldNames, onChange }: {
    view: BaseView;
    fieldNames: string[];
    onChange: (patch: Partial<BaseView>) => void;
  },
) {
  return (
    <div className="gemihub-base-grid">
      <label className="gemihub-base-field">
        <span>Card image</span>
        <select
          value={String(view.image ?? "")}
          onChange={(event) =>
            onChange({ image: event.target.value || undefined })}
        >
          <option value="">None</option>
          {fieldNames.map((field) => <option key={field}>{field}</option>)}
        </select>
      </label>
      <label className="gemihub-base-field">
        <span>Image fit</span>
        <select
          value={String(view.imageFit ?? "cover")}
          onChange={(event) => onChange({ imageFit: event.target.value })}
        >
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
        </select>
      </label>
      <label className="gemihub-base-field">
        <span>Image ratio</span>
        <select
          value={String(view.imageAspectRatio ?? "16 / 9")}
          onChange={(event) =>
            onChange({ imageAspectRatio: event.target.value })}
        >
          <option value="16 / 9">16:9</option>
          <option value="4 / 3">4:3</option>
          <option value="1 / 1">1:1</option>
          <option value="3 / 2">3:2</option>
        </select>
      </label>
      <label className="gemihub-base-field">
        <span>Card size</span>
        <select
          value={String(view.cardSize ?? "medium")}
          onChange={(event) => onChange({ cardSize: event.target.value })}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
    </div>
  );
}

function FilterEditor(
  { filters, fieldNames, dateFieldNames, folderNames, onChange }: {
    filters: unknown;
    fieldNames: string[];
    dateFieldNames: string[];
    folderNames: string[];
    onChange: (filters: unknown) => void;
  },
) {
  const parsed = parseFilters(filters),
    combinator = parsed.combinator,
    dateFields = new Set(dateFieldNames),
    terms = parsed.terms.map((term) =>
      dateFields.has(term.property)
        ? { ...term, value: unwrapDateExpression(term.value) }
        : term
    );
  const commit = (next: FilterTerm[], nextCombinator = combinator) =>
    onChange(
      next.length === 0
        ? undefined
        : next.length === 1
        ? termExpression(next[0], dateFields.has(next[0].property))
        : { [nextCombinator]: next.map((term) => termExpression(term, dateFields.has(term.property))) },
    );
  if (!parsed.representable) {
    return (
      <div className="gemihub-base-section">
        <label>Filter</label>
        <p className="warning">
          Advanced filters are preserved and can be edited in Raw base YAML.
        </p>
      </div>
    );
  }
  return (
    <div className="gemihub-base-section">
      <div className="gemihub-base-section-title">
        <label>Filter</label>
        {terms.length >= 2 && (
          <select
            value={combinator}
            onChange={(event) =>
              commit(terms, event.target.value as "and" | "or")}
          >
            <option value="and">All conditions</option>
            <option value="or">Any condition</option>
          </select>
        )}
      </div>
      {terms.length === 0 && <p>No filters</p>}
      <div className="gemihub-base-filters">
        {terms.map((term, index) => (
          <div
            key={index}
            className={term.property.startsWith("@") ? "predicate" : ""}
          >
            <select
              value={term.property}
              onChange={(event) =>
                commit(terms.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                      ...item,
                      property: event.target.value,
                      operator: dateFields.has(event.target.value) &&
                          (item.operator === "contains" || item.operator === "notContains")
                        ? "eq"
                        : item.operator,
                    }
                    : item
                ))}
            >
              {!fieldNames.includes(term.property) && (
                <option>{term.property}</option>
              )}
              {fieldNames.map((field) => <option key={field}>{field}</option>)}
              <option value="@inFolder">In folder</option>
              <option value="@hasTag">Has tag</option>
            </select>
            {!term.property.startsWith("@") && (
              <select
                value={term.operator}
                onChange={(event) =>
                  commit(terms.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, operator: event.target.value }
                      : item
                  ))}
              >
                <option value="eq">is</option>
                <option value="neq">is not</option>
                {!dateFields.has(term.property) && <option value="contains">contains</option>}
                {!dateFields.has(term.property) && <option value="notContains">does not contain</option>}
                <option value="gt">{dateFields.has(term.property) ? "is after" : "greater than"}</option>
                <option value="lt">{dateFields.has(term.property) ? "is before" : "less than"}</option>
                <option value="gte">{dateFields.has(term.property) ? "is on or after" : "at least"}</option>
                <option value="lte">{dateFields.has(term.property) ? "is on or before" : "at most"}</option>
                <option value="empty">is empty</option>
                <option value="notEmpty">is not empty</option>
              </select>
            )}
            {term.property === "@inFolder"
              ? (
                <select
                  value={term.value}
                  onChange={(event) =>
                    commit(terms.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, value: event.target.value }
                        : item
                    ))}
                >
                  <option value="">Select folder</option>
                  {term.value && !folderNames.includes(term.value) && (
                    <option>{term.value}</option>
                  )}
                  {folderNames.map((folder) => (
                    <option key={folder}>{folder}</option>
                  ))}
                </select>
              )
              : (
                <input
                  type={dateFields.has(term.property) ? "date" : "text"}
                  value={term.value}
                  disabled={term.operator === "empty" ||
                    term.operator === "notEmpty"}
                  onChange={(event) =>
                    commit(terms.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, value: event.target.value }
                        : item
                    ))}
                />
              )}
            <RemoveButton
              onClick={() => commit(terms.filter((_, item) => item !== index))}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="gemihub-base-add"
        onClick={() =>
          commit([...terms, {
            property: fieldNames[0] ?? "file.name",
            operator: "eq",
            value: "",
          }])}
      >
        <Plus size={12} />Add filter
      </button>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="gemihub-base-remove" onClick={onClick}>
      <X size={12} />
    </button>
  );
}
function defaultLabel(id: string): string {
  return id.replace(/^(note|file|formula)\./, "");
}
function parseBase(content: string): BaseRoot {
  try {
    const loaded = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    const root = loaded && typeof loaded === "object" && !Array.isArray(loaded)
      ? loaded as BaseRoot
      : {};
    const views = Array.isArray(root.views)
      ? root.views.filter((view): view is BaseView =>
        !!view && typeof view === "object" && !Array.isArray(view)
      ).map((view, index) =>
        cleanView({
          ...view,
          type: typeof view.type === "string" ? view.type : "table",
          name: typeof view.name === "string" ? view.name : `View ${index + 1}`,
        })
      )
      : [];
    return {
      ...root,
      views: views.length ? views : [{ type: "table", name: "Table" }],
    };
  } catch {
    return { views: [{ type: "table", name: "Table" }] };
  }
}
function cleanView(view: BaseView): BaseView {
  const next = { ...view };
  for (const key of Object.keys(next)) {
    if (
      next[key] === undefined || next[key] === "" ||
      Array.isArray(next[key]) && next[key].length === 0
    ) delete next[key];
  }
  return next;
}
function dumpBase(root: BaseRoot): string {
  return yaml.dump(root, {
    schema: yaml.JSON_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}
function sortString(sort: BaseView["sort"]): string {
  const first = sort?.[0];
  if (!first) return "";
  const key = ({
    "file.mtime": "mtime",
    "file.ctime": "ctime",
    "file.name": "name",
  } as Record<string, string>)[first.property] ?? first.property;
  return `${first.direction === "DESC" ? "-" : ""}${key}`;
}
function parseSort(value: string): BaseView["sort"] {
  if (!value) return undefined;
  const desc = value.startsWith("-");
  const key = desc ? value.slice(1) : value;
  const property =
    ({ mtime: "file.mtime", ctime: "file.ctime", name: "file.name" } as Record<
      string,
      string
    >)[key] ?? key;
  return [{ property, direction: desc ? "DESC" : "ASC" }];
}
function parseFilters(
  filters: unknown,
): { combinator: "and" | "or"; terms: FilterTerm[]; representable: boolean } {
  const nodes = typeof filters === "string"
    ? [filters]
    : filters && typeof filters === "object" && !Array.isArray(filters) &&
        Array.isArray((filters as Record<string, unknown>).and)
    ? (filters as { and: unknown[] }).and
    : filters && typeof filters === "object" && !Array.isArray(filters) &&
        Array.isArray((filters as Record<string, unknown>).or)
    ? (filters as { or: unknown[] }).or
    : [];
  const combinator =
    filters && typeof filters === "object" && !Array.isArray(filters) &&
      Array.isArray((filters as Record<string, unknown>).or)
      ? "or"
      : "and";
  const terms = nodes.flatMap((node) => {
    if (typeof node !== "string") return [];
    const folder = node.match(/^file\.inFolder\((["'])(.*?)\1\)$/);
    if (folder) {
      return [{ property: "@inFolder", operator: "eq", value: folder[2] }];
    }
    const tag = node.match(/^file\.hasTag\((["'])(.*?)\1\)$/);
    if (tag) return [{ property: "@hasTag", operator: "eq", value: tag[2] }];
    const empty = node.match(/^(!)?([\w.]+)\.isEmpty\(\)$/);
    if (empty) {
      return [{
        property: empty[2],
        operator: empty[1] ? "notEmpty" : "empty",
        value: "",
      }];
    }
    const contains = node.match(/^(!)?([\w.]+)\.contains\((.*)\)$/);
    if (contains) {
      return [{
        property: contains[2],
        operator: contains[1] ? "notContains" : "contains",
        value: unquote(contains[3]),
      }];
    }
    const dateCondition = node.match(/^([\w.]+)\.date\(\)\s*(==|!=|>=|<=|>|<)\s*(.*?)$/);
    const condition = dateCondition ?? node.match(/^([\w.]+)\s*(==|!=|>=|<=|>|<)\s*(.*?)$/);
    return condition
      ? [{
        property: condition[1],
        operator: ({
          "==": "eq",
          "!=": "neq",
          ">": "gt",
          "<": "lt",
          ">=": "gte",
          "<=": "lte",
        } as Record<string, string>)[condition[2]],
        value: unquote(condition[3]),
      }]
      : [];
  });
  return {
    combinator,
    terms,
    representable: nodes.length === terms.length || filters == null,
  };
}
function termExpression(term: FilterTerm, dateField = false): string {
  if (term.property === "@inFolder") {
    return `file.inFolder(${JSON.stringify(term.value)})`;
  }
  if (term.property === "@hasTag") {
    return `file.hasTag(${JSON.stringify(term.value)})`;
  }
  if (term.operator === "empty") return `${term.property}.isEmpty()`;
  if (term.operator === "notEmpty") return `!${term.property}.isEmpty()`;
  const literal = dateField && term.value
    ? `date(${JSON.stringify(term.value)})`
    : /^-?\d+(?:\.\d+)?$/.test(term.value)
    ? term.value
    : JSON.stringify(term.value);
  if (term.operator === "contains") {
    return `${term.property}.contains(${literal})`;
  }
  if (term.operator === "notContains") {
    return `!${term.property}.contains(${literal})`;
  }
  const operator =
    ({ eq: "==", neq: "!=", gt: ">", lt: "<", gte: ">=", lte: "<=" } as Record<
      string,
      string
    >)[term.operator] ?? "==";
  return `${term.property}${dateField && term.value ? ".date()" : ""} ${operator} ${literal}`;
}
function unwrapDateExpression(value: string): string {
  const match = value.trim().match(/^date\((['"])(\d{4}-\d{2}-\d{2})(?:[ T][^'"]*)?\1\)$/);
  return match?.[2] ?? value;
}
function isDateFieldValue(value: unknown): boolean {
  return value instanceof Date || typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(value.trim());
}
function unquote(value: string): string {
  const trimmed = value.trim();
  return ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ? trimmed.slice(1, -1)
    : trimmed;
}

function extractFolder(node: unknown): string | null {
  if (typeof node === "string") {
    return node.match(/file\.inFolder\((["'])(.*?)\1\)/)?.[2] ?? null;
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const record = node as Record<string, unknown>;
  for (
    const child of [record.and, record.or, record.not].flatMap((value) =>
      Array.isArray(value) ? value : []
    )
  ) {
    const found = extractFolder(child);
    if (found) return found;
  }
  return null;
}
