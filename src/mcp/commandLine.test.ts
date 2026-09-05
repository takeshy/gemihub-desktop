import { assertEquals } from "jsr:@std/assert";
const describe = (_name: string, run: () => void) => run();
const it = Deno.test;
const expect = (actual: unknown) => ({ toEqual: (expected: unknown) => assertEquals(actual, expected) });
import { joinCommandLine, splitCommandLine } from "./commandLine.ts";

describe("splitCommandLine", () => {
  it("splits on whitespace", () => {
    expect(splitCommandLine("  npx -y  @scope/pkg ")).toEqual(["npx", "-y", "@scope/pkg"]);
  });

  it("keeps quoted segments together and strips the quotes", () => {
    expect(splitCommandLine('node "C:\\Users\\me\\my app\\index.js" --port 3000')).toEqual([
      "node",
      "C:\\Users\\me\\my app\\index.js",
      "--port",
      "3000",
    ]);
    expect(splitCommandLine("python '/home/me/my dir/server.py'")).toEqual(["python", "/home/me/my dir/server.py"]);
  });

  it("does not treat backslashes as escapes", () => {
    expect(splitCommandLine("C:\\tools\\node.exe")).toEqual(["C:\\tools\\node.exe"]);
  });

  it("returns an empty array for blank input", () => {
    expect(splitCommandLine("   ")).toEqual([]);
  });
});

describe("joinCommandLine", () => {
  it("round-trips arguments containing spaces", () => {
    const args = ["-y", "pkg", "C:\\Users\\me\\my app\\index.js"];
    expect(splitCommandLine(joinCommandLine(args))).toEqual(args);
  });
});

describe("argument serialization", () => {
  it("preserves empty arguments, literal quotes, and apostrophes when reopening settings", () => {
    const args = ["", 'print("hello")', "it's a path", 'a"b c', "C:\\path\\"];
    expect(splitCommandLine(joinCommandLine(args))).toEqual(args);
  });
});
