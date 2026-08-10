import crypto from "node:crypto";
import fs from "node:fs";

const KEYWORDS = new Set([
  "module", "pub", "const", "struct", "enum", "fn", "requires",
  "ensures", "invariant", "init", "let", "mut", "move", "return",
  "if", "else", "while", "loop", "break", "continue", "match",
  "true", "false",
]);

const RESERVED = new Map([
  ["unsafe", "K1"], ["effect", "K1"], ["capability", "K1"],
  ["linear", "K1"], ["trait", "K1"], ["impl", "K1"],
  ["comptime", "K1"], ["assume", "K1"], ["async", "K2"],
  ["await", "K2"], ["spawn", "K2"],
]);

const PUNCTUATORS = [
  "::", "->", "=>", "==", "!=", "<=", ">=", "&&", "||",
  "{", "}", "(", ")", "[", "]", "<", ">", ",", ";", ":", ".",
  "=", "+", "-", "*", "/", "%", "!", "&", "|",
];

const PRIMITIVES = new Set([
  "bool", "unit", "u8", "u16", "u32", "u64", "i8", "i16", "i32",
  "i64", "usize", "isize",
]);

const BINARY_PRECEDENCE = new Map([
  ["||", 1], ["&&", 2], ["==", 3], ["!=", 3], ["<", 4], ["<=", 4],
  [">", 4], [">=", 4], ["+", 5], ["-", 5], ["*", 6], ["/", 6],
  ["%", 6],
]);

const CONTRACT_PRECEDENCE = new Map([
  ["||", 1], ["&&", 2], ["==", 3], ["!=", 3], ["<", 4], ["<=", 4],
  [">", 4], [">=", 4], ["+", 5], ["-", 5], ["*", 6],
]);

class K0Error extends Error {
  constructor(phase, code, start, end, token) {
    super(code);
    this.diagnostic = {
      status: "rejected",
      phase,
      code,
      span: { start, end },
      ...(token === undefined ? {} : { token }),
    };
  }
}

function lexicalError(code, start, end, token) {
  throw new K0Error("lexical", code, start, end, token);
}

function parseInteger(text, start, end) {
  let valid = false;
  let radix = 10;
  let digits = text;
  if (/^0b[01](?:_?[01])*$/.test(text)) {
    valid = true;
    radix = 2;
    digits = text.slice(2);
  } else if (/^0o[0-7](?:_?[0-7])*$/.test(text)) {
    valid = true;
    radix = 8;
    digits = text.slice(2);
  } else if (/^0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/.test(text)) {
    valid = true;
    radix = 16;
    digits = text.slice(2);
  } else if (/^[0-9](?:_?[0-9])*$/.test(text)) {
    valid = true;
  }
  if (!valid) lexicalError("LEX-INVALID-TOKEN", start, end, text);
  const clean = digits.replaceAll("_", "");
  let value;
  if (radix === 10) value = BigInt(clean);
  else if (radix === 16) value = BigInt(`0x${clean}`);
  else if (radix === 8) value = BigInt(`0o${clean}`);
  else value = BigInt(`0b${clean}`);
  return value.toString(10);
}

