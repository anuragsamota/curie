// The study agent's tools: read the student's notes, lessons and progress, and create new lessons.

import { z } from "zod";
import type { LessonContent, LessonSummary } from "../lib/storage";
import type { NoteRecord, NoteSummary, SearchHit } from "../rag/notes";
import type { AgentTool, ToolOutcome } from "./agent";
import { CREATE_LESSON_SCHEMA, CreateLessonInput, blockCount, buildLesson, lessonToText } from "./lessonTool";

export type StudyToolContext = {
  notes: () => NoteSummary[];
  search: (query: string, limit: number) => SearchHit[];
  readNote: (id: string) => NoteRecord | undefined;
  lessons: () => LessonSummary[];
  loadLesson: (key: string) => Promise<LessonContent>;
  createLesson: (content: LessonContent) => Promise<LessonSummary>;
  progress: () => string;
};

const NOTE_PAGE = 16000;
const quoted = (text: string, max = 48) => `“${text.length > max ? `${text.slice(0, max - 1)}…` : text}”`;

function tool<T>(definition: Omit<AgentTool, "schema" | "run" | "activity"> & { schema: z.ZodType<T>; activity: (input: T) => string; run: (input: T) => Promise<ToolOutcome> | ToolOutcome }): AgentTool {
  return {
    ...definition,
    activity: definition.activity as AgentTool["activity"],
    run: (async (input: T) => definition.run(input)) as AgentTool["run"],
  };
}

