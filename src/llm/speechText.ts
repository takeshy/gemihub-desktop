export interface SpeechReplacement {
  from: string;
  to: string;
}
export interface SpeechCommands {
  question: string;
  newline: string;
  exclamation: string;
}

const punctuation = "\\s。．.!！?？、,،؛؟۔।॥";
const unspaced =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;
const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseReplacementRules(text: string): SpeechReplacement[] {
  return String(text ?? "").split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(.+?)\s*(?:=>|⇒|→)\s*(.*?)\s*$/.exec(line);
    if (!match || match[1].trim().startsWith("#")) return [];
    const decode = (value: string) =>
      value.replace(/\\([\\n])/g, (_, char) => char === "n" ? "\n" : "\\");
    return [{ from: decode(match[1].trim()), to: decode(match[2]) }];
  });
}

export function serializeReplacementRules(rules: SpeechReplacement[]): string {
  const encode = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n");
  return rules.map(({ from, to }) => ({ from: from.trim(), to: to.trim() }))
    .filter(({ from }) => from)
    .map(({ from, to }) => `${encode(from)} => ${encode(to)}`).join("\n");
}

export function applyReplacementRules(
  text: string,
  rules: SpeechReplacement[],
): string {
  if (!text || !rules.length) return text;
  const ordered = [...rules].sort((a, b) => b.from.length - a.from.length);
  const alternatives = ordered.map(({ from }) => {
    const edge = unspaced.test(from) || !/^[\p{L}\p{N}_]/u.test(from)
      ? ""
      : "(?<![\\p{L}\\p{N}\\p{M}_])";
    return `(${edge}${escapePattern(from)}${
      edge ? "(?![\\p{L}\\p{N}\\p{M}_])" : ""
    })`;
  }).join("|");
  const pattern = new RegExp(`(?:${alternatives})([${punctuation}]*)`, "giu");
  return text.replace(pattern, (...args) => {
    const index = args.slice(1, 1 + ordered.length).findIndex((value) =>
      value !== undefined
    );
    if (index < 0) return args[0];
    const to = ordered[index].to;
    const offset = args[args.length - 2] as number;
    const rest = (args[args.length - 1] as string).slice(
      offset + args[0].length,
    );
    return to +
      (to && rest && !new RegExp(`^[${punctuation}]`, "u").test(rest) &&
          !/\s$/.test(to)
        ? " "
        : "");
  });
}

export function trailingSpeechCommand(
  text: string,
  phrases: string,
): RegExpExecArray | null {
  const alternatives = phrases.split(/[,、\n]/).map((value) => value.trim())
    .filter(Boolean).sort((a, b) => b.length - a.length).map((phrase) => {
      const edge = !unspaced.test(phrase) && /^[\p{L}\p{N}_]/u.test(phrase)
        ? "(?<![\\p{L}\\p{N}\\p{M}_])"
        : "";
      return edge + escapePattern(phrase);
    });
  return alternatives.length
    ? new RegExp(`(?:${alternatives.join("|")})[${punctuation}]*$`, "iu").exec(
      text,
    )
    : null;
}

export function applySpeechCommands(
  text: string,
  commands: SpeechCommands,
): string {
  for (
    const [kind, value] of Object.entries(commands) as [
      keyof SpeechCommands,
      string,
    ][]
  ) {
    const match = trailingSpeechCommand(text, value);
    if (match) {
      return text.slice(0, match.index).trimEnd() +
        ({ question: "?", newline: "\n", exclamation: "!" }[kind]);
    }
  }
  return text;
}
