export interface McpAppResource {
  uri?: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  _meta?: { ui?: { csp?: {
    resourceDomains?: string[];
    resource_domains?: string[];
    connectDomains?: string[];
    connect_domains?: string[];
    frameDomains?: string[];
    frame_domains?: string[];
    baseUriDomains?: string[];
    base_uri_domains?: string[];
  } } };
}

function safeOrigins(values: string[] | undefined): string[] {
  return (values ?? []).filter((value) => /^https:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d+)?$/i.test(value) || /^wss:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value));
}

/** Build the deny-by-default policy declared by an MCP App UI resource. */
export function buildMcpAppCsp(resource: McpAppResource): string {
  const declared = resource._meta?.ui?.csp;
  const assets = safeOrigins(declared?.resourceDomains ?? declared?.resource_domains);
  const connections = safeOrigins(declared?.connectDomains ?? declared?.connect_domains);
  const frames = safeOrigins(declared?.frameDomains ?? declared?.frame_domains);
  const bases = safeOrigins(declared?.baseUriDomains ?? declared?.base_uri_domains);
  const assetSources = ["'self'", "data:", "blob:", ...assets].join(" ");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${assetSources}`,
    `style-src 'unsafe-inline' ${assetSources}`,
    `img-src ${assetSources}`,
    `font-src ${assetSources}`,
    `media-src ${assetSources}`,
    "worker-src 'self' blob:",
    `connect-src ${connections.length ? connections.join(" ") : "'none'"}`,
    `frame-src ${frames.length ? frames.join(" ") : "'none'"}`,
    `base-uri ${bases.length ? ["'self'", ...bases].join(" ") : "'self'"}`,
    "form-action 'none'",
  ].join("; ");
}

/** Replace an app-provided CSP with the policy declared in resource metadata. */
export function applyMcpAppCsp(html: string, resource: McpAppResource): string {
  let clean = html.replace(/<meta\b[\s\S]*?>/gi, (tag) => /content-security-policy/i.test(tag) ? "" : tag);
  clean = clean.replace(/&lt;meta\b[\s\S]*?&gt;/gi, (tag) => /content-security-policy/i.test(tag) ? "" : tag);
  const policy = buildMcpAppCsp(resource).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  if (/<head\b[^>]*>/i.test(clean)) return clean.replace(/<head\b[^>]*>/i, (head) => `${head}${meta}`);
  return `<!doctype html><html><head>${meta}</head><body>${clean}</body></html>`;
}
