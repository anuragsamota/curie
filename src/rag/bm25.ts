// BM25 ranking over note passages. Runs on the device, so searching notes needs no network or model.

const STOPWORDS = new Set(("a an and are as at be but by for from has have he her his i if in into is it its me my no not of on or our she so " +
  "than that the their them then there these they this to too us was we were what when where which who why will with you your " +
  "can could do does did done how about also just may might must should would been being am any all each more most other some such only own same very").split(" "));

/** Light English stemming: enough to match plurals and common verb forms without over-merging words. */
function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("es") && word.length > 4 && /(ch|sh|x|s|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.filter((word) => !STOPWORDS.has(word) && (word.length > 1 || /\d/.test(word))).map(stem);
}

export type Hit = { id: string; score: number };

export class Bm25Index {
  private docs = new Map<string, { length: number; terms: Map<string, number> }>();
  private frequency = new Map<string, number>();
  private totalLength = 0;

  constructor(private k1 = 1.2, private b = 0.75) {}

  get size() { return this.docs.size; }

  add(id: string, text: string) {
    this.remove(id);
    const tokens = tokenize(text);
    const terms = new Map<string, number>();
    for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1);
    for (const term of terms.keys()) this.frequency.set(term, (this.frequency.get(term) ?? 0) + 1);
    this.docs.set(id, { length: tokens.length, terms });
    this.totalLength += tokens.length;
  }

  remove(id: string) {
    const doc = this.docs.get(id);
    if (!doc) return;
    for (const term of doc.terms.keys()) {
      const count = (this.frequency.get(term) ?? 1) - 1;
      if (count > 0) this.frequency.set(term, count);
      else this.frequency.delete(term);
    }
    this.totalLength -= doc.length;
    this.docs.delete(id);
  }

  search(query: string, limit = 5, accept?: (id: string) => boolean): Hit[] {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length || !this.docs.size) return [];
    const average = this.totalLength / this.docs.size || 1;
    const hits: Hit[] = [];
    for (const [id, doc] of this.docs) {
      if (accept && !accept(id)) continue;
      let score = 0;
      for (const term of terms) {
        const count = doc.terms.get(term);
        if (!count) continue;
        const df = this.frequency.get(term) ?? 0;
        const idf = Math.log(1 + (this.docs.size - df + 0.5) / (df + 0.5));
        score += idf * (count * (this.k1 + 1)) / (count + this.k1 * (1 - this.b + this.b * doc.length / average));
      }
      if (score > 0) hits.push({ id, score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
