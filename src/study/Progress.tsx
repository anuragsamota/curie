import { useMemo } from "react";
import { BookOpenCheck, CircleCheck, Flame, ListChecks, Settings2, Sparkles, Target, TrendingUp } from "lucide-react";
import { useAssistant } from "../ai/assistant";
import { useAiConfig } from "../ai/config";
import { useLibrary } from "../lib/library";
import { summarize, useProgress } from "../lib/progress";
import { navigate, paths } from "../lib/router";

const WEEKS = 15;

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Flame; label: string; value: string; hint?: string }) {
  return <div className="rounded-xl border border-base-300 bg-base-100 p-4">
    <p className="flex items-center gap-1.5 text-xs font-medium text-base-content/55"><Icon size={14} /> {label}</p>
    <p className="font-display mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-base-content/45">{hint}</p>}
  </div>;
}

/** The last few months of study days as a compact heatmap. */
function Activity({ days }: { days: string[] }) {
  const studied = useMemo(() => new Set(days), [days]);
  const cells = useMemo(() => {
    const today = new Date();
    // Columns are weeks (Monday first); the last column is this week.
    const weekday = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - weekday - 7 * (WEEKS - 1));
    return Array.from({ length: WEEKS * 7 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return { key, future: date > today, on: studied.has(key) };
    });
  }, [studied]);
  return <div className="rounded-xl border border-base-300 bg-base-100 p-4">
    <p className="mb-3 text-xs font-medium text-base-content/55">Study days, last {WEEKS} weeks</p>
    <div className="grid grid-flow-col grid-rows-7 gap-1" role="img" aria-label={`${days.length} study days`}>
      {cells.map((cell) => <span key={cell.key} title={cell.key} className={`aspect-square rounded-[3px] ${cell.future ? "bg-transparent" : cell.on ? "bg-primary" : "bg-base-300/70"}`} />)}
    </div>
  </div>;
}

export default function Progress() {
  const { data } = useProgress();
  const { lessons } = useLibrary();
  const { provider } = useAiConfig();
  const { ask } = useAssistant();
  const summary = useMemo(() => summarize(data, lessons), [data, lessons]);
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const started = summary.lessons.filter((lesson) => lesson.progress > 0 || lesson.answered > 0);

  return <div className="flex flex-col gap-5 pb-6">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat icon={BookOpenCheck} label="Lessons completed" value={`${summary.completed}`} hint={`${summary.inProgress} in progress`} />
      <Stat icon={CircleCheck} label="First-try accuracy" value={summary.accuracy === undefined ? "–" : percent(summary.accuracy)} hint={summary.answered ? `${summary.firstTryCorrect} of ${summary.answered} questions` : "Answer a quiz to start"} />
      <Stat icon={Flame} label="Study streak" value={`${summary.streak} ${summary.streak === 1 ? "day" : "days"}`} hint={`${summary.studyDays} study ${summary.studyDays === 1 ? "day" : "days"} in total`} />
      <Stat icon={ListChecks} label="To review" value={`${summary.review.filter((quiz) => !quiz.solved).length}`} hint="Missed and not yet solved" />
    </div>

    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Activity days={data.days} />
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-base-300 bg-gradient-to-br from-secondary/70 to-base-100 p-4">
        <div>
          <p className="flex items-center gap-1.5 font-display font-semibold"><Sparkles size={16} className="text-primary" /> Personal guidance</p>
          <p className="mt-1 text-sm leading-6 text-base-content/65">The assistant looks at your lessons, quiz results and notes, then tells you what's going well, what to review, and what to do next.</p>
        </div>
        {provider ? <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm btn-primary press" onClick={() => ask("Look at my progress and give me guidance: what's going well, which ideas I should review (be specific), and a short plan for my next study session.")}><TrendingUp size={15} /> Get study guidance</button>
          <button className="btn btn-sm btn-ghost border-base-300 press" disabled={!summary.review.length} onClick={() => ask("Create a practice quiz that targets the questions I missed and the ideas behind them. Explain each answer.")}><Target size={15} /> Practise my weak spots</button>
        </div> : <button className="btn btn-sm btn-ghost w-fit border-base-300" onClick={() => navigate(paths.settingsSection("ai"))}><Settings2 size={15} /> Set up the assistant</button>}
      </div>
    </div>

    {summary.review.length > 0 && <section>
      <h3 className="font-display mb-2 font-semibold">Questions to review</h3>
      <div className="flex flex-col gap-2">
        {summary.review.slice(0, 8).map((quiz) => <button key={`${quiz.lessonKey}-${quiz.blockId}`} onClick={() => navigate(paths.lesson(quiz.lessonKey))}
          className="rounded-xl border border-base-300 bg-base-100 p-3.5 text-left transition-colors hover:border-base-content/20">
          <p className="text-sm font-medium">{quiz.question}</p>
          <p className="mt-1 text-xs leading-5 text-base-content/55">
            {quiz.lastWrong && <>You answered <span className="text-error">{quiz.lastWrong}</span> · </>}Answer: <span className="text-success">{quiz.answer}</span> · {quiz.lessonTitle}{quiz.solved ? " · solved later" : ""}
          </p>
        </button>)}
      </div>
    </section>}

    <section>
      <h3 className="font-display mb-2 font-semibold">Lessons</h3>
      {started.length === 0 ? <p className="rounded-xl bg-base-200/60 px-4 py-6 text-center text-sm text-base-content/55">Open a lesson from your library to start tracking progress.</p>
        : <div className="flex flex-col divide-y divide-base-300 rounded-xl border border-base-300 bg-base-100">
          {started.map((lesson) => <button key={lesson.key} onClick={() => navigate(paths.lesson(lesson.key))} className="flex items-center gap-4 px-4 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-base-200/50">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{lesson.title}</span>
            {lesson.answered > 0 && <span className="hidden text-xs tabular-nums text-base-content/55 sm:inline">{lesson.firstTryCorrect}/{lesson.answered} first try</span>}
            <span className="flex w-28 items-center gap-2 text-xs tabular-nums text-base-content/55">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-300"><span className={`block h-full rounded-full ${lesson.completed ? "bg-success" : "bg-primary"}`} style={{ width: percent(lesson.completed ? 1 : lesson.progress) }} /></span>
              {lesson.completed ? "Done" : percent(lesson.progress)}
            </span>
          </button>)}
        </div>}
    </section>
  </div>;
}
