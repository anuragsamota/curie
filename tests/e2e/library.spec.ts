import { expect, test } from "@playwright/test";

test("starts empty and creates a lesson in the editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "No lessons yet" })).toBeVisible();
  await page.getByRole("button", { name: "New lesson" }).first().click();
  await page.getByPlaceholder(/Title, e\.g\./).fill("Photosynthesis");
  await page.getByRole("button", { name: "Create and edit" }).click();
  await expect(page).toHaveURL(/#\/edit\//);
  await expect(page.getByRole("heading", { name: "Photosynthesis", level: 1 })).toBeVisible();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Photosynthesis" })).toBeVisible();
});

test("the phone editor keeps its tools under the thumb", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only");
  await page.goto("/");
  await page.getByRole("button", { name: "New lesson" }).first().click();
  await page.getByPlaceholder(/Title, e\.g\./).fill("Forces");
  await page.getByRole("button", { name: "Create and edit" }).click();

  const tools = page.getByRole("navigation", { name: "Editor tools" });
  await expect(tools).toBeVisible();
  await tools.getByRole("button", { name: "Add block" }).click();
  const sheet = page.getByRole("dialog", { name: "Add a block" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("menuitem", { name: /Quiz/ }).click();
  await expect(sheet).toBeHidden();

  // The new block is selected; its actions sit inside it and its settings open in a sheet.
  await expect(page.getByRole("button", { name: "Move up" })).toBeVisible();
  await tools.getByRole("button", { name: "Block", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Quiz" })).toBeVisible();
  await expect(page.getByText("Answers")).toBeVisible();
});
