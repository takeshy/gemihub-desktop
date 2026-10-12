import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeKakerattaSettings,
  resolveKakerattaProfile,
  validateKakerattaUrl,
} from "./kakerattaSettings.ts";

test("invalid saved data falls back to defaults field by field", () => {
  const value = normalizeKakerattaSettings({
    enabled: true,
    url: " https://example.test/mcp ",
    headers: { Authorization: "Bearer k", "bad name": "x", Line: "a\nb" },
    timelineSync: { enabled: true, name: "bad/name" },
    personas: { p1: { model: "m", readFiles: true } },
  });
  assert.equal(value.url, "https://example.test/mcp");
  assert.deepEqual(value.headers, { Authorization: "Bearer k" });
  assert.equal(value.timelineSync.name, "Timeline");
  assert.equal(value.pollEnabled, true);
  assert.equal(value.direct.enabled, true);
  assert.equal(value.personas.p1.readFiles, true);
  assert.equal(value.personas.p1.webSearch, false);
});

test("a persona override replaces the whole default profile", () => {
  const config = normalizeKakerattaSettings({
    defaultProfile: { model: "d", webSearch: true },
    personas: { p1: { model: "x" } },
  });
  assert.equal(resolveKakerattaProfile(config, { persona: { id: "p1" } }).webSearch, false);
  assert.equal(resolveKakerattaProfile(config, { persona: { id: "other" } }).model, "d");
  assert.equal(resolveKakerattaProfile(config, null).model, "d");
});

test("only http(s) endpoints are accepted when enabled", () => {
  assert.throws(() => validateKakerattaUrl(normalizeKakerattaSettings({ enabled: true, url: "file:///x" })));
  assert.throws(() => validateKakerattaUrl(normalizeKakerattaSettings({ enabled: true })));
  validateKakerattaUrl(normalizeKakerattaSettings({}));
  validateKakerattaUrl(normalizeKakerattaSettings({ enabled: true, url: "https://a.test/mcp" }));
});