export function tokenize(source) {
  const tokens = [];
  const byteOffsets = new Array(source.length + 1);
  let byteOffset = 0;
  for (let offset = 0; offset < source.length;) {
    const scalar = String.fromCodePoint(source.codePointAt(offset));
    byteOffsets[offset] = byteOffset;
    if (scalar.length === 2) byteOffsets[offset + 1] = byteOffset;
    offset += scalar.length;
    byteOffset += Buffer.byteLength(scalar, "utf8");
  }
  byteOffsets[source.length] = byteOffset;
  const byte = (offset) => byteOffsets[offset];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }
    if (source.startsWith("//", index)) {
      index += 2;
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") index += 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const start = index;
      const end = source.indexOf("*/", index + 2);
      if (end < 0) lexicalError("LEX-UNTERMINATED-COMMENT", byte(start), byte(source.length));
      index = end + 2;
      continue;
    }
    if (char === "'") {
      const start = index;
      index += 1;
      if (index >= source.length || !/[A-Za-z_]/.test(source[index])) {
        lexicalError("LEX-INVALID-TOKEN", byte(start), byte(index), "'");
      }
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      tokens.push({ kind: "LIFETIME", text: source.slice(start, index), start: byte(start), end: byte(index) });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      const text = source.slice(start, index);
      if (RESERVED.has(text)) {
        const error = new K0Error("lexical", "LAYER-FEATURE-DISABLED", byte(start), byte(index), text);
        error.diagnostic.requested_layer = "K0";
        error.diagnostic.available_since = RESERVED.get(text);
        throw error;
      }
      tokens.push({ kind: KEYWORDS.has(text) ? "KEYWORD" : "IDENT", text, start: byte(start), end: byte(index) });
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      const text = source.slice(start, index);
      tokens.push({
        kind: "INTEGER",
        text,
        value: parseInteger(text, byte(start), byte(index)),
        start: byte(start),
        end: byte(index),
      });
      continue;
    }
    const punctuator = PUNCTUATORS.find((candidate) => source.startsWith(candidate, index));
    if (punctuator) {
      tokens.push({
        kind: "PUNCT",
        text: punctuator,
        start: byte(index),
        end: byte(index + punctuator.length),
      });
      index += punctuator.length;
      continue;
    }
    const scalar = String.fromCodePoint(source.codePointAt(index));
    lexicalError("LEX-INVALID-TOKEN", byte(index), byte(index + scalar.length), scalar);
  }
  tokens.push({ kind: "EOF", text: "<eof>", start: byte(source.length), end: byte(source.length) });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  current() {
    return this.tokens[this.index];
  }

  mark(start, value, end = this.tokens[Math.max(0, this.index - 1)].end, origin = "source") {
    value._span = { start, end, origin };
    return value;
  }

  at(text) {
    return this.current().text === text;
  }

  take(text) {
    if (!this.at(text)) return false;
    this.index += 1;
    return true;
  }

  error(token = this.current()) {
    const code = token.kind === "EOF" ? "PARSE-UNEXPECTED-EOF" : "PARSE-UNEXPECTED-TOKEN";
    throw new K0Error("parse", code, token.start, token.end, token.kind === "EOF" ? undefined : token.text);
  }

  expect(text) {
    if (!this.take(text)) this.error();
  }

  identifier() {
    const token = this.current();
    if (token.kind !== "IDENT") this.error(token);
    this.index += 1;
    return token.text;
  }

  modulePath() {
    const parts = [this.identifier()];
    while (this.take(".")) parts.push(this.identifier());
    return parts;
  }

  symbolPath() {
    const parts = [this.identifier()];
    while (this.take("::")) parts.push(this.identifier());
    return parts;
  }

  contractId() {
    return this.modulePath();
  }

  parseSource() {
    this.expect("module");
    const module = this.modulePath();
    this.expect(";");
    const items = [];
    while (this.current().kind !== "EOF") items.push(this.item());
    return { kind: "source", module, items };
  }

  item() {
    const visibility = this.take("pub") ? "public" : "private";
    if (this.take("const")) return this.constDecl(visibility);
    if (this.take("struct")) return this.structDecl(visibility);
    if (this.take("enum")) return this.enumDecl(visibility);
    if (this.take("fn")) return this.fnDecl(visibility);
    this.error();
  }

  constDecl(visibility) {
    const name = this.identifier();
    this.expect(":");
    const type = this.type();
    this.expect("=");
    const value = this.contractExpression();
    this.expect(";");
    return { kind: "const", visibility, name, type, value };
  }

  invariant() {
    this.expect("invariant");
    const id = this.contractId();
    this.expect(":");
    const expression = this.contractExpression();
    this.expect(";");
    return { kind: "invariant", id, expression, status: "DECLARED_UNPROVEN" };
  }

  fieldDecl() {
    const visibility = this.take("pub") ? "public" : "private";
    const name = this.identifier();
    this.expect(":");
    const type = this.type();
    this.expect(",");
    return { kind: "field", visibility, name, type };
  }

  structDecl(visibility) {
    const name = this.identifier();
    this.expect("{");
    const fields = [];
    const invariants = [];
    while (!this.at("}")) {
      if (this.at("invariant")) invariants.push(this.invariant());
      else fields.push(this.fieldDecl());
    }
    this.expect("}");
    return { kind: "struct", visibility, name, fields, invariants };
  }

  enumDecl(visibility) {
    const name = this.identifier();
    this.expect("{");
    const variants = [];
    const invariants = [];
    while (!this.at("}")) {
      if (this.at("invariant")) {
        invariants.push(this.invariant());
        continue;
      }
      const variantStart = this.current().start;
      const variantName = this.identifier();
      let payload = this.mark(variantStart, { kind: "unit" });
      if (this.take("(")) {
        const payloadStart = this.tokens[this.index - 1].start;
        payload = { kind: "tuple", types: this.typeList(")") };
        this.expect(")");
        this.mark(payloadStart, payload);
      } else if (this.take("{")) {
        const payloadStart = this.tokens[this.index - 1].start;
        const fields = [];
        while (!this.at("}")) fields.push(this.fieldDecl());
        this.expect("}");
        payload = { kind: "record", fields };
        this.mark(payloadStart, payload);
      }
      this.expect(",");
      variants.push(this.mark(variantStart, { kind: "variant", name: variantName, payload }));
    }
    this.expect("}");
    return { kind: "enum", visibility, name, variants, invariants };
  }

  fnDecl(visibility) {
    const name = this.identifier();
    this.expect("(");
    const params = [];
    if (!this.at(")")) {
      while (true) {
        const parameterStart = this.current().start;
        const paramName = this.identifier();
        this.expect(":");
        params.push(this.mark(parameterStart, { name: paramName, type: this.type() }));
        if (!this.take(",")) break;
        if (this.at(")")) break;
      }
    }
    this.expect(")");
    const implicitResultOffset = this.tokens[this.index - 1].end;
    const result = this.take("->")
      ? this.type()
      : this.mark(implicitResultOffset, { kind: "primitive", name: "unit" }, implicitResultOffset, "synthetic");
    const contracts = [];
    while (this.at("requires") || this.at("ensures")) {
      const contractStart = this.current().start;
      const contractKind = this.current().text;
      this.index += 1;
      const id = this.contractId();
      this.expect(":");
      const expression = this.contractExpression();
      this.expect(";");
      contracts.push(this.mark(contractStart, {
        kind: contractKind,
        id,
        expression,
        status: "DECLARED_UNPROVEN",
      }));
    }
    const body = this.block();
    return { kind: "function", visibility, name, params, result, contracts, body };
  }

  typeList(end) {
    const types = [];
    if (this.at(end)) return types;
    while (true) {
      types.push(this.type());
      if (!this.take(",")) break;
      if (this.at(end)) break;
    }
    return types;
  }

  type() {
    if (this.take("&")) {
      let lifetime = null;
      if (this.current().kind === "LIFETIME") {
        lifetime = this.current().text.slice(1);
        this.index += 1;
      }
      const mutable = this.take("mut");
      return { kind: mutable ? "mut_ref" : "shared_ref", lifetime, element: this.type() };
    }
    if (this.take("[")) {
      const element = this.type();
      if (this.take(";")) {
        const length = this.integerLiteral();
        this.expect("]");
        return { kind: "array", element, length: length.value };
      }
      this.expect("]");
      return { kind: "slice", element };
    }
    if (this.take("(")) {
      const elements = this.typeList(")");
      this.expect(")");
      return { kind: "tuple", elements };
    }
    const token = this.current();
    if (token.kind !== "IDENT") this.error(token);
    if (PRIMITIVES.has(token.text)) {
      this.index += 1;
      return { kind: "primitive", name: token.text };
    }
    if (token.text === "Own") {
      this.index += 1;
      this.expect("<");
      const value = this.type();
      this.expect(",");
      const brand = this.symbolPath();
      this.expect(">");
      return { kind: "own", value, brand };
    }
    if (token.text === "Allocator") {
      this.index += 1;
      this.expect("<");
      const brand = this.symbolPath();
      this.expect(">");
      return { kind: "allocator", brand };
    }
    if (token.text === "Result") {
      this.index += 1;
      this.expect("<");
      const ok = this.type();
      this.expect(",");
      const error = this.type();
      this.expect(">");
      return { kind: "result", ok, error };
    }
    return { kind: "path_type", path: this.symbolPath() };
  }

  integerLiteral() {
    const token = this.current();
    if (token.kind !== "INTEGER") this.error(token);
    this.index += 1;
    return { kind: "integer", value: token.value };
  }

  literal() {
    if (this.current().kind === "INTEGER") return this.integerLiteral();
    if (this.take("true")) return { kind: "boolean", value: true };
    if (this.take("false")) return { kind: "boolean", value: false };
    this.error();
  }

  block() {
    this.expect("{");
    const statements = [];
    let tail = null;
    while (!this.at("}")) {
      if (this.current().kind === "EOF") this.error();
      const statementStart = this.current().start;
      if (this.take("let")) {
        const mutable = this.take("mut");
        const name = this.identifier();
        const annotation = this.take(":") ? this.type() : null;
        this.expect("=");
        const value = this.expression();
        this.expect(";");
        statements.push(this.mark(statementStart, { kind: "let", mutable, name, annotation, value }));
        continue;
      }
      if (this.take("return")) {
        const value = this.at(";") ? null : this.expression();
        this.expect(";");
        statements.push(this.mark(statementStart, { kind: "return", value }));
        continue;
      }
      if (this.take("while")) {
        const condition = this.expression();
        const body = this.block();
        statements.push(this.mark(statementStart, { kind: "while", condition, body }));
        continue;
      }
      if (this.take("loop")) {
        statements.push(this.mark(statementStart, { kind: "loop", body: this.block() }));
        continue;
      }
      if (this.take("break")) {
        this.expect(";");
        statements.push(this.mark(statementStart, { kind: "break" }));
        continue;
      }
      if (this.take("continue")) {
        this.expect(";");
        statements.push(this.mark(statementStart, { kind: "continue" }));
        continue;
      }
      const left = this.expression();
      if (this.take("=")) {
        if (!this.isPlace(left)) this.error(this.tokens[this.index - 1]);
        const value = this.expression();
        this.expect(";");
        statements.push(this.mark(statementStart, { kind: "assign", place: left, value }));
      } else if (this.take(";")) {
        statements.push(this.mark(statementStart, { kind: "expression_statement", expression: left }));
      } else if (this.at("}")) {
        tail = left;
        break;
      } else {
        this.error();
      }
    }
    this.expect("}");
    return { kind: "block", statements, tail };
  }

  isPlace(node) {
    if (node.kind === "path") return true;
    if (node.kind === "field" || node.kind === "index") return this.isPlace(node.base);
    return node.kind === "unary" && node.operator === "*";
  }

  expression(minimum = 1) {
    const start = this.current().start;
    let left = this.unaryExpression();
    while (true) {
      const precedence = BINARY_PRECEDENCE.get(this.current().text) ?? 0;
      if (precedence < minimum) break;
      const operator = this.current().text;
      this.index += 1;
      const right = this.expression(precedence + 1);
      left = this.mark(start, { kind: "binary", operator, left, right });
    }
    return this.mark(start, left);
  }

  unaryExpression() {
    const start = this.current().start;
    if (this.at("!") || this.at("-") || this.at("move") || this.at("*")) {
      const operator = this.current().text;
      this.index += 1;
      return this.mark(start, { kind: "unary", operator, value: this.unaryExpression() });
    }
    if (this.take("&")) {
      const mutable = this.take("mut");
      return this.mark(start, { kind: "borrow", mutable, place: this.unaryExpression() });
    }
    let value = this.primary();
    while (true) {
      if (this.take("(")) {
        const arguments_ = this.expressionList(")");
        this.expect(")");
        value = this.mark(start, { kind: "call", callee: value, arguments: arguments_ });
      } else if (this.take(".")) {
        value = this.mark(start, { kind: "field", base: value, field: this.identifier() });
      } else if (this.take("[")) {
        const index = this.expression();
        this.expect("]");
        value = this.mark(start, { kind: "index", base: value, index });
      } else break;
    }
    return this.mark(start, value);
  }

  expressionList(end) {
    const values = [];
    if (this.at(end)) return values;
    while (true) {
      values.push(this.expression());
      if (!this.take(",")) break;
      if (this.at(end)) break;
    }
    return values;
  }

  primary() {
    if (this.current().kind === "INTEGER" || this.at("true") || this.at("false")) return this.literal();
    if (this.take("init")) {
      const path = this.symbolPath();
      this.expect("{");
      const fields = [];
      while (!this.at("}")) {
        const fieldStart = this.current().start;
        const name = this.identifier();
        this.expect(":");
        const value = this.expression();
        this.expect(",");
        fields.push(this.mark(fieldStart, { name, value }));
      }
      this.expect("}");
      return { kind: "record", path, fields };
    }
    if (this.take("if")) return this.ifExpression();
    if (this.take("match")) return this.matchExpression();
    if (this.at("{")) return this.block();
    if (this.take("[")) {
      const elements = this.expressionList("]");
      this.expect("]");
      return { kind: "array", elements };
    }
    if (this.take("(")) {
      if (this.take(")")) return { kind: "tuple", elements: [] };
      const first = this.expression();
      if (!this.take(",")) {
        this.expect(")");
        return first;
      }
      const elements = [first];
      while (!this.at(")")) {
        elements.push(this.expression());
        if (!this.take(",")) break;
      }
      this.expect(")");
      return { kind: "tuple", elements };
    }
    if (this.current().kind === "IDENT") return { kind: "path", path: this.symbolPath() };
    this.error();
  }

  ifExpression() {
    const condition = this.expression();
    const then = this.block();
    let otherwise = null;
    if (this.take("else")) {
      if (this.at("if")) {
        const otherwiseStart = this.current().start;
        this.expect("if");
        otherwise = this.mark(otherwiseStart, this.ifExpression());
      }
      else otherwise = this.block();
    }
    return { kind: "if", condition, then, otherwise };
  }

  matchExpression() {
    const value = this.expression();
    this.expect("{");
    const arms = [];
    if (this.at("}")) this.error();
    while (!this.at("}")) {
      const armStart = this.current().start;
      const pattern = this.pattern();
      this.expect("=>");
      const expression = this.expression();
      this.expect(",");
      arms.push(this.mark(armStart, { pattern, expression }));
    }
    this.expect("}");
    return { kind: "match", value, arms };
  }

  patternList(end) {
    const patterns = [];
    if (this.at(end)) return patterns;
    while (true) {
      patterns.push(this.pattern());
      if (!this.take(",")) break;
      if (this.at(end)) break;
    }
    return patterns;
  }

  pattern() {
    if (this.current().kind === "INTEGER" || this.at("true") || this.at("false")) {
      return { kind: "literal_pattern", value: this.literal() };
    }
    if (this.take("(")) {
      const elements = this.patternList(")");
      this.expect(")");
      return { kind: "tuple_pattern", elements };
    }
    if (this.current().kind !== "IDENT") this.error();
    const path = this.symbolPath();
    if (path.length === 1 && path[0] === "_") return { kind: "wildcard_pattern" };
    if (path.length === 1) return { kind: "binding_pattern", name: path[0] };
    if (this.take("(")) {
      const elements = this.patternList(")");
      this.expect(")");
      return { kind: "variant_tuple_pattern", path, elements };
    }
    if (this.take("{")) {
      const fields = [];
      while (!this.at("}")) {
        const fieldStart = this.current().start;
        const name = this.identifier();
        this.expect(":");
        const pattern = this.pattern();
        this.expect(",");
        fields.push(this.mark(fieldStart, { name, pattern }));
      }
      this.expect("}");
      return { kind: "variant_record_pattern", path, fields };
    }
    return { kind: "path_pattern", path };
  }

  contractExpression(minimum = 1) {
    const start = this.current().start;
    let left = this.contractUnary();
    while (true) {
      const precedence = CONTRACT_PRECEDENCE.get(this.current().text) ?? 0;
      if (precedence < minimum) break;
      const operator = this.current().text;
      this.index += 1;
      const right = this.contractExpression(precedence + 1);
      left = this.mark(start, { kind: "contract_binary", operator, left, right });
    }
    return this.mark(start, left);
  }

  contractUnary() {
    const start = this.current().start;
    if (this.at("!") || this.at("-")) {
      const operator = this.current().text;
      this.index += 1;
      return this.mark(start, { kind: "contract_unary", operator, value: this.contractUnary() });
    }
    if (this.current().kind === "INTEGER" || this.at("true") || this.at("false")) return this.literal();
    if (this.take("(")) {
      const value = this.contractExpression();
      this.expect(")");
      return this.mark(start, value);
    }
    const symbol = this.symbolPath();
    const fields = [];
    while (this.take(".")) fields.push(this.identifier());
    return this.mark(start, { kind: "contract_path", symbol, fields });
  }
}

