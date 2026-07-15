import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import yaml from "js-yaml";

const REPO_ROOT = process.cwd();
const SOURCE_ROOT = path.join(REPO_ROOT, "docs", "okf");
const OUTPUT_FILE = path.join(
  REPO_ROOT,
  "src",
  "generated",
  "builtin-okf.json.gz",
);
const MAX_DOCUMENTS = 24;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function parseFrontmatter(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: content };
  try {
    const parsed = yaml.load(match[1].replace(/^(\s*)\* /gm, "$1- "));
    return {
      frontmatter: parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {},
      body: match[2],
    };
  } catch {
    return { frontmatter: {}, body: match[2] };
  }
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asTags(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string")
      .map((item) => item.trim()).filter(Boolean);
  }
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function isIndexFile(filePath) {
  const lower = filePath.toLowerCase();
  return lower === "index.md" || lower.endsWith("/index.md");
}

async function listMarkdownFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(fullPath, base));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      const relativePath = normalizePath(path.relative(base, fullPath));
      if (relativePath.toLowerCase() !== "log.md" &&
        !relativePath.toLowerCase().endsWith("/log.md")) {
        files.push({ fullPath, relativePath });
      }
    }
  }
  return files;
}

const files = await listMarkdownFiles(SOURCE_ROOT);
if (files.length > MAX_DOCUMENTS) {
  throw new Error(
    `Built-in OKF has ${files.length} documents; the loader limit is ${MAX_DOCUMENTS}.`,
  );
}

const documents = [];
for (const file of files) {
  const content = await readFile(file.fullPath, "utf8");
  const { frontmatter, body } = parseFrontmatter(content);
  documents.push({
    path: file.relativePath,
    type: asString(frontmatter.type) ||
      (isIndexFile(file.relativePath) ? "Index" : "Concept"),
    title: asString(frontmatter.title) ||
      file.relativePath.replace(/\.md$/i, ""),
    description: asString(frontmatter.description),
    tags: asTags(frontmatter.tags),
    // Preserve Markdown structure (headings, lists, tables, code blocks) —
    // collapsing whitespace here would flatten both the injected index and
    // on-demand document bodies into an unreadable single line.
    body: body.trim(),
  });
}

const payload = Buffer.from(JSON.stringify({ version: 1, documents }), "utf8");
const compressed = gzipSync(payload, { level: 9 });
await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
await writeFile(OUTPUT_FILE, compressed);
console.log(
  `Generated ${normalizePath(path.relative(REPO_ROOT, OUTPUT_FILE))}: ` +
    `${documents.length} documents, ${payload.length} bytes JSON, ` +
    `${compressed.length} bytes gzip.`,
);
