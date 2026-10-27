// Lesson variables: which exist, their starting values, how formulas are computed, and what's wrong.

import { checkSyntax, isReservedName, referencedNames, templateExpressions, tryEvaluate, type Scope, type Value } from "./expr";
import { isBlockedProperty } from "./svg";
import type { CurieDocument, CurieNode } from "./types";

export type VariableKind = "input" | "value" | "formula";
export type VariableInfo = { name: string; kind: VariableKind; initial?: Value; expression?: string; blockId?: string };

/** Every block in document order, including those nested in sections. */
function flatten(nodes: CurieNode[]): CurieNode[] {
  return nodes.flatMap((node) => node.type === "section" ? [node, ...flatten(node.children)] : [node]);
}

/** Variables the lesson declares. The first declaration of a name wins. */
export function lessonVariables(document: CurieDocument): Map<string, VariableInfo> {
  const variables = new Map<string, VariableInfo>();
  for (const node of flatten(document.blocks)) {
    const declare = (variable: string, initial: Value) => {
      if (!variables.has(variable)) variables.set(variable, { name: variable, kind: "input", initial, blockId: node.id });
    };
    if (node.type === "slider" && node.variable) declare(node.variable, node.initial);
    if (node.type === "toggle") declare(node.variable, node.initial);
    if (node.type === "choice") declare(node.variable, node.initial);
  }
  for (const variable of document.variables ?? []) {
    if (variables.has(variable.name)) continue;
    variables.set(variable.name, variable.expression
      ? { name: variable.name, kind: "formula", expression: variable.expression }
      : { name: variable.name, kind: "value", initial: variable.initial ?? 0 });
  }
  return variables;
}

/** Starting values of the variables learners and buttons can change. */
export function initialValues(document: CurieDocument): Scope {
  const scope: Scope = {};
  for (const variable of lessonVariables(document).values()) {
    if (variable.kind !== "formula") scope[variable.name] = variable.initial!;
  }
  return scope;
}

/** Adds every formula's value to the changeable values. Formulas may use each other in any order. */
export function computeScope(document: CurieDocument, values: Scope): Scope {
  const scope: Scope = { ...values };
  const pending = [...lessonVariables(document).values()].filter((variable) => variable.kind === "formula");
  // Each pass computes the formulas whose inputs are known; cycles simply stay unknown.
  for (let pass = 0; pending.length && pass <= pending.length; pass++) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const value = tryEvaluate(pending[i].expression!, scope, undefined);
      if (value !== undefined) { scope[pending[i].name] = value; pending.splice(i, 1); }
    }
  }
  return scope;
}

type Expression = { source: string; label: string; locals?: string[] };

/** Every expression a block uses, for validation. */
export function blockExpressions(node: CurieNode): Expression[] {
  const templates = (label: string, ...texts: (string | undefined)[]) =>
    texts.flatMap((text) => templateExpressions(text ?? "").map((source) => ({ source, label })));
  const list: Expression[] = node.showIf ? [{ source: node.showIf, label: "Show only when" }] : [];
  switch (node.type) {
    case "markdown": return [...list, ...templates("{{ }} placeholder", node.content)];
    case "callout": return [...list, ...templates("{{ }} placeholder", node.title, node.content)];
    case "reveal": return [...list, ...templates("{{ }} placeholder", node.title, node.content)];
    case "flashcard": return [...list, ...templates("{{ }} placeholder", node.front, node.back)];
    case "button": return [...list, ...templates("{{ }} placeholder", node.label), ...node.actions.map((action) => ({ source: action.expression, label: `Action for ${action.variable}` }))];
    case "display": return [...list, ...templates("{{ }} placeholder", node.title), ...node.items.map((item) => ({ source: item.expression, label: item.label || "Value" }))];
    case "plot": return [...list, ...templates("{{ }} placeholder", node.title, ...node.functions.map((fn) => fn.label)), ...node.functions.map((fn, index) => ({ source: fn.expression, label: fn.label || `Function ${index + 1}`, locals: ["x"] }))];
    case "diagram": return [...list, ...templates("{{ }} placeholder", node.title, node.caption), ...node.bindings.map((binding) => ({ source: binding.expression, label: `#${binding.target} ${binding.property}` }))];
    default: return list;
  }
}

