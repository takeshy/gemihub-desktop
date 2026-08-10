import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { applyMcpAppCsp, buildMcpAppCsp } from "./appCsp.ts";

Deno.test("MCP App CSP permits only declared resource and connection domains", () => {
  const csp = buildMcpAppCsp({ _meta: { ui: { csp: { resourceDomains: ["https://unpkg.com"], connectDomains: ["https://tiles.openfreemap.org"], frameDomains: ["javascript:alert(1)"] } } } });
  assertStringIncludes(csp, "script-src 'unsafe-inline' 'unsafe-eval' 'self' data: blob: https://unpkg.com");
  assertStringIncludes(csp, "connect-src https://tiles.openfreemap.org");
  assertStringIncludes(csp, "frame-src 'none'");
});

Deno.test("MCP App CSP replaces a conflicting app policy", () => {
  const html = applyMcpAppCsp('<html><head><meta content="style-src \'none\'" http-equiv="Content-Security-Policy"><script src="https://unpkg.com/app.js"></script></head></html>', { _meta: { ui: { csp: { resourceDomains: ["https://unpkg.com"] } } } });
  assertEquals(html.match(/Content-Security-Policy/g)?.length, 1);
  assertStringIncludes(html, "https://unpkg.com");
  assertEquals(html.includes("style-src 'none'"), false);
});
