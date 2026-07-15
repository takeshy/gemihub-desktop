import { gunzipSync, strFromU8 } from "fflate";

export const BUILTIN_OKF_BUNDLE_ID = "__builtin__/gemihub-desktop-help";
export const BUILTIN_OKF_BUNDLE_NAME = "GemiHub Desktop Help";

export interface BuiltinOkfDocument {
  path: string;
  type: string;
  title: string;
  description: string;
  tags: string[];
  body: string;
}

interface BuiltinOkfPayload {
  version: number;
  documents: BuiltinOkfDocument[];
}

const assetUrl = new URL(
  "../generated/builtin-okf.json.gz",
  import.meta.url,
).href;
let documentsPromise: Promise<BuiltinOkfDocument[]> | null = null;

function isDocument(value: unknown): value is BuiltinOkfDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<BuiltinOkfDocument>;
  return typeof doc.path === "string" && typeof doc.type === "string" &&
    typeof doc.title === "string" && typeof doc.description === "string" &&
    Array.isArray(doc.tags) && doc.tags.every((tag) => typeof tag === "string") &&
    typeof doc.body === "string";
}

export function decodeBuiltinOkfDocuments(
  compressed: Uint8Array,
): BuiltinOkfDocument[] {
  const parsed = JSON.parse(strFromU8(gunzipSync(compressed))) as Partial<
    BuiltinOkfPayload
  >;
  if (parsed.version !== 1 || !Array.isArray(parsed.documents) ||
    !parsed.documents.every(isDocument)) {
    throw new Error("Invalid built-in OKF asset.");
  }
  return parsed.documents;
}

export function loadBuiltinOkfDocuments(): Promise<BuiltinOkfDocument[]> {
  if (!documentsPromise) {
    documentsPromise = fetch(assetUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Could not load built-in OKF asset (${response.status}).`,
          );
        }
        return response.arrayBuffer();
      })
      .then((buffer) => decodeBuiltinOkfDocuments(new Uint8Array(buffer)))
      .catch((error) => {
        documentsPromise = null;
        throw error;
      });
  }
  return documentsPromise;
}
