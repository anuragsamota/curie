import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X, XCircle } from "lucide-react";
import { useSound } from "../lib/sound";

type ToastKind = "success" | "error" | "info" | "warning";
type ToastOptions = { title?: string; duration?: number; action?: { label: string; onClick: () => void } };
type Toast = ToastOptions & { id: number; kind: ToastKind | "task"; message: string; leaving?: boolean; count: number; progress?: number };

/** A long-running job shown as a toast with a progress bar until `done` is called. */
export type TaskHandle = { update: (progress: number, message?: string) => void; done: () => void };

type ToastApi = Record<ToastKind, (message: string, options?: ToastOptions) => void> & {
  task: (title: string, message: string) => TaskHandle;
};

const ToastContext = createContext<ToastApi | null>(null);
const MAX_VISIBLE = 4;
const DEFAULT_DURATION: Record<ToastKind, number> = { success: 3500, info: 3500, warning: 5000, error: 6000 };

const STYLES: Record<Toast["kind"], { icon: typeof Info; tone: string; bar: string }> = {
  task: { icon: LoaderCircle, tone: "text-primary animate-spin", bar: "bg-primary" },
  success: { icon: CheckCircle2, tone: "text-success", bar: "bg-success" },
  info: { icon: Info, tone: "text-primary", bar: "bg-primary" },
  warning: { icon: AlertTriangle, tone: "text-warning", bar: "bg-warning" },
  error: { icon: XCircle, tone: "text-error", bar: "bg-error" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const play = useSound();
  // Read through a ref so the toast API stays stable when sound settings change.
  const playRef = useRef(play);
  playRef.current = play;

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((toast) => toast.id === id ? { ...toast, leaving: true } : toast));
    setTimeout(() => setToasts((all) => all.filter((toast) => toast.id !== id)), 250);
  }, []);

  const push = useCallback((kind: ToastKind, message: string, options: ToastOptions = {}) => {
    playRef.current(kind === "error" ? "error" : "pop");
    setToasts((all) => {
      // Repeated messages bump a counter instead of stacking duplicates.
      const existing = all.find((toast) => !toast.leaving && toast.kind === kind && toast.message === message);
      if (existing) return all.map((toast) => toast === existing ? { ...toast, id: nextId.current++, count: toast.count + 1 } : toast);
      return [...all, { ...options, id: nextId.current++, kind, message, count: 1 }].slice(-MAX_VISIBLE);
    });
  }, []);

  const task = useCallback((title: string, message: string): TaskHandle => {
    const id = nextId.current++;
    setToasts((all) => [...all, { id, kind: "task" as const, title, message, count: 1, progress: 0 }].slice(-MAX_VISIBLE));
    return {
      update: (progress, next) => setToasts((all) => all.map((toast) => toast.id === id ? { ...toast, progress, message: next ?? toast.message } : toast)),
      done: () => dismiss(id),
    };
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    task,
    success: (message, options) => push("success", message, options),
    error: (message, options) => push("error", message, options),
    info: (message, options) => push("info", message, options),
    warning: (message, options) => push("warning", message, options),
  }), [push, task]);

  return <ToastContext.Provider value={api}>
    {children}
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-20 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-96 lg:bottom-6 lg:right-6">
      {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>;
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const isTask = toast.kind === "task";
  const duration = toast.duration ?? (isTask ? 0 : DEFAULT_DURATION[toast.kind as ToastKind]);
  const remaining = useRef(duration);
  const startedAt = useRef(Date.now());
  const { icon: Icon, tone, bar } = STYLES[toast.kind];

  useEffect(() => {
    if (paused || toast.leaving || isTask) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, toast.id, toast.leaving, isTask, onDismiss]);

  return <div
    role={toast.kind === "error" ? "alert" : "status"}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border border-base-300 bg-base-100/95 shadow-[0_18px_50px_-20px_rgb(0_0_0/0.45)] backdrop-blur ${toast.leaving ? "toast-leave" : "toast-enter"} ${paused ? "toast-paused" : ""}`}
  >
    <div className="flex items-start gap-3 p-3.5 pr-2">
      <Icon size={20} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {toast.title && <p className="font-semibold">{toast.title}</p>}
        <p className={`break-words ${toast.title ? "text-base-content/70" : ""}`}>
          {toast.message}{toast.count > 1 && <span className="badge badge-ghost badge-sm ml-2 align-middle">×{toast.count}</span>}
        </p>
        {toast.action && <button className="btn btn-xs btn-ghost -ml-2 mt-1 text-primary" onClick={() => { toast.action!.onClick(); onDismiss(toast.id); }}>{toast.action.label}</button>}
      </div>
      {isTask
        ? <span className="self-center pr-2 text-xs tabular-nums text-base-content/55">{Math.round((toast.progress ?? 0) * 100)}%</span>
        : <button className="btn btn-ghost btn-xs btn-square" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}><X size={14} /></button>}
    </div>
    {isTask ? <div className="absolute inset-x-0 bottom-0 h-1 bg-base-300/60">
      <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round((toast.progress ?? 0) * 100)}%` }} />
    </div> : <div className={`toast-timer absolute inset-x-0 bottom-0 h-0.5 opacity-60 ${bar}`} style={{ animationDuration: `${duration}ms` }} />}
  </div>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
