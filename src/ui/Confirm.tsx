import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type ConfirmOptions = { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean };
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending>();
  const dialog = useRef<HTMLDialogElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), []);

  useEffect(() => {
    if (pending) dialog.current?.showModal();
  }, [pending]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    dialog.current?.close();
    setPending(undefined);
  };

  return <ConfirmContext.Provider value={confirm}>
    {children}
    <dialog ref={dialog} className="modal modal-bottom sm:modal-middle" onCancel={(event) => { event.preventDefault(); close(false); }}>
      {pending && <div className="modal-box animate-pop w-full max-w-none sm:max-w-md">
        <div className="flex gap-4">
          {pending.danger && <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-error/12 text-error"><AlertTriangle size={20} /></div>}
          <div>
            <h3 className="font-display text-lg font-bold">{pending.title}</h3>
            {pending.message && <div className="mt-1.5 text-sm leading-6 text-base-content/70">{pending.message}</div>}
          </div>
        </div>
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
          <button autoFocus className={`btn ${pending.danger ? "btn-error" : "btn-primary"}`} onClick={() => close(true)}>{pending.confirmLabel ?? "Confirm"}</button>
        </div>
      </div>}
      <form method="dialog" className="modal-backdrop"><button onClick={() => close(false)}>close</button></form>
    </dialog>
  </ConfirmContext.Provider>;
}

export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error("useConfirm must be used inside ConfirmProvider");
  return value;
}
