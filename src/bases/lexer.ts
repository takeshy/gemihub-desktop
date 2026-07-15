// Expression lexer — tokenizes expression strings (§7).
// Produces tokens for the recursive-descent parser.

import type { SourceSpan, Token, TokenType } from "./types";

const KEYWORDS = new Map<string, TokenType>([
  ["true", "BOOLEAN"],
  ["false", "BOOLEAN"],
  ["null", "NULL"],
]);

const REGEXP_FLAGS = new Set(["g", "i", "m", "s", "u", "y"]);

export class LexError extends Error {
  code: string;
  span: SourceSpan;
  constructor(code: string, message: string, span: SourceSpan) {
    super(message);
    this.code = code;
    this.span = span;
  }
}

function isWhitespace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\v" ||
    c === "\f" || c === "\u00a0" || c === "\ufeff";
}

function isIdentifierStart(c: string): boolean {
  return /[\p{L}\p{Nl}_$]/u.test(c);
}

function isIdentifierContinue(c: string): boolean {
  return /[\p{L}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}_$\u200c\u200d]/u.test(c);
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

export class Lexer {
  private input: string;
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];
  private prevTokenType: TokenType | "none" = "none";

  constructor(input: string) {
    this.input = input;
  }

  private currentSpan(
    startPos: number,
    startLine: number,
    startCol: number,
  ): SourceSpan {
    return {
      startOffset: startPos,
      endOffset: this.pos,
      startLine,
      startColumn: startCol,
      endLine: this.line,
      endColumn: this.col,
    };
  }

  private peek(offset = 0): string {
    return this.input[this.pos + offset] ?? "";
  }

  private advance(): string {
    const c = this.input[this.pos];
    if (c === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    this.pos++;
    return c;
  }

  tokenize(): Token[] {
    while (this.pos < this.input.length) {
      const c = this.peek();

      if (isWhitespace(c)) {
        this.advance();
        continue;
      }

      const startPos = this.pos;
      const startLine = this.line;
      const startCol = this.col;

      // Number literal: starts with digit or "." followed by digit
      if (isDigit(c) || (c === "." && isDigit(this.peek(1)))) {
        this.readNumber(startPos, startLine, startCol);
        continue;
      }

      // String literal
      if (c === '"' || c === "'") {
        this.readString(c, startPos, startLine, startCol);
        continue;
      }

      // RegExp literal: only when "/" appears at a primary-expression start position
      // (after nothing, after "(", after ",", after "[", or after an operator)
      if (c === "/") {
        if (this.isRegExpStart()) {
          this.readRegexp(startPos, startLine, startCol);
          continue;
        }
        // Otherwise it's division
        this.advance();
        this.tokens.push({
          type: "SLASH",
          value: "/",
          span: this.currentSpan(startPos, startLine, startCol),
        });
        this.prevTokenType = "SLASH";
        continue;
      }

      // Identifiers and keywords
      if (isIdentifierStart(c)) {
        this.readIdentifier(startPos, startLine, startCol);
        continue;
      }

      // Multi-char operators
      const two = c + this.peek(1);
      if (two === "&&") {
        this.advance();
        this.advance();
        this.tokens.push({
          type: "AMPAMP",
          value: "&&",
          span: this.currentSpan(startPos, startLine, startCol),
        });
        this.prevTokenType = "AMPAMP";
        continue;
      }
      if (two === "||") {
        this.advance();
        this.advance();
        this.tokens.push({
          type: "PIPEPIPE",
          value: "||",
          span: this.currentSpan(startPos, startLine, startCol),
        });
        this.prevTokenType = "PIPEPIPE";
        continue;
      }
      if (two === "==") {
        this.advance();
        this.advance();
        this.tokens.push({
          type: "EQEQ",
          value: "==",
          span: this.currentSpan(startPos, startLine, startCol),
        });
        this.prevTokenType = "EQEQ";
        continue;
      }
      if (two === "!=") {
        this.advance();
        this.advance();
        this.tokens.push({
          type: "BANGEQ",
          value: "!=",
          span: this.currentSpan(startPos, startLine, startCol),
        });
        this.prevTokenType = "BANGEQ";
        continue;
      }
      if (two === ">=") {
        this.advance();
        this.advance();
        this.tokens.push({
          type: "GTE",
          value: ">=",
          span: this.currentSpan(startPos, startLine, startCol),
        });
        this.prevTokenType = "GTE";
        continue;
      }
      if (two === "<=") {
        this.advance();
        this.advance();
        this.tokens.push({
          type: "LTE",
          value: "<=",
          span: this.currentSpan(startPos, startLine, startCol),
        });
        this.prevTokenType = "LTE";
        continue;
      }

      // Single-char tokens
      this.advance();
      const span = this.currentSpan(startPos, startLine, startCol);
      switch (c) {
        case "(":
          this.tokens.push({ type: "LPAREN", value: c, span });
          this.prevTokenType = "LPAREN";
          break;
        case ")":
          this.tokens.push({ type: "RPAREN", value: c, span });
          this.prevTokenType = "RPAREN";
          break;
        case "[":
          this.tokens.push({ type: "LBRACKET", value: c, span });
          this.prevTokenType = "LBRACKET";
          break;
        case "]":
          this.tokens.push({ type: "RBRACKET", value: c, span });
          this.prevTokenType = "RBRACKET";
          break;
        case "{":
          this.tokens.push({ type: "LBRACE", value: c, span });
          this.prevTokenType = "LBRACE";
          break;
        case "}":
          this.tokens.push({ type: "RBRACE", value: c, span });
          this.prevTokenType = "RBRACE";
          break;
        case ":":
          this.tokens.push({ type: "COLON", value: c, span });
          this.prevTokenType = "COLON";
          break;
        case ",":
          this.tokens.push({ type: "COMMA", value: c, span });
          this.prevTokenType = "COMMA";
          break;
        case ".":
          this.tokens.push({ type: "DOT", value: c, span });
          this.prevTokenType = "DOT";
          break;
        case "+":
          this.tokens.push({ type: "PLUS", value: c, span });
          this.prevTokenType = "PLUS";
          break;
        case "-":
          this.tokens.push({ type: "MINUS", value: c, span });
          this.prevTokenType = "MINUS";
          break;
        case "*":
          this.tokens.push({ type: "STAR", value: c, span });
          this.prevTokenType = "STAR";
          break;
        case "%":
          this.tokens.push({ type: "PERCENT", value: c, span });
          this.prevTokenType = "PERCENT";
          break;
        case "!":
          this.tokens.push({ type: "BANG", value: c, span });
          this.prevTokenType = "BANG";
          break;
        case ">":
          this.tokens.push({ type: "GT", value: c, span });
          this.prevTokenType = "GT";
          break;
        case "<":
          this.tokens.push({ type: "LT", value: c, span });
          this.prevTokenType = "LT";
          break;
        default:
          throw new LexError("LEX001", `Invalid character: ${c}`, span);
      }
    }

    this.tokens.push({
      type: "EOF",
      value: null,
      span: {
        startOffset: this.pos,
        endOffset: this.pos,
        startLine: this.line,
        startColumn: this.col,
        endLine: this.line,
        endColumn: this.col,
      },
    });
    return this.tokens;
  }

  private isRegExpStart(): boolean {
    // RegExp is valid at primary expression start: after nothing, "(", ",", "[", or any operator
    const t = this.prevTokenType;
    return (
      t === "none" ||
      t === "LPAREN" ||
      t === "LBRACKET" ||
      t === "COMMA" ||
      t === "BANG" ||
      t === "PLUS" ||
      t === "MINUS" ||
      t === "STAR" ||
      t === "SLASH" ||
      t === "PERCENT" ||
      t === "AMPAMP" ||
      t === "PIPEPIPE" ||
      t === "EQEQ" ||
      t === "BANGEQ" ||
      t === "GT" ||
      t === "LT" ||
      t === "GTE" ||
      t === "LTE"
    );
  }

  private readNumber(
    startPos: number,
    startLine: number,
    startCol: number,
  ): void {
    let s = "";
    // Integer part
    if (this.peek() === ".") {
      // .digits form
      this.advance();
      s += ".";
      while (isDigit(this.peek())) s += this.advance();
    } else {
      while (isDigit(this.peek())) s += this.advance();
      // Fractional part — only consume "." if followed by a digit
      if (this.peek() === "." && isDigit(this.peek(1))) {
        this.advance();
        s += ".";
        while (isDigit(this.peek())) s += this.advance();
      }
    }
    // Exponent
    if (this.peek() === "e" || this.peek() === "E") {
      s += this.advance();
      if (this.peek() === "+" || this.peek() === "-") s += this.advance();
      if (!isDigit(this.peek())) {
        throw new LexError(
          "LEX001",
          "Invalid exponent in number literal",
          this.currentSpan(startPos, startLine, startCol),
        );
      }
      while (isDigit(this.peek())) s += this.advance();
    }

    const value = Number(s);
    this.tokens.push({
      type: "NUMBER",
      value,
      span: this.currentSpan(startPos, startLine, startCol),
    });
    this.prevTokenType = "NUMBER";
  }

  private readString(
    quote: string,
    startPos: number,
    startLine: number,
    startCol: number,
  ): void {
    this.advance(); // consume opening quote
    let s = "";
    while (this.pos < this.input.length) {
      const c = this.peek();
      if (c === quote) {
        this.advance(); // consume closing quote
        this.tokens.push({
          type: "STRING",
          value: s,
          span: this.currentSpan(startPos, startLine, startCol),
        });
        this.prevTokenType = "STRING";
        return;
      }
      if (c === "\n") {
        throw new LexError(
          "LEX010",
          "Unterminated string literal (newline)",
          this.currentSpan(startPos, startLine, startCol),
        );
      }
      if (c === "\\") {
        this.advance();
        const esc = this.peek();
        switch (esc) {
          case "n":
            s += "\n";
            this.advance();
            break;
          case "r":
            s += "\r";
            this.advance();
            break;
          case "t":
            s += "\t";
            this.advance();
            break;
          case "b":
            s += "\b";
            this.advance();
            break;
          case "f":
            s += "\f";
            this.advance();
            break;
          case "v":
            s += "\v";
            this.advance();
            break;
          case "0":
            s += "\0";
            this.advance();
            break;
          case "\\":
            s += "\\";
            this.advance();
            break;
          case "'":
            s += "'";
            this.advance();
            break;
          case '"':
            s += '"';
            this.advance();
            break;
          case "x": {
            this.advance();
            let hex = "";
            for (let i = 0; i < 2; i++) {
              const h = this.peek();
              if (/[0-9a-fA-F]/.test(h)) {
                hex += h;
                this.advance();
              } else {
                throw new LexError(
                  "LEX010",
                  "Invalid \\x escape",
                  this.currentSpan(startPos, startLine, startCol),
                );
              }
            }
            s += String.fromCharCode(parseInt(hex, 16));
            break;
          }
          case "u": {
            this.advance();
            if (this.peek() === "{") {
              this.advance();
              let hex = "";
              while (this.peek() !== "}" && this.pos < this.input.length) {
                const h = this.peek();
                if (/[0-9a-fA-F]/.test(h)) {
                  hex += h;
                  this.advance();
                } else {
                  throw new LexError(
                    "LEX010",
                    "Invalid \\u{} escape",
                    this.currentSpan(startPos, startLine, startCol),
                  );
                }
              }
              if (this.peek() !== "}") {
                throw new LexError(
                  "LEX010",
                  "Unterminated \\u{} escape",
                  this.currentSpan(startPos, startLine, startCol),
                );
              }
              this.advance();
              const cp = parseInt(hex, 16);
              if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
                throw new LexError(
                  "LEX010",
                  "Invalid Unicode scalar",
                  this.currentSpan(startPos, startLine, startCol),
                );
              }
              s += String.fromCodePoint(cp);
            } else {
              let hex = "";
              for (let i = 0; i < 4; i++) {
                const h = this.peek();
                if (/[0-9a-fA-F]/.test(h)) {
                  hex += h;
                  this.advance();
                } else {
                  throw new LexError(
                    "LEX010",
                    "Invalid \\u escape",
                    this.currentSpan(startPos, startLine, startCol),
                  );
                }
              }
              s += String.fromCharCode(parseInt(hex, 16));
            }
            break;
          }
          default:
            throw new LexError(
              "LEX010",
              `Invalid escape: \\${esc}`,
              this.currentSpan(startPos, startLine, startCol),
            );
        }
      } else {
        s += this.advance();
      }
    }
    throw new LexError(
      "LEX010",
      "Unterminated string literal",
      this.currentSpan(startPos, startLine, startCol),
    );
  }

  private readRegexp(
    startPos: number,
    startLine: number,
    startCol: number,
  ): void {
    this.advance(); // consume "/"
    let pattern = "";
    let inClass = false;
    while (this.pos < this.input.length) {
      const c = this.peek();
      if (c === "\n") {
        throw new LexError(
          "LEX020",
          "Unterminated regexp (newline)",
          this.currentSpan(startPos, startLine, startCol),
        );
      }
      if (c === "\\") {
        pattern += this.advance();
        if (this.pos < this.input.length) {
          pattern += this.advance();
        }
        continue;
      }
      if (c === "[" && !inClass) {
        inClass = true;
        pattern += this.advance();
        continue;
      }
      if (c === "]" && inClass) {
        inClass = false;
        pattern += this.advance();
        continue;
      }
      if (c === "/" && !inClass) {
        this.advance(); // consume "/"
        // Read flags
        let flags = "";
        const seenFlags = new Set<string>();
        while (this.pos < this.input.length && REGEXP_FLAGS.has(this.peek())) {
          const f = this.advance();
          if (seenFlags.has(f)) {
            throw new LexError(
              "LEX020",
              `Duplicate regexp flag: ${f}`,
              this.currentSpan(startPos, startLine, startCol),
            );
          }
          seenFlags.add(f);
          flags += f;
        }
        // Check for unknown flags (any identifier char after flags)
        if (isIdentifierStart(this.peek())) {
          throw new LexError(
            "LEX020",
            `Unknown regexp flag: ${this.peek()}`,
            this.currentSpan(startPos, startLine, startCol),
          );
        }
        // Validate the pattern by constructing a RegExp
        try {
          new RegExp(pattern, flags);
        } catch (e) {
          throw new LexError(
            "LEX020",
            `Invalid regexp: ${(e as Error).message}`,
            this.currentSpan(startPos, startLine, startCol),
          );
        }
        this.tokens.push({
          type: "REGEXP",
          value: null,
          regexpSource: pattern,
          regexpFlags: flags,
          span: this.currentSpan(startPos, startLine, startCol),
        });
        this.prevTokenType = "REGEXP";
        return;
      }
      pattern += this.advance();
    }
    throw new LexError(
      "LEX020",
      "Unterminated regexp",
      this.currentSpan(startPos, startLine, startCol),
    );
  }

  private readIdentifier(
    startPos: number,
    startLine: number,
    startCol: number,
  ): void {
    let name = "";
    while (this.pos < this.input.length && isIdentifierContinue(this.peek())) {
      name += this.advance();
    }
    const kw = KEYWORDS.get(name);
    if (kw) {
      this.tokens.push({
        type: kw,
        value: name === "true" ? true : name === "false" ? false : null,
        span: this.currentSpan(startPos, startLine, startCol),
      });
      this.prevTokenType = kw;
    } else {
      this.tokens.push({
        type: "IDENTIFIER",
        value: name,
        span: this.currentSpan(startPos, startLine, startCol),
      });
      this.prevTokenType = "IDENTIFIER";
    }
  }
}
