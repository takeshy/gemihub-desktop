import { useEffect, useState } from "react";
import { Check, FolderOpen, Pencil, Plus, Save, X } from "lucide-react";
import { createProject, deleteProject, selectProjectDirectory, updateProject, type ProjectState } from "../lib/wailsBackend";

export function ProjectsSettings({ state, defaultPath, onChange, onActivate, onBeforeActiveProjectMutation }: {
  state: ProjectState;
  defaultPath: string;
  onChange: (state: ProjectState) => void;
  onActivate: (id: string) => Promise<void>;
  onBeforeActiveProjectMutation: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    const project = state.projects.find((item) => item.id === editing);
    if (project) { setName(project.name); setPath(project.path); }
  }, [editing, state.projects]);

  const browse = async () => {
    const selected = await selectProjectDirectory();
    if (selected) setPath(selected);
  };
  const reset = () => { setAdding(false); setEditing(""); setName(""); setPath(""); setError(""); };
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true); setError("");
    try {
      if (editing === state.activeProjectId) onBeforeActiveProjectMutation();
      if (editing) {
        onChange(await updateProject(editing, name.trim(), path));
      } else {
        const created = await createProject(name.trim(), path);
        const project = created.projects.at(-1);
        if (project) await onActivate(project.id);
        else onChange(created);
      }
      reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  return <div className="projects-settings">
    <section className="settings-info-card"><FolderOpen size={20} /><div><strong>Projects</strong><p>Each project has its own Dashboards, Secrets, skills, and workflows directories, independent from the working directory shown in FileTree. The memo directory is configured separately in Workspace settings.</p></div></section>
    <div className="projects-settings-header"><div><strong>{state.projects.filter((project) => !project.session).length} projects</strong><small>{state.activeProjectId ? "Removing a project here never deletes its files." : "Default is session-only. Select or create a project to use project files."}</small></div><button type="button" className="settings-choice" onClick={() => { reset(); setPath(defaultPath); setAdding(true); }}><Plus size={14} />New project</button></div>
    {(adding || editing) && <section className="project-editor">
      <header><strong>{editing ? "Edit project" : "New project"}</strong><button type="button" onClick={reset}><X size={14} /></button></header>
      <label className="settings-field"><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Client project" /></label>
      <label className="settings-field"><span>Directory</span><div className="settings-path-row"><input value={path} onChange={(event) => setPath(event.target.value)} placeholder="Leave empty to use the managed app directory" /><button type="button" className="settings-browse" onClick={() => void browse()}>Browse</button></div><small className="settings-hint">A managed project is created under the operating system's standard application configuration directory.</small></label>
      {error && <div className="settings-warning">{error}</div>}
      <footer><button type="button" className="settings-choice" disabled={busy || !name.trim() || (!!editing && !path.trim())} onClick={() => void submit()}><Save size={14} />{busy ? "Saving…" : "Save project"}</button></footer>
    </section>}
    <div className="project-list">{state.projects.map((project) => {
      const active = project.id === state.activeProjectId;
      return <article key={project.id} className={active ? "active" : ""}><div className="project-list-icon"><FolderOpen size={17} /></div><div><strong>{project.name}{project.session ? " (this session)" : ""}</strong><small title={project.path}>{project.path}</small></div>{active ? <span className="project-active"><Check size={12} />Active</span> : <button type="button" className="settings-choice" disabled={busy || project.session} onClick={() => void onActivate(project.id)}>Switch</button>}{!project.session && <button type="button" className="project-icon-button" onClick={() => { setAdding(false); setEditing(project.id); }} title="Edit project"><Pencil size={13} /></button>}{!project.session && <button type="button" className="project-icon-button danger" disabled={active || state.projects.filter((item) => !item.session).length <= 1} onClick={() => { if (!confirm(`Remove ${project.name} from Projects? Its files will not be deleted.`)) return; setBusy(true); void deleteProject(project.id).then(onChange).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught))).finally(() => setBusy(false)); }} title={active ? "Switch to another project before removing this one" : "Remove project"}><X size={13} /></button>}</article>;
    })}</div>
  </div>;
}