for (const methodName of [
  "parseSource", "item", "constDecl", "invariant", "fieldDecl",
  "structDecl", "enumDecl", "fnDecl", "type", "integerLiteral",
  "literal", "block", "primary", "ifExpression", "matchExpression",
  "pattern",
]) {
  const method = Parser.prototype[methodName];
  Parser.prototype[methodName] = function tracedParserNode(...args) {
    const start = this.current().start;
    return this.mark(start, method.apply(this, args));
  };
}

function detachLocations(value, path, entries) {
  if (Array.isArray(value)) {
    return value.map((child, index) => detachLocations(child, [...path, index], entries));
  }
  if (!value || typeof value !== "object") return value;
  if (value._span) {
    entries.push({
      path,
      start: value._span.start,
      end: value._span.end,
      origin: value._span.origin,
    });
  }
  const output = {};
  const keys = Object.keys(value)
    .filter((key) => key !== "_span")
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  for (const key of keys) output[key] = detachLocations(value[key], [...path, key], entries);
  return output;
}

function acceptedParse(tree, source) {
  const entries = [];
  const detachedTree = detachLocations(tree, [], entries);
  const bytes = Buffer.from(source, "utf8");
  return {
    status: "accepted",
    tree: detachedTree,
    source_map: {
      schema: "aether.syntax-source-map/k0-0.4",
      source_sha256: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
      byte_length: bytes.length,
      entries,
    },
  };
}

export function parse(source) {
  try {
    const parser = new Parser(tokenize(source));
    return acceptedParse(parser.parseSource(), source);
  } catch (error) {
    if (error instanceof K0Error) return error.diagnostic;
    throw error;
  }
}

export function parseBytes(bytes) {
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parse(source);
  } catch (error) {
    if (error instanceof K0Error) return error.diagnostic;
    return {
      status: "rejected",
      phase: "lexical",
      code: "LEX-INVALID-UTF8",
      span: { start: 0, end: bytes.length },
    };
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const bytes = fs.readFileSync(0);
    process.stdout.write(`${JSON.stringify(parseBytes(bytes))}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
