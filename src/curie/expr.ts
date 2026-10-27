// A small, safe expression language for lesson logic: arithmetic, comparisons, logic, a fixed set of
// math functions, and lesson variables. Expressions are parsed by hand and evaluated over a plain
// value map, so they can't reach JavaScript globals, the DOM, or the network.

export type Value = number | string | boolean;
export type Scope = Record<string, Value>;

export class ExpressionError extends Error {}

type Node =
  | { kind: "literal"; value: Value }
  | { kind: "name"; name: string }
  | { kind: "unary"; op: "-" | "+" | "!"; arg: Node }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "ternary"; test: Node; then: Node; otherwise: Node }
  | { kind: "call"; name: string; args: Node[] };

const num = (value: Value) => typeof value === "number" ? value : typeof value === "boolean" ? Number(value) : Number(value);
const truthy = (value: Value) => typeof value === "string" ? value !== "" : typeof value === "number" ? value !== 0 && !Number.isNaN(value) : value;

/** Shows numbers the way a learner expects: no float noise, at most 4 decimals. */
export function formatValue(value: Value | undefined): string {
  if (value === undefined) return "?";
  if (typeof value !== "number") return String(value);
  if (!Number.isFinite(value)) return Number.isNaN(value) ? "?" : value > 0 ? "∞" : "-∞";
  return String(Number(value.toFixed(Math.abs(value) >= 1000 ? 2 : 4)));
}

const FUNCTIONS: Record<string, { args: [number, number]; fn: (...args: Value[]) => Value }> = {
  sin: { args: [1, 1], fn: (x) => Math.sin(num(x)) },
  cos: { args: [1, 1], fn: (x) => Math.cos(num(x)) },
  tan: { args: [1, 1], fn: (x) => Math.tan(num(x)) },
  asin: { args: [1, 1], fn: (x) => Math.asin(num(x)) },
  acos: { args: [1, 1], fn: (x) => Math.acos(num(x)) },
  atan: { args: [1, 1], fn: (x) => Math.atan(num(x)) },
  atan2: { args: [2, 2], fn: (y, x) => Math.atan2(num(y), num(x)) },
  sqrt: { args: [1, 1], fn: (x) => Math.sqrt(num(x)) },
  cbrt: { args: [1, 1], fn: (x) => Math.cbrt(num(x)) },
  abs: { args: [1, 1], fn: (x) => Math.abs(num(x)) },
  sign: { args: [1, 1], fn: (x) => Math.sign(num(x)) },
  floor: { args: [1, 1], fn: (x) => Math.floor(num(x)) },
  ceil: { args: [1, 1], fn: (x) => Math.ceil(num(x)) },
  round: { args: [1, 2], fn: (x, digits = 0) => { const f = 10 ** num(digits); return Math.round(num(x) * f) / f; } },
  min: { args: [1, 32], fn: (...xs) => Math.min(...xs.map(num)) },
  max: { args: [1, 32], fn: (...xs) => Math.max(...xs.map(num)) },
  pow: { args: [2, 2], fn: (x, y) => num(x) ** num(y) },
  exp: { args: [1, 1], fn: (x) => Math.exp(num(x)) },
  ln: { args: [1, 1], fn: (x) => Math.log(num(x)) },
  log: { args: [1, 2], fn: (x, base = 10) => Math.log(num(x)) / Math.log(num(base)) },
  hypot: { args: [1, 32], fn: (...xs) => Math.hypot(...xs.map(num)) },
  clamp: { args: [3, 3], fn: (x, lo, hi) => Math.min(Math.max(num(x), num(lo)), num(hi)) },
  lerp: { args: [3, 3], fn: (a, b, t) => num(a) + (num(b) - num(a)) * num(t) },
  deg: { args: [1, 1], fn: (x) => num(x) * 180 / Math.PI },
  rad: { args: [1, 1], fn: (x) => num(x) * Math.PI / 180 },
  if: { args: [3, 3], fn: (test, a, b) => truthy(test) ? a : b },
  fixed: { args: [2, 2], fn: (x, digits) => num(x).toFixed(Math.max(0, Math.min(10, num(digits)))) },
  text: { args: [1, 1], fn: (x) => formatValue(x) },
};

const CONSTANTS: Record<string, Value> = { pi: Math.PI, e: Math.E, true: true, false: false };

