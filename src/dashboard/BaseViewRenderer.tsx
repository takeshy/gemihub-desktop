import type { Value } from "../bases/types";
import { valueToString } from "../bases/values";
import type { BaseQueryData } from "./baseEngine";
import {
  basePropertyLabel,
  formatBaseCellValue,
  type BaseDefinition,
  type DashboardDataRow,
} from "./dashboardData";

export function BaseViewRenderer({ data, definition, onOpenPath }: {
  data: BaseQueryData;
  definition: BaseDefinition | null;
  onOpenPath: (path: string) => void;
}) {
  const order = data.result.properties.length
    ? data.result.properties
    : ["file.name"];
  const rowByPath = new Map(data.rows.map((row) => [row.path, row]));
  const groups = data.result.groupedData.length
    ? data.result.groupedData.map((group) => ({
      label: valueToString(group.key),
      rows: group.entries.flatMap((entry) => {
        const row = rowByPath.get(entry.file.path);
        return row ? [row] : [];
      }),
      summaries: group.summaries,
    }))
    : [{ label: "", rows: data.rows, summaries: new Map<string, Value>() }];

  if (groups.every((group) => group.rows.length === 0)) {
    return <div className="base-renderer-empty">No results</div>;
  }
  if (data.view.type === "cards") {
    return (
      <div className="gemihub-base-groups">
        {groups.map((group, index) => (
          <section key={`${group.label}:${index}`}>
            <GroupHeader label={group.label} count={group.rows.length} summaries={group.summaries} definition={definition} />
            <div className={`gemihub-base-cards size-${String(data.view.cardSize || "medium").toLowerCase()}`}>
              {group.rows.map((row) => (
                <button type="button" key={row.path} onClick={() => onOpenPath(row.path)}>
                  <strong>{formatBaseCellValue(row, "file.name") || row.name}</strong>
                  {order.filter((property) => property !== "file.name").slice(0, 5).map((property) => {
                    const text = formatBaseCellValue(row, property);
                    return text ? <small key={property}>{text}</small> : null;
                  })}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }
  if (data.view.type === "list") {
    const marker = String(data.view.markers || data.view.marker || "bullets").toLowerCase();
    const separator = typeof data.view.separator === "string" ? data.view.separator : ", ";
    return (
      <div className="gemihub-base-groups">
        {groups.map((group, groupIndex) => (
          <section key={`${group.label}:${groupIndex}`}>
            <GroupHeader label={group.label} count={group.rows.length} summaries={group.summaries} definition={definition} />
            <ul className="gemihub-base-list">
              {group.rows.map((row, index) => {
                const values = order.slice(1).map((property) => formatBaseCellValue(row, property)).filter(Boolean);
                const bullet = ["none", "hidden"].includes(marker) ? "" : ["numbers", "numbered", "ordered"].includes(marker) ? `${index + 1}.` : "•";
                return (
                  <li key={row.path}>
                    <button type="button" onClick={() => onOpenPath(row.path)}>
                      {bullet && <span className="gemihub-base-marker">{bullet}</span>}
                      <strong>{formatBaseCellValue(row, order[0]) || row.name}</strong>
                      {values.length > 0 && <span>{values.join(separator)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  const rowHeight = String(data.view.rowHeight || "medium").toLowerCase();
  const summaries = Object.entries(data.view.summaries || {});
  return (
    <div className={`gemihub-base-table row-${rowHeight}`}>
      {groups.map((group, groupIndex) => (
        <section key={`${group.label}:${groupIndex}`}>
          <GroupHeader label={group.label} count={group.rows.length} summaries={group.summaries} definition={definition} />
          <table>
            <thead><tr>{order.map((property) => <th key={property}>{basePropertyLabel(definition, property)}</th>)}</tr></thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.path} tabIndex={0} onClick={() => onOpenPath(row.path)} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenPath(row.path); }
                }}>
                  {order.map((property) => <td key={property}>{formatBaseCellValue(row, property)}</td>)}
                </tr>
              ))}
            </tbody>
            {summaries.length > 0 && (
              <tfoot><tr>{order.map((property) => {
                const summary = data.view.summaries?.[property];
                const value = summary ? data.result.getSummaryValue(group.rows.map((row) => data.result.data.find((entry) => entry.file.path === row.path)).filter((entry): entry is BaseQueryData["result"]["data"][number] => !!entry), property, summary) : null;
                return <td key={property}>{summary && value ? <><span>{summary}: </span>{valueToString(value)}</> : ""}</td>;
              })}</tr></tfoot>
            )}
          </table>
        </section>
      ))}
    </div>
  );
}

function GroupHeader({ label, count, summaries, definition }: {
  label: string;
  count: number;
  summaries: Map<string, Value>;
  definition: BaseDefinition | null;
}) {
  if (!label && summaries.size === 0) return null;
  return (
    <header className="gemihub-base-group-header">
      {label && <strong>{label} <span>({count})</span></strong>}
      {summaries.size > 0 && <div>{[...summaries].map(([property, value]) => <span key={property}>{basePropertyLabel(definition, property)}: {valueToString(value)}</span>)}</div>}
    </header>
  );
}
