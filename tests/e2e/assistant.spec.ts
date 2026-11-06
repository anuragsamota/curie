import { expect, test } from "@playwright/test";
import { callTool, configureAi, mockOllama, say } from "./helpers";

const OLLAMA = { provider: "ollama", ollamaHost: "http://ollama.test:11434", ollamaModel: "qwen-test:latest" };

const lessonInput = {
  title: "Osmosis basics",
  description: "How water crosses membranes.",
  blocks: [
    { type: "markdown", content: "## Osmosis\n\nWater moves towards higher solute concentration." },
    { type: "quiz", question: "Water moves towards…", options: ["less solute", "more solute"], correctIndex: 1, explanation: "It dilutes the solute." },
    { type: "flashcard", front: "Osmosis", back: "Diffusion of water across a membrane" },
  ],
};

test("answers from the student's notes and creates a lesson with a local model", async ({ page }) => {
  await configureAi(page, OLLAMA);
  const requests = await mockOllama(page, (request) => {
    const last = request.messages.at(-1)!;
    const asked = request.messages.filter((message) => message.role === "user").at(-1)!.content;
    if (last.role === "tool") return say(last.tool_name === "create_lesson" ? "I made you a short lesson on osmosis." : "Osmosis is the movement of water across a semi-permeable membrane [1].");
    return /lesson/i.test(asked) ? callTool("create_lesson", lessonInput) : callTool("search_notes", { query: "osmosis" });
  });

  // Add a note by pasting text.
  await page.goto("/#/study/notes");
  await page.getByRole("button", { name: "Paste text" }).click();
  await page.getByLabel("Note name").fill("Biology chapter 3");
  await page.getByLabel("Note text").fill("Osmosis is the diffusion of water molecules across a semi-permeable membrane, from low to high solute concentration.");
  await page.getByRole("button", { name: "Add notes" }).click();
  await expect(page.getByText("Biology chapter 3")).toBeVisible();

  // Local search works without any model.
  await page.getByLabel("Search your notes").fill("membrane");
  await expect(page.getByText(/semi-permeable membrane/)).toBeVisible();

  // Ask a question: the model searches the notes, then answers.
  await page.goto("/#/study");
  await page.getByLabel("Message the study assistant").fill("What is osmosis?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Found 1 passage in 1 note")).toBeVisible();
  await expect(page.getByText(/movement of water across a semi-permeable membrane/)).toBeVisible();

  const first = requests[0];
  expect(first.options?.num_ctx).toBe(16384);
  expect(first.tools?.map((tool) => tool.function.name)).toEqual(expect.arrayContaining(["search_notes", "create_lesson", "get_progress"]));
  expect(first.messages.at(-1)!.content).toContain("<note_excerpts>");
  expect(requests[1].messages.at(-1)).toMatchObject({ role: "tool", tool_name: "search_notes" });

  // Ask for a lesson: it is validated, saved, and can be opened from the chat.
  await page.getByLabel("Message the study assistant").fill("Make me a lesson on this");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Created “Osmosis basics”")).toBeVisible();
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: "Osmosis basics", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Water moves towards…" })).toBeVisible();

  // The chat is kept when coming back.
  await page.goto("/#/study");
  await expect(page.getByText("I made you a short lesson on osmosis.")).toBeVisible();
});

test("streams Claude's answer with its reasoning summary", async ({ page }) => {
  await configureAi(page, { provider: "anthropic", claudeModel: "claude-opus-5-5" }, { anthropic: "sk-ant-test" });
  let body: Record<string, unknown> = {};
  let headers: Record<string, string> = {};
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    body = route.request().postDataJSON();
    headers = route.request().headers();
    const events = [
      { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "The student wants a definition." } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "A **vector** has size and direction." } },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 12 } },
      { type: "message_stop" },
    ];
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("") });
  });

  await page.goto("/#/study");
  await page.getByLabel("Message the study assistant").fill("What is a vector?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("strong", { hasText: "vector" })).toBeVisible();
  await page.getByRole("button", { name: /Thought process/ }).click();
  await expect(page.getByText("The student wants a definition.")).toBeVisible();

  expect(body).toMatchObject({ model: "claude-opus-5-5", stream: true, fallbacks: "default", thinking: { type: "adaptive", display: "summarized" } });
  expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  expect(headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
});

test("explains what to set up when no model is configured", async ({ page }) => {
  await page.goto("/#/study");
  await expect(page.getByText("Connect an AI model")).toBeVisible();
  await page.getByRole("button", { name: "Set up the assistant" }).click();
  await expect(page).toHaveURL(/#\/settings\/ai/);
  await expect(page.getByRole("radio", { name: /Ollama/ })).toBeVisible();
});

test("finds Ollama's models and tests the connection from Settings", async ({ page }) => {
  await configureAi(page, { provider: "ollama", ollamaHost: "http://ollama.test:11434", ollamaModel: "" });
  await mockOllama(page, () => [{ message: { role: "assistant", content: "ready" }, done: true }]);
  await page.goto("/#/settings/ai");
  await page.getByRole("button", { name: /Load models/ }).click();
  await expect(page.getByRole("combobox", { name: "Model" })).toHaveValue("llama-test:8b");
  await expect(page.getByText("Ready:")).toBeVisible();
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("Connection works")).toBeVisible();
});