const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);
export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const isReservedName = (name: string) => own(FUNCTIONS, name) || own(CONSTANTS, name) || ["and", "or", "not"].includes(name);

// ── Parsing ─────────────────────────────────────────────────────────────────

type Token = { type: "num" | "str" | "name" | "op"; text: string; value?: Value; at: number };

const OPERATORS = ["==", "!=", "<=", ">=", "&&", "||", "+", "-", "*", "/", "%", "^", "<", ">", "!", "(", ")", ",", "?", ":"];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    const number = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(source.slice(i));
    if (number) { tokens.push({ type: "num", text: number[0], value: Number(number[0]), at: i }); i += number[0].length; continue; }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
    if (name) {
      const text = name[0];
      // Word operators read naturally in lesson text: `a > 1 and not b`.
      const op = text === "and" ? "&&" : text === "or" ? "||" : text === "not" ? "!" : undefined;
      tokens.push(op ? { type: "op", text: op, at: i } : { type: "name", text, at: i });
      i += text.length;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      const end = source.indexOf(ch, i + 1);
      if (end < 0) throw new ExpressionError("A text value is missing its closing quote.");
      tokens.push({ type: "str", text: source.slice(i, end + 1), value: source.slice(i + 1, end), at: i });
      i = end + 1;
      continue;
    }
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (!op) throw new ExpressionError(`Unexpected “${ch}”.`);
    tokens.push({ type: "op", text: op, at: i });
    i += op.length;
  }
  return tokens;
}

const BINARY: [string[], boolean][] = [
  // [operators, right-associative] from lowest to highest precedence.
  [["||"], false], [["&&"], false], [["==", "!="], false], [["<", "<=", ">", ">="], false],
  [["+", "-"], false], [["*", "/", "%"], false],
];

function parse(source: string): Node {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (text: string) => peek()?.type === "op" && peek().text === text;
  const expect = (text: string) => {
    if (!isOp(text)) throw new ExpressionError(peek() ? `Expected “${text}” but found “${peek().text}”.` : `Expected “${text}” at the end.`);
    pos++;
  };

  const ternary = (): Node => {
    const test = binary(0);
    if (!isOp("?")) return test;
    pos++;
    const then = ternary();
    expect(":");
    return { kind: "ternary", test, then, otherwise: ternary() };
  };
  const binary = (level: number): Node => {
    if (level === BINARY.length) return unary();
    let left = binary(level + 1);
    while (peek()?.type === "op" && BINARY[level][0].includes(peek().text)) {
      const op = tokens[pos++].text;
      left = { kind: "binary", op, left, right: binary(level + 1) };
    }
    return left;
  };
  const unary = (): Node => {
    if (isOp("-") || isOp("+") || isOp("!")) {
      const op = tokens[pos++].text as "-" | "+" | "!";
      return { kind: "unary", op, arg: unary() };
    }
    return power();
  };
  const power = (): Node => {
    const base = primary();
    if (!isOp("^")) return base;
    pos++;
    return { kind: "binary", op: "^", left: base, right: unary() };
  };
  const primary = (): Node => {
    const token = tokens[pos++];
    if (!token) throw new ExpressionError("The expression ends too early.");
    if (token.type === "num" || token.type === "str") return { kind: "literal", value: token.value! };
    if (token.type === "name") {
      if (isOp("(")) {
        pos++;
        const fn = own(FUNCTIONS, token.text) ? FUNCTIONS[token.text] : undefined;
        if (!fn) throw new ExpressionError(`Unknown function “${token.text}”.`);
        const args: Node[] = [];
        if (!isOp(")")) {
          do { args.push(ternary()); } while (isOp(",") && ++pos);
        }
        expect(")");
        if (args.length < fn.args[0] || args.length > fn.args[1]) {
          throw new ExpressionError(`${token.text}() takes ${fn.args[0] === fn.args[1] ? fn.args[0] : `${fn.args[0]} to ${fn.args[1]}`} value${fn.args[1] === 1 ? "" : "s"}.`);
        }
        return { kind: "call", name: token.text, args };
      }
      if (own(CONSTANTS, token.text)) return { kind: "literal", value: CONSTANTS[token.text] };
      return { kind: "name", name: token.text };
    }
    if (token.text === "(") {
      const inner = ternary();
      expect(")");
      return inner;
    }
    throw new ExpressionError(`Unexpected “${token.text}”.`);
  };

  if (!tokens.length) throw new ExpressionError("The expression is empty.");
  const tree = ternary();
  if (pos < tokens.length) throw new ExpressionError(`Unexpected “${tokens[pos].text}”.`);
  return tree;
}

