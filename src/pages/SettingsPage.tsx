import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, Database, Keyboard, Monitor, Moon, Palette, RotateCcw, Sparkles, Sun, Trash2, Volume2 } from "lucide-react";
import { useLibrary } from "../lib/library";
import { formatBytes } from "../lib/lesson";
import { useSettings, type Settings } from "../lib/settings";
import { playSound, useSound } from "../lib/sound";
import { useConfirm } from "../ui/Confirm";
import { LogoMark } from "../ui/Logo";
import { useToast } from "../ui/Toasts";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "motion", label: "Motion & sound", icon: Sparkles },
  { id: "data", label: "Library & data", icon: Database },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
] as const;

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-24 rounded-3xl border border-base-300 bg-base-100 p-5 sm:p-7">
    <h2 className="font-display text-xl font-bold">{title}</h2>
    <p className="mt-1 text-sm text-base-content/60">{description}</p>
    <div className="mt-6 divide-y divide-base-300/70">{children}</div>
  </section>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="max-w-sm"><p className="font-medium">{label}</p>{hint && <p className="mt-0.5 text-sm text-base-content/55">{hint}</p>}</div>
    <div className="shrink-0">{children}</div>
  </div>;
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon?: typeof Sun }[]; onChange: (value: T) => void; label: string }) {
  return <div role="radiogroup" aria-label={label} className="inline-flex rounded-2xl bg-base-200 p-1">
    {options.map((option) => <button key={option.value} role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
      className={`press flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all ${value === option.value ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/60 hover:text-base-content"}`}>
      {option.icon && <option.icon size={15} />}{option.label}
    </button>)}
  </div>;
}

function ThemePreview({ mode }: { mode: "light" | "dark" }) {
  return <div data-theme={`curie-${mode}`} className="flex h-20 w-full gap-1.5 overflow-hidden rounded-xl border border-base-300 bg-base-100 p-2">
    <div className="w-5 rounded-md bg-base-200" />
    <div className="flex flex-1 flex-col gap-1.5">
      <div className="h-2 w-3/4 rounded bg-base-content/70" />
      <div className="h-1.5 w-full rounded bg-base-content/20" />
      <div className="h-1.5 w-5/6 rounded bg-base-content/20" />
      <div className="mt-auto flex gap-1"><div className="h-3 w-8 rounded bg-primary" /><div className="h-3 w-5 rounded bg-secondary" /></div>
    </div>
  </div>;
}

