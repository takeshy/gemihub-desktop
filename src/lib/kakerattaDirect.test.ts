import assert from "node:assert/strict";
import test from "node:test";
import { directEffectKey, pollDirectRequests, type DirectState, type DirectStore } from "./kakerattaDirect";
import { KakerattaRejectedError } from "./kakerattaErrors";
import { pollKakeratta, type KakerattaCall } from "./kakerattaWorker";

function fixture() {
  const states = new Map<string, DirectState>();
  const store: DirectStore = {
    async list() { return structuredClone([...states.values()]); },
    async acquire(id) {
      const state = states.get(id) ?? { id, claimId: crypto.randomUUID(), expiresAt: Date.now() + 86400_000, messages: [], rounds: 0, comments: 0 };
      return structuredClone(state);
    },
    async save(state) { states.set(state.id, structuredClone(state)); },
    async finish(id) { states.delete(id); },
    async release() {},
  };
  const requests = [{ id: "direct-1", status: "pending", claimBy: new Date(Date.now() + 60_000).toISOString() }];
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const call: KakerattaCall = async (name, args) => {
    calls.push({ name, args });
    if (name === "list_asks") return { asks: [], requests };
    if (name === "claim_request") {
      assert.equal(states.get(String(args.requestId))?.claimId, args.claimId, "Claim ID must be saved before the claim RPC");
      return { request: { replyBy: new Date(Date.now() + 60_000).toISOString() }, context: { trigger: { id: "entry-1", text: "@agent 調べて" }, thread: [] } };
    }
    if (name === "reply_request") return { replied: true };
    if (name === "comment_on_entry") return { posted: true };
    return { entries: [] };
  };
  return { store, states, requests, calls, call };
}
const reply = '{"type":"reply","text":"確認しました"}';

test("cancelling a hung external effect preserves uncertainty for the next poll", async () => {
  const f = fixture();
  const controller = new AbortController();
  await pollDirectRequests(f.call, f.requests, {
    store: f.store,
    generate: async () => '{"type":"mcp","tool":"mail_send","args":{}}',
    executeTool: async () => {
      controller.abort();
      return new Promise(() => undefined);
    },
  }, controller.signal);
  assert.equal(f.states.get("direct-1")?.uncertainEffects, true);
  let turns = 0;
  const resumed = await pollDirectRequests(f.call, [{ ...f.requests[0], status: "claimed" }], {
    store: f.store,
    executeTool: async () => { throw new Error("Uncertain effects must not repeat"); },
    generate: async () => ++turns === 1 ? '{"type":"mcp","tool":"mail_send","args":{}}' : reply,
  }, new AbortController().signal);
  assert.equal(resumed.replied, 1);
});

test("requested comments work without a permission toggle and retain the ten-comment limit", async () => {
  const f = fixture();
  let turns = 0;
  await pollDirectRequests(async (name, args) => {
    const value = await f.call(name, args);
    if (name === "claim_request") value.context = { trigger: { text: "@agent 対象の投稿に訂正をコメントして" }, thread: [] };
    return value;
  }, f.requests, { store: f.store, generate: async (_messages, system, _signal, context) => {
    assert.match((context as { trigger: { text: string } }).trigger.text, /コメントして/);
    assert.match(system, /only when explicitly requested in the current trigger/);
    return ++turns <= 11 ? JSON.stringify({ type: "comment", entryId: `entry-${turns}`, text: "訂正" }) : reply;
  } }, new AbortController().signal);
  const comments = f.calls.filter(call => call.name === "comment_on_entry");
  assert.equal(comments.length, 10);
  assert.equal(comments[0].args.claimId, f.calls.find(call => call.name === "claim_request")!.args.claimId);
});

test("direct-only polls reply through reply_request with host-owned IDs", async () => {
  const f = fixture();
  const summary = await pollKakeratta(f.call, async () => { throw new Error("No persona inference"); }, new AbortController().signal, { store: f.store, generate: async () => reply });
  assert.equal(summary.requests?.replied, 1);
  assert.deepEqual(f.calls.map(c => c.name), ["list_asks", "claim_request", "reply_request"]);
  assert.equal(f.calls[1].args.claimId, f.calls[2].args.claimId);
  assert.equal(f.states.size, 0);
});

