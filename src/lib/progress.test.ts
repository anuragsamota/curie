import { describe, expect, it } from "vitest";
import type { LessonSummary } from "./storage";
import { markDay, progressReport, recordAnswer, summarize, type ProgressData } from "./progress";

const EMPTY: ProgressData = { version: 1, quizzes: {}, days: [] };
const lesson = { key: "l1", title: "Cells" };
const day = (date: string) => new Date(`${date}T12:00:00`).getTime();
const answer = (correct: boolean, chosen = correct ? "B" : "A") => ({ question: "Q?", chosen, answer: "B", correct });

describe("progress", () => {
  it("keeps the first-try result when a quiz is retried", () => {
    let data = recordAnswer(EMPTY, lesson, "q1", answer(false), day("2026-10-01"));
    data = recordAnswer(data, lesson, "q1", answer(true), day("2026-10-01"));
    expect(data.quizzes["l1::q1"]).toMatchObject({ attempts: 2, firstTry: false, solved: true, lastWrong: "A" });
  });

  it("counts a streak back from today, or from yesterday", () => {
    const data = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-09-28"].reduce((acc, date) => markDay(acc, day(date)), EMPTY);
    expect(summarize(data, [], day("2026-10-04")).streak).toBe(3);
    expect(summarize(data, [], day("2026-10-05")).streak).toBe(3);
    expect(summarize(data, [], day("2026-10-06")).streak).toBe(0);
    expect(markDay(data, day("2026-10-04")).days).toHaveLength(4);
  });

  it("summarises accuracy, review items and lessons, and describes them for the assistant", () => {
    let data = recordAnswer(EMPTY, lesson, "q1", answer(true), day("2026-10-01"));
    data = recordAnswer(data, lesson, "q2", answer(false), day("2026-10-02"));
    const lessons = [{ key: "l1", manifest: { id: "x", title: "Cells" }, progress: 0.5, createdAt: 0, updatedAt: 0, minutes: 3, blocks: 4, size: 0, searchText: "" }] as LessonSummary[];
    const summary = summarize(data, lessons, day("2026-10-02"));
    expect(summary).toMatchObject({ answered: 2, firstTryCorrect: 1, accuracy: 0.5, inProgress: 1, completed: 0 });
    expect(summary.review.map((quiz) => quiz.blockId)).toEqual(["q2"]);
    expect(summary.lessons[0]).toMatchObject({ answered: 2, firstTryCorrect: 1 });
    const report = progressReport(summary);
    expect(report).toContain("correct on the first try: 1 (50%)");
    expect(report).toContain("the student chose: A");
  });
});
