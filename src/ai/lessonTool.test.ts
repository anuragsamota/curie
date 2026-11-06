import { describe, expect, it } from "vitest";
import { CreateLessonInput, buildLesson, lessonToText } from "./lessonTool";

const input = (blocks: unknown[], extra: object = {}) => CreateLessonInput.parse({ title: "Osmosis", description: "Water on the move", blocks, ...extra });

describe("buildLesson", () => {
  it("builds a valid lesson with sections, quizzes, flashcards and live logic", () => {
    const result = buildLesson(input([
      { type: "markdown", content: "## Intro\nWater moves." },
      { type: "section", title: "Concentration", children: [
        { type: "slider", label: "Salt (%)", variable: "salt", min: 0, max: 10, initial: 2 },
        { type: "markdown", content: "Water potential is {{ round(-salt * 1.2, 1) }} units." },
        { type: "quiz", question: "Where does water move?", options: ["To lower salt", "To higher salt"], correctIndex: 1, explanation: "Towards the solute." },
      ] },
      { type: "flashcard", front: "Osmosis", back: "Diffusion of water" },
      { type: "plot", functions: [{ expression: "x * salt" }], xMin: 0, xMax: 5 },
      { type: "choice", label: "Cell", variable: "cell", choices: [{ label: "Plant", value: "plant" }, { label: "Animal", value: "animal" }] },
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { manifest, document } = result.content;
    expect(manifest).toMatchObject({ title: "Osmosis", formatVersion: "0.2.0", author: "Curie assistant" });
    expect(manifest.requiredFeatures).toEqual(expect.arrayContaining(["markdown", "section", "quiz", "slider", "variables", "plot", "choice"]));
    expect(document.blocks[1]).toMatchObject({ id: "b2-section", type: "section" });
    expect(document.blocks[4]).toMatchObject({ type: "choice", initial: "plant" });
  });

  it("reports problems the model can fix", () => {
    const result = buildLesson(input([
      { type: "quiz", question: "Q?", options: ["A", "B"], correctIndex: 5 },
      { type: "markdown", content: "{{ missing + 1 }}" },
    ]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join("\n")).toMatch(/b1-quiz.*correctIndex/);
    expect(result.problems.join("\n")).toMatch(/unknown variable missing/);
  });

  it("rejects schema-invalid blocks with a pointer to the block", () => {
    const result = buildLesson(input([{ type: "reveal" }, { type: "flashcard", front: "a", back: "b" }, { type: "quiz", question: "Q", options: ["only one"], correctIndex: 0 }]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/block b3-quiz/);
  });
});

describe("lessonToText", () => {
  it("renders a lesson with its quiz answers", () => {
    const result = buildLesson(input([{ type: "quiz", question: "2+2?", options: ["3", "4"], correctIndex: 1, explanation: "Arithmetic." }]));
    if (!result.ok) throw new Error("expected a lesson");
    const text = lessonToText(result.content);
    expect(text).toContain("# Osmosis");
    expect(text).toContain("(correct) 4");
    expect(text).toContain("Explanation: Arithmetic.");
  });
});
