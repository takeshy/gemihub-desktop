export const GEMIHUB_OKF_NAME = "GemiHub";

export interface GemihubOkfManifest {
  name: string;
  version: string;
  publishedAt: string;
  bundleUrl: string;
  sha256: string;
  minAppVersion?: string;
  files: Record<string, string>;
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const MAX_MANIFEST_FILES = 200;

export function isSafeOkfRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export function parseGemihubOkfManifest(value: unknown): GemihubOkfManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid GemiHub OKF manifest");
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  const publishedAt = typeof raw.publishedAt === "string" ? raw.publishedAt.trim() : "";
  const bundleUrl = typeof raw.bundleUrl === "string" ? raw.bundleUrl.trim() : "";
  const sha256 = typeof raw.sha256 === "string" ? raw.sha256.trim().toLowerCase() : "";
  const minAppVersion = typeof raw.minAppVersion === "string" ? raw.minAppVersion.trim() : undefined;
  if (name !== GEMIHUB_OKF_NAME || !SEMVER_RE.test(version)) throw new Error("Invalid GemiHub OKF manifest identity");
  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) throw new Error("Invalid GemiHub OKF publish date");
  if (!bundleUrl || !SHA256_RE.test(sha256)) throw new Error("Invalid GemiHub OKF bundle metadata");
  if (minAppVersion && !SEMVER_RE.test(minAppVersion)) throw new Error("Invalid GemiHub OKF minimum app version");
  if (!raw.files || typeof raw.files !== "object" || Array.isArray(raw.files)) throw new Error("Invalid GemiHub OKF file manifest");
  const entries = Object.entries(raw.files as Record<string, unknown>);
  if (!entries.length || entries.length > MAX_MANIFEST_FILES) throw new Error("Invalid GemiHub OKF file count");
  const files: Record<string, string> = {};
  for (const [path, hash] of entries) {
    if (!isSafeOkfRelativePath(path) || !path.toLowerCase().endsWith(".md")) throw new Error(`Invalid GemiHub OKF file path: ${path}`);
    if (typeof hash !== "string" || !SHA256_RE.test(hash)) throw new Error(`Invalid GemiHub OKF file hash: ${path}`);
    files[path] = hash.toLowerCase();
  }
  return { name, version, publishedAt, bundleUrl, sha256, ...(minAppVersion ? { minAppVersion } : {}), files };
}

function parsedVersion(version: string): { core: number[]; prerelease: string | null } | null {
  if (!SEMVER_RE.test(version)) return null;
  const [core, prerelease] = version.split("-", 2);
  return { core: core.split(".").map(Number), prerelease: prerelease ?? null };
}

export function compareOkfVersions(left: string, right: string): number {
  const a = parsedVersion(left), b = parsedVersion(right);
  if (!a || !b) return left.localeCompare(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = a.core[index] - b.core[index];
    if (difference) return difference;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  const leftParts = a.prerelease.split("."), rightParts = b.prerelease.split(".");
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index], rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart), rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) - Number(rightPart);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

export function isGemihubOkfBundleName(name: string): boolean {
  return name.trim().toLowerCase().includes(GEMIHUB_OKF_NAME.toLowerCase());
}
