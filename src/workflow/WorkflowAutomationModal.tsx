import { useState } from "react";
import { Keyboard, X, Zap } from "lucide-react";
import { keyboardEventShortcut, workflowEventLabels, type WorkflowAutomationSettings, type WorkflowEventTrigger, type WorkflowEventType } from "./automationSettings";

const events = Object.entries(workflowEventLabels) as Array<[WorkflowEventType, string]>;

export function WorkflowAutomationModal({ path, name, settings, onSave, onClose }: { path: string; name: string; settings: WorkflowAutomationSettings; onSave: (settings: WorkflowAutomationSettings) => void; onClose: () => void }) {
  const current = settings.triggers.find((trigger) => trigger.workflowId === path);
  const [selected, setSelected] = useState<WorkflowEventType[]>(current?.events ?? []);
  const [pattern, setPattern] = useState(current?.filePattern ?? "");
  const [hotkey, setHotkey] = useState(settings.hotkeys[path] ?? "");
  const save = () => {
    const triggers = settings.triggers.filter((trigger) => trigger.workflowId !== path);
    if (selected.length) triggers.push({ workflowId: path, events: selected, filePattern: pattern.trim() || undefined } satisfies WorkflowEventTrigger);
    const hotkeys = { ...settings.hotkeys };
    if (hotkey) hotkeys[path] = hotkey; else delete hotkeys[path];
    onSave({ hotkeys, triggers });
    onClose();
  };
  return <div className="workflow-modal-backdrop" onClick={onClose}>
    <section className="workflow-automation-modal" onClick={(event) => event.stopPropagation()}>
      <header><div><Zap size={17} /><strong>Automation · {name}</strong></div><button type="button" onClick={onClose}><X size={16} /></button></header>
      <label className="workflow-modal-field"><span><Keyboard size={13} />Keyboard shortcut</span><input value={hotkey} placeholder="Click and press keys" onKeyDown={(event) => { event.preventDefault(); if (event.key === "Backspace" || event.key === "Delete") { setHotkey(""); return; } const value = keyboardEventShortcut(event.nativeEvent); if (value) setHotkey(value); }} readOnly /><small>Focus the field and press the desired combination. Backspace clears it.</small></label>
      <fieldset><legend>Events</legend>{events.map(([id, label]) => <label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={(event) => setSelected((currentEvents) => event.target.checked ? [...currentEvents, id] : currentEvents.filter((value) => value !== id))} />{label}</label>)}</fieldset>
      <label className="workflow-modal-field"><span>File pattern</span><input value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="**/*" /><small>Supports *, **, ?, character classes and brace alternatives. Ignored for app startup.</small></label>
      <footer><button type="button" onClick={() => { setSelected([]); setHotkey(""); }}>Clear</button><button type="button" className="primary" onClick={save}>Save</button></footer>
    </section>
  </div>;
}
