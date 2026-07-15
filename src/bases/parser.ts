// Expression parser — recursive descent parser following the EBNF grammar (§8).
// Produces an AST from the lexer's token stream.

import { Lexer } from "./lexer";
import type { AstNode, SourceSpan, Token } from "./types";
import { bool, NULL, num, str } from "./types";

export class ParseError extends Error {
  code: string;
  span: SourceSpan;
  constructor(code: string, message: string, span: SourceSpan) {
    super(message);
    this.code = code;
    this.span = span;
  }
}

export function parseExpression(input: string): AstNode {
  const lexer = new Lexer(input);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  parser.expectEOF();
  return ast;
}

export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ??
      this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private check(type: Token["type"]): boolean {
    return this.peek().type === type;
  }

  private match(type: Token["type"]): Token | null {
    if (this.check(type)) return this.advance();
    return null;
  }

  private expect(type: Token["type"], code: string, msg: string): Token {
    const t = this.peek();
    if (t.type !== type) throw new ParseError(code, msg, t.span);
    return this.advance();
  }

  private spanFrom(start: SourceSpan): SourceSpan {
    const end = this.peek().span;
    return {
      startOffset: start.startOffset,
      endOffset: end.endOffset,
      startLine: start.startLine,
      startColumn: start.startColumn,
      endLine: end.endLine,
      endColumn: end.endColumn,
    };
  }

  parseExpression(): AstNode {
    return this.logicalOr();
  }

  private logicalOr(): AstNode {
    let left = this.logicalAnd();
    while (this.check("PIPEPIPE")) {
      const op = this.advance();
      const right = this.logicalAnd();
      left = {
        kind: "binary",
        op: op.value as string,
        left,
        right,
        span: {
          startOffset: left.span.startOffset,
          endOffset: right.span.endOffset,
          startLine: left.span.startLine,
          startColumn: left.span.startColumn,
          endLine: right.span.endLine,
          endColumn: right.span.endColumn,
        },
      };
    }
    return left;
  }

  private logicalAnd(): AstNode {
    let left = this.equality();
    while (this.check("AMPAMP")) {
      const op = this.advance();
      const right = this.equality();
      left = {
        kind: "binary",
        op: op.value as string,
        left,
        right,
        span: {
          startOffset: left.span.startOffset,
          endOffset: right.span.endOffset,
          startLine: left.span.startLine,
          startColumn: left.span.startColumn,
          endLine: right.span.endLine,
          endColumn: right.span.endColumn,
        },
      };
    }
    return left;
  }

  private equality(): AstNode {
    let left = this.relational();
    while (this.check("EQEQ") || this.check("BANGEQ")) {
      const op = this.advance();
      const right = this.relational();
      left = {
        kind: "binary",
        op: op.value as string,
        left,
        right,
        span: {
          startOffset: left.span.startOffset,
          endOffset: right.span.endOffset,
          startLine: left.span.startLine,
          startColumn: left.span.startColumn,
          endLine: right.span.endLine,
          endColumn: right.span.endColumn,
        },
      };
    }
    return left;
  }

  private relational(): AstNode {
    let left = this.additive();
    while (
      this.check("GT") || this.check("LT") || this.check("GTE") ||
      this.check("LTE")
    ) {
      const op = this.advance();
      const right = this.additive();
      left = {
        kind: "binary",
        op: op.value as string,
        left,
        right,
        span: {
          startOffset: left.span.startOffset,
          endOffset: right.span.endOffset,
          startLine: left.span.startLine,
          startColumn: left.span.startColumn,
          endLine: right.span.endLine,
          endColumn: right.span.endColumn,
        },
      };
    }
    return left;
  }

  private additive(): AstNode {
    let left = this.multiplicative();
    while (this.check("PLUS") || this.check("MINUS")) {
      const op = this.advance();
      const right = this.multiplicative();
      left = {
        kind: "binary",
        op: op.value as string,
        left,
        right,
        span: {
          startOffset: left.span.startOffset,
          endOffset: right.span.endOffset,
          startLine: left.span.startLine,
          startColumn: left.span.startColumn,
          endLine: right.span.endLine,
          endColumn: right.span.endColumn,
        },
      };
    }
    return left;
  }

  private multiplicative(): AstNode {
    let left = this.unary();
    while (this.check("STAR") || this.check("SLASH") || this.check("PERCENT")) {
      const op = this.advance();
      const right = this.unary();
      left = {
        kind: "binary",
        op: op.value as string,
        left,
        right,
        span: {
          startOffset: left.span.startOffset,
          endOffset: right.span.endOffset,
          startLine: left.span.startLine,
          startColumn: left.span.startColumn,
          endLine: right.span.endLine,
          endColumn: right.span.endColumn,
        },
      };
    }
    return left;
  }

  private unary(): AstNode {
    if (this.check("BANG") || this.check("PLUS") || this.check("MINUS")) {
      const op = this.advance();
      const operand = this.unary();
      return {
        kind: "unary",
        op: op.value as string,
        operand,
        span: {
          startOffset: op.span.startOffset,
          endOffset: operand.span.endOffset,
          startLine: op.span.startLine,
          startColumn: op.span.startColumn,
          endLine: operand.span.endLine,
          endColumn: operand.span.endColumn,
        },
      };
    }
    return this.postfix();
  }

  private postfix(): AstNode {
    let expr = this.primary();
    while (true) {
      if (this.check("DOT")) {
        const dot = this.advance();
        // PAR002: direct numeric literal member access (no gap between number and dot)
        if (
          expr.kind === "literal" && expr.value.type === "number" &&
          dot.span.startOffset === expr.span.endOffset
        ) {
          throw new ParseError(
            "PAR002",
            "Direct numeric literal member access not allowed; use parentheses e.g. (1).isTruthy()",
            dot.span,
          );
        }
        const id = this.expect(
          "IDENTIFIER",
          "PAR001",
          "Expected identifier after '.'",
        );
        expr = {
          kind: "member",
          object: expr,
          property: id.value as string,
          span: {
            startOffset: expr.span.startOffset,
            endOffset: id.span.endOffset,
            startLine: expr.span.startLine,
            startColumn: expr.span.startColumn,
            endLine: id.span.endLine,
            endColumn: id.span.endColumn,
          },
        };
      } else if (this.check("LBRACKET")) {
        this.advance();
        const index = this.parseExpression();
        this.expect("RBRACKET", "PAR001", "Expected ']'");
        expr = {
          kind: "index",
          object: expr,
          index,
          span: {
            startOffset: expr.span.startOffset,
            endOffset: this.peek().span.endOffset,
            startLine: expr.span.startLine,
            startColumn: expr.span.startColumn,
            endLine: this.peek().span.endLine,
            endColumn: this.peek().span.endColumn,
          },
        };
      } else if (this.check("LPAREN")) {
        this.advance();
        const args: AstNode[] = [];
        if (!this.check("RPAREN")) {
          args.push(this.parseExpression());
          while (this.match("COMMA")) {
            if (this.check("RPAREN")) break; // trailing comma
            args.push(this.parseExpression());
          }
        }
        const close = this.expect("RPAREN", "PAR001", "Expected ')'");
        expr = {
          kind: "call",
          callee: expr,
          args,
          span: {
            startOffset: expr.span.startOffset,
            endOffset: close.span.endOffset,
            startLine: expr.span.startLine,
            startColumn: expr.span.startColumn,
            endLine: close.span.endLine,
            endColumn: close.span.endColumn,
          },
        };
      } else {
        break;
      }
    }
    return expr;
  }

  private primary(): AstNode {
    const t = this.peek();

    switch (t.type) {
      case "NUMBER": {
        this.advance();
        return { kind: "literal", value: num(t.value as number), span: t.span };
      }
      case "STRING": {
        this.advance();
        return { kind: "literal", value: str(t.value as string), span: t.span };
      }
      case "BOOLEAN": {
        this.advance();
        return {
          kind: "literal",
          value: bool(t.value as boolean),
          span: t.span,
        };
      }
      case "NULL": {
        this.advance();
        return { kind: "literal", value: NULL, span: t.span };
      }
      case "REGEXP": {
        this.advance();
        return {
          kind: "literal",
          value: {
            type: "regexp",
            source: t.regexpSource!,
            flags: t.regexpFlags!,
            re: new RegExp(t.regexpSource!, t.regexpFlags!),
          },
          span: t.span,
        };
      }
      case "IDENTIFIER": {
        this.advance();
        return { kind: "identifier", name: t.value as string, span: t.span };
      }
      case "LBRACKET": {
        this.advance();
        const elements: AstNode[] = [];
        if (!this.check("RBRACKET")) {
          elements.push(this.parseExpression());
          while (this.match("COMMA")) {
            if (this.check("RBRACKET")) break; // trailing comma
            elements.push(this.parseExpression());
          }
        }
        const close = this.expect("RBRACKET", "PAR001", "Expected ']'");
        return {
          kind: "list",
          elements,
          span: {
            startOffset: t.span.startOffset,
            endOffset: close.span.endOffset,
            startLine: t.span.startLine,
            startColumn: t.span.startColumn,
            endLine: close.span.endLine,
            endColumn: close.span.endColumn,
          },
        };
      }
      case "LPAREN": {
        this.advance();
        const expr = this.parseExpression();
        this.expect("RPAREN", "PAR001", "Expected ')'");
        return expr;
      }
      case "LBRACE": {
        this.advance();
        throw new ParseError("PAR003", "Object literal not supported", t.span);
      }
      default:
        throw new ParseError("PAR001", `Unexpected token: ${t.type}`, t.span);
    }
  }

  expectEOF(): void {
    const t = this.peek();
    if (t.type !== "EOF") {
      throw new ParseError(
        "PAR004",
        `Trailing tokens after expression`,
        t.span,
      );
    }
  }
}
