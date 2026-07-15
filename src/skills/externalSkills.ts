import { createDirectory, externalHTTPRequest, fileInventory, readFile, writeFile } from "../lib/wailsBackend";
import { applyHostPatches } from "../lib/hostPatches";

export const OFFICIAL_SKILLS_REPO = "takeshy/llm-hub-skills";
export const SKILLS_HOST_ID = "gemihub-desktop";
export const SKILLS_HOST_VERSION = "0.1.0";
const SKILLS_COMPATIBLE_HOST_IDS = new Set([SKILLS_HOST_ID, "gemihub", "llm-hub-workspace", "llm-hub"]);

export interface SourceFile { relativePath: string; content: string }
export interface SkillCatalogEntry { id: string; name: string; version: string; description: string }
export interface InstalledSkill { id: string; name: string; version: string | null }
export interface ImportExternalSkillsResult {
  skillCount: number;
  fileCount: number;
  installed: string[];
  skipped: Array<{ id: string; reason: string }>;
}

interface PluginCompatibility { id?: string; minVersion?: string; maxVersion?: string }
interface SkillManifest {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  hostPatches?: Record<string, string[]>;
  compatibility?: { plugins?: PluginCompatibility[] };
  compatiblePlugins?: string[];
}

interface ParsedSemver { major: number; minor: number; patch: number; prerelease: string[] }
const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function normalizePath(path: string): string { return path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""); }
function safeSkillID(id: string): boolean { return /^[a-z0-9][a-z0-9-]*$/i.test(id); }
function unsafePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return /^(?:\/|[a-z]:\/)/i.test(normalized) || normalized.split("/").some((part) => part === "." || part === "..");
}

function parseSemver(version: string): ParsedSemver | null {
  const match = version.trim().match(semverPattern);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4]?.split(".") ?? [] } : null;
}

function comparePrerelease(left: string[], right: string[]): number {
  if (!left.length || !right.length) return left.length ? -1 : right.length ? 1 : 0;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumber = /^\d+$/.test(left[index]);
    const rightNumber = /^\d+$/.test(right[index]);
    if (leftNumber && rightNumber) return Number(left[index]) - Number(right[index]);
    if (leftNumber) return -1;
    if (rightNumber) return 1;
    return left[index].localeCompare(right[index]);
  }
  return 0;
}

export function compareVersions(leftValue: string, rightValue: string): number | null {
  const left = parseSemver(leftValue), right = parseSemver(rightValue);
  if (!left || !right) return null;
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch || comparePrerelease(left.prerelease, right.prerelease);
}

function parseManifest(content?: string): SkillManifest | null {
  if (!content) return null;
  try {
    const value = JSON.parse(content) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as SkillManifest : null;
  } catch { return null; }
}

function compatible(manifest: SkillManifest | null, hostID: string, hostVersion: string): boolean {
  if (!manifest) return true;
  const entries = manifest.compatibility?.plugins;
  if (Array.isArray(entries) && entries.length) {
    // GemiHub Desktop consumes the shared GemiHub Skill file contract while
    // retaining the pre-rename desktop and LLM Hub compatibility aliases.
    const acceptedIDs = hostID === SKILLS_HOST_ID ? SKILLS_COMPATIBLE_HOST_IDS : new Set([hostID]);
    const entry = entries.find((item) => item.id && acceptedIDs.has(item.id));
    if (!entry) return false;
    // The workspace port implements the current Agent Skills contract. The
    // legacy llm-hub version floor describes that contract, not this app's
    // independent package version.
    const effectiveVersion = hostID === SKILLS_HOST_ID && entry.id !== SKILLS_HOST_ID ? "999.0.0" : hostVersion;
    const minimum = entry.minVersion ? compareVersions(effectiveVersion, entry.minVersion) : 0;
    const maximum = entry.maxVersion ? compareVersions(effectiveVersion, entry.maxVersion) : 0;
    return minimum !== null && minimum >= 0 && maximum !== null && maximum <= 0;
  }
  if (manifest.compatiblePlugins?.length) return manifest.compatiblePlugins.some((id) => id === hostID || (hostID === SKILLS_HOST_ID && SKILLS_COMPATIBLE_HOST_IDS.has(id)));
  return true;
}

function groupFiles(files: SourceFile[]): Map<string, SourceFile[]> {
  const groups = new Map<string, SourceFile[]>();
  for (const source of files) {
    const relativePath = normalizePath(source.relativePath);
    const id = relativePath.split("/")[0];
    if (!id || !relativePath.includes("/")) continue;
    groups.set(id, [...(groups.get(id) ?? []), { ...source, relativePath }]);
  }
  return groups;
}

export function getSafeSkillTargetPath(skillID: string, relativePath: string): string | null {
  if (!safeSkillID(skillID) || unsafePath(relativePath)) return null;
  const normalized = normalizePath(relativePath);
  if (!normalized.startsWith(`${skillID}/`)) return null;
  return `skills/${normalized}`;
}

