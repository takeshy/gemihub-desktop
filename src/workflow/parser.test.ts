import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  canonicalWorkflowPath,
  findWorkflowBlocks,
  isWorkflowFilePath,
  nextWorkflowNode,
  normalizeWorkflowYaml,
  parseWorkflowFile,
  parseWorkflowFromMarkdown,
  replaceWorkflowDefinition,
  serializeWorkflowData,
  serializeWorkflowYaml,
} from "./parser.ts";
import {
  evaluateWorkflowCondition,
  evaluateWorkflowValue,
  replaceWorkflowVariables,
} from "./variables.ts";
import { readWorkflowDocument } from "./document.ts";
import { workflowToMermaid } from "./mermaid.ts";

Deno.test("parses fenced AI workflow output and branches", () => {
  const markdown = `# Demo\n\n${
    serializeWorkflowData({
      name: "Demo",
      nodes: [
        {
          id: "start",
          type: "variable",
          name: "count",
          value: 1,
          next: "check",
        },
        {
          id: "check",
          type: "if",
          condition: "{{count}} >= 1",
          trueNext: "yes",
          falseNext: "end",
        },
        { id: "yes", type: "set", name: "result", value: "ok", next: "end" },
      ],
    })
  }`;
  const workflow = parseWorkflowFromMarkdown(markdown);
  assertEquals(workflow.name, "Demo");
  assertEquals(workflow.nodes.size, 3);
  assertEquals(nextWorkflowNode(workflow, "check", true), "yes");
  assertEquals(nextWorkflowNode(workflow, "check", false), null);
});

Deno.test("plain YAML is the canonical workflow format", () => {
  const source = serializeWorkflowYaml({
    name: "Canonical",
    nodes: [{ id: "start", type: "sleep", duration: 1 }],
  });
  const blocks = findWorkflowBlocks(source);
  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].format, "yaml");
  assertEquals(parseWorkflowFromMarkdown(source).name, "Canonical");
  assertEquals(
    canonicalWorkflowPath("workflows/Daily Notes.md"),
    "workflows/Daily Notes.workflow.yaml",
  );
  assertEquals(isWorkflowFilePath("workflows/canonical.workflow.yaml"), true);
  assertEquals(isWorkflowFilePath("workflow.yaml"), true);
  assertEquals(isWorkflowFilePath("skills/example/workflows/legacy.yml"), true);
  assertEquals(isWorkflowFilePath("workflows/legacy.md"), false);
  const replaced = replaceWorkflowDefinition(
    source,
    serializeWorkflowData({
      name: "Changed",
      nodes: [{ id: "done", type: "sleep", duration: 2 }],
    }),
  );
  assertEquals(replaced.includes("```"), false);
  assertEquals(parseWorkflowFromMarkdown(replaced).name, "Changed");
  assertEquals(
    parseWorkflowFile(source, "workflows/canonical.workflow.yaml").name,
    "Canonical",
  );
  assertThrows(
    () =>
      parseWorkflowFile(
        serializeWorkflowData({ nodes: [{ type: "sleep" }] }),
        "workflows/legacy.md",
      ),
    Error,
    "Workflow files must use",
  );
});

Deno.test("parses AI workflow fences and rejects multiple blocks", () => {
  assertEquals(
    findWorkflowBlocks(
      "```workflow\nnodes:\n  - type: sleep\n    duration: 1\n```",
    ).length,
    1,
  );
  const block =
    "```hub-workflow\nnodes:\n  - type: sleep\n    duration: 1\n```";
  assertThrows(() => parseWorkflowFromMarkdown(`${block}\n\n${block}`));
});

Deno.test("normalizes external workflow YAML list markers and block scalar indentation", () => {
  const external =
    `name: generated\nnodes:\n* id: script\n  type: script\n  code: |\n  return {\n  name: "Ada",\n  count: 1\n  };\n  saveTo: result\n* id: show\n  type: dialog\n  message: "{{result.name}}"`;
  const normalized = normalizeWorkflowYaml(external);
  assertEquals(normalized.includes("- id: script"), true);
  assertEquals(normalized.includes('    name: "Ada",'), true);
  assertEquals(normalized.includes("  saveTo: result"), true);
  const workflow = parseWorkflowFromMarkdown(
    `\`\`\`hub-workflow\n${external}\n\`\`\``,
  );
  assertEquals(workflow.nodes.size, 2);
  assertEquals(
    workflow.nodes.get("script")?.properties.code.includes('name: "Ada"'),
    true,
  );
});

Deno.test("rejects back-references unless the target is a while node", () => {
  const invalid = serializeWorkflowData({
    name: "bad loop",
    nodes: [{ id: "first", type: "set", name: "x", value: 1 }, {
      id: "again",
      type: "set",
      name: "x",
      value: 2,
      next: "first",
    }],
  });
  assertThrows(
    () => parseWorkflowFromMarkdown(invalid),
    Error,
    "Only while nodes can be loop targets",
  );
  const valid = serializeWorkflowData({
    name: "loop",
    nodes: [{
      id: "loop",
      type: "while",
      condition: "{{x}} < 2",
      trueNext: "body",
      falseNext: "end",
    }, {
      id: "body",
      type: "set",
      name: "x",
      value: "{{x}} + 1",
      next: "loop",
    }],
  });
  assertEquals(
    parseWorkflowFromMarkdown(valid).edges.some((edge) =>
      edge.from === "body" && edge.to === "loop"
    ),
    true,
  );
});