export type LogicIssue = { blockId?: string; message: string };

/** Problems with variables and expressions: syntax errors, unknown names, clashes and cycles. */
export function findLogicIssues(document: CurieDocument): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const variables = lessonVariables(document);
  const known = new Set(variables.keys());

  const check = (expression: Expression, blockId?: string) => {
    const syntax = checkSyntax(expression.source);
    if (syntax) return issues.push({ blockId, message: `${expression.label}: ${syntax}` });
    const unknown = referencedNames(expression.source).filter((name) => !known.has(name) && !expression.locals?.includes(name));
    if (unknown.length) issues.push({ blockId, message: `${expression.label}: unknown variable${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}.` });
  };

  const seen = new Set<string>();
  for (const variable of document.variables ?? []) {
    if (isReservedName(variable.name)) issues.push({ message: `“${variable.name}” is a built-in name; choose another variable name.` });
    else if (seen.has(variable.name)) issues.push({ message: `The variable “${variable.name}” is defined more than once.` });
    else if (variables.get(variable.name)?.kind === "input") issues.push({ message: `“${variable.name}” is already set by an input block; rename one of them.` });
    seen.add(variable.name);
    if (variable.expression) check({ source: variable.expression, label: `Formula for ${variable.name}` });
  }

  for (const node of flatten(document.blocks)) {
    for (const expression of blockExpressions(node)) check(expression, node.id);
    if ((node.type === "slider" && node.variable) || node.type === "toggle" || node.type === "choice") {
      const name = node.variable!;
      if (isReservedName(name)) issues.push({ blockId: node.id, message: `“${name}” is a built-in name; choose another variable name.` });
    }
    if (node.type === "choice" && !node.options.some((option) => option.value === node.initial)) {
      issues.push({ blockId: node.id, message: `Choice “${node.label}” starts on a value that isn't one of its options.` });
    }
    if (node.type === "button") {
      for (const action of node.actions) {
        const target = variables.get(action.variable);
        if (!target) issues.push({ blockId: node.id, message: `Button “${node.label}” sets an unknown variable “${action.variable}”.` });
        else if (target.kind === "formula") issues.push({ blockId: node.id, message: `Button “${node.label}” can't set “${action.variable}” because it is a formula.` });
      }
    }
    if (node.type === "diagram") {
      for (const binding of node.bindings) {
        if (isBlockedProperty(binding.property)) issues.push({ blockId: node.id, message: `Diagram bindings can't set “${binding.property}”.` });
      }
    }
    if (node.type === "plot" && node.xMin >= node.xMax) issues.push({ blockId: node.id, message: "The plot needs x from smaller to larger." });
  }

  // Formulas that never resolve with the starting values usually depend on each other in a loop.
  const scope = computeScope(document, initialValues(document));
  for (const variable of variables.values()) {
    if (variable.kind === "formula" && !(variable.name in scope) && !checkSyntax(variable.expression!)
      && referencedNames(variable.expression!).every((name) => known.has(name))) {
      issues.push({ message: `The formula for “${variable.name}” can't be worked out; check that formulas don't depend on each other in a loop.` });
    }
  }
  return issues;
}

/** True when the document uses variables or expressions at all. */
export function usesVariables(document: CurieDocument): boolean {
  return (document.variables?.length ?? 0) > 0 || flatten(document.blocks).some((node) =>
    blockExpressions(node).length > 0 || (node.type === "slider" && !!node.variable) || ["toggle", "choice", "button", "display", "plot", "diagram"].includes(node.type));
}
