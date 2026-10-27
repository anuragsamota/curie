import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Scope, Value } from "../curie/expr";
import { computeScope, initialValues } from "../curie/logic";
import type { CurieDocument } from "../curie/types";

type Variables = {
  /** Every variable's current value, formulas included. */
  scope: Scope;
  /** Changes variables learners and buttons can set; formulas are recomputed. */
  set: (changes: Scope) => void;
  reset: () => void;
};

const VariablesContext = createContext<Variables>({ scope: {}, set: () => undefined, reset: () => undefined });

/** Holds a lesson's variables while it's open. Values start fresh each time a lesson is opened. */
export function LessonVariables({ document, children }: { document: CurieDocument; children: ReactNode }) {
  const initial = useMemo(() => initialValues(document), [document]);
  // Restart from the starting values when the author changes them in the editor.
  const initialKey = JSON.stringify(initial);
  const [state, setState] = useState({ key: initialKey, values: initial });
  const values = state.key === initialKey ? state.values : initial;
  if (state.key !== initialKey) setState({ key: initialKey, values: initial });

  const scope = useMemo(() => computeScope(document, values), [document, values]);
  const set = useCallback((changes: Scope) => setState((current) => {
    const next: Record<string, Value> = { ...current.values };
    // Only changeable variables can be set; formulas always follow their inputs.
    for (const [name, value] of Object.entries(changes)) if (name in next) next[name] = value;
    return { ...current, values: next };
  }), []);
  const reset = useCallback(() => setState({ key: initialKey, values: initial }), [initialKey, initial]);

  const value = useMemo(() => ({ scope, set, reset }), [scope, set, reset]);
  return <VariablesContext.Provider value={value}>{children}</VariablesContext.Provider>;
}

export function useVariables() {
  return useContext(VariablesContext);
}
