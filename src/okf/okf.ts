import yaml from "js-yaml";
import { listProjectFiles, readProjectFile, type ChatToolDefinition } from "../lib/wailsBackend";
import {
  BUILTIN_OKF_BUNDLE_ID,
  BUILTIN_OKF_BUNDLE_NAME,
  loadBuiltinOkfDocuments,
} from "./builtinOkf";

export interface OkfBundle {
  id: string;
  name: string;
  builtin?: boolean;
}

interface OkfDocument {
  path: string;
  title: string;
  description: string;
  body: string;
}

export interface OkfDocumentContent {
  path: string;
  title: string;
  body: string;
}

// External bundles are arbitrary user-provided Markdown, not reviewed with the
// app, so a fetched document is still capped defensively. The built-in bundle
// is generated and reviewed with the application, so it is returned in full.
const MAX_EXTERNAL_BODY_CHARS = 20_000;
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const OKF_PROMPT_INTRO = "The following Open Knowledge Format (OKF) knowledge bundles are active. Each bundle section below is only that bundle's index document (its table of contents) — not the full knowledge base. When the index alone doesn't give enough detail to answer, call the read_okf_document tool with the bundleId shown in the section heading and a document path referenced in that index (leading slashes are fine) to fetch that document's full content. Prefer these curated bundles' definitions, relationships, and documented procedures when answering domain questions. If relevant knowledge may exist outside these excerpts, inspect workspace files or use semantic search before guessing.";

