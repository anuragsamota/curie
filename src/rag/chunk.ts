// Splits note text into overlapping passages for retrieval. Passages follow paragraph and sentence
// boundaries and remember which PDF page they came from.

export type Passage = { text: string; page?: number };
export type PageText = { text: string; page?: number };

const TARGET = 1100;
const OVERLAP = 180;

function sentences(paragraph: string): string[] {
  return paragraph.match(/[^.!?。！？]+(?:[.!?。！？]+["')\]]*|$)\s*/g)?.map((part) => part.trim()).filter(Boolean) ?? [paragraph];
}

/** Breaks text into pieces no longer than `TARGET`, splitting long paragraphs by sentence (and very long sentences by length). */
function pieces(text: string): string[] {
  return text.split(/\n\s*\n/).map((paragraph) => paragraph.replace(/[ \t]+/g, " ").trim()).filter(Boolean).flatMap((paragraph) => {
    if (paragraph.length <= TARGET) return [paragraph];
    return sentences(paragraph).flatMap((sentence) => sentence.length <= TARGET ? [sentence] : sentence.match(new RegExp(`[\\s\\S]{1,${TARGET}}`, "g")) ?? []);
  });
}

/** The tail of a passage, cut at a word boundary, carried into the next passage for context. */
function tail(text: string): string {
  if (text.length <= OVERLAP) return text;
  const cut = text.slice(-OVERLAP);
  const space = cut.indexOf(" ");
  return space === -1 ? cut : cut.slice(space + 1);
}

export function chunkPages(pages: PageText[]): Passage[] {
  const passages: Passage[] = [];
  let current = "";
  let page: number | undefined;
  const flush = () => {
    if (current.trim()) passages.push({ text: current.trim(), page });
    current = "";
  };
  for (const { text, page: pageNumber } of pages) {
    for (const piece of pieces(text)) {
      if (current && current.length + piece.length + 2 > TARGET) {
        const carry = tail(current);
        flush();
        // The carried-over tail is context; the new passage belongs to the page of the text it adds.
        current = carry;
        page = pageNumber;
      }
      if (!current.trim()) page = pageNumber;
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  flush();
  return passages;
}
