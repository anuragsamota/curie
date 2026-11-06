// Learning progress beyond reading position: every quiz attempt, and the days the student studied.
// Powers the Progress page and the assistant's assessment and guidance.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { readData, writeData } from "./appdata";
import type { LessonSummary } from "./storage";

export type QuizRecord = {
  lessonKey: string;
  lessonTitle: string;
  blockId: string;
  question: string;
  answer: string;
  attempts: number;
  /** Whether the first answer given was right. */
  firstTry: boolean;
  solved: boolean;
  lastWrong?: string;
  lastAt: number;
};

export type ProgressData = { version: 1; quizzes: Record<string, QuizRecord>; days: string[] };
const EMPTY: ProgressData = { version: 1, quizzes: {}, days: [] };

export type QuizAnswer = { question: string; chosen: string; answer: string; correct: boolean };

const dayOf = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function recordAnswer(data: ProgressData, lesson: { key: string; title: string }, blockId: string, answer: QuizAnswer, now = Date.now()): ProgressData {
  const id = `${lesson.key}::${blockId}`;
  const previous = data.quizzes[id];
  // A quiz the student already solved is practice; it doesn't change the first-try result.
  const record: QuizRecord = previous
    ? { ...previous, lessonTitle: lesson.title, question: answer.question, answer: answer.answer, attempts: previous.attempts + 1, solved: previous.solved || answer.correct, lastWrong: answer.correct ? previous.lastWrong : answer.chosen, lastAt: now }
    : { lessonKey: lesson.key, lessonTitle: lesson.title, blockId, question: answer.question, answer: answer.answer, attempts: 1, firstTry: answer.correct, solved: answer.correct, lastWrong: answer.correct ? undefined : answer.chosen, lastAt: now };
  return markDay({ ...data, quizzes: { ...data.quizzes, [id]: record } }, now);
}

export function markDay(data: ProgressData, now = Date.now()): ProgressData {
  const day = dayOf(now);
  return data.days.includes(day) ? data : { ...data, days: [...data.days, day].slice(-400) };
}

export type ProgressSummary = {
  answered: number;
  firstTryCorrect: number;
  /** First-try accuracy from 0 to 1, or undefined before any quiz. */
  accuracy?: number;
  streak: number;
  studyDays: number;
  completed: number;
  inProgress: number;
  /** Questions to revisit: missed on the first try, most recent first. */
  review: QuizRecord[];
  lessons: { key: string; title: string; progress: number; completed: boolean; answered: number; firstTryCorrect: number }[];
};

export function summarize(data: ProgressData, lessons: LessonSummary[], now = Date.now()): ProgressSummary {
  const quizzes = Object.values(data.quizzes);
  const firstTryCorrect = quizzes.filter((quiz) => quiz.firstTry).length;
  const days = new Set(data.days);
  // The streak counts back from today, or from yesterday if the student hasn't studied yet today.
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayOf(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayOf(cursor.getTime()))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return {
    answered: quizzes.length,
    firstTryCorrect,
    accuracy: quizzes.length ? firstTryCorrect / quizzes.length : undefined,
    streak,
    studyDays: days.size,
    completed: lessons.filter((lesson) => lesson.completedAt).length,
    inProgress: lessons.filter((lesson) => !lesson.completedAt && (lesson.progress ?? 0) > 0).length,
    review: quizzes.filter((quiz) => !quiz.firstTry).sort((a, b) => b.lastAt - a.lastAt),
    lessons: lessons.map((lesson) => {
      const own = quizzes.filter((quiz) => quiz.lessonKey === lesson.key);
      return { key: lesson.key, title: lesson.manifest.title, progress: lesson.progress ?? 0, completed: !!lesson.completedAt, answered: own.length, firstTryCorrect: own.filter((quiz) => quiz.firstTry).length };
    }),
  };
}

/** The progress summary as text for the assistant. */
export function progressReport(summary: ProgressSummary): string {
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const lines = [
    `Lessons: ${summary.completed} completed, ${summary.inProgress} in progress, ${summary.lessons.length} in the library.`,
    summary.accuracy === undefined ? "No quiz questions answered yet." : `Quiz questions answered: ${summary.answered}; correct on the first try: ${summary.firstTryCorrect} (${percent(summary.accuracy)}).`,
    `Study streak: ${summary.streak} day${summary.streak === 1 ? "" : "s"}; ${summary.studyDays} study days in total.`,
    "",
    "Per lesson (reading progress; first-try quiz score):",
    ...summary.lessons.map((lesson) => `- "${lesson.title}" [key ${lesson.key}]: ${lesson.completed ? "completed" : `${percent(lesson.progress)} read`}${lesson.answered ? `; ${lesson.firstTryCorrect}/${lesson.answered} first try` : ""}`),
  ];
  if (summary.review.length) {
    lines.push("", "Questions missed on the first try (most recent first):");
    for (const quiz of summary.review.slice(0, 15)) {
      lines.push(`- In "${quiz.lessonTitle}": ${quiz.question} — correct answer: ${quiz.answer}${quiz.lastWrong ? `; the student chose: ${quiz.lastWrong}` : ""}${quiz.solved ? " (later solved)" : " (not yet solved)"}`);
    }
  }
  return lines.join("\n");
}

type ProgressValue = {
  data: ProgressData;
  ready: boolean;
  recordQuiz: (lesson: { key: string; title: string }, blockId: string, answer: QuizAnswer) => void;
  markStudied: () => void;
  reset: () => void;
};

const ProgressContext = createContext<ProgressValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ProgressData>(EMPTY);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    void readData<ProgressData>("progress", EMPTY).then((saved) => {
      setData(saved?.version === 1 ? saved : EMPTY);
      loaded.current = true;
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(() => void writeData("progress", data).catch(() => undefined), 400);
    return () => clearTimeout(timer);
  }, [data]);

  const recordQuiz = useCallback((lesson: { key: string; title: string }, blockId: string, answer: QuizAnswer) => setData((current) => recordAnswer(current, lesson, blockId, answer)), []);
  const markStudied = useCallback(() => setData((current) => markDay(current)), []);
  const reset = useCallback(() => setData(EMPTY), []);
  const value = useMemo(() => ({ data, ready, recordQuiz, markStudied, reset }), [data, ready, recordQuiz, markStudied, reset]);
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("useProgress must be used inside ProgressProvider");
  return value;
}
