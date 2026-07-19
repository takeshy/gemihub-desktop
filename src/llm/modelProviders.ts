import { workflowHTTPRequest } from "../lib/wailsBackend";
import type { ModelProviderProfile } from "./settings";

function modelURL(profile: ModelProviderProfile): string {
  const base = profile.endpoint.replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/messages$/i, "");
  if (profile.provider === "gemini") {
    return `${base}/models`;
  }
  return base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
}

export async function fetchProviderModels(
  profile: ModelProviderProfile,
): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (profile.apiKey) {
    if (profile.provider === "gemini") {
      headers["x-goog-api-key"] = profile.apiKey;
    } else {
      headers.Authorization = `Bearer ${profile.apiKey}`;
    }
  }
  if (profile.provider === "anthropic" && profile.apiKey) {
    delete headers.Authorization;
    headers["x-api-key"] = profile.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }
  let response = await workflowHTTPRequest({
    url: modelURL(profile),
    method: "GET",
    headers,
  });
  if ((response.status < 200 || response.status >= 300) && profile.local) {
    const ollamaBase = profile.endpoint.replace(/\/+$/, "").replace(
      /\/v1$/i,
      "",
    );
    response = await workflowHTTPRequest({
      url: `${ollamaBase}/api/tags`,
      method: "GET",
      headers,
    });
    if (response.status >= 200 && response.status < 300) {
      const ollama = JSON.parse(response.body) as {
        models?: Array<{ name?: string }>;
      };
      return [
        ...new Set(
          (ollama.models ?? []).map((item) => item.name || "").filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b));
    }
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Model request failed (${response.status}): ${
        response.body.slice(0, 240)
      }`,
    );
  }
  const payload = JSON.parse(response.body) as {
    data?: Array<{ id?: string }>;
    models?: Array<{ name?: string }>;
  };
  const models = profile.provider === "gemini"
    ? (payload.models ?? []).map((item) =>
      item.name?.replace(/^models\//, "") || ""
    )
    : (payload.data ?? []).map((item) => item.id || "");
  return [...new Set(models.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
