import assert from "node:assert/strict";
import test from "node:test";
import { pollKakeratta, type KakerattaCall } from "./kakerattaWorker";

function fixture(asks: unknown[] = [{ id: "ask-1", status: "pending", claimBy: new Date(Date.now() + 60_000).toISOString() }]) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const controller = new AbortController();
  const call: KakerattaCall = async (name, args) => {
    calls.push({ name, args });
    if (name === "list_asks") return { asks };
    if (name === "claim_ask") return { ask: { planBy: new Date(Date.now() + 60_000).toISOString() }, context: { persona: { id: "one" } } };
    if (name === "submit_answer") return { accepted: true };
    return {};
  };
  return { call, calls, controller };
}
const answer = '{"type":"answer","answer":{"text":"Hello","sources":[]}}';

test("idle, expired and already claimed asks do not use AI", async () => {
  const f = fixture([{ id: "old", status: "pending", claimBy: new Date(0).toISOString() }, { id: "other", status: "claimed", claimBy: new Date(Date.now() + 60_000).toISOString() }]);
  const result = await pollKakeratta(f.call, async () => { throw new Error("Must not generate"); }, f.controller.signal);
  assert.deepEqual(f.calls.map(c => c.name), ["list_asks"]);
  assert.equal(result.pending, 0);
  assert.equal(result.errors.length, 0);
});

test("reads context, repairs rejected answers and keeps claim IDs host-owned", async () => {
  const f = fixture();
  let generations = 0;
  let submissions = 0;
  const result = await pollKakeratta(async (name, args) => {
    const value = await f.call(name, args);
    return name === "submit_answer" && submissions++ === 0 ? { accepted: false, problems: ["Try again"] } : value;
  }, async messages => {
    generations++;
    if (generations === 1) return '{"type":"read","steps":[{"type":"notes_list"}]}';
    if (generations === 3) assert.match(messages.at(-1)!.content, /Try again/);
    return answer;
  }, f.controller.signal);
  assert.deepEqual(f.calls.map(c => c.name), ["list_asks", "claim_ask", "read_for_ask", "submit_answer", "submit_answer"]);
  const ids = f.calls[1].args;
  for (const c of f.calls.slice(2)) {
    assert.equal(c.args.askId, ids.askId);
    assert.equal(c.args.claimId, ids.claimId);
  }
  assert.equal(result.submitted, 1);
});

test("aborting a hung generation releases without a late submission", async () => {
  const f = fixture();
  const result = await pollKakeratta(f.call, async () => {
    f.controller.abort();
    return new Promise<string>(() => undefined);
  }, f.controller.signal);
  assert.deepEqual(f.calls.map(c => c.name), ["list_asks", "claim_ask", "release_ask"]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.unsubmitted, 1);
});

test("provider failure and a lost claim response both attempt release", async () => {
  for (const lostClaim of [false, true]) {
    const f = fixture();
    const result = await pollKakeratta(async (name, args) => {
      const value = await f.call(name, args);
      if (lostClaim && name === "claim_ask") throw new Error("Lost claim response");
      return value;
    }, async () => { throw new Error("Provider unavailable"); }, f.controller.signal);
    assert.equal(f.calls.at(-1)?.name, "release_ask");
    assert.equal(result.errors.length, 1);
  }
});

test("malformed and null JSON have bounded repair attempts", async () => {
  for (const invalid of ["bad JSON", "null", "[]"]) {
    const f = fixture();
    let count = 0;
    const result = await pollKakeratta(f.call, async () => { count++; return invalid; }, f.controller.signal);
    assert.equal(count, 16);
    assert.equal(f.calls.at(-1)?.name, "release_ask");
    assert.equal(result.submitted, 0);
  }
});

test("expired plan deadline releases without generating", async () => {
  const f = fixture();
  await pollKakeratta(async (name, args) => {
    const value = await f.call(name, args);
    return name === "claim_ask" ? { ask: { planBy: new Date(0).toISOString() } } : value;
  }, async () => { throw new Error("Must not generate"); }, f.controller.signal);
  assert.deepEqual(f.calls.map(c => c.name), ["list_asks", "claim_ask", "release_ask"]);
});
