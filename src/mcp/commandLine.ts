export interface CommandToken {
  value: string;
  /** True when any part of the token was wrapped in quotes. */
  quoted: boolean;
}

/**
 * Tokenizes a command line the way a user expects when typing into a settings
 * field: whitespace separates tokens, and double or single quotes group text
 * containing whitespace. Backslashes are NOT treated as escape characters so
 * Windows paths (C:\Program Files\...) survive intact.
 */
export function tokenizeCommandLine(line: string): CommandToken[] {
  const tokens: CommandToken[] = [];
  let current = "";
  let quoted = false;
  let quote: '"' | "'" | null = null;
  let inToken = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && line[i + 1] === quote) {
        current += ch;
        i++;
      } else if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      quoted = true;
      inToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push({ value: current, quoted });
        current = "";
        quoted = false;
        inToken = false;
      }
      continue;
    }
    current += ch;
    inToken = true;
  }
  if (inToken) tokens.push({ value: current, quoted });
  return tokens;
}

export function splitCommandLine(line: string): string[] {
  return tokenizeCommandLine(line).map((tok) => tok.value);
}

/** Serialize arguments for settings, preserving whitespace and literal quotes. */
export function joinCommandLine(tokens: string[]): string {
  return tokens.map((tok) => (/[\s"']/.test(tok) || tok.length === 0 ? `"${tok.replace(/"/g, '""')}"` : tok)).join(" ");
}