export function studyTools(ctx: StudyToolContext): AgentTool[] {
  return [
    tool({
      name: "search_notes",
      description: "Search the student's notes for passages about a topic. Returns the best-matching passages with their note name and page. Use focused queries with the key terms.",
      inputSchema: { type: "object", properties: { query: { type: "string", description: "What to look for, e.g. 'osmosis in plant cells'" }, limit: { type: "integer", minimum: 1, maximum: 10, description: "How many passages to return (default 6)" } }, required: ["query"] },
      schema: z.object({ query: z.string().min(1), limit: z.coerce.number().int().min(1).max(10).optional() }),
      activity: ({ query }) => `Searching your notes for ${quoted(query)}`,
      run: ({ query, limit }) => {
        const hits = ctx.search(query, limit ?? 6);
        if (!hits.length) return { content: ctx.notes().length ? "No passages in the student's notes match this query." : "The student hasn't added any notes yet.", summary: "No matching passages" };
        const notes = new Set(hits.map((hit) => hit.noteName));
        return {
          content: hits.map((hit, index) => `[${index + 1}] ${hit.noteName}${hit.page ? `, page ${hit.page}` : ""} (note id ${hit.noteId})\n${hit.text}`).join("\n\n"),
          summary: `Found ${hits.length} passage${hits.length === 1 ? "" : "s"} in ${notes.size} note${notes.size === 1 ? "" : "s"}`,
        };
      },
    }),
    tool({
      name: "list_notes",
      description: "List the notes the student has added, with their ids, names and sizes.",
      inputSchema: { type: "object", properties: {} },
      schema: z.object({}).passthrough(),
      activity: () => "Looking through your notes",
      run: () => {
        const notes = ctx.notes();
        if (!notes.length) return { content: "The student hasn't added any notes yet. They can add PDFs, text or photos of notes on the Notes tab.", summary: "No notes yet" };
        return { content: notes.map((note) => `- ${note.id}: "${note.name}" (${note.kind}${note.pages ? `, ${note.pages} pages` : ""}, ${note.chars} characters)`).join("\n"), summary: `${notes.length} note${notes.length === 1 ? "" : "s"}` };
      },
    }),
    tool({
      name: "read_note",
      description: `Read the full text of one note, ${NOTE_PAGE} characters at a time. Use the note id from list_notes or search_notes; pass offset to continue reading.`,
      inputSchema: { type: "object", properties: { note_id: { type: "string" }, offset: { type: "integer", minimum: 0, description: "Character offset to start from (default 0)" } }, required: ["note_id"] },
      schema: z.object({ note_id: z.string().min(1), offset: z.coerce.number().int().min(0).optional() }),
      activity: ({ note_id }) => `Reading ${quoted(ctx.readNote(note_id)?.name ?? "a note")}`,
      run: ({ note_id, offset = 0 }) => {
        const note = ctx.readNote(note_id);
        if (!note) return { content: `There is no note with id "${note_id}". Call list_notes to see the ids.`, summary: "Note not found", isError: true };
        const end = Math.min(note.text.length, offset + NOTE_PAGE);
        const more = end < note.text.length ? `\n\n[Characters ${offset}–${end} of ${note.text.length}. Call read_note with offset ${end} to continue.]` : "";
        return { content: `Note "${note.name}":\n\n${note.text.slice(offset, end)}${more}`, summary: `Read ${quoted(note.name)}` };
      },
    }),
    tool({
      name: "get_progress",
      description: "Get the student's learning progress: lessons completed and in progress, first-try quiz accuracy overall and per lesson, study streak, and the questions they missed.",
      inputSchema: { type: "object", properties: {} },
      schema: z.object({}).passthrough(),
      activity: () => "Checking your progress",
      run: () => ({ content: ctx.progress(), summary: "Reviewed your progress" }),
    }),
    tool({
      name: "list_lessons",
      description: "List the lessons in the student's library with their keys, titles and reading progress.",
      inputSchema: { type: "object", properties: {} },
      schema: z.object({}).passthrough(),
      activity: () => "Looking at your library",
      run: () => {
        const lessons = ctx.lessons();
        if (!lessons.length) return { content: "The library is empty.", summary: "Library is empty" };
        return { content: lessons.map((lesson) => `- ${lesson.key}: "${lesson.manifest.title}"${lesson.completedAt ? " (completed)" : lesson.progress ? ` (${Math.round(lesson.progress * 100)}% read)` : ""}`).join("\n"), summary: `${lessons.length} lesson${lessons.length === 1 ? "" : "s"}` };
      },
    }),
    tool({
      name: "read_lesson",
      description: "Read a lesson from the library as text, including its quiz questions and answers. Use a key from list_lessons.",
      inputSchema: { type: "object", properties: { lesson_key: { type: "string" } }, required: ["lesson_key"] },
      schema: z.object({ lesson_key: z.string().min(1) }),
      activity: ({ lesson_key }) => `Reading ${quoted(ctx.lessons().find((lesson) => lesson.key === lesson_key)?.manifest.title ?? "a lesson")}`,
      run: async ({ lesson_key }) => {
        const lesson = ctx.lessons().find((entry) => entry.key === lesson_key);
        if (!lesson) return { content: `There is no lesson with key "${lesson_key}". Call list_lessons to see the keys.`, summary: "Lesson not found", isError: true };
        return { content: lessonToText(await ctx.loadLesson(lesson_key)), summary: `Read ${quoted(lesson.manifest.title)}` };
      },
    }),
    tool({
      name: "create_lesson",
      description: "Create a new interactive lesson (or practice quiz) and save it to the student's library. Blocks are shown in order; sections group blocks under a heading. The lesson is checked before saving, and any problems are returned for you to fix.",
      inputSchema: CREATE_LESSON_SCHEMA,
      schema: CreateLessonInput,
      activity: ({ title }) => `Creating ${quoted(title)}`,
      run: async (input) => {
        const built = buildLesson(input);
        if (!built.ok) return { content: `The lesson wasn't saved. Fix these problems and call create_lesson again:\n${built.problems.map((problem) => `- ${problem}`).join("\n")}`, summary: "Lesson needed fixes", isError: true };
        const record = await ctx.createLesson(built.content);
        return {
          content: `Created the lesson "${record.manifest.title}" (key ${record.key}) with ${blockCount(built.content)} blocks. The student can open it from the chat or their library.`,
          summary: `Created ${quoted(record.manifest.title)}`,
          data: { lessonKey: record.key, lessonTitle: record.manifest.title },
        };
      },
    }),
  ];
}