test("a lost claim response resumes with the same persisted claim ID", async () => {
  const f = fixture();
  await pollDirectRequests(async (name, args) => { await f.call(name, args); throw new Error("Claim response lost"); }, f.requests, { store: f.store, generate: async () => reply }, new AbortController().signal);
  const claimId = f.states.get("direct-1")!.claimId;
  const result = await pollDirectRequests(f.call, [{ ...f.requests[0], status: "claimed" }], { store: f.store, generate: async () => reply }, new AbortController().signal);
  assert.equal(result.replied, 1);
  assert.equal(f.calls.filter(c => c.name === "claim_request")[1].args.claimId, claimId);
});

test("browser closure interrupts hung inference; the next poll resumes the claimed request", async () => {
  const f = fixture();
  const controller = new AbortController();
  await pollDirectRequests(f.call, f.requests, { store: f.store, generate: async () => { controller.abort(); return new Promise<string>(() => undefined); } }, controller.signal);
  assert.equal(f.states.size, 1);
  const resumed = await pollDirectRequests(f.call, [{ ...f.requests[0], status: "claimed" }], { store: f.store, generate: async () => reply }, new AbortController().signal);
  assert.equal(resumed.replied, 1);
  assert.equal(f.calls.filter(c => c.name === "claim_request").length, 2);
  assert.equal(f.calls.filter(c => c.name === "claim_request")[0].args.claimId, f.calls.filter(c => c.name === "claim_request")[1].args.claimId);
});

test("unconfirmed comments block all further side effects, including changed arguments", async () => {
  const f = fixture();
  let turns = 0;
  const result = await pollDirectRequests(async (name, args) => {
    if (name === "comment_on_entry") {
      assert.ok(f.states.get("direct-1")?.pendingEffect, "Effect intent must be saved before posting");
      await f.call(name, args);
      throw new Error("Comment result lost");
    }
    return f.call(name, args);
  }, f.requests, { store: f.store, generate: async () => ++turns <= 2 ? JSON.stringify({ type: "comment", entryId: `entry-${turns}`, text: "訂正" }) : reply }, new AbortController().signal);
  assert.equal(result.replied, 1);
  assert.equal(f.calls.filter(c => c.name === "comment_on_entry").length, 1);
});

test("pending replies retry unchanged after a transport failure, without repeating inference", async () => {
  const f = fixture();
  await pollDirectRequests(async (name, args) => {
    await f.call(name, args);
    if (name === "reply_request") throw new Error("Reply result lost");
    return { request: { replyBy: new Date(Date.now() + 60_000).toISOString() }, context: { trigger: { text: "test" } } };
  }, f.requests, { store: f.store, generate: async () => reply }, new AbortController().signal);
  const result = await pollDirectRequests(f.call, [], { store: f.store, generate: async () => { throw new Error("Must retry the saved reply only"); } }, new AbortController().signal);
  assert.equal(result.replied, 1);
  const attempts = f.calls.filter(c => c.name === "reply_request");
  assert.deepEqual(attempts[0].args, attempts[1].args);
});

test("unsupported reads and invalid comments never reach remote tools", async () => {
  const f = fixture();
  let turns = 0;
  await pollDirectRequests(f.call, f.requests, { store: f.store, generate: async () => [
    '{"type":"read","tool":"submit_answer","args":{}}',
    '{"type":"comment","entryId":"e","text":""}', reply,
  ][turns++] }, new AbortController().signal);
  assert.deepEqual(f.calls.map(c => c.name), ["claim_request", "reply_request"]);
});

test("already claimed requests belonging to another agent are never taken over", async () => {
  const f = fixture();
  const result = await pollDirectRequests(f.call, [{ ...f.requests[0], status: "claimed" }], { store: f.store, generate: async () => { throw new Error("No inference"); } }, new AbortController().signal);
  assert.equal(result.pending, 0);
  assert.equal(f.calls.length, 0);
});