async function githubFiles(manifestsOnly = false): Promise<SourceFile[]> {
  const repository = await externalHTTPRequest({ url: `https://api.github.com/repos/${OFFICIAL_SKILLS_REPO}`, method: "GET", headers: { Accept: "application/vnd.github+json" } });
  if (repository.status < 200 || repository.status >= 300) throw new Error(`Failed to fetch skills repository: ${repository.status}`);
  const branch = (JSON.parse(repository.body) as { default_branch?: string }).default_branch || "main";
  const tree = await externalHTTPRequest({ url: `https://api.github.com/repos/${OFFICIAL_SKILLS_REPO}/git/trees/${encodeURIComponent(branch)}?recursive=1`, method: "GET", headers: { Accept: "application/vnd.github+json" } });
  if (tree.status < 200 || tree.status >= 300) throw new Error(`Failed to fetch skills tree: ${tree.status}`);
  const payload = JSON.parse(tree.body) as { truncated?: boolean; tree?: Array<{ path?: string; type?: string }> };
  if (payload.truncated) throw new Error("Skills repository tree was truncated.");
  const paths = (payload.tree ?? []).filter((item) => item.type === "blob" && typeof item.path === "string")
    .map((item) => item.path!).filter((path) => manifestsOnly ? /^skills\/[^/]+\/manifest\.json$/.test(path) : /^skills\/[^/]+\/.+/.test(path)).sort();
  return await Promise.all(paths.map(async (path) => {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const response = await externalHTTPRequest({ url: `https://raw.githubusercontent.com/${OFFICIAL_SKILLS_REPO}/${encodeURIComponent(branch)}/${encoded}`, method: "GET", headers: {} });
    if (response.status < 200 || response.status >= 300) throw new Error(`Failed to fetch ${path}: ${response.status}`);
    return { relativePath: path.slice("skills/".length), content: response.body };
  }));
}

export async function fetchSkillCatalog(): Promise<SkillCatalogEntry[]> {
  const entries: SkillCatalogEntry[] = [];
  for (const file of await githubFiles(true)) {
    const id = normalizePath(file.relativePath).split("/")[0];
    const manifest = parseManifest(file.content);
    if (!safeSkillID(id) || !manifest || (manifest.id && manifest.id !== id) || !manifest.version || !parseSemver(manifest.version) || !compatible(manifest, SKILLS_HOST_ID, SKILLS_HOST_VERSION)) continue;
    entries.push({ id, name: manifest.name || id, version: manifest.version, description: manifest.description || "" });
  }
  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

export async function listInstalledSkills(): Promise<InstalledSkill[]> {
  const skillFiles = (await fileInventory()).filter((file) => /^skills\/[^/]+\/SKILL\.md$/i.test(file.path));
  const result = await Promise.all(skillFiles.map(async (entry) => {
    const id = entry.path.split("/")[1];
    if (!safeSkillID(id)) return null;
    const manifest = parseManifest((await readFile(`skills/${id}/manifest.json`))?.content);
    return { id, name: manifest?.name || id, version: manifest?.version ?? null };
  }));
  return result.filter((item): item is InstalledSkill => item !== null).sort((left, right) => left.id.localeCompare(right.id));
}

export async function installSkillFiles(
  files: SourceFile[], skillIDs: string[] = [], hostID = SKILLS_HOST_ID, hostVersion = SKILLS_HOST_VERSION,
  installedManifests: Record<string, string | undefined> = {},
): Promise<ImportExternalSkillsResult> {
  const groups = groupFiles(files);
  const targets = skillIDs.length ? skillIDs : [...groups.keys()].sort();
  const installed: string[] = [], skipped: Array<{ id: string; reason: string }> = [];
  let fileCount = 0;
  await createDirectory("skills");
  for (const id of targets) {
    if (!safeSkillID(id)) { skipped.push({ id, reason: "invalid skill id" }); continue; }
    const skillFiles = groups.get(id);
    if (!skillFiles?.some((file) => file.relativePath === `${id}/SKILL.md`)) { skipped.push({ id, reason: "SKILL.md not found" }); continue; }
    const manifestFile = skillFiles.find((file) => file.relativePath === `${id}/manifest.json`);
    const manifest = parseManifest(manifestFile?.content);
    if (!manifestFile) { skipped.push({ id, reason: "manifest.json required" }); continue; }
    if (!manifest) { skipped.push({ id, reason: "invalid manifest.json" }); continue; }
    if (manifest.id && manifest.id !== id) { skipped.push({ id, reason: `manifest id mismatch: ${manifest.id}` }); continue; }
    if (!manifest.version || !parseSemver(manifest.version)) { skipped.push({ id, reason: "missing or invalid manifest version" }); continue; }
    if (!compatible(manifest, hostID, hostVersion)) { skipped.push({ id, reason: `not compatible with ${hostID} ${hostVersion}` }); continue; }
    const current = parseManifest(installedManifests[id] ?? (await readFile(`skills/${id}/manifest.json`))?.content);
    if (current?.version) {
      const comparison = compareVersions(manifest.version, current.version);
      if (comparison === null) { skipped.push({ id, reason: "invalid manifest version" }); continue; }
      if (comparison <= 0) { skipped.push({ id, reason: `installed version ${current.version} is current` }); continue; }
    }
    const patchHostID = hostID === SKILLS_HOST_ID && !manifest.hostPatches?.[hostID] && manifest.hostPatches?.["llm-hub-workspace"] ? "llm-hub-workspace" : hostID;
    const patched = applyHostPatches(id, skillFiles, manifest, patchHostID);
    if (patched.error) { skipped.push({ id, reason: patched.error }); continue; }
    const writes: Array<{ path: string; content: string }> = [];
    for (const file of patched.files) {
      const path = getSafeSkillTargetPath(id, file.relativePath);
      if (!path) { skipped.push({ id, reason: `unsafe path: ${file.relativePath}` }); writes.length = 0; break; }
      writes.push({ path, content: file.content });
    }
    if (!writes.length) continue;
    for (const file of writes) { await writeFile(file.path, file.content); fileCount++; }
    installed.push(id);
  }
  return { skillCount: installed.length, fileCount, installed, skipped };
}

export async function importExternalSkills(skillIDs: string[]): Promise<ImportExternalSkillsResult> {
  return await installSkillFiles(await githubFiles(false), skillIDs);
}
