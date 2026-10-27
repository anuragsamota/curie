import { describe, expect, it } from "vitest";
import { checkSyntax, evaluate, fillTemplate, formatValue, referencedNames } from "./expr";
import { computeScope, findLogicIssues, initialValues } from "./logic";
import { CurieDocumentSchema } from "./types";

describe("expressions", () => {
  it.each([
    ["1 + 2 * 3", 7], ["(1 + 2) * 3", 9], ["2 ^ 3 ^ 2", 512], ["-2 ^ 2", -4], ["10 % 4", 2],
    ["round(pi, 2)", 3.14], ["max(1, 5, 3)", 5], ["sqrt(16) + abs(-1)", 5], ["deg(pi)", 180],
    ["3 > 2 and not false", true], ["1 == 1 ? \"yes\" : \"no\"", "yes"], ["\"v = \" + 2.5", "v = 2.5"],
    ["if(0, 1, 2)", 2], ["fixed(2, 3)", "2.000"],
  ])("%s", (source, expected) => {
    expect(evaluate(source, {})).toEqual(expected);
  });

  it("reads variables and reports unknown ones", () => {
    expect(evaluate("m * g", { m: 2, g: 9.8 })).toBeCloseTo(19.6);
    expect(() => evaluate("speed", {})).toThrow(/Unknown variable/);
    expect(referencedNames("a * sin(b * x) + pi")).toEqual(["a", "b", "x"]);
  });

  it("can't reach JavaScript", () => {
    expect(() => evaluate("constructor", {})).toThrow(/Unknown variable/);
    expect(() => evaluate("toString", {})).toThrow(/Unknown variable/);
    expect(checkSyntax("alert(1)")).toMatch(/Unknown function/);
    expect(checkSyntax("a.b")).toBeDefined();
    expect(checkSyntax("x[0]")).toBeDefined();
  });

  it("reports syntax errors", () => {
    expect(checkSyntax("1 +")).toBeDefined();
    expect(checkSyntax("round()")).toMatch(/takes 1 to 2/);
    expect(checkSyntax("(1")).toMatch(/Expected/);
  });

  it("fills templates and formats numbers", () => {
    expect(fillTemplate("F = {{ m * a }} N, {{ nope }}", { m: 3, a: 0.1 })).toBe("F = 0.3 N, ?");
    expect(formatValue(1 / 3)).toBe("0.3333");
    expect(formatValue(Infinity)).toBe("∞");
  });
});

describe("lesson logic", () => {
  const doc = CurieDocumentSchema.parse({
    documentVersion: 1,
    variables: [{ name: "weight", expression: "mass * g" }, { name: "g", expression: "planet" }, { name: "count", initial: 0 }],
    blocks: [
      { id: "s", type: "slider", label: "Mass", min: 0, max: 10, initial: 2, variable: "mass" },
      { id: "c", type: "choice", label: "Planet", variable: "planet", options: [{ label: "Earth", value: 9.8 }, { label: "Moon", value: 1.6 }], initial: 9.8 },
      { id: "t", type: "markdown", content: "W = {{ weight }}", showIf: "mass > 0" },
      { id: "b", type: "button", label: "+1", actions: [{ variable: "count", expression: "count + 1" }] },
    ],
  });

  it("computes formulas in any order", () => {
    const scope = computeScope(doc, initialValues(doc));
    expect(scope.weight).toBeCloseTo(19.6);
    expect(scope.count).toBe(0);
  });

  it("finds no issues in a valid lesson", () => {
    expect(findLogicIssues(doc)).toEqual([]);
  });

  it("reports unknown variables, formula targets and loops", () => {
    const broken = CurieDocumentSchema.parse({
      documentVersion: 1,
      variables: [{ name: "a", expression: "b + 1" }, { name: "b", expression: "a + 1" }],
      blocks: [
        { id: "t", type: "markdown", content: "{{ missing }}" },
        { id: "b", type: "button", label: "Go", actions: [{ variable: "a", expression: "1" }] },
      ],
    });
    const messages = findLogicIssues(broken).map((issue) => issue.message).join("\n");
    expect(messages).toMatch(/unknown variable missing/);
    expect(messages).toMatch(/can't set “a” because it is a formula/);
    expect(messages).toMatch(/loop/);
  });
});
