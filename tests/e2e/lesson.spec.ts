import { expect, test } from "@playwright/test";
import { curiePackage, importLesson, setRange } from "./helpers";

const lesson = {
  documentVersion: 1,
  variables: [{ name: "weight", expression: "mass * 9.8" }],
  blocks: [
    { id: "intro", type: "markdown", content: "## Weight\n\nA mass feels heavier on Earth." },
    { id: "mass", type: "slider", label: "Mass", min: 1, max: 10, step: 1, initial: 2, unit: "kg", variable: "mass" },
    { id: "w", type: "markdown", content: "Its weight is **{{ round(weight, 1) }} N**." },
    { id: "heavy", type: "callout", variant: "warning", content: "Careful, that's heavy!", showIf: "mass >= 8" },
    { id: "q1", type: "quiz", question: "What is weight measured in?", options: ["Kilograms", "Newtons"], correctIndex: 1, explanation: "Weight is a force." },
  ],
};

test("live variables update text and show blocks, and quiz results reach Progress", async ({ page }) => {
  await page.goto("/");
  await importLesson(page, await curiePackage("Weight and mass", lesson), "weight.curie");

  await expect(page.getByText("19.6 N")).toBeVisible();
  await expect(page.getByText("Careful, that's heavy!")).toBeHidden();
  await setRange(page, "Mass", 9);
  await expect(page.getByText("88.2 N")).toBeVisible();
  await expect(page.getByText("Careful, that's heavy!")).toBeVisible();

  await page.getByRole("radio", { name: /Kilograms/ }).click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText(/Not quite/)).toBeVisible();
  await page.getByRole("radio", { name: /Newtons/ }).click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText(/Correct!/)).toBeVisible();

  await page.goto("/#/study/progress");
  await expect(page.getByRole("heading", { name: "Questions to review" })).toBeVisible();
  await expect(page.getByText("What is weight measured in?")).toBeVisible();
  await expect(page.getByText("0 of 1 questions")).toBeVisible();
});
