import { describe, expect, it } from "vitest";
import { parseSource } from "./sources";

describe("parseSource", () => {
  it.each([
    ["owner/repo", { owner: "owner", repo: "repo", id: "github:owner/repo" }],
    ["https://github.com/Owner/Repo.git", { owner: "Owner", repo: "Repo", id: "github:owner/repo" }],
    ["github.com/a/b/", { owner: "a", repo: "b" }],
    ["https://github.com/a/b/tree/main/lessons/physics", { ref: "main", path: "lessons/physics", id: "github:a/b@main/lessons/physics" }],
  ])("parses %s", (input, expected) => {
    expect(parseSource(input)).toMatchObject(expected);
  });

  it.each(["", "just-a-name", "https://github.com/a/b/blob/main/x.curie", "a b/c"])("rejects %j", (input) => {
    expect(parseSource(input)).toBeUndefined();
  });
});
