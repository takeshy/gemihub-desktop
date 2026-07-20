import { applyHostPatches } from "../lib/hostPatches";
import {
  externalHTTPRequest,
  installPluginFiles,
  readWorkspaceFile,
  uninstallManagedPlugin,
} from "../lib/wailsBackend";
import type { PluginConfig, PluginManifest, PluginPermission } from "./types";

export const PLUGIN_HOST_ID = "gemihub-desktop";
export const PLUGIN_HOST_VERSION = "0.15.3";
const OFFICIAL_PLUGIN_OWNERS = new Set(["takeshy"]);

export type PluginRecommendation = "official" | "custom" | "third-party";

/**
 * Classify provenance from host-controlled install metadata. Manifest fields
 * are intentionally ignored because an untrusted plugin could forge them.
 */
export function pluginRecommendation(
  config?: Pick<PluginConfig, "source" | "repo">,
): PluginRecommendation {
  if (!config || config.source === "local") return "custom";
  const owner = config.repo?.split("/", 1)[0]?.toLowerCase();
  return owner && OFFICIAL_PLUGIN_OWNERS.has(owner)
    ? "official"
    : "third-party";
}

const SEMVER_RE =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const KNOWN_PERMISSIONS = new Set<PluginPermission>([
  "files",
  "storage",
  "network",
  "llm",
  "drive",
  "gemini",
  "calendar",
  "gmail",
  "sheets",
]);

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}
interface GitHubRelease {
  tag_name: string;
  assets: ReleaseAsset[];
}

export interface PluginPreview {
  repo: string;
  releaseTag: string;
  manifest: PluginManifest;
  manifestSHA256: string;
}

export interface PluginInstallMetadata {
  id: string;
  repo: string;
  version: string;
  releaseTag: string;
  host: string;
  installedAt: string;
  patches: Array<{ name: string; sha256: string }>;
}

function normalizedVersion(value: string): string {
  return value.trim().replace(/^[vV](?=\d)/, "");
}

function parseSemver(value: string): [number, number, number, string[]] | null {
  const match = normalizedVersion(value).match(SEMVER_RE);
  return match
    ? [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      match[4]?.split(".") ?? [],
    ]
    : null;
}

function comparePrerelease(left: string[], right: string[]): number {
  if (!left.length || !right.length) {
    return left.length ? -1 : right.length ? 1 : 0;
  }
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined) return -1;
    if (right[i] === undefined) return 1;
    if (left[i] === right[i]) continue;
    const ln = /^\d+$/.test(left[i]), rn = /^\d+$/.test(right[i]);
    if (ln && rn) return Number(left[i]) - Number(right[i]);
    if (ln) return -1;
    if (rn) return 1;
    return left[i].localeCompare(right[i]);
  }
  return 0;
}

export function comparePluginVersions(
  leftValue: string,
  rightValue: string,
): number | null {
  const left = parseSemver(leftValue), right = parseSemver(rightValue);
  if (!left || !right) return null;
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2] ||
    comparePrerelease(left[3], right[3]);
}

export function normalizePluginRepo(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthand) return `${shorthand[1]}/${shorthand[2]}`;
  try {
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parsed.protocol === "https:" && parsed.hostname === "github.com" &&
        !parsed.search && !parsed.hash && parts.length === 2 &&
        parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part))
      ? `${parts[0]}/${parts[1]}`
      : null;
  } catch {
    return null;
  }
}

