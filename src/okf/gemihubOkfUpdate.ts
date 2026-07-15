import { unzipSync } from "fflate";
import { externalHTTPRequest, readFile, writeFile } from "../lib/wailsBackend";
import { compareOkfVersions, parseGemihubOkfManifest, type GemihubOkfManifest } from "./gemihubOkfManifest";
import type { OkfBundle } from "./okf";

const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;

export interface GemihubOkfUpdateInfo {
  bundle: OkfBundle;
  bundleRoot: string;
  currentVersion: string | null;
  manifest: GemihubOkfManifest;
  endpoint: string;
  token: string;
  apiMode: boolean;
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function joinPath(...parts: string[]): string {
  return parts.map(normalizePath).filter(Boolean).join("/");
}

function endpointInfo(raw: string): { requestUrl: string; base: URL; apiMode: boolean } {
  const value = raw.trim();
  if (!value) throw new Error("GemiHub OKF update endpoint is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("GemiHub OKF update endpoint must use HTTPS");
  const apiMode = /\/api\/okf\/gemihub\/?$/i.test(parsed.pathname);
  if (apiMode) {
    parsed.searchParams.set("resource", "manifest");
    return { requestUrl: parsed.toString(), base: new URL(value), apiMode };
  }
  if (!parsed.pathname.toLowerCase().endsWith("manifest.json")) {
    parsed.pathname = `${parsed.pathname.replace(/\/?$/, "/")}manifest.json`;
  }
  return { requestUrl: parsed.toString(), base: parsed, apiMode };
}

function headers(token: string, accept: string): Record<string, string> {
  return { Accept: accept, ...(token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}) };
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function installedManifest(path: string): Promise<GemihubOkfManifest | null> {
  try {
    const file = await readFile(path);
    return file ? parseGemihubOkfManifest(JSON.parse(file.content)) : null;
  } catch {
    return null;
  }
}

export async function checkGemihubOkfUpdate(endpoint: string, token: string, okfRoot: string, bundle: OkfBundle): Promise<GemihubOkfUpdateInfo | null> {
  if (!endpoint.trim()) return null;
  const info = endpointInfo(endpoint);
  const response = await externalHTTPRequest({ url: info.requestUrl, method: "GET", headers: headers(token, "application/json") });
  if (response.status === 404) return null;
  if (response.status < 200 || response.status >= 300) throw new Error(`GemiHub OKF manifest request failed (${response.status})`);
  const payload = JSON.parse(response.body) as unknown;
  const candidate = info.apiMode && payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { available?: boolean; manifest?: unknown })
    : null;
  if (candidate && !candidate.available) return null;
  const manifest = parseGemihubOkfManifest(candidate?.manifest ?? payload);
  const bundleRoot = joinPath(okfRoot, bundle.id);
  const installed = await installedManifest(joinPath(bundleRoot, "manifest.json"));
  if (installed && compareOkfVersions(installed.version, manifest.version) >= 0) return null;
  return { bundle, bundleRoot, currentVersion: installed?.version ?? null, manifest, endpoint, token, apiMode: info.apiMode };
}

function bundleUrl(info: GemihubOkfUpdateInfo): string {
  const configured = new URL(info.endpoint);
  if (info.apiMode) {
    configured.searchParams.set("resource", "bundle");
    configured.searchParams.set("version", info.manifest.version);
    return configured.toString();
  }
  const manifestUrl = configured.pathname.toLowerCase().endsWith("manifest.json")
    ? configured
    : new URL("manifest.json", configured.toString().replace(/\/?$/, "/"));
  const resolved = new URL(info.manifest.bundleUrl, manifestUrl);
  const rootPath = manifestUrl.pathname.slice(0, manifestUrl.pathname.lastIndexOf("/") + 1);
  if (resolved.origin !== manifestUrl.origin || !resolved.pathname.startsWith(rootPath)) throw new Error("GemiHub OKF bundle URL must stay under its configured endpoint");
  return resolved.toString();
}

export async function installGemihubOkfUpdate(info: GemihubOkfUpdateInfo): Promise<void> {
  const response = await externalHTTPRequest({ url: bundleUrl(info), method: "GET", headers: headers(info.token, "application/zip") });
  if (response.status < 200 || response.status >= 300) throw new Error(`GemiHub OKF bundle request failed (${response.status})`);
  const bytes = bytesFromBase64(response.bodyBase64);
  if (bytes.byteLength > MAX_BUNDLE_BYTES) throw new Error("GemiHub OKF bundle is too large");
  if (await sha256Hex(bytes) !== info.manifest.sha256) throw new Error("GemiHub OKF bundle checksum mismatch");
  const archive = unzipSync(bytes);
  const decoded = new Map<string, string>();
  let totalBytes = 0;
  for (const [path, expectedHash] of Object.entries(info.manifest.files)) {
    const content = archive[path];
    if (!content) throw new Error(`GemiHub OKF bundle is missing ${path}`);
    totalBytes += content.byteLength;
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("GemiHub OKF bundle is too large");
    if (await sha256Hex(content) !== expectedHash) throw new Error(`GemiHub OKF file checksum mismatch: ${path}`);
    decoded.set(path, new TextDecoder("utf-8", { fatal: true }).decode(content));
  }
  for (const [path, content] of decoded) await writeFile(joinPath(info.bundleRoot, path), content);
  await writeFile(joinPath(info.bundleRoot, "manifest.json"), `${JSON.stringify(info.manifest, null, 2)}\n`);
}