const parsed = new Map<string, Node | ExpressionError>();

function compile(source: string): Node {
  let tree = parsed.get(source);
  if (!tree) {
    try { tree = parse(source); } catch (error) { tree = error instanceof ExpressionError ? error : new ExpressionError(String(error)); }
    if (parsed.size > 2000) parsed.clear();
    parsed.set(source, tree);
  }
  if (tree instanceof ExpressionError) throw tree;
  return tree;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

function run(node: Node, scope: Scope): Value {
  switch (node.kind) {
    case "literal": return node.value;
    case "name": {
      if (!own(scope, node.name)) throw new ExpressionError(`Unknown variable “${node.name}”.`);
      return scope[node.name];
    }
    case "unary": {
      const arg = run(node.arg, scope);
      return node.op === "!" ? !truthy(arg) : node.op === "-" ? -num(arg) : num(arg);
    }
    case "ternary": return truthy(run(node.test, scope)) ? run(node.then, scope) : run(node.otherwise, scope);
    case "call": return FUNCTIONS[node.name].fn(...node.args.map((arg) => run(arg, scope)));
    case "binary": {
      if (node.op === "&&") { const left = run(node.left, scope); return truthy(left) ? run(node.right, scope) : left; }
      if (node.op === "||") { const left = run(node.left, scope); return truthy(left) ? left : run(node.right, scope); }
      const a = run(node.left, scope);
      const b = run(node.right, scope);
      switch (node.op) {
        case "+": return typeof a === "string" || typeof b === "string" ? formatValue(a) + formatValue(b) : num(a) + num(b);
        case "-": return num(a) - num(b);
        case "*": return num(a) * num(b);
        case "/": return num(a) / num(b);
        case "%": return num(a) % num(b);
        case "^": return num(a) ** num(b);
        case "==": return a === b || (typeof a !== "string" && typeof b !== "string" && num(a) === num(b));
        case "!=": return !(a === b || (typeof a !== "string" && typeof b !== "string" && num(a) === num(b)));
        case "<": return num(a) < num(b);
        case "<=": return num(a) <= num(b);
        case ">": return num(a) > num(b);
        case ">=": return num(a) >= num(b);
      }
    }
  }
  throw new ExpressionError("Unsupported expression.");
}

export function evaluate(source: string, scope: Scope): Value {
  return run(compile(source), scope);
}

/** Like `evaluate`, but returns `fallback` instead of throwing. */
export function tryEvaluate<T extends Value | undefined>(source: string, scope: Scope, fallback: T): Value | T {
  try { return evaluate(source, scope); } catch { return fallback; }
}

/** Returns the parse error message, or undefined when the expression is valid. */
export function checkSyntax(source: string): string | undefined {
  try { compile(source); return undefined; } catch (error) { return (error as Error).message; }
}

/** Every variable an expression reads. */
export function referencedNames(source: string): string[] {
  const names = new Set<string>();
  const visit = (node: Node) => {
    if (node.kind === "name") names.add(node.name);
    else if (node.kind === "unary") visit(node.arg);
    else if (node.kind === "binary") { visit(node.left); visit(node.right); }
    else if (node.kind === "ternary") { visit(node.test); visit(node.then); visit(node.otherwise); }
    else if (node.kind === "call") node.args.forEach(visit);
  };
  visit(compile(source));
  return [...names];
}

// ── Text templates ──────────────────────────────────────────────────────────

const TEMPLATE = /\{\{([\s\S]+?)\}\}/g;

/** The expressions inside `{{ … }}` placeholders. */
export function templateExpressions(text: string): string[] {
  return [...text.matchAll(TEMPLATE)].map((match) => match[1].trim());
}

/** Replaces `{{ expression }}` placeholders with their formatted values. */
export function fillTemplate(text: string, scope: Scope): string {
  if (!text.includes("{{")) return text;
  return text.replace(TEMPLATE, (_, source: string) => formatValue(tryEvaluate(source.trim(), scope, undefined)));
}