Deno.test("accepts external workflows with an explicit end node as a terminal alias", () => {
  const source = serializeWorkflowData({
    name: "external terminal",
    nodes: [{
      id: "save-infographic",
      type: "file-save",
      source: "image",
      path: "output.png",
      next: "end-workflow",
    }, {
      id: "end-workflow",
      type: "end",
    }],
  });
  const workflow = parseWorkflowFromMarkdown(source);
  assertEquals(workflow.nodes.has("save-infographic"), true);
  assertEquals(workflow.nodes.has("end-workflow"), false);
  assertEquals(workflow.edges, []);
});

Deno.test("replaces nested values and evaluates conditions and arithmetic", () => {
  const variables = new Map<string, string | number>([["count", 2], [
    "payload",
    JSON.stringify({ user: { name: "Ada" } }),
  ]]);
  assertEquals(
    replaceWorkflowVariables("Hi {{payload.user.name}}", variables),
    "Hi Ada",
  );
  assertEquals(evaluateWorkflowCondition("{{count}} >= 2", variables), true);
  assertEquals(evaluateWorkflowCondition("02 == 2", variables), true);
  assertEquals(
    evaluateWorkflowCondition('\'["one","two"]\' contains two', variables),
    true,
  );
  assertThrows(() => evaluateWorkflowCondition("{{count}}", variables));
  assertEquals(evaluateWorkflowValue("{{count}} + 3", variables), 5);
});

Deno.test("workflow variables resolve array and variable indexes", () => {
  const variables = new Map<string, string | number>([[
    "items",
    JSON.stringify([{ name: "first" }, { name: "second" }]),
  ], ["index", 1]]);
  assertEquals(
    replaceWorkflowVariables(
      "{{items[0].name}} / {{items[index].name}}",
      variables,
    ),
    "first / second",
  );
  assertEquals(
    replaceWorkflowVariables('"{{items:json}}"', variables),
    '"[{\\"name\\":\\"first\\"},{\\"name\\":\\"second\\"}]"',
  );
});

Deno.test("workflow variables support nested indexes, objects, legacy system names, and repeated expansion", () => {
  const variables = new Map<string, string | number>([
    [
      "items",
      JSON.stringify([{ meta: { title: "First" } }, {
        meta: { title: "Second" },
      }]),
    ],
    ["index", 1],
    ["pointer", "{{index}}"],
    ["_date", "2026-07-12"],
  ]);
  assertEquals(
    replaceWorkflowVariables("{{items[{{pointer}}].meta}}", variables),
    "{{items[{{index}}].meta}}",
  );
  assertEquals(
    replaceWorkflowVariables(
      "{{items[index].meta.title}} / {{__date__}}",
      variables,
    ),
    "Second / 2026-07-12",
  );
});

Deno.test("visual editor updates nodes while preserving markdown and workflow wrapper", () => {
  const markdown =
    "# Before\n\n```hub-workflow\nworkflow:\n  name: Wrapped\n  nodes:\n    - id: one\n      type: sleep\n      duration: 1\n```\n\nAfter\n";
  const document = readWorkflowDocument(markdown);
  const updated = document.updateNodes([{
    id: "two",
    type: "sleep",
    duration: "2",
  }]);
  assertEquals(updated.startsWith("# Before\n\n"), true);
  assertEquals(updated.endsWith("\n\nAfter\n"), true);
  assertEquals(parseWorkflowFromMarkdown(updated).nodes.has("two"), true);
});

Deno.test("plain web YAML node names execute as desktop workflow nodes", () => {
  const workflow = parseWorkflowFile(
    "nodes:\n  - id: read\n    type: drive-read\n    path: note.md\n    saveTo: body\n  - id: action\n    type: gemihub-command\n    command: duplicate\n    path: note.md\n",
    "workflows/web.yaml",
  );
  assertEquals(workflow.nodes.get("read")?.type, "note-read");
  assertEquals(workflow.nodes.get("action")?.type, "gemihub-command");
});

Deno.test("visual workflow edits preserve the target file dialect", () => {
  const web = readWorkflowDocument(
    "nodes:\n  - id: read\n    type: drive-read\n    path: note.md\n",
    "workflows/web.yaml",
  );
  assertEquals(web.nodes[0].type, "note-read");
  assertEquals(web.updateNodes(web.nodes).includes("type: drive-read"), true);

  const desktop = readWorkflowDocument(
    "nodes:\n  - id: read\n    type: note-read\n    path: note.md\n",
    "workflows/desktop.workflow.yaml",
  );
  assertEquals(
    desktop.updateNodes(desktop.nodes).includes("type: note-read"),
    true,
  );
});

Deno.test("workflow Mermaid export contains branches and terminal node", () => {
  const workflow = parseWorkflowFromMarkdown(
    serializeWorkflowData({
      nodes: [{
        id: "check",
        type: "if",
        condition: "x == 1",
        trueNext: "done",
        falseNext: "end",
      }, { id: "done", type: "sleep", duration: 1, next: "end" }],
    }),
  );
  const mermaid = workflowToMermaid(workflow);
  assertEquals(mermaid.includes("flowchart TD"), true);
  assertEquals(mermaid.includes("|Yes|"), true);
  assertEquals(mermaid.includes("FINISH"), true);
});
