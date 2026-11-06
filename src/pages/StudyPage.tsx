import { lazy, Suspense } from "react";
import { MessageCircle, NotebookText, TrendingUp } from "lucide-react";
import { paths, type StudyTab } from "../lib/router";
import { useSound } from "../lib/sound";
import { LogoMark } from "../ui/Logo";

const Assistant = lazy(() => import("../study/Assistant"));
const Notes = lazy(() => import("../study/Notes"));
const Progress = lazy(() => import("../study/Progress"));

const TABS: { id: StudyTab; label: string; icon: typeof MessageCircle; href: string }[] = [
  { id: "assistant", label: "Assistant", icon: MessageCircle, href: paths.study },
  { id: "notes", label: "Notes", icon: NotebookText, href: paths.notes },
  { id: "progress", label: "Progress", icon: TrendingUp, href: paths.progress },
];

export default function StudyPage({ tab }: { tab: StudyTab }) {
  const play = useSound();
  return <div className="mx-auto max-w-4xl px-4 pt-5 sm:px-8 lg:pt-10">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">Study</h1>
      <nav aria-label="Study" className="flex rounded-xl bg-base-200 p-1">
        {TABS.map((item) => <a key={item.id} href={item.href} aria-current={tab === item.id ? "page" : undefined} onClick={() => play("tap")}
          className={`press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${tab === item.id ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/60 hover:text-base-content"}`}>
          <item.icon size={15} /> {item.label}
        </a>)}
      </nav>
    </div>
    <Suspense fallback={<div className="grid min-h-[40vh] place-items-center"><LogoMark size={36} animated /></div>}>
      {tab === "assistant" ? <Assistant /> : tab === "notes" ? <Notes /> : <Progress />}
    </Suspense>
  </div>;
}