export function getBuiltinOkfBundle(): OkfBundle {
  return {
    id: BUILTIN_OKF_BUNDLE_ID,
    name: BUILTIN_OKF_BUNDLE_NAME,
    builtin: true,
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(FM_RE);
  if (!match) return { frontmatter: {}, body: content };
  try {
    // Browser/editor copy operations can turn YAML list markers into Markdown
    // bullets. Match GemiHub's tolerant OKF reader so those files still load.
    const parsed = yaml.load(match[1].replace(/^(\s*)\* /gm, "$1- "));
    return {
      frontmatter: parsed && typeof parsed === "object" &&
          !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {},
      body: match[2],
    };
  } catch {
    return { frontmatter: {}, body: match[2] };
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function rootBasename(root: string): string {
  return normalizePath(root).split("/").filter(Boolean).pop() || "OKF";
}

async function listMarkdown(root: string): Promise<string[]> {
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot) return [];
  const prefix = `${normalizedRoot}/`;
  return (await listProjectFiles()).map((entry) => normalizePath(entry.path))
    .filter((path) =>
      path.toLowerCase().endsWith(".md") &&
      path.toLowerCase().startsWith(prefix.toLowerCase()) &&
      !path.split("/").some((part) => part === ".git" || part === "node_modules")
    )
    .map((path) => path.slice(prefix.length))
    .sort((left, right) => left.localeCompare(right));
}

function isIndexFile(path: string): boolean {
  return path.toLowerCase() === "index.md" ||
    path.toLowerCase().endsWith("/index.md");
}

function isLogFile(path: string): boolean {
  return path.toLowerCase() === "log.md" ||
    path.toLowerCase().endsWith("/log.md");
}

export async function discoverOkfBundles(root: string): Promise<OkfBundle[]> {
  const normalizedRoot = normalizePath(root);
  const paths = await listMarkdown(normalizedRoot);
  const indexPaths = paths.filter(isIndexFile);
  const dirs = indexPaths.map(dirOf);
  const topLevel = indexPaths.filter((path) => {
    const dir = dirOf(path);
    return !dirs.some((other) =>
      other !== dir && (other === "" || dir.startsWith(`${other}/`))
    );
  });
  const bundles = await Promise.all(topLevel.map(async (indexPath) => {
    const id = dirOf(indexPath);
    let name = id.split("/").pop() || rootBasename(normalizedRoot);
    const file = await readProjectFile(`${normalizedRoot}/${indexPath}`);
    if (file) {
      const title = asString(parseFrontmatter(file.content).frontmatter.title);
      if (title) name = title;
    }
    return { id, name };
  }));
  return bundles.sort((left, right) => left.name.localeCompare(right.name));
}

async function toDocument(root: string, path: string): Promise<OkfDocument | null> {
  const file = await readProjectFile(`${normalizePath(root)}/${path}`);
  if (!file) return null;
  const { frontmatter, body } = parseFrontmatter(file.content);
  return {
    path,
    title: asString(frontmatter.title) || path.replace(/\.md$/i, ""),
    description: asString(frontmatter.description),
    // Preserve Markdown structure (headings, lists, tables, code blocks) —
    // collapsing whitespace here would flatten both the injected index and
    // on-demand document bodies into an unreadable single line.
    body: body.trim().slice(0, MAX_EXTERNAL_BODY_CHARS),
  };
}

function formatIndexSection(
  bundleId: string,
  bundleName: string,
  index: { title: string; description: string; body: string },
): string {
  const description = index.description ? ` - ${index.description}` : "";
  return `\n## OKF bundle: ${bundleName} (bundleId=${bundleId})${description}\n${index.body}`;
}

/** Tool the model calls to fetch one document's full body on demand, mirroring
 * how Agent Skill workflows are only executed (not eagerly inlined) via a tool
 * call — the system prompt only ever carries a bundle's index. */
export function okfDocumentTool(activeBundleIds: string[]): ChatToolDefinition[] {
  if (!activeBundleIds.length) return [];
  return [{
    name: "read_okf_document",
    description: "Fetch the full content of one document from an active OKF knowledge bundle. Use the bundleId shown in the bundle's heading in the system prompt, and a document path as referenced in that bundle's index (leading slashes are stripped automatically).",
    parameters: {
      type: "object",
      properties: {
        bundleId: { type: "string", description: "bundleId shown next to the OKF bundle heading, e.g. __builtin__/gemihub-desktop-help" },
        path: { type: "string", description: "Document path referenced in the bundle's index, e.g. features/file-management.md" },
      },
      required: ["bundleId", "path"],
    },
  }];
}

/** Resolves a read_okf_document tool call for either the built-in bundle or an
 * external bundle rooted under `root`. `activeBundleIds` must be the set of
 * bundle IDs the user currently has active for this chat — a request for any
 * other bundleId is rejected, so a document can't be pulled in from a bundle
 * the user never selected (e.g. via a prompt-injected instruction). Returns
 * null if the bundle isn't active, or the document/root can't be resolved. */
export async function fetchOkfDocument(
  root: string,
  bundleId: string,
  path: string,
  activeBundleIds: string[],
  builtinLoader = loadBuiltinOkfDocuments,
): Promise<OkfDocumentContent | null> {
  if (!activeBundleIds.includes(bundleId)) return null;
  const cleanPath = normalizePath(path);
  if (!cleanPath || isLogFile(cleanPath)) return null;
  if (bundleId === BUILTIN_OKF_BUNDLE_ID) {
    const doc = (await builtinLoader()).find((candidate) => candidate.path === cleanPath);
    return doc ? { path: doc.path, title: doc.title, body: doc.body } : null;
  }
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot) return null;
  const fullPath = bundleId ? `${normalizePath(bundleId)}/${cleanPath}` : cleanPath;
  const doc = await toDocument(normalizedRoot, fullPath);
  return doc ? { path: doc.path, title: doc.title, body: doc.body } : null;
}

export async function buildOkfSystemPrompt(
  root: string,
  selectedBundleIds: string[],
  builtinLoader = loadBuiltinOkfDocuments,
): Promise<string> {
  if (selectedBundleIds.length === 0) return "";
  const sections: string[] = [];
  if (selectedBundleIds.includes(BUILTIN_OKF_BUNDLE_ID)) {
    const index = (await builtinLoader()).find((doc) => isIndexFile(doc.path));
    if (index) {
      sections.push(formatIndexSection(BUILTIN_OKF_BUNDLE_ID, BUILTIN_OKF_BUNDLE_NAME, index));
    }
  }
  const normalizedRoot = normalizePath(root);
  const externalBundleIds = selectedBundleIds.filter((id) => id !== BUILTIN_OKF_BUNDLE_ID);
  if (normalizedRoot && externalBundleIds.length) {
    const paths = await listMarkdown(normalizedRoot);
    for (const bundleId of externalBundleIds) {
      const indexPath = bundleId ? `${bundleId}/index.md` : "index.md";
      if (!paths.includes(indexPath)) continue;
      const index = await toDocument(normalizedRoot, indexPath);
      if (!index) continue;
      const name = index.title || bundleId.split("/").pop() || rootBasename(normalizedRoot);
      sections.push(formatIndexSection(bundleId, name, index));
    }
  }
  return sections.length ? `${OKF_PROMPT_INTRO}\n${sections.join("\n")}` : "";
}