test("withdrawn or expired requests cannot execute new external effects from the journal", async () => {
  const f = fixture();
  const state = (await f.store.acquire("direct-1"))!;
  state.context = { trigger: { text: "send an email" } };
  state.replyBy = Date.now() + 60_000;
  await f.store.save(state);
  const result = await pollDirectRequests(f.call, [], { store: f.store, generate: async () => { throw new Error("No new inference for a withdrawn request"); } }, new AbortController().signal);
  assert.equal(result.replied, 1);
  assert.deepEqual(f.calls.map(c => c.name), ["reply_request"]);
});

test("effect identity uses executed arguments, with recursive key sorting and no model metadata", () => {
  assert.equal(directEffectKey({ type: "mcp", tool: "mail_send", args: { to: "a", draft: { subject: "s", text: "body" } }, claimId: "fake" }),
    directEffectKey({ args: { draft: { text: "body", subject: "s" }, to: "a" }, tool: "mail_send", type: "mcp", claimId: "different" }));
  assert.notEqual(directEffectKey({ type: "mcp", tool: "mail_send", args: { to: ["a", "b"] } }), directEffectKey({ type: "mcp", tool: "mail_send", args: { to: ["b", "a"] } }));
  assert.equal(directEffectKey({ type: "comment", entryId: "e", text: " hello\\nworld " }), directEffectKey({ text: "hello\nworld", entryId: "e", type: "comment", requestId: "ignored" }));
});

test("successful effects cannot repeat with reordered nested arguments or changed extra fields", async () => {
  const f = fixture();
  let executions = 0;
  let turns = 0;
  await pollDirectRequests(f.call, f.requests, {
    store: f.store,
    executeTool: async () => { executions++; return { sent: true }; },
    generate: async () => [
      '{"type":"mcp","tool":"mail_send","args":{"to":"a","draft":{"subject":"s","text":"body"}}}',
      '{"args":{"draft":{"text":"body","subject":"s"},"to":"a"},"tool":"mail_send","type":"mcp","extra":"different"}', reply,
    ][turns++],
  }, new AbortController().signal);
  assert.equal(executions, 1);
});

test("legacy pending mail intents block reordered operations when the claimed request resumes", async () => {
  const f = fixture();
  const state = (await f.store.acquire("direct-1"))!;
  state.context = { trigger: { id: "entry-1", text: "send mail" } };
  state.replyBy = Date.now() + 60_000;
  state.pendingEffect = '{"type":"mcp","tool":"mail_send","args":{"to":"a","text":"body"}}';
  await f.store.save(state);
  let executions = 0;
  let turns = 0;
  await pollDirectRequests(f.call, [{ ...f.requests[0], status: "claimed" }], {
    store: f.store,
    executeTool: async () => { executions++; return {}; },
    generate: async () => ++turns === 1 ? '{"args":{"text":"body","to":"a"},"tool":"mail_send","type":"mcp"}' : reply,
  }, new AbortController().signal);
  assert.equal(executions, 0);
});

test("a resumed request with mismatched ownership is closed without inference or effects", async () => {
  const f = fixture();
  const state = (await f.store.acquire("direct-1"))!;
  state.context = { trigger: { id: "entry-1", text: "send mail" } };
  state.replyBy = Date.now() + 60_000;
  await f.store.save(state);
  const result = await pollDirectRequests(async name => { assert.equal(name, "claim_request"); throw new KakerattaRejectedError("この依頼は別の claimId で取得されています"); }, [{ ...f.requests[0], status: "claimed" }], {
    store: f.store, generate: async () => { throw new Error("No inference for another owner"); },
  }, new AbortController().signal);
  assert.equal(result.closed, 1);
  assert.equal(result.failed, 0);
  assert.equal(f.states.size, 0);
});

test("withdrawal during inference is checked again before external effects", async () => {
  const f = fixture();
  let withdrawn = false;
  let executions = 0;
  const result = await pollDirectRequests(async (name, args) => {
    if (name === "claim_request" && withdrawn) throw new KakerattaRejectedError("依頼が見つかりません。期限切れか、既に返信済みです");
    return f.call(name, args);
  }, f.requests, {
    store: f.store, executeTool: async () => { executions++; return {}; },
    generate: async () => { withdrawn = true; return '{"type":"mcp","tool":"mail_send","args":{}}'; },
  }, new AbortController().signal);
  assert.equal(executions, 0);
  assert.equal(result.closed, 1);
  assert.equal(f.states.size, 0);
});