export default function SettingsPage() {
  const { settings, update, reset, mode } = useSettings();
  const { lessons, clear, native, location } = useLibrary();
  const confirm = useConfirm();
  const toast = useToast();
  const play = useSound();
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>();
  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => { update({ [key]: value } as Partial<Settings>); play("toggle"); };

  useEffect(() => {
    void navigator.storage?.estimate?.().then(setStorage).catch(() => undefined);
  }, [lessons]);

  const assetBytes = lessons.reduce((sum, lesson) => sum + lesson.size, 0);

  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 lg:py-10">
    <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Settings</h1>
    <p className="mt-1 text-sm text-base-content/55">Preferences are saved on this device.</p>

    <div className="mt-8 grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="sticky top-6 hidden h-fit flex-col gap-1 lg:flex" aria-label="Settings sections">
        {SECTIONS.map((section) => <a key={section.id} href={`#/settings`} onClick={(event) => { event.preventDefault(); document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" }); }}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-base-content/65 transition-colors hover:bg-base-200 hover:text-base-content">
          <section.icon size={16} /> {section.label}
        </a>)}
      </nav>

      <div className="flex flex-col gap-6">
        <Section id="appearance" title="Appearance" description="Lessons always follow the app's theme. Lesson files can't override it.">
          <div className="pb-5">
            <p className="mb-3 font-medium">Theme</p>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
              {([{ value: "system", label: "System", icon: Monitor }, { value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }] as const).map((option) => {
                const selected = settings.theme === option.value;
                return <button key={option.value} role="radio" aria-checked={selected} onClick={() => set("theme")(option.value)}
                  className={`press group relative flex flex-col gap-2 rounded-2xl border-2 p-2 text-left transition-colors ${selected ? "border-primary" : "border-base-300 hover:border-base-content/25"}`}>
                  {option.value === "system"
                    ? <div className="grid grid-cols-2 gap-1"><ThemePreview mode="light" /><ThemePreview mode="dark" /></div>
                    : <ThemePreview mode={option.value} />}
                  <span className="flex items-center gap-1.5 px-1 pb-0.5 text-sm font-medium"><option.icon size={14} /> {option.label}</span>
                  {selected && <span className="animate-pop absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-primary text-primary-content"><Check size={12} strokeWidth={3} /></span>}
                </button>;
              })}
            </div>
            {settings.theme === "system" && <p className="mt-2 text-xs text-base-content/50">Currently {mode}, following your system.</p>}
          </div>
          <Row label="Lesson text size" hint="Changes body text in lessons and the editor preview.">
            <Segmented label="Lesson text size" value={settings.textSize} onChange={set("textSize")} options={[{ value: "sm", label: "Small" }, { value: "md", label: "Default" }, { value: "lg", label: "Large" }]} />
          </Row>
          <Row label="Show outline in lessons" hint="On wide screens, show the “On this page” panel next to lessons.">
            <input type="checkbox" className="toggle toggle-primary" checked={settings.outlineOpen} onChange={(event) => set("outlineOpen")(event.target.checked)} />
          </Row>
          <Row label="Collapse sidebar" hint="Show only icons in the main navigation (Ctrl+B).">
            <input type="checkbox" className="toggle toggle-primary" checked={settings.sidebarCollapsed} onChange={(event) => set("sidebarCollapsed")(event.target.checked)} />
          </Row>
        </Section>

        <Section id="motion" title="Motion & sound" description="Make Curie feel lively, or keep it calm.">
          <Row label="Animations" hint="“System” follows your device's reduce-motion setting.">
            <Segmented label="Animations" value={settings.motion} onChange={set("motion")} options={[{ value: "system", label: "System" }, { value: "full", label: "On" }, { value: "reduced", label: "Reduced" }]} />
          </Row>
          <Row label="Sound effects" hint="Short sounds for answers, flips, and notifications.">
            <input type="checkbox" className="toggle toggle-primary" checked={settings.sound} onChange={(event) => { update({ sound: event.target.checked }); if (event.target.checked) playSound("toggle", settings.volume); }} />
          </Row>
          <Row label="Volume">
            <div className="flex items-center gap-3">
              <Volume2 size={16} className="opacity-50" />
              <input type="range" className="range range-primary range-xs w-40" min={0} max={1} step={0.05} value={settings.volume} disabled={!settings.sound} aria-label="Sound volume"
                onChange={(event) => update({ volume: Number(event.target.value) })} onPointerUp={() => play("pop")} onKeyUp={() => play("pop")} />
              <span className="w-9 text-right text-sm tabular-nums text-base-content/60">{Math.round(settings.volume * 100)}%</span>
            </div>
          </Row>
          <Row label="Preview sounds">
            <div className="flex flex-wrap gap-1.5">
              {(["success", "error", "flip", "complete"] as const).map((name) => <button key={name} className="btn btn-sm btn-ghost border-base-300 capitalize" disabled={!settings.sound} onClick={() => play(name)}>{name}</button>)}
            </div>
          </Row>
        </Section>

        <Section id="data" title="Library & data" description={native
          ? "Curie keeps its library index, settings, and the lessons you create in its own folder. Imported lessons stay where they are and are opened from their files."
          : "Lessons are stored in this browser's local database and never leave your device unless you export them."}>
          {native && <Row label="Curie folder" hint="library.json, settings.json, and lessons/ live here.">
            <div className="flex max-w-xs items-center gap-2">
              <code className="truncate rounded-lg bg-base-200 px-2 py-1 text-xs" title={location}>{location}</code>
              <button className="btn btn-ghost btn-xs btn-square" aria-label="Copy folder path" title="Copy path" onClick={() => void navigator.clipboard.writeText(location).then(() => toast.success("Folder path copied."))}><Copy size={14} /></button>
            </div>
          </Row>}
          <Row label="Lessons" hint={`${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"} · ${formatBytes(assetBytes)} of media`}>
            {storage?.quota ? <div className="w-48 text-right">
              <progress className="progress progress-primary w-full" value={storage.usage} max={storage.quota} />
              <p className="mt-1 text-xs text-base-content/50">{formatBytes(storage.usage ?? 0)} of {formatBytes(storage.quota)} available storage used</p>
            </div> : null}
          </Row>
          <Row label="Ask before deleting" hint="Show a confirmation before a lesson is deleted. You can always undo from the notification.">
            <input type="checkbox" className="toggle toggle-primary" checked={settings.confirmDeletes} onChange={(event) => set("confirmDeletes")(event.target.checked)} />
          </Row>
          <Row label="Reset preferences" hint="Restore every setting on this page to its default.">
            <button className="btn btn-sm btn-ghost border-base-300" onClick={async () => {
              if (await confirm({ title: "Reset all preferences?", confirmLabel: "Reset" })) { reset(); toast.success("Preferences were reset."); }
            }}><RotateCcw size={15} /> Reset</button>
          </Row>
          <Row label="Delete all lessons" hint={native ? "Remove every lesson from the library and delete the ones Curie created. Imported files are kept." : "Permanently remove every lesson and asset from this device."}>
            <button className="btn btn-sm btn-error btn-outline" disabled={lessons.length === 0} onClick={async () => {
              if (!(await confirm({ title: `Delete all ${lessons.length} lessons?`, message: "This can't be undone. Export any lessons you want to keep first.", confirmLabel: "Delete everything", danger: true }))) return;
              await clear();
              play("delete");
              toast.info("All lessons were deleted.");
            }}><Trash2 size={15} /> Delete all</button>
          </Row>
        </Section>

        <Section id="shortcuts" title="Keyboard shortcuts" description="Ctrl on Windows and Linux, ⌘ on macOS.">
          {[
            ["Search the library", ["/"]], ["New lesson", ["Alt", "N"]], ["Import a .curie file", ["Ctrl", "O"]],
            ["Toggle sidebar", ["Ctrl", "B"]], ["Open settings", ["Ctrl", ","]],
            ["Editor: save now", ["Ctrl", "S"]], ["Editor: undo / redo", ["Ctrl", "Z"], ["Ctrl", "Shift", "Z"]],
            ["Editor: toggle preview", ["Ctrl", "P"]], ["Editor: delete selected block", ["Del"]],
          ].map(([label, ...combos]) => <Row key={label as string} label={label as string}>
            <span className="flex items-center gap-2">{(combos as string[][]).map((keys, i) => <span key={i} className="flex gap-1">{keys.map((key) => <kbd key={key} className="kbd kbd-sm">{key}</kbd>)}</span>)}</span>
          </Row>)}
        </Section>

        <div className="flex items-center gap-4 rounded-3xl bg-base-200/60 p-5">
          <LogoMark size={44} />
          <div className="text-sm">
            <p className="font-display text-base font-bold">Curie <span className="font-sans text-sm font-normal text-base-content/50">0.2.0</span></p>
            <p className="text-base-content/60">Portable interactive lessons · package format 0.1.0</p>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
