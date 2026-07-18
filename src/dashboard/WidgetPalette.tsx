import { useEffect } from "react";
import { CalendarDays, Database, FileText, Globe, KanbanSquare, KeyRound, List, MessageCircle, Workflow, X } from "lucide-react";
import { dashboardWidgetDefinitions } from "./widgetRegistry";

const icons = { base: Database, file: FileText, kanban: KanbanSquare, timeline: MessageCircle, calendar: CalendarDays, workflow: Workflow, web: Globe, "memo-list": List, "secret-manager": KeyRound } as const;
const paletteOrder = ["base", "file", "kanban"];

export function WidgetPalette({ onSelect, onClose }: { onSelect: (type: string) => void; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const definitions = dashboardWidgetDefinitions().filter((definition) => !definition.hidden && !definition.hiddenFromPalette).sort((left, right) => { const a = paletteOrder.indexOf(left.type), b = paletteOrder.indexOf(right.type); return (a < 0 ? paletteOrder.length : a) - (b < 0 ? paletteOrder.length : b); });
  return <div className="dashboard-modal-backdrop" onClick={onClose}><section className="dashboard-widget-palette" onClick={(event) => event.stopPropagation()}><header><strong>Add Widget</strong><button type="button" onClick={onClose}><X size={18} /></button></header><div>{definitions.map((definition) => { const Icon = icons[definition.type as keyof typeof icons] || FileText; return <button type="button" key={definition.type} onClick={() => onSelect(definition.type)}>{definition.icon ?? <Icon size={22} />}<strong>{definition.label}</strong></button>; })}</div></section></div>;
}