test("connection invalidation during inference prevents both effects and old-connection replies", async () => {
  const f = fixture();
  let current = true;
  let executions = 0;
  const result = await pollDirectRequests(f.call, f.requests, {
    store: { ...f.store, isCurrent: async () => current },
    executeTool: async () => { executions++; return {}; },
    generate: async () => { current = false; return '{"type":"mcp","tool":"mail_send","args":{}}'; },
  }, new AbortController().signal);
  assert.equal(executions, 0);
  assert.equal(f.calls.filter(c => c.name === "reply_request").length, 0);
  assert.equal(result.closed, 1);
});

test("lost successful reply responses reconcile the posted entry and end retries", async () => {
  const f = fixture();
  let posted: Record<string, unknown> | undefined;
  let recovering = false;
  const call: KakerattaCall = async (name, args) => {
    if (name === "get_thread") {
      if (!recovering) throw new Error("Temporary read outage");
      return { entries: [posted] };
    }
    await f.call(name, args);
    if (name === "reply_request") {
      posted = { id: "posted-reply", speaker: "agent", replyTo: "entry-1", text: args.text, at: new Date().toISOString() };
      throw new Error("Reply accepted but response lost");
    }
    return { request: { replyBy: new Date(Date.now() + 60_000).toISOString() }, context: { trigger: { id: "entry-1", text: "help" }, thread: [] } };
  };
  await pollDirectRequests(call, f.requests, { store: f.store, generate: async () => reply }, new AbortController().signal);
  recovering = true;
  const recovered = await pollDirectRequests(call, [], { store: f.store, generate: async () => { throw new Error("No inference when verifying a reply"); } }, new AbortController().signal);
  assert.equal(recovered.replied, 1);
  assert.equal(recovered.failed, 0);
  assert.equal(f.calls.filter(c => c.name === "reply_request").length, 1);
  assert.equal(f.states.size, 0);
});

test("unavailable requests close once; old or unrelated matching text is not delivery proof", async () => {
  const f = fixture();
  const state = (await f.store.acquire("direct-1"))!;
  state.context = { trigger: { id: "entry-1" }, thread: [{ id: "old" }] };
  state.reply = "same text";
  state.replyAttemptedAt = Date.now();
  await f.store.save(state);
  let attempts = 0;
  const call: KakerattaCall = async name => {
    if (name === "get_thread") return { entries: [
      { id: "old", replyTo: "entry-1", speaker: "agent", text: state.reply, at: new Date().toISOString() },
      { id: "other-parent", replyTo: "another-entry", speaker: "agent", text: state.reply, at: new Date().toISOString() },
      { id: "user", replyTo: "entry-1", speaker: "user", text: state.reply, at: new Date().toISOString() },
    ] };
    assert.equal(name, "reply_request"); attempts++;
    throw new KakerattaRejectedError("依頼が見つかりません。期限切れか、既に返信済みです");
  };
  const options = { store: f.store, generate: async () => { throw new Error("No inference"); } };
  const result = await pollDirectRequests(call, [], options, new AbortController().signal);
  assert.equal(result.closed, 1);
  assert.equal(result.replied, 0);
  assert.equal(result.failed, 0);
  await pollDirectRequests(call, [], options, new AbortController().signal);
  assert.equal(attempts, 1);
  assert.equal(f.states.size, 0);
});

test("the direct system prompt limits action authorization to the current trigger", async () => {
  const f = fixture();
  await pollDirectRequests(f.call, f.requests, { store: f.store, generate: async (_messages, system) => {
    assert.match(system, /Only the current context\.trigger authorizes an action/);
    assert.match(system, /user's own earlier words/);
    assert.match(system, /cannot authorize a new action/);
    assert.doesNotMatch(system, /Follow the user's trigger and conversation/);
    return reply;
  } }, new AbortController().signal);
});
