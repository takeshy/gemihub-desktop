import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Library, RefreshCw, Sparkles } from "lucide-react";
import type { ChatSettings } from "../llm/settings";
import { compareVersions, fetchSkillCatalog, importExternalSkills, listInstalledSkills, OFFICIAL_SKILLS_REPO, type InstalledSkill, type SkillCatalogEntry } from "./externalSkills";
import { discoverWorkspaceSkills, type WorkspaceSkill } from "./skills";
import { ModifySkillWithAIModal } from "./ModifySkillWithAIModal";

export function AgentSkillsSettings({ directoryBase, settings }: { directoryBase: string; settings: ChatSettings }) {
  const [catalog, setCatalog] = useState<SkillCatalogEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyID, setBusyID] = useState("");
  const [status, setStatus] = useState("");
  const [workspaceSkills, setWorkspaceSkills] = useState<WorkspaceSkill[]>([]);
  const [modifySkill, setModifySkill] = useState<WorkspaceSkill | null>(null);

  const reload = useCallback(async () => {
    if (!directoryBase) return;
    setLoading(true); setStatus("Loading the official skills catalog…");
    try {
      const [catalogResult, installedResult, skillsResult] = await Promise.allSettled([fetchSkillCatalog(), listInstalledSkills(), discoverWorkspaceSkills()]);
      if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value);
      if (installedResult.status === "fulfilled") setInstalled(installedResult.value);
      if (skillsResult.status === "fulfilled") setWorkspaceSkills(skillsResult.value.filter((skill) => !skill.builtin));
      const failed = [catalogResult, installedResult, skillsResult].find((result) => result.status === "rejected");
      setStatus(failed?.status === "rejected" ? `Some Skill data could not be loaded: ${failed.reason instanceof Error ? failed.reason.message : String(failed.reason)}` : "");
    } catch (error) { setStatus(`Could not load skills: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setLoading(false); }
  }, [directoryBase]);

  useEffect(() => { void reload(); }, [reload]);
  const installedIDs = useMemo(() => new Set(installed.map((skill) => skill.id)), [installed]);
  const installable = catalog.filter((skill) => !installedIDs.has(skill.id));
  useEffect(() => { if (!installable.some((skill) => skill.id === selected)) setSelected(installable[0]?.id ?? ""); }, [catalog, installed, selected]);

  const install = async (id: string) => {
    if (!id || busyID) return;
    setBusyID(id); setStatus(`Installing ${id}…`);
    try {
      const result = await importExternalSkills([id]);
      if (!result.installed.includes(id)) throw new Error(result.skipped.find((item) => item.id === id)?.reason || "installation was skipped");
      setStatus(`Installed ${id} · ${result.fileCount} files`);
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
      const [nextCatalog, nextInstalled, nextSkills] = await Promise.all([fetchSkillCatalog(), listInstalledSkills(), discoverWorkspaceSkills()]);
      setCatalog(nextCatalog); setInstalled(nextInstalled); setWorkspaceSkills(nextSkills.filter((skill) => !skill.builtin));
    } catch (error) { setStatus(`Could not install ${id}: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusyID(""); }
  };

  return <div className="agent-skills-settings">
    <section className="settings-info-card"><Library size={20} /><div><strong>Agent skills</strong><p>Built-in skills are ready in Chat. Custom and installed skills live under <code>skills/&lt;id&gt;/SKILL.md</code> in the active Project and can include references and executable <code>*.workflow.yaml</code> files.</p></div></section>
    <section className="settings-info-card"><Download size={20} /><div><strong>Official skills repository</strong><p><code>{OFFICIAL_SKILLS_REPO}</code>. Only compatible, versioned skills with a valid manifest are installed, and every path is confined to its own skill directory.</p></div></section>
    {!directoryBase ? <div className="settings-warning">A project is required to install skills. <button type="button" className="settings-browse" onClick={() => window.dispatchEvent(new Event("llm-hub:project-required"))}>Select or create a project</button></div> : <>
      <div className="agent-skills-install"><select className="settings-select" value={selected} disabled={loading || !installable.length || !!busyID} onChange={(event) => setSelected(event.target.value)}><option value="">{installable.length ? "Select a skill" : "All catalog skills are installed"}</option>{installable.map((skill) => <option key={skill.id} value={skill.id}>{skill.name} · v{skill.version}</option>)}</select><button type="button" className="settings-choice" disabled={!selected || !!busyID} onClick={() => void install(selected)}><Download size={14} />Install</button><button type="button" className="settings-browse" disabled={loading || !!busyID} onClick={() => void reload()}><RefreshCw size={14} />Retry</button></div>
      {status && <div className={status.startsWith("Installed") ? "settings-status ok" : "settings-status"}>{status}</div>}
      {installed.length > 0 && <div className="agent-skills-installed"><strong>Installed skills</strong>{installed.map((skill) => { const remote = catalog.find((entry) => entry.id === skill.id); const workspaceSkill = workspaceSkills.find((entry) => entry.folderPath.toLowerCase() === `skills/${skill.id}`.toLowerCase()); const update = !!remote && !!skill.version && (compareVersions(remote.version, skill.version) ?? 0) > 0; return <article key={skill.id}><div><CheckCircle2 size={15} /><span><strong>{workspaceSkill?.name || skill.name}</strong><small>{skill.version ? `v${skill.version}` : "Local Skill"}{update ? ` → v${remote!.version}` : ""} · {workspaceSkill?.workflows.length || 0} Workflows</small></span></div><div className="agent-skill-actions">{workspaceSkill && <button type="button" className="settings-choice" disabled={!!busyID} onClick={() => setModifySkill(workspaceSkill)}><Sparkles size={13}/>Modify with AI</button>}{update && <button type="button" className="settings-browse" disabled={!!busyID} onClick={() => { if (window.confirm(`Update ${skill.name} from v${skill.version} to v${remote!.version}?`)) void install(skill.id); }}><RefreshCw size={13} />Update</button>}</div></article>; })}</div>}
    </>}
    {modifySkill && <ModifySkillWithAIModal skill={modifySkill} settings={settings} onApplied={reload} onClose={() => setModifySkill(null)}/>}
  </div>;
}
