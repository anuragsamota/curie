// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CurieDocumentSchema } from "../curie/types";
import { SettingsProvider } from "../lib/settings";
import BlockRenderer from "./BlockRenderer";
import { LessonVariables } from "./variables";

vi.mock("lottie-react", () => ({ default: () => null }));

beforeAll(() => {
  // jsdom has no matchMedia or ResizeObserver; the app only needs them to exist.
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const doc = CurieDocumentSchema.parse({
  documentVersion: 1,
  variables: [{ name: "double", expression: "mass * 2" }],
  blocks: [
    { id: "s", type: "slider", label: "Mass", min: 0, max: 10, initial: 3, variable: "mass" },
    { id: "t", type: "markdown", content: "Twice the mass is **{{ double }}** kg." },
    { id: "big", type: "callout", variant: "tip", content: "That's heavy!", showIf: "mass > 8" },
    { id: "q", type: "quiz", question: "Pick B", options: ["A", "B"], correctIndex: 1 },
  ],
});

function Lesson() {
  return <SettingsProvider>
    <LessonVariables document={doc}>
      {doc.blocks.map((node) => <BlockRenderer key={node.id} node={node} onError={() => undefined} />)}
    </LessonVariables>
  </SettingsProvider>;
}

describe("BlockRenderer with lesson variables", () => {
  it("fills placeholders and shows blocks as variables change", () => {
    render(<Lesson />);
    expect(screen.getByText("6", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByText("That's heavy!")).toBeNull();
    act(() => { fireEvent.change(screen.getByLabelText("Mass"), { target: { value: "9" } }); });
    expect(screen.getByText("18", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("That's heavy!")).toBeTruthy();
  });

  it("checks quiz answers", () => {
    render(<Lesson />);
    act(() => { fireEvent.click(screen.getByRole("radio", { name: /A/ })); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Check answer" })); });
    expect(screen.getByText(/Not quite/)).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole("radio", { name: /B/ })); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Check answer" })); });
    expect(screen.getByText(/Correct!/)).toBeTruthy();
  });
});