async function getJSON<T>(url: string): Promise<T> {
  const response = await externalHTTPRequest({
    url,
    method: "GET",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Request failed: HTTP ${response.status}`);
  }
  return JSON.parse(response.body) as T;
}

async function getText(url: string): Promise<string> {
  const response = await externalHTTPRequest({
    url,
    method: "GET",
    headers: {},
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  return response.body;
}

async function sha256Text(content: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

function releaseAssetFileName(path: string): string | null {
  if (path.includes("\\") || path.startsWith("/")) return null;
  const segments = path.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) return null;
  const name = segments.at(-1)!;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? name : null;
}

function validateManifest(raw: unknown, releaseTag: string): PluginManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid manifest.json");
  }
  const manifest = raw as PluginManifest;
  for (
    const field of [
      "id",
      "name",
      "version",
      "minAppVersion",
      "description",
      "author",
    ] as const
  ) {
    if (typeof manifest[field] !== "string" || !manifest[field]?.trim()) {
      throw new Error(`manifest.json requires ${field}`);
    }
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(manifest.id)) {
    throw new Error("Invalid plugin id");
  }
  if (!parseSemver(manifest.version) || !parseSemver(manifest.minAppVersion!)) {
    throw new Error("Plugin versions must use semver");
  }
  if (comparePluginVersions(manifest.version, releaseTag) !== 0) {
    throw new Error("Release tag and manifest version do not match");
  }
  if (
    (comparePluginVersions(PLUGIN_HOST_VERSION, manifest.minAppVersion!) ??
      -1) < 0
  ) {
    throw new Error(
      `Plugin requires ${PLUGIN_HOST_ID} ${manifest.minAppVersion} or newer`,
    );
  }
  if (
    manifest.permissions &&
    (!Array.isArray(manifest.permissions) ||
      manifest.permissions.some((permission) =>
        !KNOWN_PERMISSIONS.has(permission)
      ))
  ) throw new Error("manifest.json contains an unknown permission");
  if (manifest.assets) {
    if (!Array.isArray(manifest.assets)) {
      throw new Error("manifest assets must be an array");
    }
    const names = new Set<string>();
    for (const asset of manifest.assets) {
      if (
        !asset || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset.name) ||
        names.has(asset.name)
      ) throw new Error("Invalid or duplicate external asset name");
      names.add(asset.name);
      let parsed: URL;
      try {
        parsed = new URL(asset.url);
      } catch {
        throw new Error(`Invalid asset URL: ${asset.name}`);
      }
      if (parsed.protocol !== "https:") {
        throw new Error(`Asset URL must use HTTPS: ${asset.name}`);
      }
      if (asset.sha256 && !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
        throw new Error(`Invalid asset SHA-256: ${asset.name}`);
      }
    }
  }
  if (
    manifest.hostPatches &&
    (typeof manifest.hostPatches !== "object" ||
      Object.values(manifest.hostPatches).some((paths) =>
        !Array.isArray(paths) ||
        paths.some((path) =>
          typeof path !== "string" || !releaseAssetFileName(path)
        )
      ))
  ) throw new Error("Invalid hostPatches declaration");
  return manifest;
}

async function releaseInfo(
  repo: string,
): Promise<
  { release: GitHubRelease; manifest: PluginManifest; manifestText: string }
> {
  const release = await getJSON<GitHubRelease>(
    `https://api.github.com/repos/${repo}/releases/latest`,
  );
  const manifestAsset = release.assets.find((asset) =>
    asset.name === "manifest.json"
  );
  if (
    !manifestAsset || !release.assets.some((asset) => asset.name === "main.js")
  ) throw new Error("Release requires manifest.json and main.js assets");
  const manifestText = await getText(manifestAsset.browser_download_url);
  let raw: unknown;
  try {
    raw = JSON.parse(manifestText);
  } catch {
    throw new Error("Invalid manifest.json");
  }
  return {
    release,
    manifest: validateManifest(raw, release.tag_name),
    manifestText,
  };
}

export async function previewPluginRelease(
  input: string,
): Promise<PluginPreview> {
  const repo = normalizePluginRepo(input);
  if (!repo) throw new Error("Use a GitHub repository in owner/repo format");
  const { release, manifest, manifestText } = await releaseInfo(repo);
  return {
    repo,
    releaseTag: release.tag_name,
    manifest,
    manifestSHA256: await sha256Text(manifestText),
  };
}

export async function installPluginRelease(
  input: string,
  expectedID?: string,
  approvedPreview?: PluginPreview,
): Promise<{ config: PluginConfig; metadata: PluginInstallMetadata }> {
  const repo = normalizePluginRepo(input);
  if (!repo) throw new Error("Use a GitHub repository in owner/repo format");
  const { release, manifest, manifestText } = await releaseInfo(repo);
  if (expectedID && manifest.id !== expectedID) {
    throw new Error(`Plugin id changed from ${expectedID} to ${manifest.id}`);
  }
  if (approvedPreview) {
    const unchanged = approvedPreview.repo === repo &&
      approvedPreview.releaseTag === release.tag_name &&
      approvedPreview.manifest.id === manifest.id &&
      approvedPreview.manifestSHA256 === await sha256Text(manifestText);
    if (!unchanged) {
      throw new Error(
        "The GitHub release changed after preview. Review the plugin again before installing.",
      );
    }
  }
  const requiredNames = [
    "main.js",
    ...(release.assets.some((asset) => asset.name === "styles.css")
      ? ["styles.css"]
      : []),
  ];
  const patchNames = manifest.hostPatches?.[PLUGIN_HOST_ID] ?? [];
  const uniqueNames = [...new Set([...requiredNames, ...patchNames])];
  const downloaded = await Promise.all(uniqueNames.map(async (name) => {
    const assetName = releaseAssetFileName(name);
    if (!assetName) throw new Error(`Unsafe release asset name: ${name}`);
    const asset = release.assets.find((candidate) =>
      candidate.name === assetName
    );
    if (!asset) throw new Error(`Release asset not found: ${name}`);
    return {
      relativePath: `${manifest.id}/${name}`,
      content: await getText(asset.browser_download_url),
    };
  }));
  const sourceFiles = [{
    relativePath: `${manifest.id}/manifest.json`,
    content: manifestText,
  }, ...downloaded];
  const patched = applyHostPatches(
    manifest.id,
    sourceFiles,
    manifest,
    PLUGIN_HOST_ID,
    { protectedPaths: ["manifest.json"] },
  );
  if (patched.error) throw new Error(`Host patch failed: ${patched.error}`);
  const patchSet = new Set(patchNames.map((name) => `${manifest.id}/${name}`));
  const files = Object.fromEntries(
    patched.files.filter((file) => !patchSet.has(file.relativePath)).map((
      file,
    ) => [file.relativePath.slice(manifest.id.length + 1), file.content]),
  );
  if (!files["main.js"]) throw new Error("Host patch removed main.js");
  const metadata: PluginInstallMetadata = {
    id: manifest.id,
    repo,
    version: manifest.version,
    releaseTag: release.tag_name,
    host: PLUGIN_HOST_ID,
    installedAt: new Date().toISOString(),
    patches: await Promise.all(patched.applied.map(async (name) => ({
      name,
      sha256: await sha256Text(
        downloaded.find((file) =>
          file.relativePath === `${manifest.id}/${name}`
        )?.content ?? "",
      ),
    }))),
  };
  await installPluginFiles(
    manifest.id,
    files,
    JSON.stringify(metadata, null, 2),
  );
  return {
    config: {
      id: manifest.id,
      enabled: false,
      version: manifest.version,
      releaseTag: release.tag_name,
      repo,
      source: "github",
      permissions: manifest.permissions,
    },
    metadata,
  };
}

export async function readPluginInstallMetadata(
  id: string,
): Promise<PluginInstallMetadata | null> {
  try {
    const file = await readWorkspaceFile(`.llm-hub/plugins/${id}/install.json`);
    return file?.content
      ? JSON.parse(file.content) as PluginInstallMetadata
      : null;
  } catch {
    return null;
  }
}

export async function checkPluginUpdate(
  config: PluginConfig,
): Promise<PluginPreview | null> {
  if (!config.repo) return null;
  const preview = await previewPluginRelease(config.repo);
  const comparison = comparePluginVersions(
    preview.manifest.version,
    config.version,
  );
  if (comparison === null) {
    throw new Error("Installed plugin has an invalid version");
  }
  return comparison > 0 ? preview : null;
}

export async function uninstallPluginRelease(id: string): Promise<void> {
  await uninstallManagedPlugin(id);
}
