import { describe, expect, it } from "vitest";
import { Bm25Index, tokenize } from "./bm25";
import { chunkPages } from "./chunk";

describe("tokenize", () => {
  it("lowercases, drops stopwords and accents, and stems plurals and verb forms", () => {
    expect(tokenize("The Cells are dividing; café mitochondria!")).toEqual(["cell", "divid", "cafe", "mitochondria"]);
    expect(tokenize("studies of studied processes")).toEqual(["study", "studi", "process"]);
  });
  it("keeps numbers", () => expect(tokenize("Newton's 3 laws")).toContain("3"));
});

describe("chunkPages", () => {
  it("keeps short notes in one passage", () => {
    expect(chunkPages([{ text: "One.\n\nTwo." }])).toEqual([{ text: "One.\n\nTwo.", page: undefined }]);
  });

  it("splits long text into overlapping passages with page numbers", () => {
    const paragraph = (n: number) => `Paragraph ${n} ` + "word ".repeat(80);
    const pages = [{ text: [1, 2, 3, 4].map(paragraph).join("\n\n"), page: 1 }, { text: [5, 6, 7].map(paragraph).join("\n\n"), page: 2 }];
    const passages = chunkPages(pages);
    expect(passages.length).toBeGreaterThan(2);
    for (const passage of passages) expect(passage.text.length).toBeLessThanOrEqual(1100 + 200);
    expect(passages[0].page).toBe(1);
    expect(passages.at(-1)!.page).toBe(2);
    // Consecutive passages share some text, so ideas cut at a boundary stay findable.
    expect(passages[1].text.slice(0, 40)).not.toBe("");
    expect(passages[0].text.includes(passages[1].text.split("\n\n")[0].slice(0, 30))).toBe(true);
  });

  it("splits a single huge paragraph by sentences", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} explains something.`).join(" ");
    const passages = chunkPages([{ text }]);
    expect(passages.length).toBeGreaterThan(1);
    expect(passages.every((passage) => passage.text.length <= 1300)).toBe(true);
  });
});

describe("Bm25Index", () => {
  const index = new Bm25Index();
  index.add("a", "Osmosis is the movement of water across a semi-permeable membrane.");
  index.add("b", "Photosynthesis converts light energy into chemical energy in chloroplasts.");
  index.add("c", "Diffusion moves particles from high to low concentration. Osmosis is a special case of diffusion.");

  it("ranks passages by relevance", () => {
    const hits = index.search("what is osmosis and how does water move", 3);
    expect(hits.map((hit) => hit.id)).toEqual(["a", "c"]);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("filters, updates and removes documents", () => {
    expect(index.search("osmosis", 5, (id) => id !== "a").map((hit) => hit.id)).toEqual(["c"]);
    index.add("b", "Osmosis in plant roots.");
    expect(index.search("plant roots").map((hit) => hit.id)).toEqual(["b"]);
    index.remove("b");
    expect(index.search("plant roots")).toEqual([]);
    expect(index.size).toBe(2);
  });

  it("returns nothing for stopword-only queries", () => expect(index.search("the and of")).toEqual([]));
});
